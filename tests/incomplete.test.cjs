const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

const plain = (v) => JSON.parse(JSON.stringify(v));

function setup() {
  const storage = memory();
  const incomplete = load('data/incomplete.ts', { '@react-native-async-storage/async-storage': storage });
  return { incomplete, storage };
}

test('adicionar duas vezes a mesma tag deixa uma só', async () => {
  const { incomplete, storage } = setup();
  await incomplete.addIncomplete('u1', { tag: 'AAA', sleeper_id: 's1', created_at: '2026-01-01T00:00:00Z' });
  await incomplete.addIncomplete('u1', { tag: 'AAA', sleeper_id: 's1', created_at: '2026-01-02T00:00:00Z' });
  const list = await incomplete.listIncomplete('u1');
  assert.equal(list.length, 1);
  assert.ok(storage.values.has('reo.incomplete.u1'));
});

test('removeIncomplete tira a tag e listas de usuários são separadas', async () => {
  const { incomplete } = setup();
  await incomplete.addIncomplete('u1', { tag: 'AAA', sleeper_id: 's1', created_at: 'x' });
  await incomplete.addIncomplete('u1', { tag: 'BBB', sleeper_id: 's2', created_at: 'x' });
  await incomplete.addIncomplete('u2', { tag: 'CCC', sleeper_id: 's3', created_at: 'x' });
  await incomplete.removeIncomplete('u1', 'AAA');
  assert.deepEqual(plain(await incomplete.listIncomplete('u1')).map((e) => e.tag), ['BBB']);
  assert.equal((await incomplete.listIncomplete('u2')).length, 1);
});

test('valor corrompido vira lista vazia', async () => {
  const { incomplete, storage } = setup();
  storage.values.set('reo.incomplete.u1', '{ruim');
  assert.deepEqual(plain(await incomplete.listIncomplete('u1')), []);
});
