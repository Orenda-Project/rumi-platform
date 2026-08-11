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
    why: 'Teachers talk more than they type. With this, Rumi transcribes voice notes in English, Urdu, Arabic and Spanish — and it is what reading assessments run on.',
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
  {
    keys: ['MISTRAL_API_KEY'],
    title: 'Read handwriting on exam papers',
    why: 'Lets Rumi mark a photographed exam paper, not just a printed worksheet.',
    where: 'console.mistral.ai → API Keys',
    secret: true,
  },
];

module.exports = {
  META_FIELDS, META_WALKTHROUGH, META_REMAINING_STEPS, fieldsFor, OPTIONAL_EXTRAS,
};
