/**
 * No-eager-SDK-construction conformance.
 *
 * Constructing an SDK client at module load (`const c = new OpenAI({...})`
 * at column 0) crashes the bot at cold-boot whenever the relevant API key
 * isn't set, even if NO code path that requires the SDK is ever invoked.
 *
 * This guard locks the lazy-init contract: every SDK constructor in shipped
 * `bot/shared/` and `bot/workers/` must be wrapped in a function (so that
 * cred-missing errors fire at call time, not at require time), via the
 * `lazyClient()` helper or an equivalent inline pattern (static getter,
 * function-scoped `new`, etc.).
 *
 * Detection is regex-based against the column-0 anti-pattern:
 *
 *   const <name> = new (OpenAI|S3Client|TextractClient|...)({ ... });
 *
 * Indented (≥2-space) `new <SDK>` calls are inside a method body and are
 * lazy by location — those pass the guard.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = ['bot/shared', 'bot/workers'].map((d) => path.join(ROOT, d));

// SDK classes whose eager construction at module-load is the bug pattern.
// Add new SDKs here when the bot starts using them.
const SDK_NAMES = [
  'OpenAI',
  'GoogleGenerativeAI',
  'S3Client',
  'TextractClient',
  'IORedis',
  'Redis',
  'Anthropic',
  'AssemblyAI',
];

// Files that legitimately construct an SDK at module load (e.g. a centralised
// singleton getter that everyone else lazy-wraps). Keep this list tight; the
// preferred pattern is `lazyClient()` and an empty allowlist.
const ALLOWLIST = new Set([
  // None today.
]);

const EAGER_PATTERN = new RegExp(
  `^const\\s+\\w+\\s*=\\s*new\\s+(?:${SDK_NAMES.join('|')})\\b`
);

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

describe('No eager SDK construction at module-load', () => {
  it('every SDK client in bot/shared and bot/workers is lazy-initialised', () => {
    const offenders = [];
    const files = SCAN_DIRS.flatMap(findJsFiles);

    for (const filePath of files) {
      const rel = path.relative(ROOT, filePath);
      if (ALLOWLIST.has(rel)) continue;

      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (EAGER_PATTERN.test(line)) {
          offenders.push(
            `${rel}:${i + 1} — ${line.trim()} — wrap in `
            + '`lazyClient()` (bot/shared/utils/lazy-client.js) so the bot can boot '
            + 'without this SDK\'s env vars set.'
          );
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
