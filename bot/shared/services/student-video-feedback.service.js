/**
 * Student Video Feedback Service
 *
 * Post-delivery thumbs-up / thumbs-down micro-survey for the Student Video
 * Library:
 *
 *  1. scheduleFeedbackPrompt(...) — called from student-videos-endpoint
 *     deliverVideoAsync(...) AFTER the video is sent successfully.
 *  2. sendFeedbackPrompt(...) — fires `delayMs` (30s) later via setTimeout;
 *     sends a 2-button interactive message (👍 Yes / 👎 Not really).
 *  3. handleFeedbackButton(...) — webhook button handler for
 *     student_video_feedback_yes_* / student_video_feedback_no_* button ids.
 *     - Inserts a row into student_video_feedback (or no-ops on duplicate).
 *     - On "no": sets Redis flag student_video_feedback_pending:{userId} and
 *       sends a "What didn't work?" follow-up.
 *  4. consumeReasonIfPending(...) — called from text-message.handler BEFORE
 *     any routing; if the Redis flag is set, captures the next inbound text
 *     as the reason and returns true so the handler short-circuits.
 *
 * Design tradeoffs:
 *  - Detached setTimeout for the 30s delay (lost on bot restart; acceptable
 *    at low-volume scale — upgrade to a delayed queue message if loss > 5%).
 *  - Redis flag with TTL = 600s = 10-min reason-capture window.
 *  - Single row per (user, video) — duplicate taps update `useful` and re-arm
 *    the Redis flag if the user toggles their answer.
 */

const supabase = require('../config/supabase');
const redisService = require('./cache/railway-redis.service');
const WhatsAppService = require('./whatsapp.service');
const { logEvent } = require('../utils/structured-logger');
const { logToFile } = require('../utils/logger');

// 30s after video delivery.
const FEEDBACK_DELAY_MS = 30 * 1000;
const REASON_WINDOW_SECS = 600;                // 10-min reason-capture window
const REDIS_REASON_KEY = (userId) => `student_video_feedback_pending:${userId}`;

const BUTTON_RX = /^student_video_feedback_(yes|no)_([0-9a-f-]{36})$/;

function gradeTitle(g) {
  const s = String(g || '');
  if (s === 'NURSERY') return 'Nursery';
  if (s === 'KG') return 'KG';
  if (!s) return '';
  return `Grade ${s}`;
}

/**
 * Localized final ack after the teacher sends a reason.
 * Falls back to detected reasonLanguage then to English.
 */
async function _localizedFinalAck(userId, reasonLanguage) {
  let lang = reasonLanguage || 'en';
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle();
    if (userRow?.preferred_language) lang = userRow.preferred_language;
  } catch (_) { /* fall through to reasonLanguage */ }
  switch (lang) {
    case 'ur': return 'سمجھ گئی، شکریہ — یہ ہمیں ویڈیو لائبریری بہتر بنانے میں مدد کرے گا۔';
    case 'sd': return 'سمجھ ۾ آيو، مهرباني — اھو اسان کي وڊيو لائبريري بهتر ڪرڻ ۾ مدد ڪندو۔';
    case 'pa': return 'سمجھ گئی، شکریہ — ایہ سانوں ویڈیو لائبریری بہتر بنان وچ مدد کرے گا۔';
    default: return 'Got it, thanks — this helps us improve the video library.';
  }
}

/**
 * Schedule a feedback prompt to fire `delayMs` after delivery.
 * Non-blocking — returns immediately; the prompt fires via setTimeout.
 *
 * @param {Object} opts
 * @param {string} opts.videoId - UUID of the student_videos row delivered
 * @param {string} opts.userId  - Teacher's user_id (UUID)
 * @param {string} opts.phone   - Teacher's phone (for sendInteractiveButtons)
 * @param {Object} opts.context - { grade, subject, topic, subtopic, language }
 * @param {number} [opts.delayMs=30000] - Delay before sending prompt
 */
function scheduleFeedbackPrompt(opts) {
  const { videoId, userId, phone, context = {}, delayMs = FEEDBACK_DELAY_MS } = opts;
  if (!videoId || !userId || !phone) {
    logToFile('Student Video Feedback: scheduleFeedbackPrompt missing field', { videoId, userId, phone });
    return;
  }
  logEvent('student_video.feedback_prompt.scheduled', {
    videoId, userId, phone, delayMs, ...context,
  });
  setTimeout(() => {
    sendFeedbackPrompt({ videoId, userId, phone, context }).catch((err) => {
      logToFile('Student Video Feedback: sendFeedbackPrompt threw', { error: err.message, videoId });
    });
  }, delayMs).unref?.();
}

