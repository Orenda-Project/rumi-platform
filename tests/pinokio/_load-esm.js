/**
 * Load a dependency-free ES module under Jest, which has no ESM support here.
 *
 * Reads the file, refuses `import` statements, strips `export` from
 * function/const/let/class declarations, evaluates the result in a `vm`
 * context and returns the exported names as a plain object. Only for the
 * browser modules under pinokio/onboarding/public that are pure functions.
 */
const fs = require('fs');
const vm = require('vm');

const EXPORT_DECL = /^export\s+((?:async\s+)?function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function loadEsm(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (/^\s*import[\s{*'"]/m.test(source)) {
    throw new Error(`${file} has import statements; loadEsm only handles self-contained modules`);
  }
  if (/^\s*export\s+(default|\{|\*)/m.test(source)) {
    throw new Error(`${file} uses an export form loadEsm does not support`);
  }
  const names = [];
  const body = source.replace(EXPORT_DECL, (match, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  const context = vm.createContext({});
  vm.runInContext(`${body}\n;globalThis.__exports = { ${names.join(', ')} };`, context, { filename: file });
  return { ...context.__exports };
}

module.exports = { loadEsm };
