/**
 * feature-availability — the single source of truth for which features are
 * live in this deployment.
 *
 * Rumi gates features by PRESENCE: a feature is available iff its required
 * env key(s) are set. There is no tier system and no master enable flag —
 * set a feature's keys and it turns on; leave them blank and it stays off
 * (the bot never crashes over a missing optional key).
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

// Optional features → the env key(s) that switch each one on.
const FEATURES = [
  { name: 'Voice notes (speech-to-text, Soniox)', keys: ['SONIOX_API_KEY'] },
  { name: 'Spoken replies (text-to-speech, ElevenLabs)', keys: ['ELEVENLABS_API_KEY'] },
  { name: 'Urdu / regional voices (Uplift)', keys: ['UPLIFT_API_KEY'] },
  { name: 'Lesson-plan generation (Gamma)', keys: ['GAMMA_API_KEY'] },
  { name: 'Reading pronunciation scoring (Azure)', keys: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] },
  // Video generation has TWO gates: KIE_API_KEY (creds, presence-checked here)
  // AND VIDEO_GENERATION_ENABLED=true at the orchestrator (a master kill-switch
  // checked in bot/shared/services/video/video-orchestrator.service.js). The
  // flag intentionally stays out of `keys` because `keys` drives the presence
  // gate — adding it would mark the feature OFF whenever the env var is unset,
  // which is the wrong semantics (you can set the key and gate it independently).
  { name: 'Video generation (Kie.ai)', keys: ['KIE_API_KEY'], notes: 'Also requires VIDEO_GENERATION_ENABLED=true at runtime.' },
  // Exam-checker OCR has TWO supported backends — Mistral Vision (primary)
  // and Chandra / Datalab (fallback). The OCR service tries Mistral when
  // MISTRAL_API_KEY is set, falls back to Chandra when CHANDRA_API_KEY is
  // set. The feature is therefore available iff EITHER key is present;
  // `keysAny` carries that disjunction semantics (vs `keys` which is AND).
  {
    name: 'Exam-checker OCR (Mistral or Chandra)',
    keysAny: ['MISTRAL_API_KEY', 'CHANDRA_API_KEY'],
  },
  { name: 'Observability (Axiom)', keys: ['AXIOM_DATASET', 'AXIOM_TOKEN'] },
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
function isFeatureAvailable(feature, env = process.env) {
  const entry = typeof feature === 'string' ? FEATURES.find((f) => f.name === feature) : feature;
  if (entry && Array.isArray(entry.keysAny)) {
    return entry.keysAny.some((k) => isSet(env[k]));
  }
  const keys = entry && entry.keys ? entry.keys : Array.isArray(feature) ? feature : null;
  if (!keys) return false;
  return keys.every((k) => isSet(env[k]));
}

/** Names of every feature whose keys are present. */
function availableFeatures(env = process.env) {
  return FEATURES.filter((f) => isFeatureAvailable(f, env)).map((f) => f.name);
}

module.exports = {
  REQUIRED_VARS,
  CHANNEL_REQUIRED_VARS,
  FEATURES,
  isSet,
  resolveChannelDriver,
  requiredVarsFor,
  missingRequired,
  isFeatureAvailable,
  availableFeatures,
};
