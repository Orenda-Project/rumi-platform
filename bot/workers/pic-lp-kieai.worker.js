/**
 * Pic-LP Kie.ai Worker
 *
 * Consumes pic_lp_kieai_generation SQS jobs. For each job:
 *   1. Loads the pic_lp_sessions row
 *   2. Builds the page-1 + page-2 prompts via kieai-prompt-builder
 *   3. Renders both pages in parallel via kieai-client.service.js
 *   4. Downloads PNGs, assembles a 2-page PDF (pdf-lib + sharp), stamps
 *      the hellorumi.ai footer
 *   5. Delivers via WhatsAppService.sendDocument (canonical path)
 *   6. INSERTs a lesson_plans row with source='pic_to_lp_kieai',
 *      cost_usd, delivery_time_ms, pic_lp_session_id, textbook_metadata
 *   7. Schedules the lp-feedback prompt with context.askReasonOnYes=true
 *      and context.language so the teacher gets the multilingual ask
 *
 * On failure: updates session status to 'failed' + sends a localized
 * error message to the teacher. SQS DLQ handles retry for transient errors.
 *
 * NOTE (open-source port): the post-delivery feedback prompt depends on the
 * bot's lp-feedback service, which is not part of this OSS bundle. That
 * dependency is required lazily, so the worker module loads and the core
 * generation/delivery path runs without it; if the service is absent, the
 * feedback scheduling step is skipped (logged, non-fatal).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const supabase = require('../shared/config/supabase');
const WhatsAppService = require('../shared/services/whatsapp.service');
const PicLpSession = require('../shared/services/pic-to-lp/pic-lp-session.service');
const KieaiClient = require('../shared/services/pic-to-lp/kieai-client.service');
const KieaiPromptBuilder = require('../shared/services/pic-to-lp/kieai-prompt-builder.service');
const { getPresignedUrl, buildR2PublicUrl } = require('../shared/storage/r2');
const { detectRegion } = require('../shared/utils/region');
const { coachingNumberFor } = require('../shared/services/pic-to-lp/kieai-prompt-builder.service');
const { logToFile } = require('../shared/utils/logger');
const { logEvent } = require('../shared/utils/structured-logger');
const { TEMP_DIR, RUMI_LOGO_R2_KEY } = require('../shared/utils/constants');

const PRESIGN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Assemble the 2-page PDF: page1 + page2 + a discreet
 * "Generate via www.hellorumi.ai" footer at the bottom of each page.
 *
 * @param {Object} args
 * @param {string} args.page1Url
 * @param {string} args.page2Url
 * @param {string} args.outPath - Local temp PDF path
 */
async function assemblePDF({ page1Url, page2Url, outPath }) {
  const [p1Buf, p2Buf] = await Promise.all([
    downloadToBuffer(page1Url),
    downloadToBuffer(page2Url),
  ]);
  const [p1Jpeg, p2Jpeg] = await Promise.all([
    sharp(p1Buf).jpeg({ quality: 92 }).toBuffer(),
    sharp(p2Buf).jpeg({ quality: 92 }).toBuffer(),
  ]);
  const meta = await sharp(p1Buf).metadata();
  const W = meta.width;
  const H = meta.height;

  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  const drawFooter = (page) => {
    const text = 'Generate via www.hellorumi.ai';
    const sz = Math.max(10, Math.round(W * 0.011));
    const fw = helv.widthOfTextAtSize(text, sz);
    page.drawText(text, {
      x: (page.getWidth() - fw) / 2,
      y: Math.round(W * 0.012),
      size: sz, font: helv,
      color: rgb(0.42, 0.45, 0.50), // slate-500-ish, discreet
    });
  };

  const p1Embed = await pdf.embedJpg(p1Jpeg);
  const page1 = pdf.addPage([W, H]);
  page1.drawImage(p1Embed, { x: 0, y: 0, width: W, height: H });
  drawFooter(page1);

  const p2Embed = await pdf.embedJpg(p2Jpeg);
  const page2 = pdf.addPage([W, H]);
  page2.drawImage(p2Embed, { x: 0, y: 0, width: W, height: H });
  drawFooter(page2);

  fs.writeFileSync(outPath, await pdf.save());
}

function makeFilename({ grade, subject, topic }) {
  const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 40);
  return `Grade${grade || 'X'}_${slug(subject) || 'Subject'}_${slug(topic) || 'Lesson'}_LessonPlan.pdf`;
}

function localizedDeliveryCaption(language) {
  const isUrduLike = language === 'ur' || language === 'sd' || language === 'pa';
  return isUrduLike ? '📄 آپ کا لیسن پلان تیار ہے۔' : '📄 Your lesson plan is ready.';
}

function localizedErrorMessage(language) {
  const isUrduLike = language === 'ur' || language === 'sd' || language === 'pa';
  return isUrduLike
    ? '⚠️ معذرت، لیسن پلان بنانے میں مسئلہ آیا۔ براہ کرم دوبارہ کوشش کریں۔'
    : '⚠️ Sorry, I had trouble generating that lesson plan. Please try again.';
}

