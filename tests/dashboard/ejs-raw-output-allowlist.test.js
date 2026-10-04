/**
 * Every raw `<%- %>` tag in an admin view is on purpose.
 *
 * The admin pages show text the public messenger's users chose (display
 * names, chat). `<%= %>` escapes it; `<%- %>` writes it as markup, and the
 * strict CSP does not stop injected HTML. So a raw tag is allowed only for:
 *   - an include (the partial escapes its own output and is scanned too), or
 *     a layout's `body`;
 *   - safeJson(...) — data for an inline <script> (dashboard/lib/safe-json.js);
 *   - a server-owned constant listed in CONSTANTS below, with the reason.
 * Anything else fails here.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const VIEW_DIRS = ['dashboard/views', 'bot/console/views', 'bot/dashboard/views'];

const FIX = 'Write it with <%= %> (escaped), or <%- safeJson(x) %> for data in an inline <script> '
  + '(dashboard/lib/safe-json.js). Only a value the server owns outright (no user, database or '
  + 'request text) may go in CONSTANTS in this test, with the reason.';

/** Server-owned values that are markup on purpose: file (repo-relative) + exact expression or pattern. */
const CONSTANTS = [
  {
    file: 'dashboard/views/release-notes.ejs',
    expr: 'getIcon(note.icon)',
    why: 'getIcon returns one of the SVG strings in the template\'s own icons map (an own key, else sparkles); note.icon only picks the key.',
  },
  {
    file: 'dashboard/views/partials/release-feed.ejs',
    expr: 'getIcon(note.icon)',
    why: 'Same icons map and getIcon as release-notes.ejs.',
  },
  {
    file: 'dashboard/views/partials/release-feed.ejs',
    expr: 'icons.sparkles',
    why: 'A string literal in the template\'s icons map.',
  },
  {
    file: 'bot/console/views/partials/nav.ejs',
    expr: /^active === '\/[a-z]*'\s*\? 'aria-current="page"' : ''$/,
    why: 'Either the literal aria-current="page" or nothing; `active` is only compared.',
  },
];

function listEjs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listEjs(p);
    return p.endsWith('.ejs') ? [p] : [];
  });
}

/** Every `<%- … %>` tag: { file, line, expr }. */
function rawTags() {
  const tags = [];
  for (const dir of VIEW_DIRS) {
    for (const abs of listEjs(path.join(ROOT, dir))) {
      const src = fs.readFileSync(abs, 'utf8');
      const re = /<%-([\s\S]*?)[-_]?%>/g;
      let m;
      while ((m = re.exec(src))) {
        tags.push({
          file: path.relative(ROOT, abs).split(path.sep).join('/'),
          line: src.slice(0, m.index).split('\n').length,
          expr: m[1].trim(),
        });
      }
    }
  }
  return tags;
}

/** True if `expr` is one call to `name(...)` and nothing after it. */
function isSingleCall(expr, name) {
  if (!expr.startsWith(`${name}(`)) return false;
  let depth = 0;
  let quote = null;
  for (let i = name.length; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return i === expr.length - 1;
    }
  }
  return false;
}

function constantFor(tag) {
  return CONSTANTS.find((c) => c.file === tag.file
    && (c.expr instanceof RegExp ? c.expr.test(tag.expr) : c.expr === tag.expr));
}

/** Why a raw tag is allowed, or null. */
function category(tag) {
  if (isSingleCall(tag.expr, 'include')) return 'trusted include';
  if (tag.expr === 'body' && path.basename(tag.file) === 'layout.ejs') return 'layout body';
  if (isSingleCall(tag.expr, 'safeJson')) return 'safe-serialised';
  if (constantFor(tag)) return 'server-owned constant';
  return null;
}

describe('raw EJS output (<%- %>) in admin views', () => {
  const tags = rawTags();

  test('finds the views', () => {
    for (const dir of ['dashboard/views', 'bot/console/views']) {
      expect(tags.filter((t) => t.file.startsWith(dir)).length).toBeGreaterThan(0);
    }
  });

  test('every <%- %> is an include, safeJson(...) or a listed constant', () => {
    const bad = tags.filter((t) => !category(t)).map((t) => `${t.file}:${t.line}  <%- ${t.expr.replace(/\s+/g, ' ').slice(0, 100)} %>`);
    if (bad.length) {
      throw new Error(`Raw (unescaped) EJS output that is not allowed:\n  ${bad.join('\n  ')}\n\n${FIX}`);
    }
  });

  test('every CONSTANTS entry still matches a tag (no stale allowances)', () => {
    const unused = CONSTANTS.filter((c) => !tags.some((t) => constantFor(t) === c));
    expect(unused.map((c) => `${c.file}: ${c.expr}`)).toEqual([]);
  });

  test('the checker itself: a raw user value fails, an escaped-by-design call passes', () => {
    const t = (expr, file = 'dashboard/views/users.ejs') => category({ file, line: 1, expr });
    expect(t('user.name')).toBeNull();
    expect(t('JSON.stringify(users)')).toBeNull();
    expect(t('safeJson(a) + user.name')).toBeNull();
    expect(t('include("x") + user.name')).toBeNull();
    expect(t('body')).toBeNull();
    expect(t('getIcon(note.icon)')).toBeNull();
    expect(t('safeJson(users || [])')).toBe('safe-serialised');
    expect(t("include('partials/navigation', { currentPage: 'users' })")).toBe('trusted include');
  });
});
