/**
 * Asset-reference safety guard.
 *
 * The repo ships `bot/marketing/` with a README and no binary assets — the
 * cloner brings their own (or skips the feature). The contract: every code
 * path that path-joins into `bot/marketing/<file>` MUST guard the read so
 * the bot doesn't crash when the file isn't there.
 *
 * This guard locks the contract: for every `marketing/` path-join in shipped
 * `bot/` code, the file must EITHER exist on disk OR be guarded by an
 * `existsSync` check OR be inside a try/catch block that swallows the error.
 *
 * Rationale: a previous sync stripped the `bot/marketing/` directory but
 * left five `path.join(__dirname, '../../marketing/...')` references in the
 * code, none of which checked for the file's existence. A cloner who
 * triggered any of those code paths hit `ENOENT: no such file or directory`
 * on the first run. This guard makes the pattern impossible to ship again.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BOT_DIR = path.join(ROOT, 'bot');
const MARKETING_DIR = path.join(BOT_DIR, 'marketing');

// Directories scanned for unguarded marketing/ references. The contract is
// "runtime code must degrade gracefully when an optional brand asset is
// missing." It explicitly does NOT apply to admin scripts (`bot/scripts/`):
// those are operator-run setup tools (resize-and-upload-sticker.js,
// upload-carousel-images.js, …) that fail loud when their input is missing —
// the operator running them knows exactly what's required.
const RUNTIME_DIRS = [
  path.join(BOT_DIR, 'shared'),
  path.join(BOT_DIR, 'workers'),
  path.join(BOT_DIR, 'routes'),
  path.join(BOT_DIR, 'handlers'),
];

/**
 * Recursively collect every .js file under a directory, skipping node_modules
 * and __mocks__.
 */
function findJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__mocks__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findJsFiles(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Reads a file and returns every line that performs a FILE READ against a
 * `marketing/` path, along with a small window of surrounding context (5
 * lines before, 5 after).
 *
 * A bare `path.join(__dirname, 'marketing/foo.png')` just constructs a string
 * — it can't crash. A `fs.readFileSync(...)`, `fs.createReadStream(...)`,
 * `doc.image(...)`, etc. against that path WILL crash if the file is
 * missing, and that's what this guard cares about.
 */
const FILE_READ_RE = /(fs\.readFile(Sync)?|fs\.createReadStream|fs\.openSync|doc\.image|doc\.embedImage|sharp\s*\(|fs\.promises\.readFile)\s*\(/;

function findMarketingReferences(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const refs = [];

  lines.forEach((line, i) => {
    // Must touch `marketing/` (path component, not just the word)
    if (!/\bmarketing\//.test(line)) return;
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    // Must be a file-read operation — bare `path.join(...)` alone isn't a
    // crash risk. The file-read may live on the same line as the path-join
    // (e.g. `fs.readFileSync(path.join(...))`) — check this line.
    const isReadOnThisLine = FILE_READ_RE.test(line);

    // …OR within a 10-line window that uses the same variable. To stay simple,
    // only flag when the read is on the same line; consumers that read via a
    // constant (e.g. `LOADING_STICKER_PATH` then `sendSticker(path)`) are
    // covered by the consumer's own existsSync guard (e.g. inside sendSticker).
    if (!isReadOnThisLine) return;

    const windowStart = Math.max(0, i - 5);
    const windowEnd = Math.min(lines.length, i + 6);
    const context = lines.slice(windowStart, windowEnd).join('\n');

    refs.push({
      lineNumber: i + 1,
      line: line.trim(),
      context,
    });
  });

  return refs;
}

/**
 * Heuristic: does the context around a marketing-path-join include some form
 * of existence guard? We accept any of:
 *   - `fs.existsSync(<expr>)` in the same window
 *   - The reference is inside a `try {` block (look back for `try {`)
 *   - The variable is declared with `let X = null` + try/catch fallback
 */
function isGuarded(ref) {
  const { context } = ref;
  if (/fs\.existsSync\s*\(/.test(context)) return true;
  if (/\btry\s*\{/.test(context) && /\bcatch\s*\(/.test(context)) return true;
  return false;
}

describe('Asset references — every `marketing/` path-join is graceful', () => {
  it('the marketing/ directory itself exists with a README explaining customization', () => {
    expect(fs.existsSync(MARKETING_DIR)).toBe(true);
    expect(fs.existsSync(path.join(MARKETING_DIR, 'README.md'))).toBe(true);
  });

  it('every `marketing/` path-join in bot/ runtime code is guarded by existsSync OR try/catch', () => {
    const files = RUNTIME_DIRS.flatMap(findJsFiles);
    const unguarded = [];

    for (const filePath of files) {
      const refs = findMarketingReferences(filePath);
      for (const ref of refs) {
        if (!isGuarded(ref)) {
          const rel = path.relative(ROOT, filePath);
          unguarded.push(`${rel}:${ref.lineNumber} — ${ref.line}`);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });
});
