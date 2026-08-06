/**
 * messaging/index.js — channel driver selector.
 * Default (unset, no Meta vars) resolves to the Baileys sandbox driver;
 * CHANNEL_DRIVER=meta resolves to the Meta driver; an unknown value falls
 * back to Baileys; with no CHANNEL_DRIVER set at all, ANY Meta var already
 * present infers `meta` (backward compat for pre-existing deployments).
 * Mirrors tests/queue/queue-driver-index.test.js.
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

describe('messaging channel driver selector', () => {
  it('defaults to the Baileys singleton when CHANNEL_DRIVER is unset and no Meta vars are present', () => {
    jest.resetModules();
    mockCommon();
    const idx = require('../../bot/shared/services/messaging');
    const baileys = require('../../bot/shared/services/messaging/baileys-channel.service');
    expect(idx).toBe(baileys);
  });

  it('returns the Meta singleton when CHANNEL_DRIVER=meta', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'meta';
    const idx = require('../../bot/shared/services/messaging');
    const meta = require('../../bot/shared/services/messaging/meta-channel.service');
    expect(idx).toBe(meta);
  });

  it('returns the Baileys singleton when CHANNEL_DRIVER=baileys explicitly', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'baileys';
    const idx = require('../../bot/shared/services/messaging');
    const baileys = require('../../bot/shared/services/messaging/baileys-channel.service');
    expect(idx).toBe(baileys);
  });

  it('falls back to Baileys for an unknown CHANNEL_DRIVER value', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'telegram';
    const idx = require('../../bot/shared/services/messaging');
    const baileys = require('../../bot/shared/services/messaging/baileys-channel.service');
    expect(idx).toBe(baileys);
  });

  it('with no CHANNEL_DRIVER set, infers Meta when a Meta var is already present (backward compat)', () => {
    jest.resetModules();
    mockCommon();
    process.env.WHATSAPP_TOKEN = 'real-looking-token';
    const idx = require('../../bot/shared/services/messaging');
    const meta = require('../../bot/shared/services/messaging/meta-channel.service');
    expect(idx).toBe(meta);
  });

  it('the WhatsAppService facade resolves to the same driver as messaging/index.js', () => {
    jest.resetModules();
    mockCommon();
    process.env.CHANNEL_DRIVER = 'baileys';
    const facade = require('../../bot/shared/services/whatsapp.service');
    const baileys = require('../../bot/shared/services/messaging/baileys-channel.service');
    expect(facade).toBe(baileys);
  });
});
