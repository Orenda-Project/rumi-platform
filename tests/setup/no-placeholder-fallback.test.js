/**
 * Placeholder-fallback hygiene guard.
 *
 * No file under `bot/`, `dashboard/`, `portal/`, or `scripts/` may use a
 * literal placeholder URL (`your-portal-domain.com`, `your-website.com`,
 * `your-domain.com`, `your-rumi-clone`) as a defensive default for a brand
 * env var. These were the silent failure mode that shipped working code
 * with broken links: when a cloner forgot to set `PORTAL_URL`, the bot
 * confidently emitted `https://your-portal-domain.com/portal/setup/<token>`
 * into every WhatsApp message.
 *
 * The pattern that replaced them: read the env var, return `null` (not a
 * placeholder string) when unset, and let the call site degrade gracefully
 * — usually by omitting the link line entirely from the outgoing message.
 * See `bot/shared/config/branding.js` for the canonical helpers and the
 * `feature-registration.service.js` / `flow-response.handler.js` /
 * `video-assembly.service.js` / `portal-command.handler.js` /
 * `portal-invite.service.js` / `exam-checker/*` consumers for the pattern.
 *
 * The .env.template MAY mention placeholders inside descriptive comments
 * (e.g. "Leave blank rather than ship a placeholder"). Only the literal
 * SOURCE_ROOTS below are scanned — `.env.template` lives at the project
 * root and is not in scope.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const SOURCE_ROOTS = [
  path.join(ROOT, 'bot'),
  path.join(ROOT, 'dashboard'),
  path.join(ROOT, 'portal'),
  path.join(ROOT, 'scripts'),
];

const SCANNED_EXTS = new Set(['.js', '.ts', '.json', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__mocks__', '__snapshots__']);

const FORBIDDEN_PATTERNS = [
  /your-portal-domain\.com/i,
  /your-website\.com/i,
  /your-website-domain\.com/i,
  // your-domain.com appears legitimately in non-source contexts; in source
  // it's a placeholder for a brand URL or an EMAIL_FROM domain.
  /your-domain\.com/i,
  /your-rumi-clone/i,
];

// Allowlist intentionally empty.
const ALLOWLIST = new Map([]);

function findScannedFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...findScannedFiles(full));
    } else if (SCANNED_EXTS.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

function scanFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.test(line)) {
        hits.push({ lineNumber: i + 1, line: line.trim(), pattern: pat.source });
        break;
      }
    }
  });
  return hits;
}

describe('Placeholder-fallback hygiene — no `your-portal-domain.com` defaults in source', () => {
  it('every brand-env-var read returns null (not a placeholder) when unset', () => {
    const files = SOURCE_ROOTS.flatMap(findScannedFiles);
    const violations = [];

    for (const filePath of files) {
      const rel = path.relative(ROOT, filePath);
      if (ALLOWLIST.has(rel)) continue;
      const hits = scanFile(filePath);
      for (const hit of hits) {
        violations.push(`${rel}:${hit.lineNumber} — matches /${hit.pattern}/ — ${hit.line}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('the allowlist stays empty (ratchet)', () => {
    expect(ALLOWLIST.size).toBe(0);
  });
});
