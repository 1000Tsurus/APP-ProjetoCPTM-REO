import { request, requestWithStatus } from './client';
import type {
  LocationRead,
  Page,
  SleeperCreate,
  SleeperHistory,
  SleeperRead,
  SleeperStatus,
  SpeciesRead,
  SyncStatusRead,
  UserRead,
} from './types';

/** Monta a query string omitindo parâmetros indefinidos; valores são codificados. */
function query(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Usuário logado. */
export function getMe(): Promise<UserRead> {
  return request<UserRead>('GET', '/auth/me');
}

export type ListSleepersParams = {
  q?: string;
  status?: SleeperStatus;
  location_id?: string;
  limit?: number;
  offset?: number;
};

/** Lista paginada de dormentes, com filtros opcionais. */
export function listSleepers(p: ListSleepersParams = {}): Promise<Page<SleeperRead>> {
  return request<Page<SleeperRead>>(
    'GET',
    `/dormentes${query({
      q: p.q,
      status: p.status,
      location_id: p.location_id,
      limit: p.limit,
      offset: p.offset,
    })}`,
  );
}

/** Busca pela tag; o `encodeURIComponent` evita que `/` ou `?` na tag quebrem o path. */
export function getSleeperByTag(tag: string): Promise<SleeperRead> {
  return request<SleeperRead>('GET', `/dormentes/tag/${encodeURIComponent(tag)}`);
}

/** Dormente com o histórico de movimentações, inspeções e ocorrências. */
export function getSleeperHistory(id: string): Promise<SleeperHistory> {
  return request<SleeperHistory>('GET', `/dormentes/${encodeURIComponent(id)}/historico`);
}

/** Cadastro online: a API responde 201 ao criar e 200 se o `client_uuid` já foi usado. */
export async function createSleeper(
  body: SleeperCreate,
): Promise<{ status: number; sleeper: SleeperRead }> {
  const { status, data } = await requestWithStatus<SleeperRead>('POST', '/dormentes', body);
  return { status, sleeper: data };
}

/** Espécies ativas (até 200), para os seletores. */
export function listSpecies(): Promise<Page<SpeciesRead>> {
  return request<Page<SpeciesRead>>('GET', `/especies${query({ limit: 200, active: true })}`);
}

/** Locais ativos (até 200), para os seletores. */
export function listLocations(): Promise<Page<LocationRead>> {
  return request<Page<LocationRead>>('GET', `/locais${query({ limit: 200, active: true })}`);
}

/** Último lote sincronizado por este aparelho (e a hora do servidor). */
export function getSyncStatus(deviceId: string): Promise<SyncStatusRead> {
  return request<SyncStatusRead>('GET', `/sincronizacao/status${query({ device_id: deviceId })}`);
}
