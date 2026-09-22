/**
 * pipeline-map — the three layers, described from the code that actually runs.
 *
 * Speech-to-text, intelligence and text-to-speech each have several providers,
 * a fallback chain, and per-language routing — all of it in tables inside files
 * an operator will never open. This module reads those same tables and hands
 * them to a page, so the console describes what the bot does rather than what
 * someone once wrote in a doc.
 *
 * Everything here is derived. If `audio.service.js` gains a language or
 * `constants.js` changes a voice, this page changes with it.
 *
 * @module console/pipeline-map
 */

const { isSet } = require('../shared/config/feature-availability');

/**
 * Speech-to-text: the real fallback chain and the language routing.
 *
 * The chain is not configurable — it is the order of `try` blocks in
 * `AudioService.transcribe`. Showing it is still worth doing, because "why did
 * my Urdu voice note come back in English" is answered by knowing which engine
 * took it.
 *
 * @param {object} env
 */
function listening(env) {
  // Required lazily: audio.service pulls in ffmpeg binaries and the OpenAI SDK,
  // which a standalone console must not pay for (or fail on).
  let soniox = [];
  let mms = {};
  try {
    const audio = require('../shared/services/audio.service');
    soniox = audio.SONIOX_LANGUAGES || [];
    mms = audio.MMS_LANGUAGES || {};
  } catch { /* the page degrades to the chain without the language tables */ }

  return {
    chain: [
      {
        step: 1,
        provider: 'Soniox',
        model: 'stt-async-v3',
        note: 'With speaker separation. Handles English, Urdu, Arabic, Spanish, Punjabi, Tamil, French and the Indian languages.',
        on: isSet(env.SONIOX_API_KEY),
        key: 'SONIOX_API_KEY',
      },
      {
        step: 2,
        provider: 'Soniox',
        model: 'stt-async-v2',
        note: 'Same service without speaker separation. Tried when v3 fails.',
        on: isSet(env.SONIOX_API_KEY),
        key: 'SONIOX_API_KEY',
      },
      {
        step: 3,
        provider: 'OpenAI',
        model: 'whisper-1',
        note: 'The last resort, so a voice note is never simply lost.',
        on: isSet(env.OPENAI_API_KEY),
        key: 'OPENAI_API_KEY',
      },
    ],
    regional: {
      provider: 'MMS-ASR (self-hosted)',
      on: isSet(env.MMS_SERVICE_URL),
      key: 'MMS_SERVICE_URL',
      note: 'Balochi, Sindhi and Pashto — languages Soniox does not support. Runs on your own Modal deployment.',
      languages: mms,
    },
    sonioxLanguages: soniox,
    pronunciation: {
      provider: 'Azure Speech',
      on: isSet(env.AZURE_SPEECH_KEY) && isSet(env.AZURE_SPEECH_REGION),
      keys: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'],
      note: 'Adds per-word pronunciation marks to reading assessments, on top of speed and accuracy.',
    },
  };
}

/**
 * The four model settings that are genuinely env-driven, plus an honest note
 * about the ones that are not.
 *
 * Roughly fifty-six other call sites name their model inline. Rather than ship
 * a hand-written inventory that goes stale the first time someone edits a
 * service, the page shows models *observed running* from the event ring — which
 * is both self-maintaining and a more useful answer.
 *
 * @param {object} env
 */
function thinking(env) {
  const provider = (env.LLM_PROVIDER || 'openrouter').toLowerCase();
  return {
    provider,
    baseUrl: provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1',
    keyVar: provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY',
    on: isSet(provider === 'openrouter' ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY),
    settings: [
      {
        key: 'LLM_MODEL',
        label: 'Default model',
        value: env.LLM_MODEL || '',
        fallback: 'openai/gpt-4o',
        note: 'Used wherever a service does not name its own model.',
      },
      {
        key: 'VISION_MODEL',
        label: 'Reading photos',
        value: env.VISION_MODEL || '',
        fallback: 'gpt-4.1-mini',
        note: 'Looks at photographed worksheets and classroom pictures.',
      },
      {
        key: 'PIC_LP_CLASSIFIER_MODEL',
        label: 'Photo → lesson plan: sorting',
        value: env.PIC_LP_CLASSIFIER_MODEL || '',
        fallback: 'gpt-4o-mini',
        note: 'Decides what a photographed page actually is.',
      },
      {
        key: 'PIC_LP_EXTRACTOR_MODEL',
        label: 'Photo → lesson plan: reading',
        value: env.PIC_LP_EXTRACTOR_MODEL || '',
        fallback: 'gpt-4o-mini',
        note: 'Pulls the topic and objectives off the page.',
      },
    ],
  };
}

