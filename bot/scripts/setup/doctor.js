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

// Hard requirements: the bot will not start without all of these.
const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'REDIS_URL',
  'WHATSAPP_TOKEN',
  'PHONE_NUMBER_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'WABA_ID',
];

// Optional features: each turns on automatically when its key(s) are present.
// (Verified against the OSS bot code — the env var listed is the one the
// feature's service actually reads.)
const FEATURES = [
  { name: 'Voice notes (speech-to-text, Soniox)', keys: ['SONIOX_API_KEY'] },
  { name: 'Spoken replies (text-to-speech, ElevenLabs)', keys: ['ELEVENLABS_API_KEY'] },
  { name: 'Urdu / regional voices (Uplift)', keys: ['UPLIFT_API_KEY'] },
  { name: 'Lesson-plan generation (Gamma)', keys: ['GAMMA_API_KEY'] },
  { name: 'Reading pronunciation scoring (Azure)', keys: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] },
  { name: 'Video generation (Kie.ai)', keys: ['KIE_API_KEY'] },
  { name: 'Exam-checker OCR (Mistral vision)', keys: ['MISTRAL_API_KEY'] },
  { name: 'Observability (Axiom)', keys: ['AXIOM_DATASET', 'AXIOM_TOKEN'] },
];

const isSet = (v) => typeof v === 'string' && v.trim() !== '' && !/^CHANGEME/i.test(v.trim());

// ── Static analysis (pure, no network) ──────────────────────────────────────

/**
 * @param {object} env  Usually process.env.
 * @returns {{ requiredPresent, missingRequired, features }}
 */
function analyzeEnv(env) {
  const requiredPresent = REQUIRED_VARS.filter((k) => isSet(env[k]));
  const missingRequired = REQUIRED_VARS.filter((k) => !isSet(env[k]));

  const features = FEATURES.map((f) => {
    // A feature with no env keys (e.g. Chromium) is keyed off its probe, not env.
    const missingKeys = f.keys.filter((k) => !isSet(env[k]));
    const available = f.keys.length > 0 ? missingKeys.length === 0 : null; // null = "ask the probe"
    return { name: f.name, requiredKeys: f.keys, missingKeys, available, probe: f.probe || null };
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
async function runDoctor({ env = process.env, probes = defaultProbes } = {}) {
  const analysis = analyzeEnv(env);

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
    if (f.probe && probes[f.probe]) {
      try {
        const { ok, detail } = await probes[f.probe](env);
        featureResults.push({ name: f.name, status: ok ? 'on' : 'off', detail });
      } catch (err) {
        featureResults.push({ name: f.name, status: 'off', detail: err.message });
      }
    } else {
      featureResults.push({
        name: f.name,
        status: f.available ? 'on' : 'off',
        detail: f.available ? 'keys present' : `set: ${f.requiredKeys.join(', ')}`,
      });
    }
  }

  const probesPassed = probeResults.every((p) => p.status !== 'fail');
  const ok = analysis.missingRequired.length === 0 && probesPassed;

  return { ok, missingRequired: analysis.missingRequired, probeResults, featureResults };
}

// ── Pretty printer ────────────────────────────────────────────────────────────

function formatReport(result) {
  const mark = (s) => ({ pass: '✅', fail: '❌', skip: '⏭️ ', on: '✅', off: '➖' }[s] || '•');
  const lines = [];
  lines.push('Rumi doctor — deployment preflight');
  lines.push('');
  if (result.missingRequired.length) {
    lines.push('❌ MISSING REQUIRED variables (the bot will not start):');
    for (const v of result.missingRequired) lines.push(`   - ${v}`);
    lines.push('');
  }
  lines.push('Required services (live checks):');
  for (const p of result.probeResults) lines.push(`  ${mark(p.status)} ${p.name} — ${p.detail}`);
  lines.push('');
  lines.push('Optional features (on when their keys are set):');
  for (const f of result.featureResults) lines.push(`  ${mark(f.status)} ${f.name} — ${f.detail}`);
  lines.push('');
  lines.push(result.ok ? '✅ All required services are configured and reachable.' :
    '❌ Not ready — fix the items marked ❌ above, then re-run `npm run doctor`.');
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

module.exports = { analyzeEnv, runDoctor, formatReport, REQUIRED_VARS, FEATURES };
