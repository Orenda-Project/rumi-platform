/**
 * Rate limits on the teacher portal's public sign-in routes, run for real.
 *
 * Sign-in, first-time setup and the password-reset steps are reachable by
 * anyone, so each is limited twice: by client IP and by account (the phone
 * number typed in). Either one tripping answers 429 with one generic message,
 * the same whether or not the account exists. Counts live in Redis when the
 * dashboard has one, so every cluster worker (and every replica) shares them;
 * with no Redis, or a Redis that errors, each process counts in memory.
 *
 * This boots express with the real express-session and the real portal router
 * (dashboard/routes/portal.routes.js), driven over HTTP. Only the database
 * (tests/observe/_helpers/fake-supabase) and axios (the call to the bot) are
 * faked. Clients are told apart by X-Forwarded-For, with `trust proxy` set to 1
 * as in dashboard/index.js.
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

// Same gate as portal-app-session-runtime.test.js: CI installs the dashboard's
// dependencies and must run this; a local run without them skips it loudly.
const HAVE_DASHBOARD_DEPS = fs.existsSync(path.join(DASHBOARD, 'node_modules', 'express-session'));
const RUN = HAVE_DASHBOARD_DEPS || Boolean(process.env.CI);
if (!RUN) {
  console.warn('portal-auth-limits: skipped — run `cd dashboard && npm ci` to boot the real portal router.');
}
const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));
const [express, session, bcrypt] = RUN
  ? ['express', 'express-session', 'bcryptjs'].map((m) => dashboardRequire(m))
  : [];

const LIMIT_ENV = [
  'PORTAL_AUTH_LIMIT_WINDOW_MINUTES',
  'PORTAL_LOGIN_LIMIT_PER_IP',
  'PORTAL_LOGIN_LIMIT_PER_ACCOUNT',
  'PORTAL_RESET_LIMIT_PER_IP',
  'PORTAL_RESET_LIMIT_PER_ACCOUNT',
  'PORTAL_SETUP_LIMIT_PER_IP',
  'PORTAL_DATA_LIMIT_PER_MINUTE',
];

const GENERIC_429 = { success: false, error: 'Too many attempts. Please try again later.' };
const EXISTING_PHONE = '15551000001';
const PASSWORD = 'correct-horse-1';

/**
 * A fresh copy of the portal router (fresh counters), mounted the way
 * index.js mounts it. Returns the server and the limits module that copy uses.
 */
