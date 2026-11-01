import AsyncStorage from '@react-native-async-storage/async-storage';

export type OperatorProfile = {
  nomeCompleto: string; matriculaOuEmail: string; funcaoOperacional: string; baseLotacao: string;
};
export type AccessRole = 'manager' | 'operator';
export type ManagedProfile = OperatorProfile & { id: string; role: AccessRole; status: 'pending' | 'approved' | 'rejected' };
export type AccessRequest = OperatorProfile & { id: string; createdAt: string; status: 'pending' | 'approved' | 'rejected' };
type VerifiedSession = { profile: ManagedProfile };
const endpoint = process.env.EXPO_PUBLIC_OPERATIONS_API_URL?.replace(/\/$/, '');
export const backendConfigured = !!endpoint;
let credential: { token: string; subject: string } | null = null;

export const operationalStorageKey = () => credential ? `cptm.raillog.account.${credential.subject}` : 'cptm.raillog.inspections.v1';

export async function api<T>(path: string, options: { method?: string; body?: unknown; public?: boolean } = {}): Promise<T> {
  if (!endpoint) throw new Error('Backend não integrado. Esta ação exige autenticação e autorização no servidor.');
  if (!/^https:\/\//i.test(endpoint)) throw new Error('Configure a API operacional com HTTPS.');
  if (!options.public && !credential) throw new Error('Entre com uma conta aprovada pelo serviço de autenticação.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: options.method || 'GET', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(!options.public && credential ? { Authorization: `Bearer ${credential.token}` } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (response.status === 401) { credential = null; throw new Error('Sessão expirada. Entre novamente.'); }
    if (response.status === 403) throw new Error('O servidor não autorizou esta ação. Verifique sua aprovação, função e lotes permitidos.');
    if (!response.ok) throw new Error('O serviço não concluiu a solicitação. Tente novamente.');
    return await response.json() as T;
  } finally { clearTimeout(timer); }
}

export function clearAccessSession() { credential = null; }
export async function verifiedSession(): Promise<VerifiedSession> {
  const session = await api<VerifiedSession>('/auth/session');
  if (!session.profile?.id || session.profile.id !== credential?.subject || session.profile.status !== 'approved' || !['manager', 'operator'].includes(session.profile.role)) {
    credential = null;
    throw new Error('A conta ainda não possui acesso aprovado.');
  }
  return session;
}
export async function authenticate(identifier: string, password: string) {
  clearAccessSession();
  const result = await api<{ accessToken: string; subject: string }>('/auth/login', { method: 'POST', body: { identifier, password }, public: true });
  if (!result.accessToken || !result.subject) throw new Error('Resposta de autenticação inválida.');
  credential = { token: result.accessToken, subject: result.subject };
  try { return await verifiedSession(); }
  catch (error) { clearAccessSession(); throw error; }
}
export async function requireManager() {
  const { profile } = await verifiedSession();
  if (profile.role !== 'manager') throw new Error('Somente gerentes podem executar esta ação.');
}
export async function authorizeLot(lotId: string, action: 'read' | 'inspect') {
  if (!backendConfigured) return; // Explicit, untrusted local workspace; never grants manager privileges.
  const result = await api<{ allowed: boolean }>('/authorization/check', { method: 'POST', body: { lotId, action } });
  if (result.allowed !== true) throw new Error('Você não tem permissão para este lote.');
}

const REQUESTS_KEY = 'raillog.local-access-requests.v1';
let requestQueue: Promise<unknown> = Promise.resolve();
export async function localRequests(): Promise<AccessRequest[]> {
  const raw = await AsyncStorage.getItem(REQUESTS_KEY);
  return raw ? JSON.parse(raw) : [];
}
export function submitAccessRequest(profile: OperatorProfile, password: string) {
  if (backendConfigured) return api('/access-requests', { method: 'POST', body: { ...profile, password }, public: true });
  const result = requestQueue.then(async () => {
    const requests = await localRequests();
    if (requests.some((item) => item.matriculaOuEmail.toLowerCase() === profile.matriculaOuEmail.toLowerCase())) throw new Error('Já existe uma solicitação local para este identificador.');
    requests.push({ ...profile, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, status: 'pending', createdAt: new Date().toISOString() });
    await AsyncStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  });
  requestQueue = result.catch(() => undefined);
  return result;
}
export async function managementData() {
  await requireManager();
  const [requests, profiles] = await Promise.all([api<AccessRequest[]>('/access-requests'), api<ManagedProfile[]>('/operators')]);
  return { requests, profiles };
}
export async function decideRequest(id: string, decision: 'approved' | 'rejected', funcaoOperacional: string) {
  await requireManager();
  return api(`/access-requests/${encodeURIComponent(id)}/decision`, { method: 'POST', body: { decision, funcaoOperacional, role: 'operator' } });
}
export async function changeOperationalFunction(id: string, funcaoOperacional: string) {
  await requireManager();
  return api(`/operators/${encodeURIComponent(id)}`, { method: 'PATCH', body: { funcaoOperacional } });
}
