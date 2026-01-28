/**
 * Environment Template Completeness Test
 * bd-335: Ensures every process.env.VARIABLE referenced in bot/ code
 * is documented in .env.template so clone users know what to configure.
 *
 * TDD: Write this test FIRST (RED), then update .env.template (GREEN).
 */

const fs = require('fs');
const path = require('path');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .js files under a directory, excluding node_modules.
 */
function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      results.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extract all process.env.VARIABLE_NAME references from a JS source string.
 * Returns a Set of variable names.
 */
function extractEnvVars(source) {
  const vars = new Set();
  const regex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    vars.add(match[1]);
  }
  return vars;
}

/**
 * Parse .env.template and return a Set of all defined variable names.
 * Handles both active lines (VAR=value) and commented-out lines (# VAR=value).
 */
function parseTemplateVars(templateContent) {
  const vars = new Set();
  for (const line of templateContent.split('\n')) {
    // Match lines like:  VAR=value  or  # VAR=value  or  #VAR=value
    const match = line.match(/^#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      vars.add(match[1]);
    }
  }
  return vars;
}

// ── Allow list ───────────────────────────────────────────────────────────────
// Environment variables that are legitimately NOT in .env.template because
// they are standard system/platform vars, injected by Railway, or CI-only.

const ALLOWED_MISSING = new Set([
  // Standard Node.js / OS
  'NODE_ENV',       // Set in template but also a standard var
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'LANG',
  'TMPDIR',
  'TZ',
  'HOSTNAME',
  'PWD',

  // Railway-injected (auto-set by platform, not user-configurable)
  'RAILWAY_REPLICA_ID',
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_STATIC_URL',
  'RAILWAY_PUBLIC_DOMAIN',

  // CI / GitHub Actions
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_SHA',
  'GITHUB_REF',
  'GITHUB_RUN_ID',

  // npm-injected
  'npm_package_name',
  'npm_package_version',
  'npm_lifecycle_event',
]);

// ── Test ─────────────────────────────────────────────────────────────────────

describe('.env.template completeness', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const botDir = path.join(rootDir, 'bot');
  const templatePath = path.join(rootDir, '.env.template');

  let codeEnvVars;      // Set<string> — all vars referenced in bot/ code
  let templateVars;     // Set<string> — all vars defined in .env.template

  beforeAll(() => {
    // 1. Scan all .js files in bot/ for process.env references
    const jsFiles = collectJsFiles(botDir);
    expect(jsFiles.length).toBeGreaterThan(0); // sanity check

    codeEnvVars = new Set();
    for (const filePath of jsFiles) {
      const source = fs.readFileSync(filePath, 'utf-8');
      for (const v of extractEnvVars(source)) {
        codeEnvVars.add(v);
      }
    }

    // 2. Parse .env.template
    expect(fs.existsSync(templatePath)).toBe(true);
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    templateVars = parseTemplateVars(templateContent);
  });

  it('should find process.env references in bot/ code', () => {
    expect(codeEnvVars.size).toBeGreaterThan(0);
  });

  it('should have a non-empty .env.template', () => {
    expect(templateVars.size).toBeGreaterThan(0);
  });

  it('every env var used in bot/ code should be documented in .env.template (or explicitly allowed)', () => {
    const missing = [];

    for (const varName of codeEnvVars) {
      if (ALLOWED_MISSING.has(varName)) continue;
      if (templateVars.has(varName)) continue;
      missing.push(varName);
    }

    if (missing.length > 0) {
      missing.sort();
      const message = [
        `${missing.length} env var(s) referenced in bot/ code but missing from .env.template:`,
        '',
        ...missing.map((v) => `  - ${v}`),
        '',
        'Add them to .env.template or add to ALLOWED_MISSING if they are platform-injected.',
      ].join('\n');

      // Fail with a clear message showing exactly which vars are missing
      expect(missing).toEqual([], message);
    }
  });

  it('ALLOWED_MISSING list should not contain vars that ARE in the template', () => {
    // Keep the allow list clean — if a var is in the template, remove it from ALLOWED_MISSING
    const unnecessaryAllows = [];
    for (const varName of ALLOWED_MISSING) {
      // NODE_ENV is in both the template and the allow list — that is fine because
      // it is a standard system var AND we document it. Skip it.
      if (varName === 'NODE_ENV') continue;
      if (templateVars.has(varName)) {
        unnecessaryAllows.push(varName);
      }
    }

    if (unnecessaryAllows.length > 0) {
      unnecessaryAllows.sort();
      fail(
        `These vars are in ALLOWED_MISSING but also in .env.template (remove from allow list):\n` +
        unnecessaryAllows.map((v) => `  - ${v}`).join('\n')
      );
    }
  });
});
