const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers/load.cjs');

const plain = (x) => JSON.parse(JSON.stringify(x));
const tag = load('data/tag.ts', {});
const { parseReaderLine } = load('data/reader/protocol.ts', { '../tag': tag });

test('TAG: normaliza e remove \r', () => {
  assert.deepEqual(plain(parseReaderLine('TAG:04a1b2c3\r')), { kind: 'tag', tag: '04A1B2C3' });
});

test('MODO: aceita só os três valores', () => {
  assert.deepEqual(plain(parseReaderLine('MODO:GRAVACAO')), { kind: 'mode', mode: 'GRAVACAO' });
  assert.deepEqual(plain(parseReaderLine('MODO:LEITURA')), { kind: 'mode', mode: 'LEITURA' });
  assert.deepEqual(plain(parseReaderLine('MODO:DESLIGADO')), { kind: 'mode', mode: 'DESLIGADO' });
  assert.deepEqual(plain(parseReaderLine('MODO:XYZ')), { kind: 'ignored' });
});

test('ERRO: devolve o resto da linha', () => {
  assert.deepEqual(plain(parseReaderLine('ERRO:autenticacao Timeout')), { kind: 'error', message: 'autenticacao Timeout' });
});

test('linhas para humanos e tag vazia são ignoradas', () => {
  assert.deepEqual(plain(parseReaderLine(' Especie: X')), { kind: 'ignored' });
  assert.deepEqual(plain(parseReaderLine('TAG:')), { kind: 'ignored' });
  assert.deepEqual(plain(parseReaderLine('TAG:AB CD')), { kind: 'ignored' });
  assert.deepEqual(plain(parseReaderLine('DORMENTE:a;b;c;d;e')), { kind: 'ignored' });
});
