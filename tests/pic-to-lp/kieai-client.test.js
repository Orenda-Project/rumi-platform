/**
 * Kie.ai client routing — pickBackend (by language) + inputFieldFor (by model).
 * Pure functions; no network. (We mock the logger + constants so requiring the
 * module never reaches the network.)
 */

let KieaiClient;

beforeEach(() => {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/constants', () => ({
    KIE_API_KEY_PIC_LP: 'test-kie-key',
    KIE_MAX_ATTEMPTS: 60,
    KIE_POLL_INTERVAL: 8000,
  }));
  KieaiClient = require('../../bot/shared/services/pic-to-lp/kieai-client.service');
});
afterEach(() => jest.resetModules());

describe('kieai-client.pickBackend', () => {
  it("routes Latin-script languages ('en','sw') to gpt-image-2 at 1K", () => {
    for (const lang of ['en', 'sw']) {
      const b = KieaiClient.pickBackend(lang);
      expect(b.model).toBe('gpt-image-2-image-to-image');
      expect(b.resolution).toBe('1K');
    }
  });

  it("routes RTL non-Latin languages ('ur','sd','pa','ar') to 2K", () => {
    for (const lang of ['ur', 'sd', 'pa', 'ar']) {
      const b = KieaiClient.pickBackend(lang);
      expect(b.model).toBe('gpt-image-2-image-to-image');
      expect(b.resolution).toBe('2K');
    }
  });
});

describe('kieai-client.inputFieldFor', () => {
  it('uses input_urls for gpt-image-2 models', () => {
    expect(KieaiClient.inputFieldFor('gpt-image-2-image-to-image')).toBe('input_urls');
  });

  it('uses image_input for other (nano-banana) models', () => {
    expect(KieaiClient.inputFieldFor('nano-banana-pro')).toBe('image_input');
    expect(KieaiClient.inputFieldFor('google/nano-banana-edit')).toBe('image_input');
  });
});
