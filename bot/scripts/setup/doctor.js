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
const {
  REQUIRED_VARS, CHANNEL_REQUIRED_VARS, FEATURES, isSet, requiredVarsFor, resolveChannelDriver,
  resolveActiveChannels,
} = require('../../shared/config/feature-availability');
const { DRIVERS, isProductionTier } = require('../../shared/services/messaging/channel-registry');
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
  SLACK_SIGNING_SECRET: 'api.slack.com/apps → your app → Basic Information → App Credentials',
  SLACK_BOT_TOKEN: 'api.slack.com/apps → your app → OAuth & Permissions → Bot User OAuth Token',
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
 * @returns {{ requiredPresent, missingRequired, features, channel, channelDriverTypo }}
 */
function analyzeEnv(env) {
  const channel = resolveChannelDriver(env);
  // If CHANNEL_DRIVER was set explicitly but didn't name a known driver,
  // surface that as its own warning — resolveChannelDriver() already fell
  // back to the default, so this is the one place left that would otherwise
  // silently hide a typo from the report.
  const rawChannelDriver = (env.CHANNEL_DRIVER || '').trim().toLowerCase();
  const channelDriverTypo = rawChannelDriver && !Object.prototype.hasOwnProperty.call(DRIVERS, rawChannelDriver)
    ? rawChannelDriver
    : null;
  const requiredVars = requiredVarsFor(env);
  const requiredPresent = requiredVars.filter((k) => isSet(env[k]));
  const missingRequired = requiredVars.filter((k) => !isSet(env[k]));

  // Additive channels (Slack, Discord, ...) run ALONGSIDE the one resolved
  // `channel` above — never boot-blocking, purely informational here, same
  // presence-gate shape as FEATURES.
  const activeChannels = resolveActiveChannels(env);

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

  return {
    requiredPresent, missingRequired, features, channel, channelDriverTypo, activeChannels,
  };
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
  /**
   * Reachable Supabase ≠ Rumi tables. An empty project answers HTTP 200 on
   * /rest/v1/ and then every inbound "Hi" dies on PGRST205 for public.users.
   */
  async tables(env) {
    const db = require('./db-setup');
    const status = await db.inspectDatabase(env);
    if (status.state === 'ready') return { ok: true, detail: status.detail };
    if (status.state === 'needs-helper') {
      return {
        ok: false,
        detail: 'paste the exec_sql helper in the SQL editor, then run `npm run bootstrap:db` (or `rumi setup`)',
      };
    }
    if (status.state === 'needs-schema') {
      return {
        ok: false,
        detail: 'helper is there but the tables are not — run `npm run bootstrap:db` or `rumi setup`',
      };
    }
    return { ok: false, detail: status.detail };
  },
  /**
   * Checks the key AND that it can actually pay for a call.
   *
   * A valid-but-broke key answers HTTP 200 here while every real feature fails:
   * a fresh OpenRouter account has no purchased credits, and once the free
   * allowance is spent the API returns "402 … you requested up to 16384 tokens,
   * but can only afford 2236". Reporting a green tick for that is the worst kind
   * of preflight — it sends the operator looking for a bug in the bot. Found
   * live on exactly this setup: chat replies worked, quiz generation did not.
   */
  async openrouter(env) {
    const headers = { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` };
    const res = await fetch('https://openrouter.ai/api/v1/key', { headers });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

    // Credits are a separate endpoint; a failure to read them must not turn a
    // working key red, so this only ever downgrades on a definite answer.
    try {
      const creditRes = await fetch('https://openrouter.ai/api/v1/credits', { headers });
      if (creditRes.ok) {
        const { data } = await creditRes.json();
        const granted = Number(data?.total_credits);
        const used = Number(data?.total_usage);
        if (Number.isFinite(granted) && Number.isFinite(used)) {
          const remaining = granted - used;
          if (remaining <= 0) {
            return {
              ok: false,
              detail: granted === 0
                ? 'key valid, but the account has no credits — add some at openrouter.ai/settings/credits'
                : `key valid, but credits are exhausted ($${granted.toFixed(2)} granted, $${used.toFixed(2)} used) — top up at openrouter.ai/settings/credits`,
            };
          }
          return { ok: true, detail: `HTTP ${res.status} · $${remaining.toFixed(2)} credit remaining` };
        }
      }
    } catch {
      // fall through to the plain auth result
    }

    return { ok: res.ok, detail: `HTTP ${res.status}` };
  },
  async whatsapp(env) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${env.PHONE_NUMBER_ID}?access_token=${env.WHATSAPP_TOKEN}`,
    );
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  },
  /**
   * Checks the bot token AND that it actually carries every scope Rumi's
   * Slack driver needs (chat:write, im:write, reactions:write, files:read,
   * files:write). A token that authenticates but lacks one is the single most
   * common Slack setup failure — the scope error only ever surfaces later,
   * mid-conversation, as an opaque "missing_scope" with no indication of
   * which of the five is absent. auth.test succeeding is not enough on its
   * own: Slack reports the token's granted scopes in the `x-oauth-scopes`
   * response header, not in the JSON body, so that header is what this reads.
   */
  async slack(env) {
    const REQUIRED_SCOPES = ['chat:write', 'im:write', 'reactions:write', 'files:read', 'files:write'];
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

    const body = await res.json();
    if (!body.ok) {
      return { ok: false, detail: `Slack rejected the token: ${body.error || 'unknown error'}` };
    }

    const granted = (res.headers.get('x-oauth-scopes') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));
    if (missing.length) {
      return {
        ok: false,
        detail: `token works, but is missing ${missing.length === 1 ? 'scope' : 'scopes'}: ${missing.join(', ')} `
          + '— add them under OAuth & Permissions → Scopes → Bot Token Scopes, then reinstall the app',
      };
    }

    return { ok: true, detail: `connected as ${body.team || 'your workspace'}, all required scopes present` };
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
    } catch (err) {
      // ioredis reports an unreachable server as "Connection is closed.", which
      // says nothing about where it tried or why. Name the address instead.
      const host = String(env.REDIS_URL || '').replace(/\/\/[^@/]*@/, '//');
      if (/Connection is closed/i.test(err.message)) {
        throw new Error(`nothing answered at ${host}`);
      }
      throw new Error(`${err.message} (${host})`);
    } finally {
      client.disconnect();
    }
  },
};

