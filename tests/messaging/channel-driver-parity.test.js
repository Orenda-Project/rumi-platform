/**
 * Channel driver parity: every driver must expose the same method surface, so
 * that WhatsAppService.<method>(...) never throws "is not a function" no
 * matter which CHANNEL_DRIVER is active — the exact bug class
 * tests/setup/no-undefined-whatsapp-methods.test.js guards against for the
 * Meta driver specifically. This test locks the CROSS-DRIVER half of that
 * contract. Mirrors tests/queue/queue-driver-parity.test.js.
 *
 * Method names are parsed independently off meta-channel.service.js's source
 * (same regex the guard test uses), NOT via introspection — so this test
 * doesn't just tautologically confirm each driver's own derivation mechanism
 * works; it's a second, independent check.
 *
 * The driver LIST itself comes from channel-registry.js's DRIVERS map, not a
 * literal object — so a third/fourth driver (Slack, Discord, ...) is picked
 * up here automatically the day it's added to the registry, with no changes
 * to this file beyond registering that driver's own mock deps in
 * EXTRA_MOCKS_BY_DRIVER below (mirroring how baileys-connection is mocked
 * for baileys today).
 *
 * This file only checks EXISTENCE + the still-stubbed methods' behavior.
 * Behavior of the REAL (connection-backed) methods is covered by
 * tests/messaging/baileys-channel-service.test.js, which mocks
 * baileys-connection.js so nothing here ever opens a real socket.
 */

const fs = require('fs');
const path = require('path');

const MESSAGING_DIR = path.resolve(__dirname, '../../bot/shared/services/messaging');
const META_SERVICE = path.join(MESSAGING_DIR, 'meta-channel.service.js');
const { DRIVERS } = require('../../bot/shared/services/messaging/channel-registry');

// A literal require (not just the dynamic path.join(MESSAGING_DIR, ...) load
// inside loadDrivers() below) so tests/setup/orphan-modules.test.js's static
// require-graph scan keeps tracing an edge to every driver module — that
// scan only follows string-literal `require()` calls, not ones built from a
// runtime variable. Unused directly; loadDrivers() still requires by
// variable path so the driver LIST stays registry-driven (see file header).
require('../../bot/shared/services/messaging/meta-channel.service');
require('../../bot/shared/services/messaging/baileys-channel.service');
require('../../bot/shared/services/messaging/slack-channel.service');

function parseMethodNames(src) {
  const names = new Set();
  const methodRe = /^\s*static\s+(?:async\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(src))) names.add(m[1]);
  return [...names];
}

const REQUIRED_METHODS = parseMethodNames(fs.readFileSync(META_SERVICE, 'utf-8'));

// Per-driver mocks beyond the common set every driver needs (logger, r2).
// Add an entry here when a new driver's require graph needs something
// driver-specific stubbed out (e.g. baileys-connection for baileys,
// @slack/web-api for a future slack entry) — same shape, no restructuring.
const EXTRA_MOCKS_BY_DRIVER = {
  baileys: () => {
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockRejectedValue(new Error('not connected in this test')),
      isConnected: jest.fn().mockReturnValue(false),
      authDir: jest.fn().mockReturnValue('/tmp/never-used'),
    }));
  },
  slack: () => {
    jest.doMock('@slack/web-api', () => ({
      WebClient: jest.fn().mockImplementation(() => ({
        conversations: { open: jest.fn().mockRejectedValue(new Error('not connected in this test')) },
        chat: { postMessage: jest.fn() },
        reactions: { add: jest.fn() },
        files: { uploadV2: jest.fn(), info: jest.fn() },
      })),
    }), { virtual: true });
  },
};

function loadDrivers() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn(),
  }));
  for (const name of Object.keys(DRIVERS)) {
    if (EXTRA_MOCKS_BY_DRIVER[name]) EXTRA_MOCKS_BY_DRIVER[name]();
  }
  const loaded = {};
  for (const [name, modulePath] of Object.entries(DRIVERS)) {
    loaded[name] = require(path.join(MESSAGING_DIR, modulePath));
  }
  return loaded;
}

afterEach(() => jest.resetModules());

