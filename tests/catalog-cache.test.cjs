const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

class ApiError extends Error {
  constructor(status, code, detail) { super(detail); this.status = status; this.code = code; this.detail = detail; }
}
class NetworkError extends Error {}

function sleeper(tag) {
  return { id: `id-${tag}`, rfid_tag: tag, status: 'in_stock' };
}

/** `behavior` decide a resposta de cada chamada: valor, ou função que lança. */
function setup(behavior) {
  const calls = [];
  const storage = memory();
  const client = {
    request: async (method, path, body) => { calls.push({ method, path, body }); return behavior(method, path, body); },
    requestWithStatus: async (method, path, body) => { calls.push({ method, path, body }); return behavior(method, path, body); },
    ApiError, NetworkError,
  };
  const endpoints = load('data/api/endpoints.ts', { './client': client });
  const cache = load('data/catalog-cache.ts', {
    './api/client': client,
    './api/endpoints': endpoints,
    '@react-native-async-storage/async-storage': storage,
  });
  return { endpoints, cache, calls, storage };
}

test('lookupSleeper online grava no cache; offline devolve do cache com fetchedAt', async () => {
  let online = true;
  const { cache } = setup(() => { if (!online) throw new NetworkError(); return sleeper('T1'); });
  const first = await cache.lookupSleeper('T1');
  assert.equal(first.fromCache, false);
  online = false;
  const second = await cache.lookupSleeper('T1');
  assert.equal(second.fromCache, true);
  assert.equal(second.sleeper.rfid_tag, 'T1');
  assert.ok(second.fetchedAt);
});

test('tag nunca vista e offline devolve offlineUnknown', async () => {
  const { cache } = setup(() => { throw new NetworkError(); });
  assert.equal((await cache.lookupSleeper('X')).offlineUnknown, true);
});

test('404 devolve notFound; outros erros da API propagam', async () => {
  let err = new ApiError(404, 'sleeper_not_found', 'x');
  const { cache } = setup(() => { throw err; });
  assert.equal((await cache.lookupSleeper('X')).notFound, true);
  err = new ApiError(500, 'http_500', 'x');
  await assert.rejects(() => cache.lookupSleeper('X'), (e) => e.status === 500);
});

test('o 201º dormente no cache tira o mais antigo', async () => {
  let online = true;
  const { cache } = setup((m, path) => {
    if (!online) throw new NetworkError();
    return sleeper(decodeURIComponent(path.split('/').pop()));
  });
  for (let i = 0; i < 201; i += 1) await cache.lookupSleeper(`T${i}`);
  online = false;
  assert.equal((await cache.lookupSleeper('T0')).offlineUnknown, true);
  assert.equal((await cache.lookupSleeper('T1')).fromCache, true);
  assert.equal((await cache.lookupSleeper('T200')).fromCache, true);
});

test('getLocations offline sem nada salvo devolve vazio; online grava e offline devolve o salvo', async () => {
  let online = false;
  const { cache, calls } = setup(() => {
    if (!online) throw new NetworkError();
    return { items: [{ id: 'l1', active: true }], total: 1, limit: 200, offset: 0 };
  });
  const empty = await cache.getLocations();
  assert.equal(empty.items.length, 0);
  assert.equal(empty.fetchedAt, null);
  online = true;
  const net = await cache.getLocations();
  assert.equal(net.items.length, 1);
  assert.ok(net.fetchedAt);
  assert.equal(calls.at(-1).path, '/locais?limit=200&active=true');
  online = false;
  const saved = await cache.getLocations();
  assert.equal(saved.items[0].id, 'l1');
  assert.equal(saved.fetchedAt, net.fetchedAt);
});

test('endpoints: caminhos e query strings', async () => {
  const { endpoints, calls } = setup((m, path) => ({ status: 201, items: [], path }));
  await endpoints.getSleeperByTag('A/B');
  assert.equal(calls.at(-1).path, '/dormentes/tag/A%2FB');
  await endpoints.listSleepers({ q: 'a b', status: 'in_stock', limit: 10 });
  assert.equal(calls.at(-1).path, '/dormentes?q=a%20b&status=in_stock&limit=10');
  await endpoints.listSleepers({});
  assert.equal(calls.at(-1).path, '/dormentes');
  await endpoints.getSleeperHistory('abc');
  assert.equal(calls.at(-1).path, '/dormentes/abc/historico');
  await endpoints.getMe();
  assert.equal(calls.at(-1).path, '/auth/me');
  await endpoints.listSpecies();
  assert.equal(calls.at(-1).path, '/especies?limit=200&active=true');
  const created = await endpoints.createSleeper({ rfid_tag: 'T', location_id: 'l' });
  assert.equal(calls.at(-1).method, 'POST');
  assert.equal(created.status, 201);
});
