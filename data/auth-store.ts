import * as SecureStore from 'expo-secure-store';

import { ApiError, NetworkError, configureClient, request } from './api/client';
import type { Role, TokenResponse, UserRead } from './api/types';

const SESSION_KEY = 'reo.session';
const AUTH_OPTS = { auth: false, retryOn401: false } as const;

export type SessionState =
  | { status: 'signed_out' }
  | { status: 'online' | 'offline'; user: UserRead };

/** O que fica no SecureStore: nunca a senha nem o access token. */
type StoredSession = { refresh_token: string; refresh_expires_at: string; user: UserRead };

let state: SessionState = { status: 'signed_out' };
// Access token só em memória; some ao fechar o app.
let accessToken: string | null = null;
// Refresh token espelhado em memória para o hook de renovação não depender de I/O.
let stored: StoredSession | null = null;
const listeners = new Set<(s: SessionState) => void>();

function setState(next: SessionState): void {
  state = next;
  listeners.forEach((fn) => fn(next));
}

function isExpired(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isNaN(t) || t <= Date.now();
}

/** Guarda os tokens recebidos e marca a sessão como online. */
async function applyTokens(tokens: TokenResponse): Promise<SessionState> {
  accessToken = tokens.access_token;
  stored = {
    refresh_token: tokens.refresh_token,
    refresh_expires_at: tokens.refresh_expires_at,
    user: tokens.user,
  };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(stored));
  const next: SessionState = { status: 'online', user: tokens.user };
  setState(next);
  return next;
}

/**
 * Renova os tokens. Devolve false só quando o servidor rejeita o refresh token (4xx) ou ele
 * venceu; falha de rede/5xx sobe como erro para o cliente não encerrar a sessão (modo offline).
 */
async function refreshTokens(): Promise<boolean> {
  if (!stored || isExpired(stored.refresh_expires_at)) return false;
  try {
    const tokens = await request<TokenResponse>(
      'POST',
      '/auth/refresh',
      { refresh_token: stored.refresh_token },
      AUTH_OPTS,
    );
    await applyTokens(tokens);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) return false;
    throw e;
  }
}

async function expireSession(): Promise<void> {
  // Estado primeiro (síncrono): evita que um login logo em seguida seja sobrescrito.
  accessToken = null;
  stored = null;
  setState({ status: 'signed_out' });
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

configureClient({
  getAccessToken: () => accessToken,
  refresh: refreshTokens,
  onSessionExpired: () => {
    void expireSession();
  },
});

/** Autentica com matrícula/e-mail e senha; a senha não é guardada em lugar nenhum. */
export async function login(loginName: string, password: string): Promise<SessionState> {
  const tokens = await request<TokenResponse>(
    'POST',
    '/auth/login',
    { login: loginName, password },
    AUTH_OPTS,
  );
  return applyTokens(tokens);
}

function parseStored(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredSession>;
    if (data.refresh_token && data.refresh_expires_at && data.user?.id) return data as StoredSession;
  } catch {
    // JSON corrompido: trata como sem sessão.
  }
  return null;
}

/**
 * Reabre a sessão ao iniciar o app. Refresh vencido ou rejeitado → login; sem rede → modo
 * offline com o último usuário salvo (fila e papel continuam valendo).
 */
export async function restore(): Promise<SessionState> {
  const saved = parseStored(await SecureStore.getItemAsync(SESSION_KEY));
  if (!saved || isExpired(saved.refresh_expires_at)) {
    await expireSession();
    return state;
  }
  stored = saved;
  try {
    const renewed = await refreshTokens();
    if (renewed) return state;
    await expireSession();
    return state;
  } catch (e) {
    if (!(e instanceof NetworkError) && !(e instanceof ApiError)) throw e;
    // Rede fora ou erro 5xx: não é rejeição do token; segue offline com o usuário salvo.
    accessToken = null;
    setState({ status: 'offline', user: saved.user });
    return state;
  }
}

/** Encerra a sessão local. A fila offline do usuário permanece no aparelho. */
export async function logout(): Promise<void> {
  await expireSession();
}

export function getState(): SessionState {
  return state;
}

export function currentUser(): UserRead | null {
  return state.status === 'signed_out' ? null : state.user;
}

/** Assina mudanças de estado; devolve a função que cancela a assinatura. */
export function subscribe(fn: (s: SessionState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Papéis que movimentam e registram ocorrências em campo (supervisor só consulta). */
export function canFieldWork(role: Role): boolean {
  return role === 'operador' || role === 'tecnico' || role === 'especialista' || role === 'admin';
}

/** Papéis que podem fazer inspeção. */
export function canInspect(role: Role): boolean {
  return role === 'tecnico' || role === 'especialista' || role === 'admin';
}
