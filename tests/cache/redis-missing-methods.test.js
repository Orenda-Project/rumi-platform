/**
 * setNX and setexWithCeiling — two methods the bot called for a long time
 * without them existing.
 *
 * Both failures were found by running the bot, and both were invisible in the
 * code because of how they failed:
 *  - setexWithCeiling: called from 10+ places in the quiz subsystem, so no quiz
 *    could be delivered on any deployment (/quiz → pick a class → "Sorry,
 *    something went wrong").
 *  - setNX: the idempotency claim at the top of runImageAnalysis(), NOT wrapped
 *    in its own try/catch, so EVERY inbound image threw and answered with the
 *    generic error.
 *
 * The service is a singleton, so each test re-requires it fresh (same pattern as
 * redis-error-throttle.test.js).
 */

const path = require('path');

const SERVICE = path.resolve(__dirname, '../../bot/shared/services/cache/railway-redis.service');
const LOGGER = path.resolve(__dirname, '../../bot/shared/utils/logger');
const CONSTANTS = path.resolve(__dirname, '../../bot/shared/utils/constants');

/** @param {{available?: boolean, set?: Function, setex?: Function}} opts */
function loadService({ available = true, set, setex } = {}) {
  jest.resetModules();
  const calls = { set: [], setex: [] };
  jest.doMock('ioredis', () => class MockRedis {
    constructor() { this.status = 'ready'; }
    on() {}
    async set(...args) { calls.set.push(args); return set ? set(...args) : 'OK'; }
    async setex(...args) { calls.setex.push(args); return setex ? setex(...args) : 'OK'; }
  });
  const mockLog = jest.fn();
  jest.doMock(LOGGER, () => ({ logToFile: mockLog }));
  jest.doMock(CONSTANTS, () => ({ RATE_LIMIT_MAX: 30, RATE_LIMIT_WINDOW_SECONDS: 60 }));

  if (available) process.env.REDIS_URL = 'redis://localhost:6379';
  else delete process.env.REDIS_URL;

  const svc = require(SERVICE);
  return { svc, calls, mockLog };
}

afterEach(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  jest.resetModules();
});

describe('setNX', () => {
  it('issues an atomic SET … EX ttl NX and reports the key as claimed', async () => {
    const { svc, calls } = loadService();
    await expect(svc.setNX('image:u1:i1', '{"status":"processing"}', 300)).resolves.toBe(true);
    expect(calls.set[0]).toEqual(['image:u1:i1', '{"status":"processing"}', 'EX', 300, 'NX']);
  });

  it('reports NOT claimed when the key already exists (Redis returns null)', async () => {
    const { svc } = loadService({ set: () => null });
    await expect(svc.setNX('k', 'v', 300)).resolves.toBe(false);
  });

  it('claims the key when Redis is unavailable, so the work is not skipped', async () => {
    // Returning false here would make the caller believe a duplicate is already
    // in flight — every image would be silently dropped on a Redis-less setup.
    const { svc } = loadService({ available: false });
    await expect(svc.setNX('k', 'v', 300)).resolves.toBe(true);
  });

  it('claims the key when the Redis call throws, for the same reason', async () => {
    const { svc } = loadService({ set: () => { throw new Error('ECONNRESET'); } });
    await expect(svc.setNX('k', 'v', 300)).resolves.toBe(true);
  });

  it('never sends a zero or negative TTL', async () => {
    const { svc, calls } = loadService();
    await svc.setNX('k', 'v', 0);
    await svc.setNX('k', 'v', -5);
    expect(calls.set.map((c) => c[3])).toEqual([60, 60]);
  });
});

describe('setexWithCeiling', () => {
  it('passes a TTL under the ceiling through unchanged', async () => {
    const { svc, calls } = loadService();
    await expect(svc.setexWithCeiling('quiz:active:923001234567', 3600, 'state')).resolves.toBe(true);
    expect(calls.setex[0]).toEqual(['quiz:active:923001234567', 3600, 'state']);
  });

  it('accepts the 24h TTL the quiz subsystem actually uses', async () => {
    const { svc, calls } = loadService();
    await svc.setexWithCeiling('k', 86400, 'v');
    expect(calls.setex[0][1]).toBe(86400);
  });

  it('clamps anything longer to 24h, and says so', async () => {
    const { svc, calls, mockLog } = loadService();
    await svc.setexWithCeiling('k', 7 * 86400, 'v');
    expect(calls.setex[0][1]).toBe(86400);
    expect(mockLog.mock.calls.flat().join(' ')).toMatch(/Clamped Redis TTL/);
  });

  it('falls back to the ceiling for a missing or nonsense TTL', async () => {
    const { svc, calls } = loadService();
    await svc.setexWithCeiling('k', undefined, 'v');
    await svc.setexWithCeiling('k', -1, 'v');
    await svc.setexWithCeiling('k', 'soon', 'v');
    expect(calls.setex.map((c) => c[1])).toEqual([86400, 86400, 86400]);
  });

  it('returns false rather than throwing when Redis is unavailable', async () => {
    const { svc } = loadService({ available: false });
    await expect(svc.setexWithCeiling('k', 60, 'v')).resolves.toBe(false);
  });
});
