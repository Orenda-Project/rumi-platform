/**
 * Reading Assessment endpoint — a from-scratch {init, exchange} file, unlike
 * every other endpoint in this codebase. The Meta Flow
 * (docs/flows/reading-assessment-flow-v2.json) is purely NAVIGATE-style —
 * client-side screen transitions with a single completion NFM carrying every
 * field at once, no server round-trip between BASIC_INFO and OPTIONS — so
 * flow-response.handler.js's handleReadingAssessmentFlow() still does its
 * own Meta-specific field-name parsing (v1 vs v2 field name formats, from
 * the nfm_reply response_json) before calling this file's startAssessment()
 * — the actual assessment-record creation and passage generation, extracted
 * here so Discord's onFinish hook (in discord-flow-registry.js) can trigger
 * the exact same pipeline once its own modal-workaround screens complete,
 * without duplicating this logic a second time.
 *
 * No `back` is needed — the source Flow has no back-navigation at all (confirmed
 * against reading-assessment-flow-v2.json: OPTIONS is `"terminal": true` with no
 * back action), so this endpoint doesn't export one either.
 *
 * A Slack renderer is NOT built for this endpoint yet (explicitly deferred per
 * the integration plan) — this contract is renderer-agnostic like every other
 * endpoint, so adding slack-views/reading-assessment.view.js + a registry entry
 * later is a pure additive follow-up, not a redesign.
 */

const LANGUAGE_OPTIONS = [
  { id: '0_English', title: 'English' },
  { id: '1_Urdu', title: 'Urdu / اردو' },
];

const ASSESSMENT_MODE_OPTIONS = [
  { id: '0_Auto', title: 'Auto-Level (finds level)' },
  { id: '1_Manual', title: 'Manual (select level)' },
];

const READING_LEVEL_OPTIONS = [
  { id: '0_Letters_(KG)', title: 'Letters (KG)' },
  { id: '1_Words_(Grade_1)', title: 'Words (Grade 1)' },
  { id: '2_Sentences_(Grade_1-2)', title: 'Sentences (1-2)' },
  { id: '3_Paragraph_(Grade_3-5)', title: 'Paragraph (3-5)' },
];

const SCOPE_OPTIONS = [
  { id: '0_Fluency_Only', title: 'Fluency Only' },
  { id: '1_Fluency_+_Comprehension', title: 'Fluency + Comprehension' },
];

// levelIndex ('0'-'3', parsed off an id like "2_Sentences_(Grade_1-2)")
// -> passage config. Extracted from flow-response.handler.js's inline
// levelMapping object literal (previously duplicated nowhere else). STRING
// keys deliberately, not numeric — Number('') === 0 would otherwise make an
// empty/missing levelIndex silently match key "0" (letters) instead of
// falling through to the "unrecognized" default below.
const LEVEL_MAPPING = {
  '0': { passageType: 'letters', gradeNumeric: 0 },
  '1': { passageType: 'words', gradeNumeric: 1 },
  '2': { passageType: 'sentences', gradeNumeric: 2 },
  '3': { passageType: 'paragraph', gradeNumeric: 3 },
};

// passageType -> word count. Extracted from flow-response.handler.js's
// inline wordCountMap object literal.
const WORD_COUNT_MAP = {
  letters: 14,
  words: 14,
  sentences: 40,
  paragraph: 60,
  story: 100,
};

/**
 * Maps a reading-level selection to {passageType, gradeNumeric}. Auto mode
 * always starts at the highest-complexity "story" level regardless of
 * levelIndex — manual mode uses the teacher's own selection.
 * @param {string|number} levelIndex - '0'-'3' (or a number), from the
 *   Select_the_reading_level dropdown's numeric prefix
 * @param {boolean} isAutoMode
 * @returns {{passageType: string, gradeNumeric: number}}
 */
function mapLevelToPassage(levelIndex, isAutoMode) {
  if (isAutoMode) {
    return { passageType: 'story', gradeNumeric: 4 };
  }
  return LEVEL_MAPPING[String(levelIndex)] || { passageType: 'paragraph', gradeNumeric: 2 };
}

/** Maps a passage type to its target word count, matching the existing gradeMap convention. */
function wordCountFor(passageType) {
  return WORD_COUNT_MAP[passageType] || 50;
}

function screen1Data() {
  return { languages: LANGUAGE_OPTIONS, assessment_modes: ASSESSMENT_MODE_OPTIONS };
}

function screen2Data() {
  return { levels: READING_LEVEL_OPTIONS, scopes: SCOPE_OPTIONS };
}

/** INIT — BASIC_INFO screen: student name (text), language + assessment mode (enums). */
async function handleReadingAssessmentInit() {
  return { screen: 'BASIC_INFO', data: screen1Data() };
}

