/**
 * No openable file URL in logs.
 *
 * Teachers' files (lesson plans, quiz / reading / coaching reports, exam
 * scans, voice notes, videos) live behind URLs that open for anyone holding
 * them: presigned R2/S3 URLs carry their signature in the query string,
 * public r2.dev URLs need no signature at all, and Gamma export URLs are
 * public. Logs are read by far more people (and tools) than the files'
 * owners, so a log line must never carry such a URL whole. Log
 * `redactUrl(url)` (bot/shared/utils/redact-url.js, or dashboard/lib/
 * redact-url.js) instead — it keeps the host and a short hash of the path,
 * enough to correlate, not enough to open.
 *
 * This is a source scan. It finds every `logToFile(`, `console.<level>(` and
 * `logger.<level>(` call in bot/ and dashboard/, reads the call's arguments
 * up to the matching paren (so multi-line calls are covered), drops string
 * literal text and anything already wrapped in `redactUrl(...)` /
 * `Boolean(...)`, and flags:
 *   - an identifier named like a URL (`*Url`, `*_url`, `url`, `*Urls`) whose
 *     name suggests a file (pdf, report, file, export, presigned, public,
 *     media, video, image, …), passed raw — as an argument, a shorthand
 *     property (`{ pdfUrl }`), a property value, or inside a template
 *     literal's `${…}`; a truncation (`pdfUrl.substring(0, 80)`) counts too,
 *     since a prefix of a public URL can be the whole openable path;
 *   - a whole response body (`statusResponse.data`) logged from a file that
 *     talks to Gamma, whose responses carry the export URL.
 * Reading the URL only for a yes/no (`!!pdfUrl`, `pdfUrl ? … : …`,
 * `pdfUrl.length`, `pdfUrl.includes(…)`) is fine.
 *
 * The allowlist below is by identifier, not by file, and every entry says
 * why that name is never a file URL.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_ROOTS = ['bot', 'dashboard'].map((d) => path.join(ROOT, d));

// Not server code, or not ours: tests and their mocks, built frontend assets,
// browser-side static scripts (their console is the viewer's own browser).
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  'tests', 'test', '__tests__', '__mocks__', '__snapshots__',
  'public', 'portal-frontend',
]);
const isTestFile = (name) => /\.(test|spec)\.js$/.test(name);

// Identifier → reason it is never a file URL. A bare key (`videoQueueUrl`)
// holds everywhere; a `path:identifier` key holds in that one file only.
// The operator CLIs under bot/scripts/ print to the operator's own terminal,
// and what they print there is configuration the operator has to copy.
const ALLOWLIST = new Map([
  ['req.url', 'incoming request path (a route) in the dashboard request logs'],
  ['videoQueueUrl', 'the SQS queue endpoint for video jobs'],
  ['assetBaseUrl', 'base URL of the public product-asset host, not an object'],
  ['R2_PUBLIC_URL', 'base URL of the bucket, printed for the operator to configure'],
  ['bot/scripts/deployment/configure-menu-command.js:url', 'the Graph API endpoint being called'],
  ['bot/scripts/setup/interactive-setup.js:urls', 'the webhook Request URLs the operator pastes into Slack'],
  ['bot/scripts/onboarding/upload-feature-videos.js:publicUrl', 'product feature-intro video, printed for the operator to configure'],
  ['bot/scripts/onboarding/upload-feature-videos.js:url', 'product feature-intro video, printed for the operator to configure'],
]);

const LOG_CALL_RE = /(?<![\w$.])(?:logToFile|console\.(?:log|info|warn|error|debug|trace)|logger\.(?:log|info|warn|error|debug|trace|fatal))\s*\(/g;

// A URL-ish identifier segment: `url`, `pdfUrl`, `report_url`, `slideUrls`, `href`.
const URLISH_RE = /(?:^|_|[a-z0-9])(?:url|Url|URL|uri|Uri|URI)s?$|^href$/;
// Words that make a URL-ish name a file URL.
const FILE_WORD_RE = /pdf|report|file|export|presign|signed|public|media|video|audio|voice|image|img|photo|asset|download|gamma|slide|doc|r2|s3|storage|ephemeral|segment|background|thumbnail|attachment|final|cached|existing/i;
// After `<url>.`, these only read the URL for a yes/no or a size.
const SAFE_MEMBERS = new Set(['length', 'includes', 'startsWith', 'endsWith']);
// Calls whose result can't be the URL (redaction, a boolean, field names).
const SAFE_WRAPPERS = /(?<![\w$.])(?:redactUrl|redactUrls|Boolean|Object\.keys)\s*\(/g;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.js') && !isTestFile(e.name)) out.push(full);
  }
  return out;
}

// Whether a `/` at `i` starts a regex literal rather than dividing: true when
// the code before it ends in an operator, an opening bracket, or a keyword.
function regexCanStart(chars, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(chars[j])) j -= 1;
  if (j < 0) return true;
  if ('(,=:[!&|?{};+-*%<>~^'.includes(chars[j])) return true;
  const word = chars.slice(Math.max(0, j - 10), j + 1).join('').match(/[A-Za-z]+$/);
  return Boolean(word && /^(?:return|typeof|case|in|of|void|delete|throw|new)$/.test(word[0]));
}

/**
 * Returns `src` with comments removed and string / template literal text
 * blanked to spaces (same length, newlines kept, so offsets and line numbers
 * survive). `${…}` expressions inside template literals are kept as code.
 */
