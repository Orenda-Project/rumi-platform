/**
 * feature-availability — the single source of truth for which features are
 * live in this deployment.
 *
 * Rumi gates features by PRESENCE: a feature is available iff its required
 * env key(s) are set. There is no tier system and no master enable flag —
 * set a feature's keys and it turns on; leave them blank and it stays off
 * (the bot never crashes over a missing optional key).
 *
 * On top of that sits ONE operator control: a switch that can turn an
 * available feature OFF without deleting its key (see ./feature-overrides.js).
 * It can never turn a feature on. Deployments that set no switches behave
 * exactly as they did before it existed, which is why the default is always
 * 'enabled' rather than 'unset'.
 *
 * Each feature's `keys` list is verified against the code that actually reads
 * them, so `doctor` and any runtime gate report the truth, not an aspiration.
 *
 * The messaging channel is presence-gated the same way, just scoped by
 * CHANNEL_DRIVER (see resolveChannelDriver below and
 * bot/shared/services/messaging/channel-registry.js): the WhatsApp/Meta vars
 * are required only when the resolved channel is `meta` — a sandbox
 * (Baileys) deployment needs none of them. This is a second presence-based
 * selector, not a new tier system, the same shape as QUEUE_DRIVER.
 */

const { DRIVERS, DEFAULT_DRIVER } = require('../services/messaging/channel-registry');
// Dependency-free by design — see that module's header. Requiring it here is
// safe for `rumi doctor` and the repo-root test suite, both of which load this
// file on machines with no database and no bot/node_modules.
const overrides = require('./feature-overrides');

// Hard requirements, independent of messaging channel: the bot will not start
// without all of these.
const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'REDIS_URL',
];

// Additional vars required per messaging channel driver. Adding a new channel
// (e.g. Slack) is a one-line addition here — no restructuring.
const CHANNEL_REQUIRED_VARS = {
  meta: ['WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID'],
  baileys: [],
};

// Additive channels (Slack, Discord, ...) run ALONGSIDE whichever
// CHANNEL_DRIVER is resolved below — they are never selected by
// CHANNEL_DRIVER, and their vars are never boot-blocking (never folded into
// requiredVarsFor/missingRequired). A channel here turns on the moment every
// one of its listed vars is present, same presence-gate shape as FEATURES.
const ADDITIVE_CHANNEL_REQUIRED_VARS = {
  slack: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
  // Deliberately no DISCORD_PUBLIC_KEY here: that var (+ Ed25519 signature
  // verification) is only needed for a bot using a separate HTTP
  // "Interactions Endpoint URL" instead of the Gateway. This bot runs the
  // Gateway (persistent WebSocket) for full message support, and with no
  // Interactions Endpoint URL configured in the Developer Portal, Discord
  // delivers slash commands/buttons/modals over that SAME Gateway
  // connection too — see discord-events.adapter.js. There is no HTTP route
  // to sign-verify at all for this driver, unlike Slack's webhook-based design.
  discord: ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID'],
};

