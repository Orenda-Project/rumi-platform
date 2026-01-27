/**
 * Environment Variable Validator
 *
 * Validates that all required environment variables are set for the current tier.
 * Run: node bot/scripts/validate-env.js
 *
 * Exit codes:
 *   0 = all required vars present
 *   1 = missing required vars
 */

const path = require('path');

// Load .env from project root if available
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {
  // dotenv not installed — that's fine, env vars should be set externally
}

const TIERS = {
  minimal: {
    name: 'Minimal',
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'REDIS_URL',
      'WHATSAPP_TOKEN',
      'PHONE_NUMBER_ID',
      'WEBHOOK_VERIFY_TOKEN',
      'WABA_ID',
    ],
    llm: ['OPENROUTER_API_KEY'], // OR OPENAI_API_KEY if LLM_PROVIDER=openai
  },
  recommended: {
    name: 'Recommended',
    required: ['SONIOX_API_KEY'],
  },
  full: {
    name: 'Full',
    required: ['ELEVENLABS_API_KEY', 'GAMMA_API_KEY'],
  },
};

function validateEnv() {
  const tier = (process.env.RUMI_TIER || 'minimal').toLowerCase();
  const provider = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
  const missing = [];
  const warnings = [];

  // Check base required vars
  for (const v of TIERS.minimal.required) {
    if (!process.env[v]) missing.push(v);
  }

  // Check LLM provider key
  if (provider === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');
  } else if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  }

  // Check tier-specific vars
  if (tier === 'recommended' || tier === 'full') {
    for (const v of TIERS.recommended.required) {
      if (!process.env[v]) missing.push(v);
    }
  }
  if (tier === 'full') {
    for (const v of TIERS.full.required) {
      if (!process.env[v]) missing.push(v);
    }
  }

  // Warnings (optional but useful)
  if (!process.env.NODE_ENV) warnings.push('NODE_ENV not set (defaults to undefined)');
  if (!process.env.PORT) warnings.push('PORT not set (defaults to 3000)');

  return { tier, provider, missing, warnings, valid: missing.length === 0 };
}

// Export for programmatic use
module.exports = { validateEnv };

// Run if called directly
if (require.main === module) {
  const result = validateEnv();

  console.log(`\n  Tier: ${result.tier}`);
  console.log(`  LLM Provider: ${result.provider}\n`);

  if (result.valid) {
    console.log('  All required environment variables are set.\n');
    if (result.warnings.length > 0) {
      console.log('  Warnings:');
      result.warnings.forEach(w => console.log(`    - ${w}`));
      console.log('');
    }
    process.exit(0);
  } else {
    console.log('  Missing required environment variables:\n');
    result.missing.forEach(v => console.log(`    - ${v}`));
    console.log('\n  Copy .env.template to .env and fill in the missing values.\n');
    if (result.warnings.length > 0) {
      console.log('  Warnings:');
      result.warnings.forEach(w => console.log(`    - ${w}`));
      console.log('');
    }
    process.exit(1);
  }
}
