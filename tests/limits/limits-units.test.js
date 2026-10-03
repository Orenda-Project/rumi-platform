/**
 * limits/ on their own: the Redis paths (Redis is the network boundary, mocked
 * at the cache service), the in-process fallbacks, and the parsing of every
 * env var.
 */

const mockRedis = {
  available: true,
  checkRateLimit: jest.fn(),
  setNX: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
};
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  isAvailable: () => mockRedis.available,
  checkRateLimit: (...a) => mockRedis.checkRateLimit(...a),
  setNX: (...a) => mockRedis.setNX(...a),
  incr: (...a) => mockRedis.incr(...a),
  expire: (...a) => mockRedis.expire(...a),
  set: (...a) => mockRedis.set(...a),
  get: (...a) => mockRedis.get(...a),
}));
const mockSend = jest.fn().mockResolvedValue(true);
jest.mock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: (...a) => mockSend(...a) }));
const mockLog = jest.fn();
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: (...a) => mockLog(...a) }));

const RateLimit = require('../../bot/shared/services/limits/inbound-rate-limit');
const DailyCaps = require('../../bot/shared/services/limits/daily-caps');
const ModelBudget = require('../../bot/shared/services/limits/model-budget');

const ENV_KEYS = ['INBOUND_RATE_LIMIT_PER_MINUTE', 'INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE', 'RATE_LIMIT_BYPASS_NUMBERS', 'SCHOOL_TIMEZONE', 'MODEL_BUDGET_COOLDOWN_SECONDS',
  ...Object.values(DailyCaps.KINDS).flatMap((k) => Object.values(k))];
