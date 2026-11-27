const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers/load.cjs');

const tag = load('data/tag.ts', {});
const protocol = load('data/reader/protocol.ts', { '../tag': tag });
const { createBluetoothReader } = load('data/reader/bluetooth.ts', { './protocol': protocol });

const flush = () => new Promise((r) => setImmediate(r));

function setup({ failConnect = false } = {}) {
  const st = { connects: [], disconnects: 0, fail: failConnect, lineFns: new Set(), stateFns: new Set(), timers: [], cancelled: 0, message: null };
  const native = {
    connect: async (a) => {
      st.connects.push(a);
      if (st.fail) throw new Error(st.message ?? 'falhou');
    },
    disconnect: async () => { st.disconnects++; },
    onLine: (fn) => { st.lineFns.add(fn); return () => st.lineFns.delete(fn); },
    onState: (fn) => { st.stateFns.add(fn); return () => st.stateFns.delete(fn); },
  };
  const schedule = (fn, ms) => {
    const t = { fn, ms, active: true };
    st.timers.push(t);
    return () => { t.active = false; st.cancelled++; };
  };
  const reader = createBluetoothReader({ native, address: 'AA:BB', schedule });
  const line = (l) => st.lineFns.forEach((f) => f(l));
  const state = (c) => st.stateFns.forEach((f) => f(c));
  const pending = () => st.timers.filter((t) => t.active);
  const fire = async () => { const t = pending()[0]; t.active = false; t.fn(); await flush(); };
  return { st, reader, line, state, pending, fire };
}

test('começa connecting, conecta no endereço e vira connected', async () => {
  const s = setup();
  assert.equal(s.reader.status(), 'connecting');
  assert.deepEqual(s.st.connects, ['AA:BB']);
  await flush();
  s.state(true);
  assert.equal(s.reader.status(), 'connected');
});

test('TAG emite a tag; MODO muda mode() e avisa onStatus; ERRO chama onReaderError', async () => {
  const s = setup();
  const tags = [], statuses = [], errors = [];
  s.reader.subscribe((t) => tags.push(t), (x) => statuses.push(x));
  s.reader.onReaderError((m) => errors.push(m));
  await flush();
  s.state(true);
  assert.equal(s.reader.mode(), null);
  s.line('TAG:04a1b2c3\r');
  s.line('MODO:GRAVACAO');
  s.line('ERRO:leitura falhou');
  assert.deepEqual(tags, ['04A1B2C3']);
  assert.equal(s.reader.mode(), 'GRAVACAO');
  assert.ok(statuses.length >= 2);
  assert.deepEqual(errors, ['leitura falhou']);
});

test('falha de connect: disconnected e backoff 1000..30000', async () => {
  const s = setup({ failConnect: true });
  await flush();
  assert.equal(s.reader.status(), 'disconnected');
  const waits = [];
  for (let i = 0; i < 8; i++) {
    waits.push(s.pending()[0].ms);
    await s.fire();
  }
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test('queda depois de conectado reconecta com 1000 e zera o backoff', async () => {
  const s = setup();
  await flush();
  s.state(true);
  s.state(false);
  assert.equal(s.reader.status(), 'disconnected');
  assert.equal(s.reader.mode(), null);
  assert.equal(s.pending()[0].ms, 1000);
});

test('reconnect cancela a espera e tenta já', async () => {
  const s = setup({ failConnect: true });
  await flush();
  assert.equal(s.pending().length, 1);
  const before = s.st.connects.length;
  await s.reader.reconnect();
  assert.equal(s.st.connects.length, before + 1);
  assert.ok(s.st.cancelled >= 1);
});

test('close cancela tudo, desconecta e não tenta mais', async () => {
  const s = setup({ failConnect: true });
  await flush();
  await s.reader.close();
  assert.equal(s.st.disconnects, 1);
  assert.equal(s.pending().length, 0);
  const n = s.st.connects.length;
  s.state(false);
  assert.equal(s.pending().length, 0);
  assert.equal(s.st.connects.length, n);
  assert.equal(s.st.lineFns.size, 0);
});

test('rejeição + onState(false) não pula a espera', async () => {
  const s = setup({ failConnect: true });
  await flush();
  assert.equal(s.pending().length, 1);
  assert.equal(s.pending()[0].ms, 1000);
  s.state(false);
  assert.equal(s.pending().length, 1);
  assert.equal(s.pending()[0].ms, 1000);
  await s.fire();
  assert.equal(s.pending()[0].ms, 2000);
});

test('linha entregue depois de close() não emite nada', async () => {
  const s = setup();
  const tags = [];
  s.reader.subscribe((t) => tags.push(t), () => {});
  await flush();
  s.state(true);
  const fns = [...s.st.lineFns];
  await s.reader.close();
  fns.forEach((f) => f('TAG:AABB'));
  assert.deepEqual(tags, []);
});

test('motivo da falha de connect chega ao onReaderError e a lastError()', async () => {
  const s = setup({ failConnect: true });
  s.st.message = 'O Bluetooth está desligado. Ligue e tente de novo.';
  const errors = [];
  s.reader.onReaderError((m) => errors.push(m));
  await s.reader.reconnect();
  assert.equal(s.reader.lastError(), 'O Bluetooth está desligado. Ligue e tente de novo.');
  assert.deepEqual(errors, ['O Bluetooth está desligado. Ligue e tente de novo.']);
  await s.fire(); // nova tentativa com a mesma mensagem
  assert.equal(errors.length, 1);
  s.st.message = 'Fora de alcance.';
  await s.fire();
  assert.deepEqual(errors.slice(1), ['Fora de alcance.']);
});

test('lastError() é limpo quando conecta', async () => {
  const s = setup({ failConnect: true });
  await flush();
  assert.equal(s.reader.lastError(), 'falhou');
  s.st.fail = false;
  await s.fire();
  s.state(true);
  assert.equal(s.reader.lastError(), null);
});

test('TAG é ignorada com a chave em GRAVACAO', async () => {
  const s = setup();
  const tags = [];
  s.reader.subscribe((t) => tags.push(t), () => {});
  await flush();
  s.state(true);
  s.line('MODO:GRAVACAO');
  s.line('TAG:04A1B2C3');
  assert.deepEqual(tags, []);
  s.line('MODO:LEITURA');
  s.line('TAG:04A1B2C3');
  assert.deepEqual(tags, ['04A1B2C3']);
});

test('reconnect com o leitor conectado não derruba o enlace', async () => {
  const s = setup();
  await flush();
  s.state(true);
  const before = s.st.connects.length;
  await s.reader.reconnect();
  assert.equal(s.st.connects.length, before);
  assert.equal(s.reader.status(), 'connected');
});
