// Teste de integração: módulos reais de dados do app contra a API local.
// Rodar: `npm run test:api` (API em REO_API_URL, padrão http://127.0.0.1:4000).
// Credenciais: REO_LOGIN/REO_PASSWORD ou SEED_ADMIN_* do .env da API (REO_API_ENV_FILE).
// Nunca imprime senha nem tokens.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { load, memory } = require('../helpers/load.cjs');

const BASE = (process.env.REO_API_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');

// Este teste cria dormentes e registros: só roda contra API local, a menos que se autorize.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!LOCAL_HOSTS.has(new URL(BASE).hostname) && process.env.REO_API_ALLOW_REMOTE !== '1') {
  throw new Error(
    `REO_API_URL aponta para um host remoto (${new URL(BASE).hostname}). ` +
      'O teste grava dados; defina REO_API_ALLOW_REMOTE=1 se for mesmo isso.',
  );
}
const ENV_FILE = process.env.REO_API_ENV_FILE || path.join(__dirname, '..', '..', '..', 'cptm-reo-api', '.env');

/** Lê KEY=valor de um arquivo .env simples (sem expandir variáveis). */
function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // arquivo ausente: sem credenciais
  }
  return out;
}

function credentials() {
  if (process.env.REO_LOGIN && process.env.REO_PASSWORD) {
    return { login: process.env.REO_LOGIN, password: process.env.REO_PASSWORD };
  }
  const env = readEnvFile(ENV_FILE);
  if (env.SEED_ADMIN_REGISTRATION && env.SEED_ADMIN_PASSWORD) {
    return { login: env.SEED_ADMIN_REGISTRATION, password: env.SEED_ADMIN_PASSWORD };
  }
  return null;
}

