const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, memory } = require('./helpers/load.cjs');

const lot = { id: 'origin', code: 'LT-001', line: 'Linha 9', location: 'Pátio', supplier: 'Fornecedor', predominantMaterial: 'Concreto', total: 2, receiptDate: '2026-01-01', notes: '', operatorId: 'op', operatorName: 'Operador', createdAt: '2026-01-01T00:00:00Z', status: 'finished' };
const initial = { id: 'initial', lotId: lot.id, sleeperNumber: 1, sleeperId: 'LT-001-D0001', operatorId: 'op', material: 'Concreto', condition: 'Bom', cracks: false, humidity: 40, residualYears: 10, step: 'photos', status: 'completed', evaluation: 'approved', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:00Z' };
function inspectionFixture() {
  const storage = memory();
  const key = 'cptm.raillog.inspections.v1';
  const seed = { version: 1, lots: [lot, { ...lot, id: 'other', code: 'LT-002', status: 'waiting' }], inspections: [initial], evidence: [{ id: 'old-photo', inspectionId: initial.id, category: 'general', uri: 'file:old.jpg', capturedAt: initial.createdAt }] };
  storage.values.set(key, JSON.stringify(seed));
  const service = { backendConfigured: false, operationalStorageKey: () => key, authorizeLot: async () => {}, requireManager: async () => { throw new Error('Backend não integrado'); } };
  return { store: load('data/inspection-store.ts', { '@react-native-async-storage/async-storage': storage, './access-service': service }), service, storage, seed };
}

test('QR resolves lots/sleepers; NFC only resolves an existing sleeper and never trusts tag JSON', async () => {
  const { store } = inspectionFixture();
  assert.equal((await store.resolveIdentifier('LT-001', 'qr')).lot.id, 'origin');
  assert.equal((await store.resolveIdentifier('raillog:lot:LT-002', 'qr')).lot.id, 'other');
  const resolved = await store.resolveIdentifier('raillog:sleeper:LT-001-D0001', 'nfc');
  assert.equal(resolved.sleeper.history[0].id, 'initial');
  assert.equal(resolved.sleeper.lot.id, 'origin');
  for (const value of ['LT-001', 'LT-999-D0001', 'LT-001-D9999', 'https://evil.test', '{"role":"manager","sleeperId":"LT-001-D0001"}']) {
    await assert.rejects(store.resolveIdentifier(value, 'nfc'));
  }
  assert.equal((await store.readStore()).inspections.length, 1);
});

test('occurrence in a finished origin lot appends history, preserves old photos and does not inflate totals', async () => {
  const { store, seed } = inspectionFixture();
  const event = await store.beginSleeperInspection(initial.sleeperId, 'new-operator');
  assert.notEqual(event.id, initial.id);
  assert.equal(event.kind, 'occurrence');
  assert.equal(event.lotId, lot.id);
  assert.equal(event.sleeperId, initial.sleeperId);
  assert.equal(event.condition, null);
  assert.equal((await store.beginSleeperInspection(initial.sleeperId, 'new-operator')).id, event.id);
  await store.saveDiagnosis(event.id, { material: 'Concreto', condition: 'Ruim', cracks: true, humidity: 70, residualYears: 0 });
  await assert.rejects(store.completeInspection(event.id, 'rejected'), /Fotografias pendentes/);
  for (const category of ['general', 'fixing', 'fissure', 'base']) await store.saveEvidence(event.id, category, `file:new-${category}.jpg`);
  await store.completeInspection(event.id, 'rejected');
  const current = await store.readStore();
  assert.equal(JSON.stringify(current.inspections.find((item) => item.id === initial.id)), JSON.stringify(seed.inspections[0]));
  assert.equal(JSON.stringify(current.evidence.find((item) => item.id === 'old-photo')), JSON.stringify(seed.evidence[0]));
  assert.equal(current.lots.length, 2);
  assert.equal(current.lots[0].status, 'finished');
  assert.equal(current.inspections.length, 2);
  assert.equal(current.evidence.length, 5);
  const metrics = store.lotMetrics(current, current.lots[0]);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.rejected, 1);
  assert.equal(metrics.approved, 0);
  assert.equal(metrics.pending, 1);
  assert.equal(metrics.progress, 50);
  await assert.rejects(store.saveDiagnosis(initial.id, { condition: 'Ruim' }));
});

test('concurrent occurrence starts resume one draft; initial batch skips occurrence drafts', async () => {
  const { store, storage } = inspectionFixture();
  const data = await store.readStore(); data.lots[0].status = 'inspection';
  await storage.setItem('cptm.raillog.inspections.v1', JSON.stringify(data));
  const [one, two] = await Promise.all([store.beginSleeperInspection(initial.sleeperId, 'op'), store.beginSleeperInspection(initial.sleeperId, 'op')]);
  assert.equal(one.id, two.id);
  const next = await store.getOrCreateCurrentInspection(lot.id, 'op');
  assert.equal(next.sleeperNumber, 2);
  assert.equal(next.kind, 'initial');
});

