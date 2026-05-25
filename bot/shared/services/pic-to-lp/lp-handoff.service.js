/**
 * LP Handoff
 *
 * After the teacher submits the WhatsApp Flow form, this service:
 *   1. Builds the LP prompt via LessonPlanPromptsService.buildChapterPrompt,
 *      passing the full vision-extracted ocr_text as the textbook `content`.
 *   2. Calls Gamma directly via gamma-client.service (NOT through the
 *      pre-gen lesson-plan handler, which would ignore the teacher's photo and
 *      serve a stock PDF).
 *   3. Sends the resulting PDF to the teacher.
 *
 * NOTE (open-source port): the Gamma "Detailed" path depends on the bot's
 * lesson-plan-prompts service, which is not part of this OSS bundle. That
 * dependency is required lazily inside generateAndDeliver(), so pickBackend()
 * and module load work without it; the Kie.ai "Concise" path (the production
 * default) has no such dependency.
 */

const fs = require('fs');
const path = require('path');
const WhatsAppService = require('../whatsapp.service');
const PicLpSession = require('./pic-lp-session.service');
const GammaClient = require('./gamma-client.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const { TEMP_DIR } = require('../../utils/constants');
const supabase = require('../../config/supabase');
const crypto = require('crypto');

const PIC_LP_DEFAULT_DAYS = 1; // single-page → single-lesson plan by default

/**
 * Decide which backend processes this user's pic-LP request.
 *
 * Resolution order (first hit wins):
 *   1. PIC_LP_FORCE_GAMMA env var (debug override) → gamma
 *   2. Teacher-picked formData.lesson_plan_format === 'detailed' → gamma
 *      (teacher choice wins over BOTH the staging force-kieai flag and the DB toggle —
 *       if she explicitly asked for the rich format, she gets the rich format)
 *   3. PIC_LP_FORCE_KIEAI env var (debug override) → kieai
 *   4. DB toggle app_settings.pic_lp_backend_ab → kieai or gamma
 *
 * The DB toggle (step 4) reads a JSONB column shaped { "kieai": <0..1>, "gamma": <0..1> }.
 * Deterministic per-user hash into [0,1); route to 'kieai' if hash < kieai_share, else 'gamma'.
 * Same teacher always sees the same backend within a toggle setting. Used as the
 * Concise-route arbiter AND as a global kill-switch (kieai=0 disables Kie.ai for everyone).
 *
 * Safe default (presence-based) when the DB row is missing / malformed / userId
 * is null: prefer whichever backend the deployment actually has keys for.
 * If a Kie.ai key is present → 'kieai'; else if a Gamma key is present →
 * 'gamma'; else 'gamma'. This way an OSS deployment that configured only one
 * image backend gets routed to the one it can actually run.
 *
 * @param {string|null} userId - Teacher UUID
 * @param {object} [formData] - Flow form data; .lesson_plan_format may be 'concise' | 'detailed'
 * @returns {Promise<'kieai' | 'gamma'>}
 */
function presenceBasedDefault() {
  // Presence-based safe default: route to the backend the deployment is
  // actually configured for, instead of a fixed literal.
  if (process.env.KIE_API_KEY_PIC_LP || process.env.KIE_API_KEY) return 'kieai';
  if (process.env.GAMMA_API_KEY) return 'gamma';
  return 'gamma';
}

async function pickBackend(userId, formData) {
  if ((process.env.PIC_LP_FORCE_GAMMA || '').toLowerCase() === 'true') return 'gamma';
  // Teacher's explicit "Detailed" pick wins over staging force-flags and the DB
  // toggle. She asked for the rich format; honor it.
  if (formData && formData.lesson_plan_format === 'detailed') return 'gamma';

  if (!userId) return presenceBasedDefault();
  if ((process.env.PIC_LP_FORCE_KIEAI || '').toLowerCase() === 'true') return 'kieai';

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'pic_lp_backend_ab')
    .maybeSingle();
  if (error || !data?.value) return presenceBasedDefault();
  let split;
  try {
    split = (typeof data.value === 'string') ? JSON.parse(data.value) : data.value;
  } catch (_) {
    return presenceBasedDefault();
  }
  const kieaiShare = parseFloat(split.kieai);
  if (!Number.isFinite(kieaiShare) || kieaiShare <= 0) return 'gamma';
  if (kieaiShare >= 1) return 'kieai';
  // Deterministic per-user assignment: same teacher always lands on the same
  // backend within a given toggle setting. Hash the userId into a [0, 1)
  // bucket; route to kieai if bucket < kieaiShare.
  const hash = crypto.createHash('md5').update(userId).digest('hex').slice(0, 8);
  const bucket = parseInt(hash, 16) / 0xffffffff;
  return (bucket < kieaiShare) ? 'kieai' : 'gamma';
}

