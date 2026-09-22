/**
 * env-catalog — turns a 726-line `.env` into something a person can read.
 *
 * Nothing here invents copy. Every label, every "why would I want this", every
 * "where do I get it" already exists in the codebase, written carefully, and
 * used by the `rumi setup` wizard:
 *
 *   bot/scripts/setup/fields.js   OPTIONAL_EXTRAS (title / why / where), META_FIELDS
 *   bot/scripts/setup/doctor.js   KEY_SOURCES (21 vars -> where to get it)
 *   bot/shared/config/feature-availability.js  which keys gate which feature
 *
 * This module joins them into ordered groups and hands the result to a view. If
 * the wizard's wording improves, the console's wording improves with it — which
 * is the whole reason not to copy the strings.
 *
 * Ordering is deliberate and matches the wizard: what stops the bot booting
 * first, then what a teacher would notice missing, then plumbing. Someone who
 * stops reading halfway has still seen the parts that matter.
 *
 * @module console/env-catalog
 */

const {
  REQUIRED_VARS,
  CHANNEL_REQUIRED_VARS,
  ADDITIVE_CHANNEL_REQUIRED_VARS,
  FEATURES,
  isSet,
  resolveChannelDriver,
} = require('../shared/config/feature-availability');
const { KEY_SOURCES } = require('../scripts/setup/doctor');
const { META_FIELDS, OPTIONAL_EXTRAS } = require('../scripts/setup/fields');
const { describeVar } = require('./redaction');

/**
 * Human labels for the core credentials. The wizard asks for these
 * conversationally rather than by variable name, and so does the console — a
 * person setting Rumi up should never have to know that "the database address"
 * is spelled SUPABASE_URL.
 */
const CORE_LABELS = {
  SUPABASE_URL: {
    label: 'Database address',
    hint: 'Your Supabase project URL. Settings → API → Project URL.',
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    label: 'Database key',
    hint: 'The service_role secret, NOT the anon key. They look identical — both start `eyJ` — but the anon key cannot see past row-level security, so Rumi would start fine and then behave as if the database were empty.',
  },
  OPENROUTER_API_KEY: {
    label: 'AI key',
    hint: 'One key, many models. Every text Rumi writes goes through this.',
  },
  REDIS_URL: {
    label: 'Redis address',
    hint: 'Holds conversation state and the job queue. Upstash and Railway both give you one free.',
  },
};

/** Groups, in the order they are shown. `keys` is resolved at build time. */
const GROUP_ORDER = [
  {
    id: 'core',
    title: 'Required to run',
    blurb: 'Rumi will not start without these four.',
  },
  {
    id: 'channel',
    title: 'WhatsApp',
    blurb: 'How teachers reach Rumi.',
  },
  {
    id: 'voice',
    title: 'Voice',
    blurb: 'Understanding voice notes, and answering out loud.',
  },
  {
    id: 'documents',
    title: 'Documents and marking',
    blurb: 'Reading photographed worksheets, building slides and videos.',
  },
  {
    id: 'channels',
    title: 'Extra channels',
    blurb: 'Run alongside WhatsApp, not instead of it.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    blurb: 'Storage, observability, and the job queue. Safe to ignore.',
  },
];

/** Which group each optional extra belongs in, by its first key. */
const EXTRA_GROUP = {
  SONIOX_API_KEY: 'voice',
  ELEVENLABS_API_KEY: 'voice',
  UPLIFT_API_KEY: 'voice',
  AZURE_SPEECH_KEY: 'voice',
  MISTRAL_API_KEY: 'documents',
  GAMMA_API_KEY: 'documents',
  KIE_API_KEY: 'documents',
  SLACK_BOT_TOKEN: 'channels',
  DISCORD_BOT_TOKEN: 'channels',
  AXIOM_TOKEN: 'advanced',
};

/**
 * Extra abilities the wizard's OPTIONAL_EXTRAS list doesn't cover, described in
 * the same voice. Kept here rather than pushed into fields.js because the
 * wizard deliberately asks about only the five that most change day-to-day use.
 */
const EXTRA_ABILITIES = [
  {
    keys: ['UPLIFT_API_KEY'],
    title: 'Urdu and regional voices',
    why: 'Better spoken Urdu, Sindhi and Balochi than the general-purpose voices manage.',
    where: 'platform.upliftai.org',
  },
  {
    keys: ['KIE_API_KEY'],
    title: 'Make teaching videos',
    why: 'Turns a lesson into a short narrated video a class can watch. Also needs the video switch turned on.',
    where: 'kie.ai → API Key',
  },
  {
    keys: ['AXIOM_DATASET', 'AXIOM_TOKEN'],
    title: 'Keep logs somewhere searchable',
    why: 'Sends Rumi’s logs to Axiom so you can search them later instead of scrolling a terminal.',
    where: 'axiom.co → Datasets, then Settings → API tokens',
  },
];

/**
 * Which feature (if any) a key switches on, so a row can say what turning it on
 * would buy you. Built from FEATURES rather than hand-listed.
 *
 * @returns {Map<string, {name: string, keys: string[]}>}
 */
function featureByKey() {
  const map = new Map();
  for (const feature of FEATURES) {
    const keys = feature.keys || feature.keysAny || [];
    for (const key of keys) map.set(key, { name: feature.name, keys });
  }
  return map;
}

