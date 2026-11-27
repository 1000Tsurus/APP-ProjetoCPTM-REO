// Últimos locais usados em lotes de receber/transferir, para ficarem no topo da tela de preparo.
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_RECENT = 3;

const keyFor = (userId: string): string => `reo.recent_locations.${userId}`;

/** Coloca `id` na frente da lista, sem repetir, mantendo só os últimos usados. */
export function bumpRecent(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT);
}

/** Ids dos últimos locais usados pelo usuário (mais novo primeiro); vazio se nada salvo ou ilegível. */
export async function getRecentLocationIds(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Registra o local como o mais recente; falha de armazenamento não atrapalha o lote. */
export async function rememberLocation(userId: string, id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(bumpRecent(await getRecentLocationIds(userId), id)));
  } catch {
    // Só perde a conveniência do atalho.
  }
}
