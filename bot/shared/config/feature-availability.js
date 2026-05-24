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
 */

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

// Optional features → the env key(s) that switch each one on.
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

/** Required vars that are NOT set (empty array = ready to boot). */
function missingRequired(env = process.env) {
  return REQUIRED_VARS.filter((k) => !isSet(env[k]));
}

/** Is a single feature (by display name or its keys array) available? */
function isFeatureAvailable(feature, env = process.env) {
  const entry = typeof feature === 'string' ? FEATURES.find((f) => f.name === feature) : feature;
  const keys = entry && entry.keys ? entry.keys : Array.isArray(feature) ? feature : null;
  if (!keys) return false;
  return keys.every((k) => isSet(env[k]));
}

/** Names of every feature whose keys are present. */
function availableFeatures(env = process.env) {
  return FEATURES.filter((f) => isFeatureAvailable(f, env)).map((f) => f.name);
}

module.exports = { REQUIRED_VARS, FEATURES, isSet, missingRequired, isFeatureAvailable, availableFeatures };
