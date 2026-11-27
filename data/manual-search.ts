import { NetworkError } from './api/client';
import { listSleepers } from './api/endpoints';
import type { SleeperRead } from './api/types';
import { searchCachedSleepers } from './catalog-cache';

/** Mínimo de caracteres para consultar (evita listar o inventário inteiro). */
const MIN_QUERY = 4;

/** Busca manual por tag ou ata: online na API; sem rede, nos dormentes já consultados (cache). */
export async function searchSleepers(q: string): Promise<{ items: SleeperRead[]; offline: boolean }> {
  const term = q.trim();
  if (term.length < MIN_QUERY) return { items: [], offline: false };
  try {
    const page = await listSleepers({ q: term, limit: 10 });
    return { items: page.items, offline: false };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    return { items: await searchCachedSleepers(term), offline: true };
  }
}
