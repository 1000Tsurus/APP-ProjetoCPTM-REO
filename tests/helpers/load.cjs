const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules, extras = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    if (!(name in modules)) throw new Error(`Unexpected module: ${name}`);
    return modules[name];
  }, setTimeout, clearTimeout, AbortController, Error, ...extras }, { filename: file });
  return module.exports;
}
function memory() {
  const values = new Map();
  return { values, getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
}

module.exports = { load, memory };
