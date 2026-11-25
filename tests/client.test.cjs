const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers/load.cjs');

function res(status, body, raw) {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

function setup(responses, { immediateTimeout = false, tokens = ['tok1'] } = {}) {
  const calls = [];
  let refreshCalls = 0;
  let expired = 0;
  let tokenIndex = 0;
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (typeof next === 'function') return next(init);
    return next;
  };
  const extras = { fetch: fakeFetch };
  if (immediateTimeout) extras.setTimeout = (fn) => { fn(); return 0; };
  const mod = load('data/api/client.ts', { '../config': { API_URL: 'http://api.test' } }, extras);
  mod.configureClient({
    getAccessToken: () => tokens[Math.min(tokenIndex, tokens.length - 1)] ?? null,
    refresh: async () => { refreshCalls += 1; tokenIndex += 1; await Promise.resolve(); return true; },
    onSessionExpired: () => { expired += 1; },
  });
  return { mod, calls, refreshCount: () => refreshCalls, expiredCount: () => expired };
}

test('401 chama refresh uma vez, repete com o token novo e devolve o dado', async () => {
  const { mod, calls, refreshCount, expiredCount } = setup(
    [res(401, { detail: 'Token expirado.', code: 'token_expired' }), res(200, { ok: 1 })],
    { tokens: ['velho', 'novo'] },
  );
  const data = await mod.request('GET', '/auth/me');
  assert.equal(data.ok, 1);
  assert.equal(refreshCount(), 1);
  assert.equal(expiredCount(), 0);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer velho');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer novo');
  assert.equal(calls[0].url, 'http://api.test/auth/me');
});

test('segundo 401 chama onSessionExpired e lança ApiError 401', async () => {
  const { mod, expiredCount } = setup([
    res(401, { detail: 'x', code: 'invalid_token' }),
    res(401, { detail: 'Sessão inválida.', code: 'invalid_token' }),
  ]);
  await assert.rejects(mod.request('GET', '/auth/me'), (e) => e instanceof mod.ApiError && e.status === 401);
  assert.equal(expiredCount(), 1);
});

test('refresh devolvendo false encerra a sessão sem repetir', async () => {
  const { mod, calls, expiredCount } = setup([res(401, { detail: 'x', code: 'c' })]);
  mod.configureClient({ getAccessToken: () => 't', refresh: async () => false, onSessionExpired: () => { mod.__expired = true; } });
  await assert.rejects(mod.request('GET', '/dormentes'), (e) => e.status === 401);
  assert.equal(mod.__expired, true);
  assert.equal(calls.length, 1);
  assert.equal(expiredCount(), 0);
});

test('401 concorrentes compartilham um único refresh', async () => {
  const { mod, refreshCount } = setup([
    res(401, { detail: 'x', code: 'c' }),
    res(401, { detail: 'x', code: 'c' }),
    res(200, { n: 1 }),
    res(200, { n: 2 }),
  ]);
  const [a, b] = await Promise.all([mod.request('GET', '/a'), mod.request('GET', '/b')]);
  assert.ok(a && b);
  assert.equal(refreshCount(), 1);
});

test('retryOn401 false não tenta refresh', async () => {
  const { mod, refreshCount } = setup([res(401, { detail: 'Credenciais inválidas.', code: 'invalid_credentials' })]);
  await assert.rejects(mod.request('POST', '/auth/login', {}, { auth: false, retryOn401: false }), (e) => e.code === 'invalid_credentials');
  assert.equal(refreshCount(), 0);
});

test('409 vira ApiError com code e detail', async () => {
  const { mod } = setup([res(409, { detail: 'Tag RFID já cadastrada.', code: 'rfid_tag_taken' })]);
  await assert.rejects(mod.request('POST', '/dormentes', {}), (e) => {
    assert.ok(e instanceof mod.ApiError);
    assert.equal(e.status, 409);
    assert.equal(e.code, 'rfid_tag_taken');
    assert.equal(e.detail, 'Tag RFID já cadastrada.');
    return true;
  });
});

test('422 preserva errors[]', async () => {
  const errors = [{ loc: ['body', 'rfid_tag'], msg: 'inválida' }];
  const { mod } = setup([res(422, { detail: 'Dados inválidos.', code: 'validation_error', errors })]);
  await assert.rejects(mod.request('POST', '/dormentes', {}), (e) => e.errors[0].loc[1] === 'rfid_tag');
});

test('fetch rejeitando vira NetworkError', async () => {
  const { mod } = setup([() => { throw new TypeError('Network request failed'); }]);
  await assert.rejects(mod.request('GET', '/dormentes'), (e) => e instanceof mod.NetworkError);
});

test('estouro do timeout (AbortController) vira NetworkError', async () => {
  const hang = (init) => new Promise((_, reject) => {
    if (init.signal.aborted) reject(new Error('aborted'));
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const { mod } = setup([hang], { immediateTimeout: true });
  await assert.rejects(mod.request('GET', '/dormentes'), (e) => e instanceof mod.NetworkError);
});

test('auth false não manda Authorization; com token manda Bearer', async () => {
  const { mod, calls } = setup([res(200, {}), res(200, {})]);
  await mod.request('POST', '/auth/login', { a: 1 }, { auth: false });
  await mod.request('GET', '/auth/me');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, '{"a":1}');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok1');
  assert.equal(calls[1].init.body, undefined);
});

test('corpo de erro não-JSON vira http_<status> com detail genérico em PT', async () => {
  const { mod } = setup([res(502, undefined, '<html>Bad Gateway</html>')]);
  await assert.rejects(mod.request('GET', '/dormentes'), (e) => {
    assert.equal(e.code, 'http_502');
    assert.match(e.detail, /servidor/i);
    return true;
  });
});

test('requestWithStatus devolve status e dado (200 ou 201)', async () => {
  const { mod } = setup([res(201, { id: 'x' })]);
  const out = await mod.requestWithStatus('POST', '/dormentes', {});
  assert.equal(out.status, 201);
  assert.equal(out.data.id, 'x');
});

test('errorMessage traduz os erros', async () => {
  const { mod } = setup([]);
  assert.equal(mod.errorMessage(new mod.ApiError(403, 'forbidden', 'Sem permissão.')), 'Seu papel não permite esta ação.');
  assert.equal(mod.errorMessage(new mod.ApiError(409, 'rfid_tag_taken', 'Tag RFID já cadastrada.')), 'Tag RFID já cadastrada.');
  assert.equal(mod.errorMessage(new mod.NetworkError()), 'Sem conexão com o servidor.');
  assert.equal(mod.errorMessage(new Error('x')), 'Erro inesperado.');
});

test('onNetwork: false em falha de rede e true em qualquer resposta HTTP', async () => {
  const seen = [];
  let n = 0;
  const mod = load('data/api/client.ts', { '../config': { API_URL: 'http://api.test' } }, {
    fetch: async () => {
      n += 1;
      if (n === 1) throw new TypeError('x');
      return n === 2 ? res(500, { detail: 'd', code: 'c' }) : res(200, { ok: 1 });
    },
  });
  mod.configureClient({ getAccessToken: () => 't', refresh: async () => false, onSessionExpired: () => {}, onNetwork: (ok) => seen.push(ok) });
  await assert.rejects(mod.request('GET', '/a'), (e) => e.name === 'NetworkError');
  await assert.rejects(mod.request('GET', '/a'), (e) => e.status === 500);
  await mod.request('GET', '/a');
  assert.deepEqual(seen, [false, true, true]);
});
