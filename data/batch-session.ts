// Sessão de lote: o operador escolhe a tarefa uma vez e lê várias tags. Cada leitura segue
// normalizar → deduplicar → consultar → decidir → enfileirar (com espera para desfazer) → agendar sync.
// Módulo puro com dependências injetadas, sem React; a tela só assina as mudanças.
import { decideRead, type BatchTask, type ReadTone } from './batch';
import type { LookupResult } from './catalog-cache';
import { SYNC_GRACE_MS, type OutboxItem, type enqueue, type releaseHolds, type undo } from './outbox';
import { isValidTag, normalizeTag } from './tag';

/** Tempo que o operador tem para desfazer uma leitura antes de ela poder ser enviada. */
export const HOLD_MS = 5000;

/** Texto da resposta a uma tag já lida no lote. */
export const DUPLICATE_MESSAGE = 'Já lido neste lote.';

/** O botão Desfazer some um pouco antes do prazo real, para não oferecer um desfazer que já não vale. */
export const UNDO_MARGIN_MS = 500;

export type BatchRead = {
  tag: string;
  /** Só existe quando a leitura virou item da fila. */
  clientUuid: string | null;
  tone: ReadTone;
  message: string;
  at: string;
  undone: boolean;
  /** Fim da espera do desfazer (mesmo instante gravado em `hold_until`); null se não virou item da fila. */
  holdUntil: string | null;
};

export type BatchSession = {
  read(raw: string): Promise<BatchRead>;
  undo(clientUuid: string): Promise<boolean>;
  finish(): Promise<void>;
  reads(): BatchRead[];
  subscribe(fn: () => void): () => void;
};

export type BatchSessionDeps = {
  userId: string;
  task: BatchTask;
  lookup: (tag: string) => Promise<LookupResult>;
  enqueue: typeof enqueue;
  undo: typeof undo;
  releaseHolds: typeof releaseHolds;
  /** Pode resolver antes de o envio terminar: a interface o dispara em segundo plano. */
  sync: () => Promise<unknown>;
  uuid: () => string;
  now: () => Date;
  /** Agenda `fn` daqui a `ms`; devolve a função que cancela. */
  schedule: (fn: () => void, ms: number) => () => void;
  holdMs?: number;
};

