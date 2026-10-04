/**
 * The teacher portal's password-reset code must not be guessable.
 *
 * A reset code is 6 digits, so there are only a million of them. Before this,
 * the code came from Math.random(), verification looked the user up by phone
 * AND code with no wrong-attempt counter (all million codes could be tried in
 * the 10-minute window), and the code itself was written to the logs.
 *
 * Now: the code comes from crypto.randomInt; each code allows
 * PORTAL_RESET_CODE_MAX_ATTEMPTS (default 5) tries, after which it is dead
 * even for the right code; a new code starts a fresh count; the code never
 * reaches a log line.
 *
 * The service runs for real against the in-memory database; axios (the call to
 * the bot that delivers the code) is the mocked network boundary. One test
 * drives the real portal route over HTTP.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createRequire } = require('module');
const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const mockDb = createFakeSupabase({ users: [] });
jest.mock('../../dashboard/config/supabase', () => mockDb.client);
const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...a) => mockPost(...a) }));

const PasswordResetService = require('../../dashboard/services/password-reset.service');

const PHONE = '15551000101';
const GENERIC = 'Invalid or expired code. Please request a new reset code.';

const row = (phone = PHONE) => mockDb.tables.users.find((u) => u.phone_number === phone);
const addTeacher = (phone = PHONE, id = `u-${phone.slice(-3)}`) => {
  mockDb.tables.users.push({ id, phone_number: phone, first_name: 'Sam', portal_activated: true });
};
/** Issue a code the way the portal does and return it (as the bot received it). */
async function issue(phone = PHONE) {
  mockPost.mockClear();
  const result = await PasswordResetService.sendResetCode(phone);
  expect(result).toEqual({ success: true });
  return mockPost.mock.calls[0][1].code;
}
const wrongFor = (code) => String((Number(code) + 1) % 1000000).padStart(6, '0');

beforeEach(() => {
  mockDb.tables.users.length = 0;
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { success: true } });
  delete process.env.PORTAL_RESET_CODE_MAX_ATTEMPTS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('reset code generation', () => {
  test('the code comes from crypto.randomInt (never Math.random) and is always 6 digits', async () => {
    addTeacher();
    const randomInt = jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(42);
    const mathRandom = jest.spyOn(Math, 'random');
    const code = await issue();
    expect(randomInt).toHaveBeenCalledTimes(1);
    expect(mathRandom).not.toHaveBeenCalled();
    // A small draw is zero-padded, not shortened: the route only accepts ^\d{6}$.
    expect(code).toBe('000042');
    expect(row().password_reset_code).toBe('000042');
    randomInt.mockRestore();
    for (let i = 0; i < 20; i += 1) expect(await issue()).toMatch(/^\d{6}$/);
  });
});

