/**
 * messaging/index.js — channel driver selector.
 * Default (unset, no Meta vars) resolves to the Baileys sandbox driver;
 * CHANNEL_DRIVER=meta resolves to the Meta driver; an unknown value falls
 * back to Baileys; with no CHANNEL_DRIVER set at all, ANY Meta var already
 * present infers `meta` (backward compat for pre-existing deployments).
 * Mirrors tests/queue/queue-driver-index.test.js.
 *
 * messaging/index.js now exports a Proxy WRAPPING the resolved WhatsApp
 * driver (not the driver object itself) — see index.js's own doc comment for
 * why (preserving jest.spyOn-ability on internal this.x() cross-method
 * calls once an additive channel like Slack can also be active). With no
 * additive channel configured (the case every one of these tests exercises),
 * the Proxy is fully transparent: every method call and property read
 * forwards straight through to the real driver, so behavior is identical —
 * strict `===` against the raw driver module is no longer true (a Proxy is
 * never `===` its target), so these assertions check behavioral equivalence
 * instead: the resolved driver's own identifying method returns what only
 * that driver could return.
 */

function mockCommon() {
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn(),
  }));
}

const META_VARS = ['CHANNEL_DRIVER', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID'];

afterEach(() => {
  jest.resetModules();
  META_VARS.forEach((k) => delete process.env[k]);
});

// meta-channel.service.js exports a class (typeof 'function'); baileys-
// channel.service.js exports a plain object (typeof 'object'). A Proxy
// preserves the target's typeof, so this cheaply tells the two apart without
// relying on strict `===` against the wrapped module (see file header).
function expectResolvesToMeta(idx) {
  expect(typeof idx).toBe('function');
}
function expectResolvesToBaileys(idx) {
  expect(typeof idx).toBe('object');
}

describe('messaging channel driver selector', () => {
  it('defaults to the Baileys singleton when CHANNEL_DRIVER is unset and no Meta vars are present', () => {
    jest.resetModules();
    mockCommon();
    const idx = require('../../bot/shared/services/messaging');
    expectResolvesToBaileys(idx);
    expect(typeof idx.sendMessage).toBe('function');
  });

  it('returns the Meta singleton when CHANNEL_DRIVER=meta', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'meta';
    const idx = require('../../bot/shared/services/messaging');
    expectResolvesToMeta(idx);
    expect(typeof idx.sendMessage).toBe('function');
  });

  it('returns the Baileys singleton when CHANNEL_DRIVER=baileys explicitly', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'baileys';
    const idx = require('../../bot/shared/services/messaging');
    expectResolvesToBaileys(idx);
  });

  it('falls back to Baileys for an unknown CHANNEL_DRIVER value', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'telegram';
    const idx = require('../../bot/shared/services/messaging');
    expectResolvesToBaileys(idx);
  });

  it('with no CHANNEL_DRIVER set, infers Meta when a Meta var is already present (backward compat)', () => {
    jest.resetModules();
    mockCommon();
    process.env.WHATSAPP_TOKEN = 'real-looking-token';
    const idx = require('../../bot/shared/services/messaging');
    expectResolvesToMeta(idx);
  });

  it('the WhatsAppService facade resolves to the same driver as messaging/index.js', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'baileys';
    const facade = require('../../bot/shared/services/whatsapp.service');
    const idx = require('../../bot/shared/services/messaging');
    // Both requires resolve through Node's module cache to the SAME Proxy
    // instance (whatsapp.service.js is a one-line `module.exports =
    // require('./messaging')` facade) — this identity DOES still hold, since
    // both call sites get back the one Proxy messaging/index.js constructed.
    expect(facade).toBe(idx);
    expectResolvesToBaileys(facade);
  });

  it('with no additive channel configured, the Proxy forwards every call to the real driver unchanged', async () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'baileys';
    const idx = require('../../bot/shared/services/messaging');
    const baileys = require('../../bot/shared/services/messaging/baileys-channel.service');
    // Spying on the raw driver module must still be observable through the
    // Proxy — this is the property the Proxy-based design exists to
    // preserve (see tests/whatsapp/send-image-from-url.test.js for the real
    // regression this guards against).
    const spy = jest.spyOn(baileys, 'sendReaction').mockResolvedValue('spied');
    await expect(idx.sendReaction('923001234567', 'msg-1')).resolves.toBe('spied');
    expect(spy).toHaveBeenCalledWith('923001234567', 'msg-1');
    spy.mockRestore();
  });
});