function bootPortal(env = {}) {
  for (const k of LIMIT_ENV) delete process.env[k];
  Object.assign(process.env, env);
  let portalRoutes;
  let limits;
  jest.isolateModules(() => {
    limits = require('../../dashboard/lib/portal-auth-limits');
    portalRoutes = require('../../dashboard/routes/portal.routes');
  });
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(session({ secret: 'test-secret', name: 'app.sid', resave: false, saveUninitialized: false }));
  app.use('/api/portal', portalRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, limits }));
  });
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(server, { method = 'POST', path: urlPath, ip = '203.0.113.1', body }) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method,
      path: urlPath,
      headers: {
        'X-Forwarded-For': ip,
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

const login = (server, phoneNumber, ip, password = 'wrong-password-1', urlPath = '/api/portal/login') =>
  request(server, { path: urlPath, ip, body: { phoneNumber, password } });

/** Fictional numbers 1555xxxxxxx, distinct per i. */
const phone = (i) => `1555${String(2000000 + i).padStart(7, '0')}`;
const ipOf = (i) => `198.51.100.${i + 1}`;

/**
 * A node-redis-like client with just the commands the limiter store uses,
 * held in one shared Map so two "workers" given it see the same counts.
 */
function createFakeRedis() {
  const data = new Map(); // key -> { value, expiresAt|null }
  const live = (k) => {
    const e = data.get(k);
    if (e && e.expiresAt !== null && e.expiresAt <= Date.now()) { data.delete(k); return undefined; }
    return e;
  };
  const client = {
    isReady: true,
    data,
    calls: [],
    async incr(k) { client.calls.push(['incr', k]); const e = live(k) || { value: 0, expiresAt: null }; e.value += 1; data.set(k, e); return e.value; },
    async decr(k) { client.calls.push(['decr', k]); const e = live(k) || { value: 0, expiresAt: null }; e.value -= 1; data.set(k, e); return e.value; },
    async pTTL(k) { client.calls.push(['pTTL', k]); const e = live(k); if (!e) return -2; if (e.expiresAt === null) return -1; return e.expiresAt - Date.now(); },
    async pExpire(k, ms, mode) {
      client.calls.push(['pExpire', k, ms, mode]);
      const e = live(k); if (!e) return 0;
      if (mode === 'NX' && e.expiresAt !== null) return 0;
      e.expiresAt = Date.now() + Number(ms); return 1;
    },
    async del(k) { client.calls.push(['del', k]); return data.delete(k) ? 1 : 0; },
  };
  return client;
}

(RUN ? describe : describe.skip)('portal public auth rate limits (real portal router)', () => {
  let server;

  beforeAll(async () => {
    mockDb.tables.users.push({
      id: 'u-1',
      phone_number: EXISTING_PHONE,
      first_name: 'Sam',
      portal_activated: true,
      portal_password_hash: await bcrypt.hash(PASSWORD, 4),
    });
  });

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
    for (const k of LIMIT_ENV) delete process.env[k];
  });

  test('the 11th sign-in from one IP in 15 minutes, each with a different number, is refused (per IP)', async () => {
    ({ server } = await bootPortal());
    for (let i = 0; i < 10; i++) {
      const res = await login(server, phone(i), '203.0.113.10');
      expect(res.status).toBe(401);
    }
    const res = await login(server, phone(10), '203.0.113.10');
    expect(res.status).toBe(429);
    expect(res.json).toEqual(GENERIC_429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    // Another IP is unaffected.
    expect((await login(server, phone(11), '203.0.113.11')).status).toBe(401);
  });

  test('the 6th sign-in for one number, each from a different IP, is refused (per account)', async () => {
    ({ server } = await bootPortal());
    for (let i = 0; i < 5; i++) {
      expect((await login(server, phone(20), ipOf(i))).status).toBe(401);
    }
    const res = await login(server, phone(20), ipOf(5));
    expect(res.status).toBe(429);
    expect(res.json).toEqual(GENERIC_429);
    // Spaces and a leading + are the same account.
    expect((await login(server, `+1555 ${phone(20).slice(4)}`, ipOf(6))).status).toBe(429);
  });

  test('a 429 is the same for an account that exists and one that does not, and for an IP trip', async () => {
    ({ server } = await bootPortal());
    const trip = async (number, ipBase) => {
      let res;
      for (let i = 0; i < 6; i++) res = await login(server, number, `${ipBase}.${i + 1}`);
      return res;
    };
    const existing = await trip(EXISTING_PHONE, '192.0.2');
    const missing = await trip(phone(30), '198.18.0');
    expect(existing.status).toBe(429);
    expect(missing.status).toBe(429);
    expect(existing.text).toBe(missing.text);
    expect(existing.json).toEqual(GENERIC_429);

    let byIp;
    for (let i = 0; i < 11; i++) byIp = await login(server, phone(40 + i), '203.0.113.50');
    expect(byIp.status).toBe(429);
    expect(byIp.text).toBe(existing.text);
  });

  test('a successful sign-in is not counted, so a teacher who keeps signing in is not locked out', async () => {
    ({ server } = await bootPortal());
    for (let i = 0; i < 8; i++) {
      expect((await login(server, EXISTING_PHONE, '203.0.113.60', PASSWORD)).status).toBe(200);
    }
  });

  test('verify-reset-code trips per account and per IP', async () => {
    ({ server } = await bootPortal());
    const verify = (number, ip) => request(server, { path: '/api/portal/verify-reset-code', ip, body: { phoneNumber: number, code: '123456' } });
    for (let i = 0; i < 5; i++) expect((await verify(phone(60), ipOf(i))).status).toBe(400);
    const byAccount = await verify(phone(60), ipOf(5));
    expect(byAccount.status).toBe(429);
    expect(byAccount.json).toEqual(GENERIC_429);

    for (let i = 0; i < 5; i++) expect((await verify(phone(70 + i), '203.0.113.70')).status).toBe(400);
    const byIp = await verify(phone(79), '203.0.113.70');
    expect(byIp.status).toBe(429);
    expect(byIp.json).toEqual(GENERIC_429);
  });

  test('request-reset trips per account and per IP', async () => {
    ({ server } = await bootPortal());
    const ask = (number, ip) => request(server, { path: '/api/portal/request-reset', ip, body: { phoneNumber: number } });
    for (let i = 0; i < 5; i++) expect((await ask(phone(80), ipOf(i))).status).toBe(200);
    const byAccount = await ask(phone(80), ipOf(5));
    expect(byAccount.status).toBe(429);
    expect(byAccount.json).toEqual(GENERIC_429);

    for (let i = 0; i < 5; i++) expect((await ask(phone(90 + i), '203.0.113.80')).status).toBe(200);
    expect((await ask(phone(99), '203.0.113.80')).status).toBe(429);
  });

  test('reset-password has a per-IP limit', async () => {
    ({ server } = await bootPortal());
    const reset = (ip) => request(server, { path: '/api/portal/reset-password', ip, body: { password: 'new-password-1' } });
    for (let i = 0; i < 5; i++) expect((await reset('203.0.113.90')).status).toBe(401);
    const res = await reset('203.0.113.90');
    expect(res.status).toBe(429);
    expect(res.json).toEqual(GENERIC_429);
  });

  test('setup and validate-token have a per-IP limit (10 per window)', async () => {
    ({ server } = await bootPortal());
    for (const route of ['/api/portal/setup', '/api/portal/validate-token']) {
      for (let i = 0; i < 10; i++) {
        expect((await request(server, { path: route, ip: '203.0.113.100', body: { token: 'not-a-token' } })).status).toBe(400);
      }
      const res = await request(server, { path: route, ip: '203.0.113.100', body: { token: 'not-a-token' } });
      expect(res.status).toBe(429);
      expect(res.json).toEqual(GENERIC_429);
    }
  });

  test('/LOGIN and /login/ count against the same bucket as /login', async () => {
    ({ server } = await bootPortal());
    const variants = ['/api/portal/login', '/api/portal/LOGIN', '/api/portal/login/', '/api/portal/Login'];
    for (let i = 0; i < 10; i++) {
      expect((await login(server, phone(100 + i), '203.0.113.110', 'wrong-password-1', variants[i % variants.length])).status).toBe(401);
    }
    expect((await login(server, phone(120), '203.0.113.110', 'wrong-password-1', '/api/portal/LOGIN/')).status).toBe(429);
  });

  test('an env override changes the limit', async () => {
    ({ server } = await bootPortal({ PORTAL_LOGIN_LIMIT_PER_IP: '3', PORTAL_LOGIN_LIMIT_PER_ACCOUNT: '2' }));
    for (let i = 0; i < 3; i++) expect((await login(server, phone(130 + i), '203.0.113.130')).status).toBe(401);
    expect((await login(server, phone(139), '203.0.113.130')).status).toBe(429);

    for (let i = 0; i < 2; i++) expect((await login(server, phone(140), ipOf(10 + i))).status).toBe(401);
    expect((await login(server, phone(140), ipOf(12))).status).toBe(429);
  });

  test.each([['abc'], [''], ['0'], ['-4'], ['2.5']])('an invalid env value (%p) falls back to the default', async (bad) => {
    ({ server } = await bootPortal({ PORTAL_LOGIN_LIMIT_PER_IP: bad, PORTAL_AUTH_LIMIT_WINDOW_MINUTES: bad }));
    for (let i = 0; i < 10; i++) expect((await login(server, phone(150 + i), '203.0.113.150')).status).toBe(401);
    const res = await login(server, phone(160), '203.0.113.150');
    expect(res.status).toBe(429);
    // Default window: 15 minutes.
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(14 * 60);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(15 * 60);
  });

  test('readPortalAuthLimits: defaults, overrides and fallbacks', async () => {
    ({ server } = await bootPortal());
    const { readPortalAuthLimits } = require('../../dashboard/lib/portal-auth-limits');
    expect(readPortalAuthLimits({})).toEqual({
      windowMs: 15 * 60 * 1000,
      loginPerIp: 10,
      loginPerAccount: 5,
      resetPerIp: 5,
      resetPerAccount: 5,
      setupPerIp: 10,
      dataPerMinute: 300,
    });
    expect(readPortalAuthLimits({ PORTAL_RESET_LIMIT_PER_ACCOUNT: ' 3 ', PORTAL_AUTH_LIMIT_WINDOW_MINUTES: '60' }))
      .toMatchObject({ resetPerAccount: 3, windowMs: 60 * 60 * 1000 });
    expect(readPortalAuthLimits({ PORTAL_DATA_LIMIT_PER_MINUTE: 'lots' }).dataPerMinute).toBe(300);
  });

  test('with Redis configured, the router counts in Redis and the phone number is not in any key', async () => {
    let limits;
    ({ server, limits } = await bootPortal());
    const redis = createFakeRedis();
    limits.setPortalAuthLimitsRedisClient(redis);
    for (let i = 0; i < 5; i++) expect((await login(server, EXISTING_PHONE, ipOf(20 + i))).status).toBe(401);
    expect((await login(server, EXISTING_PHONE, ipOf(25))).status).toBe(429);
    const keys = [...redis.data.keys()];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).not.toContain(EXISTING_PHONE);
      expect(k).not.toContain(EXISTING_PHONE.slice(1));
    }
    // Every counter has an expiry.
    for (const e of redis.data.values()) expect(e.expiresAt).not.toBeNull();
    // The 429 path never logs the number.
    const logged = [console.log, console.warn, console.error]
      .flatMap((fn) => fn.mock.calls).map((c) => JSON.stringify(c)).join('\n');
    expect(logged).not.toContain(EXISTING_PHONE);
  });
});

