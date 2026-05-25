/**
 * Homework Bundle Worker
 *
 * Consumes a `homework_bundle_generation` SQS job. ONE job == ONE
 * (grade × subject) group (the endpoint enqueues one job per group). For the
 * group:
 *   1. downloadFromR2() each chapter PDF.
 *   2. pdf-lib MERGE via PDFDocument.copyPages (these are already-rendered
 *      PDFs; we stitch pages, preserving chapter order). A missing/failed
 *      chapter soft-fails that chapter; the rest still merge. All-missing →
 *      group soft-fails (no doc), no throw.
 *   3. WhatsAppService.sendDocument (file path, not buffer).
 *   4. INSERT one lesson_plans row (type='homework_bundle').
 *   5. After the LAST group of the request, schedule the post-delivery survey
 *      via lp-feedback (optional — no-op if that service isn't present).
 *
 * Dispatched from workers/sqs-worker.js (v2 generic envelope, body.payload).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { PDFDocument } = require('pdf-lib');

const supabase = require('../shared/config/supabase');
const WhatsAppService = require('../shared/services/whatsapp.service');
const { downloadFromR2 } = require('../shared/storage/r2');
const { logToFile } = require('../shared/utils/logger');
const { logEvent } = require('../shared/utils/structured-logger');

const SUBJECT_DISPLAY = { maths: 'Maths', english: 'English', urdu: 'Urdu' };

/**
 * Build the delivered filename.
 *   "Homework - Grade {g} {Subject} (Ch {list}).pdf"
 */
