/**
 * CHANNEL_DRIVER=none — a deployment with no WhatsApp at all, answering only on
 * its additive channels (a school system that moved to its own Matrix
 * messenger). Before this, a Matrix-only install had to pretend to be Meta with
 * dummy values (a failing Graph call at every boot) or Baileys (a WhatsApp Web
 * socket nobody wanted).
 */

function mockCommon() {
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
}

const VARS = ['CHANNEL_DRIVER', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID',
  'MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN'];
afterEach(() => { jest.resetModules(); VARS.forEach((k) => delete process.env[k]); });

describe('CHANNEL_DRIVER=none', () => {
  it('is a known driver that needs no WhatsApp credentials', () => {
    const registry = require('../../bot/shared/services/messaging/channel-registry');
    const fa = require('../../bot/shared/config/feature-availability');
    expect(registry.isKnownDriver('none')).toBe(true);
    expect(fa.resolveChannelDriver({ CHANNEL_DRIVER: 'none' })).toBe('none');
    // Even with leftover Meta values in the env, "none" means none.
    expect(fa.resolveChannelDriver({ CHANNEL_DRIVER: 'none', WHATSAPP_TOKEN: 'x' })).toBe('none');
    expect(fa.requiredVarsFor({ CHANNEL_DRIVER: 'none' }))
      .toEqual([...fa.databaseRequiredVars({}), ...fa.CORE_REQUIRED_VARS]);
  });

  it('routes Matrix identifiers to Matrix, and refuses a bare phone number loudly', async () => {
    mockCommon();
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
      remember: jest.fn(), get: jest.fn(), clear: jest.fn(), resolveSelection: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
      getClient: jest.fn().mockRejectedValue(new Error('not connected in this test')), isE2eeActive: jest.fn(() => false),
    }));
    process.env.CHANNEL_DRIVER = 'none';
    process.env.MATRIX_HOMESERVER_URL = 'https://matrix.example.org';
    process.env.MATRIX_ACCESS_TOKEN = 'test-token';
    require('../../bot/shared/services/messaging/matrix-outbound-relay').ownConnectionInThisProcess();
    const messaging = require('../../bot/shared/services/messaging');
    await expect(messaging.sendMessage('mtx:15550100001', 'hi')).resolves.toBe(false); // reached the Matrix driver
    await expect(messaging.sendMessage('15550100001', 'hi')).rejects.toThrow(/no WhatsApp channel.*CHANNEL_DRIVER=none/i);
  });

  it('does not call the WhatsApp Graph API at boot', async () => {
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const { validateFlowIdsOnBoot } = require('../../bot/shared/services/flow-id-validator.service');
    const fetchImpl = jest.fn();
    const result = await validateFlowIdsOnBoot({
      env: { CHANNEL_DRIVER: 'none', WHATSAPP_TOKEN: 'left-over', WABA_ID: '100000000000002' }, fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.reason).toBe('no_whatsapp_channel');
  });
});
