/**
 * Presence-based feature availability (replaces the removed tier system).
 * A feature is available iff its required env key(s) are set; CHANGEME
 * placeholders count as not-set; missing required vars block boot.
 *
 * The messaging channel (meta | baileys) is gated the same presence-based
 * way, scoped by CHANNEL_DRIVER — see the "channel driver resolution" block
 * below.
 */

const fa = require('../../../bot/shared/config/feature-availability');

const FULL_ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  OPENROUTER_API_KEY: 'k',
  REDIS_URL: 'redis://localhost:6379',
  WHATSAPP_TOKEN: 'k',
  PHONE_NUMBER_ID: 'k',
  WEBHOOK_VERIFY_TOKEN: 'k',
  WABA_ID: 'k',
};

const CORE_ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  OPENROUTER_API_KEY: 'k',
  REDIS_URL: 'redis://localhost:6379',
};

describe('feature-availability (presence-based gating)', () => {
  it('exposes the 4 core required vars (channel vars are gated separately) and a feature list', () => {
    expect(fa.REQUIRED_VARS).toHaveLength(4);
    expect(Array.isArray(fa.FEATURES)).toBe(true);
    expect(fa.FEATURES.length).toBeGreaterThan(0);
  });

  it('missingRequired is empty when all required vars are set (Meta vars present → infers meta)', () => {
    expect(fa.missingRequired(FULL_ENV)).toEqual([]);
  });

  it('missingRequired flags a missing var and treats CHANGEME as not-set', () => {
    expect(fa.missingRequired({ ...FULL_ENV, WABA_ID: '' })).toContain('WABA_ID');
    expect(fa.missingRequired({ ...FULL_ENV, OPENROUTER_API_KEY: 'CHANGEME-x' })).toContain('OPENROUTER_API_KEY');
  });

  describe('channel driver resolution', () => {
    it('CHANNEL_DRIVER=meta requires the 4 WhatsApp vars', () => {
      const env = { ...CORE_ENV, CHANNEL_DRIVER: 'meta' };
      expect(fa.resolveChannelDriver(env)).toBe('meta');
      expect(fa.missingRequired(env)).toEqual(
        expect.arrayContaining(['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID'])
      );
    });

    it('CHANNEL_DRIVER=baileys requires none of the WhatsApp vars', () => {
      const env = { ...CORE_ENV, CHANNEL_DRIVER: 'baileys' };
      expect(fa.resolveChannelDriver(env)).toBe('baileys');
      expect(fa.missingRequired(env)).toEqual([]);
    });

    it('an unknown CHANNEL_DRIVER value falls back to the sandbox default (baileys)', () => {
      const env = { ...CORE_ENV, CHANNEL_DRIVER: 'telegram' };
      expect(fa.resolveChannelDriver(env)).toBe('baileys');
      expect(fa.missingRequired(env)).toEqual([]);
    });

    it('with no CHANNEL_DRIVER set, infers meta when ANY Meta var is already present (backward compat)', () => {
      // A pre-existing or partially-configured Meta deployment must keep
      // being told what's missing, not get silently reclassified as sandbox.
      const env = { ...CORE_ENV, WHATSAPP_TOKEN: 'k' };
      expect(fa.resolveChannelDriver(env)).toBe('meta');
      expect(fa.missingRequired(env)).toEqual(
        expect.arrayContaining(['PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID'])
      );
    });

    it('with no CHANNEL_DRIVER set and no Meta vars present, defaults to sandbox (baileys)', () => {
      expect(fa.resolveChannelDriver(CORE_ENV)).toBe('baileys');
      expect(fa.missingRequired(CORE_ENV)).toEqual([]);
    });

    it('CHANNEL_REQUIRED_VARS maps meta to the 4 WhatsApp vars and baileys to none', () => {
      expect(fa.CHANNEL_REQUIRED_VARS.meta).toEqual(
        ['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID']
      );
      expect(fa.CHANNEL_REQUIRED_VARS.baileys).toEqual([]);
    });

    it('requiredVarsFor combines the core vars with whichever channel is resolved', () => {
      expect(fa.requiredVarsFor({ ...CORE_ENV, CHANNEL_DRIVER: 'meta' })).toHaveLength(8);
      expect(fa.requiredVarsFor({ ...CORE_ENV, CHANNEL_DRIVER: 'baileys' })).toHaveLength(4);
    });
  });

  it('a feature is available only when ALL its keys are present', () => {
    const azure = fa.FEATURES.find((f) => f.name.includes('Azure'));
    expect(fa.isFeatureAvailable(azure, { ...FULL_ENV, AZURE_SPEECH_KEY: 'k' })).toBe(false); // region missing
    expect(fa.isFeatureAvailable(azure, { ...FULL_ENV, AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' })).toBe(true);
  });

  it('exam-checker gate is the disjunction of Mistral OR Chandra (matches OCR code)', () => {
    // The OCR service tries Mistral first (MISTRAL_API_KEY), then falls
    // back to Chandra (CHANDRA_API_KEY). The gate must reflect that: the
    // feature is available iff EITHER key is configured.
    const exam = fa.FEATURES.find((f) => f.name.includes('Exam'));
    expect(exam.keysAny).toEqual(['MISTRAL_API_KEY', 'CHANDRA_API_KEY']);
    expect(exam.keys).toBeUndefined();
  });

  it('isFeatureAvailable honours `keysAny` (any-of) semantics', () => {
    const exam = fa.FEATURES.find((f) => f.name.includes('Exam'));
    // Neither key set — feature OFF
    expect(fa.isFeatureAvailable(exam, FULL_ENV)).toBe(false);
    // Mistral only — feature ON
    expect(fa.isFeatureAvailable(exam, { ...FULL_ENV, MISTRAL_API_KEY: 'k' })).toBe(true);
    // Chandra only — feature ON
    expect(fa.isFeatureAvailable(exam, { ...FULL_ENV, CHANDRA_API_KEY: 'k' })).toBe(true);
    // Both set — feature ON
    expect(fa.isFeatureAvailable(exam, { ...FULL_ENV, MISTRAL_API_KEY: 'k', CHANDRA_API_KEY: 'k' })).toBe(true);
  });

  it('availableFeatures reflects exactly the keys provided', () => {
    expect(fa.availableFeatures(FULL_ENV)).toEqual([]); // no optional keys yet
    const withGamma = fa.availableFeatures({ ...FULL_ENV, GAMMA_API_KEY: 'k' });
    expect(withGamma).toContain('Lesson-plan generation (Gamma)');
  });

  it('there is NO tier system left', () => {
    expect(fa.REQUIRED_VARS).not.toContain('RUMI_TIER');
    expect(fs_existsTierModule()).toBe(false);
  });
});

const fs = require('fs');
const path = require('path');
function fs_existsTierModule() {
  return fs.existsSync(path.resolve(__dirname, '../../../bot/shared/config/feature-tiers.js'));
}
