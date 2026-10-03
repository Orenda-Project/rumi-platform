/**
 * Start a leader observation from an inbound recording, and cancel one.
 *
 * Called by observe-audio-router.js when a coach in the awaiting_audio state
 * sends any audio — no length threshold: the coach already declared intent by
 * typing /observe (or picking a visit).
 *
 * Creates the coaching_sessions row with the observer split
 * (observation_type='leader_observation', observer_user_id = the coach) at
 * status 'confirmed' — there is no Yes/No confirm step, the analysis claim
 * accepts 'confirmed' — and queues transcription on the normal coaching
 * pipeline. Whether the row is a leader observation is read from the ROW from
 * here on, never from a queue payload, so a lost payload field cannot turn an
 * observation into a teacher's own coaching session.
 */

const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const ObserveState = require('./observe-state.service');
const { t, observeLang } = require('./observe-strings');
const { isTerminalStatus, TERMINAL_IN_FILTER } = require('./observe-terminal');
const { logToFile } = require('../../utils/logger');

/**
 * The bound teacher's users.id, so the session row is owned by the TEACHER
 * (their trend keys correctly from day one) while the coach stays
 * observer_user_id. The roster already knows the id; a teacher named by phone
 * is looked up. Any failure → null (the coach stays owner — never a dead end).
 */
async function resolveBoundTeacherUserId(boundTeacher) {
  try {
    if (!boundTeacher) return null;
    if (boundTeacher.user_id) return boundTeacher.user_id;
    if (!boundTeacher.phone) return null;
    const { userIdForIdentity } = require('./observe-identity');
    return await userIdForIdentity(boundTeacher.phone);
  } catch (_) {
    return null;
  }
}

/** The two buttons every capture ack carries. Ids: observe_ok_<id>, observe_cancel_<id>. */
function buildCaptureAck(lang, sessionId) {
  return {
    body: `${t(lang, 'audio_received')}\n\n${t(lang, 'capture_next_hint')}`.trim(),
    buttons: [
      { id: `observe_ok_${sessionId}`, title: t(lang, 'btn_ok_wait').slice(0, 20) },
      { id: `observe_cancel_${sessionId}`, title: t(lang, 'btn_cancel_obs').slice(0, 20) },
    ],
  };
}

/**
 * @param {object} user  the coach's users row
 * @param {string} from  the coach's channel identity
 * @param {string} audioId  media id (voice note or file)
 * @param {string} sessionId  chat session id
 * @param {number|null} audioDurationSeconds
 * @returns {Promise<object|null>} the coaching_sessions row
 */