/**
 * data_exchange — BASIC_INFO submits to OPTIONS (manual mode only; auto mode
 * has nothing left to ask and completes immediately, matching the Meta Flow's
 * own client-side skip — the OPTIONS screen exists purely for the
 * level/scope dropdowns manual mode needs). exchange() itself does NOT create
 * the assessment record or generate a passage — see this file's header
 * comment for why that stays flow-response.handler.js's job.
 */
async function handleReadingAssessmentDataExchange(userId, screen, screenData) {
  if (screen === 'BASIC_INFO') {
    const studentName = (screenData.student_full_name || screenData.Student_Full_Name || '').trim();
    if (!studentName) {
      return { data: { error: { message: 'Student name is required' } } };
    }
    const isAutoMode = String(screenData.assessment_mode || screenData.Assessment_Mode || '').includes('Auto');
    if (isAutoMode) {
      return { screen: 'SUCCESS', data: { ...screenData } };
    }
    return { screen: 'OPTIONS', data: { ...screenData, ...screen2Data() } };
  }

  if (screen === 'OPTIONS') {
    return { screen: 'SUCCESS', data: { ...screenData } };
  }

  return { data: { error: { message: 'Unknown screen' } } };
}

/**
 * Creates the assessment record and kicks off passage generation/delivery —
 * the actual side-effecting work behind the SUCCESS screen, extracted from
 * flow-response.handler.js's handleReadingAssessmentFlow() so both the Meta
 * (WhatsApp/Baileys) NFM path and Discord's onFinish hook can trigger the
 * exact same pipeline from already-parsed fields, instead of each
 * channel re-implementing (or duplicating) this logic.
 * @param {string} userId
 * @param {string} recipientIdentifier - phone number, or a prefixed "discord:<id>" identifier
 * @param {object} fields
 * @param {string} fields.studentName
 * @param {'en'|'ur'} fields.language
 * @param {boolean} fields.isAutoMode
 * @param {string|number} [fields.levelIndex] - required for manual mode
 * @param {boolean} [fields.comprehensionRequired]
 * @returns {Promise<{assessmentId: string}>}
 */
async function startAssessment(userId, recipientIdentifier, fields) {
  const { studentName, language, isAutoMode, levelIndex, comprehensionRequired } = fields;
  const supabase = require('../config/supabase');
  const PassageGenerationService = require('../services/reading/passage-generation.service');
  const AutoLevelOrchestratorService = require('../services/reading/auto-level-orchestrator.service');
  const { logToFile } = require('../utils/logger');

  const { passageType, gradeNumeric } = mapLevelToPassage(levelIndex, isAutoMode);
  const wordCount = wordCountFor(passageType);
  const passageConfig = { type: passageType, wordCount, grade: gradeNumeric };

  const { data: assessment, error: insertError } = await supabase
    .from('reading_assessments')
    .insert({
      user_id: userId,
      student_identifier: studentName,
      grade_level: gradeNumeric,
      language,
      passage_type: passageType,
      passage_word_count: wordCount,
      passage_text: '', // filled in by generateAndSendPassage
      comprehension_requested: Boolean(comprehensionRequired),
      assessment_mode: isAutoMode ? 'auto' : 'manual',
      starting_level: isAutoMode ? 'story' : passageType,
      status: 'initiated',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    logToFile('❌ Error creating assessment record', { error: insertError.message });
    throw insertError;
  }

  if (isAutoMode) {
    const autoConfig = await AutoLevelOrchestratorService.startAutoAssessment(
      assessment.id, userId, recipientIdentifier, language, gradeNumeric, language,
    );
    await PassageGenerationService.generateAndSendPassage(
      assessment.id, userId, recipientIdentifier, language,
      { type: autoConfig.passageType, wordCount: autoConfig.wordCount, grade: autoConfig.gradeLevel },
      language,
    );
  } else {
    await PassageGenerationService.generateAndSendPassage(
      assessment.id, userId, recipientIdentifier, language, passageConfig, language,
    );
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ current_state: 'AWAITING_READING_AUDIO' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (updateError) {
    logToFile('⚠️ Warning: Could not update conversation state', { error: updateError.message });
  }

  return { assessmentId: assessment.id };
}

module.exports = {
  handleReadingAssessmentInit,
  handleReadingAssessmentDataExchange,
  startAssessment,
  mapLevelToPassage,
  wordCountFor,
  LANGUAGE_OPTIONS,
  ASSESSMENT_MODE_OPTIONS,
  READING_LEVEL_OPTIONS,
  SCOPE_OPTIONS,
};
