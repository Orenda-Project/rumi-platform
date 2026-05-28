/**
 * Brand-URL hygiene guard.
 *
 * No file under `bot/`, `dashboard/`, `portal/`, or `scripts/` may contain
 * a literal mention of the upstream Rumi brand domains (`hellorumi.ai`,
 * `portal.hellorumi.ai`, `taleemabad.com`). Brand URLs MUST flow through
 * the env-driven `bot/shared/config/branding.js` helpers (or, for the
 * dashboard, `process.env.WEBSITE_URL / PORTAL_URL / …`) so a forked
 * deployment serves the fork's own domains, not the upstream's.
 *
 * Top-level docs (`README.md`, `CHANGELOG.md`) MAY mention `hellorumi.ai`
 * as project provenance (and only the README does today, as a "Website"
 * link in the header + the "About" footer). Other markdown — and ALL
 * code — must be brand-neutral.
 *
 * Allowlist intent: empty by default. The README's project-attribution
 * links are scope-excluded by directory (we only scan source roots) and
 * by file (we explicitly skip the source dir root README.md if it ever
 * lands in scope). If you find yourself wanting to add an entry, ask
 * first whether the literal really belongs there or whether it should
 * flow through `branding.js` instead.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

// Source-code roots we scan. Markdown under these dirs is scanned too —
// brand drift in `docs/`, `bot/README.md`, etc. is still drift.
const SOURCE_ROOTS = [
  path.join(ROOT, 'bot'),
  path.join(ROOT, 'dashboard'),
  path.join(ROOT, 'portal'),
  path.join(ROOT, 'scripts'),
];

// File extensions we scan inside source roots.
const SCANNED_EXTS = new Set(['.js', '.ts', '.json', '.md', '.html', '.txt', '.yml', '.yaml']);

// Directory names skipped during recursion.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__mocks__', '__snapshots__']);

// Brand literals that MUST NOT appear in source.
const FORBIDDEN_PATTERNS = [
  /hellorumi\.ai/i,
  /\btaleemabad\.com\b/i,
];

// Allowlist: exact (project-root-relative) file paths we won't flag, with a
// human reason. Empty by default — keep it that way.
const ALLOWLIST = new Map([
  // (no entries)
]);

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

describe('Brand-URL hygiene — no hardcoded upstream brand domains in source', () => {
  it('every literal `hellorumi.ai` / `taleemabad.com` reference flows through an env var', () => {
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
    // The point of the empty allowlist is to make every new brand reference
    // a deliberate test edit. If a real exception comes up, document the
    // reason in this comment and the ALLOWLIST entry — and try the
    // env-driven path first.
    expect(ALLOWLIST.size).toBe(0);
  });
});
