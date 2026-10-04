/**
 * Guard: HTML the admin views build in their scripts escapes what it
 * interpolates.
 *
 * Parses every inline <script> of dashboard/views/**\/*.ejs (EJS tags blanked
 * out) and looks at the HTML they build: template literals and string
 * concatenations that contain a tag, and values assigned to innerHTML /
 * outerHTML or passed to insertAdjacentHTML / document.write. Each
 * interpolated value must be a literal, a call to escapeHtml / safeUrl /
 * cspArgs (public/js/escape-html.js, public/js/csp-actions.js), a number or
 * date (`.length`, Math.*, Date.now(), toFixed, new Date(...).toLocale*String()),
 * or a reviewed entry in REVIEWED below. Conditionals, ||, ??, nested templates
 * and `.map(x => `...`).join()` are followed. So are variables: a name that is
 * declared once and never assigned again is checked by its initialiser, so
 * `const title = c.title` fails like `c.title` would. Only a name with no
 * initialiser to check (reassigned, built up with `+=`, a parameter, a loop
 * variable, or a top-level `let`/`var` that another script can change) can be
 * a REVIEWED entry. Scripts are parsed as strict code, so `with` fails the scan.
 *
 * A new finding means: escape the value, or review it and add it here with the
 * reason it cannot carry text from a user, a teacher, a chat or a model.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const VIEWS = path.join(__dirname, '../../../dashboard/views');

/**
 * `view: expression` -> why it is safe. Keyed by source text, not line. A bare
 * name is listed only when it has no single initialiser the scan can check.
 */
const REVIEWED = {
  // ama.ejs
  'ama.ejs: renderMarkdown(content)': 'renderMarkdown escapes the text first, then adds its own tags',
  'ama.ejs: group': 'a key of groupConversationsByDate: Today / Yesterday / Last 7 Days / Older',
  'ama.ejs: html': 'HTML built in this function from checked templates',
  // api-health.ejs
  'api-health.ejs: data.statusCounts.healthy': 'count computed by the API health route',
  'api-health.ejs: data.statusCounts.warning': 'count computed by the API health route',
  'api-health.ejs: data.statusCounts.critical': 'count computed by the API health route',
  'api-health.ejs: data.statusCounts.error': 'count computed by the API health route',
  'api-health.ejs: getTimeAgo(lastUpdated)': "'Just now' / 'N min ago' / 'N hours ago'",
  // dashboard.ejs
  'dashboard.ejs: value': 'numeric percentage change from the stats API (compared with > 0 / === 0)',
  // transcript-enhanced.ejs
  'transcript-enhanced.ejs: processEnglishMarkers(rawText)': 'escapes the text first, then adds <span class="en">',
  'transcript-enhanced.ejs: html': 'HTML built in createBoardBlock from checked concatenations',
  // users.ejs
  'users.ejs: formatDate(item.timestamp)': "'Today' / 'Yesterday' / toLocaleDateString of a Date",
  'users.ejs: content': 'escapeHtml(msg.content) with <br>, or constant audio markup with cspArgs',
  'users.ejs: html': 'HTML built in renderChat from checked templates',
};

/** Reviewed by pattern: [view, expression pattern, why]. */
const REVIEWED_PATTERNS = [
  // The dry-run route (index.js) computes each breakdown entry with Array.filter().length.
  ['broadcast.ejs', /^data\.breakdown\.\w+$/, 'integer counts computed by the dry-run route, never text'],
];

function isReviewed(f) {
  if (REVIEWED[f.key]) return true;
  return REVIEWED_PATTERNS.some(([view, re]) => f.key.startsWith(`${view}: `) && re.test(f.key.slice(view.length + 2)));
}

const SAFE_CALLS = new Set(['escapeHtml', 'safeUrl', 'cspArgs']);
const DATE_TEXT = new Set(['toLocaleDateString', 'toLocaleTimeString', 'toDateString']);
const HAS_TAG = /<[a-z!/]/i;

