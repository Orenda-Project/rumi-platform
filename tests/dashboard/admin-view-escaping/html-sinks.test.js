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
 * date (`.length`, Math.*, toFixed, new Date(...).toLocale*String()), or a
 * reviewed entry in REVIEWED below. Conditionals, ||, ??, nested templates and
 * `.map(x => `...`).join()` are followed.
 *
 * A new finding means: escape the value, or review it and add it here with the
 * reason it cannot carry text from a user, a teacher, a chat or a model.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const VIEWS = path.join(__dirname, '../../../dashboard/views');

/** `view: expression` -> why it is safe. Keyed by source text, not line. */
const REVIEWED = {
  // ama.ejs
  'ama.ejs: renderMarkdown(content)': 'renderMarkdown escapes the text first, then adds its own tags',
  'ama.ejs: chartId': "'chart-' + Date.now()",
  'ama.ejs: group': 'a key of groupConversationsByDate: Today / Yesterday / Last 7 Days / Older',
  'ama.ejs: displayTitle': 'built above from escapeHtml(c.username) and escapeHtml(c.title)',
  'ama.ejs: deleteBtn': "constant markup with cspArgs(c.id), or ''",
  'ama.ejs: html': 'HTML built in this function from checked templates',
  // api-health.ejs
  'api-health.ejs: data.statusCounts.healthy': 'count computed by the API health route',
  'api-health.ejs: data.statusCounts.warning': 'count computed by the API health route',
  'api-health.ejs: data.statusCounts.critical': 'count computed by the API health route',
  'api-health.ejs: data.statusCounts.error': 'count computed by the API health route',
  'api-health.ejs: getTimeAgo(lastUpdated)': "'Just now' / 'N min ago' / 'N hours ago'",
  'api-health.ejs: statusClass': '`status-${escapeHtml(service.status)}`',
  'api-health.ejs: progressClass': 'one of three class names chosen from a number',
  'api-health.ejs: percentage': 'number (used with toFixed, which throws on anything else)',
  'api-health.ejs: summaryHTML': 'checked template above',
  'api-health.ejs: gridHTML': 'checked template above',
  'api-health.ejs: warningsHTML': 'checked template above',
  // dashboard.ejs
  'dashboard.ejs: value': 'numeric percentage change from the stats API (compared with > 0 / === 0)',
  // transcript-enhanced.ejs
  'transcript-enhanced.ejs: activityLabel': 'one of two constant labels',
  'transcript-enhanced.ejs: durationText': "Math.round(...) + ' seconds'",
  'transcript-enhanced.ejs: processEnglishMarkers(rawText)': 'escapes the text first, then adds <span class="en">',
  'transcript-enhanced.ejs: html': 'HTML built in createBoardBlock from checked concatenations',
  // users.ejs
  'users.ejs: displayName': 'escapeHtml(...) of the name, assigned above',
  'users.ejs: registrationBadge': "constant markup, escapeHtml(user.registration_state), or ''",
  'users.ejs: registrationInfo': 'constant text with new Date(...).toLocaleDateString()',
  'users.ejs: formatDate(item.timestamp)': "'Today' / 'Yesterday' / toLocaleDateString of a Date",
  'users.ejs: role': "'user' or 'assistant'",
  'users.ejs: content': 'escapeHtml(msg.content) with <br>, or constant audio markup with cspArgs',
  'users.ejs: time': 'toLocaleTimeString of a Date',
  'users.ejs: statusColor': 'constant colour chosen from the status',
  'users.ejs: statusLabel': 'constant label chosen from the status',
  'users.ejs: accuracyScore': "`${Math.round(...)}%` or 'N/A'",
  'users.ejs: wcpmScore': "`${Math.round(...)} WCPM` or 'N/A'",
  'users.ejs: name': 'escapeHtml(...) of the name, assigned above',
  'users.ejs: html': 'HTML built in renderChat from checked templates',
};

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
      if (callee.type !== 'MemberExpression') return [node];
      const method = propName(callee.property);
      if (callee.object.type === 'Identifier' && callee.object.name === 'Math') return [];
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

/** HTML sinks and HTML-building expressions in one script: the values they take unchecked. */
function findUnchecked(code) {
  const ast = parser.parse(code, { sourceType: 'script', allowReturnOutsideFunction: true });
  const found = [];
  const check = (expr) => { found.push(...unchecked(expr)); };
  (function walk(node, parent) {
    if (isHtmlTemplate(node)) node.expressions.forEach(check);
    else if (isHtmlConcat(node) && !(parent && isHtmlConcat(parent))) check(node);
    else if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression'
      && SINK_PROPS.has(propName(node.left.property)) && !isHtmlTemplate(node.right) && !isHtmlConcat(node.right)) {
      check(node.right);
    } else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const method = propName(node.callee.property);
      if (method === 'insertAdjacentHTML' && node.arguments[1]) check(node.arguments[1]);
      if ((method === 'write' || method === 'writeln') && node.callee.object.name === 'document') node.arguments.forEach(check);
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, node));
      else if (v && typeof v.type === 'string') walk(v, node);
    }
  }(ast.program, null));
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
      for (const f of findUnchecked(code)) findings.push({ key: `${name}: ${f.text}`, at: `${name}:${firstLine + f.line - 1}` });
    }
  }

  test('the scan sees the views and their HTML sinks', () => {
    expect(views.length).toBeGreaterThan(20);
    // users.ejs builds its chat list and chat view with innerHTML.
    expect(findings.some((f) => f.key === 'users.ejs: displayName')).toBe(true);
  });

  test('every interpolated value is escaped or reviewed', () => {
    const unreviewed = findings.filter((f) => !REVIEWED[f.key]).map((f) => `${f.at}  ${f.key}`);
    expect(unreviewed).toEqual([]);
  });

  test('every reviewed entry is still in use', () => {
    const used = new Set(findings.map((f) => f.key));
    expect(Object.keys(REVIEWED).filter((k) => !used.has(k))).toEqual([]);
  });

  test('the scan flags an unescaped value', () => {
    const code = 'el.innerHTML = `<b>${user.first_name}</b>${escapeHtml(user.last_name)}`; '
      + "box.innerHTML = '<p>' + msg.text + '</p>'; other.innerHTML = data.error; "
      + "list.innerHTML = items.map(i => `<li>${i.name}</li>`).join('');";
    expect(findUnchecked(code).map((f) => f.text)).toEqual(['user.first_name', 'msg.text', 'data.error', 'i.name']);
  });
});
