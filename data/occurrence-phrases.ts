// Frases prontas da ocorrência em lote e composição da descrição enviada à API.
import type { OccurrenceKind } from './api/types';

/**
 * Frases por tipo de ocorrência, para o operador tocar em vez de digitar.
 * TODO(decidir): proposta inicial, a validar com a equipe da CPTM. `other` é só texto livre.
 */
export const OCCURRENCE_PHRASES: Record<OccurrenceKind, string[]> = {
  damage: ['Rachadura', 'Apodrecido', 'Quebrado', 'Tag danificada'],
  loss: ['Não encontrado no local'],
  misplaced: ['Encontrado em outro local'],
  other: [],
};

/** Junta a frase pronta e o texto livre com ' — ', ignorando partes vazias. */
export function composeDescription(phrase: string | null, free: string): string {
  return [phrase ?? '', free].map((part) => part.trim()).filter((part) => part !== '').join(' — ');
}

/** Valida a descrição (3 a 2000 caracteres, como a API); devolve a mensagem de erro ou null. */
export function validateDescription(text: string): string | null {
  const length = text.trim().length;
  if (length < 3) return 'Descreva a ocorrência (mínimo 3 caracteres).';
  if (length > 2000) return 'Descrição: no máximo 2000 caracteres.';
  return null;
}
