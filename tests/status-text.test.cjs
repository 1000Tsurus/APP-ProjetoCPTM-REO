const assert = require('node:assert/strict');
const test = require('node:test');
const plain = (x) => JSON.parse(JSON.stringify(x));
const eq = (a, b) => assert.deepEqual(plain(a), b);
const { load } = require('./helpers/load.cjs');

const { syncStatusText, readerStatusText } = load('data/status-text.ts', {});
const now = new Date();
const at = new Date(2026, 10, 26, 9, 5).toISOString();
const base = { pending: 0, rejected: 0, offline: false, syncing: false, lastOkAt: at, now };

test('rejeitados têm prioridade, com pendentes', () => {
  eq(syncStatusText({ ...base, rejected: 1, offline: true }), { text: '1 rejeitado', tone: 'error' });
  eq(syncStatusText({ ...base, rejected: 3, pending: 1 }), { text: '3 rejeitados · 1 pendente', tone: 'error' });
  assert.equal(syncStatusText({ ...base, rejected: 2, pending: 4 }).text, '2 rejeitados · 4 pendentes');
});

test('offline', () => {
  eq(syncStatusText({ ...base, offline: true, pending: 3 }), { text: 'Sem conexão · 3 pendentes', tone: 'warn' });
  assert.equal(syncStatusText({ ...base, offline: true }).text, 'Sem conexão');
});

test('enviando', () => {
  eq(syncStatusText({ ...base, syncing: true, pending: 2 }), { text: 'Enviando…', tone: 'ok' });
});

test('pendentes', () => {
  eq(syncStatusText({ ...base, pending: 5 }), { text: '5 pendentes · enviado 09:05', tone: 'warn' });
  assert.equal(syncStatusText({ ...base, pending: 1 }).text, '1 pendente · enviado 09:05');
  assert.equal(syncStatusText({ ...base, pending: 2, lastOkAt: null }).text, '2 pendentes · nunca enviado');
});

test('tudo enviado', () => {
  eq(syncStatusText(base), { text: 'Tudo enviado · 09:05', tone: 'ok' });
  assert.equal(syncStatusText({ ...base, lastOkAt: null }).text, 'Tudo enviado');
});

test('readerStatusText', () => {
  assert.equal(readerStatusText('connected'), '● Conectado');
  assert.equal(readerStatusText('disconnected'), '○ Desconectado');
  assert.equal(readerStatusText('connecting'), 'Conectando…');
  assert.equal(readerStatusText('none'), 'Teclado');
});

test('readerStatusText com modo da chave', () => {
  assert.equal(readerStatusText('connected', 'GRAVACAO'), '● Conectado · chave fora de leitura');
  assert.equal(readerStatusText('connected', 'DESLIGADO'), '● Conectado · chave fora de leitura');
  assert.equal(readerStatusText('connected', 'LEITURA'), '● Conectado');
  assert.equal(readerStatusText('connected', null), '● Conectado');
  assert.equal(readerStatusText('disconnected', 'GRAVACAO'), '○ Desconectado');
});
