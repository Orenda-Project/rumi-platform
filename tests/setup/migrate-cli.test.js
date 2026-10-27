/**
 * `node infrastructure/scripts/migrate.js`, run as SETUP.md says, from the repo
 * root. It failed on every fresh clone before touching the database:
 *   - "Cannot find module '@supabase/supabase-js'": the library is installed
 *     in bot/node_modules, and the repo root's package installs no copy;
 *   - and it never read .env, so SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY were
 *     missing unless exported by hand.
 * migrate.js now falls back to bot/'s copy of the library and reads the repo's
 * .env the way bootstrap-db.js does (one shared reader, repo-env.js).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const BOT_HAS_SUPABASE = fs.existsSync(path.join(ROOT, 'bot/node_modules/@supabase/supabase-js/package.json'));
const ROOT_HAS_SUPABASE = fs.existsSync(path.join(ROOT, 'node_modules/@supabase/supabase-js/package.json'));

describe('repo-env — the .env reader bootstrap-db.js and migrate.js share', () => {
  const { loadRepoEnv } = require('../../infrastructure/scripts/repo-env');
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-env-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads KEY=value lines, strips quotes, and never overrides a variable already set', () => {
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, '# comment\nSUPABASE_URL="https://abc.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY=k1\nALREADY=from-file\n');
    const env = { ALREADY: 'from-shell' };

    loadRepoEnv(file, env);

    expect(env).toEqual({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k1', ALREADY: 'from-shell' });
  });

  it('does nothing when there is no .env yet', () => {
    const env = {};
    expect(() => loadRepoEnv(path.join(dir, 'missing.env'), env)).not.toThrow();
    expect(env).toEqual({});
  });
});

describe('migrate.js from the repo root', () => {
  // Only meaningful where bot deps are installed and the root has no copy —
  // which is exactly a developer's clone. CI runs root tests before installing
  // bot deps, so there the library is absent everywhere and nothing can load it.
  const runIt = BOT_HAS_SUPABASE && !ROOT_HAS_SUPABASE ? it : it.skip;

  runIt('loads without NODE_PATH, finding the Supabase library under bot/', () => {
    const env = { ...process.env };
    delete env.NODE_PATH;
    const r = spawnSync(process.execPath, ['-e', "require('./infrastructure/scripts/migrate.js'); console.log('loaded')"], {
      cwd: ROOT, env, encoding: 'utf8',
    });
    expect(r.stderr).not.toMatch(/Cannot find module '@supabase\/supabase-js'/);
    expect(r.stdout).toContain('loaded');
  });

  it('reads the repo .env before checking for SUPABASE_URL', () => {
    const src = fs.readFileSync(path.join(ROOT, 'infrastructure/scripts/migrate.js'), 'utf8');
    const cli = src.slice(src.indexOf('if (require.main === module)'));
    expect(cli).toMatch(/loadRepoEnv\(/);
    expect(cli.indexOf('loadRepoEnv(')).toBeLessThan(cli.indexOf('process.env.SUPABASE_URL'));
  });

  it('bootstrap-db.js uses the same reader', () => {
    const src = fs.readFileSync(path.join(ROOT, 'infrastructure/scripts/bootstrap-db.js'), 'utf8');
    expect(src).toMatch(/require\('\.\/repo-env'\)/);
    expect(src).not.toMatch(/function loadRepoEnv/);
  });
});
