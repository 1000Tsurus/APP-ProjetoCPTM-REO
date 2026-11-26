// Sessão de lote: o operador escolhe a tarefa uma vez e lê várias tags. Cada leitura segue
// normalizar → deduplicar → consultar → decidir → enfileirar (com espera para desfazer) → agendar sync.
// Módulo puro com dependências injetadas, sem React; a tela só assina as mudanças.
import { decideRead, type BatchTask, type ReadTone } from './batch';
import type { LookupResult } from './catalog-cache';
import type { OutboxItem, enqueue, releaseHolds, undo } from './outbox';
import { isValidTag, normalizeTag } from './tag';

/** Tempo que o operador tem para desfazer uma leitura antes de ela poder ser enviada. */
export const HOLD_MS = 5000;

export type BatchRead = {
  tag: string;
  /** Só existe quando a leitura virou item da fila. */
  clientUuid: string | null;
  tone: ReadTone;
  message: string;
  at: string;
  undone: boolean;
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

  const push = (tag: string, tone: ReadTone, message: string, clientUuid: string | null): BatchRead => {
    const entry: BatchRead = { tag, clientUuid, tone, message, at: deps.now().toISOString(), undone: false };
    list.push(entry);
    notify();
    return entry;
  };

  /** Consulta, decide e (se for o caso) enfileira uma tag válida já reservada em `taken`. */
  async function process(tag: string): Promise<BatchRead> {
    try {
      const lookup = await deps.lookup(tag);
      const clientUuid = deps.uuid();
      const decision = decideRead(deps.task, tag, lookup, { clientUuid, now: deps.now() });
      if (decision.outcome !== 'record') {
        taken.delete(tag);
        return push(tag, decision.tone, decision.message, null);
      }
      await deps.enqueue(deps.userId, decision.item, { holdMs, now: deps.now() });
      const cancel = deps.schedule(() => {
        cancels.delete(cancel);
        deps.sync().catch(() => undefined);
      }, holdMs + 100);
      cancels.add(cancel);
      return push(tag, decision.tone, decision.message, clientUuid);
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
          message: 'Já lido neste lote.',
          at: deps.now().toISOString(),
          undone: false,
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
 * da fila, `rejected` está na fila rejeitada e `queued` é o resto (pendente).
 */
export function batchCounts(
  reads: BatchRead[],
  outbox: OutboxItem[],
): { read: number; sent: number; queued: number; rejected: number } {
  const status = new Map(outbox.map((i) => [i.client_uuid, i.status]));
  const counts = { read: 0, sent: 0, queued: 0, rejected: 0 };
  for (const r of reads) {
    if (!r.clientUuid || r.undone) continue;
    counts.read += 1;
    const s = status.get(r.clientUuid);
    if (s === undefined) counts.sent += 1;
    else if (s === 'rejected') counts.rejected += 1;
    else counts.queued += 1;
  }
  return counts;
}
