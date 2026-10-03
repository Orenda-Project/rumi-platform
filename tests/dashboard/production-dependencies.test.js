/**
 * A production install has only `dependencies`.
 *
 * Deploys run `npm ci --omit=dev` and then start the dashboard, or build the
 * portal. A package the running dashboard requires, or one the portal build
 * loads, that is listed under devDependencies is simply not there: the
 * dashboard dies at boot with "Cannot find module", the portal build stops
 * before it bundles anything. The test suite never notices, because tests run
 * on a full install.
 *
 * Dashboard: walk the require graph from the processes a deploy starts
 * (entrypoint.js spawns cluster.js or a worker; cluster.js forks index.js) and
 * check every bare package against dependencies.
 * Portal: `npm run build` loads vite.config.ts, the PostCSS config, and the
 * Tailwind config; every package those import must be a dependency.
 */

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const ROOT = path.resolve(__dirname, '../..');
const DASHBOARD = path.join(ROOT, 'dashboard');
const PORTAL = path.join(ROOT, 'portal');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
const isBuiltin = (spec) => spec.startsWith('node:') || builtinModules.includes(packageName(spec));

function resolveLocal(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

/** package name -> files under dashboard/ that require it, reachable from the deployed processes. */
function dashboardRuntimePackages() {
  const workers = fs.readdirSync(path.join(DASHBOARD, 'workers'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(DASHBOARD, 'workers', f));
  const roots = ['entrypoint.js', 'cluster.js', 'index.js'].map((f) => path.join(DASHBOARD, f)).concat(workers);
  const seen = new Set();
  const packages = new Map();
  const visit = (file) => {
    if (seen.has(file) || !file.endsWith('.js') || !file.startsWith(DASHBOARD + path.sep)) return;
    seen.add(file);
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const [, spec] of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (spec.startsWith('.')) {
        const target = resolveLocal(file, spec);
        if (target) visit(target);
      } else if (!isBuiltin(spec)) {
        const name = packageName(spec);
        if (!packages.has(name)) packages.set(name, new Set());
        packages.get(name).add(path.relative(ROOT, file));
      }
    }
  };
  roots.forEach(visit);
  return { packages, files: seen.size };
}

describe('dashboard: npm ci --omit=dev installs everything it requires', () => {
  const pkg = readJson(path.join(DASHBOARD, 'package.json'));
  const { packages, files } = dashboardRuntimePackages();

  test('the walk reaches the server and its routes', () => {
    expect(files).toBeGreaterThan(30);
    expect([...packages.keys()]).toEqual(expect.arrayContaining(['express', 'pg']));
  });

  test('every package the running dashboard requires is in dependencies', () => {
    const missing = [...packages]
      .filter(([name]) => !(pkg.dependencies || {})[name])
      .map(([name, from]) => `${name} (required by ${[...from].join(', ')})`);
    expect(missing).toEqual([]);
  });

  test('the lockfile agrees: no runtime package is marked dev-only', () => {
    const lock = readJson(path.join(DASHBOARD, 'package-lock.json'));
    const rootEntry = lock.packages[''];
    const devOnly = [...packages.keys()].filter(
      (name) => !(rootEntry.dependencies || {})[name] || (lock.packages[`node_modules/${name}`] || {}).dev === true,
    );
    expect(devOnly).toEqual([]);
  });
});

describe('portal: npm ci --omit=dev && npm run build works', () => {
  const pkg = readJson(path.join(PORTAL, 'package.json'));
  const deps = pkg.dependencies || {};
  const viteConfig = fs.readFileSync(path.join(PORTAL, 'vite.config.ts'), 'utf8');

  test('the build script is a plain vite build', () => {
    // If it ever runs tsc or another tool first, that tool must be a dependency too.
    expect(pkg.scripts.build).toBe('vite build');
    expect(deps.vite).toBeDefined();
  });

  test('every package vite.config.ts imports at load time is in dependencies', () => {
    const imports = [...stripComments(viteConfig).matchAll(/^import\s[^'"]*?['"]([^'"]+)['"]/gm)]
      .map((m) => m[1])
      .filter((spec) => !spec.startsWith('.') && !isBuiltin(spec))
      .map(packageName);
    expect(imports).toEqual(expect.arrayContaining(['vite']));
    expect(imports.filter((name) => !deps[name])).toEqual([]);
  });

  test('the dev-only component tagger is loaded only for a development build', () => {
    expect(viteConfig).not.toMatch(/^import[^;]*['"]lovable-tagger['"]/m);
    expect(viteConfig).toMatch(/mode === "development"[\s\S]{0,200}import\("lovable-tagger"\)/);
  });

  test('the CSS toolchain the build runs (PostCSS plugins, Tailwind and its plugins) is in dependencies', () => {
    const postcss = fs.readFileSync(path.join(PORTAL, 'postcss.config.js'), 'utf8');
    const postcssPlugins = [...postcss.matchAll(/^\s*["']?([\w@/-]+)["']?\s*:\s*\{/gm)].map((m) => m[1]).filter((n) => n !== 'plugins');
    const tailwind = fs.readFileSync(path.join(PORTAL, 'tailwind.config.ts'), 'utf8');
    const tailwindRequires = [...tailwind.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => packageName(m[1]));
    const needed = ['postcss', ...postcssPlugins, ...tailwindRequires];
    expect(needed).toEqual(expect.arrayContaining(['postcss', 'tailwindcss', 'autoprefixer']));
    expect(needed.filter((name) => !deps[name])).toEqual([]);
  });
});
