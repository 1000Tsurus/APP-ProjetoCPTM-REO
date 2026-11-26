import { ApiError, NetworkError } from './api/client';
import { createSleeper, getSleeperByTag } from './api/endpoints';
import type { ResolvePayload, SleeperCreate, SleeperRead } from './api/types';
import { getLocations } from './catalog-cache';
import { buildMovement } from './forms';
import { addIncomplete } from './incomplete';
import { isHeld, listOutbox, mutateOutbox, SYNC_GRACE_MS, type OutboxItem } from './outbox';

export type RegistrationSummary = { registered: number; converted: number; rejected: number };

/** Dados comuns a `register` e `resolve`: o que falta para criar o dormente ou virar movimentação. */
type Target = { tag: string; locationId: string; locationName?: string; occurredAt: string; clientUuid: string };

/** Antes de cadastrar o dormente, o item precisa ser do tipo certo e já ter saído da espera. */
const isRegistrationWork = (item: OutboxItem, now: Date): boolean =>
  item.status === 'pending' && (item.type === 'register' || item.type === 'resolve') && !isHeld(item, now, SYNC_GRACE_MS);

function targetOf(item: OutboxItem): Target {
  if (item.type === 'register') {
    const p = item.payload as SleeperCreate;
    return { tag: p.rfid_tag, locationId: p.location_id, occurredAt: p.occurred_at ?? item.created_at, clientUuid: item.client_uuid };
  }
  const p = item.payload as ResolvePayload;
  return {
    tag: p.rfid_tag,
    locationId: p.to_location_id,
    locationName: p.location_name || undefined,
    occurredAt: p.occurred_at,
    clientUuid: item.client_uuid,
  };
}

/** Nome do local pelo cache; sem cache ou sem o id, devolve undefined (o texto cai em "destino"). */
async function cachedLocationName(id: string): Promise<string | undefined> {
  try {
    return (await getLocations()).items.find((l) => l.id === id)?.name;
  } catch {
    return undefined;
  }
}

function replaceItem(userId: string, clientUuid: string, next: OutboxItem | null): Promise<void> {
  return mutateOutbox(userId, (items) =>
    items.flatMap((i) => (i.client_uuid !== clientUuid ? [i] : next ? [next] : [])),
  );
}

function reject(userId: string, item: OutboxItem, code: string, reason: string): Promise<void> {
  return replaceItem(userId, item.client_uuid, { ...item, status: 'rejected', code, reason });
}

/** Cadastra o dormente; sucesso tira o item da fila e lembra que a ficha está incompleta. */
async function create(userId: string, item: OutboxItem, t: Target, now: Date): Promise<void> {
  const body: SleeperCreate = {
    rfid_tag: t.tag,
    location_id: t.locationId,
    occurred_at: t.occurredAt,
    client_uuid: t.clientUuid,
  };
  const { sleeper } = await createSleeper(body);
  await replaceItem(userId, item.client_uuid, null);
  await addIncomplete(userId, { tag: t.tag, sleeper_id: sleeper.id, created_at: now.toISOString() });
}

/** Troca o item por uma movimentação (mesmo client_uuid e horário); o replicar a envia em seguida. */
async function convert(userId: string, item: OutboxItem, t: Target, sleeper: SleeperRead): Promise<'converted' | 'rejected'> {
  if (sleeper.current_location?.id === t.locationId) {
    await reject(userId, item, 'same_location', 'Dormente já estava neste local.');
    return 'rejected';
  }
  // Fora do pátio entra; em outro local é transferência.
  const kind = sleeper.current_location === null ? 'entry' : 'transfer';
  const built = buildMovement({
    tag: t.tag,
    kind,
    toLocationId: t.locationId,
    toLocationName: t.locationName ?? (await cachedLocationName(t.locationId)),
    clientUuid: t.clientUuid,
    now: new Date(t.occurredAt),
  });
  if ('error' in built && built.error) {
    await reject(userId, item, 'invalid_item', built.error);
    return 'rejected';
  }
  const { payload, summary } = built as { payload: OutboxItem['payload']; summary: string };
  const { hold_until: _hold, ...rest } = item;
  await replaceItem(userId, item.client_uuid, { ...rest, type: 'movement', payload, summary, rfid_tag: t.tag });
  return 'converted';
}

/** A tag já existe: vira movimentação conforme onde o dormente está. */
async function resolveExisting(userId: string, item: OutboxItem, t: Target): Promise<'converted' | 'rejected'> {
  return convert(userId, item, t, await getSleeperByTag(t.tag));
}

/** Um item: devolve o que aconteceu com ele. Erros de rede/API sobem para o chamador tratar. */
async function processOne(userId: string, item: OutboxItem, now: Date): Promise<keyof RegistrationSummary> {
  const t = targetOf(item);
  if (item.type === 'register') {
    try {
      await create(userId, item, t, now);
      return 'registered';
    } catch (e) {
      // Tag já existe (ex.: outro operador cadastrou antes): segue como leitura pendente.
      if (!(e instanceof ApiError && e.status === 409 && e.code === 'rfid_tag_taken')) throw e;
      return resolveExisting(userId, item, t);
    }
  }
  try {
    return await resolveExisting(userId, item, t);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
    await create(userId, item, t, now);
    return 'registered';
  }
}

/**
 * Envia os cadastros e resolve as leituras pendentes ANTES do replicar, porque a sincronização
 * não cria dormentes. Só pega itens pendentes fora da espera, do mais antigo ao mais novo.
 * Rede fora → 'offline' (itens ficam); erro da API → item rejeitado com `code`/`detail`, sem
 * novas tentativas. 401 e 5xx sobem para o chamador: são passageiros, o item continua pendente.
 */
export async function sendRegistrations(userId: string, now: Date): Promise<RegistrationSummary | 'offline'> {
  const work = (await listOutbox(userId))
    .filter((i) => isRegistrationWork(i, now))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const summary: RegistrationSummary = { registered: 0, converted: 0, rejected: 0 };

  for (const item of work) {
    try {
      summary[await processOne(userId, item, now)] += 1;
    } catch (e) {
      if (e instanceof NetworkError) return 'offline';
      // 401 (sessão) e 5xx (servidor) são passageiros: o item fica pendente e o erro sobe.
      if (!(e instanceof ApiError) || e.status === 401 || e.status >= 500) throw e;
      await reject(userId, item, e.code, e.detail);
      summary.rejected += 1;
    }
  }
  return summary;
}