// Which probe backs each REQUIRED service, and the env vars it needs to run.
const REQUIRED_PROBES = [
  { name: 'Supabase', probe: 'supabase', needs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { name: 'Rumi tables', probe: 'tables', needs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
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
  // Repo-anchored, like every other path here: run from bot/ it would otherwise
  // report "no flows registered" for a deployment that has them all.
  statePath = path.resolve(__dirname, '../../..', '.setup-state.json'),
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

  return {
    ok,
    missingRequired: analysis.missingRequired,
    probeResults,
    featureResults,
    flowResults,
    channel: analysis.channel,
    channelDriverTypo: analysis.channelDriverTypo,
    activeChannels: analysis.activeChannels,
  };
}

// ── Pretty printer ────────────────────────────────────────────────────────────

function formatReport(result) {
  const mark = (s) => ({ pass: '✅', fail: '❌', skip: '⏭️ ', on: '✅', off: '➖' }[s] || '•');
  const lines = [];
  lines.push('Rumi doctor — deployment preflight');
  if (result.channel) {
    const tier = isProductionTier(result.channel) ? 'production' : 'sandbox';
    lines.push(`Channel driver: ${result.channel} (${tier})`);
    if (result.channel === 'baileys') {
      lines.push(
        'ℹ️  Baileys sends/receives text, image, audio, and document messages once paired — run'
        + ' `rumi pair` if you have not yet. WhatsApp Flows, approved templates, and'
        + ' carousels have no Baileys equivalent (Meta-only) and log clearly rather than sending.'
        + ' A green result below means your OTHER required services are configured — it does NOT'
        + ' confirm messaging works end to end; pair and send yourself a test message to confirm that.'
        + ' See docs/onboarding/sandbox-production-design.md.'
      );
    }
  }
  if (result.channelDriverTypo) {
    lines.push(
      `⚠️  CHANNEL_DRIVER="${result.channelDriverTypo}" is not a recognized driver (valid: meta | baileys) —`
      + ` falling back to ${result.channel}.`
    );
  }
  if (result.activeChannels && result.activeChannels.length) {
    lines.push(`Additional channels active: ${result.activeChannels.join(', ')}`);
  }
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
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../..', '.env'), quiet: true });
  } catch { /* dotenv optional */ }
  const result = await runDoctor({});
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  analyzeEnv,
  analyzeFlows,
  runDoctor,
  formatReport,
  keySource,
  KEY_SOURCES,
  REQUIRED_VARS,
  CHANNEL_REQUIRED_VARS,
  requiredVarsFor,
  resolveChannelDriver,
  FEATURES,
  // Exported so the real probes' behaviour can be tested (the runner injects
  // fakes, which meant nothing verified the probes themselves).
  defaultProbes,
};
