/**
 * Every admin view that uses data-on-<event> registers exactly the handler
 * names it uses with window.cspActions.register (dashboard/public/js/csp-actions.js
 * runs nothing else), from a nonce'd script that runs after csp-actions.js loads.
 *
 * Scans the EJS source: markup and HTML strings built in the view's scripts.
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD = path.join(__dirname, '../../dashboard');
const VIEWS = path.join(DASHBOARD, 'views');

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

const rel = (p) => path.relative(DASHBOARD, p);
const BUILT_IN = new Set(['$reload', '$print', '$stop', '$hide']);

/** Handler names used by data-on-* in the source (built-ins left out). */
function usedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/data-on-[a-z]+\s*=\s*\\?(["'])([^"'\\]*)\\?\1/g)) {
    if (!BUILT_IN.has(m[2])) names.add(m[2]);
  }
  return names;
}

/** Every data-on-* attribute, to check that usedNames() understood all of them. */
function attributeCount(src) {
  return (src.match(/data-on-[a-z]+\s*=/g) || []).length;
}

function nameCount(src) {
  return [...src.matchAll(/data-on-[a-z]+\s*=\s*\\?(["'])([^"'\\]*)\\?\1/g)].length;
}

/**
 * Names registered with cspActions.register({ ... }) / register('name', fn),
 * and the offset of each registration.
 */
function registrations(src) {
  const names = new Set();
  const offsets = [];
  for (const m of src.matchAll(/cspActions\.register\(\s*\{([^}]*)\}\s*\)/g)) {
    offsets.push(m.index);
    for (const entry of m[1].split(',')) {
      const key = entry.trim().split(':')[0].trim();
      if (key) names.add(key.replace(/^['"]|['"]$/g, ''));
    }
  }
  for (const m of src.matchAll(/cspActions\.register\(\s*['"]([^'"]+)['"]\s*,/g)) {
    offsets.push(m.index);
    names.add(m[1]);
  }
  return { names, offsets };
}

/** The <script> element (tag + body) containing offset, or null. */
function scriptAround(src, offset) {
  const open = src.lastIndexOf('<script', offset);
  if (open === -1) return null;
  const close = src.indexOf('</script>', open);
  if (close === -1 || close < offset) return null;
  // The tag ends at the first '>' that does not close an EJS '%>'.
  const tag = /^<script(?:[^>%]|%>|%(?!>))*>/.exec(src.slice(open, close));
  return { tag: tag ? tag[0] : '', open };
}

const views = listFiles(VIEWS, '.ejs').filter((f) => /data-on-/.test(fs.readFileSync(f, 'utf8')));

describe('admin views register every data-on-* handler they use', () => {
  test('there are views that use data-on-*', () => {
    expect(views.length).toBeGreaterThan(0);
  });

  test.each(views.map((f) => [rel(f), f]))('%s', (name, file) => {
    const src = fs.readFileSync(file, 'utf8');
    // Each data-on-* has a plain, static name the scan can read.
    expect(nameCount(src)).toBe(attributeCount(src));
    const used = usedNames(src);
    for (const n of used) expect(n).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);

    const loader = src.search(/<script\s+src="\/js\/csp-actions\.js"><\/script>/);
    expect(loader).toBeGreaterThan(-1);

    const { names, offsets } = registrations(src);
    if (used.size === 0) return;
    expect(offsets.length).toBeGreaterThan(0);
    for (const offset of offsets) {
      const script = scriptAround(src, offset);
      expect(script).not.toBeNull();
      expect(script.tag).toContain('nonce="<%= cspNonce %>"');
      expect(script.open).toBeGreaterThan(loader);
    }
    // Exactly the names the view uses: nothing missing, nothing extra.
    expect([...names].sort()).toEqual([...used].sort());
  });
});

describe('the scan itself', () => {
  test('flags a name used but not registered', () => {
    const src = `<button data-on-click="saveItem"></button>
      <script nonce="<%= cspNonce %>">el.innerHTML = '<a data-on-click=\\"dropItem\\">x</a>';
      window.cspActions.register({ saveItem: saveItem });</script>`;
    expect([...usedNames(src)].sort()).toEqual(['dropItem', 'saveItem']);
    expect([...registrations(src).names]).toEqual(['saveItem']);
  });

  test('reads shorthand, quoted and single-name registrations; skips built-ins', () => {
    const src = `<img data-on-error="$hide"><script>
      window.cspActions.register({ a, 'b': b2, c: window.c });
      window.cspActions.register('d', d);</script>`;
    expect([...usedNames(src)]).toEqual([]);
    expect([...registrations(src).names].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
