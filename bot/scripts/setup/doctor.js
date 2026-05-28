/**
 * doctor — preflight diagnostics for a Rumi deployment.
 *
 *   npm run doctor
 *
 * Two layers:
 *   1. Static analysis (no network): which of the REQUIRED vars are set, and —
 *      under the presence-based model — which optional features are switched on
 *      by the keys you've provided.
 *   2. Live probes (network): for each REQUIRED service that is configured, we
 *      actually authenticate against it. A probe only ever reports green when
 *      the service genuinely answered — "the key is set" is NOT "the key works"
 *      (defined != working). Missing-but-optional services are reported as
 *      "skipped", never as failures.
 *
 * Exit code: 0 if all REQUIRED vars are present AND every run probe passed;
 * 1 otherwise. Designed to be read by a human or an AI setup agent.
 *
 * The probe implementations are injectable so the behaviour is unit-testable
 * without hitting the network (see tests/setup/doctor.test.js).
 */

// ── The presence-based contract ─────────────────────────────────────────────
// Single source of truth: bot/shared/config/feature-availability.js
const fs = require('fs');
const path = require('path');
const { REQUIRED_VARS, FEATURES, isSet } = require('../../shared/config/feature-availability');
const { FLOW_CONFIGS } = require('./flow-configs');

// ── "Where do I get this?" hints ─────────────────────────────────────────────
// Maps an env var to a short source so a stuck operator (or setup agent) sees
// the next step inline. Full step-by-step: docs/onboarding/api-keys.md +
// docs/onboarding/whatsapp.md. Gating stays in feature-availability.js; this is
// human guidance only.
const KEY_SOURCES = {
  SUPABASE_URL: 'supabase.com → Settings → API',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase.com → Settings → API (service_role)',
  OPENROUTER_API_KEY: 'openrouter.ai/keys',
  REDIS_URL: 'Railway Redis plugin or upstash.com',
  WHATSAPP_TOKEN: 'see docs/onboarding/whatsapp.md',
  PHONE_NUMBER_ID: 'see docs/onboarding/whatsapp.md',
  WEBHOOK_VERIFY_TOKEN: 'a string you choose (see docs/onboarding/whatsapp.md)',
  WABA_ID: 'see docs/onboarding/whatsapp.md',
  SONIOX_API_KEY: 'console.soniox.com',
  ELEVENLABS_API_KEY: 'elevenlabs.io → API Keys',
  UPLIFT_API_KEY: 'platform.upliftai.org',
  GAMMA_API_KEY: 'gamma.app/settings/api-keys (paid plan)',
  AZURE_SPEECH_KEY: 'portal.azure.com → Speech resource',
  AZURE_SPEECH_REGION: 'portal.azure.com → Speech resource',
  KIE_API_KEY: 'kie.ai → API Key',
  MISTRAL_API_KEY: 'console.mistral.ai → API Keys',
  AXIOM_DATASET: 'axiom.co → Datasets',
  AXIOM_TOKEN: 'axiom.co → Settings → API tokens',
};

/** Short "get it here" hint for an env var, or '' if none documented. */
function keySource(varName) {
  return KEY_SOURCES[varName] || '';
}

// ── Flow registration state (offline — reads .setup-state.json) ──────────────
// What `npm run setup:flows` recorded. Informational only: not having flows
// registered does NOT make the bot un-ready (a minimal deploy may use none, and
// you can't register them until you have WhatsApp credentials). Run
// `npm run validate:flows`-style checks against Meta for the live PUBLISHED state.
function analyzeFlows(state) {
  const flows = (state && state.flows) || {};
  return FLOW_CONFIGS.map((c) => {
    const rec = flows[c.name];
    return {
      name: c.name,
      envVar: c.envVar,
      registered: !!rec,
      status: rec ? (rec.status || 'UNKNOWN') : 'not registered',
    };
  });
}

// ── Static analysis (pure, no network) ──────────────────────────────────────

/**
 * @param {object} env  Usually process.env.
 * @returns {{ requiredPresent, missingRequired, features }}
 */