const saved = {};
beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const f of Object.values(mockRedis)) if (typeof f === 'function') f.mockReset();
  mockRedis.available = true;
  mockRedis.set.mockResolvedValue(true);
  mockRedis.expire.mockResolvedValue(true);
  mockSend.mockClear();
  mockLog.mockClear();
  RateLimit._resetLocal();
  DailyCaps._resetLocal();
  ModelBudget._reset();
});
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe('inbound rate limit', () => {
  it('counts on Redis under inbound:<sender> with the per-minute limit and a 60 s window', async () => {
    mockRedis.checkRateLimit.mockResolvedValue({ allowed: true, count: 7, remaining: 23, resetAt: new Date() });
    const r = await RateLimit.admit('mtx:155510004');
    expect(mockRedis.checkRateLimit).toHaveBeenCalledWith('inbound:mtx:155510004', 30, 60);
    expect(r).toEqual(expect.objectContaining({ allowed: true, count: 7, limit: 30 }));
  });

  it('over the limit: refused; notify only when the warn key is claimed (once per window)', async () => {
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = '5';
    mockRedis.checkRateLimit.mockResolvedValue({ allowed: false, count: 6, remaining: 0, resetAt: new Date() });
    mockRedis.setNX.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const first = await RateLimit.admit('15550100001');
    const second = await RateLimit.admit('15550100001');
    expect(first).toEqual(expect.objectContaining({ allowed: false, notify: true, limit: 5 }));
    expect(second).toEqual(expect.objectContaining({ allowed: false, notify: false }));
    expect(mockRedis.setNX).toHaveBeenCalledWith('inbound_warned:15550100001', '1', 60);
  });

  it('Redis down: an in-process sliding window, not fail-open', async () => {
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = '3';
    mockRedis.available = false;
    const t0 = 1_000_000;
    const out = [];
    for (let i = 0; i < 5; i += 1) out.push(await RateLimit.admit('s1', { now: t0 + i }));
    expect(out.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(out.map((r) => r.notify)).toEqual([false, false, false, true, false]);
    expect(out[3].degraded).toBe(true);
    // A minute later the window has rolled on.
    expect((await RateLimit.admit('s1', { now: t0 + 61_000 })).allowed).toBe(true);
    expect(mockRedis.checkRateLimit).not.toHaveBeenCalled();
  });

  it('a Redis error inside checkRateLimit (it fails open: resetAt null) also falls back to the local count', async () => {
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = '1';
    mockRedis.checkRateLimit.mockResolvedValue({ allowed: true, count: 0, remaining: 1, resetAt: null });
    expect((await RateLimit.admit('s2')).allowed).toBe(true);
    expect((await RateLimit.admit('s2')).allowed).toBe(false);
  });

  it('off/0 disables it; RATE_LIMIT_BYPASS_NUMBERS are never limited; junk keeps the default', async () => {
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = 'off';
    expect(RateLimit.limit()).toBeNull();
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = '0';
    expect(RateLimit.limit()).toBeNull();
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = 'lots';
    expect(RateLimit.limit()).toBe(30);
    process.env.RATE_LIMIT_BYPASS_NUMBERS = '15550100009, 15550100008';
    expect((await RateLimit.admit('15550100008')).allowed).toBe(true);
    expect(mockRedis.checkRateLimit).not.toHaveBeenCalled();
  });

  it('media counts in its own bucket: inbound_media:<sender>, 120 a minute by default', async () => {
    mockRedis.checkRateLimit.mockResolvedValue({ allowed: true, count: 31, remaining: 89, resetAt: new Date() });
    const r = await RateLimit.admit('15550100009', { kind: 'media' });
    expect(mockRedis.checkRateLimit).toHaveBeenCalledWith('inbound_media:15550100009', 120, 60);
    expect(r).toEqual(expect.objectContaining({ allowed: true, count: 31, limit: 120 }));
  });

  it('Redis down: text and media keep separate local windows, each with its own limit', async () => {
    mockRedis.available = false;
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = '2';
    process.env.INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE = '3';
    const t0 = 1_000_000;
    const text = [];
    const media = [];
    for (let i = 0; i < 3; i += 1) text.push((await RateLimit.admit('s3', { now: t0 + i })).allowed);
    for (let i = 0; i < 4; i += 1) media.push((await RateLimit.admit('s3', { kind: 'media', now: t0 + i })).allowed);
    expect(text).toEqual([true, true, false]);
    expect(media).toEqual([true, true, true, false]);
  });

  it('INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE: off/0 disables the media bucket only; junk keeps 120', () => {
    process.env.INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE = 'off';
    expect(RateLimit.limit('media')).toBeNull();
    expect(RateLimit.limit()).toBe(30);
    process.env.INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE = 'lots';
    expect(RateLimit.limit('media')).toBe(120);
  });

  it('kindOf: image, document, audio, voice, video and sticker are media; everything else is text', () => {
    for (const t of ['image', 'document', 'audio', 'voice', 'video', 'sticker']) expect(RateLimit.kindOf(t)).toBe('media');
    for (const t of ['text', 'interactive', 'button', 'location', undefined]) expect(RateLimit.kindOf(t)).toBe('text');
  });
});

describe('daily caps', () => {
  const unregistered = { id: 'u-1', registration_completed: false };
  const registered = { id: 'u-2', registration_completed: true };

  it('empty means no cap, for every kind and tier (existing deployments unchanged)', async () => {
    for (const kind of Object.keys(DailyCaps.KINDS)) {
      expect(DailyCaps.capFor(kind, 'unregistered')).toBeNull();
      expect(DailyCaps.capFor(kind, 'registered')).toBeNull();
    }
    expect(await DailyCaps.claim(unregistered, 'message')).toEqual(expect.objectContaining({ allowed: true, limit: null }));
    expect(mockRedis.incr).not.toHaveBeenCalled();
  });

  it('the tier is registration_completed === true; a missing flag is unregistered', () => {
    expect(DailyCaps.tierOf(registered)).toBe('registered');
    expect(DailyCaps.tierOf({ id: 'x' })).toBe('unregistered');
    expect(DailyCaps.tierOf(null)).toBe('unregistered');
  });

  it('counts per kind, account and SCHOOL day on Redis; the first refusal is flagged', async () => {
    process.env.SCHOOL_TIMEZONE = 'Asia/Tokyo';
    process.env.DAILY_MESSAGE_CAP_UNREGISTERED = '40';
    const now = new Date('2026-03-04T16:00:00Z'); // 01:00 on 5 Mar in school time
    mockRedis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(41).mockResolvedValueOnce(42);
    const a = await DailyCaps.claim(unregistered, 'message', { now });
    expect(mockRedis.incr).toHaveBeenCalledWith('dailycap:message:u-1:2026-03-05');
    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    expect(a).toEqual(expect.objectContaining({ allowed: true, count: 1, limit: 40, tier: 'unregistered' }));
    const b = await DailyCaps.claim(unregistered, 'message', { now });
    const c = await DailyCaps.claim(unregistered, 'message', { now });
    expect([b.allowed, b.first, c.allowed, c.first]).toEqual([false, true, false, false]);
  });

  it('the registered tier reads its own variable; expensive-job caps have no registered variable', async () => {
    process.env.DAILY_MESSAGE_CAP_REGISTERED = '200';
    process.env.DAILY_LESSON_PLAN_CAP_UNREGISTERED = '3';
    expect(DailyCaps.capFor('message', 'registered')).toBe(200);
    expect(DailyCaps.capFor('lesson_plan', 'registered')).toBeNull();
    expect(DailyCaps.capFor('lesson_plan', 'unregistered')).toBe(3);
  });

  it('Redis down: an in-process counter, not fail-open', async () => {
    mockRedis.available = false;
    process.env.DAILY_COACHING_CAP_UNREGISTERED = '1';
    expect((await DailyCaps.claim(unregistered, 'coaching')).allowed).toBe(true);
    const second = await DailyCaps.claim(unregistered, 'coaching');
    expect(second).toEqual(expect.objectContaining({ allowed: false, degraded: true }));
  });

  it('allowOrExplain sends the refusal; the 0-cap copy says registration unlocks it', async () => {
    mockRedis.available = false;
    process.env.DAILY_COACHING_CAP_UNREGISTERED = '0';
    expect(await DailyCaps.allowOrExplain(unregistered, 'coaching', 'mtx:1555')).toBe(false);
    expect(mockSend).toHaveBeenCalledWith('mtx:1555', expect.stringMatching(/once you finish registering/));
    expect(await DailyCaps.allowOrExplain(registered, 'coaching', 'mtx:1555')).toBe(true);
  });

  it('the copy is gender-neutral and names /register', () => {
    for (const kind of ['lesson_plan', 'coaching', 'quiz']) {
      for (const limit of [0, 1, 3]) {
        const m = DailyCaps.capMessage(kind, { limit, tier: 'unregistered' });
        expect(m).toMatch(/\/register/);
        expect(m).not.toMatch(/\b(she|her|he|his|him)\b/i);
      }
    }
    expect(DailyCaps.capMessage('message', { limit: 40, tier: 'unregistered' })).toMatch(/40 messages.*\/register/);
    expect(DailyCaps.capMessage('message', { limit: 300, tier: 'registered' })).toMatch(/300 messages.*tomorrow/);
  });
});

describe('model budget', () => {
  const apiError = (status, message, code) => Object.assign(new Error(message), { status, code, error: { message, code } });

  it('recognises budget refusals and nothing else', () => {
    expect(ModelBudget.isBudgetError(apiError(402, 'Insufficient credits'))).toBe(true);
    expect(ModelBudget.isBudgetError(apiError(403, 'Key limit exceeded (total limit)'))).toBe(true);
    expect(ModelBudget.isBudgetError(apiError(429, 'You exceeded your current quota', 'insufficient_quota'))).toBe(true);
    expect(ModelBudget.isBudgetError(apiError(429, 'Rate limit exceeded: free-models-per-min'))).toBe(false);
    expect(ModelBudget.isBudgetError(apiError(403, 'Forbidden: moderation'))).toBe(false);
    expect(ModelBudget.isBudgetError(apiError(500, 'Internal'))).toBe(false);
    expect(ModelBudget.isBudgetError(null)).toBe(false);
  });

  it('guardCreate: a refusal trips the breaker (one alert, shared on Redis); later calls never reach the provider', async () => {
    mockRedis.setNX.mockResolvedValue(true);
    const create = jest.fn().mockRejectedValue(apiError(402, 'Insufficient credits'));
    const guarded = ModelBudget.guardCreate(create);
    await expect(guarded({})).rejects.toThrow('Insufficient credits');
    await new Promise((r) => setImmediate(r));
    await expect(guarded({})).rejects.toThrow(ModelBudget.ModelBudgetError);
    await expect(guarded({})).rejects.toThrow(ModelBudget.ModelBudgetError);
    expect(create).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith('model_budget:tripped', '1', 300);
    const alerts = mockLog.mock.calls.filter(([, d]) => d && d.alert === 'model_budget_exhausted');
    expect(alerts).toHaveLength(1);
  });

  it('the provider\'s own promise is returned untouched when the call succeeds', async () => {
    const p = Promise.resolve({ ok: 1 });
    p.withResponse = () => 'helpers stay';
    const guarded = ModelBudget.guardCreate(() => p);
    const got = guarded({});
    expect(got).toBe(p);
    expect(got.withResponse()).toBe('helpers stay');
  });

  it('isTripped sees another process\'s trip through Redis', async () => {
    mockRedis.get.mockResolvedValue('1');
    expect(await ModelBudget.isTripped()).toBe(true);
    expect(ModelBudget.isTrippedLocally()).toBe(true);
  });

  it('guard: a trip mid-message mutes its sends and tells the recipient "busy" once per cooldown', async () => {
    process.env.MODEL_BUDGET_COOLDOWN_SECONDS = '120';
    mockRedis.available = false;
    const create = jest.fn().mockRejectedValue(apiError(402, 'Insufficient credits'));
    const guarded = ModelBudget.guardCreate(create);
    let mutedInside;
    await ModelBudget.guard('15550100007', async () => {
      try { await guarded({}); } catch (_) { mutedInside = ModelBudget.isMuted(); }
    }, { send: mockSend, lang: () => 'ur' });
    expect(mutedInside).toBe(true);
    expect(ModelBudget.isMuted()).toBe(false);
    expect(mockSend).toHaveBeenCalledWith('15550100007', ModelBudget.busyMessage('ur'));
    await ModelBudget.guard('15550100007', async () => { await guarded({}).catch(() => {}); }, { send: mockSend });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('guard without a trip changes nothing', async () => {
    const r = await ModelBudget.guard('x', async () => 42, { send: mockSend });
    expect(r).toBe(42);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
