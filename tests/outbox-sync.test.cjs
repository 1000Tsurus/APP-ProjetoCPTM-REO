const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

class NetworkError extends Error {}
class ApiError extends Error {
  constructor(status) { super('erro'); this.status = status; }
}

// Objetos criados no vm têm outro Object.prototype; normaliza antes de comparar.
const plain = (v) => JSON.parse(JSON.stringify(v));

let counter = 0;
const uid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

/** Carrega outbox + sync sobre o mesmo storage; `handler(method, path, body)` faz o papel do servidor. */
function setup(handler, storage = memory()) {
  const calls = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    return handler(method, path, body);
  };
  const common = { '@react-native-async-storage/async-storage': storage };
  const outbox = load('data/outbox.ts', common);
  const sync = load('data/sync.ts', {
    ...common,
    './outbox': outbox,
    './api/client': { request, NetworkError },
    './sync-register': { sendRegistrations: async () => ({ registered: 0, converted: 0, rejected: 0 }) },
    './uuid': { uuidv4: uid },
  });
  return { outbox, sync, calls, storage };
}

function item(type = 'movement', over = {}) {
  const client_uuid = over.client_uuid ?? uid();
  return { type, client_uuid, payload: { client_uuid, rfid_tag: 'TAG1' }, rfid_tag: 'TAG1', summary: 'Teste', ...over };
}

/** Servidor que aceita tudo. */
const acceptAll = async (m, p, body) => ({
  results: [
    ...body.movements.map((x, index) => ({ type: 'movement', index, client_uuid: x.client_uuid, status: 'accepted' })),
    ...body.inspections.map((x, index) => ({ type: 'inspection', index, client_uuid: x.client_uuid, status: 'accepted' })),
    ...body.occurrences.map((x, index) => ({ type: 'occurrence', index, client_uuid: x.client_uuid, status: 'accepted' })),
  ],
});

test('enqueue duas vezes com o mesmo client_uuid deixa um item só', async () => {
  const { outbox } = setup(acceptAll);
  const a = item();
  await outbox.enqueue('u1', a);
  await outbox.enqueue('u1', a);
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'pending');
  assert.ok(list[0].created_at);
});

test('recarregar o módulo com o mesmo storage mantém o item (app fechado)', async () => {
  const storage = memory();
  const first = setup(acceptAll, storage);
  const a = item();
  await first.outbox.enqueue('u1', a);
  const second = setup(acceptAll, storage);
  const list = await second.outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].client_uuid, a.client_uuid);
  assert.ok(storage.values.has('reo.outbox.u1'));
});

test('filas de usuários diferentes são separadas', async () => {
  const { outbox } = setup(acceptAll);
  await outbox.enqueue('u1', item());
  await outbox.enqueue('u2', item());
  await outbox.enqueue('u2', item());
  assert.equal(await outbox.pendingCount('u1'), 1);
  assert.equal(await outbox.pendingCount('u2'), 2);
});

test('subscribeOutbox avisa a cada mudança e permite cancelar', async () => {
  const { outbox } = setup(acceptAll);
  let n = 0;
  const off = outbox.subscribeOutbox(() => { n += 1; });
  await outbox.enqueue('u1', item());
  assert.equal(n, 1);
  off();
  await outbox.enqueue('u1', item());
  assert.equal(n, 1);
});

test('syncNow: accepted e duplicate saem; rejected fica com code e reason', async () => {
  const reason = 'Dormente descartado não movimenta.';
  const { outbox, sync, calls } = setup(async (m, p, body) => ({
    results: [
      { type: 'movement', index: 0, client_uuid: body.movements[0].client_uuid, status: 'accepted' },
      { type: 'movement', index: 1, client_uuid: body.movements[1].client_uuid, status: 'duplicate' },
      { type: 'movement', index: 2, client_uuid: body.movements[2].client_uuid, status: 'rejected', code: 'sleeper_discarded', reason },
    ],
  }));
  const items = [item(), item(), item()];
  for (const i of items) await outbox.enqueue('u1', i);
  const r = await sync.syncNow('u1');
  assert.deepEqual(plain(r), { sent: 3, accepted: 2, rejected: 1, registered: 0 });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/sincronizacao/replicar');
  assert.ok(calls[0].body.device_id);
  assert.deepEqual(plain(calls[0].body.inspections), []);
  assert.deepEqual(plain(calls[0].body.occurrences), []);
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].client_uuid, items[2].client_uuid);
  assert.equal(list[0].status, 'rejected');
  assert.equal(list[0].code, 'sleeper_discarded');
  assert.equal(list[0].reason, reason);
});

