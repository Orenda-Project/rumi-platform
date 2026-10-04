/**
 * The admin pages (/observability/*, the EJS views in dashboard/views/) send a
 * strict Content-Security-Policy.
 *
 * These pages show every teacher's data. A script-src with 'unsafe-inline', a
 * wildcard, or a whole CDN origin (cdn.jsdelivr.net serves any npm package;
 * cdn.tailwindcss.com is a runtime that generates CSS from the page) turns any
 * HTML injection into script execution. So:
 *   - dashboard/lib/admin-csp.js gives each response a fresh nonce
 *     (res.locals.cspNonce) and sets the CSP when a view is rendered;
 *   - every inline <script> in a view carries that nonce, every external one is
 *     same-origin or a pinned file with Subresource Integrity;
 *   - no view uses inline event handler attributes or javascript: URLs, which a
 *     nonce CSP blocks.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { createRequire } = require('module');

const DASHBOARD = path.join(__dirname, '../../dashboard');
const VIEWS = path.join(DASHBOARD, 'views');
const PUBLIC_JS = path.join(DASHBOARD, 'public', 'js');

const NONCE_ATTR = 'nonce="<%= cspNonce %>"';

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

const rel = (p) => path.relative(DASHBOARD, p);

/** Parse a CSP header into { directive: [sources] }. */
function parseCsp(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = values;
  }
  return out;
}

/** The script-src rules a strict admin CSP must keep. */
function expectStrictScriptSrc(header) {
  const csp = parseCsp(header);
  const scriptSrc = csp['script-src'];
  expect(scriptSrc).toBeDefined();
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(scriptSrc.filter((s) => s.includes('*'))).toEqual([]);
  // Only full file URLs from a CDN, never a bare origin or a package directory.
  const external = scriptSrc.filter((s) => /^https?:/.test(s));
  for (const src of external) {
    expect(src).not.toMatch(/cdn\.tailwindcss\.com/);
    expect(new URL(src).pathname).toMatch(/\.js$/);
  }
  expect(scriptSrc.filter((s) => s.startsWith("'nonce-"))).toHaveLength(1);
  expect(csp['object-src']).toEqual(["'none'"]);
  expect(csp['base-uri']).toEqual(["'self'"]);
  expect(csp['frame-ancestors']).toEqual(["'none'"]);
  return csp;
}

/** The module under test; missing before it exists, so the source scans still report. */
function loadCsp() {
  try {
    return require('../../dashboard/lib/admin-csp');
  } catch (err) {
    return { adminCsp: (req, res, next) => next(), PINNED_SCRIPTS: [], missing: err };
  }
}

const nonceOf = (header) => {
  const m = /'nonce-([^']+)'/.exec(header || '');
  return m ? m[1] : null;
};

describe('admin CSP middleware (dashboard/lib/admin-csp.js)', () => {
  const { adminCsp, PINNED_SCRIPTS } = loadCsp();

  function fakeRender() {
    const headers = {};
    const res = {
      locals: {},
      headersSent: false,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      getHeader: (k) => headers[k.toLowerCase()],
      render: jest.fn(),
    };
    let called = false;
    adminCsp({}, res, () => { called = true; });
    expect(called).toBe(true);
    res.render('login', {});
    return { res, header: headers['content-security-policy'] };
  }

  test('rendering a view sets a strict CSP with this response\'s nonce', () => {
    const { res, header } = fakeRender();
    expect(header).toBeDefined();
    expectStrictScriptSrc(header);
    expect(typeof res.locals.cspNonce).toBe('string');
    expect(Buffer.from(res.locals.cspNonce, 'base64')).toHaveLength(16);
    expect(nonceOf(header)).toBe(res.locals.cspNonce);
  });

  test('every response gets a fresh nonce', () => {
    const nonces = new Set(Array.from({ length: 20 }, () => nonceOf(fakeRender().header)));
    expect(nonces.size).toBe(20);
  });

  test('pinned third-party scripts are exact versioned file URLs', () => {
    for (const { url, integrity } of PINNED_SCRIPTS) {
      expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/[^/@]+@\d+\.\d+\.\d+\/.+\.js$/);
      expect(integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    }
  });

  test('the CSP keeps the other directives locked down', () => {
    const csp = parseCsp(fakeRender().header);
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
    expect(csp['connect-src']).toEqual(["'self'"]);
  });
});

