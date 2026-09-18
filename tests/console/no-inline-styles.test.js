/**
 * The console sets `style-src 'self'`, which blocks inline STYLE ATTRIBUTES as
 * well as <style> blocks. That is worth keeping — it is half of what makes an
 * XSS on this origin (which also serves Meta's webhook) survivable.
 *
 * But it fails *silently*. A `style="margin-top:18px"` or an
 * `el.style.color = 'red'` is dropped by the browser with nothing but a console
 * warning, so the page just quietly looks wrong and nobody can see why from the
 * source. That is exactly how this UI ended up with a dozen dead spacing rules.
 *
 * So: no inline styling anywhere in the console. Everything goes through a class.
 */

const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '../../bot/console');
const VIEWS = path.join(CONSOLE_DIR, 'views');

function ejsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...ejsFiles(full));
    else if (entry.name.endsWith('.ejs')) out.push(full);
  }
  return out;
}

describe('no inline styling — the CSP drops it silently', () => {
  it.each(ejsFiles(VIEWS).map((f) => [path.relative(VIEWS, f), f]))(
    'views/%s has no style attribute',
    (_name, file) => {
      const matches = fs.readFileSync(file, 'utf8').match(/style\s*=\s*"/g) || [];
      expect(matches).toEqual([]);
    },
  );

  it('console.js never assigns to element.style', () => {
    const src = fs.readFileSync(path.join(CONSOLE_DIR, 'assets/console.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const assignments = src.match(/\.style\.[a-zA-Z]+\s*=/g) || [];
    expect(assignments).toEqual([]);
  });

  it('console.js builds no markup carrying a style attribute', () => {
    const src = fs.readFileSync(path.join(CONSOLE_DIR, 'assets/console.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src.match(/style\s*=\s*\\?["']/g) || []).toEqual([]);
  });

  it('the policy that makes this necessary is still in place', () => {
    // If someone relaxes this to 'unsafe-inline', the tests above stop being
    // load-bearing and should be reconsidered rather than left as cargo cult.
    const index = fs.readFileSync(path.join(CONSOLE_DIR, 'index.js'), 'utf8');
    expect(index).toMatch(/"style-src 'self'"/);
    expect(index).not.toMatch(/unsafe-inline/);
  });
});

describe('no duplicate class attributes', () => {
  // `<div class="banner" class="gap-md">` keeps the FIRST and drops the second,
  // silently, which is the same failure wearing a different hat.
  it.each(ejsFiles(VIEWS).map((f) => [path.relative(VIEWS, f), f]))(
    'views/%s',
    (_name, file) => {
      const src = fs.readFileSync(file, 'utf8');
      // Scan tag by tag; an EJS expression inside an attribute may contain '>'.
      const offenders = [];
      for (const tag of src.match(/<[a-zA-Z][^<]*?>/g) || []) {
        const bare = tag.replace(/<%[\s\S]*?%>/g, '');
        if ((bare.match(/\sclass\s*=/g) || []).length > 1) offenders.push(tag.slice(0, 70));
      }
      expect(offenders).toEqual([]);
    },
  );
});

describe('every class used has a rule behind it', () => {
  it('finds no class referenced by a view or the island script that CSS never defines', () => {
    const css = fs.readFileSync(path.join(CONSOLE_DIR, 'assets/console.css'), 'utf8');
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

    const used = new Set();
    for (const file of ejsFiles(VIEWS)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/class="([^"]*)"/g)) {
        // Drop EJS expressions; their branches are literals we pick up separately.
        for (const cls of m[1].replace(/<%[\s\S]*?%>/g, ' ').split(/\s+/)) {
          if (cls) used.add(cls);
        }
      }
    }
    const js = fs.readFileSync(path.join(CONSOLE_DIR, 'assets/console.js'), 'utf8');
    for (const m of js.matchAll(/el\('[a-z]+',\s*'([^']*)'/g)) {
      for (const cls of m[1].split(/\s+/)) if (cls) used.add(cls);
    }

    expect([...used].filter((c) => !defined.has(c)).sort()).toEqual([]);
  });
});
