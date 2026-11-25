const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

const SESSION_KEY = 'reo.session';
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

function user(role = 'operador') {
  return { id: 'u-1', name: 'Ana', email: 'ana@x.com', registration: 'RL-1', role, active: true, created_at: PAST, updated_at: PAST };
}
function tokens(role, extra = {}) {
  return { access_token: 'acc-1', refresh_token: 'ref-1', token_type: 'bearer', expires_at: FUTURE, refresh_expires_at: FUTURE, user: user(role), ...extra };
}

function fakeSecureStore() {
  const values = new Map();
  return {
    values,
    getItemAsync: async (k) => values.get(k) ?? null,
    setItemAsync: async (k, v) => { values.set(k, v); },
    deleteItemAsync: async (k) => { values.delete(k); },
  };
}

// Cliente falso: `handler(method, path, body, opts, errors)` decide a resposta.
function fakeClient(handler) {
  class ApiError extends Error { constructor(status, code, detail) { super(detail); this.status = status; this.code = code; this.detail = detail; } }
  class NetworkError extends Error {}
  const calls = [];
  let hooks = null;
  return {
    ApiError, NetworkError, calls,
    hooks: () => hooks,
    configureClient: (h) => { hooks = h; },
    request: async (method, path, body, opts) => { calls.push({ method, path, body, opts }); return handler(method, path, body, opts, { ApiError, NetworkError }); },
  };
}

function setup(handler, seed) {
  const secure = fakeSecureStore();
  if (seed) secure.values.set(SESSION_KEY, JSON.stringify(seed));
  const client = fakeClient(handler);
  const store = load('data/auth-store.ts', { './api/client': client, 'expo-secure-store': secure });
  return { store, secure, client };
}

test('login grava reo.session sem senha e fica online', async () => {
  const { store, secure, client } = setup(async () => tokens('tecnico'));
  const state = await store.login('RL-1', 'Senha-secreta-123');
  assert.equal(state.status, 'online');
  assert.equal(store.currentUser().role, 'tecnico');
  const raw = secure.values.get(SESSION_KEY);
  assert.ok(!raw.includes('Senha-secreta-123'));
  assert.ok(!/password|senha/i.test(raw));
  const saved = JSON.parse(raw);
  assert.equal(saved.refresh_token, 'ref-1');
  assert.equal(saved.refresh_expires_at, FUTURE);
  assert.equal(saved.user.id, 'u-1');
  assert.equal(client.calls[0].path, '/auth/login');
  assert.deepEqual({ ...client.calls[0].opts }, { auth: false, retryOn401: false });
  assert.equal(client.hooks().getAccessToken(), 'acc-1');
});

test('restore com refresh válido e rede ok fica online e regrava o refresh novo', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: FUTURE, user: user() };
  const { store, secure, client } = setup(async () => tokens('operador', { refresh_token: 'ref-new' }), seed);
  const state = await store.restore();
  assert.equal(state.status, 'online');
  assert.equal(client.calls[0].path, '/auth/refresh');
  assert.equal(client.calls[0].body.refresh_token, 'ref-old');
  assert.deepEqual({ ...client.calls[0].opts }, { auth: false, retryOn401: false });
  assert.equal(JSON.parse(secure.values.get(SESSION_KEY)).refresh_token, 'ref-new');
});

test('restore com NetworkError fica offline com o usuário salvo e sem access token', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: FUTURE, user: user('tecnico') };
  const { store, secure, client } = setup(async (m, p, b, o, { NetworkError }) => { throw new NetworkError(); }, seed);
  const state = await store.restore();
  assert.equal(state.status, 'offline');
  assert.equal(state.user.id, 'u-1');
  assert.equal(store.currentUser().role, 'tecnico');
  assert.equal(client.hooks().getAccessToken(), null);
  assert.ok(secure.values.has(SESSION_KEY));
});

