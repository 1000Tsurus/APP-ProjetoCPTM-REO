import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, NetworkError } from './api/client';
import { getSleeperByTag, listLocations, listSpecies } from './api/endpoints';
import type { LocationRead, SleeperRead, SpeciesRead } from './api/types';

const SPECIES_KEY = 'reo.cache.species';
const LOCATIONS_KEY = 'reo.cache.locations';
const SLEEPERS_KEY = 'reo.cache.sleepers';

/** Máximo de dormentes guardados para consulta offline; o mais antigo sai primeiro. */
const MAX_SLEEPERS = 200;

type CatalogEntry<T> = { items: T[]; fetchedAt: string };
export type CatalogResult<T> = { items: T[]; fetchedAt: string | null };
type SleeperEntry = { tag: string; sleeper: SleeperRead; fetchedAt: string };

export type LookupResult =
  | { sleeper: SleeperRead; fetchedAt: string; fromCache: boolean }
  | { notFound: true }
  | { offlineUnknown: true };

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Cache corrompido ou indisponível é tratado como vazio.
    return null;
  }
}

/** Rede primeiro (e grava); sem rede devolve o último salvo, ou vazio. */
async function getCatalog<T>(
  key: string,
  fetchPage: () => Promise<{ items: T[] }>,
): Promise<CatalogResult<T>> {
  try {
    const page = await fetchPage();
    const entry: CatalogEntry<T> = { items: page.items, fetchedAt: new Date().toISOString() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
    return entry;
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    const saved = await readJson<CatalogEntry<T>>(key);
    return saved ?? { items: [], fetchedAt: null };
  }
}

/** Espécies ativas, com cache para uso offline. */
export function getSpecies(): Promise<CatalogResult<SpeciesRead>> {
  return getCatalog(SPECIES_KEY, listSpecies);
}

/** Locais ativos, com cache para uso offline. */
export function getLocations(): Promise<CatalogResult<LocationRead>> {
  return getCatalog(LOCATIONS_KEY, listLocations);
}

/** Atualiza os catálogos (ao logar / abrir telas com rede); falha de rede não é erro. */
export async function refreshCatalogs(): Promise<void> {
  await Promise.all([getSpecies(), getLocations()]);
}

/** Guarda o dormente; ordem do array = do mais antigo ao mais recente (não depende da ordem de chaves de objeto). */
async function saveSleeper(tag: string, sleeper: SleeperRead, fetchedAt: string): Promise<void> {
  const all = ((await readJson<SleeperEntry[]>(SLEEPERS_KEY)) ?? []).filter((s) => s.tag !== tag);
  all.push({ tag, sleeper, fetchedAt });
  await AsyncStorage.setItem(SLEEPERS_KEY, JSON.stringify(all.slice(-MAX_SLEEPERS)));
}

/**
 * Busca o dormente pela tag (já normalizada pelo chamador). Online grava no cache;
 * sem rede usa o último salvo (`fromCache`) ou avisa que a tag não é conhecida.
 */
export async function lookupSleeper(tag: string): Promise<LookupResult> {
  try {
    const sleeper = await getSleeperByTag(tag);
    const fetchedAt = new Date().toISOString();
    await saveSleeper(tag, sleeper, fetchedAt);
    return { sleeper, fetchedAt, fromCache: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { notFound: true };
    if (!(e instanceof NetworkError)) throw e;
    const saved = ((await readJson<SleeperEntry[]>(SLEEPERS_KEY)) ?? []).find((s) => s.tag === tag);
    if (!saved) return { offlineUnknown: true };
    return { sleeper: saved.sleeper, fetchedAt: saved.fetchedAt, fromCache: true };
  }
}

/** Busca offline: contém (sem caixa) na tag ou na ata, na ordem do cache, até `limit`. */
export async function searchCachedSleepers(q: string, limit = 10): Promise<SleeperRead[]> {
  const term = q.trim().toLowerCase();
  const all = (await readJson<SleeperEntry[]>(SLEEPERS_KEY)) ?? [];
  const found: SleeperRead[] = [];
  for (const { sleeper } of all) {
    const hay = [sleeper.rfid_tag, sleeper.registration_record ?? ''];
    if (hay.some((h) => h.toLowerCase().includes(term))) found.push(sleeper);
    if (found.length >= limit) break;
  }
  return found;
}