/**
 * Send the 2-button "Did you like the video?" message.
 */
async function sendFeedbackPrompt({ videoId, userId, phone, context }) {
  const language = (context && context.language) || 'en';
  const isUrduLike = language === 'ur' || language === 'sd' || language === 'pa';

  let body;
  if (language === 'ur') {
    body = 'کیا آپ کو یہ ویڈیو پسند آئی؟';
  } else if (language === 'sd') {
    body = 'ڇا توھان کي اھا وڊيو پسند آئي؟';
  } else if (language === 'pa') {
    body = 'کیہہ تہانوں ایہ ویڈیو پسند آئی؟';
  } else {
    body = 'Did you like that video?';
  }

  // 20-char button cap; emoji counts as 2.
  const buttonYes = isUrduLike ? '👍 ہاں' : '👍 Yes';
  const buttonNo  = isUrduLike ? '👎 نہیں' : '👎 Not really';
  const buttons = [
    { id: `student_video_feedback_yes_${videoId}`, title: buttonYes },
    { id: `student_video_feedback_no_${videoId}`,  title: buttonNo  },
  ];

  const ok = await WhatsAppService.sendInteractiveButtons(phone, { body, buttons });

  logEvent('student_video.feedback_prompt.sent', {
    videoId, userId, phone, ok, ...context,
  });
}

/**
 * Handle a student_video_feedback_{yes,no}_* button reply.
 * Called from whatsapp-bot.js button_reply router.
 *
 * @param {string} buttonId Full button id (e.g. "student_video_feedback_yes_<uuid>")
 * @param {string} phone Teacher phone (sender of the tap)
 * @returns {Promise<boolean>} true if matched & handled, false otherwise
 */