describe('admin views: no script the CSP would block, nothing it should block', () => {
  const views = listFiles(VIEWS, '.ejs');
  const { PINNED_SCRIPTS } = loadCsp();
  const pinned = new Map(PINNED_SCRIPTS.map((p) => [p.url, p.integrity]));

  test('there are views to scan', () => {
    expect(views.length).toBeGreaterThan(20);
  });

  test('every <script> is same-origin, a pinned file with integrity, or carries the nonce', () => {
    const offenders = [];
    for (const file of views) {
      const src = fs.readFileSync(file, 'utf8');
      // A tag ends at the first `>` outside an EJS tag (`<%= cspNonce %>` has one).
      for (const m of src.matchAll(/<script\b(?:<%[\s\S]*?%>|[^>])*>/gi)) {
        const tag = m[0];
        const line = src.slice(0, m.index).split('\n').length;
        const srcAttr = /\ssrc=["']([^"']+)["']/i.exec(tag);
        if (srcAttr) {
          const url = srcAttr[1];
          if (url.startsWith('/') && !url.startsWith('//')) continue;
          const integrity = /\sintegrity=["']([^"']+)["']/i.exec(tag);
          const ok = pinned.has(url) && integrity && integrity[1] === pinned.get(url)
            && /\scrossorigin=["']anonymous["']/i.test(tag);
          if (!ok) offenders.push(`${rel(file)}:${line} ${tag}`);
        } else if (!tag.includes(NONCE_ATTR)) {
          offenders.push(`${rel(file)}:${line} ${tag}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no inline event handler attributes (also inside HTML built in scripts)', () => {
    const offenders = [];
    for (const file of [...views, ...listFiles(PUBLIC_JS, '.js')]) {
      const src = fs.readFileSync(file, 'utf8');
      src.split('\n').forEach((text, i) => {
        if (/[\s"'/]on[a-z]+\s*=\s*["'\\]/i.test(text)) offenders.push(`${rel(file)}:${i + 1} ${text.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test('no javascript: URLs and no Tailwind play runtime', () => {
    const offenders = [];
    for (const file of views) {
      const src = fs.readFileSync(file, 'utf8');
      src.split('\n').forEach((text, i) => {
        if (/javascript:/i.test(text) || /cdn\.tailwindcss\.com/i.test(text)) {
          offenders.push(`${rel(file)}:${i + 1} ${text.trim().slice(0, 120)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test('the built Tailwind CSS is committed and the build covers the views', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DASHBOARD, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:css']).toMatch(/tailwindcss .*-o \.\/public\/css\/main\.css/);
    const config = require('../../dashboard/tailwind.config.js');
    expect(config.content).toContain('./views/**/*.ejs');
    expect(fs.existsSync(path.join(DASHBOARD, 'public', 'css', 'main.css'))).toBe(true);
  });
});

describe('admin pages through the dashboard stack', () => {
  // The dashboard's own express + ejs, resolved the way dashboard/index.js
  // resolves them (see portal-app-session-runtime.test.js).
  const HAVE_DASHBOARD_DEPS = fs.existsSync(path.join(DASHBOARD, 'node_modules', 'ejs'));
  const RUN = HAVE_DASHBOARD_DEPS || Boolean(process.env.CI);
  const maybe = RUN ? test : test.skip;
  const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));

  test('index.js mounts the admin CSP before its first route', () => {
    const src = fs.readFileSync(path.join(DASHBOARD, 'index.js'), 'utf8');
    const mount = src.indexOf('app.use(adminCsp)');
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(src.indexOf("app.get('/observability'"));
    expect(mount).toBeLessThan(src.indexOf('app.get(ASSET_LINKS_PATH'));
  });

  /** The dashboard's view setup + the CSP middleware, in index.js order, serving real views. */
  function boot() {
    const express = dashboardRequire('express');
    const { adminCsp } = loadCsp();
    const app = express();
    app.use(adminCsp);
    app.use(express.static(path.join(DASHBOARD, 'public')));
    app.set('view engine', 'ejs');
    app.set('views', VIEWS);
    // Same locals as the real routes in dashboard/index.js.
    app.get('/observability/login', (req, res) => res.render('login', {
      error: null, success: null, title: 'Admin Login - Observability Dashboard', releaseNotes: [],
    }));
    app.get('/observability/reset-password', (req, res) => res.render('reset-password', {
      title: 'Reset Password', error: null, token: 'tok-123',
    }));
    app.get('/observability/setup-password', (req, res) => res.render('setup-password', {
      title: 'Set Up Your Account', error: null, token: 'tok-123',
      invitation: { email: 'new.admin@example.com', role: 'partner_admin', inviter_username: 'admin@example.com' },
    }));
    app.get('/api/portal/ping', (req, res) => res.json({ ok: true }));
    return new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
  }

  function get(server, urlPath) {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  }

  maybe.each(['/observability/login', '/observability/reset-password', '/observability/setup-password'])(
    'GET %s: strict CSP, and every inline script carries this response\'s nonce',
    async (urlPath) => {
      const server = await boot();
      try {
        const a = await get(server, urlPath);
        const b = await get(server, urlPath);
        expect(a.status).toBe(200);
        const header = a.headers['content-security-policy'];
        expectStrictScriptSrc(header);
        const nonce = nonceOf(header);
        expect(nonce).toBeTruthy();
        expect(nonceOf(b.headers['content-security-policy'])).not.toBe(nonce);
        for (const m of a.body.matchAll(/<script\b[^>]*>/gi)) {
          if (/\ssrc=/.test(m[0])) continue;
          expect(m[0]).toContain(`nonce="${nonce}"`);
        }
        expect(a.body).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
      } finally {
        server.close();
      }
    },
  );

  maybe('JSON (portal API) responses are left alone', async () => {
    const server = await boot();
    try {
      const r = await get(server, '/api/portal/ping');
      expect(r.headers['content-security-policy']).toBeUndefined();
    } finally {
      server.close();
    }
  });
});
