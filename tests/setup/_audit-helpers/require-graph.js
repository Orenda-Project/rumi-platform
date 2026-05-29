/**
 * Static require-graph helper for the Wave-3 platform audit guards.
 *
 * Builds the directed reachability graph rooted at the bot's entry points
 * (web + workers + scripts + tests) and surfaces three derived properties
 * the audit guards consume:
 *
 *   - reachable(): set of files reachable from any entry
 *   - unresolvedRequires(): literal require('./x') that doesn't resolve
 *   - findCycles(): Tarjan SCCs of size > 1
 *
 * Design notes:
 *   - Strips `//` line comments and `/* * /` block comments before regex so
 *     a `require(...)` mentioned inside a comment or string assertion doesn't
 *     count.
 *   - Distinguishes "literal" requires (`require('./x')`) from "lazy/optional"
 *     requires (the same call wrapped in a `try { … }` block — the OSS-strip
 *     pattern). Optionals that don't resolve are reported separately so the
 *     guard can allowlist them by file:spec.
 *   - Captures the path.resolve(VAR, 'X') / path.join(__dirname, 'X')
 *     dynamic-require pattern so a test referenced via `require(path.resolve(
 *     MONOREPO_ROOT, 'bot/.../x.js'))` doesn't false-orphan its target.
 *   - Skips bare module specs (npm packages) — they're not in the audit's scope.
 *   - Skips /node_modules/ subtree.
 *
 * Performance: this runs once per Jest run, memoised by an in-module cache, so
 * the 4 guards share one graph. Empirically <2s on the OSS codebase (≈400 JS
 * files reachable).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BOT_ROOT = path.join(ROOT, 'bot');

// ─── Comment stripping ──────────────────────────────────────────────────────

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_RE = /\/\/[^\n]*/g;

function stripComments(src) {
  return src.replace(BLOCK_COMMENT_RE, '').replace(LINE_COMMENT_RE, '');
}

// ─── Require extraction ─────────────────────────────────────────────────────