async function handleFeedbackButton(buttonId, phone) {
  const match = BUTTON_RX.exec(buttonId || '');
  if (!match) return false;

  const useful = match[1] === 'yes';
  const videoId = match[2];

  // Look up the video row + the user (resolve user_id from phone)
  const { data: video, error: videoError } = await supabase
    .from('student_videos')
    .select('id, grade, subject, topic, subtopic')
    .eq('id', videoId)
    .maybeSingle();
  if (videoError || !video) {
    logToFile('Student Video Feedback: button tap for unknown video id', { videoId, err: videoError?.message });
    await WhatsAppService.sendMessage(phone, 'Thanks for the feedback!');
    return true;
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, preferred_language')
    .eq('phone_number', phone)
    .maybeSingle();
  if (userError || !userRow) {
    logToFile('Student Video Feedback: phone → user lookup failed', { phone, err: userError?.message });
    await WhatsAppService.sendMessage(phone, 'Thanks for the feedback!');
    return true;
  }
  const userId = userRow.id;
  const language = userRow.preferred_language || 'en';

  // Idempotent: check for an existing row for (user, video).
  const { data: existing } = await supabase
    .from('student_video_feedback')
    .select('id, useful')
    .eq('user_id', userId)
    .eq('video_id', videoId)
    .maybeSingle();

  if (existing) {
    if (existing.useful !== useful) {
      await supabase.from('student_video_feedback').update({ useful }).eq('id', existing.id);
    }
    logEvent('student_video.feedback.button_tapped_duplicate', {
      videoId, userId, phone, useful, existingId: existing.id,
    });
    if (useful) {
      await WhatsAppService.sendMessage(phone, _ackYes(language));
    } else {
      await redisService.set(
        REDIS_REASON_KEY(userId),
        { feedbackId: existing.id, polarity: 'disliked', promptedAt: Date.now() },
        REASON_WINDOW_SECS
      );
      await WhatsAppService.sendMessage(phone, _ackNoReasonPrompt(language));
    }
    return true;
  }

  // Insert the feedback row
  const { data: inserted, error: insertError } = await supabase
    .from('student_video_feedback')
    .insert({
      user_id: userId,
      video_id: videoId,
      useful,
      grade: video.grade,
      subject: video.subject,
      topic: video.topic,
      subtopic: video.subtopic,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    logEvent('student_video.feedback.insert_failed', {
      videoId, userId, phone, useful, error: insertError?.message || 'insert returned no row',
    });
    if (useful) {
      await WhatsAppService.sendMessage(phone, _ackYes(language));
    } else {
      await redisService.set(
        REDIS_REASON_KEY(userId),
        { feedbackId: '__orphan__', videoId, promptedAt: Date.now() },
        REASON_WINDOW_SECS
      );
      await WhatsAppService.sendMessage(phone, _ackNoReasonPrompt(language));
    }
    return true;
  }

  logEvent('student_video.feedback.button_tapped', {
    videoId, userId, phone, useful, feedbackId: inserted.id,
  });

  if (useful) {
    await WhatsAppService.sendMessage(phone, _ackYes(language));
  } else {
    await redisService.set(
      REDIS_REASON_KEY(userId),
      { feedbackId: inserted.id, polarity: 'disliked', promptedAt: Date.now() },
      REASON_WINDOW_SECS
    );
    await WhatsAppService.sendMessage(phone, _ackNoReasonPrompt(language));
  }
  return true;
}

function _ackYes(language) {
  switch (language) {
    case 'ur': return 'شکریہ — خوشی ہے یہ مفید تھی!';
    case 'sd': return 'مهرباني — خوشي آھي ته اھا مفيد ھئي!';
    case 'pa': return 'شکریہ — خوشی اے ایہ فائدہ مند سی!';
    default:   return 'Thanks — glad it helped!';
  }
}

function _ackNoReasonPrompt(language) {
  switch (language) {
    case 'ur': return 'بتانے کا شکریہ۔ کیا چیز کام نہیں آئی؟ (ایک سطر کا جواب کافی ہے)';
    case 'sd': return 'ٻڌائڻ جو شڪريو۔ ڪھڙي شيءَ ڪم نه آئي؟ (ھڪ لائين ڪافي آھي)';
    case 'pa': return 'دسن دا شکریہ۔ کیہڑی شے کم نہیں آئی؟ (اک لائن کافی اے)';
    default:   return "Thanks for letting us know. What didn't work? (one line is enough)";
  }
}

/**
 * Capture the next inbound text as the reason if the Redis flag is set.
 * Returns true if consumed (so the caller short-circuits).
 */
async function consumeReasonIfPending(userId, phone, text) {
  if (!userId || !text || !text.trim()) return false;

  let pending;
  try {
    pending = await redisService.get(REDIS_REASON_KEY(userId));
  } catch (err) {
    logToFile('Student Video Feedback: Redis get error (reason consumer)', { error: err.message });
    return false;
  }
  if (!pending || !pending.feedbackId) return false;

  // Slash commands → let the router handle
  if (text.trim().startsWith('/')) {
    logEvent('student_video.feedback.reason_skipped_slash_command', {
      userId, phone, feedbackId: pending.feedbackId,
    });
    return false;
  }

  // Clear flag first so a failed UPDATE doesn't trap the user
  try { await redisService.delete(REDIS_REASON_KEY(userId)); } catch (_) { /* non-fatal */ }

  // Heuristic: Arabic/Urdu/Persian script blocks → 'ur', else 'en'.
  const hasUrduScript = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text);
  const reasonLanguage = hasUrduScript ? 'ur' : 'en';
  const reasonTrimmed = text.trim().slice(0, 2000);

  if (pending.feedbackId === '__orphan__') {
    logEvent('student_video.feedback.reason_received_orphan', {
      userId, phone, reasonLanguage, reasonLength: reasonTrimmed.length,
      reasonText: reasonTrimmed, videoId: pending.videoId || null,
    });
    await WhatsAppService.sendMessage(phone, await _localizedFinalAck(userId, reasonLanguage));
    return true;
  }

  const reasonPolarity =
    pending.polarity === 'liked' ? 'liked' :
    pending.polarity === 'disliked' ? 'disliked' :
    'disliked';

  const { error: updateError } = await supabase
    .from('student_video_feedback')
    .update({
      reason_text: reasonTrimmed,
      reason_received_at: new Date().toISOString(),
      reason_language: reasonLanguage,
      reason_polarity: reasonPolarity,
    })
    .eq('id', pending.feedbackId);

  if (updateError) {
    logToFile('Student Video Feedback: reason UPDATE failed', {
      error: updateError.message, feedbackId: pending.feedbackId,
    });
    return false;
  }

  logEvent('student_video.feedback.reason_received', {
    userId, phone, feedbackId: pending.feedbackId, reasonLanguage,
    reasonLength: reasonTrimmed.length,
  });
  await WhatsAppService.sendMessage(phone, await _localizedFinalAck(userId, reasonLanguage));
  return true;
}

module.exports = {
  scheduleFeedbackPrompt,
  sendFeedbackPrompt,
  handleFeedbackButton,
  consumeReasonIfPending,
  // exported for tests:
  FEEDBACK_DELAY_MS,
  REASON_WINDOW_SECS,
  REDIS_REASON_KEY,
  BUTTON_RX,
  gradeTitle,
};
