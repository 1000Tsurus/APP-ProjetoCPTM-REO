// Regra de decisão da leitura em lote: dada a tarefa escolhida e o que se sabe do dormente,
// diz se a leitura vira registro na fila, é pulada ou bloqueada. Função pura, sem I/O.
import type { OccurrenceKind, ResolvePayload } from './api/types';
import type { LookupResult } from './catalog-cache';
import { buildMovement, buildOccurrence } from './forms';
import type { NewOutboxItem } from './outbox';
import { isValidTag, normalizeTag } from './tag';

export type BatchTask =
  | { kind: 'receive' | 'transfer'; locationId: string; locationName: string }
  | { kind: 'withdraw'; requisitionNumber: string }
  | { kind: 'occurrence'; occurrenceKind: OccurrenceKind; description: string };

export type ReadTone = 'ok' | 'new' | 'pending' | 'warn' | 'error';

export type ReadDecision =
  | { outcome: 'record'; item: NewOutboxItem; tone: 'ok' | 'new' | 'pending'; message: string }
  | { outcome: 'skip'; tone: 'warn'; message: string }
  | { outcome: 'block'; tone: 'error'; message: string };

type Ctx = { clientUuid: string; now: Date };

const block = (message: string): ReadDecision => ({ outcome: 'block', tone: 'error', message });

/** Monta a decisão de registro a partir do resultado de um builder (erro vira bloqueio). */
function recordFrom(
  built: { payload: NewOutboxItem['payload']; summary: string; error?: undefined } | { error: string },
  type: NewOutboxItem['type'],
  tag: string,
  clientUuid: string,
  tone: 'ok' | 'pending',
): ReadDecision {
  if (built.error !== undefined) return block(built.error);
  return {
    outcome: 'record',
    item: { type, client_uuid: clientUuid, payload: built.payload, rfid_tag: tag, summary: built.summary },
    tone,
    message: built.summary,
  };
}

/** Receber/transferir: o servidor decide entrada x transferência; o app só replica a regra com o dado que tem. */
function decideMove(
  task: Extract<BatchTask, { kind: 'receive' | 'transfer' }>,
  tag: string,
  lookup: LookupResult,
  ctx: Ctx,
): ReadDecision {
  if ('notFound' in lookup) {
    const payload = {
      rfid_tag: tag,
      location_id: task.locationId,
      occurred_at: ctx.now.toISOString(),
      client_uuid: ctx.clientUuid,
    };
    const summary = `Cadastro em ${task.locationName}`;
    return {
      outcome: 'record',
      item: { type: 'register', client_uuid: ctx.clientUuid, payload, rfid_tag: tag, summary },
      tone: 'new',
      message: 'Dormente novo cadastrado',
    };
  }
  if ('offlineUnknown' in lookup) {
    const payload: ResolvePayload = {
      rfid_tag: tag,
      to_location_id: task.locationId,
      location_name: task.locationName,
      occurred_at: ctx.now.toISOString(),
      client_uuid: ctx.clientUuid,
    };
    const summary = `Leitura em ${task.locationName}`;
    return {
      outcome: 'record',
      item: { type: 'resolve', client_uuid: ctx.clientUuid, payload, rfid_tag: tag, summary },
      tone: 'pending',
      message: 'Tag fora do cache — confere no envio',
    };
  }

  // Dado do cache pode estar velho: só bloqueia/pula com dado fresco; senão deixa o servidor julgar.
  const fresh = !lookup.fromCache;
  const { status, current_location: current } = lookup.sleeper;
  if (fresh && status === 'discarded') return block('Dormente descartado não movimenta.');
  if (fresh && current?.id === task.locationId) {
    return { outcome: 'skip', tone: 'warn', message: `Já está em ${task.locationName}.` };
  }
  const kind = current ? 'transfer' : 'entry';
  const built = buildMovement({
    tag,
    kind,
    toLocationId: task.locationId,
    toLocationName: task.locationName,
    clientUuid: ctx.clientUuid,
    now: ctx.now,
  });
  return recordFrom(built, 'movement', tag, ctx.clientUuid, 'ok');
}

/** Retirada: só dormente em estoque (com dado fresco); tag desconhecida não pode ser retirada. */
function decideWithdraw(
  task: Extract<BatchTask, { kind: 'withdraw' }>,
  tag: string,
  lookup: LookupResult,
  ctx: Ctx,
): ReadDecision {
  if ('notFound' in lookup) return block('Tag não cadastrada.');
  let tone: 'ok' | 'pending' = 'pending';
  if ('sleeper' in lookup) {
    tone = 'ok';
    const { status } = lookup.sleeper;
    if (!lookup.fromCache && status !== 'in_stock') {
      return block(
        status === 'quarantine'
          ? 'Dormente em quarentena não pode ir para a via.'
          : 'Só dormente em estoque pode ser retirado.',
      );
    }
  }
  const built = buildMovement({
    tag,
    kind: 'withdrawal',
    requisitionNumber: task.requisitionNumber,
    clientUuid: ctx.clientUuid,
    now: ctx.now,
  });
  return recordFrom(built, 'movement', tag, ctx.clientUuid, tone);
}

/** Ocorrência: precisa de dormente cadastrado; offline registra e o servidor confere no envio. */
function decideOccurrence(
  task: Extract<BatchTask, { kind: 'occurrence' }>,
  tag: string,
  lookup: LookupResult,
  ctx: Ctx,
): ReadDecision {
  if ('notFound' in lookup) return block('Tag não cadastrada.');
  const built = buildOccurrence({
    tag,
    kind: task.occurrenceKind,
    description: task.description,
    clientUuid: ctx.clientUuid,
    now: ctx.now,
  });
  return recordFrom(built, 'occurrence', tag, ctx.clientUuid, 'sleeper' in lookup ? 'ok' : 'pending');
}

/** Decide o que fazer com uma tag lida no lote, conforme a tarefa e o resultado da consulta. */
export function decideRead(task: BatchTask, rawTag: string, lookup: LookupResult, ctx: Ctx): ReadDecision {
  const tag = normalizeTag(rawTag);
  if (!isValidTag(tag)) return block('Tag inválida.');
  switch (task.kind) {
    case 'receive':
    case 'transfer':
      return decideMove(task, tag, lookup, ctx);
    case 'withdraw':
      return decideWithdraw(task, tag, lookup, ctx);
    case 'occurrence':
      return decideOccurrence(task, tag, lookup, ctx);
  }
}
