/**
 * Environment Variable Validator (presence-based — no tiers)
 *
 * Confirms the REQUIRED vars are set and reports which optional features are
 * switched on by the keys you've provided. Run: node bot/scripts/validate-env.js
 * For live connectivity checks (does each key actually authenticate?) use
 * `npm run doctor`.
 *
 * Exit codes: 0 = all required vars present · 1 = missing required vars
 */

const path = require('path');
const { missingRequired, availableFeatures, isSet } = require('../shared/config/feature-availability');

// Load .env from project root if available
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch (e) {
  // dotenv not installed — that's fine, env vars should be set externally
}

function validateEnv(env = process.env) {
  const provider = (env.LLM_PROVIDER || 'openrouter').toLowerCase();

  // Required vars (OPENROUTER_API_KEY is required by default; if the operator
  // chose LLM_PROVIDER=openai, OPENAI_API_KEY stands in for it).
  let missing = missingRequired(env);
  if (provider === 'openai') {
    missing = missing.filter((v) => v !== 'OPENROUTER_API_KEY');
    if (!isSet(env.OPENAI_API_KEY)) missing.push('OPENAI_API_KEY');
  }

  const warnings = [];
  if (!env.NODE_ENV) warnings.push('NODE_ENV not set (defaults to undefined)');
  if (!env.PORT) warnings.push('PORT not set (defaults to 3000)');

  return { provider, missing, warnings, features: availableFeatures(env), valid: missing.length === 0 };
}

module.exports = { validateEnv };

if (require.main === module) {
  const result = validateEnv();
  console.log(`\n  LLM Provider: ${result.provider}`);
  console.log(`  Features live (by key presence): ${result.features.length ? result.features.join(', ') : 'core only'}\n`);

  if (result.valid) {
    console.log('  All required environment variables are set.\n');
  } else {
    console.log('  Missing required environment variables:\n');
    result.missing.forEach((v) => console.log(`    - ${v}`));
    console.log('\n  Copy .env.template to .env and fill in the missing values.\n');
  }
  if (result.warnings.length > 0) {
    console.log('  Warnings:');
    result.warnings.forEach((w) => console.log(`    - ${w}`));
    console.log('');
  }
  process.exit(result.valid ? 0 : 1);
}