test('syncNow separa os tipos nas listas do corpo', async () => {
  const { outbox, sync, calls } = setup(acceptAll);
  await outbox.enqueue('u1', item('movement'));
  await outbox.enqueue('u1', item('inspection'));
  await outbox.enqueue('u1', item('occurrence'));
  await sync.syncNow('u1');
  assert.equal(calls[0].body.movements.length, 1);
  assert.equal(calls[0].body.inspections.length, 1);
  assert.equal(calls[0].body.occurrences.length, 1);
  assert.equal(await outbox.pendingCount('u1'), 0);
});

test('item sem resultado na resposta continua pendente', async () => {
  const { outbox, sync } = setup(async (m, p, body) => ({
    results: [{ type: 'movement', index: 0, client_uuid: body.movements[0].client_uuid, status: 'accepted' }],
  }));
  await outbox.enqueue('u1', item());
  await outbox.enqueue('u1', item());
  await sync.syncNow('u1');
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'pending');
});

test('NetworkError devolve offline e a fila fica igual', async () => {
  const { outbox, sync } = setup(async () => { throw new NetworkError(); });
  await outbox.enqueue('u1', item());
  assert.equal(await sync.syncNow('u1'), 'offline');
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'pending');
});

test('ApiError 500 lança e a fila fica igual', async () => {
  const { outbox, sync } = setup(async () => { throw new ApiError(500); });
  await outbox.enqueue('u1', item());
  await assert.rejects(() => sync.syncNow('u1'), ApiError);
  assert.equal(await outbox.pendingCount('u1'), 1);
  // O mutex é liberado: uma nova tentativa não devolve 'busy'.
  assert.notEqual(await sync.syncNow('u1').catch(() => 'err'), 'busy');
});

test('resposta inválida lança e a fila fica igual', async () => {
  const { outbox, sync } = setup(async () => ({ foo: 1 }));
  await outbox.enqueue('u1', item());
  await assert.rejects(() => sync.syncNow('u1'));
  assert.equal(await outbox.pendingCount('u1'), 1);
});

test('duas chamadas simultâneas: a segunda é busy e request roda uma vez', async () => {
  const { outbox, sync, calls } = setup(acceptAll);
  await outbox.enqueue('u1', item());
  const [a, b] = await Promise.all([sync.syncNow('u1'), sync.syncNow('u1')]);
  assert.deepEqual(plain(a), { sent: 1, accepted: 1, rejected: 0, registered: 0 });
  assert.equal(b, 'busy');
  assert.equal(calls.length, 1);
});

test('busy vale para qualquer usuário', async () => {
  const { outbox, sync } = setup(acceptAll);
  await outbox.enqueue('u1', item());
  await outbox.enqueue('u2', item());
  const [a, b] = await Promise.all([sync.syncNow('u1'), sync.syncNow('u2')]);
  assert.equal(typeof a, 'object');
  assert.equal(b, 'busy');
});

test('1500 pendentes viram duas chamadas (1000 + 500)', async () => {
  const { outbox, sync, calls } = setup(acceptAll);
  for (let i = 0; i < 1500; i++) await outbox.enqueue('u1', item());
  const r = await sync.syncNow('u1');
  assert.deepEqual(plain(r), { sent: 1500, accepted: 1500, rejected: 0, registered: 0 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.movements.length, 1000);
  assert.equal(calls[1].body.movements.length, 500);
});

test('falha no segundo lote mantém só o que o primeiro já confirmou', async () => {
  let n = 0;
  const { outbox, sync } = setup(async (m, p, body) => {
    n += 1;
    if (n === 2) throw new ApiError(500);
    return acceptAll(m, p, body);
  });
  for (let i = 0; i < 1001; i++) await outbox.enqueue('u1', item());
  await assert.rejects(() => sync.syncNow('u1'), ApiError);
  assert.equal(await outbox.pendingCount('u1'), 1);
});

test('rejeitados não são reenviados; discard remove só rejeitados', async () => {
  const { outbox, sync, calls } = setup(async (m, p, body) => ({
    results: [{ type: 'movement', index: 0, client_uuid: body.movements[0].client_uuid, status: 'rejected', code: 'x', reason: 'y' }],
  }));
  const rejected = item();
  await outbox.enqueue('u1', rejected);
  await sync.syncNow('u1');
  assert.equal(calls.length, 1);
  await sync.syncNow('u1');
  assert.equal(calls.length, 1);

  const pending = item();
  await outbox.enqueue('u1', pending);
  await outbox.discard('u1', pending.client_uuid);
  assert.equal((await outbox.listOutbox('u1')).length, 2);
  await outbox.discard('u1', rejected.client_uuid);
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].client_uuid, pending.client_uuid);
  assert.equal(await outbox.pendingCount('u1'), 1);
});