// Optional features → the env key(s) that switch each one on.
const FEATURES = [
  { id: 'stt_soniox', name: 'Voice notes (speech-to-text, Soniox)', keys: ['SONIOX_API_KEY'] },
  {
    id: 'channel_slack',
    name: 'Slack channel (Bot + Events API)',
    keys: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
    notes: 'Runs alongside your WhatsApp driver, in both sandbox and production — set via `rumi setup`\'s messaging channels step.',
    probe: 'slack',
  },
  {
    id: 'channel_discord',
    name: 'Discord channel (Gateway)',
    keys: ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID'],
    notes: 'Runs alongside your WhatsApp driver via a persistent Gateway connection — set via `rumi setup`\'s '
      + 'messaging channels step. MESSAGE_CONTENT is a privileged intent; needs Discord\'s own Bot Verification '
      + 'once the bot is in 100+ servers.',
    probe: 'discord',
  },
  {
    id: 'morning_brief',
    name: 'Morning Brief (programme-health briefs to your team)',
    keys: ['BRIEF_RECIPIENTS'],
    notes: 'Needs BRIEF_DATABASE_URL or DATABASE_URL and python3 with matplotlib; schedule bot/workers/brief.worker.js daily.',
  },
  { id: 'tts_elevenlabs', name: 'Spoken replies (text-to-speech, ElevenLabs)', keys: ['ELEVENLABS_API_KEY'] },
  { id: 'tts_uplift', name: 'Urdu / regional voices (Uplift)', keys: ['UPLIFT_API_KEY'] },
  { id: 'lesson_plans_gamma', name: 'Lesson-plan generation (Gamma)', keys: ['GAMMA_API_KEY'] },
  { id: 'pronunciation_azure', name: 'Reading pronunciation scoring (Azure)', keys: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] },
  // Video generation has TWO gates: KIE_API_KEY (creds, presence-checked here)
  // AND VIDEO_GENERATION_ENABLED=true at the orchestrator (a master kill-switch
  // checked in bot/shared/services/video/video-orchestrator.service.js). The
  // flag intentionally stays out of `keys` because `keys` drives the presence
  // gate — adding it would mark the feature OFF whenever the env var is unset,
  // which is the wrong semantics (you can set the key and gate it independently).
  { id: 'video_kie', name: 'Video generation (Kie.ai)', keys: ['KIE_API_KEY'], notes: 'Also requires VIDEO_GENERATION_ENABLED=true at runtime.' },
  // Exam-checker OCR has TWO supported backends — Mistral Vision (primary)
  // and Chandra / Datalab (fallback). The OCR service tries Mistral when
  // MISTRAL_API_KEY is set, falls back to Chandra when CHANDRA_API_KEY is
  // set. The feature is therefore available iff EITHER key is present;
  // `keysAny` carries that disjunction semantics (vs `keys` which is AND).
  {
    id: 'exam_ocr',
    name: 'Exam-checker OCR (Mistral or Chandra)',
    keysAny: ['MISTRAL_API_KEY', 'CHANDRA_API_KEY'],
  },
  { id: 'observability_axiom', name: 'Observability (Axiom)', keys: ['AXIOM_DATASET', 'AXIOM_TOKEN'] },
];

// A var counts as "set" only if it holds a real value — not a template placeholder.
// Placeholders the template ships: CHANGEME-*, your-project / your_ / YOUR_, and <…> angle stubs.
// (REDIS_URL=redis://localhost:6379 is a legitimate local default and is intentionally NOT a placeholder.)
const PLACEHOLDER_RE = /^CHANGEME|your-project|your_|^YOUR_|^<.*>$/i;
const isSet = (v) => typeof v === 'string' && v.trim() !== '' && !PLACEHOLDER_RE.test(v.trim());

/**
 * Which messaging channel driver applies for this env. Explicit CHANNEL_DRIVER
 * wins when it names a known driver; an unknown explicit value falls back to
 * DEFAULT_DRIVER (messaging/index.js logs that case — this function stays a
 * pure, side-effect-free config read). With no CHANNEL_DRIVER set at all,
 * infer `meta` if ANY of its required vars is already present — a
 * pre-existing or partially-configured Meta deployment must keep being told
 * what's missing, not get silently reclassified as sandbox with nothing
 * required.
 */
function resolveChannelDriver(env = process.env) {
  const explicit = (env.CHANNEL_DRIVER || '').trim().toLowerCase();
  if (explicit) {
    return Object.prototype.hasOwnProperty.call(DRIVERS, explicit) ? explicit : DEFAULT_DRIVER;
  }
  const metaVars = CHANNEL_REQUIRED_VARS.meta;
  if (metaVars.some((k) => isSet(env[k]))) return 'meta';
  return DEFAULT_DRIVER;
}

