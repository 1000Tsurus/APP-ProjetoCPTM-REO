const assert = require('node:assert/strict');
const test = require('node:test');
const { load, memory } = require('./helpers/load.cjs');

function setup() {
  const storage = memory();
  const mod = load('data/recent-locations.ts', { '@react-native-async-storage/async-storage': storage });
  return { storage, ...mod };
}

test('bumpRecent põe o novo na frente, sem repetir, até 3', () => {
  const { bumpRecent } = setup();
  assert.deepEqual([...bumpRecent(['a', 'b', 'c'], 'd')], ['d', 'a', 'b']);
  assert.deepEqual([...bumpRecent(['a', 'b', 'c'], 'c')], ['c', 'a', 'b']);
});

test('rememberLocation grava por usuário e getRecentLocationIds lê; lixo vira vazio', async () => {
  const { storage, rememberLocation, getRecentLocationIds } = setup();
  await rememberLocation('u1', 'x');
  await rememberLocation('u1', 'y');
  assert.deepEqual([...(await getRecentLocationIds('u1'))], ['y', 'x']);
  assert.deepEqual([...(await getRecentLocationIds('u2'))], []);
  storage.values.set('reo.recent_locations.u3', '{ruim');
  assert.deepEqual([...(await getRecentLocationIds('u3'))], []);
});
