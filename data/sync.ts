import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkError, request } from './api/client';
import type { SyncBatchRead, SyncItemResult } from './api/types';
import { isHeld, listOutbox, mutateOutbox, type OutboxItem, type OutboxType } from './outbox';
import { sendRegistrations } from './sync-register';
import { uuidv4 } from './uuid';

/** Limite de itens por chamada a /sincronizacao/replicar (teto da API). */
const BATCH_SIZE = 1000;
const DEVICE_KEY = 'reo.device_id';
const lastKey = (userId: string) => `reo.sync.last.${userId}`;

/** `registered`: dormentes criados por cadastro/leitura pendente; `rejected` inclui os recusados no cadastro. */
export type SyncSummary = { sent: number; accepted: number; rejected: number; registered: number };

/** Tipos que vão no replicar; `register`/`resolve` são tratados antes, em sync-register. */
type ReplicarType = Exclude<OutboxType, 'register' | 'resolve'>;
type ReplicarItem = OutboxItem & { type: ReplicarType };

const LIST_OF: Record<ReplicarType, 'movements' | 'inspections' | 'occurrences'> = {
  movement: 'movements',
  inspection: 'inspections',
  occurrence: 'occurrences',
};

// Mutex global: só uma sincronização por vez, de qualquer usuário.
let running = false;

// Promessa memoizada: duas chamadas concorrentes na primeira abertura geram um ID só.
let devicePromise: Promise<string> | null = null;

async function loadOrCreateDeviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY);
  if (saved) return saved;
  const created = uuidv4();
  await AsyncStorage.setItem(DEVICE_KEY, created);
  return created;
}

/** UUID do aparelho, gerado uma vez e guardado; identifica o lote no servidor. */
export function deviceId(): Promise<string> {
  if (!devicePromise) {
    devicePromise = loadOrCreateDeviceId().catch((e) => {
      devicePromise = null; // falha de storage: tenta de novo na próxima chamada
      throw e;
    });
  }
  return devicePromise;
}

/** Corpo do POST: cada payload vai na lista do seu tipo. */
function buildBody(device: string, batch: ReplicarItem[]) {
  const body = {
    device_id: device,
    movements: [] as unknown[],
    inspections: [] as unknown[],
    occurrences: [] as unknown[],
  };
  for (const item of batch) body[LIST_OF[item.type]].push(item.payload);
  return body;
}

/** Pendentes que o replicar pode enviar agora: fora da espera do desfazer e sem cadastro/leitura. */
function sendable(items: OutboxItem[], skip: Set<string>): ReplicarItem[] {
  const now = new Date();
  return items.filter(
    (i): i is ReplicarItem =>
      i.status === 'pending' &&
      i.type !== 'register' &&
      i.type !== 'resolve' &&
      !isHeld(i, now) &&
      !skip.has(i.client_uuid),
  );
}

/** Quando a última sincronização terminou bem neste aparelho (ISO), ou null se nunca. */
export async function lastSyncAt(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(lastKey(userId));
}

function parseResults(data: unknown): SyncItemResult[] {
  const results = (data as Partial<SyncBatchRead> | null | undefined)?.results;
  if (!Array.isArray(results)) throw new Error('Resposta inválida do servidor de sincronização.');
  return results;
}

/**
 * Uma rodada: envia os pendentes que ainda não foram enviados nesta chamada, em lotes de até
 * 1000. Devolve os `client_uuid` enviados, ou 'offline' se a rede caiu.
 */
async function runPass(
  userId: string,
  device: string,
  skip: Set<string>,
  summary: SyncSummary,
): Promise<Set<string> | 'offline'> {
  const pending = sendable(await listOutbox(userId), skip);
  const sent = new Set<string>();

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    let results: SyncItemResult[];
    try {
      const data = await request<SyncBatchRead>('POST', '/sincronizacao/replicar', buildBody(device, batch));
      results = parseResults(data);
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      throw e;
    }

    const byUuid = new Map<string, SyncItemResult>();
    for (const r of results) if (r.client_uuid) byUuid.set(r.client_uuid, r);
    const sentUuids = new Set(batch.map((i) => i.client_uuid));

    // Relê a fila na hora de aplicar: itens novos gravados durante a requisição ficam intactos.
    await mutateOutbox(userId, (items) =>
      items.flatMap((item) => {
        const result = sentUuids.has(item.client_uuid) ? byUuid.get(item.client_uuid) : undefined;
        if (!result) return [item];
        if (result.status === 'rejected') {
          return [
            {
              ...item,
              status: 'rejected' as const,
              code: result.code ?? 'rejected',
              reason: result.reason ?? 'Item rejeitado pelo servidor.',
            },
          ];
        }
        return [];
      }),
    );

    summary.sent += batch.length;
    for (const item of batch) {
      sent.add(item.client_uuid);
      const result = byUuid.get(item.client_uuid);
      if (!result) continue;
      if (result.status === 'rejected') summary.rejected += 1;
      else summary.accepted += 1;
    }
  }
  return sent;
}

/**
 * Envia a fila pendente do usuário em lotes de até 1000. Casa cada resultado pelo `client_uuid`
 * (não pela posição). `accepted`/`duplicate` saem da fila; `rejected` fica marcado com código e
 * motivo; item sem resultado continua pendente. Rede fora → 'offline'; erro da API ou resposta
 * inválida → lança, e nada que ainda não foi confirmado sai da fila. Se entraram itens novos
 * durante o envio (um save que recebeu 'busy'), faz uma rodada extra — só uma — antes de liberar.
 */
export async function syncNow(userId: string): Promise<SyncSummary | 'offline' | 'busy'> {
  if (running) return 'busy';
  running = true;
  const summary: SyncSummary = { sent: 0, accepted: 0, rejected: 0, registered: 0 };
  try {
    const first = (await listOutbox(userId)).some((i) => i.status === 'pending');
    if (!first) return summary;
    const device = await deviceId();

    // Cadastros e leituras pendentes primeiro: o replicar não cria dormente.
    const registrations = await sendRegistrations(userId, new Date());
    if (registrations === 'offline') return 'offline';
    summary.registered += registrations.registered;
    summary.rejected += registrations.rejected;

    const sentFirst = await runPass(userId, device, new Set(), summary);
    if (sentFirst === 'offline') return 'offline';

    const hasNew = sendable(await listOutbox(userId), sentFirst).length > 0;
    if (hasNew) {
      const extra = await runPass(userId, device, sentFirst, summary);
      if (extra === 'offline') return 'offline';
    }
    await AsyncStorage.setItem(lastKey(userId), new Date().toISOString());
    return summary;
  } finally {
    running = false;
  }
}
