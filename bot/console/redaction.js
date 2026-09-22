/**
 * redaction — the console's security boundary.
 *
 * Two jobs, both of which must be right or the console leaks:
 *
 *   1. CLASSIFY every env var as public / secret / never-revealable, so a value
 *      is never sent to a browser that shouldn't see it.
 *   2. MASK a value into something an operator can *recognise* without it being
 *      usable — the difference between "yes, that's the key I pasted" and
 *      "here is the key".
 *
 * Classification is DEFAULT-DENY. A variable this file has never heard of is a
 * secret and is not revealable. That matters because `.env.template` grows: a
 * provider key added next month is protected before anyone remembers to come
 * back here. The inverse policy — denylist the scary-looking names — fails the
 * first time someone adds `PARTNER_CREDENTIALS`.
 *
 * This module has NO dependencies beyond `node:crypto`, deliberately. It is
 * required by the logging path (see structured-logger integration), and a
 * dependency cycle or a heavy require there would be felt on every log line.
 *
 * @module console/redaction
 */

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Values that are not secrets: settings, identifiers, and public URLs. Shown in
 * full, editable in the open. Everything NOT listed here is treated as a secret.
 *
 * Prefix/suffix patterns cover the families that grow (`*_FLOW_ID`,
 * `*_VOICE_ID_*`, `*_MEDIA_ID`) so adding a thirteenth language's voice doesn't
 * require an edit here.
 */
const PUBLIC_EXACT = new Set([
  'NODE_ENV', 'PORT', 'LOG_LEVEL', 'SERVICE_NAME', 'APP_URL',
  'CHANNEL_DRIVER', 'CHANNEL_STATE_DIR', 'QUEUE_DRIVER', 'QUEUE_NAME',
  'LLM_PROVIDER', 'LLM_MODEL', 'VISION_MODEL',
  'PIC_LP_CLASSIFIER_MODEL', 'PIC_LP_EXTRACTOR_MODEL',
  'SUPABASE_URL', 'MMS_SERVICE_URL', 'MMS_TIMEOUT_MS',
  'PHONE_NUMBER_ID', 'WABA_ID', 'META_APP_ID', 'GRAPH_API_VERSION',
  'WHATSAPP_DISPLAY_NAME', 'DEFAULT_PHONE_COUNTRY_CODE',
  'AXIOM_DATASET', 'AZURE_SPEECH_REGION',
  'DEFAULT_REGION', 'DEFAULT_LANGUAGE', 'DEFAULT_OBSERVATION_FRAMEWORK',
  'REGION_FRAMEWORK_MAP', 'SETTINGS_LANGUAGES',
  'BOT_NAME', 'ORG_NAME', 'SUPPORT_CONTACT', 'SUPPORT_EMAIL', 'SECURITY_CONTACT',
  'PORTAL_URL', 'WEBSITE_URL', 'ASSET_BASE_URL', 'ASSETS_BASE_URL', 'LOGO_URL',
  'BOT_DOMAIN', 'DASHBOARD_URL', 'DASHBOARD_PORT',
  'VIDEO_GENERATION_ENABLED', 'VIDEO_WATERMARK_ENABLED', 'VIDEO_DAILY_LIMIT',
  'VIDEO_WATERMARK_TEXT', 'USE_PASSAGE_BACKGROUNDS',
  'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_SECONDS',
  'WORKER_CONCURRENCY', 'WORKER_PORT', 'WORKER_MODE', 'TEMP_DIR',
  'BRIEF_RECIPIENTS', 'BRIEF_TZ', 'BRIEF_GROUP_BY', 'BRIEF_REGION',
  'BRIEF_ORGANIZATION', 'BRIEF_DAILY_DOWS', 'BRIEF_WEEKLY_DOW',
  'BRIEF_OUT_DIR', 'BRIEF_LIVE_URL', 'BRIEF_PYTHON',
  'DISCORD_APPLICATION_ID', 'DISCORD_TEST_GUILD_ID',
  'CONSOLE_PORT', 'CONSOLE_BIND', 'CONSOLE_ENABLED', 'CONSOLE_PUBLIC_HOST',
  'RUMI_TELEMETRY', 'RUMI_DEPLOYMENT_ID',
  'CLOUDFLARE_R2_BUCKET_NAME', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL', 'R2_ENDPOINT',
  'CLOUDFLARE_ACCOUNT_ID', 'AWS_REGION', 'AWS_REGION_TEXTRACT',
  'SQS_POLL_INTERVAL', 'SQS_WORKER_CONCURRENCY', 'SQS_WORKER_HEALTH_PORT',
  'COACHING_WORKER_CONCURRENCY', 'COACHING_WORKER_HEALTH_PORT',
  'COACHING_POLL_INTERVAL', 'COACHING_ERROR_BACKOFF',
]);