function analyzeEnv(env) {
  const requiredPresent = REQUIRED_VARS.filter((k) => isSet(env[k]));
  const missingRequired = REQUIRED_VARS.filter((k) => !isSet(env[k]));

  const features = FEATURES.map((f) => {
    // Features may declare keys two ways:
    //   - `keys`     → ALL required (the default, conjunctive)
    //   - `keysAny`  → ANY one suffices (e.g. exam-checker OCR: Mistral OR Chandra)
    // A feature with no env keys (e.g. Chromium) is keyed off its probe, not env.
    if (Array.isArray(f.keysAny)) {
      const presentKeys = f.keysAny.filter((k) => isSet(env[k]));
      const missingKeys = presentKeys.length > 0 ? [] : [...f.keysAny];
      const available = presentKeys.length > 0;
      return {
        name: f.name,
        requiredKeys: f.keysAny,
        missingKeys,
        available,
        probe: f.probe || null,
        notes: f.notes || null,
        anyOf: true,
      };
    }
    const keys = f.keys || [];
    const missingKeys = keys.filter((k) => !isSet(env[k]));
    const available = keys.length > 0 ? missingKeys.length === 0 : null; // null = "ask the probe"
    return { name: f.name, requiredKeys: keys, missingKeys, available, probe: f.probe || null, notes: f.notes || null };
  });

  return { requiredPresent, missingRequired, features };
}

// ── Default live probes (network). Each returns { ok, detail }. ──────────────
// Implementations are intentionally dependency-light (global fetch) and never
// throw — they translate any failure into { ok:false }.

