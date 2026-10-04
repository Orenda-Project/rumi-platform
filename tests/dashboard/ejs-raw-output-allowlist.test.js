/**
 * Every raw `<%- %>` tag in an admin view is on purpose, and data in an
 * inline script is written with safeJson.
 *
 * The admin pages show text the public messenger's users chose (display
 * names, chat). `<%= %>` escapes it; `<%- %>` writes it as markup, and the
 * strict CSP does not stop injected HTML. So a raw tag is allowed only for:
 *   - an include (the partial escapes its own output and is scanned too), or
 *     a layout's `body`;
 *   - safeJson(...) — data for an inline <script> (dashboard/lib/safe-json.js),
 *     and only between <script ...> and </script>: it does not escape `"`, so
 *     in an attribute it can end the attribute. An attribute takes
 *     <%= JSON.stringify(x) %>;
 *   - a server-owned constant listed in CONSTANTS below, with the reason.
 * Anything else fails here.
 *
 * Inside a <script> body, `<%= %>` is not allowed at all: it escapes for HTML,
 * not for JavaScript (a trailing `\` in a quoted value continues the string),
 * so data there goes through `<%- safeJson(x) %>`, numbers and booleans too.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const VIEW_DIRS = ['dashboard/views', 'bot/console/views', 'bot/dashboard/views'];

const FIX = 'Write it with <%= %> (escaped), or <%- safeJson(x) %> for data in an inline <script> '
  + '(dashboard/lib/safe-json.js). In an attribute, write JSON with <%= JSON.stringify(x) %>. Only a '
  + 'value the server owns outright (no user, database or request text) may go in CONSTANTS in this '
  + 'test, with the reason.';
const SCRIPT_FIX = 'Inside a <script>, write data with <%- safeJson(x) %> (no quotes around it): <%= %> '
  + 'escapes for HTML, not for JavaScript.';

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

/** [start, end) of each inline script body in `src`: after `<script ...>`, before `</script>`. */
function scriptBodies(src) {
  return [...src.matchAll(/(<script\b(?:<%[\s\S]*?%>|[^>])*>)([\s\S]*?)<\/script>/gi)]
    .map((m) => [m.index + m[1].length, m.index + m[1].length + m[2].length]);
}

/** Every `<%- … %>` and `<%= … %>` tag in one view: { file, line, expr, raw, inScript }. */
function tagsIn(src, file) {
  const bodies = scriptBodies(src);
  const tags = [];
  const re = /<%([-=])([\s\S]*?)[-_]?%>/g;
  let m;
  while ((m = re.exec(src))) {
    const at = m.index;
    tags.push({
      file,
      line: src.slice(0, at).split('\n').length,
      expr: m[2].trim(),
      raw: m[1] === '-',
      inScript: bodies.some(([start, end]) => at >= start && at < end),
    });
  }
  return tags;
}

function allTags() {
  return VIEW_DIRS.flatMap((dir) => listEjs(path.join(ROOT, dir)).map((abs) => tagsIn(
    fs.readFileSync(abs, 'utf8'),
    path.relative(ROOT, abs).split(path.sep).join('/'),
  ))).flat();
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
  if (isSingleCall(tag.expr, 'safeJson') && tag.inScript) return 'safe-serialised';
  if (constantFor(tag)) return 'server-owned constant';
  return null;
}

describe('raw EJS output (<%- %>) in admin views', () => {
  const all = allTags();
  const tags = all.filter((t) => t.raw);

  test('finds the views', () => {
    for (const dir of ['dashboard/views', 'bot/console/views']) {
      expect(tags.filter((t) => t.file.startsWith(dir)).length).toBeGreaterThan(0);
    }
  });

  test('every <%- %> is an include, safeJson(...) in a script or a listed constant', () => {
    const bad = tags.filter((t) => !category(t)).map((t) => `${t.file}:${t.line}  <%- ${t.expr.replace(/\s+/g, ' ').slice(0, 100)} %>`);
    if (bad.length) {
      throw new Error(`Raw (unescaped) EJS output that is not allowed:\n  ${bad.join('\n  ')}\n\n${FIX}`);
    }
  });

  test('no <%= %> inside an inline <script>', () => {
    const bad = all.filter((t) => !t.raw && t.inScript).map((t) => `${t.file}:${t.line}  <%= ${t.expr.replace(/\s+/g, ' ').slice(0, 100)} %>`);
    if (bad.length) throw new Error(`Escaped EJS output inside a script:\n  ${bad.join('\n  ')}\n\n${SCRIPT_FIX}`);
  });

  test('every CONSTANTS entry still matches a tag (no stale allowances)', () => {
    const unused = CONSTANTS.filter((c) => !tags.some((t) => constantFor(t) === c));
    expect(unused.map((c) => `${c.file}: ${c.expr}`)).toEqual([]);
  });

  test('the checker itself: a raw user value fails, an escaped-by-design call passes', () => {
    const t = (expr, file = 'dashboard/views/users.ejs') => category({ file, line: 1, expr, inScript: true });
    expect(t('user.name')).toBeNull();
    expect(t('JSON.stringify(users)')).toBeNull();
    expect(t('safeJson(a) + user.name')).toBeNull();
    expect(t('include("x") + user.name')).toBeNull();
    expect(t('body')).toBeNull();
    expect(t('getIcon(note.icon)')).toBeNull();
    expect(t('safeJson(users || [])')).toBe('safe-serialised');
    expect(t("include('partials/navigation', { currentPage: 'users' })")).toBe('trusted include');
  });

  test('the checker itself: safeJson only inside a script body, no <%= %> there', () => {
    const src = '<div data-users="<%- safeJson(users) %>" title="<%= name %>">\n'
      + '<script nonce="<%= cspNonce %>">\n'
      + '  const users = <%- safeJson(users) %>;\n'
      + "  const id = '<%= id %>';\n"
      + '</script>\n'
      + '<p><%- safeJson(users) %></p>';
    const found = tagsIn(src, 'dashboard/views/users.ejs').map((tag) => [tag.line, tag.raw ? '-' : '=', tag.expr, tag.inScript, category(tag)]);
    expect(found).toEqual([
      [1, '-', 'safeJson(users)', false, null],
      [1, '=', 'name', false, null],
      [2, '=', 'cspNonce', false, null],
      [3, '-', 'safeJson(users)', true, 'safe-serialised'],
      [4, '=', 'id', true, null],
      [6, '-', 'safeJson(users)', false, null],
    ]);
  });
});
