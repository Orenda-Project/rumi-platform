/**
 * Coaching System Messages — i18n catalog
 *
 * Centralises every system message the coaching pipeline sends to teachers
 * over WhatsApp, so translations can be added per-locale without hunting
 * across the pipeline's service files. The same multi-language shape used
 * elsewhere in the bot (`config/system-messages.js` and `config/branding.js`)
 * applies: ten supported language codes, English-fallback when a locale's
 * translation is absent.
 *
 * Supported language codes (canonical):
 *   en, ur, ar, es, sw, 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK', 'ta-LK'
 *
 * Adding a translation:
 *   1. Find the message key below
 *   2. Replace the `// TODO: translate to <lang>` placeholder with the
 *      localised string. Keep the SAME emoji placement and `${var}`
 *      template positions.
 *   3. Run `node tests/run.js tests/setup/coaching-i18n-catalog.test.js`
 *      — the ratchet asserts every message has all 10 language keys.
 *
 * Adding a new message:
 *   1. Add a new key here with the full 10-language object (the others
 *      can start as English placeholders carrying the same TODO marker).
 *   2. Call `getCoachingMessage('<your.key>', languageCode)` at the
 *      emit site. The ratchet test below catches any
 *      `WhatsAppService.sendMessage(..., '<English literal>')` in
 *      `bot/shared/services/coaching/` so this catalog stays the
 *      single source of truth.
 *
 * Why placeholders are English (not empty):
 *   We never want a missing translation to silently send a blank
 *   message. Falling back to English keeps the feature working until
 *   the translation lands.
 */

const SUPPORTED_LANGUAGES = ['en', 'ur', 'ar', 'es', 'sw', 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK', 'ta-LK'];

// Sentinel — every non-`en` value below starts here as a placeholder.
// Translations replace these in-place; the helper falls back to `en`
// for any value that still equals the sentinel string.
const TODO = '__TODO_TRANSLATE__';

function en(text) {
  return Object.fromEntries(SUPPORTED_LANGUAGES.map((code) => [code, code === 'en' ? text : TODO]));
}

const COACHING_MESSAGES = {
  // Lesson-plan branch: teacher said NO lesson plan
  lessonPlan_skip: en("No problem! I'll analyze your classroom audio without the lesson plan."),
  // Lesson-plan branch: teacher said yes but didn't send the document
  lessonPlan_request: en("Great! Please send your lesson plan as a document (PDF, Word, or image).\n\nTap 📎 → Document to upload it."),
  // Lesson-plan branch: document received, queued for processing
  lessonPlan_received: en("📄 Lesson plan received! I'm processing it in the background and will weave it into your analysis."),
  // Lesson-plan branch: legacy ack
  lessonPlan_included: en("✅ Lesson plan received! I'll include this in my analysis."),
  // Recovery: teacher exited the coaching flow without sending audio
  exitedNoAudio: en("No problem! If you'd like to analyze classroom audio in the future, just send me a recording."),
  // Step 1/5 — transcription kickoff
  step1_transcribing: en("🔄 Step 1/5: Transcribing your classroom audio. This may take 30-60 seconds...hang in there!"),
  // Step 2/5 — pedagogy analysis kickoff (templated; `${step}` resolved by caller via interpolation OR by passing the number 2 when constant)
  step2_analyzing: en("🔄 Step 2/5: Analyzing your teaching using research-based pedagogical frameworks..."),
  // Step 3/5 — reflective conversation kickoff
  step3_reflecting: en("🔄 Step 3/5: Let's reflect on your teaching together..."),
  // Step 4/5 — report generation kickoff
  step4_generatingReport: en("🔄 Step 4/5: Generating your comprehensive observation report with visualizations..."),
  // Step 5/5 — voice debrief generation kickoff
  step5_voiceDebrief: en("🔄 Step 5/5: Creating your personalized voice debrief..."),
  // Final report delivery
  reportReady: en("✅ Your Classroom Observation Report is ready! 📄"),
  // Voice summary delivery prefix
  voiceSummaryReady: en("🎤 Here's your personalized voice summary:"),
  // Reflective conversation graceful close
  reflectionsThanks: en("Thank you for your thoughtful reflections! 🙏"),
  // Retry path: analysis still running when report is requested
  reportInProgress: en("🔄 I'm still processing your classroom analysis. I'll share your report as soon as it's ready."),
  // Voice debrief fallback when generation fails post-PDF
  voiceSummaryFallback: en("Note: Voice summary could not be generated, but your written report is complete! You can review it in the PDF above. 📄"),
  // Long transcript warning (transcription pipeline)
  longLessonDetected: en("⚠️ *Long Lesson Detected*\n\nYour lesson transcript is quite lengthy. The analysis may take a bit longer, but I'll make sure to provide comprehensive feedback!"),
  // Agency follow-up: remind the teacher of their prior commitment.
  // {{action}} is substituted at the call site (kept distinct from
  // ${} JS interpolation so this string can be translated 1:1).
  priorActionReminder: en('💡 *Quick reminder:* Last time, you committed to:\n\n_"{{action}}"_\n\nLet\'s see how it went in this session!'),
};

/**
 * Return the localised message for `key` in `languageCode`. Falls back
 * to English if the key isn't translated for that language (the
 * placeholder sentinel) or the language isn't supported.
 *
 * @param {string} key — one of the keys in COACHING_MESSAGES
 * @param {string} languageCode — e.g. 'en', 'ur', 'sw'
 * @returns {string}
 */
function getCoachingMessage(key, languageCode = 'en') {
  const entry = COACHING_MESSAGES[key];
  if (!entry) {
    throw new Error(`Unknown coaching message key: ${key}`);
  }
  const candidate = entry[languageCode];
  if (candidate && candidate !== TODO) return candidate;
  return entry.en;
}

module.exports = {
  COACHING_MESSAGES,
  SUPPORTED_LANGUAGES,
  TODO,
  getCoachingMessage,
};
