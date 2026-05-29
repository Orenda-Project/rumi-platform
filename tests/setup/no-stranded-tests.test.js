/**
 * No stranded test files (bd-1880).
 *
 * The project collects tests from three locations, each via an explicit
 * `testMatch`:
 *   - root      → tests/jest.config.js (the CI runner) collects the root tests/ tree
 *   - bot       → bot/jest.config.js collects the bot/tests/ tree
 *   - dashboard → dashboard's jest config collects the dashboard/tests/ tree
 *
 * None of those configs collect a `__tests__/` directory (their explicit
 * testMatch overrides Jest's default `__tests__` matching). Two real
 * handler test files were committed under `bot/shared/handlers/__tests__/`
 * and therefore ran ZERO times — silently providing no coverage while
 * looking like they did (and drifting against the current service APIs until
 * they no longer even loaded).
 *
 * This guard locks the convention: no `*.test.js` may live in a `__tests__/`
 * directory anywhere under `bot/` or `dashboard/`. Put tests under the
 * collected `tests/` trees instead. Empty allowlist.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SCAN_ROOTS = ['bot', 'dashboard'].map((d) => path.join(ROOT, d));

function findStrandedTests(dir, insideUnderscoreTests = false) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...findStrandedTests(full, insideUnderscoreTests || e.name === '__tests__'));
    } else if (insideUnderscoreTests && /\.test\.[jt]s$/.test(e.name)) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

describe('No stranded test files (bd-1880)', () => {
  it('no *.test.js lives in a __tests__/ directory under bot/ or dashboard/', () => {
    const stranded = SCAN_ROOTS.flatMap((r) => findStrandedTests(r));
    expect(stranded).toEqual([]);
  });
});
