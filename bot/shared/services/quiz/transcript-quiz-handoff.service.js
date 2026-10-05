'use strict';
/**
 * Lesson quiz — HAND-OFF: mint (or reuse) the share code, get the teacher the
 * PDF, and send the forwardable message — once from generate(), and again,
 * word-for-word the same, whenever they tap "resend the link" from /quiz.
 *
 * The forwardable message's join line is the share service's joinInvite for the
 * TEACHER's handset: the class sits on the channel the teacher forwards in. A
 * WhatsApp teacher's message carries a wa.me link with the code typed; a
 * Matrix teacher's carries a matrix.to link to the bot and the code to send
 * there; anywhere else, the code and the bot's name. A wa.me link handed to a
 * Matrix class would open WhatsApp.
 *
 * The share code is minted AT MOST ONCE, ever: once `meta.share_code_id` and
 * `meta.student_message` exist, every later call reuses them verbatim. A
 * resend never rewrites `status`/`sent_at`, never re-promises a report the
 * teacher already has, and never schedules a second nudge — only the very first
 * send (`firstSend: true`, always from generate()'s process()) does that.
 */
const fs = require('fs');
const os = require('os');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const { resolveUx } = require('../../config/ux-strings');
const { teacherLanguageFor, formatLessonDate, lessonLabel } = require('./transcript-quiz-language');
const { isRecordedQuiz, lessonSessionFor, handoffIntroKey } = require('./quiz-sources');
const Funnel = require('./quiz-funnel');
const { privateTempPath, removePrivateTemp } = require('../../utils/private-temp');

const GAP_MS = 1200;
// The nudge's wait belongs to the nudge service (one number for "when it is due"
// and "which nudges are due").
const { nudgeAfterMs, nudgeTargetUtc } = require('./transcript-quiz-nudge.service');
/** SQS caps a delay at 900 s; the worker re-queues a nudge until its targetAt. */
const MAX_DELAY_SECONDS = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUIZ_QUESTIONS_SELECT = 'external_id, question_text, option_a, option_b, option_c, correct_option, '
  + 'explanation, distractor_misconceptions, option_feedback, media, render_pattern, sort_order';

async function updateQuiz(quizId, patch) {
  const { error } = await supabase.from('quizzes').update(patch).eq('id', quizId);
  if (error) throw new Error(`quizzes update failed: ${error.message}`);
}

/**
 * Everything sendHandoff needs when the caller does NOT already hold it in
 * memory — the /quiz resend path, which only has a quizId and a phone.
 */
async function load(quizId) {
  const { data: quiz } = await supabase.from('quizzes')
    .select('id, teacher_id, topic, subject, language, grade, status, meta, coaching_session_id, quiz_source')
    .eq('id', quizId).maybeSingle();
  if (!quiz) return null;
  const meta = quiz.meta || {};
  // A quiz written from a lesson plan or a topic has no coaching session: its
  // "session" is the lesson date it carries.
  const sessionQuery = !isRecordedQuiz(quiz.quiz_source)
    ? Promise.resolve({ data: lessonSessionFor(quiz) })
    : supabase.from('coaching_sessions').select('created_at').eq('id', quiz.coaching_session_id).maybeSingle();

  const [{ data: session }, { data: user }, { data: storedQs }] = await Promise.all([
    sessionQuery,
    supabase.from('users').select('preferred_language, name').eq('id', quiz.teacher_id).maybeSingle(),
    supabase.from('quiz_questions').select(QUIZ_QUESTIONS_SELECT).eq('quiz_id', quizId).order('sort_order', { ascending: true }),
  ]);

  const teacherLang = teacherLanguageFor({ preferredLanguage: user?.preferred_language });
  const teacherName = user?.name || null;

  return {
    quiz, session: session || {}, questions: null, qRows: storedQs || [],
    digest: meta.digest, meta, language: quiz.language, teacherLang, teacherName,
  };
}

/**
 * @returns {Promise<{ok:true,code:string,pdfSent:boolean,reused:boolean}|{ok:false,reason:string}>}
 */