describe('wrong-attempt limit (per code)', () => {
  test('5 wrong codes kill the code: the right code then fails and the stored code is gone', async () => {
    addTeacher();
    const code = await issue();
    for (let i = 0; i < 5; i += 1) {
      expect((await PasswordResetService.verifyResetCode(PHONE, wrongFor(code))).valid).toBe(false);
    }
    const locked = await PasswordResetService.verifyResetCode(PHONE, code);
    expect(locked.valid).toBe(false);
    expect(row().password_reset_code).toBeNull();
    expect(locked.error).toBe(GENERIC);
  });

  test('fewer than 5 wrong codes, then the right one: valid, and the code is single-use', async () => {
    addTeacher();
    const code = await issue();
    for (let i = 0; i < 4; i += 1) {
      expect((await PasswordResetService.verifyResetCode(PHONE, wrongFor(code))).valid).toBe(false);
    }
    expect(await PasswordResetService.verifyResetCode(PHONE, code)).toEqual({ valid: true, userId: `u-${PHONE.slice(-3)}` });
    expect(row().password_reset_code).toBeNull();
    expect((await PasswordResetService.verifyResetCode(PHONE, code)).valid).toBe(false);
  });

  test('a new code starts a fresh count', async () => {
    addTeacher();
    const first = await issue();
    for (let i = 0; i < 4; i += 1) await PasswordResetService.verifyResetCode(PHONE, wrongFor(first));
    expect(row().password_reset_attempts).toBe(4);
    const second = await issue();
    expect(row().password_reset_attempts).toBe(0);
    for (let i = 0; i < 4; i += 1) await PasswordResetService.verifyResetCode(PHONE, wrongFor(second));
    expect((await PasswordResetService.verifyResetCode(PHONE, second)).valid).toBe(true);
  });

  test('the limit can be set by PORTAL_RESET_CODE_MAX_ATTEMPTS', async () => {
    process.env.PORTAL_RESET_CODE_MAX_ATTEMPTS = '2';
    addTeacher();
    const code = await issue();
    await PasswordResetService.verifyResetCode(PHONE, wrongFor(code));
    await PasswordResetService.verifyResetCode(PHONE, wrongFor(code));
    expect((await PasswordResetService.verifyResetCode(PHONE, code)).valid).toBe(false);
  });

  test('parallel guesses cannot get more than 5 comparisons out of one code', async () => {
    addTeacher();
    const code = await issue();
    const guesses = Array.from({ length: 30 }, (_, i) => (i === 29 ? code : wrongFor(String(Number(code) + i))));
    // The right code is last; with 5 tries shared by 30 racing guesses it must not get through.
    const results = await Promise.all(guesses.map((g) => PasswordResetService.verifyResetCode(PHONE, g)));
    expect(results.filter((r) => r.valid)).toEqual([]);
    expect(row().password_reset_attempts).toBeLessThanOrEqual(5);
  });

  test('a locked-out code still blocks a new request until it would have expired', async () => {
    // Lockout clears the code but keeps its expiry, so checkRateLimit (the
    // request throttle) still refuses a new code inside the 10 minutes.
    addTeacher();
    const code = await issue();
    for (let i = 0; i < 5; i += 1) await PasswordResetService.verifyResetCode(PHONE, wrongFor(code));
    expect(row().password_reset_code).toBeNull();
    expect((await PasswordResetService.checkRateLimit(PHONE)).allowed).toBe(false);
    row().password_reset_expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await PasswordResetService.checkRateLimit(PHONE)).allowed).toBe(true);
    const fresh = await issue();
    expect((await PasswordResetService.verifyResetCode(PHONE, fresh)).valid).toBe(true);
  });
});

describe('expiry and other failures', () => {
  test('an expired code fails, even the right one', async () => {
    addTeacher();
    const code = await issue();
    row().password_reset_expires_at = new Date(Date.now() - 1000).toISOString();
    const expired = await PasswordResetService.verifyResetCode(PHONE, code);
    expect(expired.valid).toBe(false);
    expect(expired.error).toBe(GENERIC);
  });

  test('the code lasts 10 minutes', async () => {
    addTeacher();
    const before = Date.now();
    await issue();
    const ms = new Date(row().password_reset_expires_at).getTime() - before;
    expect(ms).toBeGreaterThan(9.9 * 60e3);
    expect(ms).toBeLessThanOrEqual(10 * 60e3 + 1000);
  });

  test('unknown number, no code issued, not activated: the same generic failure', async () => {
    expect(await PasswordResetService.verifyResetCode('15559999999', '123456')).toMatchObject({ valid: false, error: GENERIC });
    addTeacher();
    expect(await PasswordResetService.verifyResetCode(PHONE, '123456')).toMatchObject({ valid: false, error: GENERIC });
    const code = await issue();
    row().portal_activated = false;
    expect(await PasswordResetService.verifyResetCode(PHONE, code)).toMatchObject({ valid: false, error: GENERIC });
  });
});

