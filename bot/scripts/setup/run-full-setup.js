#!/usr/bin/env node
/**
 * Rumi Full Setup Orchestrator
 *
 * Runs all WhatsApp Flow & Template registration steps in order:
 *   1. Setup encryption (RSA keypair + Meta registration)
 *   2. Register all 3 flows (Reading Assessment, Attendance Setup, Attendance Marking)
 *   3. Register all 2 templates (Video Style Selection, Feature Menu Carousel)
 *   4. Validate setup (verify flows are PUBLISHED, templates submitted)
 *
 * Usage:
 *   node bot/scripts/setup/run-full-setup.js \
 *     --waba-id=YOUR_WABA_ID \
 *     --token=YOUR_TOKEN \
 *     --phone-number-id=YOUR_PHONE_NUMBER_ID \
 *     --endpoint-base=https://your-app.up.railway.app
 *
 * Options:
 *   --waba-id          WhatsApp Business Account ID (required)
 *   --token            Access token (required)
 *   --phone-number-id  Phone Number ID (required)
 *   --endpoint-base    Base URL for flow endpoints (required for attendance flows)
 *   --asset-base-url   Base URL for template assets (default: https://hellorumi.ai/assets)
 *   --key-output-dir   Directory to save encryption keys (default: bot/keys)
 *   --state-path       Path to .setup-state.json (default: project root)
 *   --skip-encryption  Skip encryption setup
 *   --skip-flows       Skip flow registration
 *   --skip-templates   Skip template registration
 *   --skip-validate    Skip validation
 *
 * @module run-full-setup
 */

