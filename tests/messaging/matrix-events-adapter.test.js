/**
 * matrix-events.adapter.js -- mapping matrix-bot-sdk sync events (room.message,
 * room.failed_decryption) into the Meta-webhook-shaped payload whatsapp-bot.js's
 * handleWebhookPost already dispatches on. Mirrors discord-events.adapter.js's
 * own test coverage style (a persistent-listener attach(), not an HTTP route
 * handler) -- synthetic matrix-bot-sdk-shaped event objects are fed directly to
 * the mapping functions and to attach()'s registered listeners, never a real
 * MatrixClient/sync connection.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/messaging/matrix-channel.service', () => ({
  _cacheIncomingMedia: jest.fn(),
}));

const OWN_USER_ID = '@rumi:example.org';
const STARTED_AT = 1_700_000_000_000;

function pendingOptionsMock(overrides = {}) {
  return {
    get: jest.fn().mockResolvedValue(null),
    resolveSelection: jest.fn(() => null),
    clear: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let adapter;
let pendingOptions;

function loadAdapter(pendingOverrides) {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({
    _cacheIncomingMedia: jest.fn(),
  }));
  pendingOptions = pendingOptionsMock(pendingOverrides);
  jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptions);
  // eslint-disable-next-line global-require
  adapter = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
  return adapter;
}

beforeEach(() => {
  loadAdapter();
});

afterEach(() => {
  adapter._resetSeenIdsForTests();
  jest.clearAllMocks();
});

describe('toPrefixedIdentity', () => {
  it('prefixes a Matrix user id with "matrix:" -- the user id itself keeps its own colon', () => {
    expect(adapter.toPrefixedIdentity('@teacher:example.org')).toBe('matrix:@teacher:example.org');
  });
});

describe('toPrefixedMediaId', () => {
  it('prefixes an mxc:// URI with "matrix:" -- required so the messaging router (channel-registry.js#driverForIdentifier) sends getMediaInfo/downloadMedia to the Matrix driver, not the WhatsApp one', () => {
    expect(adapter.toPrefixedMediaId('mxc://example.org/abc123')).toBe('matrix:mxc://example.org/abc123');
  });
});

describe('mapMessageToMetaShape', () => {
  it('maps a plain text message to the Meta text shape, with the prefixed identity', async () => {
    const event = {
      sender: '@teacher:example.org',
      event_id: '$169999',
      origin_server_ts: STARTED_AT + 5000,
      content: { msgtype: 'm.text', body: 'Hello Rumi' },
    };
    const mapped = await adapter.mapMessageToMetaShape('!room:example.org', event, OWN_USER_ID, STARTED_AT);
    expect(mapped).toEqual({
      from: 'matrix:@teacher:example.org',
      id: '$169999',
      timestamp: Math.floor((STARTED_AT + 5000) / 1000),
      type: 'text',
      text: { body: 'Hello Rumi' },
    });
  });

  it('skips the bot\'s own message (echo)', async () => {
    const event = {
      sender: OWN_USER_ID, event_id: '$1', origin_server_ts: STARTED_AT + 1000,
      content: { msgtype: 'm.text', body: 'echo' },
    };
    expect(await adapter.mapMessageToMetaShape('!room:x', event, OWN_USER_ID, STARTED_AT)).toBeNull();
  });

  it('skips an event older than the adapter\'s own attach() time (pre-startup backlog)', async () => {
    const event = {
      sender: '@teacher:example.org', event_id: '$1', origin_server_ts: STARTED_AT - 5000,
      content: { msgtype: 'm.text', body: 'old' },
    };
    expect(await adapter.mapMessageToMetaShape('!room:x', event, OWN_USER_ID, STARTED_AT)).toBeNull();
  });

  it('skips a non-text, non-media msgtype (e.g. m.notice)', async () => {
    const event = {
      sender: '@teacher:example.org', event_id: '$1', origin_server_ts: STARTED_AT + 1000,
      content: { msgtype: 'm.notice', body: 'a bot notice' },
    };
    expect(await adapter.mapMessageToMetaShape('!room:x', event, OWN_USER_ID, STARTED_AT)).toBeNull();
  });

  it('skips a text message with no body', async () => {
    const event = {
      sender: '@teacher:example.org', event_id: '$1', origin_server_ts: STARTED_AT + 1000,
      content: { msgtype: 'm.text' },
    };
    expect(await adapter.mapMessageToMetaShape('!room:x', event, OWN_USER_ID, STARTED_AT)).toBeNull();
  });

  it('returns null for a nullish/incomplete event', async () => {
    expect(await adapter.mapMessageToMetaShape('!room:x', null, OWN_USER_ID, STARTED_AT)).toBeNull();
    expect(await adapter.mapMessageToMetaShape('!room:x', {}, OWN_USER_ID, STARTED_AT)).toBeNull();
  });

  it('delegates to attachment mapping when the message carries a media msgtype', async () => {
    const event = {
      sender: '@teacher:example.org', event_id: '$1', origin_server_ts: STARTED_AT + 1000,
      content: { msgtype: 'm.audio', body: 'voice.ogg', url: 'mxc://example.org/F1', info: { mimetype: 'audio/ogg', size: 42 } },
    };
    const mapped = await adapter.mapMessageToMetaShape('!room:x', event, OWN_USER_ID, STARTED_AT);
    expect(mapped.type).toBe('audio');
    expect(mapped.audio.id).toBe('matrix:mxc://example.org/F1');
  });

  it('resolves a numbered reply to a pending menu into an interactive shape BEFORE falling through to plain text', async () => {
    loadAdapter({
      get: jest.fn().mockResolvedValue({ replyType: 'list_reply', options: [{ id: 'lang_ur', title: 'Urdu' }] }),
      resolveSelection: jest.fn(() => ({ id: 'lang_ur', title: 'Urdu' })),
    });
    const event = {
      sender: '@teacher:example.org', event_id: '$1', origin_server_ts: STARTED_AT + 1000,
      content: { msgtype: 'm.text', body: '1' },
    };
    const mapped = await adapter.mapMessageToMetaShape('!room:x', event, OWN_USER_ID, STARTED_AT);
    expect(mapped).toEqual({
      from: 'matrix:@teacher:example.org',
      id: '$1',
      timestamp: Math.floor((STARTED_AT + 1000) / 1000),
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'lang_ur', title: 'Urdu' } },
    });
    expect(pendingOptions.clear).toHaveBeenCalledWith('matrix:@teacher:example.org');
  });
});

describe('mapAttachmentToMetaShape', () => {
  it('maps an m.image message to the Meta image shape, carrying the body as the caption, and caches media metadata (NOT a downloaded buffer)', async () => {
    const matrixChannel = require('../../bot/shared/services/messaging/matrix-channel.service');
    const mapped = adapter.mapAttachmentToMetaShape('matrix:@teacher:example.org', '$1', 169100, {
      msgtype: 'm.image', body: 'look at this', url: 'mxc://example.org/F2', info: { mimetype: 'image/png', size: 100 },
    });
    expect(mapped).toEqual({
      from: 'matrix:@teacher:example.org',
      id: '$1',
      timestamp: 169100,
      type: 'image',
      image: { id: 'matrix:mxc://example.org/F2', mime_type: 'image/png', caption: 'look at this' },
    });
    expect(matrixChannel._cacheIncomingMedia).toHaveBeenCalledWith('matrix:mxc://example.org/F2', {
      url: 'mxc://example.org/F2', mime_type: 'image/png', file_size: 100,
    });
  });

  it('maps an m.video message to the Meta video shape', () => {
    const mapped = adapter.mapAttachmentToMetaShape('matrix:@teacher:example.org', '$1', 169100, {
      msgtype: 'm.video', body: 'clip', url: 'mxc://example.org/F3', info: { mimetype: 'video/mp4', size: 500 },
    });
    expect(mapped.type).toBe('video');
    expect(mapped.video.id).toBe('matrix:mxc://example.org/F3');
  });

  it('maps an m.file message (or anything else with a url) to the Meta document shape', () => {
    const mapped = adapter.mapAttachmentToMetaShape('matrix:@teacher:example.org', '$1', 169100, {
      msgtype: 'm.file', body: 'lesson-plan.pdf', url: 'mxc://example.org/F4', info: { mimetype: 'application/pdf', size: 200 },
    });
    expect(mapped).toEqual({
      from: 'matrix:@teacher:example.org',
      id: '$1',
      timestamp: 169100,
      type: 'document',
      document: { id: 'matrix:mxc://example.org/F4', mime_type: 'application/pdf', filename: 'lesson-plan.pdf' },
    });
  });

  it('returns null when the media content has no url (e.g. an undecryptable media event)', () => {
    const mapped = adapter.mapAttachmentToMetaShape('matrix:@teacher:example.org', '$1', 169100, { msgtype: 'm.image', body: 'x' });
    expect(mapped).toBeNull();
  });
});

describe('toInteractiveSelection', () => {
  it('returns null when there is no pending menu', async () => {
    expect(await adapter.toInteractiveSelection('matrix:@teacher:example.org', 'hello')).toBeNull();
  });

  it('resolves a button_reply selection and clears the menu', async () => {
    loadAdapter({
      get: jest.fn().mockResolvedValue({ replyType: 'button_reply', options: [{ id: 'menu_video', title: 'Video' }] }),
      resolveSelection: jest.fn(() => ({ id: 'menu_video', title: 'Video' })),
    });
    const result = await adapter.toInteractiveSelection('matrix:@teacher:example.org', '1');
    expect(result).toEqual({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'menu_video', title: 'Video' } } });
    expect(pendingOptions.clear).toHaveBeenCalledWith('matrix:@teacher:example.org');
  });
});

describe('isDuplicateDelivery', () => {
  it('returns false for an unseen id and true for the same id seen again', () => {
    expect(adapter.isDuplicateDelivery('$msg-1')).toBe(false);
    expect(adapter.isDuplicateDelivery('$msg-1')).toBe(true);
  });

  it('treats an absent id as never a duplicate (never records it)', () => {
    expect(adapter.isDuplicateDelivery(undefined)).toBe(false);
    expect(adapter.isDuplicateDelivery(undefined)).toBe(false);
  });
});

describe('attach', () => {
  function mockConnection({ getUserIdImpl } = {}) {
    const handlers = {};
    const client = {
      on: jest.fn((event, handler) => { handlers[event] = handler; }),
      getUserId: jest.fn(getUserIdImpl || (async () => OWN_USER_ID)),
    };
    jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
      getClient: jest.fn().mockResolvedValue(client),
      getCachedUserId: jest.fn(() => OWN_USER_ID),
    }));
    return { client, handlers };
  }

  beforeEach(() => jest.resetModules());

  it('registers a room.message and a room.failed_decryption listener on the shared client', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    await freshAttach(jest.fn());

    expect(typeof handlers['room.message']).toBe('function');
    expect(typeof handlers['room.failed_decryption']).toBe('function');
  });

  it('dispatches a mapped text message on room.message', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);

    await handlers['room.message']('!room:x', {
      sender: '@teacher:example.org', event_id: '$1', origin_server_ts: Date.now() + 1000,
      content: { msgtype: 'm.text', body: 'hi' },
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'matrix:@teacher:example.org', type: 'text', text: { body: 'hi' } })
    );
  });

  it('does not dispatch twice for a redelivered event id', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);
    const event = {
      sender: '@teacher:example.org', event_id: '$dup-1', origin_server_ts: Date.now() + 1000,
      content: { msgtype: 'm.text', body: 'hi' },
    };
    await handlers['room.message']('!room:x', event);
    await handlers['room.message']('!room:x', event);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('logs one line (no message body) and does not throw on room.failed_decryption', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    const { handlers } = mockConnection();
    const logger = require('../../bot/shared/utils/logger');
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    await freshAttach(jest.fn());
    expect(() => handlers['room.failed_decryption']('!room:x', { event_id: '$1' }, new Error('bad session'))).not.toThrow();
    expect(logger.logToFile).toHaveBeenCalledWith(
      expect.stringContaining('failed to decrypt'),
      expect.objectContaining({ roomId: '!room:x', eventId: '$1' })
    );
    // No message body/content ever logged -- teacher privacy.
    const loggedPayload = logger.logToFile.mock.calls.find(([msg]) => msg.includes('failed to decrypt'))[1];
    expect(loggedPayload).not.toHaveProperty('content');
    expect(loggedPayload).not.toHaveProperty('body');
  });

  it('does not dispatch its own echoed message', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);

    await handlers['room.message']('!room:x', {
      sender: OWN_USER_ID, event_id: '$echo', origin_server_ts: Date.now() + 1000,
      content: { msgtype: 'm.text', body: 'my own reply' },
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('defaultWelcomeRoomAlias', () => {
  it('derives "#rumi-announcements:<server>" from the bot\'s own user id', () => {
    expect(adapter.defaultWelcomeRoomAlias('@rumi:example.org')).toBe('#rumi-announcements:example.org');
  });

  it('returns null when there is no server part to derive from', () => {
    expect(adapter.defaultWelcomeRoomAlias('')).toBeNull();
    expect(adapter.defaultWelcomeRoomAlias(undefined)).toBeNull();
  });
});

describe('handleWelcomeRoomJoin', () => {
  /**
   * @param {boolean} localGreeted whether the LOCAL storage provider (this
   *   process's own MATRIX_STORAGE_DIR) already has the marker.
   * @param {object|null} serverGreetedMap the homeserver account-data map,
   *   or null to simulate a real M_NOT_FOUND (nothing ever written there) --
   *   the "fresh storage dir, but the SERVER remembers" scenario this fix
   *   exists for is `{ localGreeted: false, serverGreetedMap: {...} }`.
   */
  function fakeClient({ localGreeted = false, serverGreetedMap = null } = {}) {
    const notFound = async () => {
      const error = new Error('Event not found.');
      error.body = { errcode: 'M_NOT_FOUND' };
      throw error;
    };
    return {
      storageProvider: {
        readValue: jest.fn().mockResolvedValue(localGreeted ? '1' : null),
        storeValue: jest.fn().mockResolvedValue(undefined),
      },
      getAccountData: jest.fn(serverGreetedMap ? async () => serverGreetedMap : notFound),
      setAccountData: jest.fn().mockResolvedValue(undefined),
    };
  }

  function mockMatrixChannel(overrides = {}) {
    const mod = {
      _cacheIncomingMedia: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue(true),
      _resolveDmRoomId: jest.fn().mockResolvedValue('!dm:example.org'),
      ...overrides,
    };
    jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => mod);
    return mod;
  }

  beforeEach(() => jest.resetModules());

  it('opens a DM (via the driver\'s own sendMessage) and sends the welcome message on a genuine first join (nothing local, nothing on the server)', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const matrixChannel = mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient();

    const event = { type: 'm.room.member', state_key: '@teacher:example.org', content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);

    expect(matrixChannel.sendMessage).toHaveBeenCalledWith(
      'matrix:@teacher:example.org',
      expect.stringContaining("we're glad you're here")
    );
    // Write-through: BOTH the local cache (speed) AND the homeserver account
    // data (source of truth) get the marker.
    expect(client.storageProvider.storeValue).toHaveBeenCalledWith('rumi:matrix:welcomed:@teacher:example.org', '1');
    expect(client.setAccountData).toHaveBeenCalledWith('org.rumi.messenger.greeted', { '@teacher:example.org': true });
  });

  it('never re-greets a user the LOCAL cache already has a marker for (same-process fast path)', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const matrixChannel = mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient({ localGreeted: true });

    const event = { type: 'm.room.member', state_key: '@teacher:example.org', content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);

    expect(matrixChannel.sendMessage).not.toHaveBeenCalled();
    // The fast path never even needed to ask the server.
    expect(client.getAccountData).not.toHaveBeenCalled();
  });

  it('REGRESSION: a fresh process (empty local storage) with a marker already on the homeserver does NOT re-greet', async () => {
    // The exact bug this fix closes: a new bot process (new MATRIX_STORAGE_DIR,
    // same @rumi account) has no local cache at all, but the homeserver
    // account data already remembers this user from a PREVIOUS process.
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const matrixChannel = mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient({ localGreeted: false, serverGreetedMap: { '@teacher:example.org': true } });

    const event = { type: 'm.room.member', state_key: '@teacher:example.org', content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);

    expect(matrixChannel.sendMessage).not.toHaveBeenCalled();
    // The server answer is backfilled into this (fresh) process's local
    // cache, so a second join in the SAME process skips the network too.
    expect(client.storageProvider.storeValue).toHaveBeenCalledWith('rumi:matrix:welcomed:@teacher:example.org', '1');
  });

  it('REGRESSION: a fresh process with NOTHING on the server (a real first-ever join) greets and writes the account-data marker', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const matrixChannel = mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient({ localGreeted: false, serverGreetedMap: null });

    const event = { type: 'm.room.member', state_key: '@newteacher:example.org', content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);

    expect(matrixChannel.sendMessage).toHaveBeenCalledWith('matrix:@newteacher:example.org', expect.any(String));
    expect(client.setAccountData).toHaveBeenCalledWith('org.rumi.messenger.greeted', { '@newteacher:example.org': true });
  });

  it('merges into an EXISTING server-side map rather than overwriting other users\' entries', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient({ serverGreetedMap: { '@already:example.org': true } });

    const event = { type: 'm.room.member', state_key: '@new:example.org', content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);

    expect(client.setAccountData).toHaveBeenCalledWith('org.rumi.messenger.greeted', {
      '@already:example.org': true,
      '@new:example.org': true,
    });
  });

  it('ignores the bot\'s own join to the welcome room', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const matrixChannel = mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient();

    const event = { type: 'm.room.member', state_key: OWN_USER_ID, content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);
    expect(matrixChannel.sendMessage).not.toHaveBeenCalled();
  });

  it('ignores an event in a different room, and any non-join member event', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const matrixChannel = mockMatrixChannel();
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient();

    await freshHandle(
      client, '!welcome:example.org', '!other:example.org',
      { type: 'm.room.member', state_key: '@x:example.org', content: { membership: 'join' } },
      OWN_USER_ID
    );
    await freshHandle(
      client, '!welcome:example.org', '!welcome:example.org',
      { type: 'm.room.message', content: {} },
      OWN_USER_ID
    );
    await freshHandle(
      client, '!welcome:example.org', '!welcome:example.org',
      { type: 'm.room.member', state_key: '@x:example.org', content: { membership: 'leave' } },
      OWN_USER_ID
    );
    expect(matrixChannel.sendMessage).not.toHaveBeenCalled();
  });

  it('does not mark the user greeted when the welcome send fails -- a retry can still happen later', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    mockMatrixChannel({ sendMessage: jest.fn().mockResolvedValue(false) });
    const { handleWelcomeRoomJoin: freshHandle } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');
    const client = fakeClient();

    const event = { type: 'm.room.member', state_key: '@teacher:example.org', content: { membership: 'join' } };
    await freshHandle(client, '!welcome:example.org', '!welcome:example.org', event, OWN_USER_ID);
    expect(client.storageProvider.storeValue).not.toHaveBeenCalled();
  });
});