test('restore com 401 no refresh volta ao login e apaga reo.session', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: FUTURE, user: user() };
  const { store, secure } = setup(async (m, p, b, o, { ApiError }) => { throw new ApiError(401, 'invalid_token', 'x'); }, seed);
  const state = await store.restore();
  assert.equal(state.status, 'signed_out');
  assert.equal(store.currentUser(), null);
  assert.ok(!secure.values.has(SESSION_KEY));
});

test('restore sem sessão salva fica signed_out sem chamar a rede', async () => {
  const { store, client } = setup(async () => tokens('operador'));
  assert.equal((await store.restore()).status, 'signed_out');
  assert.equal(client.calls.length, 0);
});

test('restore com refresh vencido não chama a rede e preserva a fila do usuário', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: PAST, user: user() };
  const { store, secure, client } = setup(async () => tokens('operador'), seed);
  const asyncStorage = memory();
  await asyncStorage.setItem('reo.outbox.u-1', '[{"client_uuid":"a"}]');
  const state = await store.restore();
  assert.equal(state.status, 'signed_out');
  assert.equal(client.calls.length, 0);
  assert.ok(!secure.values.has(SESSION_KEY));
  assert.equal(asyncStorage.values.get('reo.outbox.u-1'), '[{"client_uuid":"a"}]');
});

test('logout apaga reo.session, limpa o token e não toca em reo.outbox.*', async () => {
  const { store, secure, client } = setup(async () => tokens('operador'));
  const asyncStorage = memory();
  await asyncStorage.setItem('reo.outbox.u-1', 'fila');
  await store.login('RL-1', 'x');
  await store.logout();
  assert.ok(!secure.values.has(SESSION_KEY));
  assert.equal(store.currentUser(), null);
  assert.equal(client.hooks().getAccessToken(), null);
  assert.equal(asyncStorage.values.get('reo.outbox.u-1'), 'fila');
});

test('subscribe notifica mudanças e permite cancelar', async () => {
  const { store } = setup(async () => tokens('operador'));
  const seen = [];
  const off = store.subscribe((s) => seen.push(s.status));
  await store.login('RL-1', 'x');
  off();
  await store.logout();
  assert.deepEqual(seen, ['online']);
});

test('hook refresh: rede caída lança NetworkError sem encerrar; rede de volta volta a online', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: FUTURE, user: user() };
  let net = true;
  const { store, client } = setup(async (m, p, b, o, { NetworkError }) => {
    if (net) throw new NetworkError();
    return tokens('operador', { access_token: 'acc-2' });
  }, seed);
  await store.restore(); // offline
  const hooks = client.hooks();
  await assert.rejects(hooks.refresh(), (e) => e instanceof client.NetworkError);
  assert.equal(store.getState().status, 'offline');
  net = false;
  assert.equal(await hooks.refresh(), true);
  assert.equal(store.getState().status, 'online');
  assert.equal(hooks.getAccessToken(), 'acc-2');
});

test('hook refresh: servidor rejeita devolve false e onSessionExpired encerra a sessão', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: FUTURE, user: user() };
  let reject = false;
  const { store, secure, client } = setup(async (m, p, b, o, { ApiError, NetworkError }) => {
    if (reject) throw new ApiError(401, 'invalid_token', 'x');
    throw new NetworkError();
  }, seed);
  await store.restore();
  reject = true;
  const hooks = client.hooks();
  assert.equal(await hooks.refresh(), false);
  hooks.onSessionExpired();
  await new Promise((r) => setImmediate(r)); // onSessionExpired é assíncrono (apaga o SecureStore)
  assert.equal(store.getState().status, 'signed_out');
  assert.ok(!secure.values.has(SESSION_KEY));
});