describe('logging', () => {
  test('the code (and the full phone number) never reach a console line', async () => {
    addTeacher();
    jest.spyOn(crypto, 'randomInt').mockReturnValue(739184);
    const code = await issue();
    expect(code).toBe('739184');
    const wrong = '271828';

    await PasswordResetService.verifyResetCode(PHONE, wrong);
    await PasswordResetService.verifyResetCode(PHONE, code);
    // Bot refuses to deliver: the send failure path.
    mockPost.mockResolvedValueOnce({ data: { success: false, error: 'nope' } });
    await PasswordResetService.sendResetCode(PHONE);
    mockPost.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    await PasswordResetService.sendResetCode(PHONE);
    // The verify error path: the database throws mid-verification.
    await issue();
    const from = jest.spyOn(mockDb.client, 'from').mockImplementationOnce(() => { throw new Error('db down'); });
    expect((await PasswordResetService.verifyResetCode(PHONE, code)).valid).toBe(false);
    from.mockRestore();

    const logged = ['log', 'error', 'warn']
      .flatMap((m) => console[m].mock.calls)
      .map((args) => args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : JSON.stringify(a))).join(' '))
      .join('\n');
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(wrong);
    expect(logged).not.toContain(PHONE);
  });
});

describe('schema', () => {
  const ROOT = path.resolve(__dirname, '../..');
  test('V2.11.2 adds users.password_reset_attempts, additively, and records 2.11.2', () => {
    const file = path.join(ROOT, 'infrastructure/supabase/migrations/V2.11.2__portal_reset_attempts.sql');
    expect(fs.existsSync(file)).toBe(true);
    const sql = fs.readFileSync(file, 'utf8');
    expect(sql).toMatch(/ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_attempts INTEGER NOT NULL DEFAULT 0;/);
    expect(sql).toMatch(/INSERT INTO schema_versions \(version, description\)\s*VALUES \('2\.11\.2',[^;]*ON CONFLICT \(version\) DO NOTHING;/);
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\b(DROP|DELETE|TRUNCATE|RENAME)\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+\w/i);
  });

  test('00_complete-schema has the column in users and re-adds it for an older database', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'infrastructure/supabase/00_complete-schema.sql'), 'utf8');
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS users (');
    const users = schema.slice(start, schema.indexOf('\n);', start));
    expect(users).toMatch(/password_reset_attempts INTEGER NOT NULL DEFAULT 0/);
    expect(schema).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_attempts INTEGER NOT NULL DEFAULT 0;');
  });
});

// ---------------------------------------------------------------------------
// Through the real route over HTTP
// ---------------------------------------------------------------------------
const DASHBOARD = path.join(__dirname, '../../dashboard');
const RUN = fs.existsSync(path.join(DASHBOARD, 'node_modules', 'express-session')) || Boolean(process.env.CI);
const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));

function post(server, urlPath, body, cookie) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method: 'POST',
      path: urlPath,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(RUN ? describe : describe.skip)('POST /api/portal/verify-reset-code (real route)', () => {
  let server;
  beforeAll(async () => {
    const express = dashboardRequire('express');
    const session = dashboardRequire('express-session');
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use('/api/portal', require('../../dashboard/routes/portal.routes'));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  test('5 wrong codes, then the right one: 400 with the generic message', async () => {
    const phone = '15551000102';
    addTeacher(phone);
    const code = await issue(phone);
    for (let i = 0; i < 5; i += 1) {
      const res = await post(server, '/api/portal/verify-reset-code', { phoneNumber: phone, code: wrongFor(code) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(GENERIC);
    }
    const res = await post(server, '/api/portal/verify-reset-code', { phoneNumber: phone, code });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: GENERIC });
  });

  test('the right code first time: verified, and it cannot be replayed', async () => {
    const phone = '15551000103';
    addTeacher(phone);
    const code = await issue(phone);
    const ok = await post(server, '/api/portal/verify-reset-code', { phoneNumber: phone, code });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    const again = await post(server, '/api/portal/verify-reset-code', { phoneNumber: phone, code });
    expect(again.status).toBe(400);
  });
});