test('direct lot creation is blocked without backend manager authorization; authorization failures prevent writes', async () => {
  const { store, service } = inspectionFixture();
  await assert.rejects(store.createLot({ ...lot, total: 5 }, false), /Backend/);
  assert.equal((await store.readStore()).lots.length, 2);
  service.authorizeLot = async () => { throw new Error('Sem permissão'); };
  await assert.rejects(store.beginSleeperInspection(initial.sleeperId, 'op'), /Sem permissão/);
  assert.equal((await store.readStore()).inspections.length, 1);
});

test('local registration persists a pending request without password or manager privileges', async () => {
  const storage = memory();
  const service = load('data/access-service.ts', { '@react-native-async-storage/async-storage': storage }, { process: { env: {} } });
  await service.submitAccessRequest({ nomeCompleto: 'Operador Teste', matriculaOuEmail: 'RL-42', funcaoOperacional: 'Supervisão', baseLotacao: 'Pátio' }, 'never-store-this');
  const requests = await service.localRequests();
  assert.equal(requests[0].status, 'pending');
  assert.equal(requests[0].role, undefined);
  assert.ok(!JSON.stringify([...storage.values.values()]).includes('never-store-this'));
  await assert.rejects(service.requireManager(), /Backend/);
  await assert.rejects(service.decideRequest(requests[0].id, 'approved', 'Supervisão'), /Backend/);
});

test('backend role comes from verified session; revocation blocks management mutations', async () => {
  let role = 'operator'; const calls = [];
  const service = load('data/access-service.ts', { '@react-native-async-storage/async-storage': memory() }, {
    process: { env: { EXPO_PUBLIC_OPERATIONS_API_URL: 'https://operations.test' } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => url.endsWith('/auth/login') ? { accessToken: 'server-token', subject: 'server-id' } : url.endsWith('/auth/session') ? { profile: { id: 'server-id', status: 'approved', role, funcaoOperacional: 'Supervisão' } } : {} };
    },
  });
  await service.authenticate('someone', 'password');
  await assert.rejects(service.requireManager(), /Somente gerentes/);
  role = 'manager';
  await service.decideRequest('request-id', 'approved', 'Linha');
  const command = calls.find((item) => item.url.includes('/decision'));
  assert.equal(command.options.headers.Authorization, 'Bearer server-token');
  assert.equal(JSON.parse(command.options.body).role, 'operator');
  role = 'operator';
  await assert.rejects(service.changeOperationalFunction('profile-id', 'Pátio'), /Somente gerentes/);
  assert.ok(!calls.some((item) => item.options.method === 'PATCH'));
  service.clearAccessSession();
  await assert.rejects(service.requireManager(), /conta aprovada/);
});

function nfcFixture({ platform = 'android', environment = 'standalone', supported = true, enabled = true, identifier = 'raillog:sleeper:LT-001-D0001', failure } = {}) {
  let cleanups = 0;
  const manager = {
    isSupported: async () => supported, start: async () => {}, isEnabled: async () => enabled,
    requestTechnology: async () => { if (failure) throw new Error(failure); },
    getTag: async () => ({ ndefMessage: [{ tnf: 1, type: [84], payload: [...Buffer.from(identifier)] }] }),
    cancelTechnologyRequest: async () => { cleanups++; },
  };
  const module = load('data/nfc-reader.ts', {
    'expo-constants': { executionEnvironment: environment }, 'react-native': { Platform: { OS: platform } },
    'react-native-nfc-manager': { __esModule: true, default: manager, NfcTech: { Ndef: 'Ndef' }, Ndef: { TNF_WELL_KNOWN: 1, text: { decodePayload: (bytes) => Buffer.from(bytes).toString('utf8') } } },
  });
  return { module, cleanups: () => cleanups };
}
test('NFC platform/Expo Go fallbacks keep native reader unloaded', async () => {
  const web = nfcFixture({ platform: 'web' });
  await assert.rejects(web.module.readNfcIdentifier(), /QR Code/);
  assert.equal(web.cleanups(), 0);
  const go = nfcFixture({ environment: 'storeClient' });
  await assert.rejects(go.module.readNfcIdentifier(), /development build/);
  assert.equal(go.cleanups(), 0);
});
test('NFC reads stable NDEF text and cleans up after success or unknown tag', async () => {
  const reader = nfcFixture();
  assert.equal(await reader.module.readNfcIdentifier(), 'raillog:sleeper:LT-001-D0001');
  assert.equal(reader.cleanups(), 1);
  const unknown = nfcFixture({ identifier: '{"role":"manager"}' });
  await assert.rejects(unknown.module.readNfcIdentifier(), /Etiqueta desconhecida/);
  assert.equal(unknown.cleanups(), 1);
});
test('NFC reports unsupported hardware, disabled radio and denied permission', async () => {
  await assert.rejects(nfcFixture({ supported: false }).module.readNfcIdentifier(), /não possui NFC/);
  await assert.rejects(nfcFixture({ enabled: false }).module.readNfcIdentifier(), /desativado/);
  const denied = nfcFixture({ failure: 'permission denied' });
  await assert.rejects(denied.module.readNfcIdentifier(), /Permissão NFC negada/);
  assert.equal(denied.cleanups(), 1);
});