/**
 * Main entry — called by workers/sqs-worker.js when a pic_lp_kieai_generation
 * job arrives. Idempotent on the lesson_plans INSERT (checks for an existing
 * row with the same pic_lp_session_id before inserting, to handle SQS
 * at-least-once delivery).
 *
 * @param {Object} args - Payload from kieai-handoff.service.js enqueueAndAck
 * @param {string} args.sessionId
 * @param {Object} args.formData - { grade, subject, topic, language }
 * @param {string} args.from
 */
async function process({ sessionId, formData, from }) {
  const t0 = Date.now();
  let tempPdfPath = null;

  // Load fresh session state in case anything changed since enqueue
  const session = await PicLpSession.getById(sessionId);
  if (!session) {
    logToFile('Pic-LP worker: session not found', { sessionId });
    return { success: false, error: 'session_not_found' };
  }

  // Status guard — skip if the session is already in a TERMINAL state
  // (handed_off / failed / cancelled / timed_out). This prevents SQS
  // at-least-once re-delivery from re-processing a job whose previous attempt
  // eventually succeeded (or was abandoned), avoiding stale "surprise" LP
  // deliveries hours later.
  const TERMINAL_STATES = ['handed_off', 'failed', 'cancelled', 'timed_out'];
  if (TERMINAL_STATES.includes(session.status)) {
    logEvent('pic_lp.kieai_worker.skipped_terminal_state', {
      sessionId, currentStatus: session.status,
    });
    return { success: true, skipped: true, reason: `terminal_state_${session.status}` };
  }

  // Stale-message guard — even if not terminal, skip if the session is too old.
  // A generous 20-min ceiling matches the worker timeout budget + gives some
  // slack for SQS visibility-timeout overruns. Older messages = the teacher has
  // moved on; delivering would just confuse them.
  const STALE_THRESHOLD_MS = 20 * 60 * 1000;
  const sessionAgeMs = Date.now() - new Date(session.created_at).getTime();
  if (sessionAgeMs > STALE_THRESHOLD_MS) {
    logEvent('pic_lp.kieai_worker.skipped_stale', {
      sessionId, ageMinutes: Math.round(sessionAgeMs / 60000),
    });
    await PicLpSession.updateStatus(sessionId, 'timed_out', { last_error: `Stale by ${Math.round(sessionAgeMs / 60000)} min` });
    return { success: true, skipped: true, reason: 'stale' };
  }

  // Idempotency: if a lesson_plans row already exists for this session, the
  // job was already processed (SQS at-least-once delivery). No-op.
  const { data: existingLp } = await supabase
    .from('lesson_plans')
    .select('id')
    .eq('pic_lp_session_id', sessionId)
    .limit(1)
    .maybeSingle();
  if (existingLp) {
    logEvent('pic_lp.kieai_worker.duplicate_skipped', { sessionId, lessonPlanId: existingLp.id });
    return { success: true, skipped: true, reason: 'already_processed' };
  }

  const language = formData.language || 'en';

  try {
    // Coaching Corner number. detectRegion() is used for caller compatibility;
    // the number itself comes from the COACHING_WHATSAPP_NUMBER env var (or is
    // omitted when unset).
    const region = detectRegion();
    const coachingNumber = coachingNumberFor(region);

    // Build prompts from form data + OCR text we captured at metadata-extract time
    const promptArgs = {
      grade: formData.grade,
      subject: formData.subject,
      topic: formData.topic,
      language,
      ocrText: session?.detected?.ocr_text || '',
      region,
      coachingNumber,
    };
    const page1Prompt = KieaiPromptBuilder.buildPage1Prompt(promptArgs);
    const page2Prompt = KieaiPromptBuilder.buildPage2Prompt(promptArgs);

    // Presign the logo (image_input[0]) + the first teacher photo (image_input[1])
    const logoR2Url = buildR2PublicUrl(RUMI_LOGO_R2_KEY);
    const logoUrl = await getPresignedUrl(logoR2Url, PRESIGN_TTL_SECONDS);

    const pages = Array.isArray(session?.pages) ? session.pages : [];
    const firstPage = pages[0]?.url;
    if (!firstPage) {
      throw new Error('No teacher photo on the session');
    }
    const teacherPhotoUrl = await getPresignedUrl(firstPage, PRESIGN_TTL_SECONDS);
    const inputUrls = [logoUrl, teacherPhotoUrl];

    // Render page 1 + page 2 in parallel
    const [p1, p2] = await Promise.all([
      KieaiClient.generate({ prompt: page1Prompt, inputUrls, language, label: `${sessionId}-p1` }),
      KieaiClient.generate({ prompt: page2Prompt, inputUrls, language, label: `${sessionId}-p2` }),
    ]);
    if (!p1.success) throw new Error(`page 1 failed: ${p1.error}`);
    if (!p2.success) throw new Error(`page 2 failed: ${p2.error}`);

    // Assemble PDF
    const filename = makeFilename(formData);
    // TEMP_DIR may not exist on the worker container by default (it's a
    // separate instance from the web replica). mkdirSync recursive is
    // idempotent — safe to call every time.
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    tempPdfPath = path.join(TEMP_DIR, `pic_lp_kieai_${sessionId}_${Date.now()}.pdf`);
    await assemblePDF({ page1Url: p1.url, page2Url: p2.url, outPath: tempPdfPath });

    // Deliver via WhatsApp (file path, NOT buffer)
    const sendResult = await WhatsAppService.sendDocument(
      from, tempPdfPath, filename, localizedDeliveryCaption(language)
    );
    if (!sendResult) throw new Error('WhatsApp returned false from sendDocument');

    const deliveryMs = Date.now() - t0;

    // Cost: each page same cost. p1 + p2 same model so just double.
    const costUsd = (p1.model && p1.resolution)
      ? (KieaiClient.pickBackend(language).costUsdPerPage * 2)
      : 0;

    // INSERT into lesson_plans (unified output table — same shape as v7 LPs).
    const textbookMetadata = {
      grade: formData.grade,
      subject: formData.subject,
      topic: formData.topic,
      language,
      backend_model: p1.model,
      resolution: p1.resolution,
      page_count: 2,
      trigger_mode: 'after_pdf_only',
      teacher_page_count: pages.length,
    };
    const { data: lpRow, error: insertError } = await supabase
      .from('lesson_plans')
      .insert({
        user_id: session.user_id,
        topic: formData.topic || `Grade ${formData.grade} ${formData.subject}`,
        grade: String(formData.grade || ''),
        subject: formData.subject,
        type: 'pic_to_lp_kieai',
        lp_variant: 'pic_to_lp_kieai',
        source: 'pic_to_lp_kieai',
        delivery_time_ms: deliveryMs,
        cost_usd: costUsd,
        pic_lp_session_id: sessionId,
        textbook_metadata: textbookMetadata,
      })
      .select('id')
      .single();

    if (insertError) {
      logToFile('Pic-LP kieai worker: lesson_plans INSERT failed', {
        sessionId, error: insertError.message,
      });
      // Don't throw — the PDF was already delivered. Continue to update
      // session status so the user-facing flow doesn't look broken.
    }

    await PicLpSession.updateStatus(sessionId, 'handed_off');

    logEvent('pic_lp.handed_off_to_lp', {
      sessionId, from,
      durationMs: deliveryMs,
      backend: p1.model,
      resolution: p1.resolution,
      costUsd,
      grade: formData.grade,
      subject: formData.subject,
      topic: formData.topic,
      language,
      lessonPlanId: lpRow?.id || null,
    });

    // Schedule the post-delivery feedback prompt. Feedback prompts use the
    // teacher's preferred_language (system-message language), not
    // formData.language (the LP CONTENT language). Look up here.
    let userPreferredLang = 'en';
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', session.user_id)
        .maybeSingle();
      if (userRow?.preferred_language) userPreferredLang = userRow.preferred_language;
    } catch (_) { /* default to en */ }

    if (lpRow?.id) {
      // Lazy-require the feedback service — it isn't part of this OSS bundle.
      // If absent, skip scheduling (logged, non-fatal).
      try {
        const LpFeedbackService = require('../shared/services/lp-feedback.service');
        LpFeedbackService.scheduleFeedbackPrompt({
          lessonPlanId: lpRow.id,
          userId: session.user_id,
          phone: from,
          context: {
            grade: formData.grade,
            subject: formData.subject,
            topic: formData.topic,
            lpVariant: 'pic_to_lp_kieai',
            triggerMode: 'after_pdf_only',
            language: userPreferredLang, // system-message language (NOT formData.language)
            askReasonOnYes: true,
          },
        });
      } catch (feedbackErr) {
        logToFile('Pic-LP kieai worker: feedback scheduling skipped', {
          sessionId, error: feedbackErr.message,
        });
      }
    }

    return { success: true, lessonPlanId: lpRow?.id || null };
  } catch (e) {
    logToFile('Pic-LP kieai worker threw', { sessionId, error: e.message });
    logEvent('pic_lp.kieai_worker_failed', { sessionId, from, error: e.message });
    await PicLpSession.updateStatus(sessionId, 'failed', { last_error: e.message });
    try {
      await WhatsAppService.sendMessage(from, localizedErrorMessage(language));
    } catch (_) { /* best-effort */ }
    throw e; // SQS DLQ handles retry
  } finally {
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      try { fs.unlinkSync(tempPdfPath); } catch (_) { /* best-effort */ }
    }
  }
}

module.exports = { process, assemblePDF };