function listViews(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listViews(p);
    return p.endsWith('.ejs') ? [p] : [];
  });
}

/** Inline scripts of a view: { code, firstLine }, EJS tags replaced by `null` (lines kept). */
function inlineScripts(src) {
  const out = [];
  for (const m of src.matchAll(/(<script\b(?:<%[\s\S]*?%>|[^>])*>)([\s\S]*?)<\/script>/gi)) {
    if (/\ssrc=/i.test(m[1])) continue;
    const code = m[2].replace(/<%[\s\S]*?%>/g, (tag) => `null${tag.slice(4).replace(/[^\n]/g, ' ')}`);
    out.push({ code, firstLine: src.slice(0, m.index + m[1].length).split('\n').length });
  }
  return out;
}

const propName = (node) => node && (node.type === 'Identifier' ? node.name : node.type === 'StringLiteral' ? node.value : null);

/** The parts of an expression that end up in the HTML unchecked. */
function unchecked(node) {
  switch (node.type) {
    case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': case 'NullLiteral':
      return [];
    case 'TemplateLiteral':
      return node.expressions.flatMap(unchecked);
    case 'ConditionalExpression':
      return [...unchecked(node.consequent), ...unchecked(node.alternate)];
    case 'LogicalExpression':
      return [...(node.operator === '&&' ? [] : unchecked(node.left)), ...unchecked(node.right)];
    case 'BinaryExpression':
      return node.operator === '+' ? [...unchecked(node.left), ...unchecked(node.right)] : [];
    case 'MemberExpression':
      return propName(node.property) === 'length' ? [] : [node];
    case 'CallExpression': {
      const { callee } = node;
      if (callee.type === 'Identifier' && SAFE_CALLS.has(callee.name)) return [];
      if (callee.type === 'Identifier' && callee.name === 'Number') return [];
      if (callee.type !== 'MemberExpression') return [node];
      const method = propName(callee.property);
      if (callee.object.type === 'Identifier' && callee.object.name === 'Math') return [];
      if (callee.object.type === 'Identifier' && callee.object.name === 'Date' && method === 'now') return [];
      if (method === 'toFixed') return [];
      if (DATE_TEXT.has(method) && callee.object.type === 'NewExpression' && callee.object.callee.name === 'Date') return [];
      // list.map(x => `...`).join(''): the template is checked where it is.
      if (method === 'join' && callee.object.type === 'CallExpression' && propName(callee.object.callee.property) === 'map') {
        const fn = callee.object.arguments[0];
        if (fn && /Function/.test(fn.type)) return fn.body.type === 'BlockStatement' ? [] : unchecked(fn.body);
      }
      return [node];
    }
    default:
      return [node];
  }
}

const isHtmlTemplate = (n) => n.type === 'TemplateLiteral' && n.quasis.some((q) => HAS_TAG.test(q.value.cooked || ''));
function hasTagLiteral(n) {
  if (n.type === 'StringLiteral') return HAS_TAG.test(n.value);
  return n.type === 'BinaryExpression' && n.operator === '+' && (hasTagLiteral(n.left) || hasTagLiteral(n.right));
}
const isHtmlConcat = (n) => n.type === 'BinaryExpression' && n.operator === '+' && hasTagLiteral(n);
const SINK_PROPS = new Set(['innerHTML', 'outerHTML']);

/**
 * The initialiser to check for an Identifier, or null when the name has none:
 * Babel's scope analysis finds the binding this reference sees, and it is
 * followed only when it is a `const`/`let`/`var x = init` that is never
 * assigned again. Parameters, loop variables, catch params, destructured
 * names, function declarations, reassigned names and globals give null.
 *
 * Babel sees one inline script at a time, so a top-level `let` or `var` gives
 * null too: a top-level `let` is shared by every classic script on the page,
 * and a top-level `var` is a window property (`window.x = ...`,
 * `Object.assign(window, ...)`). Only a top-level `const` is followed.
 */
