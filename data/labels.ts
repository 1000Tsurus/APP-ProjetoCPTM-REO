// Rótulos dos enums da API (espelho de src/rotulos.js do site). A API manda
// valores estáveis em inglês; a tela mostra português. Valor desconhecido
// aparece cru, para não sumir com um dado novo que a API passe a mandar.
import type { Tone } from '../constants/theme';
import type {
  ConservationState,
  InspectionResult,
  MoistureLevel,
  MovementKind,
  OccurrenceKind,
  Role,
  SleeperStatus,
} from './api/types';

export type ToneLabel = { label: string; tone: Tone };

export const SLEEPER_STATUS: Record<SleeperStatus, ToneLabel> = {
  in_stock: { label: 'Em estoque', tone: 'ok' },
  withdrawn: { label: 'Retirado', tone: 'info' },
  in_track: { label: 'Na via', tone: 'neutro' },
  quarantine: { label: 'Quarentena', tone: 'warn' },
  discarded: { label: 'Descartado', tone: 'danger' },
};

export const MOVEMENT_KIND: Record<MovementKind, string> = {
  entry: 'Entrada',
  withdrawal: 'Retirada',
  transfer: 'Transferência',
};

export const OCCURRENCE_KIND: Record<OccurrenceKind, string> = {
  damage: 'Dano',
  loss: 'Perda',
  misplaced: 'Fora do lugar',
  other: 'Outra',
};

export const INSPECTION_RESULT: Record<InspectionResult, ToneLabel> = {
  approved: { label: 'Aprovada', tone: 'ok' },
  rejected: { label: 'Reprovada', tone: 'danger' },
};

export const CONSERVATION: Record<ConservationState, string> = {
  good: 'Bom',
  fair: 'Regular',
  poor: 'Ruim',
};

export const MOISTURE: Record<MoistureLevel, string> = {
  dry: 'Seco',
  moist: 'Úmido',
  wet: 'Molhado',
};

export const ROLE_LABEL: Record<Role, string> = {
  operador: 'Operador',
  tecnico: 'Técnico',
  especialista: 'Especialista',
  supervisor: 'Supervisor',
  admin: 'Administrador',
};

/** Texto de exibição de um valor de enum; valor desconhecido volta cru. */
export function label(map: Record<string, string | ToneLabel>, value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const item = map[value];
  if (item === undefined) return value;
  return typeof item === 'string' ? item : item.label;
}