async function apiUp() {
  try {
    const r = await fetch(`${BASE}/monitoramento/status`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Monta a pilha real do app sobre storages em memória; `net.offline` faz o fetch falhar. */
function buildStack() {
  const net = { offline: false };
  const asyncStorage = memory();
  const secure = memory();
  const secureStore = {
    getItemAsync: secure.getItem,
    setItemAsync: secure.setItem,
    deleteItemAsync: async (k) => { secure.values.delete(k); },
  };
  const fetchImpl = (...args) => (net.offline ? Promise.reject(new TypeError('network down')) : fetch(...args));
  const extras = {
    fetch: fetchImpl,
    process: { env: { EXPO_PUBLIC_API_URL: BASE } },
    __DEV__: true,
    globalThis: { crypto: require('node:crypto').webcrypto },
  };
  const L = (file, mods) => load(file, mods, extras);

  const config = L('data/config.ts', {});
  const uuid = L('data/uuid.ts', {});
  const tag = L('data/tag.ts', {});
  const client = L('data/api/client.ts', { '../config': config });
  const endpoints = L('data/api/endpoints.ts', { './client': client });
  const authStore = L('data/auth-store.ts', { 'expo-secure-store': secureStore, './api/client': client });
  const outbox = L('data/outbox.ts', { '@react-native-async-storage/async-storage': asyncStorage });
  const sync = L('data/sync.ts', {
    '@react-native-async-storage/async-storage': asyncStorage,
    './api/client': client, './outbox': outbox, './uuid': uuid,
  });
  const catalog = L('data/catalog-cache.ts', {
    '@react-native-async-storage/async-storage': asyncStorage,
    './api/client': client, './api/endpoints': endpoints,
  });
  const labels = L('data/labels.ts', {});
  const forms = L('data/forms.ts', { './labels': labels, './tag': tag });
  return { net, client, endpoints, authStore, outbox, sync, catalog, forms, tag, uuid };
}

const creds = credentials();

test('integração com a API local', async (t) => {
  if (!(await apiUp())) return t.skip(`API fora do ar em ${BASE}`);
  if (!creds) return t.skip(`sem credenciais (defina REO_LOGIN/REO_PASSWORD ou ${ENV_FILE})`);

  const s = buildStack();
  const run = `IT-${Date.now()}`;
  const tagCode = `${run}-A`;
  const now = () => new Date();
  let user, warehouse, street, sleeper;

  await t.test('1. login do admin e catálogos', async () => {
    const state = await s.authStore.login(creds.login, creds.password);
    assert.equal(state.status, 'online');
    user = state.user;
    await s.catalog.refreshCatalogs();
    const species = await s.catalog.getSpecies();
    const locations = await s.catalog.getLocations();
    assert.ok(species.items.length > 0, 'espécies vazias');
    assert.ok(locations.items.length >= 2, 'locais insuficientes');
    warehouse = locations.items.find((l) => l.kind === 'warehouse');
    street = locations.items.find((l) => l.kind === 'street');
    assert.ok(warehouse && street, 'precisa de um galpão e uma rua');
  });

  await t.test('2. cadastro de dormente e idempotência por client_uuid', async () => {
    const body = { rfid_tag: tagCode, location_id: warehouse.id, client_uuid: s.uuid.uuidv4() };
    const first = await s.endpoints.createSleeper(body);
    assert.equal(first.status, 201);
    sleeper = first.sleeper;
    assert.equal(sleeper.rfid_tag, tagCode);
    const again = await s.endpoints.createSleeper(body);
    assert.equal(again.status, 200);
    assert.equal(again.sleeper.id, sleeper.id);
  });

  await t.test('3. busca por tag em minúsculas e com espaços', async () => {
    const raw = `  ${tagCode.toLowerCase()} \r\n`;
    const found = await s.catalog.lookupSleeper(s.tag.normalizeTag(raw));
    assert.ok(found.sleeper, 'dormente não encontrado');
    assert.equal(found.sleeper.id, sleeper.id);
    assert.equal(found.fromCache, false);
  });

  await t.test('4. transferência pela fila: sync aceita e aparece no histórico', async () => {
    const clientUuid = s.uuid.uuidv4();
    const built = s.forms.buildMovement({
      tag: tagCode, kind: 'transfer', toLocationId: street.id, toLocationName: street.name,
      clientUuid, now: now(),
    });
    assert.ok(built.payload, built.error);
    await s.outbox.enqueue(user.id, {
      type: 'movement', client_uuid: clientUuid, payload: built.payload, rfid_tag: tagCode, summary: built.summary,
    });
    assert.deepEqual(plain(await s.sync.syncNow(user.id)), { sent: 1, accepted: 1, rejected: 0 });
    assert.equal((await s.outbox.listOutbox(user.id)).length, 0);
    const history = await s.endpoints.getSleeperHistory(sleeper.id);
    assert.ok(history.items.some(
      (e) => e.type === 'movement' && e.movement.client_uuid === clientUuid && e.movement.kind === 'transfer',
    ));
  });

  await t.test('5. offline: item espera e sai no sync; reenvio não duplica', async () => {
    const clientUuid = s.uuid.uuidv4();
    const built = s.forms.buildInspection({
      tag: tagCode, startedAt: new Date(Date.now() - 5000), now: now(), conservation: 'good',
      hasCracks: false, biologicalAttack: false, moisture: 'dry', result: 'approved', clientUuid,
    });
    assert.ok(built.payload, built.error);
    const item = {
      type: 'inspection', client_uuid: clientUuid, payload: built.payload, rfid_tag: tagCode, summary: built.summary,
    };

    s.net.offline = true;
    await s.outbox.enqueue(user.id, item);
    assert.equal(await s.sync.syncNow(user.id), 'offline');
    const pending = await s.outbox.listOutbox(user.id);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].status, 'pending');

    s.net.offline = false;
    assert.deepEqual(plain(await s.sync.syncNow(user.id)), { sent: 1, accepted: 1, rejected: 0 });
    assert.equal((await s.outbox.listOutbox(user.id)).length, 0);

    // Mesmo client_uuid de novo: o servidor responde duplicate e o item sai da fila.
    await s.outbox.enqueue(user.id, item);
    assert.deepEqual(plain(await s.sync.syncNow(user.id)), { sent: 1, accepted: 1, rejected: 0 });
    assert.equal((await s.outbox.listOutbox(user.id)).length, 0);
    const history = await s.endpoints.getSleeperHistory(sleeper.id);
    const same = history.items.filter((e) => e.type === 'inspection' && e.inspection.client_uuid === clientUuid);
    assert.equal(same.length, 1);
  });

  await t.test('6. regras: retirada sem RM, tag inexistente rejeitada', async () => {
    const noRm = s.forms.buildMovement({ tag: tagCode, kind: 'withdrawal', clientUuid: s.uuid.uuidv4(), now: now() });
    assert.ok(noRm.error);
    assert.equal(noRm.payload, undefined);

    const clientUuid = s.uuid.uuidv4();
    const ghost = `${run}-NAOEXISTE`;
    const built = s.forms.buildMovement({
      tag: ghost, kind: 'withdrawal', requisitionNumber: 'RM-IT', clientUuid, now: now(),
    });
    assert.ok(built.payload, built.error);
    await s.outbox.enqueue(user.id, {
      type: 'movement', client_uuid: clientUuid, payload: built.payload, rfid_tag: ghost, summary: built.summary,
    });
    assert.deepEqual(plain(await s.sync.syncNow(user.id)), { sent: 1, accepted: 0, rejected: 1 });
    const list = await s.outbox.listOutbox(user.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'rejected');
    assert.equal(list[0].code, 'sleeper_not_found');
    await s.outbox.discard(user.id, clientUuid);
    assert.equal((await s.outbox.listOutbox(user.id)).length, 0);
  });

  await t.test('7. restore: offline mantém o usuário; com rede volta online', async () => {
    s.net.offline = true;
    const off = await s.authStore.restore();
    assert.equal(off.status, 'offline');
    assert.equal(off.user.id, user.id);
    s.net.offline = false;
    const on = await s.authStore.restore();
    assert.equal(on.status, 'online');
    assert.equal(on.user.id, user.id);
  });
});
