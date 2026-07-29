'use strict';
/**
 * VideoQuizService: offer a quiz after a video, then run it.
 *
 * FLOW
 *   teacher picks a video -> video delivered -> 3 s pause -> "want the quiz?"
 *   -> yes -> 15 questions, one at a time, each with per-answer feedback
 *   -> finish -> survey covering the video AND the quiz
 *   -> optionally: share it with her class (see video-quiz-share.service.js)
 *
 * WHY A SEPARATE SERVICE FROM quiz-session.service.js
 * The parent quiz is adaptive: it picks the next question by difficulty from a
 * generated bank of 3-option text MCQs. A video quiz is a FIXED 15-question
 * walk through a curated bank with audio, pictures, grids and Flows. Bolting
 * the media renderer and the fixed walk onto the adaptive loop would have made
 * one service serve two different pedagogies. They share the TABLES — quizzes,
 * quiz_questions, quiz_sessions, quiz_answers — and therefore share the report
 * machinery, which is where the reuse actually pays.
 */

const supabase = require('../../config/supabase');
const redisService = require('../cache/railway-redis.service');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const render = require('./video-quiz-render.service');
const sender = require('./video-quiz-sender.service');

const QUESTIONS_PER_SESSION = 15;
const OFFER_DELAY_MS = 3000;          // operator spec: 3 s after the video
const STATE_TTL_SECS = 24 * 60 * 60;
const OFFER_TTL_SECS = 60 * 60;

const stripPlus = (p) => (p && p.startsWith('+') ? p.slice(1) : p);
const STATE_KEY = (phone) => `videoquiz:${stripPlus(phone)}:active`;
const OFFER_KEY = (phone) => `videoquiz:${stripPlus(phone)}:offer`;

const OFFER_YES = 'vq_offer_yes';
const OFFER_NO = 'vq_offer_no';
// the third way out: she wants it for her class, not for herself.
const OFFER_SHARE = 'vq_offer_share';

// ─── Offer ──────────────────────────────────────────────────────────────────

/** Does this video have an importable quiz? */
async function quizForVideo(videoId) {
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, topic, grade, subject')
    .eq('video_id', videoId)
    .eq('quiz_source', 'video')
    .maybeSingle();
  if (error) {
    logToFile('⚠️ video-quiz: quiz lookup failed', { videoId, error: error.message });
    return null;
  }
  return data;
}

/**
 * Offer the quiz `OFFER_DELAY_MS` after the video lands.
 *
 * Returns true if an offer was scheduled — the caller uses that to SUPPRESS the
 * standalone 👍/👎 video survey, because once a quiz is offered the survey has
 * to ask about both (see student-video-feedback.service.js scope handling).
 * Two surveys about the same video, 30 s apart, is the thing to avoid.
 */
async function offerAfterVideo({ userId, phone, video, language = 'en', deliveryId = null }) {
  // Region gate: the quiz corpus belongs to the bundled Pakistani-curriculum
  // video library. Deployments outside region='pakistan' see the video exactly
  // as before, with no offer — the standalone survey fires instead.
  const { isVideoQuizzesEnabled } = require('../region-features.service');
  const { detectRegion } = require('../../utils/region');
  if (!(await isVideoQuizzesEnabled(detectRegion()))) return false;

  const quiz = await quizForVideo(video.id);
  if (!quiz) return false;

  setTimeout(() => {
    sendOffer({ userId, phone, video, quiz, language, deliveryId })
      .catch((err) => logToFile('❌ video-quiz: sendOffer threw', { error: err.message }));
  }, OFFER_DELAY_MS).unref?.();
  return true;
}

async function sendOffer({ userId, phone, video, quiz, language, deliveryId }) {
  await redisService.set(OFFER_KEY(phone), {
    quizId: quiz.id, videoId: video.id, userId, deliveryId,
    topic: quiz.topic, language,
  }, OFFER_TTL_SECS);

  const t = offerStrings(language);
  await WhatsAppService.sendInteractiveButtons(phone, {
    body: t.body(video.clean_title || quiz.topic),
    // Exactly three — WhatsApp's hard cap on reply buttons. Order is deliberate:
    // taking it herself first (the common case), then the class route, then out.
    buttons: [
      { id: OFFER_YES, title: t.yes },
      { id: OFFER_SHARE, title: t.share },
      { id: OFFER_NO, title: t.no },
    ],
  });

  if (deliveryId) {
    await supabase.from('video_quiz_deliveries')
      .update({ quiz_offered_at: new Date().toISOString() })
      .eq('id', deliveryId);
  }
  logEvent('video_quiz.offered', { userId, videoId: video.id, quizId: quiz.id });
}

