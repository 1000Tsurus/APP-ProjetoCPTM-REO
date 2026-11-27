const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.cjs');

const form = load('data/sleeper-form.ts', {});

test('comprimento: vírgula, 2 casas e maior que zero', () => {
  assert.equal(form.parseLength('2,80').value, 2.8);
  assert.equal(form.parseLength('').value, null);
  assert.ok(form.parseLength('2.801').error);
  assert.ok(form.parseLength('0').error);
  assert.ok(form.parseLength('abc').error);
});

test('ano: 1900 a 2100', () => {
  assert.equal(form.parseYear('2019').value, 2019);
  assert.ok(form.parseYear('1899').error);
  assert.ok(form.parseYear('2101').error);
  assert.ok(form.parseYear('19').error);
  assert.equal(form.parseYear(' ').value, null);
});

test('campo do erro 422 vem do último item de loc', () => {
  assert.equal(form.fieldFromErrors([{ loc: ['body', 'length_m'] }]), 'length_m');
  assert.equal(form.fieldFromErrors([{ loc: ['body', 'outro'] }]), null);
  assert.equal(form.fieldFromErrors(undefined), null);
});

const FULL = {
  registration_record: '', wood_class: '', length_m: '', treatment: '',
  supplier: '', inspection_company: '', manufacture_year: '', species_id: '',
};

test('buildPlateUpdate omite campos vazios', () => {
  const out = form.buildPlateUpdate({ ...FULL, wood_class: ' A ', supplier: '' }, true);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), { payload: { wood_class: 'A' } });
});

test('buildPlateUpdate converte comprimento com vírgula e ano', () => {
  const out = form.buildPlateUpdate({ ...FULL, length_m: '2,80', manufacture_year: '2019' }, false);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), { payload: { length_m: 2.8, manufacture_year: 2019 } });
});

test('buildPlateUpdate não envia espécie sem permissão', () => {
  const sem = form.buildPlateUpdate({ ...FULL, species_id: 'sp-1' }, false);
  assert.equal('species_id' in sem.payload, false);
  const com = form.buildPlateUpdate({ ...FULL, species_id: 'sp-1' }, true);
  assert.equal(com.payload.species_id, 'sp-1');
});

test('buildPlateUpdate devolve erro e campo do ano inválido', () => {
  const out = form.buildPlateUpdate({ ...FULL, manufacture_year: '19' }, true);
  assert.equal(out.field, 'manufacture_year');
  assert.ok(out.error);
  const len = form.buildPlateUpdate({ ...FULL, length_m: 'abc' }, true);
  assert.equal(len.field, 'length_m');
});
