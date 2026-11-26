import { isValidTag, normalizeTag } from '../tag';
import type { ReaderStatus, TagReader } from './types';

/**
 * Leitor por teclado/campo de texto: o leitor RFID em modo HID "digita" a tag.
 * `push` recebe o texto cru, normaliza e avisa os inscritos; texto inválido é ignorado.
 */
export function createKeyboardReader(): TagReader & { push(raw: string): void } {
  const listeners = new Set<(tag: string) => void>();
  return {
    status: (): ReaderStatus => 'none',
    subscribe(onTag) {
      listeners.add(onTag);
      return () => {
        listeners.delete(onTag);
      };
    },
    async reconnect() {
      // Teclado não tem conexão a refazer.
    },
    push(raw: string) {
      const tag = normalizeTag(raw);
      if (!isValidTag(tag)) return;
      for (const l of [...listeners]) l(tag);
    },
  };
}
