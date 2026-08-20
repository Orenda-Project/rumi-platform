/**
 * Source Hygiene (Phase 6) — two conformance guards for the public repo:
 *
 * 1. No internal ticket references (bd-NNN / BUG-NNN / "Bug #NN" / PROJ-/FEAT-/TASK-NNN)
 *    in shipped source. These leak internal tracking into a public repo and gitleaks
 *    doesn't catch them (they aren't secrets). Scans non-test bot/dashboard/infra source.
 *
 * 2. Entry-point files parse. The bot entry (whatsapp-bot.js), workers, and CLI scripts
 *    are run via `node`, never imported by a test — so a syntax error (e.g. a missing
 *    brace from a bad merge) sails through the jest suite and lint, and the process just
 *    fails to boot. `node --check` each of them here.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

// Other test suites legitimately create and remove real directories under
// the repo root while these tree-walkers run concurrently in a different
// Jest worker (e.g. tests/setup/graduate.test.js's repo-anchored
// .rumi-test-state fixture) — a directory listed at readdirSync time can be
// gone by the time a walker recurses into it. That's not a real hygiene
// violation, just a benign race; treat a vanished directory as empty rather
// than letting ENOENT fail an unrelated test. Confirmed live in CI.
function safeReaddirSync(d) {
  try {
    return fs.readdirSync(d, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  }
}

// Internal ticket namespaces. Includes the dashboard's own `plt-*` / `etv-*` bead
// prefixes (they leaked through `Bead:` comment headers + SQL migration headers because
// the original guard only knew bd-/BUG-/PROJ-/FEAT-/TASK- and never scanned .sql).
const REF_RE = /\b(?:bd-\d+|BUG-\d+|PROJ-\d+|FEAT-\d+|TASK-\d+|plt-[a-z0-9]+|etv-[a-z0-9]+|[Bb][Uu][Gg]\s*#\d+)\b/;

// Internal context that must never appear in public agent-native docs (org/partner names,
// tester names, deployment phone numbers). Env-var names like SUPABASE_SERVICE_ROLE_KEY are
// legitimate and intentionally NOT listed here.
const INTERNAL_RE = /\b(?:Taleemabad|TaleemHub|Rawalpindi|Silverleaf|Junaid|Aloyce|Shams|Attar)\b|\+92\d|\+255\d|\b0?329[\s-]?5012345\b|\b5012345\b/i;

// A real secret assigned to a credential variable — a UUID or a long contiguous
// high-entropy value (a live RAILWAY_ACCOUNT_TOKEN UUID once leaked into a doc and
// gitleaks didn't flag it, because docs were path-allowlisted and a bare UUID isn't
// a default rule). This runs in the unit suite as a second layer under gitleaks.
const SECRET_ASSIGN_RE = /(?:token|secret|password|api[_-]?key|access[_-]?token|account[_-]?token|service[_-]?role[_-]?key)["']?\s*[:=]\s*["']?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{32,})/i;
// The actual deployment phone numbers (prod PK / TZ) — precise, so synthetic example
// numbers like +92300… in schema docs don't false-positive.
const DEPLOY_PHONE_RE = /\b0?329[\s-]?5012345\b|\b5012345\b|255[\s-]?677[\s-]?095/;
// Placeholders that look secret-ish but are intentional doc examples.
const PLACEHOLDER_RE = /your-[a-z-]*|YOUR_[A-Z_]+|<[a-z][a-z0-9 _-]*>|CHANGEME|need-to-get|example/i;

// Agent-native markdown: progressive-disclosure routers + skill docs (all public).
function collectAgentDocs() {
  const docs = [];
  for (const top of ['CLAUDE.md', 'AGENTS.md']) {
    const p = path.join(ROOT, top);
    if (fs.existsSync(p)) docs.push(p);
  }
  const walk = (d) => {
    for (const e of safeReaddirSync(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(e.name)) continue;
        walk(p);
      } else if (e.name === 'CLAUDE.md') {
        docs.push(p);
      }
    }
  };
  walk(ROOT);
  // every .md under .claude/ (skill docs)
  const claudeDir = path.join(ROOT, '.claude');
  if (fs.existsSync(claudeDir)) {
    const walkMd = (d) => {
      for (const e of safeReaddirSync(d)) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walkMd(p); }
        else if (e.name.endsWith('.md')) docs.push(p);
      }
    };
    walkMd(claudeDir);
  }
  return [...new Set(docs)];
}

// Every markdown file in the repo (excluding deps, vendored fonts, build output).
function collectAllMarkdown() {
  const out = [];
  const walk = (d) => {
    for (const e of safeReaddirSync(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(e.name)) continue;
        if (p.includes(`${path.sep}bot${path.sep}fonts${path.sep}`) || e.name === 'fonts') continue;
        walk(p);
      } else if (e.name.endsWith('.md')) {
        out.push(p);
      }
    }
  };
  walk(ROOT);
  return out;
}

function collect(dir, exts) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  const walk = (d) => {
    for (const e of safeReaddirSync(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage', 'tests', '__tests__'].includes(e.name)) continue;
        walk(p);
      } else if (exts.some((x) => e.name.endsWith(x)) && !e.name.endsWith('.test.js')) {
        out.push(p);
      }
    }
  };
  walk(abs);
  return out;
}

describe('Source Hygiene', () => {
  describe('no internal ticket references in shipped source', () => {
    it('bot/dashboard/infrastructure source is free of bd-/BUG-/PROJ-/FEAT-/TASK-/plt-/etv-/Bug # refs', () => {
      const files = [
        ...collect('bot', ['.js', '.sql']),
        ...collect('dashboard', ['.js', '.ts', '.tsx', '.sql']),
        ...collect('infrastructure', ['.js', '.sql']),
      ];
      const offenders = [];
      for (const f of files) {
        const lines = fs.readFileSync(f, 'utf-8').split('\n');
        lines.forEach((line, i) => {
          if (REF_RE.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
        });
      }
      expect(offenders).toEqual([]);
    });

    it('docs/flows/*.json carry no internal ticket refs or authoring metadata (_bead/_changelog)', () => {
      const flowsDir = path.join(ROOT, 'docs', 'flows');
      const offenders = [];
      if (fs.existsSync(flowsDir)) {
        for (const name of fs.readdirSync(flowsDir).filter((n) => n.endsWith('.json'))) {
          const raw = fs.readFileSync(path.join(flowsDir, name), 'utf-8');
          if (REF_RE.test(raw)) offenders.push(`${name}: ticket ref`);
          if (/"_bead"|"_changelog"/.test(raw)) offenders.push(`${name}: _bead/_changelog metadata`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('agent-native docs carry no internal refs or context', () => {
    it('CLAUDE.md routers + AGENTS.md + .claude/**/*.md are free of ticket refs and internal context', () => {
      const offenders = [];
      for (const f of collectAgentDocs()) {
        const lines = fs.readFileSync(f, 'utf-8').split('\n');
        lines.forEach((line, i) => {
          if (REF_RE.test(line) || INTERNAL_RE.test(line)) offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
        });
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('no hardcoded secrets or deployment PII in ANY markdown', () => {
    // Broader than the agent-docs guard above: scans EVERY .md (README, docs/,
    // bot/**, dashboard/**, portal/**) for real credential values and the actual
    // deployment phone numbers — the class that leaked via dashboard/docs and that
    // gitleaks' docs-path allowlist had been skipping.
    it('every .md is free of credential-assignment secrets and real deployment numbers', () => {
      const offenders = [];
      for (const f of collectAllMarkdown()) {
        const lines = fs.readFileSync(f, 'utf-8').split('\n');
        lines.forEach((line, i) => {
          if (PLACEHOLDER_RE.test(line)) {
            // strip the placeholder token, then re-test the remainder
            const stripped = line.replace(new RegExp(PLACEHOLDER_RE.source, 'ig'), '');
            if (SECRET_ASSIGN_RE.test(stripped) || DEPLOY_PHONE_RE.test(stripped)) {
              offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
            }
            return;
          }
          if (SECRET_ASSIGN_RE.test(line) || DEPLOY_PHONE_RE.test(line)) {
            offenders.push(`${path.relative(ROOT, f)}:${i + 1}`);
          }
        });
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('entry-point files parse (node --check)', () => {
    // Files run via `node` and never imported by a test → not syntax-covered by jest.
    const entries = [
      'bot/whatsapp-bot.js',
      ...collect('bot/workers', ['.js']).map((f) => path.relative(ROOT, f)),
      ...collect('infrastructure/scripts', ['.js']).map((f) => path.relative(ROOT, f)),
    ];
    it.each(entries)('%s has valid syntax', (rel) => {
      expect(() => execFileSync('node', ['--check', path.join(ROOT, rel)], { stdio: 'pipe' })).not.toThrow();
    });
  });
});
