const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers/load.cjs');

const tag = load('data/tag.ts', {});
const { createKeyboardReader } = load('data/reader/keyboard.ts', { '../tag': tag });

test('teclado: normaliza e emite; texto inválido é ignorado', () => {
  const r = createKeyboardReader();
  const got = [];
  const unsub = r.subscribe((t) => got.push(t), () => {});
  r.push(' e280ab\n');
  r.push('a b');
  r.push('   ');
  assert.deepEqual(got, ['E280AB']);
  unsub();
  r.push('zz');
  assert.deepEqual(got, ['E280AB']);
});

test('teclado: status none e reconnect não faz nada', async () => {
  const r = createKeyboardReader();
  assert.equal(r.status(), 'none');
  await r.reconnect();
});
