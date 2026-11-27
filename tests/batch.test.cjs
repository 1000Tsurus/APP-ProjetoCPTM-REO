const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.cjs');

const tagMod = load('data/tag.ts', {});
const labels = load('data/labels.ts', {});
const forms = load('data/forms.ts', { './tag': tagMod, './labels': labels });
const batch = load('data/batch.ts', { './forms': forms, './tag': tagMod });
const phrases = load('data/occurrence-phrases.ts', {});

const now = new Date('2026-11-26T12:00:00.000Z');
const U = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const A = '5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const B = '7c1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4e';
const ctx = { clientUuid: U, now };

const receive = { kind: 'receive', locationId: A, locationName: 'Pátio A' };
const transfer = { kind: 'transfer', locationId: A, locationName: 'Pátio A' };
const withdraw = { kind: 'withdraw', requisitionNumber: 'RM-1' };
const occurrence = { kind: 'occurrence', occurrenceKind: 'damage', description: 'Rachadura' };

const sleeper = (over = {}, fromCache = false) => ({
  sleeper: { id: 's1', rfid_tag: 'ABC', status: 'in_stock', current_location: null, ...over },
  fetchedAt: now.toISOString(),
  fromCache,
});
const at = (id, name = 'Outro') => ({ id, name, kind: 'warehouse', parent_id: null });
const NOT_FOUND = { notFound: true };
const OFFLINE = { offlineUnknown: true };

for (const task of [receive, transfer]) {
  test(`${task.kind}: descartado fresco bloqueia`, () => {
    const d = batch.decideRead(task, 'abc', sleeper({ status: 'discarded' }), ctx);
    assert.equal(d.outcome, 'block');
    assert.equal(d.tone, 'error');
    assert.equal(d.message, 'Dormente descartado não movimenta.');
  });

  test(`${task.kind}: mesmo local fresco pula`, () => {
    const d = batch.decideRead(task, 'abc', sleeper({ current_location: at(A) }), ctx);
    assert.equal(d.outcome, 'skip');
    assert.equal(d.tone, 'warn');
    assert.equal(d.message, 'Já está em Pátio A.');
  });

  test(`${task.kind}: sem local registra entrada`, () => {
    const d = batch.decideRead(task, 'abc', sleeper(), ctx);
    assert.equal(d.outcome, 'record');
    assert.equal(d.tone, 'ok');
    assert.equal(d.item.type, 'movement');
    assert.equal(d.item.payload.kind, 'entry');
    assert.equal(d.item.payload.to_location_id, A);
    assert.equal(d.item.rfid_tag, 'ABC');
    assert.equal(d.item.client_uuid, U);
  });

  test(`${task.kind}: outro local registra transferência`, () => {
    const d = batch.decideRead(task, 'abc', sleeper({ current_location: at(B) }), ctx);
    assert.equal(d.outcome, 'record');
    assert.equal(d.tone, 'ok');
    assert.equal(d.item.payload.kind, 'transfer');
  });

  test(`${task.kind}: tag nova registra cadastro`, () => {
    const d = batch.decideRead(task, ' abc\n', NOT_FOUND, ctx);
    assert.equal(d.outcome, 'record');
    assert.equal(d.tone, 'new');
    assert.equal(d.message, 'Dormente novo cadastrado');
    assert.equal(d.item.type, 'register');
    assert.equal(d.item.summary, 'Cadastro em Pátio A');
    assert.equal(d.item.rfid_tag, 'ABC');
  });

  test(`${task.kind}: tag fora do cache vira resolve pendente`, () => {
    const d = batch.decideRead(task, 'abc', OFFLINE, ctx);
    assert.equal(d.outcome, 'record');
    assert.equal(d.tone, 'pending');
    assert.equal(d.message, 'Tag fora do cache — confere no envio');
    assert.equal(d.item.type, 'resolve');
    assert.equal(d.item.summary, 'Leitura em Pátio A');
    assert.deepEqual({ ...d.item.payload }, {
      rfid_tag: 'ABC', to_location_id: A, location_name: 'Pátio A', occurred_at: now.toISOString(), client_uuid: U,
    });
  });
}

test('dado do cache no mesmo local registra transferência', () => {
  const d = batch.decideRead(receive, 'abc', sleeper({ current_location: at(A) }, true), ctx);
  assert.equal(d.outcome, 'record');
  assert.equal(d.item.payload.kind, 'transfer');
});

test('dado do cache descartado não bloqueia', () => {
  const d = batch.decideRead(receive, 'abc', sleeper({ status: 'discarded' }, true), ctx);
  assert.equal(d.outcome, 'record');
});

