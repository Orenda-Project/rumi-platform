/**
 * features — the toggle board's data.
 *
 * The whole point of this page is to stop conflating three different facts that
 * the word "off" is currently used for:
 *
 *   configured   are the keys present?
 *   switched     has the operator paused it?
 *   effective    is it actually running right now?
 *
 * An operator looking at a feature that is not working needs to know which of
 * those is false, because the fix is completely different in each case. Today
 * every one of them renders as "off".
 *
 * @module console/features
 */

const {
  FEATURES, isFeatureAvailable, isSet, overrides,
} = require('../shared/config/feature-availability');
const { KEY_SOURCES } = require('../scripts/setup/doctor');
const { OPTIONAL_EXTRAS } = require('../scripts/setup/fields');

/**
 * Plain-language consequences. `FEATURES[].name` is written for a diagnostic
 * checklist; this is written for someone deciding whether to touch a switch.
 */
const WHEN_OFF = {
  stt_soniox: 'Voice notes are not transcribed. Teachers who send audio get no reply, and reading assessments cannot run.',
  tts_elevenlabs: 'Rumi answers in text only. Nothing breaks; spoken replies just stop.',
  tts_uplift: 'Urdu, Sindhi and Balochi replies fall back to a general-purpose voice, which reads them less naturally.',
  lesson_plans_gamma: 'Lesson plans are still written, but not turned into slides.',
  pronunciation_azure: 'Reading assessments still score speed and accuracy, but not pronunciation.',
  video_kie: 'The video option disappears from the menu. Everything else is unaffected.',
  exam_ocr: 'Photographed exam papers cannot be marked. Typed and printed worksheets still work.',
  observability_axiom: 'Logs stay in the terminal and the daily file instead of going to Axiom.',
  morning_brief: 'The daily programme-health message stops being sent.',
  channel_slack: 'Teachers can no longer reach Rumi in Slack. WhatsApp is unaffected.',
  channel_discord: 'Teachers can no longer reach Rumi in Discord. WhatsApp is unaffected.',
};

/** Human titles, borrowed from the wizard where it has one. */
function titleFor(feature) {
  const extra = OPTIONAL_EXTRAS.find((e) => e.keys[0] === (feature.keys || feature.keysAny || [])[0]);
  return extra ? extra.title : feature.name;
}

function whyFor(feature) {
  const extra = OPTIONAL_EXTRAS.find((e) => e.keys[0] === (feature.keys || feature.keysAny || [])[0]);
  return extra ? extra.why : (feature.notes || null);
}

/**
 * One row per feature, with the three facts kept apart.
 *
 * @param {object} [env]
 * @returns {{rows: Array, counts: object}}
 */
function snapshot(env = process.env) {
  const rows = FEATURES.map((feature) => {
    const keys = feature.keys || feature.keysAny || [];
    const anyOf = Boolean(feature.keysAny);
    const configured = isFeatureAvailable(feature, env, { ignoreOverrides: true });
    const switchedOn = feature.id ? overrides.isEnabled(feature.id) : true;
    const effective = configured && switchedOn;

    let state = 'on';
    if (!configured) state = 'needs-key';
    else if (!switchedOn) state = 'paused';

    return {
      id: feature.id || null,
      name: feature.name,
      title: titleFor(feature),
      why: whyFor(feature),
      notes: feature.notes || null,
      whenOff: (feature.id && WHEN_OFF[feature.id]) || null,
      keys: keys.map((k) => ({ key: k, set: isSet(env[k]), where: KEY_SOURCES[k] || null })),
      anyOf,
      missing: keys.filter((k) => !isSet(env[k])),
      configured,
      switchedOn,
      effective,
      state,
      // A switch you cannot honour is worse than no switch: with no key there
      // is nothing to pause, and turning it "on" would not make it run.
      switchable: configured,
    };
  });

  return {
    rows,
    counts: {
      total: rows.length,
      on: rows.filter((r) => r.state === 'on').length,
      paused: rows.filter((r) => r.state === 'paused').length,
      needsKey: rows.filter((r) => r.state === 'needs-key').length,
    },
  };
}

/** Look up a feature by its stable id. */
function byId(id) {
  return FEATURES.find((f) => f.id === id) || null;
}

module.exports = { snapshot, byId, WHEN_OFF };
