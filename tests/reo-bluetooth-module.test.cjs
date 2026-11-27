const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers/load.cjs');

function rn({ version = 33, results = {} } = {}) {
  const asked = [];
  return {
    asked,
    Platform: { OS: 'android', Version: version },
    PermissionsAndroid: {
      PERMISSIONS: { BLUETOOTH_CONNECT: 'connect', BLUETOOTH_SCAN: 'scan' },
      RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
      requestMultiple: async (perms) => {
        asked.push(...perms);
        return Object.fromEntries(perms.map((p) => [p, results[p] ?? 'granted']));
      },
    },
  };
}

const loadIndex = (native, reactNative = rn()) =>
  load('modules/reo-bluetooth/index.ts', {
    'react-native': reactNative,
    './src/ReoBluetoothModule': { __esModule: true, default: native },
  });

test('sem módulo nativo: indisponível, lista vazia, connect rejeita', async () => {
  const m = loadIndex(null);
  assert.equal(m.isAvailable(), false);
  assert.equal((await m.listBonded()).length, 0); // array de outro contexto (vm): compara pelo tamanho
  assert.equal(await m.requestPermissions(), false);
  await assert.rejects(m.nativeSerial.connect('AA:BB'), /Bluetooth indisponível neste app\./);
  await m.nativeSerial.disconnect();
  m.nativeSerial.onLine(() => {})();
  m.nativeSerial.onState(() => {})();
});

test('com módulo nativo: repassa chamadas e eventos', async () => {
  const listeners = { onLine: new Set(), onState: new Set() };
  const calls = [];
  const native = {
    listBonded: async () => [{ address: 'AA:BB', name: 'REO-Leitor' }],
    connect: async (a) => { calls.push(['connect', a]); },
    disconnect: async () => { calls.push(['disconnect']); },
    addListener: (event, fn) => {
      listeners[event].add(fn);
      return { remove: () => listeners[event].delete(fn) };
    },
  };
  const m = loadIndex(native);
  assert.equal(m.isAvailable(), true);
  assert.deepEqual(await m.listBonded(), [{ address: 'AA:BB', name: 'REO-Leitor' }]);
  await m.nativeSerial.connect('AA:BB');
  await m.nativeSerial.disconnect();
  assert.deepEqual(calls, [['connect', 'AA:BB'], ['disconnect']]);

  const lines = [];
  const states = [];
  const offLine = m.nativeSerial.onLine((l) => lines.push(l));
  const offState = m.nativeSerial.onState((c) => states.push(c));
  listeners.onLine.forEach((f) => f({ line: 'TAG:04A1B2C3' }));
  listeners.onState.forEach((f) => f({ connected: true }));
  offLine();
  offState();
  listeners.onLine.forEach((f) => f({ line: 'TAG:FFFFFFFF' }));
  assert.deepEqual(lines, ['TAG:04A1B2C3']);
  assert.deepEqual(states, [true]);
  assert.equal(listeners.onLine.size, 0);
  assert.equal(listeners.onState.size, 0);
});

test('permissões: Android 12+ pede CONNECT e SCAN; antes disso não pede', async () => {
  const native = { addListener: () => ({ remove() {} }) };
  const r12 = rn({ version: 31 });
  assert.equal(await loadIndex(native, r12).requestPermissions(), true);
  assert.deepEqual(r12.asked, ['connect', 'scan']);

  const negado = rn({ version: 33, results: { scan: 'denied' } });
  assert.equal(await loadIndex(native, negado).requestPermissions(), false);

  const r11 = rn({ version: 30 });
  assert.equal(await loadIndex(native, r11).requestPermissions(), true);
  assert.deepEqual(r11.asked, []);
});
