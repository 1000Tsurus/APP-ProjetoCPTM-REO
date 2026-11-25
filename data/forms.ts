// Montagem e validação (cliente) dos registros de campo que vão para a fila offline.
// Funções puras: as regras espelham os validadores de app/schemas/operations.py da API,
// para o operador ver o erro na hora em vez de ter o item rejeitado depois no sync.
import type {
  ConservationState,
  InspectionCreate,
  InspectionResult,
  MoistureLevel,
  MovementCreate,
  MovementKind,
  OccurrenceCreate,
  OccurrenceKind,
} from './api/types';
import { INSPECTION_RESULT, label, MOVEMENT_KIND, OCCURRENCE_KIND } from './labels';
import { isValidTag, normalizeTag } from './tag';

export type Built<T> = { payload: T; summary: string; error?: undefined } | { error: string };

const orUndefined = (v: string | undefined | null): string | undefined => {
  const t = (v ?? '').trim();
  return t === '' ? undefined : t;
};

const TAG_ERROR = 'Tag inválida.';

export type MovementInput = {
  tag: string;
  kind: MovementKind;
  toLocationId?: string | null;
  /** Nome do destino, só para o texto da fila. */
  toLocationName?: string;
  requisitionNumber?: string;
  notes?: string;
  clientUuid: string;
  now: Date;
};

/** Monta a movimentação: retirada exige RM e não tem destino; entrada e transferência exigem destino. */
export function buildMovement(input: MovementInput): Built<MovementCreate> {
  const tag = normalizeTag(input.tag);
  if (!isValidTag(tag)) return { error: TAG_ERROR };
  const notes = orUndefined(input.notes);
  if (notes && notes.length > 2000) return { error: 'Observações: no máximo 2000 caracteres.' };

  const payload: MovementCreate = {
    rfid_tag: tag,
    kind: input.kind,
    occurred_at: input.now.toISOString(),
    client_uuid: input.clientUuid,
  };
  if (notes) payload.notes = notes;

  if (input.kind === 'withdrawal') {
    const rm = orUndefined(input.requisitionNumber);
    if (!rm) return { error: 'Informe a RM da retirada.' };
    if (rm.length > 40) return { error: 'A RM tem no máximo 40 caracteres.' };
    payload.requisition_number = rm;
    return { payload, summary: `${label(MOVEMENT_KIND, 'withdrawal')} (RM ${rm})` };
  }

  if (!input.toLocationId) return { error: 'Escolha o local de destino.' };
  payload.to_location_id = input.toLocationId;
  const where = input.toLocationName ?? 'destino';
  const summary = input.kind === 'entry' ? `Entrada em ${where}` : `Transferência para ${where}`;
  return { payload, summary };
}

export type InspectionInput = {
  tag: string;
  /** Quando a tela abriu; a diferença até `now` vira `duration_seconds`. */
  startedAt: Date;
  now: Date;
  conservation: ConservationState;
  hasCracks: boolean;
  biologicalAttack: boolean;
  moisture: MoistureLevel;
  estimatedLifeYears?: number | null;
  speciesConfirmed?: boolean | null;
  speciesCorrectedId?: string | null;
  notes?: string;
  result: InspectionResult;
  clientUuid: string;
};

/** Monta a inspeção: vida útil 0–100, espécie corrigida só quando não confirmada, duração em segundos. */
export function buildInspection(input: InspectionInput): Built<InspectionCreate> {
  const tag = normalizeTag(input.tag);
  if (!isValidTag(tag)) return { error: TAG_ERROR };
  const life = input.estimatedLifeYears;
  if (life !== undefined && life !== null && (!Number.isInteger(life) || life < 0 || life > 100)) {
    return { error: 'A vida útil estimada deve ser um número inteiro de 0 a 100 anos.' };
  }
  const notes = orUndefined(input.notes);
  if (notes && notes.length > 4000) return { error: 'Observações: no máximo 4000 caracteres.' };
  if (input.speciesConfirmed === false && !input.speciesCorrectedId) {
    return { error: 'Escolha a espécie correta.' };
  }

  // A API recusa "corrigida" junto com "confirmada"; só envia a correção quando não confirmou.
  const corrected = input.speciesConfirmed === false ? input.speciesCorrectedId : undefined;
  const seconds = Math.round((input.now.getTime() - input.startedAt.getTime()) / 1000);
  const payload: InspectionCreate = {
    rfid_tag: tag,
    inspected_at: input.now.toISOString(),
    conservation: input.conservation,
    has_cracks: input.hasCracks,
    biological_attack: input.biologicalAttack,
    moisture: input.moisture,
    result: input.result,
    duration_seconds: Math.min(86400, Math.max(0, seconds)),
    client_uuid: input.clientUuid,
  };
  if (life !== undefined && life !== null) payload.estimated_life_years = life;
  if (input.speciesConfirmed !== undefined && input.speciesConfirmed !== null) {
    payload.species_confirmed = input.speciesConfirmed;
  }
  if (corrected) payload.species_corrected_id = corrected;
  if (notes) payload.notes = notes;
  return { payload, summary: `Inspeção — ${INSPECTION_RESULT[input.result]?.label ?? input.result}` };
}

export type OccurrenceInput = {
  tag?: string;
  locationId?: string | null;
  kind: OccurrenceKind;
  description: string;
  clientUuid: string;
  now: Date;
};

/** Monta a ocorrência: precisa de tag ou local; descrição de 3 a 2000 caracteres. */
export function buildOccurrence(input: OccurrenceInput): Built<OccurrenceCreate> {
  const tag = orUndefined(input.tag) ? normalizeTag(input.tag ?? '') : undefined;
  if (tag !== undefined && !isValidTag(tag)) return { error: TAG_ERROR };
  if (!tag && !input.locationId) return { error: 'Informe a tag ou escolha o local.' };
  const description = input.description.trim();
  if (description.length < 3) return { error: 'Descreva a ocorrência (mínimo 3 caracteres).' };
  if (description.length > 2000) return { error: 'Descrição: no máximo 2000 caracteres.' };

  const payload: OccurrenceCreate = {
    kind: input.kind,
    description,
    occurred_at: input.now.toISOString(),
    client_uuid: input.clientUuid,
  };
  if (tag) payload.rfid_tag = tag;
  if (input.locationId) payload.location_id = input.locationId;
  return { payload, summary: `Ocorrência — ${label(OCCURRENCE_KIND, input.kind)}` };
}
