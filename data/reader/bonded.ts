/** Aparelho pareado (mesma forma do módulo nativo). */
export type BondedItem = { address: string; name: string };

/** Nome do leitor RFID do projeto; aparece primeiro para o operador achar de cara. */
export const REO_READER_NAME = 'REO-Leitor';

/** Ordena os pareados com `REO-Leitor` no topo; o resto segue a ordem original (sort estável). */
export function sortBonded<T extends BondedItem>(devices: T[]): T[] {
  const rank = (d: T) => (d.name === REO_READER_NAME ? 0 : 1);
  return [...devices].sort((a, b) => rank(a) - rank(b));
}
