const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const { load } = require('./helpers/load.cjs');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AZURE = 'https://reo-api.ambitiousbeach-eac3bf23.brazilsouth.azurecontainerapps.io';

test('uuidv4 gera v4 válido com crypto e sem crypto, sem repetir', () => {
  for (const extras of [{ crypto: nodeCrypto.webcrypto }, {}]) {
    const { uuidv4 } = load('data/uuid.ts', {}, extras);
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = uuidv4();
      assert.match(id, UUID_V4);
      seen.add(id);
    }
    assert.equal(seen.size, 1000);
  }
});

test('apiBaseUrl: padrão Azure, remove barra final e exige https fora do dev', () => {
  const { apiBaseUrl } = load('data/config.ts', {}, { process: { env: {} }, __DEV__: false });
  assert.equal(apiBaseUrl(undefined, false), AZURE);
  assert.equal(apiBaseUrl('', false), AZURE);
  assert.equal(apiBaseUrl('http://192.168.0.10:4000/', true), 'http://192.168.0.10:4000');
  assert.equal(apiBaseUrl('https://x.com/', false), 'https://x.com');
  assert.throws(() => apiBaseUrl('http://x', false));
});

test('API_URL é avaliado com process.env e __DEV__, e carrega sem __DEV__', () => {
  const dev = load('data/config.ts', {}, { process: { env: { EXPO_PUBLIC_API_URL: 'http://10.0.0.2:4000/' } }, __DEV__: true });
  assert.equal(dev.API_URL, 'http://10.0.0.2:4000');
  const bare = load('data/config.ts', {}, { process: { env: {} } });
  assert.equal(bare.API_URL, AZURE);
});

test('normalizeTag e isValidTag espelham a API', () => {
  const { normalizeTag, isValidTag } = load('data/tag.ts', {});
  assert.equal(normalizeTag(' e2801160600002084e5a1b21\r\n'), 'E2801160600002084E5A1B21');
  assert.equal(isValidTag('AB CD'), false);
  assert.equal(isValidTag('A'.repeat(65)), false);
  assert.equal(isValidTag(''), false);
  assert.equal(isValidTag('A'.repeat(64)), true);
  assert.equal(isValidTag('E2801160'), true);
});
