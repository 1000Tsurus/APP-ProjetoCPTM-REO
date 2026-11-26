const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.cjs');

const tagMod = load('data/tag.ts', {});
const labels = load('data/labels.ts', {});
const forms = load('data/forms.ts', { './tag': tagMod, './labels': labels });
const batch = load('data/batch.ts', { './forms': forms, './tag': tagMod });
const session = load('data/batch-session.ts', { './batch': batch, './tag': tagMod });

const A = '5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const task = { kind: 'receive', locationId: A, locationName: 'Pátio A' };
const found = (tag, over = {}) => ({
  sleeper: { id: 's-' + tag, rfid_tag: tag, status: 'in_stock', current_location: null, ...over },
  fetchedAt: '2026-11-26T12:00:00.000Z',
  fromCache: false,
});
const json = (v) => JSON.parse(JSON.stringify(v));

function setup(over = {}) {
  const calls = { enqueue: [], undo: [], release: [], sync: 0, schedule: [], cancelled: 0 };
  let n = 0;
  const held = new Set();
  const deps = {
    userId: 'u1',
    task,
    lookup: async (tag) => found(tag),
    enqueue: async (user, item, opts) => { calls.enqueue.push({ user, item, opts }); held.add(item.client_uuid); },
    undo: async (user, id, now) => { calls.undo.push({ user, id, now }); return held.delete(id); },
    releaseHolds: async (user, ids) => { calls.release.push({ user, ids }); },
    sync: async () => { calls.sync += 1; },
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    now: () => new Date('2026-11-26T12:00:00.000Z'),
    schedule: (fn, ms) => { calls.schedule.push({ fn, ms }); return () => { calls.cancelled += 1; }; },
    ...over,
  };
  return { s: session.createBatchSession(deps), calls, held };
}

test('leitura repetida no lote é ignorada', async () => {
  const { s, calls } = setup();
  await s.read('abc');
  const again = await s.read(' ABC\n');
  assert.equal(calls.enqueue.length, 1);
  assert.equal(again.tone, 'warn');
  assert.equal(again.message, 'Já lido neste lote.');
});

test('duas leituras rápidas de tags diferentes registram as duas, em ordem', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { s, calls } = setup({ lookup: async (tag) => { if (tag === 'AAA') await gate; return found(tag); } });
  const p1 = s.read('AAA');
  const p2 = s.read('BBB');
  release();
  await Promise.all([p1, p2]);
  assert.deepEqual(json(calls.enqueue.map((c) => c.item.rfid_tag)), ['AAA', 'BBB']);
  assert.deepEqual(json(s.reads().map((r) => r.tag)), ['AAA', 'BBB']);
});

test('mesma tag lida duas vezes enquanto a primeira consulta gera um item só', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { s, calls } = setup({ lookup: async (tag) => { await gate; return found(tag); } });
  const p1 = s.read('AAA');
  const p2 = s.read('aaa');
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(calls.enqueue.length, 1);
  assert.notEqual(r1.tone, 'warn');
  assert.equal(r2.tone, 'warn');
});

test('record enfileira com espera de 5 s e agenda o sync', async () => {
  const { s, calls } = setup();
  const r = await s.read('AAA');
  assert.equal(calls.enqueue[0].opts.holdMs, 5000);
  assert.equal(calls.schedule[0].ms, 5100);
  assert.equal(r.clientUuid, calls.enqueue[0].item.client_uuid);
  await calls.schedule[0].fn();
  assert.equal(calls.sync, 1);
});

test('desfazer em espera remove e libera a tag para ler de novo', async () => {
  const { s, calls } = setup();
  const r = await s.read('AAA');
  assert.equal(await s.undo(r.clientUuid), true);
  assert.equal(s.reads()[0].undone, true);
  assert.equal(calls.undo[0].now.toISOString(), '2026-11-26T12:00:00.000Z');
  await s.read('AAA');
  assert.equal(calls.enqueue.length, 2);
});

test('desfazer depois do envio devolve false', async () => {
  const { s, held } = setup();
  const r = await s.read('AAA');
  held.clear();
  assert.equal(await s.undo(r.clientUuid), false);
  assert.equal(s.reads()[0].undone, false);
});

test('bloqueio e aviso não entram na fila', async () => {
  const lookups = { AAA: found('AAA', { status: 'discarded' }), BBB: found('BBB', { current_location: { id: A, name: 'Pátio A', kind: 'warehouse', parent_id: null } }) };
  const { s, calls } = setup({ lookup: async (tag) => lookups[tag] });
  const b = await s.read('AAA');
  const w = await s.read('BBB');
  assert.equal(b.tone, 'error');
  assert.equal(w.tone, 'warn');
  assert.equal(b.clientUuid, null);
  assert.equal(calls.enqueue.length, 0);
  assert.equal(s.reads().length, 2);
  await s.read('AAA'); // não marca como lida: é processada de novo
  assert.equal(s.reads().length, 3);
});

test('tag inválida volta erro, aparece na lista e não consulta', async () => {
  let looked = 0;
  const { s } = setup({ lookup: async (t) => { looked += 1; return found(t); } });
  const r = await s.read('a b');
  assert.deepEqual(json({ tone: r.tone, message: r.message, clientUuid: r.clientUuid }), { tone: 'error', message: 'Tag inválida.', clientUuid: null });
  assert.equal(looked, 0);
  assert.equal(s.reads().length, 1);
});

test('erro na consulta não trava a fila nem marca a tag como lida', async () => {
  let first = true;
  const { s, calls } = setup({ lookup: async (t) => { if (first) { first = false; throw new Error('x'); } return found(t); } });
  const r1 = await s.read('AAA');
  assert.equal(r1.message, 'Erro ao consultar a tag.');
  const r2 = await s.read('AAA');
  assert.equal(r2.tone, 'ok');
  assert.equal(calls.enqueue.length, 1);
});

test('finish libera as esperas e sincroniza', async () => {
  const { s, calls } = setup();
  const a = await s.read('AAA');
  const b = await s.read('BBB');
  const c = await s.read('CCC');
  await s.undo(c.clientUuid);
  await s.finish();
  assert.deepEqual(json(calls.release[0].ids), [a.clientUuid, b.clientUuid]);
  assert.equal(calls.sync, 1);
  assert.equal(calls.cancelled, 3);
});

test('subscribe avisa a cada mudança e permite cancelar', async () => {
  const { s } = setup();
  let n = 0;
  const off = s.subscribe(() => { n += 1; });
  const r = await s.read('AAA');
  await s.undo(r.clientUuid);
  assert.equal(n, 2);
  off();
  await s.read('BBB');
  assert.equal(n, 2);
});

test('batchCounts: enviada, na fila, rejeitada e desfeita', () => {
  const mk = (id, undone = false) => ({ tag: id, clientUuid: id, tone: 'ok', message: '', at: '', undone });
  const reads = [mk('sent'), mk('queued'), mk('rej'), mk('undone', true), { ...mk('x'), clientUuid: null, tone: 'error' }];
  const outbox = [{ client_uuid: 'queued', status: 'pending' }, { client_uuid: 'rej', status: 'rejected' }];
  assert.deepEqual(json(session.batchCounts(reads, outbox)), { read: 3, sent: 1, queued: 1, rejected: 1 });
});