const defaultProbes = {
  async supabase(env) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    return { ok: res.status < 500, detail: `HTTP ${res.status}` };
  },
  async openrouter(env) {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  },
  async whatsapp(env) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${env.PHONE_NUMBER_ID}?access_token=${env.WHATSAPP_TOKEN}`,
    );
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  },
  async redis(env) {
    // Lazy require so the bot's redis lib is optional at doctor time.
    const IORedis = require('ioredis');
    const client = new IORedis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    client.on('error', () => {}); // swallow — we surface the failure via the thrown ping
    try {
      await client.connect();
      const pong = await client.ping();
      return { ok: pong === 'PONG', detail: pong };
    } finally {
      client.disconnect();
    }
  },
};

// Which probe backs each REQUIRED service, and the env vars it needs to run.
const REQUIRED_PROBES = [
  { name: 'Supabase', probe: 'supabase', needs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { name: 'OpenRouter (LLM)', probe: 'openrouter', needs: ['OPENROUTER_API_KEY'] },
  { name: 'WhatsApp Cloud API', probe: 'whatsapp', needs: ['PHONE_NUMBER_ID', 'WHATSAPP_TOKEN'] },
  { name: 'Redis', probe: 'redis', needs: ['REDIS_URL'] },
];

// ── Runner ───────────────────────────────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {object}   opts.env     env to read (default process.env)
 * @param {object}   opts.probes  map name->async(env)=>{ok,detail} (default real probes)
 * @returns {Promise<{ ok, missingRequired, probeResults, featureResults }>}
 */
async function runDoctor({
  env = process.env,
  probes = defaultProbes,
  setupState, // inject a parsed .setup-state.json (or null) in tests; otherwise read from disk
  statePath = path.resolve(process.cwd(), '.setup-state.json'),
} = {}) {
  const analysis = analyzeEnv(env);

  // Flow registration state (offline). undefined = read from disk; null/object = use as given.
  let state = setupState;
  if (state === undefined) {
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch { state = null; }
  }
  const flowResults = analyzeFlows(state);

  // Run REQUIRED probes only for services whose vars are present.
  const probeResults = [];
  for (const { name, probe, needs = [] } of REQUIRED_PROBES) {
    const impl = probes[probe];
    if (!impl) { probeResults.push({ name, status: 'skip', detail: 'no probe' }); continue; }
    if (needs.some((k) => !isSet(env[k]))) {
      probeResults.push({ name, status: 'skip', detail: 'not configured (see missing required vars)' });
      continue;
    }
    try {
      const { ok, detail } = await impl(env);
      probeResults.push({ name, status: ok ? 'pass' : 'fail', detail });
    } catch (err) {
      probeResults.push({ name, status: 'fail', detail: err.message });
    }
  }

  // Feature availability (presence + chromium probe).
  const featureResults = [];
  for (const f of analysis.features) {
    const keyMeta = { requiredKeys: f.requiredKeys, missingKeys: f.missingKeys, notes: f.notes };
    if (f.probe && probes[f.probe]) {
      try {
        const { ok, detail } = await probes[f.probe](env);
        featureResults.push({ name: f.name, status: ok ? 'on' : 'off', detail, ...keyMeta });
      } catch (err) {
        featureResults.push({ name: f.name, status: 'off', detail: err.message, ...keyMeta });
      }
    } else {
      featureResults.push({
        name: f.name,
        status: f.available ? 'on' : 'off',
        detail: f.available ? 'keys present' : `set: ${f.requiredKeys.join(', ')}`,
        ...keyMeta,
      });
    }
  }

  const probesPassed = probeResults.every((p) => p.status !== 'fail');
  const ok = analysis.missingRequired.length === 0 && probesPassed;

  return { ok, missingRequired: analysis.missingRequired, probeResults, featureResults, flowResults };
}

// ── Pretty printer ────────────────────────────────────────────────────────────

function formatReport(result) {
  const mark = (s) => ({ pass: '✅', fail: '❌', skip: '⏭️ ', on: '✅', off: '➖' }[s] || '•');
  const lines = [];
  lines.push('Rumi doctor — deployment preflight');
  lines.push('');
  if (result.missingRequired.length) {
    lines.push('❌ MISSING REQUIRED variables — the bot will REFUSE TO START until you set these:');
    for (const v of result.missingRequired) {
      const src = keySource(v);
      lines.push(`   - ${v}${src ? `  → get it: ${src}` : ''}`);
    }
    lines.push('');
  }
  lines.push('Required services (live checks):');
  for (const p of result.probeResults) lines.push(`  ${mark(p.status)} ${p.name} — ${p.detail}`);
  lines.push('');
  lines.push('Optional features (on when their keys are set):');
  for (const f of result.featureResults) {
    // For an off feature, show where to get the key(s) that would switch it on.
    let hint = '';
    if (f.status === 'off') {
      const srcs = (f.missingKeys && f.missingKeys.length ? f.missingKeys : f.requiredKeys || [])
        .map((k) => keySource(k)).filter(Boolean);
      if (srcs.length) hint = `  → get it: ${srcs[0]}`;
    }
    lines.push(`  ${mark(f.status)} ${f.name} — ${f.detail}${hint}`);
    if (f.notes) lines.push(`        note: ${f.notes}`);
  }
  if (result.flowResults && result.flowResults.length) {
    lines.push('');
    const anyRegistered = result.flowResults.some((f) => f.registered);
    lines.push('WhatsApp Flows (registered against your WABA):');
    if (!anyRegistered) {
      lines.push('  ➖ none registered yet — run `npm run setup:flows` (after WhatsApp is set up)');
    } else {
      for (const f of result.flowResults) {
        const ok = f.registered && /PUBLISHED|EXISTS/i.test(f.status);
        lines.push(`  ${ok ? '✅' : '➖'} ${f.name} — ${f.status}`);
      }
    }
  }
  lines.push('');
  lines.push(result.ok ? '✅ All required services are configured and reachable.' :
    '❌ Not ready — fix the items marked ❌ above, then re-run `npm run doctor`.');
  lines.push('');
  lines.push('📖 Step-by-step key setup: docs/onboarding/api-keys.md · WhatsApp: docs/onboarding/whatsapp.md');
  return lines.join('\n');
}

// ── CLI entry ──────────────────────────────────────────────────────────────────

async function main() {
  try { require('dotenv').config(); } catch { /* dotenv optional */ }
  const result = await runDoctor({});
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { analyzeEnv, analyzeFlows, runDoctor, formatReport, keySource, KEY_SOURCES, REQUIRED_VARS, FEATURES };
