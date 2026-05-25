/**
 * Pic-LP Completion Handler
 *
 * Called when page collection ends (Done button, max-pages, or 2-min timeout).
 * Runs metadata extraction over the collected pages, then sends the WhatsApp
 * Flow form to the teacher for grade/subject/topic/language confirmation.
 */

const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const { PIC_LP_FLOW_ID } = require('../../utils/constants');
const PicLpSession = require('./pic-lp-session.service');
const MetadataExtractor = require('./metadata-extractor.service');
const {
  buildGrades,
  buildSubjects,
  buildLanguages,
  buildLessonPlanFormats,
  DEFAULT_LP_FORMAT,
} = require('./flow-options');
const { detectRegion } = require('../../utils/region');

const FORM_FLOW_TOKEN_PREFIX = 'pic_lp_form_';

/**
 * @param {object} args
 * @param {object} args.session  pic_lp_sessions row
 * @param {string} args.from     WhatsApp phone
 * @param {string} args.language UI language ('en'|'ur'|...)
 * @param {string} args.trigger  'done_clicked' | 'max_reached' | 'timeout'
 */
async function extractAndPromptForm({ session, from, language, trigger }) {
  const isUrdu = language === 'ur';

  await WhatsAppService.sendMessage(
    from,
    isUrdu
      ? '🔍 صفحات کا جائزہ لیا جا رہا ہے...'
      : '🔍 Reading the pages you sent...'
  );

  // Step 1: extract metadata.
  // Fetch the teacher's registered grade + preferred language so the extractor
  // can fall back to them when the vision pass returns null. Without this, a
  // clean OCR that still returns grade=null + language=null leaves the form
  // with empty required fields and the teacher may abandon.
  const supabase = require('../../config/supabase');
  const { data: userRow } = await supabase
    .from('users')
    .select('grade, preferred_language')
    .eq('id', session.user_id)
    .maybeSingle();
  const userContext = {
    registeredGrade: userRow?.grade || null,
    preferredLanguage: userRow?.preferred_language || language || null,
  };

  const detected = await MetadataExtractor.extract(session.pages || [], session.caption || '', userContext);
  await PicLpSession.updateDetected(session.id, detected);

  logEvent('pic_lp.metadata_extracted', {
    sessionId: session.id,
    pageCount: (session.pages || []).length,
    hasGrade: detected.grade != null,
    hasSubject: detected.subject != null,
    hasTopic: detected.topic != null,
    ocrTextLength: (detected.ocr_text || '').length,
    trigger,
  });

  // Step 2: bail if Flow ID not configured (shouldn't happen after registration)
  if (!PIC_LP_FLOW_ID) {
    logToFile('⚠️ PIC_LP_FLOW_ID not set — falling back to text confirmation', { sessionId: session.id });
    await sendFallbackTextConfirmation({ session, from, language, detected });
    return;
  }

  // Step 3: send the Flow form pre-filled with whatever we extracted
  const flowToken = `${FORM_FLOW_TOKEN_PREFIX}${session.id}`;
  await PicLpSession.attachFlowToken(session.id, flowToken);

  // Dropdown source arrays MUST be sent at runtime — Flow JSON's `__example__`
  // blocks are only used by Meta for design-time preview, not for rendering.
  // Without these all three dropdowns render empty and the form fails validation.
  const region = detectRegion();
  const navigateData = {
    grades: buildGrades(),
    subjects: buildSubjects(region),
    languages: buildLanguages(),
    // format toggle data + default selection
    lesson_plan_formats: buildLessonPlanFormats(),
    default_lp_format: DEFAULT_LP_FORMAT,
    detected_grade: detected.grade != null ? String(detected.grade) : '',
    detected_subject: detected.subject || '',
    detected_topic: detected.topic || '',
    // Caption-derived language wins over the user's preferred-language default.
    // If a teacher writes "lesson plan in Sindhi" in the caption, the dropdown
    // opens with Sindhi pre-selected.
    ui_language: detected.language || language || 'en',
    page_count: String((session.pages || []).length),
    session_id: session.id,
  };

  const sent = await WhatsAppService.sendFlow(from, {
    flowId: PIC_LP_FLOW_ID,
    header: isUrdu ? 'لیسن پلان کی تفصیلات' : 'Lesson Plan Details',
    body: isUrdu
      ? 'تفصیلات کنفرم کریں اور لیسن پلان بنائیں۔'
      : 'Confirm the details below and we will generate your lesson plan.',
    buttonText: isUrdu ? 'تفصیلات' : 'Confirm Details',
    screen: 'PIC_LP_FORM',
    flowToken,
    navigateData,
  });

  if (!sent) {
    await sendFallbackTextConfirmation({ session, from, language, detected });
  }
}

/**
 * Fallback when the Flow can't be sent (no Flow ID configured, Meta error).
 * We don't want the teacher stranded with no path forward.
 */
async function sendFallbackTextConfirmation({ session, from, language, detected }) {
  const isUrdu = language === 'ur';
  const lines = [
    isUrdu ? '📋 آپ کی معلومات:' : '📋 Detected from your pages:',
    detected.grade != null
      ? (isUrdu ? `• درجہ: ${detected.grade}` : `• Grade: ${detected.grade}`)
      : (isUrdu ? '• درجہ: ?' : '• Grade: ?'),
    detected.subject
      ? (isUrdu ? `• مضمون: ${detected.subject}` : `• Subject: ${detected.subject}`)
      : (isUrdu ? '• مضمون: ?' : '• Subject: ?'),
    detected.topic
      ? (isUrdu ? `• موضوع: ${detected.topic}` : `• Topic: ${detected.topic}`)
      : (isUrdu ? '• موضوع: ?' : '• Topic: ?'),
    '',
    isUrdu
      ? 'فی الحال فارم دستیاب نہیں۔ ہماری ٹیم کو اطلاع دے دی گئی ہے۔'
      : "The confirmation form isn't available right now. The team has been notified.",
  ];
  await WhatsAppService.sendMessage(from, lines.join('\n'));
  logToFile('⚠️ Pic-LP fallback text confirmation sent', { sessionId: session.id });
}

module.exports = {
  extractAndPromptForm,
  FORM_FLOW_TOKEN_PREFIX,
};