function makeFilename({ grade, subject, chapterNumbers }) {
  const subj = SUBJECT_DISPLAY[subject] || subject;
  const chList = chapterNumbers.join(', ');
  const raw = `Homework - Grade ${grade} ${subj} (Ch ${chList}).pdf`;
  return raw.replace(/[\\/:*?"<>|]+/g, '-');
}

/**
 * Bilingual delivery caption stating grade/subject/chapters.
 */
function localizedDeliveryCaption({ grade, subject, chapterNumbers, language }) {
  const subj = SUBJECT_DISPLAY[subject] || subject;
  const chList = chapterNumbers.join(', ');
  const isUrduLike = language === 'ur' || language === 'sd' || language === 'pa';
  if (isUrduLike) {
    return `📄 ہوم ورک — جماعت ${grade} ${subj} (ابواب ${chList})`;
  }
  return `📄 Homework — Grade ${grade} ${subj} (Chapters ${chList})`;
}

/**
 * Merge chapter PDFs (in the given order) into one pdf-lib document.
 * Soft-fails a chapter whose R2 fetch or parse fails; returns the list of
 * chapters actually included so the filename/caption stay truthful.
 *
 * @returns {Promise<{ buffer:Buffer|null, included:Array }>}
 */
async function mergeChapters(chapters) {
  const merged = await PDFDocument.create();
  const included = [];

  for (const ch of chapters) {
    try {
      const buf = await downloadFromR2(ch.r2_key);
      const src = await PDFDocument.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
      included.push(ch);
    } catch (err) {
      logEvent('homework.bundle.chapter_skipped', {
        chapter: ch.chapter, r2Key: ch.r2_key, error: err.message,
      });
      logToFile('Homework bundle: chapter soft-failed', {
        chapter: ch.chapter, r2Key: ch.r2_key, error: err.message,
      });
      // soft-fail this chapter; keep merging the rest
    }
  }

  if (included.length === 0) return { buffer: null, included };
  const buffer = Buffer.from(await merged.save());
  return { buffer, included };
}

/**
 * Main entry — called by workers/sqs-worker.js for a
 * homework_bundle_generation job. One job = one (grade × subject) group.
 */
async function process(args) {
  const {
    userId, phone, requestId, grade, subject, chapters = [],
    isLastGroup = true,
  } = args;
  const t0 = Date.now();
  let tempPath = null;

  if (!phone) {
    logEvent('homework.bundle.failed', { userId, requestId, grade, subject, error: 'no_phone' });
    return { success: false, error: 'no_phone' };
  }

  try {
    const { buffer, included } = await mergeChapters(chapters);

    if (!buffer || included.length === 0) {
      logEvent('homework.bundle.empty', { userId, requestId, grade, subject });
      if (requestId && isLastGroup) {
        try {
          await supabase.from('lesson_plan_requests').update({ status: 'failed' }).eq('id', requestId);
        } catch (_) { /* best-effort */ }
      }
      return { success: false, error: 'all_chapters_missing' };
    }

    const chapterNumbers = included.map((c) => c.chapter);

    // Teacher's system-message language for the caption.
    let language = 'en';
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', userId)
        .maybeSingle();
      if (userRow?.preferred_language) language = userRow.preferred_language;
    } catch (_) { /* default en */ }

    const filename = makeFilename({ grade, subject, chapterNumbers });
    const caption = localizedDeliveryCaption({ grade, subject, chapterNumbers, language });

    tempPath = path.join(os.tmpdir(), `homework_${userId}_${grade}_${subject}_${Date.now()}.pdf`);
    fs.writeFileSync(tempPath, buffer);

    const sendResult = await WhatsAppService.sendDocument(phone, tempPath, filename, caption);
    if (!sendResult) throw new Error('WhatsApp returned false from sendDocument');

    const deliveryMs = Date.now() - t0;

    // One lesson_plans row per delivered bundle. The bundle manifest (source
    // chapter keys, counts, timing) is stored in the existing `content` JSONB
    // column since the merged PDF itself is ephemeral.
    const bundleManifest = {
      grade,
      subject,
      chapters: included.map((c) => ({ chapter: c.chapter, chapter_title: c.chapter_title, r2_key: c.r2_key })),
      requested_count: chapters.length,
      delivered_count: included.length,
      delivery_time_ms: deliveryMs,
      trigger_mode: 'after_pdf_only',
      homework_request_id: requestId || null,
    };
    let lessonPlanId = null;
    try {
      const { data: lpRow, error: insertError } = await supabase
        .from('lesson_plans')
        .insert({
          user_id: userId,
          topic: `Homework - Grade ${grade} ${SUBJECT_DISPLAY[subject] || subject}`,
          grade: String(grade),
          subject,
          type: 'homework_bundle',
          content: bundleManifest,
        })
        .select('id')
        .single();
      if (insertError) {
        logToFile('Homework bundle: lesson_plans insert error', { error: insertError.message });
      } else {
        lessonPlanId = lpRow?.id || null;
      }
    } catch (e) {
      logToFile('Homework bundle: lesson_plans insert threw', { error: e.message });
    }

    logEvent('homework.bundle.delivered', {
      userId, phone, requestId, grade, subject,
      deliveredChapters: chapterNumbers,
      deliveryTimeMs: deliveryMs,
      lessonPlanId,
    });

    // After the LAST group, schedule the post-delivery feedback survey ONCE.
    // The lp-feedback service is optional in the open-source build — no-op if absent.
    if (isLastGroup && lessonPlanId) {
      try {
        const LpFeedbackService = require('../shared/services/lp-feedback.service');
        if (LpFeedbackService && typeof LpFeedbackService.scheduleFeedbackPrompt === 'function') {
          LpFeedbackService.scheduleFeedbackPrompt({
            lessonPlanId,
            userId,
            phone,
            context: {
              grade,
              subject,
              topic: `Homework Grade ${grade} ${SUBJECT_DISPLAY[subject] || subject}`,
              lpVariant: 'homework',
              triggerMode: 'after_pdf_only',
              language,
              askReasonOnYes: true,
            },
          });
        }
      } catch (_) { /* lp-feedback survey is optional in the open-source build */ }
    }

    // Mark the request completed when the last group ships.
    if (requestId && isLastGroup) {
      try {
        await supabase.from('lesson_plan_requests').update({ status: 'completed' }).eq('id', requestId);
      } catch (_) { /* best-effort — delivery already happened */ }
    }

    return { success: true, lessonPlanId, deliveredChapters: chapterNumbers };
  } catch (e) {
    logToFile('Homework bundle worker threw', { userId, requestId, error: e.message });
    logEvent('homework.bundle.failed', { userId, requestId, grade, subject, error: e.message });
    if (requestId && isLastGroup) {
      try {
        await supabase.from('lesson_plan_requests').update({ status: 'failed' }).eq('id', requestId);
      } catch (_) { /* best-effort */ }
    }
    throw e; // SQS DLQ handles retry for transient errors
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) { /* best-effort */ }
    }
  }
}

module.exports = { process, makeFilename, localizedDeliveryCaption, mergeChapters };