async function startFromAudio(user, from, audioId, sessionId, audioDurationSeconds = null) {
  const lang = observeLang(user);

  // The visit picker binds a teacher BEFORE the recording. When bound, the
  // teacher owns the row; the observer split below is the same either way.
  let ownerUserId = user.id;
  let boundTeacher = null;
  try {
    const st = await ObserveState.getState(user.id);
    if (st && st.boundTeacher) {
      boundTeacher = st.boundTeacher;
      const teacherId = await resolveBoundTeacherUserId(st.boundTeacher);
      if (teacherId) ownerUserId = teacherId;
    }
  } catch (_) { /* unbound capture */ }

  const { data: session, error } = await supabase
    .from('coaching_sessions')
    .insert({
      user_id: ownerUserId,
      session_id: sessionId,
      audio_id: audioId,
      audio_duration_seconds: audioDurationSeconds,
      status: 'confirmed',
      observation_type: 'leader_observation',
      observer_user_id: user.id,
      debrief_status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !session) {
    // A DB write failure, NOT a missing account. Reporting it as "I couldn't
    // find your account" hides a missing-column error and sends people chasing
    // registration. Say what actually failed.
    logToFile('❌ observe: failed to create observation session', {
      userId: user.id, sessionId, audioId, error: error && error.message,
    });
    await WhatsAppService.sendMessage(from, t(lang, 'capture_failed'));
    return null;
  }

  const CoachingJobQueueService = require('../coaching/coaching-job-queue.service');
  await CoachingJobQueueService.queueTranscription(session.id, { from, audioId });

  // The observation started — retire the matching upcoming visit so the
  // teacher leaves "my schedule". Tolerant: a schedule failure never blocks
  // the capture.
  if (boundTeacher && boundTeacher.teacher_ext_id) {
    try {
      const ScheduleStore = require('./observe-schedule.service');
      await ScheduleStore.markDone(user.id, boundTeacher.teacher_ext_id, boundTeacher.school_ext_id || null, session.id);
    } catch (err) {
      logToFile('⚠️ observe: schedule markDone failed (non-blocking)', { userId: user.id, error: err.message });
    }
  }

  // FREE the slot — the pipeline lives on the DB row, not in Redis. Keeping a
  // busy state here is what made a second recording unbindable: the router saw
  // no armed state and the audio leaked into teacher coaching. The next
  // recording now gets the "whose is this?" question instead.
  await ObserveState.clearState(user.id);

  // The ack carries a way out. This is NOT a gate on the work — transcription
  // is already queued above — it saves the wrong report reaching a teacher.
  await WhatsAppService.sendInteractiveButtons(from, buildCaptureAck(lang, session.id));

  // An UNBOUND capture records no teacher, so the pending list can only show a
  // date. Ask who was observed — after the ack, so analysis proceeds
  // regardless, and never let it throw: a missing name must never cost a coach
  // their recording.
  if (!boundTeacher) {
    try {
      const ObserveWho = require('./observe-who.service');
      await ObserveWho.maybeAskObservedTeacher(user, from, session.id);
    } catch (err) {
      logToFile('⚠️ observe: who-ask failed (non-blocking)', { userId: user.id, error: err.message });
    }
  }

  // A BOUND capture knows its teacher, so the coach can say which of their
  // plans the lesson was taught from (Section B). Same rules as the who-ask:
  // after the ack, never blocking, never throwing. An unbound capture is asked
  // once the teacher is named (observe-who).
  if (boundTeacher && session.user_id !== user.id) {
    try {
      const ObservePlan = require('./observe-plan.service');
      await ObservePlan.maybeAskForPlan(user, from, session.id);
    } catch (err) {
      logToFile('⚠️ observe: plan-ask failed (non-blocking)', { userId: user.id, error: err.message });
    }
  }

  logToFile('🔭 observe: observation capture started', {
    coachingSessionId: session.id, observerId: user.id, audioId, bound: !!boundTeacher,
  });
  return session;
}

/** "Cancel this observation?" — asked once, so a stray tap never cancels. */
async function askCancel(user, from, sessionId) {
  const lang = observeLang(user);
  await WhatsAppService.sendInteractiveButtons(from, {
    body: t(lang, 'cancel_confirm_body'),
    buttons: [
      { id: `observe_cancel_yes_${sessionId}`, title: t(lang, 'btn_cancel_yes').slice(0, 20) },
      { id: `observe_ok_${sessionId}`, title: t(lang, 'btn_back').slice(0, 20) },
    ],
  });
  return true;
}

/**
 * Cancel an observation the coach owns. Refused once the report has reached
 * the teacher. The write carries the not-terminal predicate so a cancel and a
 * late pipeline step cannot both win.
 */
async function cancelObservation(user, from, sessionId) {
  const lang = observeLang(user);
  const { data: session } = await supabase
    .from('coaching_sessions')
    .select('id, status, observer_user_id, analysis_data')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.observer_user_id !== user.id) {
    await WhatsAppService.sendMessage(from, t(lang, 'debrief_not_yours'));
    return true;
  }
  if (isTerminalStatus(session.status)) {
    await WhatsAppService.sendMessage(from, t(lang, 'cancel_ack'));
    return true;
  }
  const delivery = (session.analysis_data && session.analysis_data.teacher_delivery) || {};
  if (delivery.status === 'sent' || delivery.status === 'delivered') {
    await WhatsAppService.sendMessage(from, t(lang, 'cancel_too_late'));
    return true;
  }
  await supabase.from('coaching_sessions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .not('status', 'in', TERMINAL_IN_FILTER);
  const st = await ObserveState.getState(user.id);
  if (st && st.sessionId === sessionId) await ObserveState.clearState(user.id);
  await WhatsAppService.sendMessage(from, t(lang, 'cancel_ack'));
  logToFile('🗑 observe: observation cancelled by coach', { sessionId, userId: user.id });
  return true;
}

module.exports = {
  startFromAudio, resolveBoundTeacherUserId, buildCaptureAck, askCancel, cancelObservation,
};