/**
 * Text-to-speech: the routing table the router actually reads, plus the
 * fallback that is invisible today.
 *
 * `constants.VOICE_MODELS` is what `generateSpeechForLanguage` consults.
 * `config/tts-voices.js` holds a second, richer table that disagrees with it in
 * at least one place. Rather than pick a winner in a doc, the page computes the
 * disagreement and names the file that wins at runtime.
 *
 * @param {object} env
 */
function speaking(env) {
  let voiceModels = {};
  let ttsVoices = {};
  try { voiceModels = require('../shared/utils/constants').VOICE_MODELS || {}; } catch { /* optional */ }
  try { ttsVoices = require('../shared/config/tts-voices').TTS_VOICES || {}; } catch { /* optional */ }

  const languages = Object.entries(voiceModels).map(([lang, cfg]) => ({
    language: lang,
    provider: cfg.provider,
    voiceId: cfg.voiceId || null,
    tier: cfg.tier,
    supportsEmotionTags: Boolean(cfg.supportsEmotionTags),
    configured: cfg.provider === 'elevenlabs'
      ? isSet(env.ELEVENLABS_API_KEY)
      : cfg.provider === 'uplift' ? isSet(env.UPLIFT_API_KEY) : false,
  })).sort((a, b) => (a.tier || 9) - (b.tier || 9) || a.language.localeCompare(b.language));

  // A disagreement between the two tables is a real bug class: the operator
  // configures a voice in the file that does not win, and hears the other one.
  const drift = [];
  for (const [lang, cfg] of Object.entries(voiceModels)) {
    const other = ttsVoices[lang];
    if (other && other.provider && other.provider !== cfg.provider) {
      drift.push({
        language: lang,
        effective: cfg.provider,
        alsoDeclared: other.provider,
        winner: 'bot/shared/utils/constants.js',
        loser: 'bot/shared/config/tts-voices.js',
      });
    }
  }

  return {
    providers: [
      { name: 'ElevenLabs', on: isSet(env.ELEVENLABS_API_KEY), key: 'ELEVENLABS_API_KEY', model: 'eleven_v3' },
      { name: 'Uplift AI', on: isSet(env.UPLIFT_API_KEY), key: 'UPLIFT_API_KEY', note: 'Urdu, Sindhi, Balochi' },
      { name: 'OpenAI', on: isSet(env.OPENAI_API_KEY), key: 'OPENAI_API_KEY', model: 'tts-1', fallback: true },
    ],
    languages,
    drift,
  };
}

/**
 * Models seen running, from the event ring. Self-maintaining, and the honest
 * answer to "what actually handles what" for the call sites that hardcode.
 */
function observedModels() {
  try {
    const ring = require('../shared/observability/event-ring');
    const seen = new Map();
    for (const entry of ring.query({ limit: 2000 })) {
      const model = entry.fields && entry.fields.model;
      if (!model) continue;
      const featureKey = `${entry.feature || 'unknown'}::${model}`;
      const row = seen.get(featureKey) || { feature: entry.feature || 'unknown', model, calls: 0, tokens: 0 };
      row.calls += 1;
      row.tokens += Number(entry.fields.totalTokens || 0)
        || Number(entry.fields.promptTokens || 0) + Number(entry.fields.completionTokens || 0);
      seen.set(featureKey, row);
    }
    return [...seen.values()].sort((a, b) => b.calls - a.calls);
  } catch {
    return [];
  }
}

/** The whole picture. */
function buildPipeline(env = process.env) {
  return {
    listening: listening(env),
    thinking: thinking(env),
    speaking: speaking(env),
    observed: observedModels(),
  };
}

module.exports = { buildPipeline, listening, thinking, speaking, observedModels };