/** Families of non-secret identifiers that keep growing. */
const PUBLIC_PATTERNS = [
  /_FLOW_ID$/,
  /^ELEVENLABS_VOICE_ID(_[A-Z_]+)?$/,
  /^UPLIFT_VOICE_ID(_[A-Z_]+)?$/,
  /_MEDIA_ID$/,
  /_VIDEO_PATH$/,
  /^BULLMQ_[A-Z_]*QUEUE$/,
  /^SQS_[A-Z_]*QUEUE_URL$/,
];

/**
 * Secrets an operator may read back, because the recovery workflow genuinely
 * needs it: these are third-party provider keys, rotatable in one click at the
 * vendor, with a blast radius of one vendor and a spend cap. "Did I paste the
 * right key into the right one of sixteen slots" is the exact pain the console
 * exists to remove, and you cannot answer it without seeing the value.
 */
const REVEALABLE = new Set([
  'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'SONIOX_API_KEY', 'ELEVENLABS_API_KEY', 'UPLIFT_API_KEY',
  'GAMMA_API_KEY', 'KIE_API_KEY', 'KIE_API_KEY_PIC_LP',
  'MISTRAL_API_KEY', 'CHANDRA_API_KEY', 'GEMINI_API_KEY', 'DATALAB_API_KEY',
  'AZURE_SPEECH_KEY', 'AXIOM_TOKEN', 'MMS_API_KEY',
  'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET',
  'DISCORD_BOT_TOKEN', 'WHATSAPP_TOKEN',
]);

/**
 * Secrets that are never sent to a browser, whatever the operator asks.
 *
 * Each of these converts one authenticated console session into something
 * durable and invisible, and none of them has a workflow that needs read-back:
 *
 *   SUPABASE_SERVICE_ROLE_KEY  bypasses row-level security on every table
 *                              holding teacher phone numbers, student names and
 *                              classroom recordings. You paste it once; the
 *                              Supabase probe tells you whether it works.
 *   SESSION_SECRET             forges a console session cookie — revealing it
 *                              is a privilege-escalation primitive against the
 *                              console itself.
 *   FLOW_PRIVATE_KEY*          decrypts WhatsApp Flow payloads (attendance
 *                              rosters, registration forms, student lists). The
 *                              recovery path is regenerate-and-re-register, not
 *                              read-back.
 *   INTERNAL_API_KEY           guards the internal endpoint that sends arbitrary
 *                              text to arbitrary phone numbers.
 *   WEBHOOK_VERIFY_TOKEN       set once on both sides; reading it back has no use.
 *   ADMIN_PASSWORD_HASH        the console's own credential.
 */
const NEVER_REVEALABLE = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'FLOW_PRIVATE_KEY', 'FLOW_PRIVATE_KEY_B64',
  'INTERNAL_API_KEY',
  'WEBHOOK_VERIFY_TOKEN',
  'ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD',
  'JWT_SECRET', 'PORTAL_JWT_SECRET',
  'BROADCAST_PASSWORD', 'WHATSAPP_2FA_PIN',
  'RAILWAY_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'GITHUB_TOKEN',
  'BRIEF_SCREEN_TOKEN',
]);

/**
 * Names that must never be classified public, whatever PUBLIC_EXACT says. This
 * is a belt-and-braces check against a careless future edit to the list above —
 * a test asserts it holds, so adding `SOMETHING_SECRET` to PUBLIC_EXACT fails
 * the build rather than shipping.
 */
const SECRET_SHAPED = /(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|HASH|CREDENTIAL|PIN)(?:_|$)/;

/** Connection strings carry an inline password even though the name looks tame. */
const CONNECTION_URL_VARS = new Set([
  'REDIS_URL', 'DATABASE_URL', 'BRIEF_DATABASE_URL', 'SUPABASE_DB_PASSWORD',
]);

/**
 * @typedef {'public'|'secret'} Classification
 * @typedef {{classification: Classification, revealable: boolean}} Verdict
 */

