/**
 * "Reply goes to the room the message arrived in" -- the fix for a live
 * misdelivery bug: a teacher's question in room !ljKfozcoLYAVQKuxMM:localhost
 * got Rumi's reply in a brand-new room !zskAHVYNfwWVYrUSpl:localhost nobody
 * else had joined, because matrix-channel.service.js's resolveDmRoomId()
 * re-derived a DM room via client.dms.getOrCreateDm() (backed by the
 * eventually-consistent 'm.direct' account-data map), which raced the
 * (correctly, per the earlier crash fix) SERIALIZED account-data write and
 * created a duplicate room instead of reusing the one the message actually
 * arrived in.
 *
 * Covers matrix-events.adapter.js's recordInboundRoom()/getLastInboundRoom()
 * (the "ground truth" map) together with matrix-channel.service.js's
 * resolveDmRoomId() (the consumer), and matrix-connection.js's
 * isJoinedToRoom() (mocked here, exercised directly in matrix-connection.test.js).
 */

function loadModules({ isJoinedToRoomImpl, dmRoomId = '!fallback-dm:example.org' } = {}) {
  jest.resetModules();

  const client = {
    sendMessage: jest.fn(async () => '$event1'),
    dms: {
      getOrCreateDm: jest.fn(async (userId, createFn) => (createFn ? createFn(userId) : dmRoomId)),
    },
    storageProvider: {
      readValue: jest.fn(async () => null),
      storeValue: jest.fn(async () => undefined),
    },
    createRoom: jest.fn(async () => dmRoomId),
  };

  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => url.split('/').pop()),
  }));
  jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
    remember: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    resolveSelection: jest.fn(() => null),
  }));
  jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
    getClient: jest.fn(async () => client),
    isE2eeActive: jest.fn(() => false),
    isJoinedToRoom: jest.fn(isJoinedToRoomImpl || (() => true)),
  }));

  // eslint-disable-next-line global-require
  const service = require('../../bot/shared/services/messaging/matrix-channel.service');
  // eslint-disable-next-line global-require
  const adapter = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
  // eslint-disable-next-line global-require
  const connection = require('../../bot/shared/services/messaging/matrix-connection');

  return { service, adapter, connection, client };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reply-to-the-room-you-were-messaged-in', () => {
  it('(a) inbound from room X, then an outbound reply to that user, goes to room X -- not a new/re-derived room', async () => {
    const { service, adapter, client } = loadModules();
    adapter.recordInboundRoom('@teacher:example.org', '!ljKfozcoLYAVQKuxMM:localhost');

    await service.sendMessage('matrix:@teacher:example.org', 'the answer to your question');

    expect(client.sendMessage).toHaveBeenCalledWith('!ljKfozcoLYAVQKuxMM:localhost', expect.anything());
    expect(client.dms.getOrCreateDm).not.toHaveBeenCalled();
  });

  it('(b) no recorded room falls back to getOrCreateDm (e.g. a bot-initiated welcome DM -- the user never sent a room.message)', async () => {
    const { service, adapter, client } = loadModules();
    expect(adapter.getLastInboundRoom('@newteacher:example.org')).toBeNull();

    await service.sendMessage('matrix:@newteacher:example.org', 'welcome');

    expect(client.dms.getOrCreateDm).toHaveBeenCalledWith('@newteacher:example.org', expect.any(Function));
    expect(client.sendMessage).toHaveBeenCalledWith('!fallback-dm:example.org', expect.anything());
  });

  it('(c) a recorded room the bot has since left falls back to getOrCreateDm, and never sends into the abandoned room', async () => {
    const { service, adapter, client } = loadModules({ isJoinedToRoomImpl: () => false });
    adapter.recordInboundRoom('@teacher:example.org', '!ileft:example.org');

    await service.sendMessage('matrix:@teacher:example.org', 'reply');

    expect(client.dms.getOrCreateDm).toHaveBeenCalledWith('@teacher:example.org', expect.any(Function));
    expect(client.sendMessage).not.toHaveBeenCalledWith('!ileft:example.org', expect.anything());
    expect(client.sendMessage).toHaveBeenCalledWith('!fallback-dm:example.org', expect.anything());
  });

  it('the welcome-DM path (matrix-events.adapter#handleWelcomeRoomJoin) is unaffected -- still creates/uses a proper DM room', async () => {
    // Deliberately NOT via loadModules() -- that helper requires the REAL
    // matrix-channel.service, which would already be cached by the time a
    // doMock for it here could take effect. Mirrors the existing
    // handleWelcomeRoomJoin test setup in matrix-events-adapter.test.js.
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({
      _cacheIncomingMedia: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue(true),
      _resolveDmRoomId: jest.fn().mockResolvedValue('!welcome-dm:example.org'),
    }));
    // eslint-disable-next-line global-require
    const adapter = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    // eslint-disable-next-line global-require
    const { handleWelcomeRoomJoin } = adapter;
    // eslint-disable-next-line global-require
    const matrixChannel = require('../../bot/shared/services/messaging/matrix-channel.service');

    const welcomeClient = {
      storageProvider: { readValue: jest.fn().mockResolvedValue(null), storeValue: jest.fn().mockResolvedValue(undefined) },
      getAccountData: jest.fn().mockRejectedValue(Object.assign(new Error('not found'), { body: { errcode: 'M_NOT_FOUND' } })),
      setAccountData: jest.fn().mockResolvedValue(undefined),
    };
    const event = { type: 'm.room.member', state_key: '@brandnew:example.org', content: { membership: 'join' } };

    await handleWelcomeRoomJoin(welcomeClient, '!announce:example.org', '!announce:example.org', event, '@rumi:example.org');

    // The welcome DM goes through the driver's own sendMessage -> the normal
    // getOrCreateDm-backed resolution, completely untouched by the
    // last-inbound-room map (this user never sent a room.message).
    expect(matrixChannel.sendMessage).toHaveBeenCalledWith('matrix:@brandnew:example.org', expect.stringContaining("we're glad you're here"));
    expect(adapter.getLastInboundRoom('@brandnew:example.org')).toBeNull();
  });

  it('(d) the last-inbound-room map does not grow unbounded', () => {
    const { adapter } = loadModules();
    for (let i = 0; i < 6000; i++) {
      adapter.recordInboundRoom(`@user${i}:example.org`, `!room${i}:example.org`);
    }
    expect(adapter._lastInboundRoomSizeForTests()).toBeLessThanOrEqual(5000);
  });

  it('(d) eviction drops the least-recently-touched entries first, keeping recently-touched ones', () => {
    const { adapter } = loadModules();
    adapter.recordInboundRoom('@keepme:example.org', '!keep:example.org');
    for (let i = 0; i < 5500; i++) {
      adapter.recordInboundRoom(`@filler${i}:example.org`, `!filler${i}:example.org`);
      if (i === 2500) adapter.recordInboundRoom('@keepme:example.org', '!keep:example.org'); // re-touch midway
    }
    expect(adapter._lastInboundRoomSizeForTests()).toBeLessThanOrEqual(5000);
    expect(adapter.getLastInboundRoom('@keepme:example.org')).toBe('!keep:example.org');
  });

  it('(d) an entry older than the TTL is treated as absent (falls back)', () => {
    const { adapter } = loadModules();
    let now = 1_000_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    adapter.recordInboundRoom('@teacher:example.org', '!room:example.org');
    expect(adapter.getLastInboundRoom('@teacher:example.org')).toBe('!room:example.org');

    now += 7 * 60 * 60 * 1000; // 7h later -- past the 6h TTL
    expect(adapter.getLastInboundRoom('@teacher:example.org')).toBeNull();
  });
});
