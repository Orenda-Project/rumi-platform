/**
 * Which client address the dashboard's per-IP limits count, run for real.
 *
 * The per-IP limits key on the client address. Which address that is depends
 * on what sits in front of the dashboard, so it is configurable:
 *   TRUST_PROXY              how many proxies (or which proxy addresses) to
 *                            trust in X-Forwarded-For; `false` for none
 *   PORTAL_CLIENT_IP_HEADER  a header the proxy in front always overwrites with
 *                            the caller's address (x-real-ip, cf-connecting-ip)
 *
 * This boots express with the real express-session and the real portal router
 * (dashboard/routes/portal.routes.js), with `trust proxy` applied by the same
 * function dashboard/index.js calls, and drives it over HTTP from one socket.
 * Only the database (tests/observe/_helpers/fake-supabase) and axios (the call
 * to the bot) are faked.
 */

const fs = require('fs');
const http = require('http');
const { createRequire } = require('module');
const path = require('path');

const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const DASHBOARD = path.join(__dirname, '../../dashboard');

const mockDb = createFakeSupabase({ users: [] });
jest.mock('../../dashboard/config/supabase', () => mockDb.client);
const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...a) => mockPost(...a) }));

// Same gate as portal-auth-limits.test.js: CI installs the dashboard's
// dependencies and must run this; a local run without them skips it loudly.
const HAVE_DASHBOARD_DEPS = fs.existsSync(path.join(DASHBOARD, 'node_modules', 'express-session'));
const RUN = HAVE_DASHBOARD_DEPS || Boolean(process.env.CI);
if (!RUN) {
  console.warn('portal-client-ip: skipped — run `cd dashboard && npm ci` to boot the real portal router.');
}
const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));
const [express, session] = RUN ? ['express', 'express-session'].map((m) => dashboardRequire(m)) : [];

const ENV_KEYS = [
  'TRUST_PROXY',
  'PORTAL_CLIENT_IP_HEADER',
  'PORTAL_LOGIN_LIMIT_PER_IP',
  'PORTAL_LOGIN_LIMIT_PER_ACCOUNT',
  'PORTAL_RESET_LIMIT_PER_IP',
  'PORTAL_RESET_LIMIT_PER_ACCOUNT',
  'PORTAL_DATA_LIMIT_PER_MINUTE',
];

const GENERIC_429 = { success: false, error: 'Too many attempts. Please try again later.' };
const EDGE = '192.0.2.200';

function setEnv(env) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