test('com o cliente real: 401 + refresh sem rede rejeita NetworkError e mantém a sessão offline', async () => {
  const secure = fakeSecureStore();
  secure.values.set(SESSION_KEY, JSON.stringify({ refresh_token: 'r', refresh_expires_at: FUTURE, user: user() }));
  let phase = 'down';
  const fakeFetch = async (url) => {
    if (url.endsWith('/auth/refresh')) {
      if (phase === 'down') throw new TypeError('Network request failed');
      return { status: 200, text: async () => JSON.stringify(tokens('operador')) };
    }
    return { status: 401, text: async () => JSON.stringify({ detail: 'Token ausente.', code: 'not_authenticated' }) };
  };
  const clientMod = load('data/api/client.ts', { '../config': { API_URL: 'http://api.test' } }, { fetch: fakeFetch });
  const store = load('data/auth-store.ts', { './api/client': clientMod, 'expo-secure-store': secure });
  assert.equal((await store.restore()).status, 'offline');
  await assert.rejects(clientMod.request('GET', '/dormentes'), (e) => e.name === 'NetworkError');
  assert.equal(store.getState().status, 'offline');
  assert.ok(secure.values.has(SESSION_KEY));
  phase = 'up';
  await assert.rejects(clientMod.request('GET', '/dormentes'), (e) => e.status === 401);
});

test('canFieldWork e canInspect por papel', () => {
  const { store } = setup(async () => tokens('operador'));
  assert.equal(store.canFieldWork('supervisor'), false);
  for (const r of ['operador', 'tecnico', 'especialista', 'admin']) assert.equal(store.canFieldWork(r), true);
  assert.equal(store.canInspect('operador'), false);
  assert.equal(store.canInspect('supervisor'), false);
  for (const r of ['tecnico', 'especialista', 'admin']) assert.equal(store.canInspect(r), true);
});

test('hook onNetwork: com sessão online, falha de rede vira offline e resposta volta a online', async () => {
  const { store, client } = setup(async () => tokens('tecnico'));
  await store.login('RL-1', 'x');
  const hooks = client.hooks();
  hooks.onNetwork(false);
  assert.equal(store.getState().status, 'offline');
  assert.equal(store.currentUser().id, 'u-1');
  hooks.onNetwork(true);
  assert.equal(store.getState().status, 'online');
  assert.equal(store.currentUser().role, 'tecnico');
});

test('hook onNetwork: sem usuário não altera signed_out', async () => {
  const { store, client } = setup(async () => tokens('tecnico'));
  client.hooks().onNetwork(false);
  assert.equal(store.getState().status, 'signed_out');
  client.hooks().onNetwork(true);
  assert.equal(store.getState().status, 'signed_out');
});

test('hook onNetwork: offline sem access token só volta a online pelo refresh', async () => {
  const seed = { refresh_token: 'ref-old', refresh_expires_at: FUTURE, user: user() };
  const { store, client } = setup(async (m, p, b, o, { NetworkError }) => { throw new NetworkError(); }, seed);
  await store.restore();
  client.hooks().onNetwork(true); // resposta 401 da API sem token não prova sessão válida
  assert.equal(store.getState().status, 'offline');
});

test('com o cliente real: NetworkError numa requisição derruba para offline e a resposta seguinte volta a online', async () => {
  const secure = fakeSecureStore();
  secure.values.set(SESSION_KEY, JSON.stringify({ refresh_token: 'r', refresh_expires_at: FUTURE, user: user() }));
  let down = false;
  const fakeFetch = async (url) => {
    if (down) throw new TypeError('Network request failed');
    if (url.endsWith('/auth/refresh')) return { status: 200, text: async () => JSON.stringify(tokens('operador')) };
    return { status: 200, text: async () => JSON.stringify({ ok: 1 }) };
  };
  const clientMod = load('data/api/client.ts', { '../config': { API_URL: 'http://api.test' } }, { fetch: fakeFetch });
  const store = load('data/auth-store.ts', { './api/client': clientMod, 'expo-secure-store': secure });
  assert.equal((await store.restore()).status, 'online');
  down = true;
  await assert.rejects(clientMod.request('GET', '/sincronizacao/status'), (e) => e.name === 'NetworkError');
  assert.equal(store.getState().status, 'offline');
  assert.equal(store.currentUser().id, 'u-1');
  down = false;
  await clientMod.request('GET', '/sincronizacao/status');
  assert.equal(store.getState().status, 'online');
});