/**
 * How should this variable be treated? Default-deny: unknown ⇒ secret, not revealable.
 *
 * @param {string} key
 * @returns {Verdict}
 */
function classify(key) {
  const name = String(key || '').trim();

  if (NEVER_REVEALABLE.has(name)) return { classification: 'secret', revealable: false };
  if (REVEALABLE.has(name)) return { classification: 'secret', revealable: true };
  if (CONNECTION_URL_VARS.has(name)) return { classification: 'secret', revealable: false };

  const looksPublic = PUBLIC_EXACT.has(name) || PUBLIC_PATTERNS.some((re) => re.test(name));
  // A secret-shaped name never gets to be public, even by an entry above. The
  // list is maintained by hand; this is the part that can't be got wrong.
  if (looksPublic && !SECRET_SHAPED.test(name)) return { classification: 'public', revealable: true };

  return { classification: 'secret', revealable: false };
}

// ── Masking ──────────────────────────────────────────────────────────────────

/** Below this length, showing any of the value shows too much of it. */
const MIN_LENGTH_FOR_HINT = 20;

/**
 * A recognisable, unusable fragment of a secret: first 5 and last 4 characters.
 *
 * Short values get no hint at all — nine characters of a twelve-character value
 * is not redaction, it is a puzzle with one move left.
 *
 * @param {string} value
 * @returns {string|null} the hint, or null when the value is too short to hint at
 */
function maskSecret(value) {
  const v = String(value == null ? '' : value);
  if (!v) return null;
  if (v.length < MIN_LENGTH_FOR_HINT) return null;
  return `${v.slice(0, 5)}…${v.slice(-4)}`;
}

/**
 * Strip the inline password from a connection string, leaving the shape an
 * operator needs to recognise the host. Same transform `doctor`'s redis probe
 * already applies to its error messages.
 *
 * @param {string} value
 * @returns {string}
 */
function maskConnectionUrl(value) {
  return String(value == null ? '' : value).replace(/\/\/[^@/]*@/, '//');
}

/**
 * A phone number reduced to what an operator needs to tell two conversations
 * apart, and no more: the country code and the last two digits.
 *
 * Four trailing digits plus a country code is often enough to re-identify one
 * teacher within one school, so this keeps two.
 *
 * @param {string} value
 * @returns {string|null}
 */
function maskPhone(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6) return '•••';
  // Country codes are 1-3 digits; 2 is the common case for Rumi's deployments
  // and guessing wrong only changes how much of the prefix is shown.
  const cc = digits.length > 11 ? digits.slice(0, 2) : digits.slice(0, 1);
  return `+${cc}•••${digits.slice(-2)}`;
}

/**
 * Present a single env var to the browser. This is the ONLY function permitted
 * to turn a raw `.env` value into something sent over the wire, so that the
 * "never ship a full secret in a list response" rule has exactly one place to
 * be true.
 *
 * @param {string} key
 * @param {string|undefined} value
 * @param {{isSet?: (v: string) => boolean}} [opts] presence test — pass
 *   feature-availability's `isSet` so the console and `doctor` agree about what
 *   "set" means (it rejects template placeholders, which a bare truthiness
 *   check would count as configured).
 * @returns {{key: string, set: boolean, classification: Classification,
 *            revealable: boolean, display: string|null, length: number}}
 */
function describeVar(key, value, opts = {}) {
  const isSet = opts.isSet || ((v) => typeof v === 'string' && v.trim() !== '');
  const raw = value == null ? '' : String(value);
  const set = isSet(raw);
  const { classification, revealable } = classify(key);

  let display = null;
  if (set) {
    if (classification === 'public') display = raw;
    else if (CONNECTION_URL_VARS.has(key)) display = maskConnectionUrl(raw);
    else display = maskSecret(raw);
  }

  return {
    key,
    set,
    classification,
    // A value you cannot see is not revealable regardless of policy.
    revealable: revealable && set && classification === 'secret',
    display,
    length: set ? raw.length : 0,
  };
}

module.exports = {
  classify,
  describeVar,
  maskSecret,
  maskConnectionUrl,
  maskPhone,
  PUBLIC_EXACT,
  PUBLIC_PATTERNS,
  REVEALABLE,
  NEVER_REVEALABLE,
  SECRET_SHAPED,
  CONNECTION_URL_VARS,
  MIN_LENGTH_FOR_HINT,
};
