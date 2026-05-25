/**
 * Pic-LP wait-message — multilingual copy + the system/content language split
 * that drives copy (text) vs timing (backend selection) independently.
 */

let WaitMessage;

function load() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  // Mock the backend picker so timing is deterministic: 'en'/'sw' fast (90s),
  // everything else slow (240s) — matches the real pickBackend contract.
  jest.doMock('../../bot/shared/services/pic-to-lp/kieai-client.service', () => ({
    pickBackend: (lang) => (['en', 'sw'].includes(lang)
      ? { expectedSec: 90, upperSec: 180 }
      : { expectedSec: 240, upperSec: 420 }),
  }));
  WaitMessage = require('../../bot/shared/services/pic-to-lp/pic-lp-wait-message.service');
}

beforeEach(load);
afterEach(() => jest.resetModules());

describe('buildWaitMessage', () => {
  it('English fast path mentions seconds', () => {
    const msg = WaitMessage.buildWaitMessage({ systemLanguage: 'en', contentLanguage: 'en' });
    expect(msg).toMatch(/seconds/);
  });

  it('English copy with slow (Urdu-routed) content language switches to minutes', () => {
    const msg = WaitMessage.buildWaitMessage({ systemLanguage: 'en', contentLanguage: 'ur' });
    expect(msg).toMatch(/minutes/);
  });

  it('Urdu copy is rendered for an Urdu system language', () => {
    const msg = WaitMessage.buildWaitMessage({ systemLanguage: 'ur', contentLanguage: 'ur' });
    expect(msg).toContain('Rumi');
    expect(/[؀-ۿ]/.test(msg)).toBe(true);
  });

  it('falls back to English for an unknown system language', () => {
    const msg = WaitMessage.buildWaitMessage({ systemLanguage: 'zz', contentLanguage: 'en' });
    expect(msg).toMatch(/Generating your lesson plan/);
  });

  it('legacy single-language arg still works (used for both copy + timing)', () => {
    const msg = WaitMessage.buildWaitMessage({ language: 'sw' });
    expect(msg).toContain('Rumi');
  });

  it('uses live DB stats when sample_size >= 10', () => {
    const msg = WaitMessage.buildWaitMessage({
      systemLanguage: 'en', contentLanguage: 'en',
      dbStats: { p50_ms: 150000, p90_ms: 200000, sample_size: 25 },
    });
    // 150s p50 → crosses the 120s threshold → minutes phrasing.
    expect(msg).toMatch(/minutes/);
  });
});
