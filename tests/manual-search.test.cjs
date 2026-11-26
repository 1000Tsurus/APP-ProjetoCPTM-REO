const assert = require('node:assert/strict');
const test = require('node:test');
const plain = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepEqual(plain(a), b);
const { load, memory } = require('./helpers/load.cjs');

class NetworkError extends Error {}
class ApiError extends Error {}

function setup(listSleepers, cached = []) {
  const storage = memory();
  storage.values.set('reo.cache.sleepers', JSON.stringify(cached.map((s) => ({ tag: s.rfid_tag, sleeper: s, fetchedAt: 'x' }))));
  const client = { NetworkError, ApiError, request: async () => { throw new Error('x'); } };
  const endpoints = { listSleepers, getSleeperByTag: async () => { throw new Error('x'); }, listLocations: async () => ({ items: [] }), listSpecies: async () => ({ items: [] }) };
  const cache = load('data/catalog-cache.ts', { './api/client': client, './api/endpoints': endpoints, '@react-native-async-storage/async-storage': storage });
  const search = load('data/manual-search.ts', { './api/client': client, './api/endpoints': endpoints, './catalog-cache': cache });
  return { search, cache };
}
const s = (tag, rec) => ({ rfid_tag: tag, registration_record: rec ?? null });

test('menos de 4 caracteres não chama a API', async () => {
  let calls = 0;
  const { search } = setup(async () => { calls += 1; return { items: [] }; });
  eq(await search.searchSleepers(' abc '), { items: [], offline: false });
  assert.equal(calls, 0);
});

test('online usa a API', async () => {
  let args;
  const { search } = setup(async (p) => { args = p; return { items: [s('AAAA1')] }; });
  const r = await search.searchSleepers('AAAA');
  eq(args, { q: 'AAAA', limit: 10 });
  assert.equal(r.offline, false);
  assert.equal(r.items.length, 1);
});

test('offline usa o cache e casa pela ata', async () => {
  const { search } = setup(async () => { throw new NetworkError('off'); }, [s('T1', 'ATA-77'), s('T2', null), s('ATA7', null)]);
  const r = await search.searchSleepers('ata-7');
  assert.equal(r.offline, true);
  eq(r.items.map((i) => i.rfid_tag), ['T1']);
});

test('erro que não é de rede propaga', async () => {
  const { search } = setup(async () => { throw new ApiError('boom'); });
  await assert.rejects(search.searchSleepers('abcd'), ApiError);
});

test('searchCachedSleepers respeita limit e ordem', async () => {
  const { cache } = setup(async () => ({ items: [] }), [s('X1'), s('x2'), s('X3')]);
  eq((await cache.searchCachedSleepers('x', 2)).map((i) => i.rfid_tag), ['X1', 'x2']);
});
