import AsyncStorage from '@react-native-async-storage/async-storage';

/** Dormente cadastrado só com a tag e o local; falta completar a ficha (espécie, classe etc.). */
export type IncompleteEntry = { tag: string; sleeper_id: string; created_at: string };

const keyOf = (userId: string) => `reo.incomplete.${userId}`;

/** Lê a lista; valor ausente ou ilegível vale lista vazia (é só um lembrete para o operador). */
export async function listIncomplete(userId: string): Promise<IncompleteEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as IncompleteEntry[]) : [];
  } catch {
    return [];
  }
}

/** Marca a tag como ficha incompleta; a mesma tag nunca aparece duas vezes. */
export async function addIncomplete(userId: string, entry: IncompleteEntry): Promise<void> {
  const list = await listIncomplete(userId);
  if (list.some((e) => e.tag === entry.tag)) return;
  await AsyncStorage.setItem(keyOf(userId), JSON.stringify([...list, entry]));
}

/** Tira a tag da lista (ficha completada). */
export async function removeIncomplete(userId: string, tag: string): Promise<void> {
  const list = await listIncomplete(userId);
  const keep = list.filter((e) => e.tag !== tag);
  if (keep.length === list.length) return;
  await AsyncStorage.setItem(keyOf(userId), JSON.stringify(keep));
}
