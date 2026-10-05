/**
 * Meta sendDocument with a path that does not exist must fail quietly (return
 * false), as it did before the upload digest: building the digest stream before
 * the size check left a stream nobody listens to, whose ENOENT then ended the
 * process with "Unhandled 'error' event".
 */

process.env.CHANNEL_DRIVER = 'meta';

jest.mock('../../bot/shared/utils/constants', () => ({
  ...jest.requireActual('../../bot/shared/utils/constants'),
  WHATSAPP_TOKEN: 'test-token',
  PHONE_NUMBER_ID: 'test-phone-id',
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  downloadFromR2: jest.fn(),
  extractKeyFromUrl: jest.fn((url) => url),
}));

const os = require('os');
const path = require('path');
const axios = require('axios');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Meta sendDocument with a missing file', () => {
  it('returns false and raises no unhandled stream error', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { id: 'x' } });
    const uncaught = [];
    const onUncaught = (err) => uncaught.push(err);
    const before = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', onUncaught);
    try {
      const missing = path.join(os.tmpdir(), `no-such-register-${process.pid}-${Date.now()}.xlsx`);
      const result = await WhatsAppService.sendDocument('15550100101', missing, 'register.xlsx', 'caption');
      await sleep(50); // the stream's async open would fail here
      expect(result).toBe(false);
      expect(post).not.toHaveBeenCalled();
      expect(uncaught.map((e) => e.message)).toEqual([]);
    } finally {
      process.removeListener('uncaughtException', onUncaught);
      for (const l of before) process.on('uncaughtException', l);
      post.mockRestore();
    }
  });
});