function initialiserOf(idPath) {
  const binding = idPath.scope.getBinding(idPath.node.name);
  if (!binding || !['const', 'let', 'var'].includes(binding.kind)) return null;
  if (binding.scope.path.isProgram() && binding.kind !== 'const') return null;
  const decl = binding.path;
  if (!decl.isVariableDeclarator() || decl.node.id.type !== 'Identifier' || !decl.node.init) return null;
  if (binding.constantViolations.length > 0) return null;
  return decl.node.init;
}

/**
 * HTML sinks and HTML-building expressions in one script: the values they take
 * unchecked. The script is parsed as strict code, so `with`, which Babel's scope
 * analysis does not model, is a syntax error: it throws, and the scan fails.
 */
function findUnchecked(code) {
  const ast = parser.parse(code, { sourceType: 'script', strictMode: true, allowReturnOutsideFunction: true });
  const found = [];
  const sinks = [];
  const identifiers = new Map();
  traverse(ast, {
    Identifier(p) { identifiers.set(p.node, p); },
    enter(p) {
      const { node, parent } = p;
      if (isHtmlTemplate(node)) sinks.push(...node.expressions);
      else if (isHtmlConcat(node) && !(parent && isHtmlConcat(parent))) sinks.push(node);
      else if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression'
        && SINK_PROPS.has(propName(node.left.property)) && !isHtmlTemplate(node.right) && !isHtmlConcat(node.right)) {
        sinks.push(node.right);
      } else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const method = propName(node.callee.property);
        if (method === 'insertAdjacentHTML' && node.arguments[1]) sinks.push(node.arguments[1]);
        if ((method === 'write' || method === 'writeln') && node.callee.object.name === 'document') sinks.push(...node.arguments);
      }
    },
  });
  // A variable with a single initialiser is checked by that initialiser.
  const resolve = (nodes, seen) => nodes.flatMap((n) => {
    const idPath = n.type === 'Identifier' && identifiers.get(n);
    const init = idPath && !seen.has(n.name) && initialiserOf(idPath);
    return init ? resolve(unchecked(init), new Set([...seen, n.name])) : [n];
  });
  for (const expr of sinks) found.push(...resolve(unchecked(expr), new Set()));
  // A value can be reached twice (a template inside a sink): report it once.
  const unique = [...new Map(found.map((n) => [n.start, n])).values()];
  return unique.map((n) => ({ text: code.slice(n.start, n.end).replace(/\s+/g, ' '), line: n.loc.start.line }));
}