/** A fresh portal router (fresh counters), with trust proxy applied as index.js does. */
function bootPortal(env = {}) {
  setEnv(env);
  let portalRoutes;
  let clientIp;
  jest.isolateModules(() => {
    clientIp = require('../../dashboard/lib/client-ip');
    portalRoutes = require('../../dashboard/routes/portal.routes');
  });
  const app = express();
  clientIp.applyTrustProxy(app, process.env);
  app.use(express.json());
  app.use(session({ secret: 'test-secret', name: 'app.sid', resave: false, saveUninitialized: false }));
  app.use('/api/portal', portalRoutes);
  return listen(app);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(server, { method = 'POST', path: urlPath, headers = {}, body }) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method,
      path: urlPath,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Fictional numbers 1555xxxxxxx, distinct per i. */
const phone = (i) => `1555${String(3000000 + i).padStart(7, '0')}`;

const login = (server, i, headers) =>
  request(server, { path: '/api/portal/login', headers, body: { phoneNumber: phone(i), password: 'wrong-password-1' } });
const askReset = (server, i, headers) =>
  request(server, { path: '/api/portal/request-reset', headers, body: { phoneNumber: phone(i) } });

(RUN ? describe : describe.skip)('per-IP limits key on the configured client address (real portal router)', () => {
  let server;

  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { success: true } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (server) await new Promise((r) => server.close(r));
    server = null;
    setEnv({});
  });

  test('TRUST_PROXY=false (directly exposed): a forged X-Forwarded-For on every request does not dodge the per-IP limit', async () => {
    server = await bootPortal({ TRUST_PROXY: 'false' });
    for (let i = 0; i < 10; i++) {
      expect((await login(server, i, { 'X-Forwarded-For': `10.9.0.${i + 1}` })).status).toBe(401);
    }
    const res = await login(server, 10, { 'X-Forwarded-For': '10.9.0.11' });
    expect(res.status).toBe(429);
    expect(res.json).toEqual(GENERIC_429);
  });

  test('TRUST_PROXY=2 (caller, edge): each caller gets their own bucket, and one caller still trips theirs', async () => {
    server = await bootPortal({ TRUST_PROXY: '2' });
    // Six different teachers, each asking once for their own number, all through one edge node.
    for (let i = 0; i < 6; i++) {
      const res = await askReset(server, 100 + i, { 'X-Forwarded-For': `198.51.100.${10 + i}, ${EDGE}` });
      expect(res.status).toBe(200);
    }
    // One caller asking for six different numbers trips on the 6th.
    for (let i = 0; i < 5; i++) {
      expect((await askReset(server, 200 + i, { 'X-Forwarded-For': `203.0.113.30, ${EDGE}` })).status).toBe(200);
    }
    const sixth = await askReset(server, 205, { 'X-Forwarded-For': `203.0.113.30, ${EDGE}` });
    expect(sixth.status).toBe(429);
    expect(sixth.json).toEqual(GENERIC_429);
  });

  test('the default (TRUST_PROXY unset = 1) is unchanged: the last X-Forwarded-For hop is the client', async () => {
    server = await bootPortal({});
    for (let i = 0; i < 5; i++) {
      expect((await askReset(server, 300 + i, { 'X-Forwarded-For': `198.51.100.${40 + i}, ${EDGE}` })).status).toBe(200);
    }
    // Different first hops, same last hop: one bucket under one trusted hop.
    expect((await askReset(server, 305, { 'X-Forwarded-For': `198.51.100.50, ${EDGE}` })).status).toBe(429);
  });

  test('PORTAL_CLIENT_IP_HEADER=x-real-ip: distinct X-Real-IP values get distinct buckets though X-Forwarded-For is the same', async () => {
    server = await bootPortal({ PORTAL_CLIENT_IP_HEADER: 'x-real-ip' });
    for (let i = 0; i < 6; i++) {
      const res = await askReset(server, 400 + i, { 'X-Forwarded-For': EDGE, 'X-Real-IP': `198.51.100.${60 + i}` });
      expect(res.status).toBe(200);
    }
  });

  test('PORTAL_CLIENT_IP_HEADER=x-real-ip: forging X-Forwarded-For does not change the bucket', async () => {
    server = await bootPortal({ PORTAL_CLIENT_IP_HEADER: 'x-real-ip' });
    for (let i = 0; i < 5; i++) {
      const res = await askReset(server, 500 + i, { 'X-Forwarded-For': `10.9.1.${i + 1}`, 'X-Real-IP': '198.51.100.70' });
      expect(res.status).toBe(200);
    }
    const res = await askReset(server, 505, { 'X-Forwarded-For': '10.9.1.99', 'X-Real-IP': '198.51.100.70' });
    expect(res.status).toBe(429);
  });

  test('PORTAL_CLIENT_IP_HEADER: an invalid or missing header value falls back to req.ip', async () => {
    server = await bootPortal({ PORTAL_CLIENT_IP_HEADER: 'x-real-ip' });
    const xff = { 'X-Forwarded-For': '203.0.113.80' };
    expect((await askReset(server, 600, { ...xff, 'X-Real-IP': 'not-an-ip' })).status).toBe(200);
    expect((await askReset(server, 601, xff)).status).toBe(200);
    expect((await askReset(server, 602, { ...xff, 'X-Real-IP': '' })).status).toBe(200);
    expect((await askReset(server, 603, { ...xff, 'X-Real-IP': '999.1.1.1' })).status).toBe(200);
    expect((await askReset(server, 604, { ...xff, 'X-Real-IP': 'not-an-ip' })).status).toBe(200);
    // All five counted as 203.0.113.80 (req.ip), so the 6th is refused.
    expect((await askReset(server, 605, { ...xff, 'X-Real-IP': 'not-an-ip' })).status).toBe(429);
    // A valid header value is its own bucket.
    expect((await askReset(server, 606, { ...xff, 'X-Real-IP': '198.51.100.81' })).status).toBe(200);
  });
});

(RUN ? describe : describe.skip)('the data limiter and a single client-ip getter', () => {
  let servers = [];
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    servers = [];
    setEnv({});
  });

  test('the /api/portal data limiter keys on PORTAL_CLIENT_IP_HEADER too', async () => {
    setEnv({ PORTAL_CLIENT_IP_HEADER: 'cf-connecting-ip', PORTAL_DATA_LIMIT_PER_MINUTE: '2' });
    let limits;
    let clientIp;
    jest.isolateModules(() => {
      clientIp = require('../../dashboard/lib/client-ip');
      limits = require('../../dashboard/lib/portal-auth-limits');
    });
    const app = express();
    clientIp.applyTrustProxy(app, process.env);
    app.get('/x', limits.createPortalDataLimiter(), (req, res) => res.json({ ok: true }));
    const s = await listen(app);
    servers.push(s);
    const get = (h) => request(s, { method: 'GET', path: '/x', headers: h });
    expect((await get({ 'CF-Connecting-IP': '198.51.100.90', 'X-Forwarded-For': '10.0.0.1' })).status).toBe(200);
    expect((await get({ 'CF-Connecting-IP': '198.51.100.90', 'X-Forwarded-For': '10.0.0.2' })).status).toBe(200);
    expect((await get({ 'CF-Connecting-IP': '198.51.100.90', 'X-Forwarded-For': '10.0.0.3' })).status).toBe(429);
    expect((await get({ 'CF-Connecting-IP': '198.51.100.91', 'X-Forwarded-For': '10.0.0.3' })).status).toBe(200);
  });

  test('clientIpOf: header first value, trimmed and validated; else req.ip', () => {
    const { clientIpOf } = require('../../dashboard/lib/client-ip');
    const req = (headers, ip = '203.0.113.9') => ({ headers, ip, socket: { remoteAddress: '127.0.0.1' } });
    expect(clientIpOf(req({ 'x-real-ip': ' 198.51.100.1 ' }), 'x-real-ip')).toBe('198.51.100.1');
    expect(clientIpOf(req({ 'x-real-ip': '198.51.100.2, 10.0.0.1' }), 'x-real-ip')).toBe('198.51.100.2');
    expect(clientIpOf(req({ 'x-real-ip': '2001:db8::1' }), 'x-real-ip')).toBe('2001:db8::1');
    expect(clientIpOf(req({ 'x-real-ip': 'not-an-ip' }), 'x-real-ip')).toBe('203.0.113.9');
    expect(clientIpOf(req({ 'x-real-ip': ['198.51.100.3', '198.51.100.4'] }), 'x-real-ip')).toBe('198.51.100.3');
    expect(clientIpOf(req({}), 'x-real-ip')).toBe('203.0.113.9');
    expect(clientIpOf(req({ 'x-real-ip': '198.51.100.1' }), null)).toBe('203.0.113.9');
    expect(clientIpOf({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, null)).toBe('127.0.0.1');
  });
});

