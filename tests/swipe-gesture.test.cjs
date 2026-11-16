const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../data/swipe-gesture.ts');
const moduleUnderTest = { exports: {} };
if (fs.existsSync(file)) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports: moduleUnderTest.exports, module: moduleUnderTest });
}
const { isDismissDrag, shouldDismiss } = moduleUnderTest.exports;

test('panel captures only deliberate horizontal drags to the right', () => {
  assert.equal(typeof isDismissDrag, 'function');
  assert.equal(isDismissDrag(24, 3), true);
  assert.equal(isDismissDrag(3, 60), false);
  assert.equal(isDismissDrag(30, 40), false);
  assert.equal(isDismissDrag(5, 1), false);
  assert.equal(isDismissDrag(-80, 2), false);
});

test('panel closes after sufficient distance or a deliberate rightward flick', () => {
  assert.equal(typeof shouldDismiss, 'function');
  assert.equal(shouldDismiss(130, 0, 400), true);
  assert.equal(shouldDismiss(48, 0.8, 400), true);
  assert.equal(shouldDismiss(20, 0.1, 400), false);
  assert.equal(shouldDismiss(3, 1, 400), false);
  assert.equal(shouldDismiss(-90, -1, 400), false);
  assert.equal(shouldDismiss(50, -0.8, 400), false);
});
