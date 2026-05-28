/**
 * Unused-dependency conformance.
 *
 * Every entry in `bot/package.json` `dependencies` (or `devDependencies`) must
 * be required from somewhere in shipped code. An "orphan" dep — declared but
 * never `require()`d — inflates `npm install` time, bloats `node_modules`,
 * widens the npm-audit attack surface, and confuses anyone reading the
 * dependency graph.
 *
 * Detection is regex-based. Each declared dep name is searched for as
 * `require('NAME')`, `require("NAME")`, or `from 'NAME'` (in case any file
 * uses ESM imports). A hit anywhere under `bot/` is sufficient.
 *
 * The allowlist below lists deps that are intentionally declared without a
 * `require()` (e.g. used only by an npm script, or required transitively as
 * a peer of an optional dep). Keep the list tight — the preferred state is
 * "no entries; every dep is justified by a require()".
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BOT_DIR = path.join(ROOT, 'bot');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const BOT_PACKAGE_JSON = path.join(BOT_DIR, 'package.json');
// Scope includes the dashboard because its consumers (express middleware, EJS
// view engine, axiom-pino transport, pdfmake) live there.
const SCAN_DIRS = [BOT_DIR, DASHBOARD_DIR];

// Deps that are intentionally not require()'d from shipped code.
const ALLOWLIST = new Set([
  // Transitive Pino transports — pino loads pino-pretty by string name at
  // runtime, not via require. (`pino-pretty` is a devDep, not a prod dep,
  // but the same shape would apply if it were promoted.)
  'pino-pretty',
  // ffmpeg / ffprobe binaries — the *-installer packages export a side-effect
  // path that the `fluent-ffmpeg` library reads from process.env at runtime.
  '@ffmpeg-installer/ffmpeg',
  '@ffprobe-installer/ffprobe',
  // The OptionalDependencies stanza in package.json carries canvas + chartjs.
  // These are exercised via dynamic require for charts (when the feature is
  // built); their presence in the lockfile is intentional.
  'canvas',
  'chartjs-node-canvas',
  // Declared as an optionalDependency so npm 22 on Linux includes the
  // chart.js peer of chartjs-node-canvas in the lockfile (without it, the
  // bot-side `npm ci` fails EUSAGE — "Missing chart.js from lock"). Loaded
  // transitively at runtime by chartjs-node-canvas when charts are built;
  // no source-level require.
  'chart.js',
  // Test runner — Jest loads itself; no source-level require.
  'jest',
  // Express view engine — loaded by name via app.set('view engine', 'ejs').
  'ejs',
]);

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

function isRequired(pkgName, allBotSource) {
  // Match require('<name>'), require("<name>"), import ... from '<name>'
  const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:require\\s*\\(\\s*|from\\s+)['"]${escaped}(?:/[^'"]*)?['"]`
  );
  return re.test(allBotSource);
}

describe('Unused-dependency conformance', () => {
  it('every entry in bot/package.json dependencies is require()d somewhere', () => {
    const pkg = JSON.parse(fs.readFileSync(BOT_PACKAGE_JSON, 'utf-8'));
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.optionalDependencies || {}),
    };

    const allFiles = SCAN_DIRS.flatMap(findJsFiles);
    const allSource = allFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');

    const orphans = [];
    for (const name of Object.keys(allDeps)) {
      if (ALLOWLIST.has(name)) continue;
      if (!isRequired(name, allSource)) {
        orphans.push(name);
      }
    }

    orphans.sort();
    expect(orphans).toEqual([]);
  });
});