function blankLiterals(src) {
  const out = src.split('');
  const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
  // Stack of contexts: 'code' (with brace depth) or 'tpl'.
  const stack = [{ kind: 'code', depth: 0 }];
  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i];
    if (top.kind === 'tpl') {
      if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (c === '`') { stack.pop(); i += 1; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push({ kind: 'code', depth: 0 }); i += 2; continue; }
      blank(i); i += 1; continue;
    }
    // code
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { blank(i); i += 1; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i += 1) blank(i);
      continue;
    }
    if (c === '\'' || c === '"') {
      i += 1;
      while (i < src.length && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { blank(i); i += 1; }
        blank(i); i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '`') { stack.push({ kind: 'tpl' }); i += 1; continue; }
    // A regex literal (`/^https?:\/\//`) — a `/` where a value is expected.
    // Its body is blanked so a `//` inside it isn't read as a comment.
    if (c === '/' && regexCanStart(out, i)) {
      i += 1;
      let inClass = false;
      while (i < src.length && src[i] !== '\n' && (inClass || src[i] !== '/')) {
        if (src[i] === '\\') { blank(i); i += 1; } else if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        blank(i); i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '{') top.depth += 1;
    if (c === '}') {
      if (top.depth === 0 && stack.length > 1) { stack.pop(); i += 1; continue; }
      top.depth -= 1;
    }
    i += 1;
  }
  return out.join('');
}

// Index of the paren matching the one at `open` in literal-blanked code.
function matchParen(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return code.length;
}

// Blank every `redactUrl(…)` / `Boolean(…)` call (name and arguments).
function blankSafeWrappers(args) {
  let out = args;
  SAFE_WRAPPERS.lastIndex = 0;
  let m;
  while ((m = SAFE_WRAPPERS.exec(out))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(out, open);
    out = out.slice(0, m.index) + ' '.repeat(close + 1 - m.index) + out.slice(close + 1);
    SAFE_WRAPPERS.lastIndex = m.index;
  }
  return out;
}

const IDENT_PATH_RE = /(?<![\w$])[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*/g;

/** Offending expressions in one call's (literal-blanked) argument text. */
function findOffenders(args, { gamma, rel, used }) {
  const code = blankSafeWrappers(args);
  const hits = [];
  IDENT_PATH_RE.lastIndex = 0;
  let m;
  while ((m = IDENT_PATH_RE.exec(code))) {
    const segs = m[0].split(/\s*\??\.\s*/);
    const before = code.slice(0, m.index).replace(/\s+$/, '');
    const after = code.slice(m.index + m[0].length).replace(/^\s+/, '');
    const prev = before.slice(-1);

    // `{ key: …` — an object key names the field, it isn't the value.
    if (after[0] === ':' && (prev === '{' || prev === ',')) continue;

    // A Gamma success body carries the export URL; an error body (`error.response.data`) doesn't.
    if (gamma && /response$/i.test(segs[segs.length - 2] || '') && segs[segs.length - 1] === 'data'
        && !/^(?:e|err|error)$/.test(segs[0])) {
      hits.push(m[0]);
      continue;
    }

    // First URL-ish segment that names a file.
    const idx = segs.findIndex((s) => URLISH_RE.test(s));
    if (idx === -1) continue;
    const named = segs.slice(0, idx + 1).join('.');
    if (!FILE_WORD_RE.test(segs[idx]) && !/^(?:url|urls|uri|href)$/i.test(segs[idx])) continue;
    const exempt = [named, segs[idx]].flatMap((k) => [k, `${rel}:${k}`]).find((k) => ALLOWLIST.has(k));
    if (exempt) { used.add(exempt); continue; }
    // `pdfUrl.length`, `pdfUrl.includes(…)` — a size or a yes/no.
    if (idx < segs.length - 1 && SAFE_MEMBERS.has(segs[idx + 1])) continue;
    // `isR2Url` / `isR2Url(…)` — a flag or predicate about a URL is a yes/no.
    if (/^(?:is|has)[A-Z]/.test(segs[segs.length - 1])) continue;
    // `!!pdfUrl`, `!pdfUrl`, `typeof pdfUrl`.
    if (prev === '!' || /\btypeof$/.test(before)) continue;
    // `pdfUrl ? … : …` (but not `?.` / `??`), and comparisons.
    if (after[0] === '?' && after[1] !== '?' && after[1] !== '.') continue;
    if (/^(?:===?|!==?)/.test(after) || /(?:===?|!==?)$/.test(before)) continue;
    hits.push(m[0]);
  }
  return hits;
}

function scanSource(src, rel = '', used = new Set()) {
  const code = blankLiterals(src);
  const gamma = /gamma/i.test(src);
  const violations = [];
  LOG_CALL_RE.lastIndex = 0;
  let m;
  while ((m = LOG_CALL_RE.exec(code))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(code, open);
    const args = code.slice(open + 1, close);
    const line = code.slice(0, m.index).split('\n').length;
    for (const expr of findOffenders(args, { gamma, rel, used })) {
      violations.push({ line, expr: expr.replace(/\s+/g, '') });
    }
  }
  return violations;
}

function scanTree() {
  const files = SOURCE_ROOTS.flatMap((r) => walk(r));
  const violations = [];
  const used = new Set();
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    for (const v of scanSource(fs.readFileSync(f, 'utf8'), rel, used)) {
      violations.push(`${rel}:${v.line} — ${v.expr}`);
    }
  }
  return { files, violations, used };
}

