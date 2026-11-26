const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

class NetworkError extends Error {}
class ApiError extends Error {
  constructor(status, code, detail) { super(detail); this.status = status; this.code = code; this.detail = detail; }
}

const plain = (v) => JSON.parse(JSON.stringify(v));

let counter = 0;
const uid = () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const LOC_A = 'loc-a';
const LOC_B = 'loc-b';
const LOCATIONS = [{ id: LOC_A, name: 'Pátio A' }, { id: LOC_B, name: 'Pátio B' }];

/** `handler(method, path, body)` faz o papel do servidor; erros lançados passam direto. */
function setup(handler, storage = memory()) {
  const calls = [];
  const call = async (method, path, body) => {
    calls.push({ method, path, body });
    return handler(method, path, body);
  };
  const common = { '@react-native-async-storage/async-storage': storage };
  const client = { request: call, NetworkError, ApiError };
  const endpoints = {
    createSleeper: async (body) => ({ status: 201, sleeper: await call('POST', '/dormentes', body) }),
    getSleeperByTag: (tag) => call('GET', `/dormentes/tag/${encodeURIComponent(tag)}`),
  };
  const outbox = load('data/outbox.ts', common);
  const incomplete = load('data/incomplete.ts', common);
  const forms = load('data/forms.ts', {
    './labels': load('data/labels.ts', {}),
    './tag': load('data/tag.ts', {}),
  });
  const reg = load('data/sync-register.ts', {
    ...common,
    './api/client': client,
    './api/endpoints': endpoints,
    './catalog-cache': { getLocations: async () => ({ items: LOCATIONS, fetchedAt: 'x' }) },
    './forms': forms,
    './incomplete': incomplete,
    './outbox': outbox,
  });
  const sync = load('data/sync.ts', {
    ...common,
    './outbox': outbox,
    './api/client': client,
    './sync-register': reg,
    './uuid': { uuidv4: uid },
  });
  return { outbox, incomplete, reg, sync, calls, storage };
}

const NOW = new Date('2026-11-26T12:00:00.000Z');
const acceptAll = async (m, p, body) => {
  if (p === '/sincronizacao/replicar') {
    return { results: body.movements.map((x, index) => ({ type: 'movement', index, client_uuid: x.client_uuid, status: 'accepted' })) };
  }
  return { id: 's-new' };
};

function registerItem(over = {}) {
  const client_uuid = over.client_uuid ?? uid();
  return {
    type: 'register', client_uuid, rfid_tag: 'TAG-1', summary: 'Cadastro',
    payload: { rfid_tag: 'TAG-1', location_id: LOC_A, occurred_at: '2026-11-26T10:00:00.000Z', client_uuid },
    ...over,
  };
}
function resolveItem(over = {}) {
  const client_uuid = over.client_uuid ?? uid();
  return {
    type: 'resolve', client_uuid, rfid_tag: 'TAG-1', summary: 'Leitura',
    payload: { rfid_tag: 'TAG-1', to_location_id: LOC_A, location_name: 'Pátio A', occurred_at: '2026-11-26T10:00:00.000Z', client_uuid },
    ...over,
  };
}
const movementItem = () => {
  const client_uuid = uid();
  return { type: 'movement', client_uuid, payload: { client_uuid }, rfid_tag: 'T', summary: 's' };
};
const sleeperAt = (loc) => ({ id: 's1', rfid_tag: 'TAG-1', current_location: loc ? { id: loc, name: 'x' } : null });

test('register cria o dormente e sai da fila', async () => {
  const { outbox, incomplete, reg, calls } = setup(acceptAll);
  await outbox.enqueue('u1', registerItem());
  const r = await reg.sendRegistrations('u1', NOW);
  assert.deepEqual(plain(r), { registered: 1, converted: 0, rejected: 0 });
  assert.equal(calls.filter((c) => c.method === 'POST' && c.path === '/dormentes').length, 1);
  assert.equal((await outbox.listOutbox('u1')).length, 0);
  assert.deepEqual(plain(await incomplete.listIncomplete('u1')).map((e) => e.tag), ['TAG-1']);
});

