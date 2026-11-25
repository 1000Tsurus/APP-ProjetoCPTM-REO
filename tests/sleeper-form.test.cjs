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
