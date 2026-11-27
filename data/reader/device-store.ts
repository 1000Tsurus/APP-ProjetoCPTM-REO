import AsyncStorage from '@react-native-async-storage/async-storage';

/** Leitor Bluetooth pareado que o app deve reconectar sozinho. */
export type SavedReader = { address: string; name: string };

const KEY = 'reo.reader.device';

/** Lê o leitor salvo; ausente ou ilegível vale `null` (o operador escolhe de novo). */
export async function getSavedReader(): Promise<SavedReader | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === 'object') {
      const { address, name } = v as Record<string, unknown>;
      if (typeof address === 'string' && address && typeof name === 'string') return { address, name };
    }
  } catch {
    // valor corrompido: trata como não salvo
  }
  return null;
}

/** Guarda o leitor escolhido para as próximas aberturas do app. */
export async function saveReader(r: SavedReader): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ address: r.address, name: r.name }));
}

/** Esquece o leitor salvo. */
export async function forgetReader(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
