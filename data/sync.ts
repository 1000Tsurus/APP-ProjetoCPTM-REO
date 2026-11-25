import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkError, request } from './api/client';
import type { SyncBatchRead, SyncItemResult } from './api/types';
import { listOutbox, mutateOutbox, type OutboxItem, type OutboxType } from './outbox';
import { uuidv4 } from './uuid';

/** Limite de itens por chamada a /sincronizacao/replicar (teto da API). */
const BATCH_SIZE = 1000;
const DEVICE_KEY = 'reo.device_id';

export type SyncSummary = { sent: number; accepted: number; rejected: number };

const LIST_OF: Record<OutboxType, 'movements' | 'inspections' | 'occurrences'> = {
  movement: 'movements',
  inspection: 'inspections',
  occurrence: 'occurrences',
};

// Mutex global: só uma sincronização por vez, de qualquer usuário.
let running = false;

/** UUID do aparelho, gerado uma vez e guardado; identifica o lote no servidor. */
export async function deviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY);
  if (saved) return saved;
  const created = uuidv4();
  await AsyncStorage.setItem(DEVICE_KEY, created);
  return created;
}

/** Corpo do POST: cada payload vai na lista do seu tipo. */
function buildBody(device: string, batch: OutboxItem[]) {
  const body = {
    device_id: device,
    movements: [] as unknown[],
    inspections: [] as unknown[],
    occurrences: [] as unknown[],
  };
  for (const item of batch) body[LIST_OF[item.type]].push(item.payload);
  return body;
}

function parseResults(data: unknown): SyncItemResult[] {
  const results = (data as Partial<SyncBatchRead> | null | undefined)?.results;
  if (!Array.isArray(results)) throw new Error('Resposta inválida do servidor de sincronização.');
  return results;
}

/**
 * Envia a fila pendente do usuário em lotes de até 1000. Casa cada resultado pelo `client_uuid`
 * (não pela posição). `accepted`/`duplicate` saem da fila; `rejected` fica marcado com código e
 * motivo; item sem resultado continua pendente. Rede fora → 'offline'; erro da API ou resposta
 * inválida → lança, e nada que ainda não foi confirmado sai da fila.
 */
export async function syncNow(userId: string): Promise<SyncSummary | 'offline' | 'busy'> {
  if (running) return 'busy';
  running = true;
  const summary: SyncSummary = { sent: 0, accepted: 0, rejected: 0 };
  try {
    const pending = (await listOutbox(userId)).filter((i) => i.status === 'pending');
    if (pending.length === 0) return summary;
    const device = await deviceId();

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
        const result = byUuid.get(item.client_uuid);
        if (!result) continue;
        if (result.status === 'rejected') summary.rejected += 1;
        else summary.accepted += 1;
      }
    }
    return summary;
  } finally {
    running = false;
  }
}
