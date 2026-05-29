/**
 * WhatsAppService.sendImageFromUrl — bd-1881.
 *
 * The coaching commitment-card path called WhatsAppService.sendImageFromUrl(...)
 * but the method did not exist. The closest method, sendImage, treats any arg
 * containing '/' as a file path (fs.createReadStream) — so handing it an R2
 * URL would ENOENT. These tests lock the real method: download the (private)
 * R2 bytes to a temp file and hand that PATH to sendImage (which uploads it),
 * never the raw URL; clean up; and degrade to false (not throw) on failure.
 */

jest.mock('../../bot/shared/utils/constants', () => ({
  WHATSAPP_TOKEN: 'test-token',
  PHONE_NUMBER_ID: 'test-phone-id',
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  downloadFromR2: jest.fn(),
  extractKeyFromUrl: jest.fn(),
}));
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
  };
});

const fs = require('fs');
const { downloadFromR2, extractKeyFromUrl } = require('../../bot/shared/storage/r2');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');

const R2_URL = 'https://acct.r2.cloudflarestorage.com/bucket/coaching-card-abc.png?sig=xyz';

describe('WhatsAppService.sendImageFromUrl', () => {
  let sendImageSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    extractKeyFromUrl.mockReturnValue('bucket/coaching-card-abc.png');
    downloadFromR2.mockResolvedValue(Buffer.from('PNGDATA'));
    // Spy on the sibling method so we assert the handoff without hitting axios.
    sendImageSpy = jest.spyOn(WhatsAppService, 'sendImage').mockResolvedValue(true);
  });

  afterEach(() => sendImageSpy.mockRestore());

  it('is a real static method (not undefined)', () => {
    expect(typeof WhatsAppService.sendImageFromUrl).toBe('function');
  });

  it('downloads the R2 object and hands sendImage a FILE PATH, never the raw URL', async () => {
    const result = await WhatsAppService.sendImageFromUrl('923001234567', R2_URL, 'Your next step');

    expect(result).toBe(true);
    expect(extractKeyFromUrl).toHaveBeenCalledWith(R2_URL);
    expect(downloadFromR2).toHaveBeenCalledWith('bucket/coaching-card-abc.png');
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    expect(sendImageSpy).toHaveBeenCalledTimes(1);
    const [to, pathArg, caption] = sendImageSpy.mock.calls[0];
    expect(to).toBe('923001234567');
    expect(caption).toBe('Your next step');
    // The whole point: sendImage receives a temp file path, not the URL.
    expect(pathArg).not.toBe(R2_URL);
    expect(pathArg).not.toMatch(/^https?:/);
    expect(pathArg).toContain('/'); // a path → sendImage takes its upload-file branch
  });

  it('cleans up the temp file after sending', async () => {
    await WhatsAppService.sendImageFromUrl('923001234567', R2_URL, 'cap');
    const written = fs.writeFileSync.mock.calls[0][0];
    expect(fs.unlinkSync).toHaveBeenCalledWith(written);
  });

  it('returns false (does not throw) when the R2 download fails', async () => {
    downloadFromR2.mockRejectedValue(new Error('R2 403'));
    const result = await WhatsAppService.sendImageFromUrl('923001234567', R2_URL, 'cap');
    expect(result).toBe(false);
    expect(sendImageSpy).not.toHaveBeenCalled();
  });
});