describe('admin views: HTML built in scripts escapes what it interpolates', () => {
  const views = listViews(VIEWS);
  const findings = [];
  for (const file of views) {
    const name = path.relative(VIEWS, file);
    for (const { code, firstLine } of inlineScripts(fs.readFileSync(file, 'utf8'))) {
      let found;
      try {
        found = findUnchecked(code);
      } catch (err) {
        // A script the scan cannot parse (strict mode: `with`, octal literals, ...) is a finding, never skipped.
        found = [{ text: `cannot parse as strict code: ${err.message}`, line: err.loc ? err.loc.line : 1 }];
      }
      for (const f of found) findings.push({ key: `${name}: ${f.text}`, at: `${name}:${firstLine + f.line - 1}` });
    }
  }

  test('the scan sees the views and their HTML sinks', () => {
    expect(views.length).toBeGreaterThan(20);
    // users.ejs builds its chat view with innerHTML.
    expect(findings.some((f) => f.key === 'users.ejs: html')).toBe(true);
  });

  test('every interpolated value is escaped or reviewed', () => {
    const unreviewed = findings.filter((f) => !isReviewed(f)).map((f) => `${f.at}  ${f.key}`);
    expect(unreviewed).toEqual([]);
  });

  test('every reviewed entry is still in use', () => {
    const used = new Set(findings.map((f) => f.key));
    expect(Object.keys(REVIEWED).filter((k) => !used.has(k))).toEqual([]);
    const unusedPatterns = REVIEWED_PATTERNS.filter(([view, re]) => ![...used].some(
      (k) => k.startsWith(`${view}: `) && re.test(k.slice(view.length + 2)),
    ));
    expect(unusedPatterns).toEqual([]);
  });

  test('the scan flags an unescaped value', () => {
    const code = 'el.innerHTML = `<b>${user.first_name}</b>${escapeHtml(user.last_name)}`; '
      + "box.innerHTML = '<p>' + msg.text + '</p>'; other.innerHTML = data.error; "
      + "list.innerHTML = items.map(i => `<li>${i.name}</li>`).join('');";
    expect(findUnchecked(code).map((f) => f.text)).toEqual(['user.first_name', 'msg.text', 'data.error', 'i.name']);
  });

  test('the scan checks what a variable holds, not its name', () => {
    const texts = (code) => findUnchecked(code).map((f) => f.text);
    // Declared once: checked by its initialiser, through other variables too.
    expect(texts('const t = c.title || "New"; const label = t; el.innerHTML = `<b>${label}</b>`;')).toEqual(['c.title']);
    expect(texts('const t = c.username ? `<i>${escapeHtml(c.username)}</i>` : escapeHtml(c.title); el.innerHTML = `<b>${t}</b>`;')).toEqual([]);
    // The declaration this function sees, not a same-named one elsewhere.
    expect(texts('function a(u) { const name = escapeHtml(u.name); return `<b>${name}</b>`; } '
      + 'function b(u) { const name = u.name; return `<b>${name}</b>`; }')).toEqual(['u.name']);
    // No single initialiser: reassigned, built up, a parameter or a loop variable. The name is reported.
    expect(texts('let h = escapeHtml(a); h = b; el.innerHTML = h;')).toEqual(['h']);
    expect(texts('let h = ""; h += x; el.innerHTML = h;')).toEqual(['h']);
    expect(texts('function f(p) { return `<b>${p}</b>`; }')).toEqual(['p']);
    expect(texts('for (const [g] of list) out += `<b>${g}</b>`;')).toEqual(['g']);
  });

  test('the scan does not follow a shadowed or reassigned name to another declaration', () => {
    const texts = (code) => findUnchecked(code).map((f) => f.text);
    const escaped = (name) => `const ${name} = escapeHtml(u.${name}); `;
    // A new binding of the same name hides the escaped one: report the inner name.
    expect(texts(`${escaped('name')}function row({ name }) { return \`<td>\${name}</td>\`; }`)).toEqual(['name']);
    expect(texts(`${escaped('name')}function row(name = "") { return \`<td>\${name}</td>\`; }`)).toEqual(['name']);
    expect(texts(`${escaped('name')}for (const name of rawNames) out.push(\`<td>\${name}</td>\`);`)).toEqual(['name']);
    expect(texts(`${escaped('msg')}try { f(); } catch (msg) { el.innerHTML = \`<p>\${msg}</p>\`; }`)).toEqual(['msg']);
    expect(texts(`${escaped('title')}function f(c) { const { title } = c; return \`<b>\${title}</b>\`; }`)).toEqual(['title']);
    expect(texts(`${escaped('name')}function f(u) { if (u) { var name = u.name; } return \`<b>\${name}</b>\`; }`)).toEqual(['u.name']);
    expect(texts(`${escaped('name')}el.innerHTML = rawNames.map(name => name).join('<br>');`)).toEqual(['name']);
    expect(texts(`${escaped('t')}function g() { function t() {} return \`<b>\${t}</b>\`; }`)).toEqual(['t']);
    // Assigned again by destructuring, a for-of target or a second var: report the name.
    expect(texts('let t = escapeHtml(c.title); [t] = [c.title]; el.innerHTML = `<b>${t}</b>`;')).toEqual(['t']);
    expect(texts('let t = escapeHtml(a); for (t of rawList) {} el.innerHTML = `<b>${t}</b>`;')).toEqual(['t']);
    expect(texts('var t = escapeHtml(c.title); var t = c.title; el.innerHTML = `<b>${t}</b>`;')).toEqual(['t']);
  });

  test('the scan reports a shadowed name in the real users.ejs chat view', () => {
    // renderChat already has `const displayName = escapeHtml(...)`; an alias list
    // that destructures its own displayName must not pass as that one.
    const script = inlineScripts(fs.readFileSync(path.join(VIEWS, 'users.ejs'), 'utf8'))
      .map((s) => s.code).find((code) => code.includes('function renderChat('));
    const marker = '      // Create timeline with all user activities\n';
    expect(script).toContain(marker);
    const patched = script.replace(marker, 'document.getElementById("chatHeader").insertAdjacentHTML("beforeend", '
      + '(data.aliases || []).map(({ displayName }) => `<span class="alias">${displayName}</span>`).join(""));\n' + marker);
    const before = findUnchecked(script).map((f) => f.text);
    const after = findUnchecked(patched).map((f) => f.text);
    expect(before).not.toContain('displayName');
    expect(after.filter((t) => !before.includes(t))).toEqual(['displayName']);
  });

  test('the scan does not trust a name that code outside this script can change', () => {
    const texts = (code) => findUnchecked(code).map((f) => f.text);
    // A top-level var is a window property, and a top-level let is shared by every
    // classic script on the page: neither has an initialiser the scan can rely on.
    expect(texts('var name = escapeHtml(u.name); function load(c) { window.name = c.title; } '
      + 'function show() { el.innerHTML = `<b>${name}</b>`; }')).toEqual(['name']);
    expect(texts('var name = escapeHtml(u.name); this.name = c.title; el.innerHTML = `<b>${name}</b>`;')).toEqual(['name']);
    expect(texts('var t = escapeHtml(a); Object.assign(window, { t: c.title }); el.innerHTML = `<b>${t}</b>`;')).toEqual(['t']);
    expect(texts('let t = escapeHtml(a); el.innerHTML = `<b>${t}</b>`;')).toEqual(['t']);
    // A top-level const, or a let/var inside a function, is still checked by its initialiser.
    expect(texts('const t = escapeHtml(a); el.innerHTML = `<b>${t}</b>`;')).toEqual([]);
    expect(texts('function f(u) { let n = escapeHtml(u.n); var m = escapeHtml(u.m); return `<b>${n}${m}</b>`; }')).toEqual([]);
    // `with (o)` puts o's properties in front of every outer name: scripts are parsed
    // as strict code, where `with` is a syntax error.
    expect(() => findUnchecked('const name = escapeHtml(u.name); with (u) { el.innerHTML = `<b>${name}</b>`; }'))
      .toThrow(/with/i);
  });

  test('the scan reports a top-level name or a `with` in the real users.ejs scripts', () => {
    const scripts = inlineScripts(fs.readFileSync(path.join(VIEWS, 'users.ejs'), 'utf8')).map((s) => s.code);
    const script = scripts.find((code) => code.includes('function renderChat('));
    const marker = '      // Create timeline with all user activities\n';
    const top = '    let allUsers = ';
    expect(script).toContain(marker);
    expect(script).toContain(top);
    const before = findUnchecked(script).map((f) => f.text);
    // A note escaped where it is declared, but the page's next inline script can set
    // it from the URL (`headerNote = new URLSearchParams(location.search).get("note")`).
    const note = script.replace(top, `    let headerNote = escapeHtml("");\n${top}`).replace(marker,
      'document.getElementById("chatHeader").insertAdjacentHTML("beforeend", `<span class="note">${headerNote}</span>`);\n' + marker);
    expect(findUnchecked(note).map((f) => f.text).filter((t) => !before.includes(t))).toEqual(['headerNote']);
    // `with` would let data.alias.displayName stand in for the escaped displayName.
    const alias = script.replace(marker, 'with (data.alias || {}) { document.getElementById("chatHeader").insertAdjacentHTML('
      + '"beforeend", `<span class="alias">${displayName}</span>`); }\n' + marker);
    expect(() => findUnchecked(alias)).toThrow(/with/i);
  });
});
