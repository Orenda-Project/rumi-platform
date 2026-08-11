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
 * doesn't just tautologically confirm baileys-channel.service.js's own
 * derivation mechanism works; it's a second, independent check.
 *
 * This file only checks EXISTENCE + the still-stubbed methods' behavior.
 * Behavior of the REAL (connection-backed) methods is covered by
 * tests/messaging/baileys-channel-service.test.js, which mocks
 * baileys-connection.js so nothing here ever opens a real socket.
 */

const fs = require('fs');
const path = require('path');

const META_SERVICE = path.resolve(__dirname, '../../bot/shared/services/messaging/meta-channel.service.js');

function parseMethodNames(src) {
  const names = new Set();
  const methodRe = /^\s*static\s+(?:async\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(src))) names.add(m[1]);
  return [...names];
}

const REQUIRED_METHODS = parseMethodNames(fs.readFileSync(META_SERVICE, 'utf-8'));

function loadDrivers() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn(),
  }));
  jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
    getSocket: jest.fn().mockRejectedValue(new Error('not connected in this test')),
    isConnected: jest.fn().mockReturnValue(false),
    authDir: jest.fn().mockReturnValue('/tmp/never-used'),
  }));
  return {
    meta: require('../../bot/shared/services/messaging/meta-channel.service'),
    baileys: require('../../bot/shared/services/messaging/baileys-channel.service'),
  };
}

afterEach(() => jest.resetModules());

describe('channel driver parity', () => {
  it('parser found the real method names (not vacuously passing)', () => {
    expect(REQUIRED_METHODS).toContain('sendMessage');
    expect(REQUIRED_METHODS).toContain('sendFlow');
    expect(REQUIRED_METHODS.length).toBeGreaterThan(20);
  });

  it.each(REQUIRED_METHODS)('Meta driver implements %s()', (m) => {
    const { meta } = loadDrivers();
    expect(typeof meta[m]).toBe('function');
  });

  it.each(REQUIRED_METHODS)('Baileys driver implements %s()', (m) => {
    const { baileys } = loadDrivers();
    expect(typeof baileys[m]).toBe('function');
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
    require('../../bot/shared/services/messaging/baileys-channel.service');
    expect(axiosRequired).toBe(false);
    expect(formDataRequired).toBe(false);
  });
});