describe('channel driver parity', () => {
  it('parser found the real method names (not vacuously passing)', () => {
    expect(REQUIRED_METHODS).toContain('sendMessage');
    expect(REQUIRED_METHODS).toContain('sendFlow');
    expect(REQUIRED_METHODS.length).toBeGreaterThan(20);
  });

  describe.each(Object.keys(DRIVERS))('%s driver', (driverName) => {
    it.each(REQUIRED_METHODS)('implements %s()', (m) => {
      const drivers = loadDrivers();
      expect(typeof drivers[driverName][m]).toBe('function');
    });
  });

  // Methods with NO Baileys equivalent (Meta-template-specific — see
  // baileys-channel.service.js's STUBS table for why) — these stay honest
  // stubs and are safe to call directly without a connection.
  const STUB_ASYNC_METHODS = ['sendTemplate', 'sendFlow', 'sendStyleCarousel', 'sendFeatureMenuCarousel'];
  const STUB_SYNC_METHODS = ['buildStyleCarouselPayload', 'buildFeatureMenuCarouselPayload'];

  it.each(STUB_ASYNC_METHODS)('Baileys %s() has no equivalent yet — logs and resolves false', async (m) => {
    const { baileys } = loadDrivers();
    await expect(baileys[m]('923001234567', 'x', 'y', 'z')).resolves.toBe(false);
  });

  it.each(STUB_SYNC_METHODS)('Baileys %s() has no equivalent yet — is synchronous and returns null, not a Promise', (m) => {
    const { baileys } = loadDrivers();
    const result = baileys[m]('923001234567');
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toBeNull();
  });

  it('Baileys getMediaInfo()/downloadMedia() reject on a cache miss (matches Meta\'s throw-on-failure contract)', async () => {
    const { baileys } = loadDrivers();
    await expect(baileys.getMediaInfo('never-cached-id')).rejects.toThrow(/no cached media/);
    await expect(baileys.downloadMedia('never-cached-id')).rejects.toThrow(/no cached media/);
  });

  it('Baileys startContinuousTypingIndicator() is synchronous and returns a real, callable controller', () => {
    const { baileys } = loadDrivers();
    const controller = baileys.startContinuousTypingIndicator('923001234567', 'msg-id');
    expect(controller).not.toBeInstanceOf(Promise);
    expect(typeof controller.stop).toBe('function');
    expect(() => controller.stop()).not.toThrow();
  });

  it('Baileys _removeEmotionTags() is a real, synchronous reimplementation (pure/channel-agnostic), not a stub', () => {
    const { baileys } = loadDrivers();
    expect(baileys._removeEmotionTags('[warmly] hello')).toBe('hello');
  });

  it('loading the Baileys driver never requires Meta\'s HTTP client (axios/form-data) or meta-channel.service.js itself', () => {
    jest.resetModules();
    let axiosRequired = false;
    let formDataRequired = false;
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn(), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    jest.doMock('axios', () => { axiosRequired = true; return {}; }, { virtual: true });
    jest.doMock('form-data', () => { formDataRequired = true; return {}; }, { virtual: true });
    jest.doMock(
      '../../bot/shared/services/messaging/meta-channel.service',
      () => { throw new Error('baileys-channel.service.js must not require() meta-channel.service.js'); },
    );
    try {
      require('../../bot/shared/services/messaging/baileys-channel.service');
      expect(axiosRequired).toBe(false);
      expect(formDataRequired).toBe(false);
    } finally {
      // jest.resetModules() clears the module REGISTRY but not a doMock
      // FACTORY registered in this test — without this, the throwing
      // meta-channel.service mock above leaks into every test that runs
      // after this one in the file (a real, pre-existing test-isolation gap
      // this generalization surfaced, not something new to it).
      jest.dontMock('../../bot/shared/services/messaging/meta-channel.service');
    }
  });

  // Slack's stub set differs from Baileys': no Flow/template/carousel methods
  // (same reason — needs the unbuilt channel-agnostic template registry), but
  // ALSO no typing indicator (Slack has no bot typing-indicator API at all,
  // unlike Baileys' presence-update equivalent) — so this is its own table,
  // not a reuse of STUB_ASYNC_METHODS/STUB_SYNC_METHODS above.
  const SLACK_STUB_ASYNC_METHODS = ['sendTemplate', 'sendFlow', 'sendStyleCarousel', 'sendFeatureMenuCarousel'];
  const SLACK_STUB_SYNC_METHODS = ['buildStyleCarouselPayload', 'buildFeatureMenuCarouselPayload'];

  it.each(SLACK_STUB_ASYNC_METHODS)('Slack %s() has no equivalent yet — logs and resolves false', async (m) => {
    const { slack } = loadDrivers();
    await expect(slack[m]('slack:U0123ABC', 'x', 'y', 'z')).resolves.toBe(false);
  });

  it.each(SLACK_STUB_SYNC_METHODS)('Slack %s() has no equivalent yet — is synchronous and returns null, not a Promise', (m) => {
    const { slack } = loadDrivers();
    const result = slack[m]('slack:U0123ABC');
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toBeNull();
  });

  it('Slack showTypingIndicator() is a documented no-op, not a stub — resolves true without a Slack API call', async () => {
    const { slack } = loadDrivers();
    await expect(slack.showTypingIndicator('slack:U0123ABC')).resolves.toBe(true);
  });

  it('Slack startContinuousTypingIndicator() is synchronous and returns a real, callable no-op controller', () => {
    const { slack } = loadDrivers();
    const controller = slack.startContinuousTypingIndicator('slack:U0123ABC');
    expect(controller).not.toBeInstanceOf(Promise);
    expect(typeof controller.stop).toBe('function');
    expect(() => controller.stop()).not.toThrow();
  });

  it('Slack _removeEmotionTags() is a real, synchronous reimplementation (pure/channel-agnostic), not a stub', () => {
    const { slack } = loadDrivers();
    expect(slack._removeEmotionTags('[warmly] hello')).toBe('hello');
  });

  it('loading the Slack driver never requires Meta\'s HTTP client (axios/form-data) or meta-channel.service.js itself', () => {
    jest.resetModules();
    let axiosRequired = false;
    let formDataRequired = false;
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('@slack/web-api', () => ({ WebClient: jest.fn() }), { virtual: true });
    jest.doMock('axios', () => { axiosRequired = true; return {}; }, { virtual: true });
    jest.doMock('form-data', () => { formDataRequired = true; return {}; }, { virtual: true });
    jest.doMock(
      '../../bot/shared/services/messaging/meta-channel.service',
      () => { throw new Error('slack-channel.service.js must not require() meta-channel.service.js'); },
    );
    try {
      require('../../bot/shared/services/messaging/slack-channel.service');
      expect(axiosRequired).toBe(false);
      expect(formDataRequired).toBe(false);
    } finally {
      // See the matching comment on the Baileys isolation test above —
      // jest.resetModules() does not undo a doMock FACTORY, so this must be
      // explicitly cleared or it poisons whatever test runs next in the file.
      jest.dontMock('../../bot/shared/services/messaging/meta-channel.service');
    }
  });
});