(RUN ? describe : describe.skip)('the Redis-backed limiter store', () => {
  let servers = [];
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    servers = [];
  });

  /** One "cluster worker": its own copy of the module and its own limiter. */
  async function worker(getClient) {
    let limits;
    jest.isolateModules(() => { limits = require('../../dashboard/lib/portal-auth-limits'); });
    const limiter = limits.createIpLimiter({ name: 'login', limit: 3, windowMs: 60000, getClient });
    const app = express();
    app.set('trust proxy', 1);
    app.post('/x', limiter, (req, res) => res.status(401).json({ success: false }));
    const s = await listen(app);
    servers.push(s);
    return s;
  }

  test('two workers given the same Redis share one count', async () => {
    const redis = createFakeRedis();
    const a = await worker(() => redis);
    const b = await worker(() => redis);
    expect((await request(a, { path: '/x', ip: '203.0.113.200' })).status).toBe(401);
    expect((await request(b, { path: '/x', ip: '203.0.113.200' })).status).toBe(401);
    expect((await request(a, { path: '/x', ip: '203.0.113.200' })).status).toBe(401);
    const fourth = await request(b, { path: '/x', ip: '203.0.113.200' });
    expect(fourth.status).toBe(429);
    expect(fourth.json).toEqual(GENERIC_429);
  });

  test('a Redis that throws fails open to an in-memory count: no 500, still limited, logged once', async () => {
    const broken = {
      isReady: true,
      incr: async () => { throw new Error('ECONNRESET'); },
      decr: async () => { throw new Error('ECONNRESET'); },
      pTTL: async () => { throw new Error('ECONNRESET'); },
      pExpire: async () => { throw new Error('ECONNRESET'); },
      del: async () => { throw new Error('ECONNRESET'); },
    };
    const a = await worker(() => broken);
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await request(a, { path: '/x', ip: '203.0.113.201' })).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
    const redisLogs = [...console.warn.mock.calls, ...console.error.mock.calls]
      .filter((c) => /redis/i.test(String(c[0])));
    expect(redisLogs).toHaveLength(1);
  });

  test('a Redis that hangs fails open too (the request is not held)', async () => {
    const hanging = {
      isReady: true,
      incr: () => new Promise(() => {}),
      decr: () => new Promise(() => {}),
      pTTL: () => new Promise(() => {}),
      pExpire: () => new Promise(() => {}),
      del: () => new Promise(() => {}),
    };
    const a = await worker(() => hanging);
    const res = await request(a, { path: '/x', ip: '203.0.113.202' });
    expect(res.status).toBe(401);
  });

  test('a client that is not ready is not used', async () => {
    const redis = createFakeRedis();
    redis.isReady = false;
    const a = await worker(() => redis);
    expect((await request(a, { path: '/x', ip: '203.0.113.203' })).status).toBe(401);
    expect(redis.calls).toHaveLength(0);
  });
});

describe('no disabled limits are left in the dashboard', () => {
  function jsFiles(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'public') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...jsFiles(full));
      else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
  }

  test('no "TEMPORARY: DISABLED FOR TESTING" and no max: 10000', () => {
    const offenders = [];
    for (const file of jsFiles(DASHBOARD)) {
      const src = fs.readFileSync(file, 'utf8');
      if (/DISABLED FOR TESTING/.test(src) || /\bmax:\s*10000\b/.test(src)) offenders.push(path.relative(DASHBOARD, file));
    }
    expect(offenders).toEqual([]);
  });
});