describe('attach -- welcome-room join wiring', () => {
  function mockConnectionWithWelcome({ joinRoomImpl, resolveRoomImpl } = {}) {
    const handlers = {};
    const client = {
      on: jest.fn((event, handler) => { handlers[event] = handler; }),
      getUserId: jest.fn().mockResolvedValue(OWN_USER_ID),
      joinRoom: jest.fn(joinRoomImpl || (async () => '!welcome:example.org')),
      resolveRoom: jest.fn(resolveRoomImpl || (async () => '!welcome:example.org')),
    };
    jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
      getClient: jest.fn().mockResolvedValue(client),
      getCachedUserId: jest.fn(() => OWN_USER_ID),
    }));
    return { client, handlers };
  }

  beforeEach(() => jest.resetModules());

  it('registers a room.event listener when the welcome room alias resolves', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({ _cacheIncomingMedia: jest.fn() }));
    const { handlers } = mockConnectionWithWelcome();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    await freshAttach(jest.fn());
    expect(typeof handlers['room.event']).toBe('function');
  });

  it('does not register a room.event listener when the welcome alias cannot be resolved -- messaging still works either way', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({ _cacheIncomingMedia: jest.fn() }));
    const { handlers } = mockConnectionWithWelcome({ resolveRoomImpl: async () => { throw new Error('not found'); } });
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    await freshAttach(jest.fn());
    expect(handlers['room.event']).toBeUndefined();
    expect(typeof handlers['room.message']).toBe('function'); // unaffected
  });

  it('a room.event join in the resolved welcome room triggers the welcome DM end-to-end, exactly once per user', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => pendingOptionsMock());
    const matrixChannel = {
      _cacheIncomingMedia: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue(true),
      _resolveDmRoomId: jest.fn().mockResolvedValue('!dm:x'),
    };
    jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => matrixChannel);
    const { client, handlers } = mockConnectionWithWelcome();
    client.storageProvider = { readValue: jest.fn().mockResolvedValue(null), storeValue: jest.fn().mockResolvedValue(undefined) };
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

    await freshAttach(jest.fn());
    await handlers['room.event']('!welcome:example.org', {
      type: 'm.room.member', state_key: '@newteacher:example.org', content: { membership: 'join' },
    });

    expect(matrixChannel.sendMessage).toHaveBeenCalledWith('matrix:@newteacher:example.org', expect.any(String));

    // A second join for the same user must do nothing further.
    client.storageProvider.readValue.mockResolvedValue('1');
    await handlers['room.event']('!welcome:example.org', {
      type: 'm.room.member', state_key: '@newteacher:example.org', content: { membership: 'join' },
    });
    expect(matrixChannel.sendMessage).toHaveBeenCalledTimes(1);
  });
});
