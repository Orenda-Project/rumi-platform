/**
 * French speech-to-text (STT) enablement — regression contract.
 *
 * French voice notes are transcribed by Soniox (fr ∉ MMS_LANGUAGES, so routing
 * sends it to Soniox automatically). Two things must hold:
 *   1. `fr` is in the Soniox multi-language auto-detect hints, so a French voice
 *      note with no explicit language set is offered French as a candidate.
 *   2. When Soniox identifies audio as `fr`, the pipeline trusts it directly
 *      (no GPT confirmation round-trip) — French uses a distinct enough phonology
 *      that Soniox's ID is reliable, same policy as es/ar.
 */

// audio.service pulls ffmpeg/ffprobe installers that live in bot/node_modules
// (absent in the root CI job). Virtual-mock them so the pure hint config loads.
// axios + form-data are already mapped to stubs in jest.config; openai is only
// instantiated inside a method, so a bare require is safe here.
jest.mock('fluent-ffmpeg', () => {
  const ff = () => ({ toFormat: () => ({}) });
  ff.setFfmpegPath = () => {};
  ff.setFfprobePath = () => {};
  return ff;
}, { virtual: true });
jest.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/usr/bin/ffmpeg' }), { virtual: true });
jest.mock('@ffprobe-installer/ffprobe', () => ({ path: '/usr/bin/ffprobe' }), { virtual: true });

describe('French STT enablement', () => {
  describe('Soniox auto-detect hints', () => {
    const AudioService = require('../../bot/shared/services/audio.service');

    it('includes fr in the multi-language auto-detect hint list', () => {
      expect(AudioService.SONIOX_AUTODETECT_HINTS).toContain('fr');
    });

    it('does not regress the existing conversation languages', () => {
      ['en', 'ur', 'es', 'ar', 'hi', 'bn', 'mr', 'te', 'kn'].forEach((code) =>
        expect(AudioService.SONIOX_AUTODETECT_HINTS).toContain(code));
    });
  });

  // Soniox v5 tags language per-token (top-level `language` is null). The rule-
  // based text fallback can't read Latin-script French (it returns en, or es on
  // an accented char), which would make the bot reply to a French voice note in
  // English. So the dominant per-token language must win before the text fallback.
  describe('language identification from Soniox tokens (Latin-script fix)', () => {
    const AudioService = require('../../bot/shared/services/audio.service');

    it('derives fr from the dominant token language', () => {
      const tokens = Array.from({ length: 20 }, () => ({ text: 'x', language: 'fr' }))
        .concat([{ text: 'y', language: 'en' }]);
      expect(AudioService._languageFromTokens(tokens)).toBe('fr');
    });

    it('region-strips token language codes (fr-FR → fr)', () => {
      expect(AudioService._languageFromTokens([{ language: 'fr-FR' }, { language: 'fr-FR' }])).toBe('fr');
    });

    it('returns null when tokens carry no language (defer to text fallback)', () => {
      expect(AudioService._languageFromTokens([{ text: 'x' }, { text: 'y' }])).toBeNull();
      expect(AudioService._languageFromTokens([])).toBeNull();
      expect(AudioService._languageFromTokens(undefined)).toBeNull();
    });
  });

  describe('Soniox language trust (no GPT confirmation for fr)', () => {
    const D = require('../../bot/shared/services/language-detector.service');

    it('trusts a Soniox fr identification directly', async () => {
      await expect(
        D.getConfirmedLanguage("bonjour, je voudrais un plan de leçon", 'fr')
      ).resolves.toBe('fr');
    });

    it('region-strips a locale code before trusting (fr-FR → fr)', async () => {
      await expect(
        D.getConfirmedLanguage("merci beaucoup", 'fr-FR')
      ).resolves.toBe('fr');
    });
  });
});
