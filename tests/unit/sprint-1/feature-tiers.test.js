/**
 * Sprint 1 TDD: Feature Tier System Tests (bd-229)
 *
 * RED phase: These tests define the API contract for config/feature-tiers.js
 * Three tiers: minimal, recommended, full
 * Each tier enables a specific set of features.
 */

const path = require('path');

const tierPath = path.resolve(__dirname, '../../../bot/shared/config/feature-tiers.js');

describe('Feature Tier System', () => {
  let tiers;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getTierConfig()', () => {
    beforeEach(() => {
      tiers = require(tierPath);
    });

    test('minimal tier enables only chat (ama) and registration', () => {
      const config = tiers.getTierConfig('minimal');
      expect(config.features.ama).toBe(true);
      expect(config.features.registration).toBe(true);
      expect(config.features.coaching).toBe(false);
      expect(config.features.readingAssessment).toBe(false);
      expect(config.features.lessonPlans).toBe(false);
      expect(config.features.videoGeneration).toBe(false);
      expect(config.features.voiceMessages).toBe(false);
    });

    test('recommended tier enables chat, registration, coaching, and reading assessment', () => {
      const config = tiers.getTierConfig('recommended');
      expect(config.features.ama).toBe(true);
      expect(config.features.registration).toBe(true);
      expect(config.features.coaching).toBe(true);
      expect(config.features.readingAssessment).toBe(true);
      expect(config.features.lessonPlans).toBe(false);
      expect(config.features.videoGeneration).toBe(false);
    });

    test('full tier enables all features', () => {
      const config = tiers.getTierConfig('full');
      expect(config.features.ama).toBe(true);
      expect(config.features.registration).toBe(true);
      expect(config.features.coaching).toBe(true);
      expect(config.features.readingAssessment).toBe(true);
      expect(config.features.lessonPlans).toBe(true);
      expect(config.features.videoGeneration).toBe(true);
      expect(config.features.voiceMessages).toBe(true);
    });

    test('each tier has requiredEnvVars listing needed API keys', () => {
      const minimal = tiers.getTierConfig('minimal');
      expect(Array.isArray(minimal.requiredEnvVars)).toBe(true);
      expect(minimal.requiredEnvVars).toContain('OPENROUTER_API_KEY');

      const recommended = tiers.getTierConfig('recommended');
      expect(recommended.requiredEnvVars).toContain('SONIOX_API_KEY');

      const full = tiers.getTierConfig('full');
      expect(full.requiredEnvVars).toContain('ELEVENLABS_API_KEY');
      expect(full.requiredEnvVars).toContain('GAMMA_API_KEY');
    });

    test('each tier has a name and description', () => {
      ['minimal', 'recommended', 'full'].forEach(tierName => {
        const config = tiers.getTierConfig(tierName);
        expect(config.name).toBeDefined();
        expect(config.description).toBeDefined();
        expect(typeof config.name).toBe('string');
        expect(typeof config.description).toBe('string');
      });
    });

    test('unknown tier throws an error', () => {
      expect(() => tiers.getTierConfig('premium')).toThrow();
    });
  });

  describe('isFeatureEnabled()', () => {
    beforeEach(() => {
      tiers = require(tierPath);
    });

    test('returns true for features enabled in the tier', () => {
      expect(tiers.isFeatureEnabled('ama', 'minimal')).toBe(true);
      expect(tiers.isFeatureEnabled('coaching', 'recommended')).toBe(true);
      expect(tiers.isFeatureEnabled('videoGeneration', 'full')).toBe(true);
    });

    test('returns false for features NOT enabled in the tier', () => {
      expect(tiers.isFeatureEnabled('coaching', 'minimal')).toBe(false);
      expect(tiers.isFeatureEnabled('lessonPlans', 'recommended')).toBe(false);
    });

    test('returns false for unknown features', () => {
      expect(tiers.isFeatureEnabled('teleportation', 'full')).toBe(false);
    });
  });

  describe('getCurrentTier()', () => {
    test('reads from RUMI_TIER env var', () => {
      process.env.RUMI_TIER = 'recommended';
      tiers = require(tierPath);
      expect(tiers.getCurrentTier()).toBe('recommended');
    });

    test('defaults to "minimal" when RUMI_TIER not set', () => {
      delete process.env.RUMI_TIER;
      tiers = require(tierPath);
      expect(tiers.getCurrentTier()).toBe('minimal');
    });

    test('normalizes tier name to lowercase', () => {
      process.env.RUMI_TIER = 'FULL';
      tiers = require(tierPath);
      expect(tiers.getCurrentTier()).toBe('full');
    });
  });

  describe('validateTierEnv()', () => {
    test('returns { valid: true } when all required env vars are set for tier', () => {
      process.env.RUMI_TIER = 'minimal';
      process.env.OPENROUTER_API_KEY = 'sk-or-test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'test-key';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.WHATSAPP_TOKEN = 'test-token';
      process.env.PHONE_NUMBER_ID = '12345';
      process.env.WEBHOOK_VERIFY_TOKEN = 'verify';
      process.env.WABA_ID = 'waba-123';
      tiers = require(tierPath);
      const result = tiers.validateTierEnv();
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test('returns { valid: false, missing: [...] } when required vars are missing', () => {
      process.env.RUMI_TIER = 'recommended';
      delete process.env.SONIOX_API_KEY;
      tiers = require(tierPath);
      const result = tiers.validateTierEnv();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('SONIOX_API_KEY');
    });
  });

  describe('TIER_NAMES constant', () => {
    test('exports array of valid tier names', () => {
      tiers = require(tierPath);
      expect(tiers.TIER_NAMES).toEqual(['minimal', 'recommended', 'full']);
    });
  });
});
