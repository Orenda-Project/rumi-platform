/**
 * fields.js — the human-facing description of every value the `rumi` CLI can
 * collect: what to call it, why anyone would want it, and where to find it.
 *
 * It sits apart from the wizard for one reason: `rumi setup` and
 * `rumi graduate` both collect Meta's credentials, and when the wording lived
 * in each of them, one got the careful "this is the phone number ID, not the
 * phone number" guidance and the other asked for `PHONE_NUMBER_ID` and left the
 * user to guess. Sharing the copy makes that impossible.
 *
 * Env-var names appear here only as the storage key. Nothing in this file is
 * *asked* by its variable name — a person setting up Rumi should never have to
 * know that "Access token" is `WHATSAPP_TOKEN` to answer the question.
 *
 * @module fields
 */

const validators = require('./validators');

/**
 * @typedef {object} Field
 * @property {string}   env       the .env key this is stored as
 * @property {string}   label     what the human is asked for
 * @property {string}   [hint]    one line of context, printed above the prompt
 * @property {boolean}  [secret]  read masked
 * @property {Function} [validate]
 * @property {Function} [generate] produces a sensible value to offer as the default
 */

// ── Meta / WhatsApp Business (the production channel) ────────────────────────

/** Where to look, before being asked for anything. */
const META_WALKTHROUGH = [
  'Open https://developers.facebook.com/apps and open your app (or create one — pick the "Business" type)',
  'In the left sidebar choose WhatsApp → API Setup',
  'Keep that tab open: the next three answers are all on it',
];

/** @type {Field[]} */
const META_FIELDS = [
  {
    env: 'WHATSAPP_TOKEN',
    label: 'Access token',
    secret: true,
    hint: 'On API Setup, the box at the top — click "Generate access token". The temporary one expires in 24 hours, which is fine for a first test; for a real deployment create a permanent System User token instead.',
    validate: validators.whatsappToken,
  },
  {
    env: 'PHONE_NUMBER_ID',
    label: 'Phone number ID',
    hint: 'Directly under the "From" dropdown, labelled "Phone number ID". This is a long number Meta assigns — not the phone number itself.',
    validate: validators.phoneNumberId,
  },
  {
    env: 'WABA_ID',
    label: 'WhatsApp Business Account ID',
    hint: 'Just below the phone number ID on the same page.',
    validate: validators.wabaId,
  },
  {
    env: 'WEBHOOK_VERIFY_TOKEN',
    label: 'Webhook password',
    hint: 'You invent this one. Meta will ask you to type the same value when you point it at your server, and sends it back so Rumi can recognise a genuine request. Press Enter to use the one generated for you.',
    validate: validators.webhookVerifyToken,
    generate: () => require('crypto').randomBytes(16).toString('hex'),
  },
];

/** What still has to happen in Meta's console once the four values are in. */
const META_REMAINING_STEPS = [
  'Deploy Rumi somewhere with a public HTTPS address (SETUP.md covers Railway)',
  'In Meta\'s console: WhatsApp → Configuration → Webhook, set the callback URL to https://your-address/webhook and the verify token to the webhook password you just chose',
  'Subscribe the webhook to the "messages" field — without it Meta accepts the URL but never sends anything',
  'Register the interactive Flows: npm run setup:flows',
];

/**
 * @param {string} driver
 * @returns {Field[]} the fields that driver needs — empty for any sandbox
 *   driver, which is the point of sandbox: nothing to register, nothing to ask.
 */
function fieldsFor(driver) {
  return driver === 'meta' ? META_FIELDS : [];
}

// ── Optional abilities ───────────────────────────────────────────────────────

/**
 * Presence-gated extras, described by what a teacher would notice if it were
 * missing rather than by the vendor's product name. Order is deliberate: the
 * ones that change day-to-day use come first, so someone who stops reading
 * halfway has still seen the ones that matter.
 *
 * @type {Array<{keys: string[], title: string, why: string, where: string, secret?: boolean}>}
 */
const OPTIONAL_EXTRAS = [
  {
    keys: ['SONIOX_API_KEY'],
    title: 'Understand voice notes',
    why: 'Teachers talk more than they type. With this, Rumi transcribes voice notes in English, Urdu, Arabic and Spanish — and it is what reading assessments run on. The same key can also give Rumi its voice.',
    where: 'console.soniox.com',
    secret: true,
  },
  {
    keys: ['ELEVENLABS_API_KEY'],
    title: 'Reply out loud',
    why: 'Rumi answers with a spoken message instead of text — useful for teachers who find reading on a phone slow.',
    where: 'elevenlabs.io → API Keys',
    secret: true,
  },
  {
    keys: ['GAMMA_API_KEY'],
    title: 'Turn lesson plans into slides',
    why: 'Rumi builds a presentation a teacher can actually project in class. Needs a paid Gamma plan.',
    where: 'gamma.app/settings/api-keys',
    secret: true,
  },
  {
    keys: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'],
    title: 'Score pronunciation',
    why: 'Adds per-word pronunciation marks to reading assessments, on top of speed and accuracy.',
    where: 'portal.azure.com → create a Speech resource',
    secret: true,
  },
];