describe('TRUST_PROXY and PORTAL_CLIENT_IP_HEADER parsing', () => {
  const { parseTrustProxy, readClientIpHeader } = require('../../dashboard/lib/client-ip');

  test.each([
    [undefined, 1],
    ['', 1],
    ['1', 1],
    [' 2 ', 2],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['loopback', 'loopback'],
    ['10.0.0.0/8, 192.168.0.1', '10.0.0.0/8, 192.168.0.1'],
    ['loopback,uniquelocal', 'loopback, uniquelocal'],
    ['2001:db8::/32', '2001:db8::/32'],
    ['10.0.0.0/255.0.0.0', '10.0.0.0/255.0.0.0'],
  ])('%p -> %p, no warning', (input, expected) => {
    const parsed = parseTrustProxy(input);
    expect(parsed.value).toEqual(expected);
    expect(parsed.warning).toBeNull();
  });

  test.each([
    ['true'],
    ['TRUE'],
    ['garbage'],
    ['-1'],
    ['1.5'],
    ['99'],
    ['10.0.0.0/33'],
    ['10.0.0.0/8, nonsense'],
    ['300.1.1.1'],
    [','],
  ])('%p is rejected: default 1, with a warning naming TRUST_PROXY', (input) => {
    const parsed = parseTrustProxy(input);
    expect(parsed.value).toBe(1);
    expect(parsed.warning).toMatch(/TRUST_PROXY/);
  });

  test('"true" is refused with a reason, not silently', () => {
    expect(parseTrustProxy('true').warning).toMatch(/any client/i);
  });

  test('applyTrustProxy sets the express setting and warns once when invalid', () => {
    const { applyTrustProxy } = require('../../dashboard/lib/client-ip');
    const warn = jest.fn();
    const settings = {};
    const app = { set: (k, v) => { settings[k] = v; } };
    expect(applyTrustProxy(app, { TRUST_PROXY: 'false' }, warn)).toBe(false);
    expect(settings['trust proxy']).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(applyTrustProxy(app, { TRUST_PROXY: '2' }, warn)).toBe(2);
    expect(settings['trust proxy']).toBe(2);
    expect(applyTrustProxy(app, { TRUST_PROXY: 'true' }, warn)).toBe(1);
    expect(settings['trust proxy']).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('readClientIpHeader: lower-cased header name, or null', () => {
    const warn = jest.fn();
    expect(readClientIpHeader({}, warn)).toBeNull();
    expect(readClientIpHeader({ PORTAL_CLIENT_IP_HEADER: '  ' }, warn)).toBeNull();
    expect(readClientIpHeader({ PORTAL_CLIENT_IP_HEADER: 'X-Real-IP' }, warn)).toBe('x-real-ip');
    expect(readClientIpHeader({ PORTAL_CLIENT_IP_HEADER: ' cf-connecting-ip ' }, warn)).toBe('cf-connecting-ip');
    expect(warn).not.toHaveBeenCalled();
    expect(readClientIpHeader({ PORTAL_CLIENT_IP_HEADER: 'x real ip!' }, warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('dashboard/index.js uses the configured client address', () => {
  const src = fs.readFileSync(path.join(DASHBOARD, 'index.js'), 'utf8');

  test('trust proxy comes from applyTrustProxy, not a hard-coded value', () => {
    expect(src).toMatch(/applyTrustProxy\(app\)/);
    expect(src).not.toMatch(/app\.set\(\s*['"]trust proxy['"]/);
  });

  test('the admin login limiter keys on the same client address as the portal limiters', () => {
    const block = src.slice(src.indexOf('const loginLimiter = rateLimit('), src.indexOf('const trackingLimiter'));
    expect(block).toMatch(/keyGenerator:\s*clientIp\b/);
    expect(src).toMatch(/const clientIp = createClientIpGetter\(\)/);
  });
});
