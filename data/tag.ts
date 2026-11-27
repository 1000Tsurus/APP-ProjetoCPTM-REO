/** Normaliza a tag RFID como a API faz (`strip().upper()`): o leitor em modo teclado pode enviar espaço, minúsculas e quebra de linha. */
export function normalizeTag(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Valida uma tag já normalizada: 1 a 64 caracteres, sem espaço interno (mesma regra da API). */
export function isValidTag(tag: string): boolean {
  return tag.length >= 1 && tag.length <= 64 && !/\s/.test(tag);
}