/**
 * TODO: route this copy through resolveUx once the catalog keys land,
 * so ur/sw/ar come from the same place as the rest of the chrome. Kept as an
 * explicit map (not a hardcoded English string) so the shape is already
 * per-language and the migration is mechanical.
 */
function offerStrings(language) {
  const map = {
    en: {
      body: (title) => `Want to try a short quiz on “${title}”?\n\n`
        + `15 quick questions — I'll tell you how you did after each one. `
        + `Or send it straight to your class.`,
      yes: 'Yes, start', no: 'No thanks',
      // . WhatsApp truncates a reply-button title past 20 characters
      // SILENTLY, so these are counted, not eyeballed: 16 and 14.
      share: 'Send to my class',
    },
    ur: {
      body: (title) => `کیا آپ “${title}” پر ایک مختصر کوئز کرنا چاہیں گی؟\n\n`
        + `15 آسان سوالات — ہر جواب کے بعد بتاؤں گی کیسا رہا۔ `
        + `یا اسے سیدھا اپنی کلاس کو بھیجیں۔`,
      yes: 'جی، شروع کریں', no: 'ابھی نہیں',
      share: 'کلاس کو بھیجیں',
    },
  };
  return map[language] || map.en;
}

/** Handle the yes/no on the offer. Returns true if this button was ours. */
async function handleOfferButton(buttonId, phone) {
  if (buttonId !== OFFER_YES && buttonId !== OFFER_NO && buttonId !== OFFER_SHARE) {
    return false;
  }
  const offer = await redisService.get(OFFER_KEY(phone));
  if (!offer) {
    await WhatsAppService.sendMessage(phone,
      "That quiz offer has expired — pick the video again and I'll offer it fresh.");
    return true;
  }
  await redisService.delete(OFFER_KEY(phone));

  const shared = buttonId === OFFER_SHARE;
  const accepted = buttonId === OFFER_YES || shared;
  if (offer.deliveryId) {
    await supabase.from('video_quiz_deliveries').update({
      // 'shared' is its own answer, not a flavour of accepted: a teacher who
      // sends it to her class without taking it is a different behaviour from
      // one who sits the quiz, and collapsing them would hide that.
      quiz_response: shared ? 'shared' : (accepted ? 'accepted' : 'declined'),
      quiz_responded_at: new Date().toISOString(),
    }).eq('id', offer.deliveryId);
  }
  logEvent('video_quiz.offer_answered', {
    userId: offer.userId, quizId: offer.quizId, accepted, shared,
  });

  if (shared) {
    // Straight to the class link — no solo session, so she is never sent
    // question 1 while also holding the message she is meant to forward.
    const VideoQuizShare = require('./video-quiz-share.service');
    await VideoQuizShare.deliverClassLink({
      quizId: offer.quizId, videoId: offer.videoId, userId: offer.userId,
      language: offer.language,
    }, phone);
    return true;
  }

  if (!accepted) {
    // Declined: the video-only survey fires, as it always did.
    const StudentVideoFeedback = require('../student-video-feedback.service');
    await WhatsAppService.sendMessage(phone, 'No problem — enjoy the video!');
    StudentVideoFeedback.scheduleFeedbackPrompt({
      videoId: offer.videoId, userId: offer.userId, phone,
      context: { language: offer.language, scope: 'video', deliveryId: offer.deliveryId },
    });
    return true;
  }

  await startSession({
    phone, userId: offer.userId, quizId: offer.quizId, videoId: offer.videoId,
    language: offer.language, deliveryId: offer.deliveryId, source: 'video_solo',
  });
  return true;
}

// ─── Session ────────────────────────────────────────────────────────────────

/**
 * Pick the questions and open a session.
 *
 * SELECTION: legacy first, generated as top-up (operator decision). The legacy
 * bank is the media-rich one — real recorded audio, real illustration — so a
 * child gets the richer items before any generated text MCQ. Ordered within
 * each source by sort_order so a video's questions arrive in their authored
 * sequence rather than shuffled.
 */