/** Cria a sessão de lote. Leituras são processadas uma de cada vez, na ordem de chegada. */
export function createBatchSession(deps: BatchSessionDeps): BatchSession {
  const holdMs = deps.holdMs ?? HOLD_MS;
  const list: BatchRead[] = [];
  const listeners = new Set<() => void>();
  // Tags registradas ou em voo e não desfeitas; só leitura que vira registro permanece aqui.
  const taken = new Set<string>();
  const cancels = new Set<() => void>();
  let chain: Promise<unknown> = Promise.resolve();

  const notify = (): void => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // Um ouvinte com erro não pode travar a sessão.
      }
    }
  };

  const push = (
    tag: string,
    tone: ReadTone,
    message: string,
    clientUuid: string | null,
    holdUntil: string | null = null,
  ): BatchRead => {
    const entry: BatchRead = { tag, clientUuid, tone, message, at: deps.now().toISOString(), undone: false, holdUntil };
    list.push(entry);
    notify();
    return entry;
  };

  /** Consulta, decide e (se for o caso) enfileira uma tag válida já reservada em `taken`. */
  async function process(tag: string): Promise<BatchRead> {
    try {
      const lookup = await deps.lookup(tag);
      const clientUuid = deps.uuid();
      // Um só instante para o prazo gravado na fila e o do botão Desfazer.
      const stamp = deps.now();
      const decision = decideRead(deps.task, tag, lookup, { clientUuid, now: stamp });
      if (decision.outcome !== 'record') {
        taken.delete(tag);
        return push(tag, decision.tone, decision.message, null);
      }
      await deps.enqueue(deps.userId, decision.item, { holdMs, now: stamp });
      const cancel = deps.schedule(() => {
        cancels.delete(cancel);
        deps.sync().catch(() => undefined);
      }, holdMs + SYNC_GRACE_MS + 100); // depois da margem que o envio respeita
      cancels.add(cancel);
      return push(tag, decision.tone, decision.message, clientUuid, new Date(stamp.getTime() + holdMs).toISOString());
    } catch {
      taken.delete(tag);
      return push(tag, 'error', 'Erro ao consultar a tag.', null);
    }
  }

  return {
    read(raw: string): Promise<BatchRead> {
      const tag = normalizeTag(raw);
      let job: () => Promise<BatchRead>;
      if (!isValidTag(tag)) {
        job = async () => push(tag, 'error', 'Tag inválida.', null);
      } else if (taken.has(tag)) {
        // Já registrada ou em voo: responde sem consultar nem enfileirar (e sem poluir a lista).
        return Promise.resolve({
          tag,
          clientUuid: null,
          tone: 'warn',
          message: DUPLICATE_MESSAGE,
          at: deps.now().toISOString(),
          undone: false,
          holdUntil: null,
        });
      } else {
        // Reserva já na chegada, para uma segunda leitura durante a consulta ser ignorada.
        taken.add(tag);
        job = () => process(tag);
      }
      const result = chain.then(job);
      chain = result.catch(() => undefined);
      return result;
    },

    async undo(clientUuid: string): Promise<boolean> {
      const removed = await deps.undo(deps.userId, clientUuid, deps.now());
      if (!removed) return false;
      const entry = list.find((r) => r.clientUuid === clientUuid);
      if (entry) {
        entry.undone = true;
        taken.delete(entry.tag);
      }
      notify();
      return true;
    },

    async finish(): Promise<void> {
      await chain;
      for (const cancel of [...cancels]) cancel();
      cancels.clear();
      const ids = list.filter((r) => r.clientUuid && !r.undone).map((r) => r.clientUuid as string);
      await deps.releaseHolds(deps.userId, ids);
      await deps.sync();
    },

    reads: () => list.map((r) => ({ ...r })),

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/**
 * Totais do lote para a tela: `read` = leituras registradas e não desfeitas; dessas, `sent` já saiu
 * da fila, `rejected` está na fila rejeitada (ou foi visto rejeitado e descartado, `everRejected`) e
 * `queued` é o resto (pendente).
 */
export function batchCounts(
  reads: BatchRead[],
  outbox: OutboxItem[],
  everRejected: ReadonlySet<string> = new Set(),
): { read: number; sent: number; queued: number; rejected: number } {
  const status = new Map(outbox.map((i) => [i.client_uuid, i.status]));
  const counts = { read: 0, sent: 0, queued: 0, rejected: 0 };
  for (const r of reads) {
    if (!r.clientUuid || r.undone) continue;
    counts.read += 1;
    const s = status.get(r.clientUuid);
    // Sumiu da fila: foi enviado, a não ser que tenha sido visto rejeitado (descartado depois).
    if (s === undefined) counts[everRejected.has(r.clientUuid) ? 'rejected' : 'sent'] += 1;
    else if (s === 'rejected') counts.rejected += 1;
    else counts.queued += 1;
  }
  return counts;
}

/** Milissegundos que o botão Desfazer ainda fica aberto (0 = fechado). */
export function undoButtonMs(card: Pick<BatchRead, 'holdUntil'>, nowMs: number): number {
  if (!card.holdUntil) return 0;
  return Math.max(0, Date.parse(card.holdUntil) - UNDO_MARGIN_MS - nowMs);
}

/** Repetição da tag que já está no cartão: o cartão (e o Desfazer) continua, só aparece o aviso. */
export function keepsCurrentCard(current: BatchRead | null, result: BatchRead): boolean {
  return !!current && result.clientUuid === null && result.message === DUPLICATE_MESSAGE && result.tag === current.tag;
}
