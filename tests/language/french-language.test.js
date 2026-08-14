/**
 * French-language enablement — regression contract.
 *
 * Locks in that French (fr) is wired across the config surfaces that make text
 * chat, STT trust, TTS, lesson plans and the language picker work. French is a
 * conversation-only, LTR, Latin-script language exposed globally (deployments
 * opt in via SETTINGS_LANGUAGES / region_features.supported_languages — there is
 * no hardcoded francophone country). Reading-assessment norms are intentionally
 * NOT covered here (en/ur only).
 *
 * Because French shares the Latin script with English/Spanish, it is deliberately
 * NOT given a Unicode script-detection rule; detection relies on Soniox's trusted
 * `fr` code plus the explicit override commands asserted below.
 */

// language-cache pulls the supabase + redis chain (unavailable in the root CI
// job that runs before `bot/ npm ci`). utils/language-detector requires it at
// import only — detectLanguageOverride never touches it — so a bare mock keeps
// the override-command assertions root-CI-safe.
jest.mock('../../bot/shared/utils/language-cache', () => ({
  VALID_LANGUAGES: ['en', 'fr'],
  DEFAULT_LANGUAGE: 'en',
}));

describe('French-language enablement', () => {
  describe('canonical supported-languages', () => {
    const SL = require('../../bot/shared/config/supported-languages');

    it('includes fr in SUPPORTED_LANGUAGES', () => {
      expect(SL.SUPPORTED_LANGUAGES).toContain('fr');
      expect(SL.isSupported('fr')).toBe(true);
    });

    it('produces a native display label and dropdown row', () => {
      expect(SL.getLabel('fr')).toMatch(/Français/);
      expect(SL.getEnglishName('fr')).toBe('French');
      const rows = SL.toDropdown(['fr']);
      expect(rows).toEqual([{ id: 'fr', title: expect.stringMatching(/Français/) }]);
    });

    it('treats French (Latin script) as LTR (not RTL)', () => {
      expect(SL.isRTL('fr')).toBe(false);
    });
  });

  describe('TTS routing', () => {
    const { VOICE_MODELS } = require('../../bot/shared/utils/constants');
    const { getTtsConfig } = require('../../bot/shared/config/tts-voices');

    it('has a VOICE_MODELS entry for fr', () => {
      expect(VOICE_MODELS.fr).toBeDefined();
      expect(VOICE_MODELS.fr.provider).toBeTruthy();
      expect(VOICE_MODELS.fr.voiceId).toBeTruthy();
    });

    it('has a tts-voices config for fr', () => {
      expect(getTtsConfig('fr')).not.toBeNull();
    });
  });

  describe('LLM persona + LP output language', () => {
    const prompts = require('../../bot/shared/config/language-prompts');
    const gamma = require('../../bot/shared/config/gamma-languages.config');

    it('has an enhanced persona for fr', () => {
      expect(prompts.hasEnhancedPrompt('fr')).toBe(true);
      const built = prompts.buildLanguagePrompt('fr', 'Marie');
      expect(typeof built).toBe('string');
      expect(built.length).toBeGreaterThan(50);
    });

    it('has a Gamma LP language config for fr', () => {
      const cfg = gamma.getLanguageConfig('fr');
      expect(cfg.code).toBe('fr');
      expect(cfg.textDirection).toBe('ltr');
      expect(cfg.promptSuffix).toBeTruthy();
    });
  });

  // French is francophone-broad (France, Canada, Belgium, Switzerland, West/
  // Central Africa), so no single country/currency is hardcoded — LP output
  // uses the region-neutral fallback. This locks that deliberate choice.
  describe('cultural localization (region-neutral)', () => {
    const L = require('../../bot/shared/services/pedagogy/lp-localization.service');
    it('uses the region-neutral currency + context for fr', () => {
      expect(L.currencyFor('fr')).toBe('the local currency');
      expect(L.classroomContextFor('fr')).toBe('local');
    });
  });

  describe('explicit language override (no Latin script rule)', () => {
    const { detectLanguageOverride } = require('../../bot/shared/utils/language-detector');

    it.each([
      'switch to french',
      'parle en français',
      'en français s\'il te plaît',
    ])('detects fr from "%s"', (text) => {
      expect(detectLanguageOverride(text)).toBe('fr');
    });

    it('does not falsely flag an ordinary English message as fr', () => {
      expect(detectLanguageOverride('please make me a lesson plan')).not.toBe('fr');
    });
  });
});