async function startSession({ phone, userId, quizId, videoId, language, deliveryId,
                              source = 'video_solo', studentName = null,
                              studentClass = null, shareCodeId = null,
                              studentId = null, invitedByStudentId = null }) {
  const { data: questions, error } = await supabase
    .from('quiz_questions')
    .select('id, external_id, sort_order')
    .eq('quiz_id', quizId)
    .order('external_id', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error || !questions || !questions.length) {
    logToFile('❌ video-quiz: no questions for quiz', { quizId, error: error?.message });
    await WhatsAppService.sendMessage(phone,
      "Sorry — I couldn't load that quiz just now. Please try again later.");
    return null;
  }

  const legacy = questions.filter((q) => (q.external_id || '').startsWith('leg:'));
  const generated = questions.filter((q) => !(q.external_id || '').startsWith('leg:'));
  const chosen = [...legacy, ...generated].slice(0, QUESTIONS_PER_SESSION);

  const { data: session, error: sErr } = await supabase
    .from('quiz_sessions')
    .insert({
      quiz_id: quizId,
      user_id: userId,
      // the FK to `students` has existed since the schema landed but
      // was never populated. Filling it is what lets a child be recognised on
      // their next quiz, and what ties a run to a person rather than a string.
      student_id: studentId,
      // set when this child came through a friend's invite. On
      // completion the friend is told how they did.
      invited_by_student_id: invitedByStudentId,
      student_name: studentName,
      student_class: studentClass,
      share_code_id: shareCodeId,
      source,
      parent_phone: phone,
      status: 'in_progress',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (sErr || !session) {
    // Checked, not ignored: the parent quiz silently swallowed exactly this
    // error for months  and nobody noticed the status never moved.
    logToFile('❌ video-quiz: could not create session', { quizId, error: sErr?.message });
    await WhatsAppService.sendMessage(phone,
      "Sorry — I couldn't start that quiz. Please try again in a moment.");
    return null;
  }

  const state = {
    sessionId: session.id, quizId, videoId, userId, language, deliveryId, source,
    shareCodeId,
    // carried so the invite offer at the end knows who to attribute it
    // to — without it we would offer an invite we cannot report back on.
    studentId,
    questionIds: chosen.map((q) => q.id),
    index: 0, correct: 0, answered: 0,
    currentQuestionId: null,
  };
  await redisService.set(STATE_KEY(phone), state, STATE_TTL_SECS);
  logEvent('video_quiz.session_started', {
    sessionId: session.id, quizId, source, questions: chosen.length,
  });

  await WhatsAppService.sendMessage(phone,
    `Here we go — ${chosen.length} questions. Take your time!`);
  await sendNextQuestion(phone, state);
  return state;
}

async function sendNextQuestion(phone, state) {
  if (state.index >= state.questionIds.length) return finish(phone, state);

  const questionId = state.questionIds[state.index];
  const { data: q, error } = await supabase
    .from('quiz_questions')
    .select('id, question_text, option_a, option_b, option_c, option_d, correct_option, '
            + 'explanation, option_feedback, media, render_pattern')
    .eq('id', questionId)
    .single();
  if (error || !q) {
    logToFile('⚠️ video-quiz: question missing, skipping', { questionId });
    state.index += 1;
    await redisService.set(STATE_KEY(phone), state, STATE_TTL_SECS);
    return sendNextQuestion(phone, state);
  }

  const msgs = render.build(q);
  const ctx = { questionId: q.id, sessionId: state.sessionId };

  await WhatsAppService.sendMessage(phone,
    `*Question ${state.index + 1} of ${state.questionIds.length}*`);
  await sender.sendPhase(phone, msgs, 'question', ctx);
  const res = await sender.sendPhase(phone, msgs, 'interaction', ctx);

  if (res.pickerFailed) {
    // No tap surface reached the child — do not leave them waiting on a
    // question they cannot answer.
    await WhatsAppService.sendMessage(phone,
      "Sorry — that question didn't load properly. Moving on to the next one.");
    state.index += 1;
    await redisService.set(STATE_KEY(phone), state, STATE_TTL_SECS);
    return sendNextQuestion(phone, state);
  }

  state.currentQuestionId = q.id;
  state.sentAt = Date.now();
  await redisService.set(STATE_KEY(phone), state, STATE_TTL_SECS);
  return null;
}

/**
 * Grade a tap and move on. Returns true if the input belonged to a video quiz.
 */
async function handleAnswer(phone, inputId) {
  const parsed = render.parseAnswer(inputId);
  if (!parsed) return false;
  const state = await redisService.get(STATE_KEY(phone));
  if (!state) {
    await WhatsAppService.sendMessage(phone,
      "That quiz has finished. Pick another video and I'll offer you a fresh one!");
    return true;
  }

  const { data: q } = await supabase
    .from('quiz_questions')
    .select('id, question_text, option_a, option_b, option_c, option_d, correct_option, '
            + 'explanation, option_feedback, media, render_pattern')
    .eq('id', parsed.questionId)
    .single();
  if (!q) return true;

  const correctIdx = render.correctIndices(q);
  const isCorrect = correctIdx.includes(parsed.index);
  const letter = 'ABCD'[parsed.index] || 'A';

  const { error: aErr } = await supabase.from('quiz_answers').insert({
    session_id: state.sessionId,
    question_id: q.id,
    selected_option: letter,
    is_correct: isCorrect,
    response_time_seconds: state.sentAt
      ? Math.round((Date.now() - state.sentAt) / 1000) : null,
  });
  if (aErr && aErr.code === '23505') {
    // UNIQUE(session_id, question_id) — a double tap, already recorded.
    return true;
  }
  if (aErr) logToFile('⚠️ video-quiz: answer insert failed', { error: aErr.message });

  // No emoji reaction here: sendReaction needs the message id of the child's
  // own reply, which the webhook gives us but this path does not carry. Calling
  // it with null would fail silently on every single answer — dead code that
  // reads like a working feature. The verdict text opens with ✅ / "Not quite"
  // anyway, so the feedback is not lost.
  const msgs = render.build(q);
  await sender.sendPhase(phone, msgs, 'answer', {
    questionId: q.id, sessionId: state.sessionId,
    isCorrect, selectedIndex: parsed.index,
  });

  state.answered += 1;
  state.correct += isCorrect ? 1 : 0;
  state.index += 1;
  state.currentQuestionId = null;
  await redisService.set(STATE_KEY(phone), state, STATE_TTL_SECS);

  await supabase.from('quiz_sessions').update({
    total_questions_answered: state.answered,
    correct_answers: state.correct,
  }).eq('id', state.sessionId);

  await new Promise((r) => setTimeout(r, 1200));
  await sendNextQuestion(phone, state);
  return true;
}

async function finish(phone, state) {
  const total = state.answered || 0;
  const pct = total ? Math.round((state.correct / total) * 100) : 0;
  const level = pct >= 80 ? 'mastered' : pct >= 60 ? 'developing' : 'needs_practice';

  await supabase.from('quiz_sessions').update({
    status: 'completed',
    total_questions_answered: total,
    correct_answers: state.correct,
    mastery_percentage: pct,
    mastery_level: level,
    completed_at: new Date().toISOString(),
  }).eq('id', state.sessionId);

  await redisService.delete(STATE_KEY(phone));

  await WhatsAppService.sendMessage(phone,
    `🎉 All done!\n\nYou got *${state.correct} out of ${total}* right (${pct}%).\n\n`
    + (pct >= 80 ? 'Brilliant work!' : pct >= 60
      ? "Nicely done — a little more practice and you'll have it."
      : 'Good effort — this one is worth another go.'));

  logEvent('video_quiz.completed', {
    sessionId: state.sessionId, quizId: state.quizId, total,
    correct: state.correct, pct, source: state.source,
  });

  // a child finishing a shared quiz may have been the last one. If
  // every session on that share code is now terminal, the teacher's report goes
  // out immediately instead of waiting for the morning.
  if (state.source === 'share_link' && state.shareCodeId) {
    const report = require('./video-quiz-report.service');
    await report.maybeSendEarly(state.shareCodeId)
      .catch((err) => logToFile('⚠️ early report failed', { error: err.message }));

    // if a friend sent them here, tell that friend how they did, then
    // offer them the same. Both are best-effort: a child's own quiz must never
    // fail because of something that happens after they finish it.
    const Invite = require('./video-quiz-invite.service');
    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('quiz_id, student_name, correct_answers, total_questions_answered, '
              + 'mastery_percentage, invited_by_student_id')
      .eq('id', state.sessionId)
      .maybeSingle();
    if (session?.invited_by_student_id) {
      await Invite.notifyInviter(session)
        .catch((err) => logToFile('⚠️ inviter notify failed', { error: err.message }));
    }
    await Invite.offerInvite({
      phone, studentId: state.studentId, shareCodeId: state.shareCodeId,
      language: state.language,
    }).catch((err) => logToFile('⚠️ invite offer failed', { error: err.message }));
  }

  // Only the solo path gets the video survey and the share offer. A child who
  // arrived via a share link is not the person who chose the video.
  if (state.source === 'video_solo') {
    const share = require('./video-quiz-share.service');
    await share.offerShare({
      phone, userId: state.userId, quizId: state.quizId,
      videoId: state.videoId, language: state.language,
    }).catch((err) => logToFile('⚠️ share offer failed', { error: err.message }));

    const StudentVideoFeedback = require('../student-video-feedback.service');
    StudentVideoFeedback.scheduleFeedbackPrompt({
      videoId: state.videoId, userId: state.userId, phone,
      context: {
        language: state.language, scope: 'video_and_quiz',
        quizSessionId: state.sessionId, deliveryId: state.deliveryId,
      },
    });
  }
  return null;
}

async function getActiveState(phone) {
  return redisService.get(STATE_KEY(phone));
}

module.exports = {
  offerAfterVideo,
  handleOfferButton,
  handleAnswer,
  startSession,
  sendNextQuestion,
  getActiveState,
  quizForVideo,
  QUESTIONS_PER_SESSION,
  OFFER_YES,
  OFFER_NO,
  OFFER_SHARE,
  offerStrings,
  STATE_KEY,
  OFFER_KEY,
};