test('register com 409 vira movimentação', async () => {
  const { outbox, reg } = setup(async (m) => {
    if (m === 'POST') throw new ApiError(409, 'rfid_tag_taken', 'Tag já cadastrada.');
    return sleeperAt(null);
  });
  const it = registerItem();
  await outbox.enqueue('u1', it);
  const r = await reg.sendRegistrations('u1', NOW);
  assert.deepEqual(plain(r), { registered: 0, converted: 1, rejected: 0 });
  const [m] = await outbox.listOutbox('u1');
  assert.equal(m.type, 'movement');
  assert.equal(m.client_uuid, it.client_uuid);
  assert.equal(m.payload.kind, 'entry');
  assert.equal(m.payload.to_location_id, LOC_A);
  assert.equal(m.payload.client_uuid, it.client_uuid);
  assert.equal(m.payload.occurred_at, '2026-11-26T10:00:00.000Z');
  assert.equal(m.summary, 'Entrada em Pátio A');
  assert.equal(m.rfid_tag, 'TAG-1');
  assert.equal(m.hold_until, undefined);
  assert.equal(m.status, 'pending');
});

test('resolve de tag existente fora do pátio vira entrada', async () => {
  const { outbox, reg } = setup(async () => sleeperAt(null));
  await outbox.enqueue('u1', resolveItem());
  await reg.sendRegistrations('u1', NOW);
  const [m] = await outbox.listOutbox('u1');
  assert.equal(m.type, 'movement');
  assert.equal(m.payload.kind, 'entry');
});

test('resolve de tag existente em outro local vira transferência', async () => {
  const { outbox, reg } = setup(async () => sleeperAt(LOC_B));
  await outbox.enqueue('u1', resolveItem());
  await reg.sendRegistrations('u1', NOW);
  const [m] = await outbox.listOutbox('u1');
  assert.equal(m.type, 'movement');
  assert.equal(m.payload.kind, 'transfer');
  assert.equal(m.summary, 'Transferência para Pátio A');
});

test('resolve de tag existente no mesmo local fica rejeitado com same_location', async () => {
  const { outbox, reg } = setup(async () => sleeperAt(LOC_A));
  await outbox.enqueue('u1', resolveItem());
  const r = await reg.sendRegistrations('u1', NOW);
  assert.deepEqual(plain(r), { registered: 0, converted: 0, rejected: 1 });
  const [m] = await outbox.listOutbox('u1');
  assert.equal(m.status, 'rejected');
  assert.equal(m.code, 'same_location');
  assert.equal(m.reason, 'Dormente já estava neste local.');
});

test('resolve de tag desconhecida cadastra', async () => {
  const { outbox, incomplete, reg, calls } = setup(async (m) => {
    if (m === 'GET') throw new ApiError(404, 'not_found', 'Dormente não encontrado.');
    return { id: 's-new' };
  });
  const it = resolveItem();
  await outbox.enqueue('u1', it);
  const r = await reg.sendRegistrations('u1', NOW);
  assert.deepEqual(plain(r), { registered: 1, converted: 0, rejected: 0 });
  const post = calls.find((c) => c.method === 'POST');
  assert.deepEqual(plain(post.body), {
    rfid_tag: 'TAG-1', location_id: LOC_A, occurred_at: '2026-11-26T10:00:00.000Z', client_uuid: it.client_uuid,
  });
  assert.equal((await outbox.listOutbox('u1')).length, 0);
  assert.equal((await incomplete.listIncomplete('u1')).length, 1);
});

test('cadastro recusado (422) fica rejeitado e não é reenviado', async () => {
  const { outbox, sync, calls } = setup(async (m, p, body) => {
    if (p === '/dormentes') throw new ApiError(422, 'validation_error', 'Dados inválidos.');
    return acceptAll(m, p, body);
  });
  await outbox.enqueue('u1', registerItem());
  const r = await sync.syncNow('u1');
  assert.equal(r.rejected, 1);
  const [m] = await outbox.listOutbox('u1');
  assert.equal(m.status, 'rejected');
  assert.equal(m.code, 'validation_error');
  assert.equal(m.reason, 'Dados inválidos.');
  await sync.syncNow('u1');
  assert.equal(calls.filter((c) => c.path === '/dormentes').length, 1);
});