// Literal require: require('./x') or require("../x").
// Negative look-behind on `"` / `'` skips `require(...)` literals that are
// themselves inside a JS string (e.g. `toContain("require('./x')")` in a test
// file — that's a string assertion, not a real require).
const REQUIRE_LIT_RE = /(?<!["'])require\(\s*['"]([^'"]+)['"]\s*\)/g;

// Dynamic require with path.resolve(VAR, 'X') or path.join(VAR, 'X') —
// captures the literal X (the file-path-like argument). Same look-behind guard.
const PATH_RESOLVE_REQUIRE_RE =
  /(?<!["'])require\(\s*path\.(?:resolve|join)\([^)]*?,\s*['"]([^'"]+)['"]\s*\)\s*\)/g;

// Detect whether the position is inside a try { } block by counting brace depth
// since the last `try {`. Cheap heuristic — sufficient for the audit.
function isInTryCatch(src, pos) {
  const prefix = src.slice(0, pos);
  const lastTry = prefix.lastIndexOf('try {');
  if (lastTry === -1) return false;
  const between = prefix.slice(lastTry);
  const open = (between.match(/\{/g) || []).length;
  const close = (between.match(/\}/g) || []).length;
  return open > close;
}

// Returns array of { spec, kind, isOptional, pos } for the file.
function extractRequires(filePath) {
  let src;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const clean = stripComments(src);
  const out = [];
  let m;
  REQUIRE_LIT_RE.lastIndex = 0;
  while ((m = REQUIRE_LIT_RE.exec(clean))) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // bare package
    out.push({
      spec,
      kind: 'literal',
      isOptional: isInTryCatch(clean, m.index),
      pos: m.index,
    });
  }
  PATH_RESOLVE_REQUIRE_RE.lastIndex = 0;
  while ((m = PATH_RESOLVE_REQUIRE_RE.exec(clean))) {
    out.push({ spec: m[1], kind: 'path-resolve', isOptional: false, pos: m.index });
  }
  return out;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

function resolveLocal(fromDir, spec) {
  const base = path.resolve(fromDir, spec);
  // CJS resolution order — try in turn.
  const candidates = [
    base,
    base + '.js',
    base + '.json',
    path.join(base, 'index.js'),
    path.join(base, 'package.json'),
  ];
  for (const c of candidates) {
    let stat;
    try {
      stat = fs.statSync(c);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (path.basename(c) === 'package.json') {
      try {
        const pj = JSON.parse(fs.readFileSync(c, 'utf8'));
        const main = pj.main || 'index.js';
        const target = path.resolve(path.dirname(c), main);
        if (fs.existsSync(target)) return target;
      } catch {
        /* fall through */
      }
      continue;
    }
    return c;
  }
  return null;
}

// A path.resolve/path.join spec is treated as repo-rooted (most common pattern
// in OSS tests that do `require(path.resolve(MONOREPO_ROOT, 'bot/.../x'))`).
function resolvePathResolve(spec) {
  // Heuristic: only resolve specs that look like a file path. A bare 'pdfkit'
  // through path.join(node_modules, 'pdfkit') is NOT a file path we audit —
  // skip if there's no slash and no extension.
  if (!spec.includes('/') && !spec.endsWith('.js') && !spec.endsWith('.json')) {
    return 'BARE_MODULE';
  }
  const tries = [
    path.join(ROOT, spec),
    path.join(ROOT, spec) + '.js',
    path.join(ROOT, spec, 'index.js'),
    path.join(BOT_ROOT, spec),
    path.join(BOT_ROOT, spec) + '.js',
  ];
  for (const t of tries) {
    try {
      if (fs.statSync(t).isFile()) return t;
    } catch {
      /* skip */
    }
  }
  return null;
}

// ─── Entry-point discovery ──────────────────────────────────────────────────

function* walkJs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (full.includes('/node_modules/')) continue;
    if (e.isDirectory()) {
      yield* walkJs(full);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      yield full;
    }
  }
}

function discoverEntries() {
  const eps = new Set();
  // Web server
  const web = path.join(BOT_ROOT, 'whatsapp-bot.js');
  if (fs.existsSync(web)) eps.add(web);
  const dashboard = path.join(BOT_ROOT, 'dashboard', 'index.js');
  if (fs.existsSync(dashboard)) eps.add(dashboard);

  // Workers
  const workersDir = path.join(BOT_ROOT, 'workers');
  if (fs.existsSync(workersDir)) {
    for (const f of fs.readdirSync(workersDir)) {
      if (f.endsWith('.js')) eps.add(path.join(workersDir, f));
    }
  }

  // `node X.js` mentions in any package.json scripts
  for (const pkgPath of [path.join(BOT_ROOT, 'package.json'), path.join(ROOT, 'package.json')]) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    for (const [, val] of Object.entries(pkg.scripts || {})) {
      const re = /node\s+([\w./-]+\.js)/g;
      let m;
      while ((m = re.exec(val))) {
        const candidate = path.resolve(path.dirname(pkgPath), m[1]);
        if (fs.existsSync(candidate)) eps.add(candidate);
      }
    }
  }

  // Infrastructure scripts
  const infra = path.join(ROOT, 'infrastructure', 'scripts');
  if (fs.existsSync(infra)) for (const f of walkJs(infra)) eps.add(f);

  // Top-level scripts
  const scripts = path.join(ROOT, 'scripts');
  if (fs.existsSync(scripts)) for (const f of walkJs(scripts)) eps.add(f);

  // Bot admin / deployment / setup scripts (run via `node bot/scripts/...`).
  // Previously NOT graphed, so a broken require in one of them (e.g. a moved
  // file whose relative path wasn't updated) was invisible to this guard.
  const botScripts = path.join(BOT_ROOT, 'scripts');
  if (fs.existsSync(botScripts)) for (const f of walkJs(botScripts)) eps.add(f);

  // ALL test files (root tests/ + bot/tests/)
  for (const t of [path.join(ROOT, 'tests'), path.join(BOT_ROOT, 'tests')]) {
    if (!fs.existsSync(t)) continue;
    for (const f of walkJs(t)) {
      if (f.endsWith('.test.js')) eps.add(f);
    }
  }

  return [...eps].map((p) => path.resolve(p));
}

// ─── Build the reachable set + edge list ────────────────────────────────────

function buildGraph(entries) {
  const visited = new Set();
  const unresolvedRequired = []; // [{ from, spec }]
  const unresolvedOptional = []; // same shape
  const edges = []; // [{ from, to }]

  const stack = entries.slice();
  while (stack.length) {
    const f = stack.pop();
    if (visited.has(f)) continue;
    visited.add(f);

    for (const r of extractRequires(f)) {
      let target;
      if (r.kind === 'literal') {
        target = resolveLocal(path.dirname(f), r.spec);
      } else {
        target = resolvePathResolve(r.spec);
        if (target === 'BARE_MODULE') continue; // ignore bare deps via path.join
      }
      if (target === null) {
        if (r.isOptional) unresolvedOptional.push({ from: f, spec: r.spec });
        else unresolvedRequired.push({ from: f, spec: r.spec });
        continue;
      }
      if (target.includes('/node_modules/')) continue;
      edges.push({ from: f, to: target });
      if (!visited.has(target)) stack.push(target);
    }
  }
  return { reachable: visited, unresolvedRequired, unresolvedOptional, edges };
}

// ─── Tarjan's SCC (iterative) ───────────────────────────────────────────────

function tarjanSCC(nodes, adj) {
  const indexes = new Map();
  const lowlinks = new Map();
  const onStack = new Set();
  const stack = [];
  let index = 0;
  const result = [];

  function strongconnectIter(start) {
    const work = [[start, 0, adj.get(start) ? [...adj.get(start)] : []]];
    indexes.set(start, index);
    lowlinks.set(start, index);
    index += 1;
    stack.push(start);
    onStack.add(start);

    while (work.length) {
      const frame = work[work.length - 1];
      const [node, , succs] = frame;
      if (frame[1] < succs.length) {
        const succ = succs[frame[1]];
        frame[1] += 1;
        if (!indexes.has(succ)) {
          indexes.set(succ, index);
          lowlinks.set(succ, index);
          index += 1;
          stack.push(succ);
          onStack.add(succ);
          work.push([succ, 0, adj.get(succ) ? [...adj.get(succ)] : []]);
        } else if (onStack.has(succ)) {
          lowlinks.set(node, Math.min(lowlinks.get(node), indexes.get(succ)));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          lowlinks.set(parent, Math.min(lowlinks.get(parent), lowlinks.get(node)));
        }
        if (lowlinks.get(node) === indexes.get(node)) {
          const scc = [];
          for (;;) {
            const w = stack.pop();
            onStack.delete(w);
            scc.push(w);
            if (w === node) break;
          }
          if (scc.length > 1) result.push(scc);
        }
      }
    }
  }

  for (const n of nodes) {
    if (!indexes.has(n)) strongconnectIter(n);
  }
  return result;
}

// ─── Memoised public API ────────────────────────────────────────────────────

let _cache = null;

function getGraph() {
  if (_cache) return _cache;
  const entries = discoverEntries();
  const g = buildGraph(entries);
  // Build the adjacency map for SCC use.
  const adj = new Map();
  for (const e of g.edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from).add(e.to);
  }
  const allNodes = new Set([...adj.keys()]);
  for (const succs of adj.values()) for (const s of succs) allNodes.add(s);
  _cache = {
    entries,
    reachable: g.reachable,
    unresolvedRequired: g.unresolvedRequired,
    unresolvedOptional: g.unresolvedOptional,
    edges: g.edges,
    adj,
    allNodes,
    findCycles() {
      return tarjanSCC([...this.allNodes], this.adj);
    },
  };
  return _cache;
}

// For testing: lets a test reset the cache between integration runs.
function _resetCache() {
  _cache = null;
}

// File enumeration in the dirs the orphan guard audits.
const AUDITED_DIRS = [
  path.join(BOT_ROOT, 'shared', 'services'),
  path.join(BOT_ROOT, 'shared', 'handlers'),
  path.join(BOT_ROOT, 'shared', 'storage'),
  path.join(BOT_ROOT, 'shared', 'utils'),
  path.join(BOT_ROOT, 'shared', 'config'),
];

function auditedFiles() {
  const out = [];
  for (const d of AUDITED_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of walkJs(d)) {
      if (f.includes('/__mocks__/') || f.includes('/__tests__/')) continue;
      out.push(path.resolve(f));
    }
  }
  return out;
}

function relPath(p) {
  return p.replace(ROOT + '/', '');
}

module.exports = {
  ROOT,
  BOT_ROOT,
  getGraph,
  auditedFiles,
  relPath,
  // Lower-level pieces exported so individual guards can use them:
  stripComments,
  extractRequires,
  resolveLocal,
  isInTryCatch,
  tarjanSCC,
  _resetCache,
};
