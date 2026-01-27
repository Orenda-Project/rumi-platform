/**
 * Feature Tier System
 *
 * Three tiers control which features are enabled:
 *   - minimal: AI Chat (AMA) + Registration only. 1 API key (OpenRouter).
 *   - recommended: + Coaching + Reading Assessment. 2 API keys (+ Soniox).
 *   - full: All features including voice, video, lesson plans. 5 API keys.
 *
 * Set RUMI_TIER in your .env to choose a tier.
 * Use isFeatureEnabled() throughout the codebase to gate features.
 */

const TIER_NAMES = ['minimal', 'recommended', 'full'];

// Base env vars required by ALL tiers
const BASE_REQUIRED_ENV = [
  'OPENROUTER_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REDIS_URL',
  'WHATSAPP_TOKEN',
  'PHONE_NUMBER_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'WABA_ID',
];

const TIER_CONFIGS = {
  minimal: {
    name: 'Minimal',
    description: 'AI Chat (AMA) + Registration. Fastest setup, 1 API key.',
    features: {
      ama: true,
      registration: true,
      coaching: false,
      readingAssessment: false,
      lessonPlans: false,
      videoGeneration: false,
      voiceMessages: false,
      presentations: false,
      attendance: false,
    },
    requiredEnvVars: [...BASE_REQUIRED_ENV],
  },

  recommended: {
    name: 'Recommended',
    description: 'AI Chat + Coaching + Reading Assessment. Best value, 2 API keys.',
    features: {
      ama: true,
      registration: true,
      coaching: true,
      readingAssessment: true,
      lessonPlans: false,
      videoGeneration: false,
      voiceMessages: false,
      presentations: false,
      attendance: false,
    },
    requiredEnvVars: [...BASE_REQUIRED_ENV, 'SONIOX_API_KEY'],
  },

  full: {
    name: 'Full',
    description: 'All features enabled. 5 API keys required.',
    features: {
      ama: true,
      registration: true,
      coaching: true,
      readingAssessment: true,
      lessonPlans: true,
      videoGeneration: true,
      voiceMessages: true,
      presentations: true,
      attendance: true,
    },
    requiredEnvVars: [
      ...BASE_REQUIRED_ENV,
      'SONIOX_API_KEY',
      'ELEVENLABS_API_KEY',
      'GAMMA_API_KEY',
    ],
  },
};

function getCurrentTier() {
  const tier = (process.env.RUMI_TIER || 'minimal').toLowerCase();
  return tier;
}

function getTierConfig(tierName) {
  const config = TIER_CONFIGS[tierName];
  if (!config) {
    throw new Error(
      `Unknown tier "${tierName}". Valid tiers: ${TIER_NAMES.join(', ')}`
    );
  }
  return config;
}

function isFeatureEnabled(featureName, tierName) {
  const tier = tierName || getCurrentTier();
  const config = TIER_CONFIGS[tier];
  if (!config) return false;
  return config.features[featureName] === true;
}

function validateTierEnv() {
  const tier = getCurrentTier();
  const config = getTierConfig(tier);
  const missing = config.requiredEnvVars.filter(
    varName => !process.env[varName]
  );
  return {
    valid: missing.length === 0,
    missing,
    tier,
  };
}

module.exports = {
  TIER_NAMES,
  getCurrentTier,
  getTierConfig,
  isFeatureEnabled,
  validateTierEnv,
};
