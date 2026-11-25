import { API_URL } from '../config';
import type { ApiErrorBody } from './types';

/** Tempo máximo de uma requisição; acima disso tratamos como falta de rede. */
const TIMEOUT_MS = 15000;

type Method = 'GET' | 'POST' | 'PATCH';

export type RequestOptions = {
  /** Envia `Authorization: Bearer`. Padrão: true. */
  auth?: boolean;
  /** Tenta renovar o token em 401 e repete. Padrão: true. */
  retryOn401?: boolean;
};

export type ClientHooks = {
  getAccessToken(): string | null;
  refresh(): Promise<boolean>;
  onSessionExpired(): void;
};

/** Erro devolvido pela API (formato `{detail, code}`; 422 traz `errors`). */
export class ApiError extends Error {
  status: number;
  code: string;
  detail: string;
  errors?: ApiErrorBody['errors'];

  constructor(status: number, code: string, detail: string, errors?: ApiErrorBody['errors']) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.errors = errors;
  }
}

/** Falha de rede ou timeout: é o sinal para mandar o item para a fila offline. */
export class NetworkError extends Error {
  constructor(message = 'Sem conexão com o servidor.') {
    super(message);
    this.name = 'NetworkError';
  }
}

let hooks: ClientHooks = {
  getAccessToken: () => null,
  refresh: async () => false,
  onSessionExpired: () => {},
};

/** Liga o cliente à sessão (token, renovação e expiração); chamado pelo auth-store. */
export function configureClient(next: ClientHooks): void {
  hooks = next;
}

// Refresh em andamento, compartilhado: vários 401 simultâneos renovam uma vez só
// (o refresh token pode ser de uso único no servidor).
let refreshing: Promise<boolean> | null = null;

function sharedRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = hooks.refresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

type RawResponse = { status: number; data: unknown };

/** Uma tentativa HTTP: devolve sucesso, ou lança ApiError/NetworkError. */
async function send(method: Method, path: string, body: unknown, auth: boolean): Promise<RawResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = hooks.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = undefined;
    let parsed = true;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        parsed = false;
      }
    }
    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, data };
    }
    throw toApiError(response.status, parsed ? data : undefined);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Qualquer outra falha (TypeError do fetch, abort por timeout) é de rede.
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
}

/** Monta o ApiError; corpo ausente/não-JSON (ex.: 502 do proxy) vira `http_<status>`. */
function toApiError(status: number, data: unknown): ApiError {
  const body = (data && typeof data === 'object' ? data : {}) as Partial<ApiErrorBody>;
  if (typeof body.detail === 'string' && typeof body.code === 'string') {
    return new ApiError(status, body.code, body.detail, body.errors);
  }
  return new ApiError(status, `http_${status}`, `Erro do servidor (HTTP ${status}).`);
}

/** Igual a `request`, mas devolve também o status HTTP (ex.: POST /dormentes → 200 ou 201). */
export async function requestWithStatus<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<{ status: number; data: T }> {
  const auth = opts.auth ?? true;
  const retry = auth && (opts.retryOn401 ?? true);
  try {
    const result = await send(method, path, body, auth);
    return { status: result.status, data: result.data as T };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !retry) throw e;
    // Se o refresh falhar por rede, o erro sobe sem encerrar a sessão (modo offline).
    const renewed = await sharedRefresh();
    if (!renewed) {
      hooks.onSessionExpired();
      throw e;
    }
    try {
      const result = await send(method, path, body, auth);
      return { status: result.status, data: result.data as T };
    } catch (e2) {
      if (e2 instanceof ApiError && e2.status === 401) hooks.onSessionExpired();
      throw e2;
    }
  }
}

/** Chamada à API devolvendo só o corpo da resposta. */
export async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  return (await requestWithStatus<T>(method, path, body, opts)).data;
}

/** Texto em português para mostrar ao usuário a partir de qualquer erro. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    return e.status === 403 ? 'Seu papel não permite esta ação.' : e.detail;
  }
  if (e instanceof NetworkError) return 'Sem conexão com o servidor.';
  return 'Erro inesperado.';
}
