/**
 * Presence-based feature availability (replaces the removed tier system).
 * A feature is available iff its required env key(s) are set; CHANGEME
 * placeholders count as not-set; missing required vars block boot.
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

describe('feature-availability (presence-based gating)', () => {
  it('exposes the 8 required vars and a feature list', () => {
    expect(fa.REQUIRED_VARS).toHaveLength(8);
    expect(Array.isArray(fa.FEATURES)).toBe(true);
    expect(fa.FEATURES.length).toBeGreaterThan(0);
  });

  it('missingRequired is empty when all required vars are set', () => {
    expect(fa.missingRequired(FULL_ENV)).toEqual([]);
  });

  it('missingRequired flags a missing var and treats CHANGEME as not-set', () => {
    expect(fa.missingRequired({ ...FULL_ENV, WABA_ID: '' })).toContain('WABA_ID');
    expect(fa.missingRequired({ ...FULL_ENV, OPENROUTER_API_KEY: 'CHANGEME-x' })).toContain('OPENROUTER_API_KEY');
  });

  it('a feature is available only when ALL its keys are present', () => {
    const azure = fa.FEATURES.find((f) => f.name.includes('Azure'));
    expect(fa.isFeatureAvailable(azure, { ...FULL_ENV, AZURE_SPEECH_KEY: 'k' })).toBe(false); // region missing
    expect(fa.isFeatureAvailable(azure, { ...FULL_ENV, AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' })).toBe(true);
  });

  it('exam-checker keys on MISTRAL_API_KEY (verified against code), not AWS Textract', () => {
    const exam = fa.FEATURES.find((f) => f.name.includes('Exam'));
    expect(exam.keys).toEqual(['MISTRAL_API_KEY']);
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
