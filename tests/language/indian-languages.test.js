/**
 * India-market language enablement — regression contract.
 *
 * Locks in that the six Indian languages (Hindi, Bengali, Marathi, Telugu,
 * Indian Tamil, Kannada) are wired across the config surfaces that make text
 * chat, STT, TTS, lesson plans and the language picker work. Reading-assessment
 * norms are intentionally NOT covered here (deferred — conversation-core launch).
 */

const INDIA_LANGS = ['hi', 'bn', 'mr', 'te', 'ta-IN', 'kn'];

describe('India-market language enablement', () => {
  describe('canonical supported-languages', () => {
    const SL = require('../../bot/shared/config/supported-languages');

    it.each(INDIA_LANGS)('includes %s in SUPPORTED_LANGUAGES', (code) => {
      expect(SL.SUPPORTED_LANGUAGES).toContain(code);
      expect(SL.isSupported(code)).toBe(true);
    });

    it('keeps ta-IN distinct from the pre-existing ta-LK', () => {
      expect(SL.SUPPORTED_LANGUAGES).toContain('ta-IN');
      expect(SL.SUPPORTED_LANGUAGES).toContain('ta-LK');
    });

    it('produces native display labels and dropdown rows', () => {
      expect(SL.getLabel('hi')).toMatch(/हिन्दी/);
      expect(SL.getEnglishName('kn')).toBe('Kannada');
      const rows = SL.toDropdown(INDIA_LANGS);
      expect(rows).toHaveLength(INDIA_LANGS.length);
      expect(rows.every((r) => r.id && r.title)).toBe(true);
    });

    it('treats Indian (Brahmic) scripts as LTR (not RTL)', () => {
      INDIA_LANGS.forEach((code) => expect(SL.isRTL(code)).toBe(false));
    });
  });

  // Note: the language-cache gate (VALID_LANGUAGES) is a direct re-export of
  // SUPPORTED_LANGUAGES (asserted above). It is intentionally NOT required here —
  // language-cache pulls the supabase + redis chain, which isn't available in the
  // root CI job (root `npm test` runs before `bot/ npm ci`).

  describe('TTS routing', () => {
    const { VOICE_MODELS } = require('../../bot/shared/utils/constants');
    const { getTtsConfig } = require('../../bot/shared/config/tts-voices');

    it.each(INDIA_LANGS)('has a VOICE_MODELS entry for %s', (code) => {
      expect(VOICE_MODELS[code]).toBeDefined();
      expect(VOICE_MODELS[code].provider).toBeTruthy();
      expect(VOICE_MODELS[code].voiceId).toBeTruthy();
    });

    it.each(INDIA_LANGS)('has a tts-voices config for %s', (code) => {
      expect(getTtsConfig(code)).not.toBeNull();
    });
  });

  describe('LLM personas + LP output language', () => {
    const prompts = require('../../bot/shared/config/language-prompts');
    const gamma = require('../../bot/shared/config/gamma-languages.config');

    it.each(INDIA_LANGS)('has an enhanced persona for %s', (code) => {
      expect(prompts.hasEnhancedPrompt(code)).toBe(true);
      const built = prompts.buildLanguagePrompt(code, 'Asha');
      expect(typeof built).toBe('string');
      expect(built.length).toBeGreaterThan(50);
    });

    it.each(INDIA_LANGS)('has a Gamma LP language config for %s', (code) => {
      const cfg = gamma.getLanguageConfig(code);
      expect(cfg.code).toBe(code);
      expect(cfg.textDirection).toBe('ltr');
      expect(cfg.promptSuffix).toBeTruthy();
    });
  });

  // Note: system-messages.js is production-orphaned (allowlisted in the
  // orphan-module audit), so it is intentionally not imported here — importing
  // it from a test would falsely mark it reachable. Its India translations still
  // ship (parity) for when the module is wired up.

  describe('cultural localization (INR + Indian cast)', () => {
    const L = require('../../bot/shared/services/pedagogy/lp-localization.service');
    it.each(INDIA_LANGS)('uses Indian Rupee for %s', (code) => {
      expect(L.currencyFor(code)).toMatch(/₹|Indian Rupee/);
      expect(L.classroomContextFor(code)).toMatch(/Indian/);
    });
  });

  describe('region resolution (per-user, country-aware)', () => {
    const { getUserLanguageRegion } = require('../../bot/shared/utils/region');
    it('maps an Indian teacher to the india region', () => {
      expect(getUserLanguageRegion({ country: 'IN', region: 'in_maharashtra' })).toBe('india');
    });
    it('leaves non-India users on their own region', () => {
      expect(getUserLanguageRegion({ country: 'PK', region: 'punjab' })).toBe('punjab');
    });
  });

  describe('text language detection (Brahmic scripts)', () => {
    const D = require('../../bot/shared/services/language-detector.service');
    const cases = {
      hi: 'नमस्ते, मुझे एक lesson plan चाहिए',
      bn: 'নমস্কার, আমার একটি lesson plan দরকার',
      te: 'నమస్కారం, నాకు ఒక పాఠ్య ప్రణాళిక కావాలి',
      'ta-IN': 'வணக்கம், எனக்கு ஒரு பாடத் திட்டம் வேண்டும்',
      kn: 'ನಮಸ್ಕಾರ, ನನಗೆ ಒಂದು ಪಾಠ ಯೋಜನೆ ಬೇಕು',
    };
    it.each(Object.entries(cases))('detects %s from its script', (expected, text) => {
      expect(D.detectLanguage(text)).toBe(expected);
    });
  });
});
