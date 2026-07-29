'use strict';
/**
 * a child passes the quiz to a friend, and hears how they did.
 *
 * THE BOUNDARY
 * This is the only place in the feature where two CHILDREN exchange
 * information, so what crosses is deliberately small: a first name and a score.
 * Not a family name, not a class, not a phone number, not which questions the
 * friend got wrong. Operator decision, 2026-07-28. If that ever widens it
 * should widen on purpose, not by someone adding a field to a query.
 *
 * THE STRUCTURAL CHOICE
 * A child arriving through an invite gets their session recorded against the
 * TEACHER's share code, not the invite. The teacher's class report therefore
 * needs no knowledge that invites exist — she queries one share code and sees
 * every child who took her quiz, however they reached it. The invite row only
 * decides who ALSO gets told when they finish.
 */

const supabase = require('../../config/supabase');
const redisService = require('../cache/railway-redis.service');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');

const INVITE_YES = 'vq_invite_yes';
const INVITE_NO = 'vq_invite_no';
const INVITE_TTL_SECS = 60 * 60;
const stripPlus = (p) => (p && p.startsWith('+') ? p.slice(1) : p);
const INVITE_KEY = (phone) => `videoquiz:${stripPlus(phone)}:invite`;

/** A child's first name. Nothing after the first space leaves their chat. */
function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || 'Your friend';
}

/**
 * Offer the invite after a child finishes.
 *
 * Skipped when we could not identify them: with no student id there is nobody
 * to send the comparison back to, so offering it would be a promise we cannot
 * keep.
 */
async function offerInvite({ phone, studentId, shareCodeId, language = 'en' }) {
  if (!studentId || !shareCodeId) return false;
  await redisService.set(INVITE_KEY(phone), { studentId, shareCodeId, language },
    INVITE_TTL_SECS);
  await WhatsAppService.sendInteractiveButtons(phone, {
    body: 'Want to send this quiz to a friend?\n\n'
      + "I'll tell you how they did once they finish.",
    buttons: [
      { id: INVITE_YES, title: 'Invite a friend' },   // 15 chars
      { id: INVITE_NO, title: 'No thanks' },          // 9
    ],
  });
  return true;
}

/** Mint the invite and hand the child something to forward. */
async function handleInviteButton(buttonId, phone) {
  if (buttonId !== INVITE_YES && buttonId !== INVITE_NO) return false;
  const ctx = await redisService.get(INVITE_KEY(phone));
  await redisService.delete(INVITE_KEY(phone));
  if (buttonId === INVITE_NO || !ctx) return true;

  const share = require('./video-quiz-share.service');
  const { data: parent } = await supabase
    .from('quiz_share_codes')
    .select('id, quiz_id, video_id, teacher_user_id, teacher_name, topic, language')
    .eq('id', ctx.shareCodeId)
    .maybeSingle();
  if (!parent) return true;

  const { data: me } = await supabase
    .from('students').select('student_name').eq('id', ctx.studentId).maybeSingle();

  let minted = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = share.randomCode();
    const { data, error } = await supabase.from('quiz_share_codes').insert({
      code,
      quiz_id: parent.quiz_id,
      teacher_user_id: parent.teacher_user_id,
      video_id: parent.video_id,
      teacher_name: parent.teacher_name,
      topic: parent.topic,
      language: parent.language,
      invited_by_student_id: ctx.studentId,
      parent_share_code_id: parent.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('id, code').single();
    if (!error && data) { minted = data; break; }
    if (error && error.code !== '23505') {
      logToFile('❌ invite: could not mint code', { error: error.message });
      break;
    }
  }
  if (!minted || !share.botNumber()) {
    await WhatsAppService.sendMessage(phone,
      "Sorry — I couldn't make that link just now. Try again in a moment.");
    return true;
  }

  const link = `https://wa.me/${share.botNumber()}?text=QUIZ-${minted.code}`;
  await WhatsAppService.sendMessage(phone,
    'Here is the message — forward THIS one to your friend:');
  await WhatsAppService.sendMessage(phone,
    `📚 *Try this quiz!*\n\n${firstName(me?.student_name)} thinks you'd like this `
    + `quiz on *${parent.topic || 'today’s lesson'}*.\n\nTap here to start:\n${link}`);

  logEvent('video_quiz.friend_invited', {
    inviterStudentId: ctx.studentId, shareCodeId: parent.id, code: minted.code,
  });
  return true;
}

/**
 * Turn a scanned code into "which teacher's quiz is this, and who sent me?".
 *
 * A teacher code resolves to itself with no inviter. An invite resolves to its
 * PARENT, which is what keeps the class report whole.
 */
async function resolveInvite(code) {
  const { data: sc } = await supabase
    .from('quiz_share_codes')
    .select('id, code, quiz_id, video_id, teacher_user_id, teacher_name, topic, '
            + 'language, active, expires_at, invited_by_student_id, parent_share_code_id')
    .eq('code', code)
    .maybeSingle();
  if (!sc) return null;
  return {
    ...sc,
    shareCodeId: sc.parent_share_code_id || sc.id,
    invitedByStudentId: sc.invited_by_student_id || null,
  };
}

/**
 * The message an inviter gets once their friend finishes.
 *
 * Never framed as a defeat. Children show these to each other, and a line that
 * reads as "you lost" turns a quiz into something to avoid.
 */
function buildComparison({ inviter, friend, topic }) {
  const them = firstName(friend.student_name);
  const theirs = friend.correct_answers || 0;
  const outOf = friend.total_questions_answered || 0;
  const mine = inviter.correct_answers || 0;

  let line;
  if (theirs > mine) {
    line = `${them} edged you this time — worth another go.`;
  } else if (theirs < mine) {
    line = `You are still ahead. Nicely done.`;
  } else {
    line = `A dead heat — you both got the same.`;
  }

  return `🎯 *${them} finished your quiz!*\n\n`
    + `${them}: *${theirs}/${outOf}*\n`
    + `You: *${mine}/${outOf}*\n\n`
    + `${line}`;
}

/**
 * Tell the inviter how their friend did. Best-effort throughout — this is a
 * nicety, and nothing about the friend's own quiz should fail because of it.
 */
async function notifyInviter(session) {
  try {
    if (!session || !session.invited_by_student_id) return false;
    const { data: inviterStudent } = await supabase
      .from('students').select('id, student_name, phone')
      .eq('id', session.invited_by_student_id).maybeSingle();
    if (!inviterStudent?.phone) return false;

    // The inviter's own run of the SAME quiz, for the comparison.
    const { data: mine } = await supabase
      .from('quiz_sessions')
      .select('correct_answers, total_questions_answered, mastery_percentage')
      .eq('student_id', inviterStudent.id)
      .eq('quiz_id', session.quiz_id)
      .eq('status', 'completed')
      .limit(1);
    const inviterRun = (mine || [])[0];
    if (!inviterRun) return false;   // nothing to compare against

    await WhatsAppService.sendMessage(inviterStudent.phone,
      buildComparison({ inviter: inviterRun, friend: session, topic: session.topic }));

    logEvent('video_quiz.invite_result_sent', {
      inviterStudentId: inviterStudent.id, quizId: session.quiz_id,
    });
    return true;
  } catch (err) {
    logToFile('⚠️ could not tell the inviter how their friend did', {
      error: err.message,
    });
    return false;
  }
}

module.exports = {
  offerInvite, handleInviteButton, resolveInvite, buildComparison,
  notifyInviter, firstName, INVITE_YES, INVITE_NO, INVITE_KEY,
};
