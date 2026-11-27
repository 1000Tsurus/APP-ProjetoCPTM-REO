const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

const plain = (v) => JSON.parse(JSON.stringify(v));

let counter = 0;
const uid = () => `00000000-0000-4000-9000-${String(++counter).padStart(12, '0')}`;

function setup(storage = memory()) {
  const outbox = load('data/outbox.ts', { '@react-native-async-storage/async-storage': storage });
  return { outbox, storage };
}

function item(over = {}) {
  const client_uuid = over.client_uuid ?? uid();
  return { type: 'resolve', client_uuid, payload: { client_uuid, rfid_tag: 'TAG1' }, rfid_tag: 'TAG1', summary: 'Teste', ...over };
}

const T0 = new Date('2026-11-26T10:00:00Z');

test('enqueue com holdMs grava hold_until', async () => {
  const { outbox } = setup();
  await outbox.enqueue('u1', item(), { holdMs: 5000, now: T0 });
  const [saved] = await outbox.listOutbox('u1');
  assert.equal(saved.hold_until, '2026-11-26T10:00:05.000Z');
});

test('isHeld respeita o prazo', () => {
  const { outbox } = setup();
  const held = { ...item(), status: 'pending', created_at: '', hold_until: '2026-11-26T10:00:05.000Z' };
  assert.equal(outbox.isHeld(held, new Date('2026-11-26T10:00:04Z')), true);
  assert.equal(outbox.isHeld(held, new Date('2026-11-26T10:00:05Z')), false);
  assert.equal(outbox.isHeld({ ...held, hold_until: undefined }, T0), false);
});

test('hold no passado não segura (app reaberto)', () => {
  const { outbox } = setup();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  assert.equal(outbox.isHeld({ ...item(), status: 'pending', created_at: '', hold_until: yesterday }, new Date()), false);
});

test('undo remove item em espera', async () => {
  const { outbox } = setup();
  const a = item();
  await outbox.enqueue('u1', a, { holdMs: 5000, now: T0 });
  assert.equal(await outbox.undo('u1', a.client_uuid, new Date('2026-11-26T10:00:03Z')), true);
  assert.equal((await outbox.listOutbox('u1')).length, 0);
});

test('undo depois do prazo não remove', async () => {
  const { outbox } = setup();
  const a = item();
  await outbox.enqueue('u1', a, { holdMs: 5000, now: T0 });
  assert.equal(await outbox.undo('u1', a.client_uuid, new Date('2026-11-26T10:00:06Z')), false);
  assert.equal((await outbox.listOutbox('u1')).length, 1);
});

test('undo não remove rejeitado nem uuid desconhecido', async () => {
  const storage = memory();
  const { outbox } = setup(storage);
  const a = item();
  await outbox.enqueue('u1', a, { holdMs: 5000, now: T0 });
  const raw = plain(JSON.parse(storage.values.get('reo.outbox.u1')));
  raw[0].status = 'rejected';
  storage.values.set('reo.outbox.u1', JSON.stringify(raw));
  assert.equal(await outbox.undo('u1', a.client_uuid, new Date('2026-11-26T10:00:01Z')), false);
  assert.equal(await outbox.undo('u1', 'inexistente', T0), false);
  assert.equal((await outbox.listOutbox('u1')).length, 1);
});

test('releaseHolds tira a espera só dos itens indicados', async () => {
  const { outbox } = setup();
  const a = item();
  const b = item();
  await outbox.enqueue('u1', a, { holdMs: 5000, now: T0 });
  await outbox.enqueue('u1', b, { holdMs: 5000, now: T0 });
  await outbox.releaseHolds('u1', [a.client_uuid]);
  const list = await outbox.listOutbox('u1');
  assert.equal(list.find((i) => i.client_uuid === a.client_uuid).hold_until, undefined);
  assert.ok(list.find((i) => i.client_uuid === b.client_uuid).hold_until);
});