const { setupEncryption } = require('./setup-encryption');
const { registerAllFlows } = require('./register-all-flows');
const { registerAllTemplates } = require('./register-all-templates');
const { validateSetup } = require('./validate-flows');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('=') || 'true';
      // Convert kebab-case to camelCase
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[camelKey] = value;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function runFullSetup(options) {
  const {
    wabaId,
    token: accessToken,
    phoneNumberId,
    endpointBase,
    assetBaseUrl,
    keyOutputDir,
    statePath,
    skipEncryption,
    skipFlows,
    skipTemplates,
    skipValidate,
  } = options;

  // Validate required options
  if (!wabaId || !accessToken || !phoneNumberId) {
    console.error('\n[setup] Missing required options.');
    console.error('  --waba-id          WhatsApp Business Account ID');
    console.error('  --token            Access token');
    console.error('  --phone-number-id  Phone Number ID');
    console.error('\nUsage:');
    console.error('  node bot/scripts/setup/run-full-setup.js \\');
    console.error('    --waba-id=YOUR_WABA_ID \\');
    console.error('    --token=YOUR_TOKEN \\');
    console.error('    --phone-number-id=YOUR_PHONE_NUMBER_ID \\');
    console.error('    --endpoint-base=https://your-app.up.railway.app\n');
    process.exit(1);
  }

  const commonOpts = { wabaId, accessToken, phoneNumberId, statePath };
  const results = {
    encryption: null,
    flows: null,
    templates: null,
    validation: null,
  };

  console.log('\n' + '='.repeat(60));
  console.log('  Rumi Full Setup');
  console.log('='.repeat(60));
  console.log(`\n  WABA ID:          ${wabaId}`);
  console.log(`  Phone Number ID:  ${phoneNumberId}`);
  console.log(`  Endpoint Base:    ${endpointBase || '(not provided — attendance flows will be skipped)'}`);
  console.log(`  Asset Base URL:   ${assetBaseUrl || 'https://hellorumi.ai/assets (default)'}`);
  console.log('');

  // ── Step 1: Encryption ──
  if (skipEncryption !== 'true') {
    console.log('\n' + '-'.repeat(60));
    console.log('  Step 1: Setup Encryption');
    console.log('-'.repeat(60) + '\n');

    try {
      results.encryption = await setupEncryption({
        ...commonOpts,
        keyOutputDir,
      });

      if (results.encryption.success) {
        if (results.encryption.registered) {
          console.log('\n  [OK] Encryption keys generated and registered with Meta.');
        } else if (results.encryption.error) {
          console.log('\n  [WARN] Keys saved locally, but Meta registration failed.');
          console.log(`  Error: ${results.encryption.error}`);
        } else {
          console.log('\n  [OK] Encryption already configured (skipped).');
        }
      } else {
        console.log('\n  [FAIL] Encryption setup failed.');
        console.log(`  Error: ${results.encryption.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('\n  [FAIL] Encryption setup threw:', err.message);
      results.encryption = { success: false, error: err.message };
    }
  } else {
    console.log('\n  [SKIP] Encryption (--skip-encryption)');
  }

  // ── Step 2: Flows ──
  if (skipFlows !== 'true') {
    console.log('\n' + '-'.repeat(60));
    console.log('  Step 2: Register WhatsApp Flows');
    console.log('-'.repeat(60) + '\n');

    try {
      results.flows = await registerAllFlows({
        ...commonOpts,
        endpointBase,
      });

      const f = results.flows;
      console.log(`\n  Registered: ${f.registered.length}`);
      console.log(`  Skipped:    ${f.skipped.length}`);
      console.log(`  Errors:     ${f.errors.length}`);

      if (f.registered.length > 0) {
        console.log('\n  Flow IDs to set as env vars:');
        for (const flow of f.registered) {
          console.log(`    ${flow.envVar}=${flow.flowId}`);
        }
      }

      if (f.skipped.length > 0) {
        console.log('\n  Skipped flows (already registered):');
        for (const flow of f.skipped) {
          console.log(`    ${flow.name} (${flow.flowId || flow.reason || 'exists'})`);
        }
      }

      if (f.errors.length > 0) {
        console.log('\n  Failed flows:');
        for (const err of f.errors) {
          console.log(`    ${err.name}: ${err.error}`);
        }
      }
    } catch (err) {
      console.error('\n  [FAIL] Flow registration threw:', err.message);
      results.flows = { registered: [], skipped: [], errors: [{ name: 'all', error: err.message }] };
    }
  } else {
    console.log('\n  [SKIP] Flows (--skip-flows)');
  }

  // ── Step 3: Templates ──
  if (skipTemplates !== 'true') {
    console.log('\n' + '-'.repeat(60));
    console.log('  Step 3: Register Message Templates');
    console.log('-'.repeat(60) + '\n');

    try {
      results.templates = await registerAllTemplates({
        ...commonOpts,
        assetBaseUrl,
      });

      const t = results.templates;
      console.log(`\n  Registered: ${t.registered.length}`);
      console.log(`  Skipped:    ${t.skipped.length}`);
      console.log(`  Errors:     ${t.errors.length}`);

      if (t.registered.length > 0) {
        console.log('\n  Templates submitted for review:');
        for (const tmpl of t.registered) {
          console.log(`    ${tmpl.name} (status: ${tmpl.status || 'PENDING'})`);
        }
      }
    } catch (err) {
      console.error('\n  [FAIL] Template registration threw:', err.message);
      results.templates = { registered: [], skipped: [], errors: [{ name: 'all', error: err.message }] };
    }
  } else {
    console.log('\n  [SKIP] Templates (--skip-templates)');
  }

  // ── Step 4: Validate ──
  if (skipValidate !== 'true') {
    console.log('\n' + '-'.repeat(60));
    console.log('  Step 4: Validate Setup');
    console.log('-'.repeat(60) + '\n');

    try {
      results.validation = await validateSetup(commonOpts);

      if (results.validation.valid) {
        console.log('  [OK] All validations passed.');
      } else {
        if (results.validation.issues.length > 0) {
          console.log('  Issues:');
          for (const issue of results.validation.issues) {
            console.log(`    - ${issue}`);
          }
        }
      }

      if (results.validation.warnings.length > 0) {
        console.log('\n  Warnings:');
        for (const warn of results.validation.warnings) {
          console.log(`    - ${warn}`);
        }
      }
    } catch (err) {
      console.error('\n  [FAIL] Validation threw:', err.message);
      results.validation = { valid: false, issues: [err.message], warnings: [] };
    }
  } else {
    console.log('\n  [SKIP] Validation (--skip-validate)');
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(60));
  console.log('  Setup Summary');
  console.log('='.repeat(60));

  const envVars = [];

  if (results.flows && results.flows.registered) {
    for (const flow of results.flows.registered) {
      if (flow.envVar && flow.flowId) {
        envVars.push(`${flow.envVar}=${flow.flowId}`);
      }
    }
  }

  if (results.encryption && results.encryption.privateKeyPath) {
    const fs = require('fs');
    try {
      const privKey = fs.readFileSync(results.encryption.privateKeyPath, 'utf-8');
      envVars.push(`FLOW_PRIVATE_KEY=${Buffer.from(privKey).toString('base64')}`);
    } catch {
      // Key file might not exist if encryption was skipped
    }
  }

  if (envVars.length > 0) {
    console.log('\n  Set these environment variables in Railway:\n');
    for (const v of envVars) {
      console.log(`    ${v}`);
    }
    console.log('\n  Railway CLI:');
    for (const v of envVars) {
      const [key, ...val] = v.split('=');
      console.log(`    railway variables set ${key}="${val.join('=')}"`);
    }
  }

  const hasTemplatesPending = results.templates &&
    results.templates.registered &&
    results.templates.registered.some(t => !t.status || t.status === 'PENDING');

  if (hasTemplatesPending) {
    console.log('\n  NOTE: Templates are pending Meta review (usually 1-24 hours).');
    console.log('  The bot will use fallback interactive lists until templates are approved.');
  }

  console.log('\n' + '='.repeat(60) + '\n');

  return results;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = parseArgs(process.argv);
  runFullSetup(args)
    .then((results) => {
      const hasErrors =
        (results.flows && results.flows.errors && results.flows.errors.length > 0) ||
        (results.templates && results.templates.errors && results.templates.errors.length > 0) ||
        (results.encryption && !results.encryption.success);

      if (hasErrors) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('\n[setup] Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { runFullSetup };
