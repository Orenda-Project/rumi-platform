/**
 * lp-shelf.service — FIFO cap, sliding TTL, polymorphic delivery-type
 * discriminator, and flush. Redis + structured-logger mocked.
 */

let LPShelfService;
let store;
let redisMock;

beforeEach(() => {
  jest.resetModules();

  // In-memory redis stand-in honouring the get/set/del/expire contract used.
  store = new Map();
  redisMock = {
    get: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async (k, v) => { store.set(k, v); return 'OK'; }),
    del: jest.fn(async (k) => { store.delete(k); return 1; }),
    expire: jest.fn(async () => 1),
  };
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redisMock);
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

  LPShelfService = require('../../bot/shared/services/lp-shelf.service');
});
afterEach(() => jest.resetModules());

describe('getDeliveryType', () => {
  it('defaults to segment when discriminator absent or entry invalid', () => {
    expect(LPShelfService.getDeliveryType({})).toBe('segment');
    expect(LPShelfService.getDeliveryType(null)).toBe('segment');
    expect(LPShelfService.getDeliveryType('nope')).toBe('segment');
    expect(LPShelfService.getDeliveryType({ segment_id: 's1' })).toBe('segment');
  });

  it('returns chapter when delivery_type is chapter', () => {
    expect(LPShelfService.getDeliveryType({ delivery_type: 'chapter' })).toBe('chapter');
  });
});

describe('pushToShelf / getShelf', () => {
  it('appends entries newest-last', async () => {
    await LPShelfService.pushToShelf('u1', { segment_id: 'a' });
    await LPShelfService.pushToShelf('u1', { segment_id: 'b' });
    const shelf = await LPShelfService.getShelf('u1');
    expect(shelf.map((e) => e.segment_id)).toEqual(['a', 'b']);
  });

  it('caps at 5 entries, dropping the oldest (FIFO)', async () => {
    for (let i = 1; i <= 7; i++) {
      await LPShelfService.pushToShelf('u1', { segment_id: `s${i}` });
    }
    const shelf = await LPShelfService.getShelf('u1');
    expect(shelf).toHaveLength(5);
    expect(shelf.map((e) => e.segment_id)).toEqual(['s3', 's4', 's5', 's6', 's7']);
  });

  it('accepts chapter-shaped entries alongside segment ones', async () => {
    await LPShelfService.pushToShelf('u1', { segment_id: 'a' });
    await LPShelfService.pushToShelf('u1', { delivery_type: 'chapter', chapter_id: 'c1' });
    const shelf = await LPShelfService.getShelf('u1');
    expect(LPShelfService.getDeliveryType(shelf[1])).toBe('chapter');
  });

  it('returns [] for an empty/missing shelf without bumping TTL', async () => {
    const shelf = await LPShelfService.getShelf('nobody');
    expect(shelf).toEqual([]);
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it('bumps the sliding TTL on a non-empty read', async () => {
    await LPShelfService.pushToShelf('u1', { segment_id: 'a' });
    redisMock.expire.mockClear();
    await LPShelfService.getShelf('u1');
    expect(redisMock.expire).toHaveBeenCalledWith('lp_shelf:u1', expect.any(Number));
  });
});

describe('flushShelf', () => {
  it('deletes the shelf key', async () => {
    await LPShelfService.pushToShelf('u1', { segment_id: 'a' });
    await LPShelfService.flushShelf('u1');
    expect(redisMock.del).toHaveBeenCalledWith('lp_shelf:u1');
    expect(await LPShelfService.getShelf('u1')).toEqual([]);
  });
});

describe('_loadShelf resilience', () => {
  it('coerces non-array stored data to []', async () => {
    store.set('lp_shelf:u1', { not: 'an array' });
    expect(await LPShelfService.getShelf('u1')).toEqual([]);
  });
});