/** The full required-vars list for this env: the channel-independent core plus whichever channel is resolved. */
function requiredVarsFor(env = process.env) {
  const channel = resolveChannelDriver(env);
  return [...REQUIRED_VARS, ...(CHANNEL_REQUIRED_VARS[channel] || [])];
}

/** Required vars (core + resolved channel) that are NOT set (empty array = ready to boot). */
function missingRequired(env = process.env) {
  return requiredVarsFor(env).filter((k) => !isSet(env[k]));
}

/**
 * Is a single feature (by display name, entry object, or keys array)
 * available? An entry with `keys` requires ALL listed env vars; an entry
 * with `keysAny` requires AT LEAST ONE (e.g. exam-checker OCR works with
 * Mistral OR Chandra). Passing a bare array of strings keeps the legacy
 * AND-semantics call shape that downstream code relies on.
 */
function isFeatureAvailable(feature, env = process.env, opts = {}) {
  const entry = typeof feature === 'string' ? FEATURES.find((f) => f.name === feature) : feature;

  // Layer 1 — presence. Unchanged, and still the thing that decides whether a
  // feature CAN run.
  let present;
  if (entry && Array.isArray(entry.keysAny)) {
    present = entry.keysAny.some((k) => isSet(env[k]));
  } else {
    // `Array.isArray` is tested FIRST, before `entry.keys`. A bare array is a
    // legitimate call shape (documented above), and every array inherits
    // `Array.prototype.keys` — a function, and therefore truthy — so checking
    // `entry.keys` first silently picked up the prototype method and threw
    // `keys.every is not a function` on the one shape this branch exists for.
    const keys = Array.isArray(feature) ? feature : (entry && Array.isArray(entry.keys) ? entry.keys : null);
    if (!keys) return false;
    present = keys.every((k) => isSet(env[k]));
  }
  if (!present) return false;

  // Layer 2 — the operator's switch. It can only ever subtract: a feature with
  // no key stays off above, and a feature with no id (a bare keys array, the
  // legacy call shape) has no switch and is unaffected. Pass
  // { ignoreOverrides: true } to ask the presence question alone, which is what
  // `doctor` needs in order to say "keys present, switched off by you" rather
  // than an unhelpful bare "off".
  if (opts.ignoreOverrides) return true;
  const id = entry && entry.id;
  return id ? overrides.isEnabled(id) : true;
}

/**
 * Features whose KEYS are present, regardless of any operator switch. The
 * honest answer to "is this configured", as distinct from "is this running".
 *
 * @param {object} [env]
 * @returns {string[]}
 */
function configuredFeatures(env = process.env) {
  return FEATURES
    .filter((f) => isFeatureAvailable(f, env, { ignoreOverrides: true }))
    .map((f) => f.name);
}

/** Names of every feature whose keys are present. */
function availableFeatures(env = process.env) {
  return FEATURES.filter((f) => isFeatureAvailable(f, env)).map((f) => f.name);
}

/**
 * Which additive channels (Slack, Discord, ...) are active — i.e. every var
 * ADDITIVE_CHANNEL_REQUIRED_VARS lists for that channel is present. Distinct
 * from resolveChannelDriver: that resolves the ONE mutually-exclusive
 * WhatsApp-family driver (meta|baileys); this resolves the SET of additional
 * channels running concurrently alongside it. A deployment with none
 * configured gets [] — byte-identical behavior to before this existed.
 */
function resolveActiveChannels(env = process.env) {
  return Object.keys(ADDITIVE_CHANNEL_REQUIRED_VARS).filter((name) =>
    ADDITIVE_CHANNEL_REQUIRED_VARS[name].every((k) => isSet(env[k]))
  );
}

module.exports = {
  REQUIRED_VARS,
  CHANNEL_REQUIRED_VARS,
  ADDITIVE_CHANNEL_REQUIRED_VARS,
  FEATURES,
  isSet,
  resolveChannelDriver,
  resolveActiveChannels,
  requiredVarsFor,
  missingRequired,
  isFeatureAvailable,
  availableFeatures,
  configuredFeatures,
  overrides,
};
