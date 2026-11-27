const assert = require('node:assert/strict');
const test = require('node:test');
const plain = (x) => JSON.parse(JSON.stringify(x));
const { load } = require('./helpers/load.cjs');

const { sortBonded, REO_READER_NAME } = load('data/reader/bonded.ts', {});

test('REO-Leitor vai para o topo e o resto mantém a ordem', () => {
  const list = [
    { name: 'Fone', address: 'A' },
    { name: REO_READER_NAME, address: 'B' },
    { name: 'Carro', address: 'C' },
  ];
  assert.deepEqual(plain(sortBonded(list).map((d) => d.address)), ['B', 'A', 'C']);
  assert.deepEqual(list.map((d) => d.address), ['A', 'B', 'C'], 'não altera a lista original');
});

test('sem REO-Leitor, lista inalterada', () => {
  assert.deepEqual(plain(sortBonded([{ name: 'X', address: '1' }]).map((d) => d.address)), ['1']);
  assert.deepEqual(plain(sortBonded([])), []);
});