describe('no openable file URL in logs', () => {
  it('no log call in bot/ or dashboard/ passes a raw file URL (wrap it in redactUrl)', () => {
    const { files, violations } = scanTree();
    expect(files.length).toBeGreaterThan(100);
    expect(violations).toEqual([]);
  });

  it('every allowlist entry still exempts a real log call (no stale entries)', () => {
    const { used } = scanTree();
    expect([...ALLOWLIST.keys()].filter((k) => !used.has(k))).toEqual([]);
  });

  describe('the scanner itself', () => {
    const flagged = (src) => scanSource(src).map((v) => v.expr);

    it('flags shorthand, property values, positional args and template literals', () => {
      expect(flagged("logToFile('sent', { quizId, pdfUrl, band });")).toEqual(['pdfUrl']);
      expect(flagged("logToFile('up', { key, url: publicUrl });")).toEqual(['publicUrl']);
      expect(flagged("console.log('presigned:', presignedUrl);")).toEqual(['presignedUrl']);
      expect(flagged('console.warn(`bad video_url: ${video.video_url}`);')).toEqual(['video.video_url']);
      expect(flagged("console.log(`orig: ${r2Url.substring(0, 80)}`);")).toEqual(['r2Url.substring']);
    });

    it('finds the argument list of a multi-line call', () => {
      const src = [
        "logToFile('✅ Report PDF uploaded to R2', {",
        '  coachingSessionId,',
        '  reportPdfUrl,',
        '});',
      ].join('\n');
      expect(scanSource(src)).toEqual([{ line: 1, expr: 'reportPdfUrl' }]);
    });

    it('reads past a regex literal containing `//` (not a comment)', () => {
      const src = "const t = `${base.replace(/^https?:\\/\\//, '')}/q`;\nlogToFile('sent', { pdfUrl });";
      expect(flagged(src)).toEqual(['pdfUrl']);
    });

    it('flags a whole response body logged from a Gamma client', () => {
      const src = "// polls gamma\nlogToFile('status', { data: statusResponse.data });";
      expect(flagged(src)).toEqual(['statusResponse.data']);
      expect(flagged("logToFile('s', { status: statusResponse.data.status });")).toEqual([]);
      expect(flagged("// gamma\nlogToFile('s', { fields: Object.keys(statusResponse.data) });")).toEqual([]);
      expect(flagged("// gamma\nlogToFile('e', { errorDetails: error.response?.data });")).toEqual([]);
    });

    it('leaves redacted, yes/no and non-file URLs alone', () => {
      expect(flagged("logToFile('sent', { pdfUrl: redactUrl(pdfUrl) });")).toEqual([]);
      expect(flagged("logToFile('PDF URL stored', { hasUrl: !!pdfUrl, n: pdfUrl.length });")).toEqual([]);
      expect(flagged("console.log(`stored${pdfUrl ? ' (with PDF URL)' : ''}`);")).toEqual([]);
      expect(flagged("logToFile('sent', { deliveredViaUrl: Boolean(finalVideoUrl) });")).toEqual([]);
      expect(flagged("logToFile('queue', { queueUrl: this.queueUrl, homeserverUrl });")).toEqual([]);
      expect(flagged("console.warn(`slow: ${req.method} ${req.url}`);")).toEqual([]);
      expect(flagged("logToFile('no SUPABASE_URL / pdfUrl here');")).toEqual([]);
    });
  });
});