/**
 * Build one displayable row for an env var.
 *
 * @param {string} key
 * @param {object} env
 * @param {object} meta label / hint / where / required
 */
function buildRow(key, env, meta = {}) {
  const described = describeVar(key, env[key], { isSet });
  return {
    ...described,
    label: meta.label || key,
    hint: meta.hint || null,
    where: meta.where || KEY_SOURCES[key] || null,
    required: Boolean(meta.required),
    feature: meta.feature || null,
  };
}

/**
 * The whole catalogue: ordered groups of described, redacted rows.
 *
 * @param {object} [env] defaults to process.env; pass a parsed `.env` to
 *   describe the FILE rather than the running process (they differ whenever a
 *   change has been saved but not applied, which is exactly what we need to show)
 * @returns {{groups: Array, channel: string, counts: object}}
 */
function buildCatalog(env = process.env) {
  const byKey = featureByKey();
  const channel = resolveChannelDriver(env);
  const groups = new Map(GROUP_ORDER.map((g) => [g.id, { ...g, rows: [], abilities: [] }]));

  // 1. The four that block boot.
  for (const key of REQUIRED_VARS) {
    groups.get('core').rows.push(buildRow(key, env, { ...CORE_LABELS[key], required: true }));
  }

  // 2. The messaging channel — only Meta needs credentials; a sandbox
  //    deployment needs none, which is the point of sandbox.
  const channelVars = CHANNEL_REQUIRED_VARS[channel] || [];
  const metaByEnv = new Map(META_FIELDS.map((f) => [f.env, f]));
  for (const key of channelVars) {
    const field = metaByEnv.get(key) || {};
    groups.get('channel').rows.push(buildRow(key, env, {
      label: field.label, hint: field.hint, required: true,
    }));
  }

  // 3. Optional abilities, described by what a teacher would notice.
  const abilities = [...OPTIONAL_EXTRAS, ...EXTRA_ABILITIES];
  const seen = new Set();
  for (const ability of abilities) {
    const groupId = EXTRA_GROUP[ability.keys[0]] || 'advanced';
    const group = groups.get(groupId);
    if (!group) continue;
    const rows = ability.keys.map((key) => {
      seen.add(key);
      return buildRow(key, env, {
        where: ability.where,
        feature: byKey.get(key) ? byKey.get(key).name : null,
      });
    });
    group.abilities.push({
      title: ability.title,
      why: ability.why,
      where: ability.where,
      keys: ability.keys,
      rows,
      // Every key present = the ability is switched on. Matches the AND
      // semantics of FEATURES.keys, which is what actually gates it.
      on: rows.every((r) => r.set),
      partial: rows.some((r) => r.set) && !rows.every((r) => r.set),
    });
  }

  // 4. Additive channels get their own cards — they are whole second channels
  //    with app-side setup, not a single key that flips a switch.
  for (const [name, keys] of Object.entries(ADDITIVE_CHANNEL_REQUIRED_VARS)) {
    if (keys.some((k) => seen.has(k))) continue;
    const rows = keys.map((key) => {
      seen.add(key);
      return buildRow(key, env, { feature: byKey.get(key) ? byKey.get(key).name : null });
    });
    groups.get('channels').abilities.push({
      title: name === 'slack' ? 'Slack' : 'Discord',
      why: `Teachers can talk to Rumi in ${name === 'slack' ? 'Slack' : 'Discord'} as well as WhatsApp.`,
      where: name === 'slack' ? 'api.slack.com/apps' : 'discord.com/developers/applications',
      keys,
      rows,
      on: rows.every((r) => r.set),
      partial: rows.some((r) => r.set) && !rows.every((r) => r.set),
      guide: name,
    });
  }

  const all = [...groups.values()].flatMap((g) => [...g.rows, ...g.abilities.flatMap((a) => a.rows)]);
  const counts = {
    requiredTotal: REQUIRED_VARS.length + channelVars.length,
    requiredSet: [...REQUIRED_VARS, ...channelVars].filter((k) => isSet(env[k])).length,
    abilitiesTotal: [...groups.values()].reduce((n, g) => n + g.abilities.length, 0),
    abilitiesOn: [...groups.values()].reduce((n, g) => n + g.abilities.filter((a) => a.on).length, 0),
    described: all.length,
  };

  return { groups: [...groups.values()], channel, counts };
}

/**
 * Every key the catalogue knows how to describe — used to reject a write to
 * something we have no UI for, rather than letting the console become a
 * general-purpose file editor.
 *
 * @returns {Set<string>}
 */
function knownKeys() {
  const { groups } = buildCatalog({});
  const keys = new Set();
  for (const group of groups) {
    for (const row of group.rows) keys.add(row.key);
    for (const ability of group.abilities) for (const row of ability.rows) keys.add(row.key);
  }
  // Model and voice settings are edited on the Pipeline page, not Setup, but
  // they are still legitimate writes.
  for (const key of [
    'LLM_MODEL', 'VISION_MODEL', 'PIC_LP_CLASSIFIER_MODEL', 'PIC_LP_EXTRACTOR_MODEL',
    'ELEVENLABS_VOICE_ID', 'VIDEO_GENERATION_ENABLED', 'LOG_LEVEL',
  ]) keys.add(key);
  return keys;
}

module.exports = { buildCatalog, knownKeys, GROUP_ORDER, CORE_LABELS };