test('register leva tag, location_id, occurred_at e client_uuid', () => {
  const d = batch.decideRead(receive, 'abc', NOT_FOUND, ctx);
  assert.deepEqual({ ...d.item.payload }, {
    rfid_tag: 'ABC', location_id: A, occurred_at: now.toISOString(), client_uuid: U,
  });
});

test('tag inválida bloqueia', () => {
  const d = batch.decideRead(receive, 'a b', NOT_FOUND, ctx);
  assert.equal(d.outcome, 'block');
  assert.equal(d.message, 'Tag inválida.');
});

test('retirada: em estoque registra retirada com RM', () => {
  const d = batch.decideRead(withdraw, 'abc', sleeper(), ctx);
  assert.equal(d.outcome, 'record');
  assert.equal(d.tone, 'ok');
  assert.equal(d.item.payload.kind, 'withdrawal');
  assert.equal(d.item.payload.requisition_number, 'RM-1');
});

test('retirada: quarentena fresca bloqueia', () => {
  const d = batch.decideRead(withdraw, 'abc', sleeper({ status: 'quarantine' }), ctx);
  assert.equal(d.outcome, 'block');
  assert.equal(d.message, 'Dormente em quarentena não pode ir para a via.');
});

test('retirada: fora de estoque fresco bloqueia', () => {
  const d = batch.decideRead(withdraw, 'abc', sleeper({ status: 'withdrawn' }), ctx);
  assert.equal(d.outcome, 'block');
  assert.equal(d.message, 'Só dormente em estoque pode ser retirado.');
});

test('dado do cache fora de estoque registra retirada', () => {
  const d = batch.decideRead(withdraw, 'abc', sleeper({ status: 'withdrawn' }, true), ctx);
  assert.equal(d.outcome, 'record');
  assert.equal(d.item.payload.kind, 'withdrawal');
});

test('retirada: tag não cadastrada bloqueia', () => {
  const d = batch.decideRead(withdraw, 'abc', NOT_FOUND, ctx);
  assert.equal(d.outcome, 'block');
  assert.equal(d.message, 'Tag não cadastrada.');
});

test('retirada: fora do cache vira retirada pendente', () => {
  const d = batch.decideRead(withdraw, 'abc', OFFLINE, ctx);
  assert.equal(d.outcome, 'record');
  assert.equal(d.tone, 'pending');
  assert.equal(d.item.payload.kind, 'withdrawal');
});

test('ocorrência: encontrado registra pela tag', () => {
  const d = batch.decideRead(occurrence, 'abc', sleeper({ status: 'discarded' }), ctx);
  assert.equal(d.outcome, 'record');
  assert.equal(d.tone, 'ok');
  assert.equal(d.item.type, 'occurrence');
  assert.equal(d.item.payload.rfid_tag, 'ABC');
  assert.equal(d.item.payload.description, 'Rachadura');
});

test('ocorrência: tag não cadastrada bloqueia', () => {
  const d = batch.decideRead(occurrence, 'abc', NOT_FOUND, ctx);
  assert.equal(d.outcome, 'block');
  assert.equal(d.message, 'Tag não cadastrada.');
});

test('ocorrência: fora do cache registra pendente', () => {
  const d = batch.decideRead(occurrence, 'abc', OFFLINE, ctx);
  assert.equal(d.outcome, 'record');
  assert.equal(d.tone, 'pending');
  assert.equal(d.item.type, 'occurrence');
});

test('erro do builder vira bloqueio', () => {
  const d = batch.decideRead({ ...occurrence, description: 'ab' }, 'abc', sleeper(), ctx);
  assert.equal(d.outcome, 'block');
  assert.equal(d.message, 'Descreva a ocorrência (mínimo 3 caracteres).');
  const w = batch.decideRead({ kind: 'withdraw', requisitionNumber: '' }, 'abc', sleeper(), ctx);
  assert.equal(w.message, 'Informe a RM da retirada.');
});

test('composeDescription junta frase e texto livre', () => {
  assert.equal(phrases.composeDescription('Rachadura', ' lado norte '), 'Rachadura — lado norte');
  assert.equal(phrases.composeDescription('Rachadura', ''), 'Rachadura');
  assert.equal(phrases.composeDescription(null, ' livre '), 'livre');
  assert.equal(phrases.composeDescription(null, 'ab'), 'ab');
});

test('validateDescription exige 3 a 2000 caracteres', () => {
  assert.equal(phrases.validateDescription('ab'), 'Descreva a ocorrência (mínimo 3 caracteres).');
  assert.equal(phrases.validateDescription('abc'), null);
  assert.equal(phrases.validateDescription('x'.repeat(2001)), 'Descrição: no máximo 2000 caracteres.');
});

test('frases prontas por tipo', () => {
  assert.equal(phrases.OCCURRENCE_PHRASES.other.length, 0);
  assert.ok(phrases.OCCURRENCE_PHRASES.damage.includes('Rachadura'));
});
