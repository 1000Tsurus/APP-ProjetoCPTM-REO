import { isValidTag, normalizeTag } from '../tag';
import type { ReaderMode } from './types';

export type ReaderLine =
  | { kind: 'tag'; tag: string }
  | { kind: 'mode'; mode: ReaderMode }
  | { kind: 'error'; message: string }
  | { kind: 'ignored' };

const MODES: readonly string[] = ['LEITURA', 'GRAVACAO', 'DESLIGADO'];

/**
 * Interpreta uma linha do leitor ESP32 (ver hardware/leitor-esp32/PROTOCOLO.md).
 * Só `TAG:`, `MODO:` e `ERRO:` interessam; o resto (mensagens para gente) é ignorado
 * para o firmware poder evoluir sem quebrar o app.
 */
export function parseReaderLine(line: string): ReaderLine {
  const text = line.trim();
  if (text.startsWith('TAG:')) {
    const tag = normalizeTag(text.slice(4));
    return isValidTag(tag) ? { kind: 'tag', tag } : { kind: 'ignored' };
  }
  if (text.startsWith('MODO:')) {
    const mode = text.slice(5).trim();
    return MODES.includes(mode) ? { kind: 'mode', mode: mode as ReaderMode } : { kind: 'ignored' };
  }
  if (text.startsWith('ERRO:')) {
    return { kind: 'error', message: text.slice(5).trim() };
  }
  return { kind: 'ignored' };
}
