const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.cjs');

const labels = load('data/labels.ts', {});

test('rótulos e tons dos enums seguem o site', () => {
  assert.deepEqual({ ...labels.SLEEPER_STATUS.quarantine }, { label: 'Quarentena', tone: 'warn' });
  assert.equal(labels.label(labels.SLEEPER_STATUS, 'quarantine'), 'Quarentena');
  assert.equal(labels.CONSERVATION.fair, 'Regular');
  assert.equal(labels.MOISTURE.wet, 'Molhado');
  assert.equal(labels.OCCURRENCE_KIND.misplaced, 'Fora do lugar');
  assert.equal(labels.INSPECTION_RESULT.rejected.tone, 'danger');
});

test('valor desconhecido volta cru', () => {
  assert.equal(labels.label(labels.MOVEMENT_KIND, 'xyz'), 'xyz');
});
