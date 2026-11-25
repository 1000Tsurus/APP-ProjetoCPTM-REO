const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load.cjs');

const tagMod = load('data/tag.ts', {});
const labels = load('data/labels.ts', {});
const forms = load('data/forms.ts', { './tag': tagMod, './labels': labels });

const now = new Date('2026-11-25T12:00:00.000Z');
const U = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const LOC = '5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

test('retirada exige RM e não leva destino', () => {
  const sem = forms.buildMovement({ tag: 'abc', kind: 'withdrawal', clientUuid: U, now });
  assert.equal(sem.error, 'Informe a RM da retirada.');
  const ok = forms.buildMovement({ tag: ' abc\n', kind: 'withdrawal', requisitionNumber: ' RM-1 ', toLocationId: LOC, clientUuid: U, now });
  assert.equal(ok.error, undefined);
  assert.equal(ok.payload.rfid_tag, 'ABC');
  assert.equal(ok.payload.requisition_number, 'RM-1');
  assert.equal(ok.payload.to_location_id, undefined);
  assert.equal(ok.payload.occurred_at, now.toISOString());
  assert.equal(ok.payload.client_uuid, U);
  assert.equal(ok.summary, 'Retirada (RM RM-1)');
});

test('entrada e transferência exigem destino', () => {
  for (const kind of ['entry', 'transfer']) {
    assert.equal(forms.buildMovement({ tag: 'A', kind, clientUuid: U, now }).error, 'Escolha o local de destino.');
  }
  const ok = forms.buildMovement({ tag: 'A', kind: 'transfer', toLocationId: LOC, toLocationName: 'Pátio X', notes: ' ', clientUuid: U, now });
  assert.equal(ok.payload.to_location_id, LOC);
  assert.equal(ok.payload.notes, undefined);
  assert.equal(ok.summary, 'Transferência para Pátio X');
  const entry = forms.buildMovement({ tag: 'A', kind: 'entry', toLocationId: LOC, toLocationName: 'Pátio X', clientUuid: U, now });
  assert.equal(entry.summary, 'Entrada em Pátio X');
});

test('observação de movimentação respeita 2000 caracteres', () => {
  const r = forms.buildMovement({ tag: 'A', kind: 'transfer', toLocationId: LOC, notes: 'x'.repeat(2001), clientUuid: U, now });
  assert.ok(r.error);
});

const insp = (over = {}) => ({
  tag: 'a', startedAt: new Date(now.getTime() - 95000), now, conservation: 'good', hasCracks: false,
  biologicalAttack: false, moisture: 'dry', result: 'approved', clientUuid: U, ...over,
});

test('inspeção: duração em segundos e campos da API', () => {
  const r = forms.buildInspection(insp({ estimatedLifeYears: 8, speciesConfirmed: true, notes: 'ok' }));
  assert.equal(r.error, undefined);
  assert.equal(r.payload.duration_seconds, 95);
  assert.equal(r.payload.inspected_at, now.toISOString());
  assert.equal(r.payload.rfid_tag, 'A');
  assert.equal(r.payload.estimated_life_years, 8);
  assert.equal(r.payload.species_confirmed, true);
  assert.equal(r.payload.species_corrected_id, undefined);
  assert.equal(r.summary, 'Inspeção — Aprovada');
});

test('inspeção: duração limitada a 86400 s', () => {
  const r = forms.buildInspection(insp({ startedAt: new Date(now.getTime() - 200000 * 1000) }));
  assert.equal(r.payload.duration_seconds, 86400);
});

test('inspeção: vida útil fora de 0 a 100 é erro', () => {
  assert.ok(forms.buildInspection(insp({ estimatedLifeYears: 101 })).error);
  assert.ok(forms.buildInspection(insp({ estimatedLifeYears: -1 })).error);
  assert.ok(forms.buildInspection(insp({ estimatedLifeYears: 2.5 })).error);
  assert.equal(forms.buildInspection(insp({ estimatedLifeYears: 0 })).error, undefined);
});

test('inspeção: espécie não confirmada exige a correta', () => {
  assert.ok(forms.buildInspection(insp({ speciesConfirmed: false })).error);
  const r = forms.buildInspection(insp({ speciesConfirmed: false, speciesCorrectedId: LOC }));
  assert.equal(r.payload.species_confirmed, false);
  assert.equal(r.payload.species_corrected_id, LOC);
  // Confirmada ignora qualquer correção (API recusa as duas juntas).
  const c = forms.buildInspection(insp({ speciesConfirmed: true, speciesCorrectedId: LOC }));
  assert.equal(c.payload.species_corrected_id, undefined);
});

test('inspeção: observações até 4000 caracteres e reprovada no resumo', () => {
  assert.ok(forms.buildInspection(insp({ notes: 'x'.repeat(4001) })).error);
  assert.equal(forms.buildInspection(insp({ result: 'rejected' })).summary, 'Inspeção — Reprovada');
});

test('ocorrência: precisa de tag ou local e descrição de 3 a 2000', () => {
  const base = { kind: 'damage', description: 'Rachado', clientUuid: U, now };
  assert.ok(forms.buildOccurrence(base).error);
  assert.ok(forms.buildOccurrence({ ...base, tag: 'a', description: 'ab' }).error);
  assert.ok(forms.buildOccurrence({ ...base, tag: 'a', description: 'x'.repeat(2001) }).error);
  const t = forms.buildOccurrence({ ...base, tag: ' a ' });
  assert.equal(t.payload.rfid_tag, 'A');
  assert.equal(t.payload.location_id, undefined);
  assert.equal(t.payload.occurred_at, now.toISOString());
  assert.equal(t.summary, 'Ocorrência — Dano');
  const l = forms.buildOccurrence({ ...base, locationId: LOC });
  assert.equal(l.payload.rfid_tag, undefined);
  assert.equal(l.payload.location_id, LOC);
});