async function sendHandoff(quizId, phone, { firstSend = false, prepared = null } = {}) {
  const api = module.exports;
  const bundle = prepared || await api.load(quizId);
  if (!bundle) return { ok: false, reason: 'quiz_not_found' };
  const {
    quiz, session, questions, qRows, digest, teacherName, teacherLang, language,
  } = bundle;
  const meta = bundle.meta || {};
  const funnel = {
    quiz_id: quizId, teacher_id: quiz.teacher_id, source: quiz.quiz_source || 'transcript',
    channel: Funnel.channelOf(meta.source),
  };

  // ── the share code — minted once, reused forever ──────────────────────────
  const share = require('./video-quiz-share.service');
  let code;
  let shareCodeId;
  let link;
  let joinKind = meta.join_kind || null;
  let forwardable;
  let reused = false;
  if (meta.share_code_id && meta.student_message) {
    code = meta.share_code;
    shareCodeId = meta.share_code_id;
    link = meta.link || null;
    forwardable = meta.student_message;
    reused = true;
  } else if (!firstSend) {
    // A RESEND has nothing to mint from. Reaching here means the row is missing
    // one half of the pair (a `student_message` written without a
    // `share_code_id`, or the reverse) — and minting would hand the teacher a
    // SECOND code for a class that already has a link. The link is the one the
    // class was first given: only the first send ever mints, and that is
    // enforced here rather than at each caller.
    logToFile('⚠️ transcript quiz: resend asked for on a quiz with no code to reuse', {
      quizId, hasCodeId: Boolean(meta.share_code_id), hasMessage: Boolean(meta.student_message),
    });
    logEvent('transcript_quiz.resend_without_code', { quizId });
    return { ok: false, reason: 'no_code_to_reuse' };
  } else {
    // The chat this goes to is kept on the code, where the class report reads it.
    const minted = await share.mintCode({ quizId, userId: quiz.teacher_id, videoId: null, language, teacherTo: phone });
    if (!minted) {
      await updateQuiz(quizId, { meta: { ...meta, step: 'ready', handoff_error: 'mint_failed' } });
      await WhatsAppService.sendMessage(phone, resolveUx('tqCouldNotSend', { language: teacherLang }));
      Funnel.emit('send_failed', { ...funnel, reason: 'mint_failed' });
      return { ok: false, reason: 'mint_failed' };
    }
    code = minted.code;
    shareCodeId = minted.id;
    // {kind: 'wa'|'matrix'|'code', link, bot, code} — for where the class is.
    const invite = share.joinInvite({ code, recipient: phone });
    link = invite.link || null;
    joinKind = invite.kind;
    const lessonDate = formatLessonDate(session.created_at, language);
    const Gen = require('./transcript-quiz-render');
    forwardable = Gen.studentMessage({
      teacherName: minted.teacherName || teacherName, topic: quiz.topic, date: lessonDate, link, invite, language,
    });
  }

  // ── the PDF — the SAME object the teacher was sent, best effort ────────────
  // meta.pdf_key is the document already on R2; only when it is absent, or the
  // object is gone, do we pay to re-render it (and re-upload so the next
  // resend gets the cheap path too). Without R2 (a deployment that never set
  // it up) the PDF is rendered each time and sent from a temp file. A PDF that
  // cannot be produced at all is still not a reason to withhold the link.
  const R2 = require('../../storage/r2');
  const r2 = R2.isR2Configured();
  let pdfKey = r2 ? (meta.pdf_key || null) : null;
  let tempPath = null;
  // A directory of this call's own: two resends of the same quiz can overlap, and
  // a shared `transcript-quiz-<quizId>.pdf` let one call's cleanup remove the
  // file the other's upload had not read yet.
  let tmp = null;
  const writeTemp = (buffer) => {
    removePrivateTemp(tmp);
    tmp = privateTempPath(os.tmpdir(), `transcript-quiz-${quizId}.pdf`, 'transcript-quiz-');
    try {
      fs.writeFileSync(tmp.filePath, buffer);
    } catch (err) {
      removePrivateTemp(tmp);
      tmp = null;
      throw err;
    }
    return tmp.filePath;
  };
  let rerendered = false;
  if (pdfKey) {
    try {
      const buffer = await R2.downloadFromR2(pdfKey);
      tempPath = writeTemp(buffer);
    } catch (err) {
      logToFile('⚠️ transcript quiz: stored PDF could not be fetched from R2, re-rendering', { quizId, error: err.message });
      tempPath = null;
      pdfKey = null;
    }
  }
  if (!tempPath) {
    try {
      const Gen = require('./transcript-quiz-render');
      const buffer = await Gen.renderPdf({
        quiz, questions: Gen.withFigureSvgs(qRows, questions, language), digest, teacherName,
        grade: quiz.grade || meta.grade || null,
        // The authored one-liner when the quiz has one; the template's own cap
        // covers older quizzes.
        lessonSummary: meta.lesson_summary_short || meta.lesson_summary || '',
        // One language for the whole document, and it is the quiz's.
        language, contentLanguage: language,
        date: formatLessonDate(session.created_at, language, { year: true }), link,
      });
      if (r2) {
        try {
          pdfKey = `transcript_quizzes/${quiz.teacher_id}/${quizId}.pdf`;
          await R2.uploadBuffer(buffer, pdfKey, 'application/pdf');
          rerendered = true;
        } catch (upErr) {
          pdfKey = null;
          logToFile('⚠️ transcript quiz: PDF upload to R2 failed (continuing)', { quizId, error: upErr.message });
        }
      }
      tempPath = writeTemp(buffer);
    } catch (err) {
      logToFile('⚠️ transcript quiz: PDF render failed (sending the link without it)', { quizId, error: err.message });
    }
  }

  // ── send: document (or its text fallback), THEN the link alone, THEN (first
  // send only) the report promise — paced exactly as process() always paced it.
  // "what you taught" is true only of a recorded lesson; a plan quiz was
  // planned, and a topic quiz was neither.
  const caption = resolveUx(handoffIntroKey(quiz.quiz_source), {
    language: teacherLang,
    params: { lesson: lessonLabel({ digest, quizLanguage: language, teacherLanguage: teacherLang }), n: qRows.length },
  });
  let pdfSent = false;
  if (tempPath) {
    const { pdfFilename } = require('./transcript-quiz-render');
    try {
      pdfSent = await WhatsAppService.sendDocument(phone, tempPath, pdfFilename(quiz.topic), caption);
    } finally {
      removePrivateTemp(tmp);
    }
  }
  if (!pdfSent) {
    await WhatsAppService.sendMessage(phone, `${caption}\n\n${resolveUx('tqForwardThis', { language: teacherLang })}`);
  }
  await api.sleep(GAP_MS);
  // THE forwardable message, alone — the one thing the class needs. Whether it
  // arrived is recorded: `sent` used to be logged either way.
  const linkSent = Boolean(await WhatsAppService.sendMessage(phone, forwardable));
  if (firstSend) {
    await api.sleep(GAP_MS);
    // The night-time hour is the end of the school's quiet hours, the same
    // window the report itself waits out.
    const quiet = require('../../config/school-clock').quietWindow();
    await WhatsAppService.sendMessage(phone, quiet
      ? resolveUx('tqReportPromise', { language: teacherLang, params: { hour: quiet.to } })
      : resolveUx('tqReportPromiseAnytime', { language: teacherLang }));
  }

  // ── bookkeeping — only the first send owns status/sent_at/the nudge ────────
  if (firstSend) {
    // `teacher_to` is the chat this went to. The nudge is sent hours later, by a
    // job that only has the quiz: users.phone_number is a WhatsApp number (or
    // empty) for a teacher on Matrix, Slack or Discord. A lesson quiz is one row
    // per teacher, so the row can carry it; the class report reads the same chat
    // off the share code (mintCode `teacherTo`).
    const newMeta = {
      ...meta, step: 'sent', share_code: code, share_code_id: shareCodeId, link, join_kind: joinKind, teacher_to: phone,
      student_message: forwardable, pdf_key: pdfKey, pdf_sent: pdfSent, link_sent: linkSent, sent_at: new Date().toISOString(),
    };
    await updateQuiz(quizId, { status: 'sent', meta: newMeta });
    logEvent('transcript_quiz.sent', {
      quizId, userId: quiz.teacher_id, code, language, pdfSent, costUsd: meta.cost_usd, quiz_source: quiz.quiz_source || 'transcript',
    });
    Funnel.emit('sent', { ...funnel, pdf_sent: pdfSent, link_sent: linkSent });
    // The row is `sent` (the teacher has the document, and /quiz can resend the
    // link), but a class cannot join without the link: that is a failure to see.
    if (!linkSent) Funnel.emit('send_failed', { ...funnel, reason: 'link_not_delivered' });

    try {
      const SQSQueueService = require('../queue');
      // The wait (TRANSCRIPT_QUIZ_NUDGE_AFTER_MINUTES), pushed out of the
      // school's quiet hours rather than dropped — the worker re-queues until
      // this instant. A wait shorter than one hop is queued for exactly that.
      const target = nudgeTargetUtc(new Date(Date.now() + nudgeAfterMs()));
      const delaySeconds = Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.ceil((target.getTime() - Date.now()) / 1000)));
      await SQSQueueService.queueJob(quizId, 'quiz_nudge_teacher', { quizId, targetAt: target.toISOString() }, {
        delaySeconds, deduplicationId: `${quizId}-quiz_nudge_teacher`,
      });
    } catch (err) {
      logToFile('⚠️ transcript quiz: nudge scheduling failed (non-fatal)', { quizId, error: err.message });
    }
  } else {
    // A resend that had to re-render the PDF still saves the new key so the
    // NEXT resend gets the cheap R2 download — and touches nothing else.
    if (rerendered && pdfKey) {
      await updateQuiz(quizId, { meta: { ...meta, pdf_key: pdfKey } });
    }
    logEvent('transcript_quiz.handoff_resent', { quizId, code, pdfSent });
  }

  return { ok: true, code, pdfSent, reused };
}

module.exports = {
  sendHandoff, load, lessonSessionFor, sleep, GAP_MS,
};
