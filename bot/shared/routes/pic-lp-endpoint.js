/**
 * Pic-to-LP Flow Endpoint
 *
 * Handles WhatsApp Flow data exchange for the single-screen confirmation
 * form (PIC_LP_FORM → SUCCESS). On data_exchange the teacher's
 * grade/subject/topic/language values come back. We:
 *   1. Look up the matching pic_lp_session via flow_token.
 *   2. Hand off to LP generation.
 *   3. Return SUCCESS screen with a "generating now" message.
 *
 * The actual generation runs in the background — Flow returns immediately
 * so the teacher's WhatsApp UI doesn't time out (Meta's data_exchange has a
 * ~10s budget).
 */

const FlowEncryptionService = require('../services/flow-encryption.service');
const PicLpSession = require('../services/pic-to-lp/pic-lp-session.service');
const LpHandoff = require('../services/pic-to-lp/lp-handoff.service');
const {
  buildGrades,
  buildSubjects,
  buildLanguages,
  buildLessonPlanFormats,
  DEFAULT_LP_FORMAT,
} = require('../services/pic-to-lp/flow-options');
const { detectRegion } = require('../utils/region');
const { logToFile } = require('../utils/logger');
const { logEvent } = require('../utils/structured-logger');

const VALID_LANGUAGES = ['en', 'ur', 'sd', 'sw'];
const VALID_LP_FORMATS = ['concise', 'detailed'];

/**
 * INIT — Flow opens. Teacher already has pre-fill from flow_action_payload.data,
 * so we just acknowledge and return the same screen so the form renders.
 */
async function handlePicLpInit(flow_token) {
  logToFile('Pic-LP Flow INIT', { flowToken: flow_token });
  const session = flow_token ? await PicLpSession.getByFlowToken(flow_token) : null;
  if (!session) {
    return FlowEncryptionService.createErrorResponse('Session expired');
  }
  // Pre-fill data is also passed via navigateData when the Flow is sent — this
  // INIT response is mostly a fallback if Meta re-fetches.
  return {
    screen: 'PIC_LP_FORM',
    data: buildPrefillData(session),
  };
}

/**
 * data_exchange — teacher hit "Generate Lesson Plan" on the form.
 */
async function handlePicLpDataExchange(flow_token, screen, screenData = {}) {
  logToFile('Pic-LP Flow data_exchange', {
    flowToken: flow_token,
    screen,
    keys: Object.keys(screenData),
  });

  const session = flow_token ? await PicLpSession.getByFlowToken(flow_token) : null;
  if (!session) {
    return FlowEncryptionService.createErrorResponse('Session expired');
  }

  // Extract + validate form values
  const grade = parseInt(screenData.grade, 10);
  const subject = String(screenData.subject || '').trim();
  const topic = String(screenData.topic || '').trim();
  const language = VALID_LANGUAGES.includes(screenData.language) ? screenData.language : 'en';
  // Teacher-picked LP format ('concise' | 'detailed'). Default to 'concise' for
  // legacy back-compat — a mid-flight session whose Flow JSON was rendered
  // before the format field existed won't include it, and we must still deliver
  // an LP rather than failing validation.
  const rawFormat = String(screenData.lesson_plan_format || '').trim().toLowerCase();
  const lesson_plan_format = VALID_LP_FORMATS.includes(rawFormat) ? rawFormat : DEFAULT_LP_FORMAT;

  if (!grade || grade < 1 || grade > 12 || !subject || !topic) {
    logToFile('⚠️ Pic-LP form validation failed', { grade, subject, topic, language });
    return FlowEncryptionService.createErrorResponse('Please complete all fields');
  }

  const formData = { grade, subject, topic, language, lesson_plan_format };

  // Look up phone number for delivery — pic_lp_sessions is keyed by user_id;
  // we need to fetch the user's phone separately.
  const supabase = require('../config/supabase');
  const { data: userRow } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', session.user_id)
    .maybeSingle();
  const from = userRow?.phone_number;

  if (!from) {
    logToFile('❌ Pic-LP: no phone for user', { userId: session.user_id });
    return FlowEncryptionService.createErrorResponse('User lookup failed');
  }

  logEvent('pic_lp.form_submitted', {
    sessionId: session.id,
    grade,
    subject,
    topic: topic.substring(0, 60),
    language,
    lesson_plan_format,
  });

  // Fire-and-forget — generation takes 30-90s, way over Meta's data_exchange window.
  setImmediate(() => {
    LpHandoff.generateAndDeliver({ session, formData, from }).catch((err) => {
      logToFile('❌ Pic-LP background handoff threw', { error: err.message, sessionId: session.id });
    });
  });

  // Return SUCCESS terminal screen
  return {
    screen: 'SUCCESS',
    data: {
      message: language === 'ur'
        ? 'لیسن پلان بنایا جا رہا ہے — 1-2 منٹ میں آپ کے چیٹ میں آ جائے گا۔'
        : "Generating your lesson plan — it'll arrive in this chat in 1-2 minutes.",
    },
  };
}

/**
 * BACK is a no-op for a single-screen flow but Meta may still send it.
 */
async function handlePicLpBack(flow_token /*, screen */) {
  const session = flow_token ? await PicLpSession.getByFlowToken(flow_token) : null;
  if (!session) {
    return FlowEncryptionService.createErrorResponse('Session expired');
  }
  return {
    screen: 'PIC_LP_FORM',
    data: buildPrefillData(session),
  };
}

function buildPrefillData(session) {
  const detected = session?.detected || {};
  const pages = Array.isArray(session?.pages) ? session.pages : [];
  return {
    grades: buildGrades(),
    // Same source-of-truth as completion-handler
    subjects: buildSubjects(detectRegion()),
    languages: buildLanguages(),
    // format options + default for the radio toggle
    lesson_plan_formats: buildLessonPlanFormats(),
    default_lp_format: DEFAULT_LP_FORMAT,
    detected_grade: detected.grade != null ? String(detected.grade) : '',
    detected_subject: detected.subject || '',
    detected_topic: detected.topic || '',
    // Caption-derived language pre-fill (Flow re-fetch fallback path).
    ui_language: detected.language || 'en',
    page_count: String(pages.length),
    session_id: session.id,
  };
}

module.exports = {
  handlePicLpInit,
  handlePicLpDataExchange,
  handlePicLpBack,
};