/**
 * Trigger the Gamma generation and ship the PDF.
 * @param {object} args
 * @param {object} args.session   pic_lp_sessions row (already updated with detected metadata)
 * @param {object} args.formData  { grade, subject, topic, language, days? } — Flow submission
 * @param {string} args.from      WhatsApp phone number
 */
async function generateAndDeliver({ session, formData, from }) {
  const startTime = Date.now();

  // A/B router branch — when app_settings.pic_lp_backend_ab routes to 'kieai',
  // delegate to the SQS-routed Kie.ai pipeline. The Kie.ai path sends its own
  // multilingual wait message + queues an SQS job + returns immediately (frees
  // the web replica in <1s). The Gamma sync path below stays as the 'gamma'
  // branch + as a fallback if the app_settings row is missing.
  try {
    const backend = await pickBackend(session.user_id, formData);
    if (backend === 'kieai') {
      const KieaiHandoff = require('./kieai-handoff.service');
      return await KieaiHandoff.enqueueAndAck({ session, formData, from });
    }
  } catch (e) {
    logToFile('Pic-LP A/B router soft-failed (falling through to Gamma)', { error: e.message });
    // Fall through to existing Gamma path — safe default
  }

  // Gamma "Detailed" path deps are required lazily — the prompt builder is not
  // part of this OSS bundle (it is a large standalone text-LP service). Loading
  // it only when this branch runs keeps the module importable for the Kie.ai
  // path. If it is absent (typical OSS clone — Gamma is the optional legacy
  // arm), fall back to the Kie.ai pipeline so the teacher still gets an LP
  // rather than being stranded.
  let LessonPlanPromptsService, ContentService;
  try {
    LessonPlanPromptsService = require('../lesson-plan-prompts.service');
    ContentService = require('../content.service');
  } catch (e) {
    logToFile('Pic-LP: Gamma "Detailed" deps unavailable — falling back to Kie.ai', { error: e.message });
    const KieaiHandoff = require('./kieai-handoff.service');
    return await KieaiHandoff.enqueueAndAck({ session, formData, from });
  }

  await PicLpSession.updateStatus(session.id, 'generating', {
    detected: { ...(session.detected || {}), ...formData },
  });

  const isUrdu = formData.language === 'ur';
  // Gamma path is the "Detailed" format (~5 min, 7-page complete teacher
  // guide). Detailed format is Gamma-only — same timing across all languages.
  const detailedWaitCopy = {
    ur: '⏳ آپ کا تفصیلی لیسن پلان تیار کیا جا رہا ہے۔ اس میں تقریباً 5 منٹ لگ سکتے ہیں۔',
    sw: '⏳ Mpango wako wa somo wa kina unatengenezwa. Inaweza kuchukua ~dakika 5.',
    en: '⏳ Generating your detailed lesson plan now. This usually takes ~5 minutes.',
  };
  await WhatsAppService.sendMessage(
    from,
    detailedWaitCopy[formData.language] || detailedWaitCopy.en
  );

  try {
    const ocrText = String(session?.detected?.ocr_text || '').trim();
    const caption = String(session?.caption || '').trim();
    const pages = Array.isArray(session?.pages) ? session.pages : [];
    const pageRange = pages.length === 1 ? '1' : `1-${pages.length}`;
    const days = formData.days || PIC_LP_DEFAULT_DAYS;

    // Build the textbook `content` block. We prepend a short marker so Gamma
    // knows this came from teacher-supplied photos (not our pre-OCR'd content).
    const contentBlock = [
      '--- TEACHER-PROVIDED TEXTBOOK PAGES ---',
      caption ? `Teacher's note: ${caption}` : '',
      `Pages photographed: ${pages.length}`,
      '',
      ocrText || '(No OCR text — generate based on the topic + grade + subject below.)',
      '--- END TEXTBOOK PAGES ---',
    ].filter(Boolean).join('\n');

    const promptLanguage = formData.language === 'sd' ? 'sd' : formData.language; // pass through
    const prompt = LessonPlanPromptsService.buildChapterPrompt(
      formData.subject,
      formData.grade,
      contentBlock,
      formData.topic || `${formData.subject} — Grade ${formData.grade}`,
      pageRange,
      days,
      // buildChapterPrompt switch only knows en/ur — that's fine for the prompt
      // body. The Gamma `textOptions.language` carries the real language.
      formData.language === 'ur' || formData.language === 'sd' ? 'ur' : 'en'
    );

    const gammaResult = await GammaClient.generate({
      prompt,
      title: formData.topic || 'Lesson Plan',
      language: formData.language,
    });

    if (!gammaResult.success || !gammaResult.pdfUrl) {
      logToFile('❌ Pic-LP Gamma generation failed', {
        sessionId: session.id,
        error: gammaResult.error,
      });
      await PicLpSession.updateStatus(session.id, 'failed', { last_error: gammaResult.error || 'Unknown' });
      await WhatsAppService.sendMessage(
        from,
        isUrdu
          ? '⚠️ معذرت، لیسن پلان بنانے میں مسئلہ آیا۔ براہ کرم دوبارہ کوشش کریں۔'
          : '⚠️ Sorry, I had trouble generating that lesson plan. Please try again.'
      );
      return { success: false, error: gammaResult.error };
    }

    // Match the canonical Gamma-LP delivery pattern — download the PDF to a
    // local temp file, then sendDocument(phone, tempPath, …). sendDocument
    // expects a file path, NOT a Buffer; passing a Buffer makes the internal
    // read stream throw and the catch returns false, which we must check.
    const filename = makeFilename(formData);
    const docCaption = isUrdu
      ? '📄 آپ کا لیسن پلان تیار ہے۔'
      : '📄 Your lesson plan is ready.';

    let tempPdfPath = null;
    try {
      tempPdfPath = await ContentService.downloadPDF(gammaResult.pdfUrl, filename, TEMP_DIR);

      const sendResult = await WhatsAppService.sendDocument(from, tempPdfPath, filename, docCaption);

      // sendDocument returns false on Meta failures without throwing — must check.
      if (!sendResult) {
        throw new Error('WhatsApp returned false from sendDocument');
      }

      await PicLpSession.updateStatus(session.id, 'handed_off');

      logEvent('pic_lp.handed_off_to_lp', {
        sessionId: session.id,
        durationMs: Date.now() - startTime,
        grade: formData.grade,
        subject: formData.subject,
        topic: formData.topic,
        language: formData.language,
        pageCount: pages.length,
      });

      logToFile('✅ Pic-LP delivered', { sessionId: session.id, filename });
      return { success: true, pdfUrl: gammaResult.pdfUrl };
    } catch (sendErr) {
      logToFile('❌ Pic-LP delivery failed', {
        sessionId: session.id,
        error: sendErr.message,
        pdfUrl: gammaResult.pdfUrl,
      });
      await PicLpSession.updateStatus(session.id, 'failed', { last_error: `delivery: ${sendErr.message}` });
      await WhatsAppService.sendMessage(
        from,
        isUrdu
          ? `⚠️ لیسن پلان تیار ہے لیکن واٹس ایپ پر بھیجنے میں مسئلہ آیا۔ یہ لنک کھول کر دیکھیں:\n${gammaResult.pdfUrl}`
          : `⚠️ The lesson plan is ready but I couldn't deliver it via WhatsApp. You can open it here:\n${gammaResult.pdfUrl}`
      );
      return { success: false, error: sendErr.message, pdfUrl: gammaResult.pdfUrl };
    } finally {
      if (tempPdfPath && fs.existsSync(tempPdfPath)) {
        try { fs.unlinkSync(tempPdfPath); } catch (_) { /* best-effort cleanup */ }
      }
    }
  } catch (error) {
    logToFile('❌ Pic-LP handoff threw', { error: error.message, sessionId: session.id });
    await PicLpSession.updateStatus(session.id, 'failed', { last_error: error.message });
    await WhatsAppService.sendMessage(
      from,
      isUrdu
        ? '⚠️ کچھ غلط ہو گیا۔ ٹیم کو اطلاع دے دی گئی ہے۔'
        : "⚠️ Something went wrong on our side. We've logged it for the team."
    );
    return { success: false, error: error.message };
  }
}

function makeFilename(formData) {
  const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 40);
  const parts = [
    `Grade${formData.grade || 'X'}`,
    slug(formData.subject) || 'Subject',
    slug(formData.topic) || 'Lesson',
  ];
  return `${parts.join('_')}_LessonPlan.pdf`;
}

module.exports = { generateAndDeliver, pickBackend };