test('sem rede no cadastro devolve offline e mantém o item', async () => {
  const { outbox, reg, sync } = setup(async () => { throw new NetworkError(); });
  await outbox.enqueue('u1', registerItem());
  assert.equal(await reg.sendRegistrations('u1', NOW), 'offline');
  assert.equal(await sync.syncNow('u1'), 'offline');
  const list = await outbox.listOutbox('u1');
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'pending');
});

test('item em espera não é enviado', async () => {
  const { outbox, sync, calls } = setup(acceptAll);
  const hold = { holdMs: 60000, now: new Date() };
  await outbox.enqueue('u1', registerItem(), hold);
  await outbox.enqueue('u1', movementItem(), hold);
  const r = await sync.syncNow('u1');
  assert.equal(calls.length, 0);
  assert.equal(r.sent, 0);
  assert.equal((await outbox.listOutbox('u1')).length, 2);
});

test('cadastro roda antes do replicar', async () => {
  const { outbox, sync, calls } = setup(acceptAll);
  await outbox.enqueue('u1', movementItem());
  await outbox.enqueue('u1', registerItem());
  const r = await sync.syncNow('u1');
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['POST /dormentes', 'POST /sincronizacao/replicar']);
  assert.deepEqual(plain(r), { sent: 1, accepted: 1, rejected: 0, registered: 1 });
});

test('resolve convertido segue no mesmo syncNow para o replicar', async () => {
  const { outbox, sync, calls } = setup(async (m, p, body) => (m === 'GET' ? sleeperAt(null) : acceptAll(m, p, body)));
  await outbox.enqueue('u1', resolveItem());
  const r = await sync.syncNow('u1');
  assert.equal(r.sent, 1);
  assert.equal(calls.at(-1).path, '/sincronizacao/replicar');
  assert.equal((await outbox.listOutbox('u1')).length, 0);
});

test('lastSyncAt grava após sync bem-sucedida e não grava quando offline', async () => {
  const ok = setup(acceptAll);
  assert.equal(await ok.sync.lastSyncAt('u1'), null);
  await ok.outbox.enqueue('u1', registerItem());
  await ok.sync.syncNow('u1');
  const at = await ok.sync.lastSyncAt('u1');
  assert.ok(at && !Number.isNaN(Date.parse(at)));
  assert.ok(ok.storage.values.has('reo.sync.last.u1'));

  const off = setup(async () => { throw new NetworkError(); });
  await off.outbox.enqueue('u1', registerItem());
  assert.equal(await off.sync.syncNow('u1'), 'offline');
  assert.equal(await off.sync.lastSyncAt('u1'), null);
});

test('erro 500 no cadastro mantém o item pendente', async () => {
  const { outbox, sync } = setup(async () => { throw new ApiError(500, 'http_500', 'Erro do servidor.'); });
  await outbox.enqueue('u1', registerItem());
  await assert.rejects(sync.syncNow('u1'));
  const [m] = await outbox.listOutbox('u1');
  assert.equal(m.status, 'pending');
  assert.equal(m.type, 'register');
});

test('sync não envia item dentro de hold_until + 1000 ms', async () => {
  const { outbox, sync, calls } = setup(acceptAll);
  // hold_until venceu há 500 ms: ainda dentro da margem de 1 s.
  await outbox.enqueue('u1', movementItem(), { holdMs: 5000, now: new Date(Date.now() - 5500) });
  const r = await sync.syncNow('u1');
  assert.equal(calls.length, 0);
  assert.equal(r.sent, 0);
  // Vencido há 2 s: passa da margem e vai.
  const b = setup(acceptAll);
  await b.outbox.enqueue('u1', movementItem(), { holdMs: 5000, now: new Date(Date.now() - 7000) });
  assert.equal((await b.sync.syncNow('u1')).sent, 1);
});

test('lastSyncAt não grava quando tudo está em espera', async () => {
  const { outbox, sync } = setup(acceptAll);
  await outbox.enqueue('u1', movementItem(), { holdMs: 60000, now: new Date() });
  await sync.syncNow('u1');
  assert.equal(await sync.lastSyncAt('u1'), null);
});