test('enqueue durante o sync não se perde', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let entered;
  const started = new Promise((r) => { entered = r; });
  let first = true;
  const { outbox, sync } = setup(async (m, p, body) => {
    if (first) {
      first = false;
      entered();
      await gate;
      return acceptAll(m, p, body);
    }
    return { results: [] }; // a rodada extra não confirma nada: o item novo precisa seguir na fila
  });
  await outbox.enqueue('u1', item());
  const running = sync.syncNow('u1');
  await started;
  const late = item();
  await outbox.enqueue('u1', late);
  release();
  assert.deepEqual(plain(await running), { sent: 2, accepted: 1, rejected: 0, registered: 0 });
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].client_uuid, late.client_uuid);
  assert.equal(list[0].status, 'pending');
});

test('deviceId gera uma vez e reaproveita', async () => {
  const { sync, storage } = setup(acceptAll);
  const a = await sync.deviceId();
  const b = await sync.deviceId();
  assert.equal(a, b);
  assert.equal(storage.values.get('reo.device_id'), a);
});

test('item novo durante o sync é enviado numa rodada extra (um save que recebeu busy não fica parado)', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let entered;
  const started = new Promise((r) => { entered = r; });
  let first = true;
  const { outbox, sync, calls } = setup(async (m, p, body) => {
    if (first) { first = false; entered(); await gate; }
    return acceptAll(m, p, body);
  });
  await outbox.enqueue('u1', item());
  const running = sync.syncNow('u1');
  await started;
  await outbox.enqueue('u1', item());
  assert.equal(await sync.syncNow('u1'), 'busy');
  release();
  assert.deepEqual(plain(await running), { sent: 2, accepted: 2, rejected: 0, registered: 0 });
  assert.equal(calls.length, 2);
  assert.equal(await outbox.pendingCount('u1'), 0);
});

test('rodada extra é só uma: item que entra durante ela espera o próximo sync', async () => {
  let n = 0;
  const gates = [];
  const { outbox, sync, calls } = setup(async (m, p, body) => {
    n += 1;
    if (n <= 2) await new Promise((r) => { gates.push(r); });
    return acceptAll(m, p, body);
  });
  await outbox.enqueue('u1', item());
  const running = sync.syncNow('u1');
  await new Promise((r) => setImmediate(r));
  await outbox.enqueue('u1', item());
  gates.shift()();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await outbox.enqueue('u1', item());
  gates.shift()();
  await running;
  assert.equal(calls.length, 2);
  assert.equal(await outbox.pendingCount('u1'), 1);
});

test('deviceId concorrente devolve o mesmo valor', async () => {
  const { sync, storage } = setup(acceptAll);
  const [a, b, c] = await Promise.all([sync.deviceId(), sync.deviceId(), sync.deviceId()]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(storage.values.get('reo.device_id'), a);
});

test('fila corrompida é copiada para reo.outbox.<id>.corrupt.<ISO> antes de ser recriada', async () => {
  const storage = memory();
  storage.values.set('reo.outbox.u1', '{nao-e-json');
  const { outbox } = setup(acceptAll, storage);
  await outbox.enqueue('u1', item());
  const copies = [...storage.values.keys()].filter((k) => k.startsWith('reo.outbox.u1.corrupt.'));
  assert.equal(copies.length, 1);
  assert.equal(storage.values.get(copies[0]), '{nao-e-json');
  assert.equal((await outbox.listOutbox('u1')).length, 1);
  assert.equal((await outbox.listOutbox('u1')).length, 1);
  assert.equal([...storage.values.keys()].filter((k) => k.includes('.corrupt.')).length, 1);
});

test('fila que não é array também é preservada', async () => {
  const storage = memory();
  storage.values.set('reo.outbox.u1', '{"a":1}');
  const { outbox } = setup(acceptAll, storage);
  await outbox.enqueue('u1', item());
  const copies = [...storage.values.keys()].filter((k) => k.startsWith('reo.outbox.u1.corrupt.'));
  assert.equal(copies.length, 1);
  assert.equal(storage.values.get(copies[0]), '{"a":1}');
});
