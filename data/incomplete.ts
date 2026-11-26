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

// Uma cadeia de escrita por usuário: a UI remove enquanto o sync adiciona, então toda
// leitura-alteração-gravação passa por aqui para um não apagar a mudança do outro.
const chains = new Map<string, Promise<void>>();

function mutate(userId: string, change: (list: IncompleteEntry[]) => IncompleteEntry[] | null): Promise<void> {
  const previous = chains.get(userId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const result = change(await listIncomplete(userId));
      if (result) await AsyncStorage.setItem(keyOf(userId), JSON.stringify(result));
    });
  chains.set(userId, next);
  return next;
}

/** Marca a tag como ficha incompleta; a mesma tag nunca aparece duas vezes. */
export function addIncomplete(userId: string, entry: IncompleteEntry): Promise<void> {
  return mutate(userId, (list) => (list.some((e) => e.tag === entry.tag) ? null : [...list, entry]));
}

/** Tira a tag da lista (ficha completada). */
export function removeIncomplete(userId: string, tag: string): Promise<void> {
  return mutate(userId, (list) => {
    const keep = list.filter((e) => e.tag !== tag);
    return keep.length === list.length ? null : keep;
  });
}