// ── Soniox as Rumi's voice ───────────────────────────────────────────────────

/**
 * The switch under the Soniox key: the same key that understands voice notes can
 * also speak Rumi's replies. On by default for a fresh setup. Off keeps Rumi's
 * voice on ElevenLabs, so the ElevenLabs key is asked for right under it.
 *
 * It is stored as TTS_PROVIDER, the voice gateway's own switch
 * (bot/shared/services/tts/routing.js): "soniox" or "legacy" (today's voices).
 */
const SONIOX_VOICE = {
  key: 'TTS_PROVIDER',
  on: 'soniox',
  off: 'legacy',
  // The ability whose card the switch sits in.
  under: 'SONIOX_API_KEY',
  label: "Also use Soniox for Rumi's voice",
  hint: "One key for listening and speaking: Rumi's spoken replies come from Soniox. If Soniox can't speak a language, ElevenLabs or Uplift speaks it instead.",
  offHint: 'Rumi will speak with ElevenLabs. Add its key so spoken replies keep working.',
  fallback: { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs key', where: 'elevenlabs.io → API Keys' },
};

/**
 * Is Soniox Rumi's voice? What TTS_PROVIDER says when it is set. Before it is set
 * the switch reads on for a fresh setup (the default), and off where a Soniox key
 * was already saved without it — that deployment is speaking with today's voice,
 * and the switch must not claim otherwise.
 *
 * @param {object} env
 * @returns {boolean}
 */
function sonioxVoiceOn(env = {}) {
  const value = String(env[SONIOX_VOICE.key] || '').trim().toLowerCase();
  if (value) return value === SONIOX_VOICE.on;
  return !String(env[SONIOX_VOICE.under] || '').trim();
}

// ── Slack (an additive messaging channel, not an "optional ability") ────────
// Deliberately NOT in OPTIONAL_EXTRAS — unlike Soniox/Gamma/Azure,
// Slack is a whole second messaging channel with its own multi-part app-side
// configuration (scopes, event subscriptions, interactivity, slash commands),
// not a single key that switches a feature on. It gets its own wizard step
// (stepMessagingChannels) so that configuration can be presented as one
// ordered checklist instead of a single "Key" prompt that leaves the app-side
// setup entirely undiscovered until something fails at runtime.

/** Every OAuth scope the Slack driver's Web API calls actually need (see
 * slack-channel.service.js) — chat.postMessage, conversations.open,
 * reactions.add, files.info, files.uploadV2. Kept in one place so the
 * checklist shown to the user and doctor.js's live scope probe can never
 * silently drift apart. */
const SLACK_BOT_SCOPES = ['chat:write', 'im:write', 'reactions:write', 'files:read', 'files:write'];

/** Every Slash Command text-message.handler.js recognizes (see
 * slack-events.adapter.js#mapSlashCommandToMetaShape) — registered as real
 * Slack Slash Commands so they work with Slack's own `/` autocomplete,
 * rather than being typed as plain text (which Slack intercepts and rejects
 * before it ever reaches the bot). */
const SLACK_SLASH_COMMANDS = [
  '/portal', '/readingtest', '/quiz', '/video', '/menu', '/register', '/language', '/settings', '/status',
];

/**
 * Builds the exact 3 Request URLs from one base, so the wizard can print
 * them fully assembled instead of making the user append
 * "/api/slack/events" etc. by hand three times.
 *
 * @param {string} baseUrl - e.g. an ngrok https URL, with or without a trailing slash
 */
function slackRequestUrls(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return {
    events: `${base}/api/slack/events`,
    interactions: `${base}/api/slack/interactions`,
    commands: `${base}/api/slack/commands`,
  };
}

const SLACK_APP_WALKTHROUGH_INTRO = [
  'Open https://api.slack.com/apps → Create New App → From scratch',
  'Turn Socket Mode OFF (left sidebar) — Rumi is HTTP-webhook-based and never opens a Socket Mode connection; leaving it on silently stops events/interactions from ever reaching the bot',
];

module.exports = {
  META_FIELDS,
  META_WALKTHROUGH,
  META_REMAINING_STEPS,
  fieldsFor,
  OPTIONAL_EXTRAS,
  SONIOX_VOICE,
  sonioxVoiceOn,
  SLACK_BOT_SCOPES,
  SLACK_SLASH_COMMANDS,
  SLACK_APP_WALKTHROUGH_INTRO,
  slackRequestUrls,
};
