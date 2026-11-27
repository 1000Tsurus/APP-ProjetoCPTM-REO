import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  InspectionCreate,
  MovementCreate,
  OccurrenceCreate,
  ResolvePayload,
  SleeperCreate,
} from './api/types';

export type OutboxType = 'movement' | 'inspection' | 'occurrence' | 'register' | 'resolve';

export type OutboxItem = {
  type: OutboxType;
  /** UUID v4 gerado uma vez pela tela; é a chave de idempotência no servidor. */
  client_uuid: string;
  /** Corpo já no formato do POST da API (contém o mesmo `client_uuid`). */
  payload: MovementCreate | InspectionCreate | OccurrenceCreate | SleeperCreate | ResolvePayload;
  rfid_tag: string | null;
  /** Texto curto para a tela Fila (ex.: "Entrada · RM 123"). */
  summary: string;
  created_at: string;
  status: 'pending' | 'rejected';
  /** ISO até quando o item espera para o operador poder desfazer; o sync não o envia antes. */
  hold_until?: string;
  /** Preenchidos quando o servidor rejeita o item. */
  code?: string;
  reason?: string;
};

export type NewOutboxItem = Omit<OutboxItem, 'status' | 'created_at'>;

const keyOf = (userId: string) => `reo.outbox.${userId}`;

const listeners = new Set<() => void>();

// Uma cadeia de promessas por usuário: toda leitura-modificação-escrita da fila passa por ela,
// então um enqueue durante o sync não é perdido por uma escrita com dados antigos.
const chains = new Map<string, Promise<unknown>>();

/** Avisa quem observa a fila (contador do Início, tela Fila) depois de cada mudança. */
export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      // Um ouvinte com erro não pode travar a fila.
    }
  }
}

const preserved = new Set<string>();

/** Guarda uma cópia do valor ilegível antes de a fila ser recriada (nunca perde dado em silêncio). */
async function preserveCorrupt(userId: string, raw: string): Promise<void> {
  // Uma cópia por valor: leituras repetidas antes da próxima gravação não multiplicam cópias.
  const id = `${userId}|${raw}`;
  if (preserved.has(id)) return;
  preserved.add(id);
  try {
    await AsyncStorage.setItem(`${keyOf(userId)}.corrupt.${new Date().toISOString()}`, raw);
  } catch {
    // Sem espaço para a cópia: ainda assim a fila segue funcionando.
  }
}

/**
 * Lê a fila. Valor ilegível (JSON inválido ou não-array) é tratado como vazio, mas só depois de
 * copiado para `reo.outbox.<id>.corrupt.<ISO>`; a próxima gravação sobrescreve a chave original.
 */
async function read(userId: string): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(keyOf(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as OutboxItem[];
  } catch {
    // cai na preservação abaixo
  }
  await preserveCorrupt(userId, raw);
  return [];
}

/**
 * Altera a fila do usuário de forma serializada: relê o armazenamento, aplica `change`
 * e grava. Se `change` devolver `null`, nada é gravado nem notificado.
 */
export function mutateOutbox(
  userId: string,
  change: (items: OutboxItem[]) => OutboxItem[] | null,
): Promise<void> {
  const previous = chains.get(userId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const result = change(await read(userId));
      if (!result) return;
      await AsyncStorage.setItem(keyOf(userId), JSON.stringify(result));
      notify();
    });
  chains.set(userId, next);
  return next;
}

/**
 * Grava o item na fila; se o `client_uuid` já existe, não faz nada (toque duplo em "Salvar").
 * Com `holdMs`, o item fica em espera até `now + holdMs` para o operador poder desfazer.
 */
export function enqueue(
  userId: string,
  item: NewOutboxItem,
  opts: { holdMs?: number; now?: Date } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  return mutateOutbox(userId, (items) => {
    if (items.some((i) => i.client_uuid === item.client_uuid)) return null;
    const held = opts.holdMs ? { hold_until: new Date(now.getTime() + opts.holdMs).toISOString() } : {};
    return [...items, { ...item, ...held, status: 'pending', created_at: now.toISOString() }];
  });
}

/** Margem extra que o envio respeita depois do `hold_until`, para um desfazer tardio não perder para o sync. */
export const SYNC_GRACE_MS = 1000;

/**
 * Item ainda dentro da espera do desfazer. Prazo vencido (ex.: app reaberto) não segura mais.
 * `graceMs` estende a espera; o `undo` usa o prazo exato (0), o envio usa `SYNC_GRACE_MS`.
 */
export function isHeld(item: OutboxItem, now: Date, graceMs = 0): boolean {
  return !!item.hold_until && new Date(item.hold_until).getTime() + graceMs > now.getTime();
}

/** Desfaz um item pendente ainda em espera; devolve se removeu (rejeitado ou fora do prazo não sai). */
export async function undo(userId: string, clientUuid: string, now: Date = new Date()): Promise<boolean> {
  let removed = false;
  await mutateOutbox(userId, (items) => {
    const keep = items.filter(
      (i) => !(i.client_uuid === clientUuid && i.status === 'pending' && isHeld(i, now)),
    );
    removed = keep.length !== items.length;
    return removed ? keep : null;
  });
  return removed;
}

/** Encerra a espera dos itens indicados (o operador já não pode mais desfazê-los). */
export function releaseHolds(userId: string, clientUuids: string[]): Promise<void> {
  const ids = new Set(clientUuids);
  return mutateOutbox(userId, (items) => {
    if (!items.some((i) => ids.has(i.client_uuid) && i.hold_until)) return null;
    return items.map((i) => {
      if (!ids.has(i.client_uuid)) return i;
      const { hold_until: _hold, ...rest } = i;
      return rest;
    });
  });
}

/** Itens da fila do usuário, do mais antigo para o mais novo. */
export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  // Espera as gravações em andamento para não devolver uma foto velha.
  await (chains.get(userId) ?? Promise.resolve()).catch(() => undefined);
  return read(userId);
}

/** Descarta um item rejeitado (o único que o operador pode remover; pendente nunca é apagado). */
export function discard(userId: string, clientUuid: string): Promise<void> {
  return mutateOutbox(userId, (items) => {
    const keep = items.filter((i) => !(i.client_uuid === clientUuid && i.status === 'rejected'));
    return keep.length === items.length ? null : keep;
  });
}

/** Quantidade de itens ainda por enviar (rejeitados não contam). */
export async function pendingCount(userId: string): Promise<number> {
  return (await listOutbox(userId)).filter((i) => i.status === 'pending').length;
}
