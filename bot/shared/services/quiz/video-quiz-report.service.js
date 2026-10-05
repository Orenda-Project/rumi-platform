'use strict';
/**
 * The class report a teacher gets after sharing a video quiz.
 *
 * Fires the NEXT MORNING, or early once every child who started has finished —
 * whichever comes first. Same promise as the /quiz report, and deliberately the
 * same shape, because a teacher should not have to learn two report formats for
 * the same question ("how did my class do?").
 *
 * WHAT IT ANSWERS, in this order:
 *   1. how many started, how many finished
 *   2. the class average
 *   3. which questions the class found hardest — the actual teaching signal
 *   4. who has not done it yet
 *
 * Scheduling uses the existing SQS job queue rather than a new mechanism: the
 * parent quiz already cascades a `quiz_report` job and advances it when all
 * sessions reach a terminal state. This registers a sibling job type so the two
 * cannot dedupe against each other.
 */

const supabase = require('../../config/supabase');
const { LESSON_SOURCES, isLessonQuiz } = require('./quiz-sources');
const Funnel = require('./quiz-funnel');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const { stripEmphasis, classLabel, classHeading, normaliseClasses, gradeText, markLines } = require('../../utils/text-format');
const { clampLanguage, resolveUx } = require('../../config/ux-strings');
const { formatLessonDate , sloStatement } = require('./transcript-quiz-language');
const { excludeSelfTests } = require('./teacher-self-test');
// A question the author wrote with TeX maths (`$\frac{2}{9}$`) reaches the
// report flat ("2/9"): the chat lines, the guidance prompt and the report PDF
// all read what the class saw, never the source.
const { mathForChat } = require('./quiz-math');
// The one Urdu address rule (prompt half) and the second-person check (code half).
const { URDU_ADDRESS_RULE } = require('../../config/gender-neutral-address');
const { addressForms } = require('./transcript-quiz-address');

// One attempt per child: the rule lives in its own module so /quiz (the list,
// the nudge) counts children exactly as this report does.
const { oneAttemptPerChild } = require('./one-attempt-per-child');
const { scriptOf } = require('../../templates/quiz-brand');
const crypto = require('crypto');

/**
 * The job-type prefix is load-bearing, not cosmetic.
 *
 * queueJob routes by it: only `quiz_*` reaches SQS_QUIZ_QUEUE_URL, a STANDARD
 * queue that honours per-message DelaySeconds. Everything else lands on
 * SQS_QUEUE_URL, which is FIFO — and queueJob deliberately drops delaySeconds
 * there, because FIFO rejects it per-message. Under the old name
 * ('video_quiz_report') the delay was silently discarded and the "next morning"
 * report was delivered within seconds of the first child joining.
 *
 * Still distinct from the parent quiz's `quiz_report`, so the two can never
 * dedupe against each other.
 */
const JOB_TYPE = 'quiz_video_report';

/** The name this job shipped under before the rename. Still consumed so any
 *  message already sitting in the queue is not dropped on deploy. */
const LEGACY_JOB_TYPE = 'video_quiz_report';

/**
 * RTL (Perso-Arabic-script) quiz languages this report localises for — the
 * catalogue languages (config/ux-strings CATALOGUE_LANGUAGES) that write right
 * to left. Any other quiz language reads the English report chrome.
 */
const RTL_LANGS = new Set(require('../../config/ux-strings').CATALOGUE_LANGUAGES.filter(require('../../config/supported-languages').isRTL));

/** Scheduled report: this far after the first child joins. */
const REPORT_DELAY_MS = 12 * 60 * 60 * 1000;

/**
 * When the scheduled report should land: 12 hours after the first child joins.
 * A "next morning at 07:00" rule meant a 22-hour wait for a 9am share — the
 * teacher had already taught the follow-up lesson.
 *
 * CIVIL-HOURS GUARD: a plain +12h from an afternoon share lands at 2-4am. A
 * report that buzzes at 3am is worse than one that waits, so a target inside the
 * school's quiet hours (QUIET_HOURS, default 21-7) is moved to the end of them,
 * on the school's clock (SCHOOL_TIMEZONE) — config/school-clock.js, the one
 * place every teacher-facing timing rule asks. It is a floor, never a delay past
 * the following morning.
 */
function reportTargetUtc(now = new Date()) {
  const { deferOutOfQuiet } = require('../../config/school-clock');
  return deferOutOfQuiet(new Date(now.getTime() + REPORT_DELAY_MS));
}

/**
 * How long the "this code's report is scheduled" claim lives. The longest wait
 * is a join twelve hours before the quiet hours begin: +12 h lands at their
 * start and is moved to their end, about 22 h with the default window. The claim
 * must outlive the chain, or a later join starts a second one.
 */
const SCHEDULE_CLAIM_TTL_S = 26 * 60 * 60;
const scheduleClaimKey = (shareCodeId) => `vq:report:scheduled:${shareCodeId}`;

/**
 * Schedule the report for a share code. Idempotent per code — a second call
 * (another child joining) must not queue a second report.
 *
 * The idempotency is a Redis claim, NOT the SQS deduplication id: queueJob only
 * sends that id to a FIFO queue, and the quiz queue is STANDARD, so every join
 * used to start its own 12-hour re-queue chain (a median of 6 chains per code in
 * production, up to 92). Those chains saturated the quiz queue — teacher-tapped
 * quizzes waited 20+ minutes behind them — and each extra chain reached
 * generate() again after the report went out.
 *
 * Redis down → setNX fails open and the report is scheduled anyway: a duplicate
 * chain is harmless, a missing report is not. VIDEO_REPORT_SCHEDULE_ONCE=off
 * restores the per-join scheduling exactly.
 */
async function scheduleForShareCode(shareCodeId) {
  let claimed = false;
  try {
    const redisService = require('../cache/railway-redis.service');
    claimed = await redisService.setNX(scheduleClaimKey(shareCodeId), String(Date.now()), SCHEDULE_CLAIM_TTL_S);
  } catch (err) {
    // cannot de-dup → schedule anyway (fail open, as setNX itself does)
    logToFile('❌ video-quiz report: schedule claim failed, scheduling anyway', { shareCodeId, error: err.message }, 'error');
    claimed = true;
  }
  if (!claimed) {
    logEvent('video_quiz.report_schedule_skipped', { shareCodeId, why: 'already_scheduled' });
    return;
  }
  try {
    const SQSQueueService = require('../queue');
    const when = reportTargetUtc();
    const delaySeconds = Math.max(60, Math.floor((when - Date.now()) / 1000));
    await SQSQueueService.queueJob(shareCodeId, JOB_TYPE, {
      shareCodeId,
      // targetAt MUST live in the payload. queueJob builds its message
      // body from {groupId, jobType, payload, ...} and drops the options object,
      // so an options-only targetAt never reached the worker — the "not morning
      // yet, re-queue" cascade read undefined and generated the report on the
      // very first delivery.
      targetAt: when.toISOString(),
    }, {
      // SQS DelaySeconds caps at 900s; the handler re-queues until the target
      // time, the same cascade the parent quiz report uses.
      delaySeconds: Math.min(900, delaySeconds),
      deduplicationId: `${shareCodeId}-${JOB_TYPE}-morning`,
    });
    logEvent('video_quiz.report_scheduled', { shareCodeId, targetAt: when.toISOString() });
  } catch (err) {
    logToFile('❌ video-quiz report scheduling failed (non-fatal)', {
      shareCodeId, error: err.message,
    }, 'error');
    // Nothing was queued: give the claim back so the next child's join schedules it.
    if (claimed) {
      try {
        const redisService = require('../cache/railway-redis.service');
        await redisService.delete(scheduleClaimKey(shareCodeId));
      } catch (relErr) {
        // the claim lapses on its TTL; until then later joins find it and queue nothing
        logToFile('❌ video-quiz report: schedule claim not released', { shareCodeId, error: relErr.message }, 'error');
      }
    }
  }
}

/**
 * The SEND is single-flight per share code, too.
 *
 * generate() reads report_sent_at, builds the report for 35-80 s, sends it, and
 * only then stamps report_sent_at. Two calls that both read "not sent" both sent:
 * the legacy per-join chains all reaching the end of quiet hours at once, an SQS redelivery, a
 * teacher's /quiz tap while the scheduled run is mid-build. A Redis SET NX claim
 * now holds the share code from just before the build to just after the stamp.
 *
 * Deliberately NOT "stamp report_sent_at first": a send that then fails would
 * leave a report that never arrives marked as sent, and a missing report is worse
 * than a duplicate. For the same reason the claim is given back whenever the call
 * did not send, and Redis being down sends anyway (error-logged).
 *
 * The TTL is far above the slowest build; it only matters when a holder dies
 * mid-send or its stamp failed, and then the key must outlive a whole 07:00 burst.
 */
const SEND_CLAIM_TTL_S = 15 * 60;
const sendClaimKey = (shareCodeId) => `vq:report:sending:${shareCodeId}`;

/**
 * How long the teacher's own ask waits for a send already in flight: about twice
 * the slowest build seen in production (80 s). Mutable for tests only.
 */
const _sendClaimTiming = { pollMs: 2000, forceWaitMs: 150 * 1000 };

/**
 * Take the send claim. `owned` is true only when this call really wrote the key,
 * so a fail-open call never deletes a key that someone else may set meanwhile.
 * @returns {Promise<{claimed: boolean, owned: boolean, token: string}>}
 */
async function takeSendClaim(shareCodeId) {
  const token = `${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(6).toString('hex')}`;
  try {
    const redisService = require('../cache/railway-redis.service');
    const claimed = await redisService.setNX(sendClaimKey(shareCodeId), token, SEND_CLAIM_TTL_S);
    if (claimed && typeof redisService.isAvailable === 'function' && !redisService.isAvailable()) {
      // setNX answers "claimed" when it has no client: nothing guards this send
      logToFile('❌ video-quiz report: send claim unavailable (no Redis), sending unguarded', { shareCodeId }, 'error');
      return { claimed: true, owned: false, token };
    }
    return { claimed, owned: claimed, token };
  } catch (err) {
    // cannot single-flight → send anyway (fail open, as scheduleForShareCode does)
    logToFile('❌ video-quiz report: send claim failed, sending unguarded', { shareCodeId, error: err.message }, 'error');
    return { claimed: true, owned: false, token };
  }
}

/**
 * Give the claim back — only if it is still ours. get-then-delete is not atomic;
 * the window is the key expiring between the two calls, i.e. a call that ran past
 * SEND_CLAIM_TTL_S, which the TTL is sized to rule out.
 */
async function releaseSendClaim(shareCodeId, token) {
  try {
    const redisService = require('../cache/railway-redis.service');
    const current = await redisService.get(sendClaimKey(shareCodeId));
    if (current !== null && current !== undefined && String(current) === token) {
      await redisService.delete(sendClaimKey(shareCodeId));
    }
  } catch (err) {
    // the claim lapses on its TTL; until then other callers for this code send nothing
    logToFile('❌ video-quiz report: send claim not released', { shareCodeId, error: err.message }, 'error');
  }
}

async function readReportSentAt(shareCodeId) {
  const { data } = await supabase.from('quiz_share_codes')
    .select('report_sent_at').eq('id', shareCodeId).maybeSingle();
  return (data && data.report_sent_at) || null;
}

/**
 * The teacher asked from /quiz while another call holds the claim. /quiz tells the
 * teacher "no child has finished yet" on a false return, so losing the claim must
 * never answer false here. Wait for the holder instead:
 *   - report_sent_at moves → the report the teacher asked for just went to them;
 *   - the key disappears unstamped (the holder failed or stood down) → take it;
 *   - neither within forceWaitMs → send anyway: an explicit ask is never dropped.
 * @returns {Promise<{delivered?: boolean, claim?: object}>}
 */
async function waitForInFlightSend(shareCodeId, sentAtBefore) {
  const deadline = Date.now() + _sendClaimTiming.forceWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, _sendClaimTiming.pollMs));
    if (await readReportSentAt(shareCodeId) !== sentAtBefore) return { delivered: true };
    const claim = await takeSendClaim(shareCodeId);
    if (claim.claimed) return { claim };
  }
  logToFile('❌ video-quiz report: send claim held past the wait, sending the teacher\'s ask anyway',
    { shareCodeId, waitedMs: _sendClaimTiming.forceWaitMs }, 'error');
  return { claim: { claimed: true, owned: false, token: '' } };
}

/**
 * ONE automatic report per quiz. A scheduled run
 * on a share code whose report already went — a late join more than 26 h after the
 * schedule claim starts a fresh chain — used to be treated as a follow-up candidate
 * and could send a second report. VIDEO_REPORT_SCHEDULED_FOLLOWUP=on restores that.
 */
function scheduledFollowUpOn() {
  const raw = String(process.env.VIDEO_REPORT_SCHEDULED_FOLLOWUP || '').trim().toLowerCase();
  return raw === 'on' || raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * ONE follow-up, when materially more children finish after the report went out.
 *
 * The early "everyone who started has finished" send used to live here and is
 * gone. It decided on a SNAPSHOT — every session terminal, 2h quiet — and then
 * the door shut for good, because there was one report per share code ever. In
 * production it once sent a class report 3.0h after the first child while
 * a third was mid-quiz and a fourth started three minutes later; neither could
 * ever reach that teacher. We do not know the class size, so "every session is
 * terminal" cannot mean "the class is done" — only "nobody is mid-quiz in this
 * instant".
 *
 * Pure, so the rule can be asserted directly rather than through a stubbed
 * share-code lookup that never touches it.
 *
 * @param {number} reportedOn      children who had finished when the report went
 * @param {number} finishedSince   children who finished after it
 * @param {boolean} alreadyFollowedUp
 */
function followUpDecision({ reportedOn = 0, finishedSince = 0, alreadyFollowedUp = false } = {}) {
  if (alreadyFollowedUp) return { send: false, why: 'followup_already_sent' };
  // Three more children is worth a message on any class; half again as many is
  // worth it on a small one, which is where a premature report hurts most.
  const material = finishedSince > 0 && (finishedSince >= 3 || finishedSince >= reportedOn / 2);
  return material
    ? { send: true, why: 'more_children_finished' }
    : { send: false, why: 'not_enough_new' };
}

/**
 * A child just finished. If their teacher already has a report, see whether
 * enough has changed since to be worth one more.
 */
async function maybeSendFollowUp(shareCodeId) {
  if (!shareCodeId) return false;
  return generate(shareCodeId, { reason: 'follow_up' });
}

/**
 * The class(es) the CHILDREN entered, not a digest guess.
 *
 * The pre-send PDF used to print the DIGEST's grade band ("Grade 6-8" — the
 * model's guess about a recording, not a fact about a classroom, and a range
 * that wide is no use to the teacher). By the time the REPORT goes
 * out every child has typed a class into the join form, so this reads THAT
 * instead — and only from FINISHED sessions, because a class a child merely
 * started is not yet one this report can name.
 *
 * Two children in one class must not read as two classes: "7", "Class 7"
 * and " 7 " collapse — the unit word a child typed is stripped for the
 * comparison AND for the returned value (never for storage: the underlying
 * row is untouched). The caller — the template, or this file's own text
 * fallback below — puts the DOCUMENT's own unit word back on, once, via the
 * shared classHeading() helper.
 *
 * The grouping and the sort are NOT re-implemented here. Both this function
 * and classHeading() call the one exported normaliseClasses(), because two
 * copies of "what counts as the same class" is exactly the pair that drifts
 * and then disagrees on one teacher's report. This function's own job is
 * therefore only the part normaliseClasses cannot know: which sessions count.
 */
function classesTaught(sessions) {
  return normaliseClasses(
    (Array.isArray(sessions) ? sessions : [])
      .filter((s) => s && s.status === 'completed')
      .map((s) => s.student_class),
  );
}

/**
 * The chat the class report goes to, for ONE share code:
 *   1. the chat the class link was sent to, recorded on the code at mint time
 *      (`quiz_share_codes.teacher_to`) — a teacher on Matrix, Slack or Discord
 *      has no WhatsApp number to reach them at;
 *   2. for a lesson quiz minted before that column, the chat its hand-off went
 *      to (`quizzes.meta.teacher_to`) — but only on the quiz's own teacher's
 *      code. A video quiz is one row shared by every teacher who is sent that
 *      video, so nothing on that row can name one teacher's chat;
 *   3. the code's teacher's `users.phone_number`.
 */
async function reportRecipient(sc, teacher) {
  if (sc.teacher_to) return sc.teacher_to;
  if (sc.quiz_id) {
    const { data: quizRow } = await supabase.from('quizzes')
      .select('meta, quiz_source, teacher_id').eq('id', sc.quiz_id).maybeSingle();
    const perTeacher = quizRow && quizRow.quiz_source && quizRow.quiz_source !== 'video'
      && quizRow.teacher_id && quizRow.teacher_id === sc.teacher_user_id;
    if (perTeacher && quizRow.meta && quizRow.meta.teacher_to) return quizRow.meta.teacher_to;
  }
  return (teacher && teacher.phone_number) || null;
}

/**
 * Build and send the report. Safe to call twice — genuinely guarded on
 * `report_sent_at` (the previous version of this comment claimed a
 * guard that was never implemented and no column that existed).
 */
async function generate(shareCodeId, { reason = 'scheduled', force = false } = {}) {
  const { data: sc } = await supabase
    .from('quiz_share_codes')
    .select('id, code, quiz_id, teacher_user_id, teacher_name, topic, language, '
            + 'created_at, report_sent_at, teacher_to')
    .eq('id', shareCodeId)
    .maybeSingle();
  if (!sc) return false;

  // A second report is a FOLLOW-UP, not a duplicate. Whether it is worth sending
  // is decided below, once we know how many children finished after the first
  // one went out. `force` is the teacher asking from /quiz, and skips the whole
  // question.
  const isFollowUp = Boolean(sc.report_sent_at) && !force;

  // A completion never sends the teacher anything. Every finish
  // asks for a follow-up; before any report existed that call went straight
  // through, so the first child to finish sent the teacher's report (measured
  // over a week of real classes: a median of one child on it), and after it
  // one more follow-up could go. So: no reminders to teachers — the teacher
  // gets the scheduled report (12 h after the first join, moved out of the
  // school's quiet hours) and whatever they ask for from /quiz, nothing else. A late finisher
  // gets their class card from sendLateClassCards, on the child's side only.
  if (reason === 'follow_up' && !force) {
    logEvent('video_quiz.report_suppressed', {
      shareCodeId, reason, why: sc.report_sent_at ? 'followups_disabled' : 'before_first_report',
    });
    return false;
  }

  // One automatic report per quiz (see scheduledFollowUpOn): a scheduled run on a
  // share code that already has its report sends nothing; only /quiz (force) can.
  if (isFollowUp && !scheduledFollowUpOn()) {
    logEvent('video_quiz.report_suppressed', {
      shareCodeId, reason, why: 'already_reported', sentAt: sc.report_sent_at,
    });
    return false;
  }

  const { data: teacher } = await supabase
    .from('users').select('phone_number, preferred_language, name')
    .eq('id', sc.teacher_user_id).maybeSingle();
  const teacherTo = await reportRecipient(sc, teacher);
  if (!teacherTo) {
    logToFile('⚠️ video-quiz report: no teacher phone', { shareCodeId });
    Funnel.emit('report_failed', { quiz_id: sc.quiz_id, share_code_id: shareCodeId, reason: 'no_teacher_phone' });
    return false;
  }

  // Single-flight: one caller builds and sends; the rest stand down (see SEND_CLAIM_TTL_S).
  const sentAtBefore = sc.report_sent_at || null;
  let claim = await takeSendClaim(shareCodeId);
  if (!claim.claimed) {
    if (!force) {
      logEvent('video_quiz.report_suppressed', { shareCodeId, reason, why: 'send_in_progress' });
      return false;
    }
    const waited = await waitForInFlightSend(shareCodeId, sentAtBefore);
    if (waited.delivered) {
      logEvent('video_quiz.report_suppressed', { shareCodeId, reason, why: 'send_in_progress', delivered: true });
      return true;
    }
    claim = waited.claim;
  }

  const stamp = { stamped: false };
  let sent = false;
  try {
    // The claim may have come free because the winner FINISHED: its stamp is then
    // already on the row, and this call must not send the report again.
    if (await readReportSentAt(shareCodeId) !== sentAtBefore) {
      logEvent('video_quiz.report_suppressed', force
        ? { shareCodeId, reason, why: 'send_in_progress', delivered: true }
        : { shareCodeId, reason, why: 'already_reported' });
      return force;   // the teacher's ask was answered by the report that just went to them
    }
    sent = await buildAndSend(shareCodeId, sc, { ...teacher, phone_number: teacherTo }, { reason, isFollowUp, stamp });
    return sent;
  } finally {
    // Kept only when a report went out but report_sent_at could not be stamped:
    // then the key is the one thing stopping a racing chain from sending it again.
    if (claim.owned && !(sent && !stamp.stamped)) await releaseSendClaim(shareCodeId, claim.token);
  }
}

/**
 * Read the class, build the report and send it. Called by generate() once every
 * early-out has passed and the send claim is held.
 * `stamp.stamped` tells the caller whether report_sent_at really landed.
 */
async function buildAndSend(shareCodeId, sc, teacher, { reason, isFollowUp, stamp }) {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('id, user_id, student_id, student_name, student_class, parent_phone, status, '
            + 'total_questions_answered, correct_answers, mastery_percentage, completed_at, created_at')
    // Every child who took this quiz, a friend's invite included: the invite
    // files the friend under this teacher's code (video-quiz-invite.service.js).
    .eq('share_code_id', shareCodeId);

  // The teacher's own test run of this class link must never read
  // as a pupil in that same report: not in the roster, not in the average, not in
  // the "0 students" branch.
  const rawAll = sessions || [];
  const noSelfTests = excludeSelfTests(rawAll, sc.teacher_user_id);
  if (noSelfTests.length < rawAll.length) {
    logEvent('video_quiz.self_test_excluded', {
      shareCodeId, n: rawAll.length - noSelfTests.length,
    });
  }
  // One attempt per child, before anything is counted.
  const all = oneAttemptPerChild(noSelfTests);
  if (all.length < noSelfTests.length) {
    logEvent('video_quiz.retakes_collapsed', {
      shareCodeId, rows: noSelfTests.length, children: all.length,
    });
  }
  const done = all.filter((s) => s.status === 'completed');

  // The follow-up rule needs both halves of the class: who the first report
  // covered, and who finished after it.
  if (isFollowUp) {
    const sentAt = new Date(sc.report_sent_at).getTime();
    // An unknown completed_at counts as ALREADY reported: a missing timestamp
    // must never manufacture a follow-up out of a child the teacher has seen.
    const reportedOn = done.filter((s) => !s.completed_at
      || new Date(s.completed_at).getTime() <= sentAt).length;
    const finishedSince = done.length - reportedOn;
    const { data: qRow } = await supabase.from('quizzes')
      .select('meta').eq('id', sc.quiz_id).maybeSingle();
    const already = Boolean(((qRow?.meta || {}).report_followups || {})[shareCodeId]);
    const decision = followUpDecision({ reportedOn, finishedSince, alreadyFollowedUp: already });
    if (!decision.send) {
      logEvent('video_quiz.report_suppressed', {
        shareCodeId, reason, why: decision.why, sentAt: sc.report_sent_at,
        reportedOn, finishedSince,
      });
      return false;
    }
    logEvent('video_quiz.report_followup', { shareCodeId, reportedOn, finishedSince });
    await supabase.from('quizzes').update({
      meta: {
        ...(qRow?.meta || {}),
        report_followups: {
          ...((qRow?.meta || {}).report_followups || {}),
          [shareCodeId]: new Date().toISOString(),
        },
      },
    }).eq('id', sc.quiz_id);
  }

  // Never send a results message with no results in it.
  //
  // A teacher once received "0 of 1 students finished" seconds after the first
  // child opened the link. An EARLY trigger only earns a send once somebody has
  // actually finished; before that there is nothing to say, and saying it
  // spends the teacher's attention on noise.
  //
  // The SCHEDULED morning run is different: that is the moment a report was
  // promised, so the teacher hears from us even if the class never finished. Silence
  // there would read as the feature being broken.
  if (reason !== 'scheduled' && !done.length) {
    logEvent('video_quiz.report_suppressed', {
      shareCodeId, reason, why: 'nothing_completed_yet', started: all.length,
    });
    return false;
  }

  // Transcript quizzes carry the lesson digest on the quiz row; the SLO each
  // question checks is stored in the question's external_id ("tq:<quizId>:S2:5";
  // older rows are "tq:S2:5" — the SLO is the second-to-last segment either way).
  //
  // The FULL digest — not just the SLO-statement map — now also reaches the
  // guidance generator: topic_as_taught, every SLO with its
  // taught_level, the misconceptions that surfaced in the lesson, and
  // lesson_summary (it may sit at either meta.digest.lesson_summary or
  // meta.lesson_summary — read both defensively, never throw when neither
  // exists). A video quiz (no lesson behind it) keeps digest === null and
  // behaves exactly as it did before the lesson quiz existed.
  let sloOf = () => null;
  let digest = null;
  let quizRow = null;
  try {
    ({ data: quizRow } = await supabase.from('quizzes')
      .select('quiz_source, meta, language, subject, grade').eq('id', sc.quiz_id).maybeSingle());
    // A LESSON quiz — from a coaching recording, a lesson plan or a topic —
    // carries the digest; a video quiz does not.
    const rawDigest = isLessonQuiz(quizRow?.quiz_source) ? (quizRow?.meta?.digest || null) : null;
    if (rawDigest) {
      const slos = Array.isArray(rawDigest.slos) ? rawDigest.slos : [];
      // D1: the report reads in the quiz's language, so its goal lines do too.
      const sloLang = quizRow?.language || quizRow?.meta?.content_language || 'en';
      const byId = new Map(slos.map((s) => [s.id, sloStatement(s, sloLang)]));
      sloOf = (externalId) => {
        const parts = String(externalId || '').split(':');
        return byId.get(parts[parts.length - 2]) || null;
      };
      digest = {
        topic_as_taught: rawDigest.topic_as_taught || null,
        slos: slos.map((s) => ({ id: s.id, statement: sloStatement(s, sloLang), taught_level: s.taught_level })),
        misconceptions_surfaced: Array.isArray(rawDigest.misconceptions_surfaced)
          ? rawDigest.misconceptions_surfaced : [],
        lesson_summary: rawDigest.lesson_summary || quizRow?.meta?.lesson_summary || null,
      };
    }
  } catch (e) {
    logToFile('⚠️ video-quiz report: could not read quiz digest (non-fatal)', { error: e.message });
  }

  if (!all.length) {
    await WhatsAppService.sendMessage(teacher.phone_number,
      resolveUx('vqReportNoOne', { language: clampLanguage(teacher.preferred_language), params: { topic: sc.topic } }));
    stamp.stamped = await markReportSent(shareCodeId, sc.quiz_id);
    // Stamped as a report, so counted as one — of its own kind. Unlogged, this
    // branch was 17.5% of production's report stamps (189 of 1,082) and every
    // one of them a class that never joined.
    Funnel.emit('report_sent', {
      quiz_id: sc.quiz_id, share_code_id: shareCodeId, source: quizRow && quizRow.quiz_source,
      kind: 'no_one', reason, n: 0,
    });
    return true;
  }

  const avg = done.length
    ? Math.round(done.reduce((s, x) => s + (x.mastery_percentage || 0), 0) / done.length)
    : 0;

  // The class(es) the CHILDREN entered. Passed to the
  // template as RAW (unit-word-stripped) values, never pre-formatted; the
  // text fallback below builds its own heading with the same helper so the
  // two surfaces say the same thing.
  const classes = classesTaught(done);

  // The tallies read the SAME attempts the report counts — never a dropped one.
  const hardest = (await hardestQuestions(shareCodeId, 3, all.map((s) => s.id)))
    .map((h) => ({ ...h, slo: sloOf(h.external_id) }));
  const unfinished = all.filter((s) => s.status !== 'completed');

  // The WhatsApp text fallback (only used when the PDF render fails) is the
  // same small chrome-string lookup the PDF template uses (see
  // PlayWriteReports skill), scoped down to what this plain-text path needs.
  // ── the two languages (the document is now single-language) ──
  // The DOCUMENT — the PDF, and the plain-text report that substitutes for it
  // when the render fails — now renders ENTIRELY in the quiz's CONTENT
  // language: labels, the roster chrome, the "for tomorrow" reteach block,
  // all of it, because a report mixing "if it is in English why does it have
  // Urdu in it" reads as broken. Only the WhatsApp
  // CAPTION that carries the PDF stays in the teacher's own preference — a caption is
  // an interstitial, not part of the document.
  // This reverses the round-2 chrome/content split for documents only; the
  // language/contentLanguage plumbing itself stays (both are still passed
  // through to the template), so nothing else moves.
  const chromeLang = clampLanguage(teacher.preferred_language);   // the CAPTION — the teacher's
  const contentLang = clampLanguage(sc.language);                 // the DOCUMENT — the quiz's

  // Same helper the template calls internally on this exact `classes` array —
  // the fallback and the PDF must name the class(es) identically.
  const classHeadingText = classHeading(classes, contentLang);

  const TX = RTL_LANGS.has(contentLang) ? {
    // The fallback IS the document on another surface, so it carries the
    // template's round-5 chrome word for word: `quiz` in Latin (a term of
    // record, never the transliteration), "کلاس کا اوسط" with its linker
    // rather than the calque that meant nothing, and "بچے" rather than the
    // masculine-marked "طالب علم".
    results: (t) => `📊 *quiz کے نتائج — ${t || 'آپ کا ویڈیو quiz'}*`,
    finished: (d, a) => `${a} میں سے ${d} بچوں نے مکمل کیا۔`,
    average: (n) => `کلاس کا اوسط: *${n}%*`,
    howEach: 'ہر بچے کی کارکردگی',
    reteach: 'دوبارہ پڑھانے کے قابل — سب سے زیادہ غلط:',
    gotWrong: (n, t) => `${t} میں سے ${n} نے غلط جواب دیا`,
    notFinished: (names) => `ابھی مکمل نہیں کیا: ${names}`,
    forTomorrow: '💡 *کل کے لیے*',
    // Word-for-word the template's CHROME.ur guidance labels — the PDF and
    // the text fallback are the same document on two surfaces, and a teacher
    // who gets the fallback one week and the PDF the next must not have to
    // learn two vocabularies for the same three parts.
    muddledLabel: 'بچے کہاں الجھے', boardLabel: 'کل اسے دوبارہ کیسے پڑھائیں',
    checkLabel: 'آخر میں یہ پوچھیں',
    secureLabel: 'بچوں کو یہ پکا آ گیا', stretchLabel: 'کل انہیں ایک قدم آگے کیسے لے جائیں',
  } : {
    results: (t) => `📊 *Quiz results — ${t || 'your video quiz'}*`,
    finished: (d, a) => `${d} of ${a} students finished.`,
    average: (n) => `Class average: *${n}%*`,
    howEach: 'How each student did',
    reteach: '*Worth reteaching* — most missed:',
    gotWrong: (n, t) => `${n} of ${t} got this wrong`,
    notFinished: (names) => `*Not finished yet:* ${names}`,
    forTomorrow: '💡 *For tomorrow*',
    muddledLabel: 'Where they got muddled', boardLabel: 'How to reteach it tomorrow',
    checkLabel: 'Ask this at the end',
    secureLabel: 'What they have secure', stretchLabel: 'How to stretch them tomorrow',
  };

  // The caption is chrome, so it comes from THE TEACHER'S preference, never the
  // document's content language — the teacher may not read the quiz's language
  // at all, and the caption is the one part of this send they must understand.
  const CAPTION = RTL_LANGS.has(chromeLang) ? {
    caption: (t, d, a, n) => `📊 کلاس کے نتائج — *${t}*\n\n`
      + `${a} میں سے ${d} نے مکمل کیا${n ? ` · دوبارہ پڑھانے کے قابل ${n} سوال — اندر` : ''}`,
  } : {
    caption: (t, d, a, n) => `📊 Class results — *${t}*\n\n`
      + `${d} of ${a} finished${n ? ` · ${n} question${n > 1 ? 's' : ''} worth reteaching — inside` : ''}`,
  };

  const lines = [
    TX.results(sc.topic),
    classHeadingText,
    '',
    TX.finished(done.length, all.length),
    done.length ? TX.average(avg) : '',
    '',
  ];

  if (done.length) {
    const sorted = [...done].sort((a, b) => (b.mastery_percentage || 0) - (a.mastery_percentage || 0));
    lines.push(`*${TX.howEach}*`);
    // The same rule as the PDF roster: a child's class is printed only when the
    // class differs between children, and then one way ("Class 5" / "جماعت 5"),
    // never as the child typed it.
    const perChildClass = classes.length > 1;
    sorted.forEach((s) => {
      const label = perChildClass ? classLabel(s.student_class, contentLang) : '';
      lines.push(`• ${s.student_name || 'Unnamed'}${label ? ` (${label})` : ''}`
        + ` — ${s.correct_answers}/${s.total_questions_answered} (${s.mastery_percentage || 0}%)`);
    });
    lines.push('');
  }

  if (hardest.length) {
    // The part that actually changes tomorrow's lesson.
    lines.push(TX.reteach);
    hardest.forEach((h) => {
      lines.push(`• ${h.question_text}`);
      lines.push(`   ${TX.gotWrong(h.wrong, h.total)}`);
    });
    lines.push('');
  }

  if (unfinished.length) {
    lines.push(TX.notFinished(unfinished.map((s) => s.student_name || 'Unnamed').join(', ')));
  }

  // The reteach block, grounded in what this class actually got wrong (and,
  // for a class that missed nothing, in the digest's learning goals instead).
  // Generated once and used in both the PDF and the chat message. Language is
  // threaded through as the DOCUMENT's language — a teacher who
  // ran an Urdu quiz gets Urdu guidance inside that Urdu document, not an
  // English paragraph glued onto it.
  const guidanceMode = hardest.length ? 'reteach' : 'secure';
  // The grade the advice is pitched at. It used to be `sc.grade` — a column the
  // share code has never had — so every prompt read "Grade primary". The quiz
  // row carries the grade (the catalogue's for a lesson-plan quiz, the resolved
  // one for a transcript quiz); failing that, the class the children entered.
  const guidanceGrade = gradeText(quizRow && quizRow.grade) || classes.join('/') || null;
  const guidance = done.length
    ? await generateGuidance({
      shareCodeId, topic: sc.topic, grade: guidanceGrade, average: avg,
      finished: done.length, started: all.length, hardest, digest,
      language: contentLang, mode: guidanceMode,
    })
    : null;

  // Plain text, laid out on the phone line by line from each line's first
  // strong character — which in an Urdu report is the Latin "quiz" of the title
  // and nothing at all on a Latin-named child's line. Every line opens with the
  // document language's paragraph mark instead (text-format markLines).
  const lineMark = resolveUx('lineDirMark', { language: contentLang });
  const summary = markLines(lines.filter((l) => l !== null && l !== undefined).join('\n'), lineMark);

  // A designed report is worth it once there are results in it. On the morning
  // run for a class where nobody finished, a PDF of an empty table is worse
  // than a sentence — so that case stays a plain message.
  const sentAsPdf = done.length > 0 && await sendAsPdf({
    phone: teacher.phone_number, shareCode: sc, students: done, hardest,
    guidance, started: all.length, finished: done.length, average: avg,
    unfinished: unfinished.map((s) => s.student_name || 'Unnamed'),
    language: contentLang, contentLanguage: contentLang, caption: CAPTION.caption,
    classes,
    // The report is read BY the teacher, so it names them from their own
    // record. `sc.teacher_name` is the name the CHILDREN are shown and, for a
    // teacher with no name on record, holds the children's fallback ("آپ کے
    // استاد" / "Your teacher") — a teacher reading that about themselves was
    // the defect. No name -> the template prints the class alone.
    teacherName: String((teacher && teacher.name) || '').trim(),
  });

  if (!sentAsPdf) {
    // The PDF is the nicer artefact, not the report itself. If rendering fails
    // the teacher still gets every number — losing the results because a font did not
    // load would be the wrong trade.
    await WhatsAppService.sendMessage(teacher.phone_number, summary);
    if (guidance) {
      await WhatsAppService.sendMessage(teacher.phone_number,
        markLines(`${TX.forTomorrow}\n\n${formatGuidanceText(guidance, TX)}`, lineMark));
    }
  }

  stamp.stamped = await markReportSent(shareCodeId, sc.quiz_id);

  // The children's class cards, at the moment the teacher's
  // report goes out. Never to the teacher; once per child per quiz.
  await sendClassCards({
    shareCode: sc, quizRow, done, reason, language: contentLang, className: classHeadingText,
  });

  logEvent('video_quiz.report_sent', {
    shareCodeId, quizId: sc.quiz_id, started: all.length,
    completed: done.length, average: avg, reason,
    format: sentAsPdf ? 'pdf' : 'text', hadGuidance: Boolean(guidance),
  });
  Funnel.emit('report_sent', {
    quiz_id: sc.quiz_id, share_code_id: shareCodeId, source: quizRow && quizRow.quiz_source,
    kind: 'report', reason, n: done.length,
  });
  return true;
}

/**
 * THE CHILD'S CLASS CARD.
 *
 * For every child who finished — one attempt per child, the same rows the
 * teacher's report counts — an image of where they stand against the class
 * (video-quiz-leaderboard.template.js), sent to the child's own handset when
 * the teacher's report goes out, whatever the reason for that report.
 *
 *   - never the teacher: the teacher gets the report and only the report;
 *   - once per child per quiz: quizzes.meta.class_cards[shareCodeId] holds
 *     the student ids already sent, so a follow-up report reaches only the
 *     children who finished since;
 *   - inside WhatsApp's free-form window: a WhatsApp child whose last answer
 *     is older than CLASS_CARD_WINDOW_MS is skipped and the skip is logged (no
 *     template is used for children). The window is a WhatsApp rule — a child
 *     on Matrix, Slack or Discord has none and always gets the card;
 *   - sent as a temp PNG through sendImage, the one picture call every channel
 *     driver implements (video-quiz-scorecard sendPngImage);
 *   - one child's failure costs that child only, never the report;
 *   - behind CLASS_CARD_ENABLED (unset = off), read at call time.
 */
const CLASS_CARD_WINDOW_MS = 23 * 60 * 60 * 1000;

function classCardsEnabled() {
  return process.env.CLASS_CARD_ENABLED === 'true';
}

async function sendClassCards({ shareCode, quizRow, done, reason, language, className }) {
  if (!classCardsEnabled()) return { sent: 0, skipped: 0 };
  const finished = (done || []).filter((s) => s && s.status === 'completed');
  if (!finished.length) return { sent: 0, skipped: 0 };

  const meta = (quizRow && quizRow.meta) || {};
  const already = new Set(((meta.class_cards || {})[shareCode.id]) || []);
  // The card goes to children, so it keeps the invite service's rule for what
  // crosses between children: a first name and a score, never a family name
  // (video-quiz-invite.service.js header, firstName). 'top' mode below names
  // only the top rows; the rest are a count, except the card's own child. The
  // one line is repeated here, not required: the invite service already
  // requires this file through the share service.
  const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || '';
  const rows = finished.map((s) => ({
    sessionId: s.id, studentId: s.student_id || null, name: firstName(s.student_name),
    correct: s.correct_answers || 0, total: s.total_questions_answered || 0,
    pct: s.mastery_percentage || 0, completedAt: s.completed_at || null, phone: s.parent_phone || null,
  }));

  let renderHtml;
  let htmlToImage;
  try {
    renderHtml = require('../../templates/video-quiz-leaderboard.template');
    ({ htmlToImage } = require('../../utils/html-to-pdf'));
  } catch (err) {
    logToFile('⚠️ class card: renderer unavailable', { error: err.message });
    return { sent: 0, skipped: rows.length };
  }
  const rateLimiter = require('./video-quiz-rate-limiter.service');
  const { sendPngImage } = require('./video-quiz-scorecard.service');
  const { isWhatsAppRecipient } = require('./quiz-channel');
  const caption = resolveUx('vqClassCardCaption', { language, params: { topic: shareCode.topic || '' } });
  const now = Date.now();
  const sentIds = [];
  let skipped = 0;
  // For the funnel, a send that FAILED is not the same as a child left out on
  // purpose (no number, outside the window): `skipped` below counts both.
  let failed = 0;

  for (const r of rows) {
    const key = r.studentId || r.sessionId;
    if (already.has(key)) continue;
    if (!r.phone) { skipped += 1; logEvent('video_quiz.class_card_skipped', { shareCodeId: shareCode.id, studentId: key, why: 'no_phone' }); continue; }
    const at = r.completedAt ? new Date(r.completedAt).getTime() : NaN;
    if (isWhatsAppRecipient(r.phone) && (!Number.isFinite(at) || now - at > CLASS_CARD_WINDOW_MS)) {
      skipped += 1;
      logEvent('video_quiz.class_card_skipped', { shareCodeId: shareCode.id, studentId: key, why: 'window' });
      continue;
    }
    try {
      const html = renderHtml({
        topic: shareCode.topic || '', subject: (quizRow && quizRow.subject) || '', className: className || '',
        language, rows, targetSessionId: r.sessionId, mode: 'top',
      });
      const png = await htmlToImage(html, { width: 540, deviceScaleFactor: 2, selector: '.card', untrusted: true });
      if (!png) throw new Error('empty image');
      await rateLimiter.throttle(r.phone);
      const ok = await sendPngImage(r.phone, png, caption, { prefix: 'class-card' });
      if (!ok) throw new Error('send returned false');
      sentIds.push(key);
      logEvent('video_quiz.class_card_sent', {
        shareCodeId: shareCode.id, quizId: shareCode.quiz_id, studentId: key, reason, language,
      });
    } catch (err) {
      skipped += 1;
      failed += 1;
      logToFile('⚠️ class card: could not send to one child (continuing)', { shareCodeId: shareCode.id, error: err.message });
      logEvent('video_quiz.class_card_skipped', { shareCodeId: shareCode.id, studentId: key, why: 'error' });
    }
  }

  if (sentIds.length || skipped) {
    Funnel.emit('class_cards', {
      quiz_id: shareCode.quiz_id, share_code_id: shareCode.id, source: quizRow && quizRow.quiz_source,
      n: sentIds.length, failed, skipped: skipped - failed,
    });
  }

  if (sentIds.length) {
    try {
      await supabase.from('quizzes').update({
        meta: {
          ...meta,
          class_cards: { ...(meta.class_cards || {}), [shareCode.id]: [...already, ...sentIds] },
        },
      }).eq('id', shareCode.quiz_id);
    } catch (err) {
      logToFile('⚠️ class card: could not record the sends', { shareCodeId: shareCode.id, error: err.message });
    }
  }
  return { sent: sentIds.length, skipped };
}

/**
 * The class card for a child who finished AFTER the teacher's
 * report. Called on every share-link completion: once a report has gone out,
 * every finished child without a card gets one now (the child has just
 * answered, so the free-form window is open); before the first report,
 * nothing — the card rides with that report. Never a message to the teacher.
 */
async function sendLateClassCards(shareCodeId) {
  if (!classCardsEnabled()) return { sent: 0, skipped: 0, why: 'flag_off' };
  const { data: sc } = await supabase
    .from('quiz_share_codes')
    .select('id, code, quiz_id, teacher_user_id, teacher_name, topic, language, report_sent_at')
    .eq('id', shareCodeId).maybeSingle();
  if (!sc) return { sent: 0, skipped: 0, why: 'no_share_code' };
  if (!sc.report_sent_at) return { sent: 0, skipped: 0, why: 'no_report_yet' };
  const [{ data: sessions }, { data: quizRow }] = await Promise.all([
    supabase.from('quiz_sessions')
      .select('id, user_id, student_id, student_name, student_class, parent_phone, status, '
              + 'total_questions_answered, correct_answers, mastery_percentage, completed_at, created_at')
      .eq('share_code_id', shareCodeId),
    supabase.from('quizzes').select('quiz_source, meta, language, subject, grade').eq('id', sc.quiz_id).maybeSingle(),
  ]);
  const all = oneAttemptPerChild(excludeSelfTests(sessions || [], sc.teacher_user_id));
  const done = all.filter((s) => s.status === 'completed');
  const language = clampLanguage(sc.language || (quizRow && quizRow.language) || 'en');
  const className = classHeading(classesTaught(done), language);
  return sendClassCards({ shareCode: sc, quizRow: quizRow || null, done, reason: 'late', language, className });
}

/**
 * The report's HTML, printed to an A4 PDF buffer exactly as the teacher gets it:
 * edge to edge (the hero is full-bleed, so the page carries no margin), the
 * template's own break rules deciding where each page ends. One function so the
 * layout tests print the same document the send does.
 */
async function renderReportPdf(data) {
  const { htmlToPdf } = require('../../utils/html-to-pdf');
  const renderHtml = require('../../templates/video-quiz-report.template');
  return htmlToPdf(renderHtml(data), {
    timeout: 30000,
    untrusted: true, // children's typed names and classes: no page script, no network
    pdfOptions: {
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    },
  });
}

/**
 * Render and send the designed report. Returns false on any failure so the
 * caller falls back to the text summary rather than the teacher getting nothing.
 */
async function sendAsPdf({ phone, shareCode, students, hardest, guidance,
                           started, finished, average, unfinished, classes,
                           language, contentLanguage, caption: captionFor, teacherName = '' }) {
  const fs = require('fs');
  const os = require('os');
  const { privateTempPath, removePrivateTemp } = require('../../utils/private-temp');
  let tmp = null;
  try {
    const buffer = await renderReportPdf({
      topic: shareCode.topic || 'Video quiz',
      teacherName,
      started, finished, average,
      students, hardest, guidance, unfinished, classes, language, contentLanguage,
      // D1 — the footer stamp is part of the DOCUMENT, so it is written in the
      // document's language. `toLocaleDateString('en-GB')` printed "5 Sep 2026"
      // into an otherwise all-Urdu report; formatLessonDate is the same helper
      // the teacher PDF and the offer interstitial already use, and it is
      // on the school's clock (SCHOOL_TIMEZONE) rather than container-local.
      generatedAt: formatLessonDate(new Date().toISOString(), language, { year: true }),
    });
    if (!buffer || !buffer.length) return false;

    const safeTopic = String(shareCode.topic || 'quiz')
      .replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    // A directory of this call's own. The share code names the quiz, not the
    // send: if two sends of one share code ever overlap (the single-flight claim
    // is best-effort), a shared `class-quiz-<id>.pdf` lets one overwrite or
    // remove the file the other's upload has not read yet.
    tmp = privateTempPath(os.tmpdir(), `class-quiz-${shareCode.id}.pdf`, 'class-quiz-');
    const tempPath = tmp.filePath;
    fs.writeFileSync(tempPath, buffer);

    // The caption is chrome, so it comes from the caller's teacher-language
    // table rather than being written inline in English.
    const caption = captionFor
      ? captionFor(shareCode.topic, finished, started, hardest.length)
      : `📊 Class results — *${shareCode.topic}*`;

    const ok = await WhatsAppService.sendDocument(
      phone, tempPath, `Class_results_${safeTopic}.pdf`, caption);
    return Boolean(ok);
  } catch (err) {
    logToFile('⚠️ video-quiz: report PDF failed, falling back to text', {
      error: err.message,
    });
    return false;
  } finally {
    // sendDocument has finished with the file once it resolves, so it is safe
    // to clear here; leaving these behind fills the worker's disk over weeks.
    removePrivateTemp(tmp);
  }
}

/**
 * Pull a JSON object out of the model's reply, fence and all.
 *
 * gpt-5.4-mini reliably wraps JSON in a ```json fence even when asked not to,
 * and occasionally adds a leading/trailing sentence around it. Defensive on
 * both: strip a fence if present, then fall back to the outermost {...} span.
 */
function parseGuidanceJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * A prompt that DEMANDS a
 * shape gets a code check, not a hope. `board` (reteach) / `stretch`
 * (secure) are now asked for as 2-3 DETAILED sentences; the model does not
 * reliably comply, so this asserts it instead of trusting it.
 *
 * `language` is normalised through RTL_LANGS the same way buildGuidancePrompt
 * chooses which prompt to build — a code with no prompt of its own (anything
 * but en/ur) falls back to the English contract, matching what was
 * actually asked for, rather than being flagged against a language nothing
 * ever requested.
 *
 * Exported and unit-tested directly, independent of the network call — the
 * mocked-network tests prove this is actually WIRED into generateGuidance();
 * this proves the rule itself.
 */
const DEPTH_KEY_BY_MODE = { reteach: 'board', secure: 'stretch' };

function countSentences(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  // A RUN of sentence-ending punctuation (ASCII . ? ! or Urdu ۔ ؟) is ONE
  // boundary — "...?!" at the end of a sentence must not count as three.
  const boundaries = t.match(/[.?!۔؟]+/g);
  return boundaries ? boundaries.length : 1;
}

/**
 * Is this field written in the wrong language?
 *
 * NOT `scriptOf(value) !== target`, in EITHER direction — `scriptOf()` answers
 * "is any Perso-Arabic letter present", and both languages here legitimately
 * carry a run of the other script. An English quiz can name
 * روٹی on the board; an Urdu one names `bulb`, `switch` and `circuit` in Latin
 * because those are terms of record (and the Urdu prompts
 * now ask for exactly that). A presence test flags both as off-language and
 * spends a retry on a correct sentence.
 *
 * So the test is PROPORTION and it is symmetrical: a field is off-language
 * when the other script's letters OUTNUMBER the target script's. A sentence
 * with one borrowed word is never mostly the other language, and a sentence
 * written wholly in the wrong language always is.
 */
const PERSO_ARABIC_G = /[\u0620-\u064A\u066E-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FF]/g;
const LATIN_G = /[A-Za-z]/g;

function offLanguage(value, targetScript) {
  const ur = (String(value).match(PERSO_ARABIC_G) || []).length;
  const latin = (String(value).match(LATIN_G) || []).length;
  return targetScript === 'ur' ? latin > ur : ur > latin;
}

/**
 * How the second-person check reads each field. `board`, `check` and `stretch`
 * speak to someone — the teacher, and in the question the teacher reads out,
 * the class — so a future with آپ left unsaid («کیسے سوچیں گے؟») counts there.
 * `muddled` and `secure` describe the children and count a gendered verb only
 * once they already speak to someone as آپ.
 */
const ADDRESS_KIND = { board: 'stem', check: 'stem', stretch: 'stem', muddled: 'feedback', secure: 'feedback' };

function guidanceShape(out, mode, language) {
  const keys = mode === 'reteach' ? ['muddled', 'board', 'check'] : ['secure', 'stretch'];
  const depthKey = DEPTH_KEY_BY_MODE[mode];
  const targetScript = RTL_LANGS.has(language) ? 'ur' : 'en';
  const problems = [];
  keys.forEach((key) => {
    const value = out && typeof out[key] === 'string' ? out[key].trim() : '';
    if (!value) {
      problems.push({ key, issue: 'missing' });
      return;
    }
    if (key === depthKey && countSentences(value) < 2) {
      problems.push({ key, issue: 'too_short', sentences: countSentences(value) });
    }
    if (offLanguage(value, targetScript)) {
      problems.push({ key, issue: 'off_language', expected: targetScript, got: scriptOf(value) });
    } else if (targetScript === 'ur') {
      // A verb that speaks to the teacher or the class with a gender — «آپ
      // کیسے سوچیں گے؟» read out to boys and girls (found in testing).
      const forms = addressForms(value, { kind: ADDRESS_KIND[key] || 'feedback' });
      if (forms.length) problems.push({ key, issue: 'gendered_address', forms });
    }
  });
  return { ok: problems.length === 0, problems };
}

/** A short line naming what was wrong, appended to the SAME prompt for the one retry. */
function sharpeningLine(problems, language) {
  const ur = RTL_LANGS.has(language);
  const parts = problems.map((p) => {
    if (p.issue === 'missing') return ur ? `"${p.key}" خالی تھا` : `"${p.key}" was empty`;
    if (p.issue === 'gendered_address') {
      // Urdu only (guidanceShape raises it only for an Urdu box).
      return `"${p.key}" میں فعل کی جنس ہے (${(p.forms || []).join('، ')}) — یہی بات جنس کے بغیر لکھیں: `
        + '«آپ کیسے سوچیں؟»، «کس ترتیب سے لکھنا ہوگا؟»، «آپ نے کیا سوچا؟»';
    }
    if (p.issue === 'too_short') {
      return ur ? `"${p.key}" میں صرف ${p.sentences} جملہ تھا — 2 سے 3 جملے چاہئیں`
        : `"${p.key}" had only ${p.sentences} sentence(s) — it needs 2 to 3`;
    }
    return ur ? `"${p.key}" اردو کے بجائے کسی اور زبان میں آیا`
      : `"${p.key}" came back in the wrong script`;
  });
  return ur
    ? `پچھلا جواب درست نہیں تھا: ${parts.join('؛ ')}۔ اسی ہدایات کے مطابق، درست کر کے دوبارہ بھیجیں۔`
    : `Your previous answer was not right: ${parts.join('; ')}. Send it again, following the same instructions, corrected.`;
}

/**
 * Turn the evidence into the object the teacher reads under "For tomorrow".
 *
 * Best-effort by design: if the model is slow, down, or returns something
 * unusable, the teacher still gets the results, just without the reteach box. Losing
 * the whole report because this optional block failed would be the wrong
 * trade — so ANY required key missing or empty (after stripEmphasis) fails
 * the whole call, not just that key.
 *
 * Once a reply parses, guidanceShape() checks it against
 * the contract the prompt actually asked for. On a problem: ONE retry, with
 * a line naming what was wrong, then accept whatever comes back — never null
 * just because it was thin. Losing the box is worse than a short box.
 */
async function generateGuidance(context) {
  const prompt = buildGuidancePrompt(context);
  if (!prompt) return null;
  const missed = Array.isArray(context && context.hardest) ? context.hardest : [];
  const mode = (context && context.mode) || (missed.length ? 'reteach' : 'secure');
  const language = (context && context.language) || 'en';
  const keys = mode === 'reteach' ? ['muddled', 'board', 'check'] : ['secure', 'stretch'];
  try {
    // The one LLM entry point, as the quiz.videoReport job: QUIZ_REPORT_MODEL,
    // else the registry's default. This box is the one part of the report a
    // teacher acts on, so it gets a stronger model than the cheapest: a small
    // model produced textbook prose here — "focus on clarifying the
    // misconception that…" — and reached for "categorise various foods"
    // instead of the everyday foods named in the questions.
    const { client, model } = require('../llm-client').getClientForModel(null, { job: 'quiz.videoReport' });

    const ask = async (p) => {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: p }],
        temperature: 0.4,               // lower than the parent quiz: this is advice
        // gpt-5 family renamed this. Passing max_tokens is not an error you can
        // see — the call just rejects and the teacher silently loses the box.
        // 260 was sized for three one-line fields. `board`/`stretch` are now
        // asked for 2-3 DETAILED sentences each (a good example runs well past
        // a one-liner), so the old ceiling truncated the JSON
        // mid-string — parseGuidanceJson then silently returned null and the teacher
        // lost the WHOLE box, not just the extra depth.
        max_completion_tokens: 700,
      });
      const parsed = parseGuidanceJson(res.choices?.[0]?.message?.content?.trim());
      if (!parsed) return null;
      const built = {};
      for (const key of keys) {
        // Strip markdown here, at the single point guidance is created, so BOTH
        // surfaces are covered: the PDF and the WhatsApp text fallback. (In the
        // fallback "**the**" is not even bold — WhatsApp bold is one asterisk —
        // so the teacher just saw the asterisks.)
        // …and flatten any TeX the model wrote back ("$\frac{2}{9}$" → "2/9"):
        // both surfaces are text a teacher reads, the PDF and the chat.
        const cleaned = mathForChat(stripEmphasis(String(parsed[key] || '').trim()));
        if (!cleaned) return null;
        built[key] = cleaned;
      }
      return built;
    };

    let out = await ask(prompt);
    if (!out) return null;

    const shape = guidanceShape(out, mode, language);
    if (!shape.ok) {
      const offLanguage = shape.problems.some((p) => p.issue === 'off_language');
      const gendered = shape.problems.filter((p) => p.issue === 'gendered_address');
      const other = shape.problems.filter((p) => p.issue !== 'gendered_address');
      // ONE retry for everything that was wrong, the gendered verbs included.
      const retried = await ask(`${prompt}\n\n${sharpeningLine(shape.problems, language)}`);
      // Distinct events — a shared failure string is
      // what sent the last investigation at the wrong layer.
      if (other.length) {
        logEvent(offLanguage ? 'video_quiz.guidance_off_language' : 'video_quiz.guidance_thin', {
          shareCodeId: context && context.shareCodeId, mode, problems: other,
          retried: Boolean(retried),
        });
      }
      if (gendered.length) {
        const left = retried
          ? guidanceShape(retried, mode, language).problems.filter((p) => p.issue === 'gendered_address')
          : gendered;
        logEvent('video_quiz.guidance_gendered_address', {
          shareCodeId: context && context.shareCodeId, mode,
          fields: gendered.map((p) => p.key),
          forms: [...new Set(gendered.flatMap((p) => p.forms))].slice(0, 8),
          retried: Boolean(retried), cleared: Boolean(retried) && left.length === 0,
        });
      }
      if (retried) out = retried;   // accept whatever comes back — a short box beats none
    }
    return out;
  } catch (err) {
    logToFile('⚠️ video-quiz: guidance generation failed (report still sends)', {
      error: err.message,
    });
    return null;
  }
}

/**
 * The WhatsApp-text-fallback rendering of the guidance object — three (or
 * two) labelled parts, single-asterisk bold (WhatsApp bold is ONE asterisk,
 * never two). `labels` is the doc-language TX table already built by
 * generate(); it carries `{muddledLabel, boardLabel, checkLabel, secureLabel,
 * stretchLabel}` in the document's own language.
 */
function formatGuidanceText(guidance, labels) {
  if (!guidance) return '';
  if (Object.prototype.hasOwnProperty.call(guidance, 'muddled')) {
    return [
      `*${labels.muddledLabel}:* ${guidance.muddled}`,
      `*${labels.boardLabel}:* ${guidance.board}`,
      `*${labels.checkLabel}:* ${guidance.check}`,
    ].join('\n\n');
  }
  return [
    `*${labels.secureLabel}:* ${guidance.secure}`,
    `*${labels.stretchLabel}:* ${guidance.stretch}`,
  ].join('\n\n');
}

/**
 * Stamp the share code as reported.
 *
 * Deliberately AFTER the send, not before: if WhatsApp throws, the teacher got
 * nothing and the morning job should still get its turn. The cost of that
 * ordering is a possible double-send if the stamp itself fails, which is the
 * better failure — a teacher seeing one report twice beats seeing none.
 *
 * @returns {Promise<boolean>} whether report_sent_at landed. generate() keeps its
 *   send claim when it did not, so a racing call cannot send the report again.
 */
async function markReportSent(shareCodeId, quizId = null) {
  let stamped = false;
  try {
    const { error } = await supabase.from('quiz_share_codes')
      .update({ report_sent_at: new Date().toISOString() })
      .eq('id', shareCodeId);
    if (error) {
      logToFile('❌ video-quiz: could not stamp report_sent_at', { shareCodeId, error: error.message }, 'error');
      return false;
    }
    stamped = true;
    // A lesson quiz's /quiz row reads quizzes.status; "Report sent" is a
    // state of the quiz, not only of its share code.
    if (quizId) {
      await supabase.from('quizzes')
        .update({ status: 'report_sent' })
        .eq('id', quizId).in('quiz_source', LESSON_SOURCES);
    }
  } catch (err) {
    logToFile('❌ video-quiz: could not stamp report_sent_at', {
      shareCodeId, stamped, error: err.message,
    }, 'error');
  }
  return stamped;
}

/** A wrong answer only counts as a shared misunderstanding at this share. */
const CLUSTER_THRESHOLD = 0.5;

const LETTERS = ['A', 'B', 'C', 'D'];
// A multi-answer question's correct_option (and, in principle, any letter
// this is called with) may be a comma-joined set ("A,C"). Resolve every
// member and join their texts; the single-letter behaviour — including the
// `|| null` on a missing option — is unchanged.
const optionText = (q, letter) => {
  const parts = String(letter ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  if (parts.length <= 1) return q[`option_${String(letter).toLowerCase()}`] || null;
  const texts = parts.map((c) => q[`option_${c.toLowerCase()}`]).filter(Boolean);
  return texts.length ? texts.join(' + ') : null;
};

/**
 * The three questions this class got wrong most often — and, where the class
 * agreed on a wrong answer, WHICH one and why that mistake happens.
 *
 * "16 of 22 missed this" tells a teacher to reteach something. "16 of
 * 22 chose Dicot, because they flipped the vein rule" tells the teacher what to say. The
 * second sentence is available because these questions ship with an explanation
 * authored per wrong option — 9,150 of them do.
 *
 * The cluster threshold matters. One child picking A and another picking B is a
 * coin toss, not a misconception, and reporting it as one would send the teacher to
 * reteach the wrong thing. So a distractor is only named when at least half the
 * wrong answers landed on it.
 */
/**
 * Turn authored CHILD feedback into something a teacher can read.
 *
 * The wrong-option copy is written to the child who just got it wrong:
 *   "A) Nice effort! Milk and meat are products, not groups. Keep learning!"
 * Pasted verbatim into a class report that consoles the teacher for a question
 * were never answered. Of 18,300 authored strings, 11,799 open with a child
 * opener and 9,876 close with one, so this is the common case, not the edge.
 *
 * Strips the option-letter prefix, the opener and the closer; keeps the
 * substance untouched. Returns null when nothing but scaffolding remains, so
 * the caller omits the block rather than rendering an empty one.
 */
const CHILD_OPENER = /^(good try|nice effort|not quite|almost|good effort|nice try|well tried)[!.,]*\s*/i;
const CHILD_CLOSER = /\s*(keep going|keep learning|keep it up|keep practising|keep practicing|well done|you can do it)[!.]*\s*$/i;

function teacherFacing(raw) {
  if (!raw) return null;
  let t = String(raw).replace(/^\s*[A-D]\)\s*/, '').trim();
  t = t.replace(CHILD_OPENER, '').trim();
  t = t.replace(CHILD_CLOSER, '').trim();
  return t || null;
}

async function hardestQuestions(shareCodeId, limit = 3, sessionIds = null) {
  let ids = Array.isArray(sessionIds) ? sessionIds : null;
  if (!ids) {
    const { data: sessions } = await supabase
      .from('quiz_sessions').select('id').eq('share_code_id', shareCodeId)
      // Within a share code, user_id IS NOT NULL means the
      // teacher's own self-test; practice answers never decide the hardest.
      .is('user_id', null);
    ids = (sessions || []).map((s) => s.id);
  }
  if (!ids.length) return [];

  const { data: answers } = await supabase
    .from('quiz_answers')
    .select('question_id, is_correct, selected_option')
    .in('session_id', ids);
  if (!answers || !answers.length) return [];

  const tally = new Map();
  answers.forEach((a) => {
    const t = tally.get(a.question_id)
      || { total: 0, wrong: 0, picks: new Map() };
    t.total += 1;
    if (!a.is_correct) {
      t.wrong += 1;
      if (a.selected_option) {
        t.picks.set(a.selected_option, (t.picks.get(a.selected_option) || 0) + 1);
      }
    }
    tally.set(a.question_id, t);
  });

  const ranked = [...tally.entries()]
    // Needs at least two attempts before "the class found this hard" means
    // anything — one child's slip is not a teaching signal.
    .filter(([, t]) => t.wrong > 0 && t.total >= 2)
    .sort((a, b) => (b[1].wrong / b[1].total) - (a[1].wrong / a[1].total))
    .slice(0, limit);
  if (!ranked.length) return [];

  const { data: qs } = await supabase
    .from('quiz_questions')
    .select('id, external_id, question_text, option_a, option_b, option_c, option_d, '
            + 'correct_option, option_feedback, explanation')
    .in('id', ranked.map(([id]) => id));
  const byId = new Map((qs || []).map((q) => [q.id, q]));

  return ranked.map(([id, t]) => {
    const q = byId.get(id) || {};
    let topWrong = null;
    let topCount = 0;
    let runnerUp = 0;
    t.picks.forEach((n, letter) => {
      if (n > topCount) { runnerUp = topCount; topCount = n; topWrong = letter; }
      else if (n > runnerUp) { runnerUp = n; }
    });

    // Two conditions, and the second is the one that matters. Half the wrong
    // answers landing on an option is necessary but not sufficient: with two
    // children picking A and B, A holds half the wrong answers and is still
    // just a tie. A cluster means one distractor genuinely dominates.
    const clustered = Boolean(topWrong) && t.wrong > 0
      && (topCount / t.wrong) >= CLUSTER_THRESHOLD
      && topCount > runnerUp;

    let misconception = null;
    if (clustered && q.option_feedback && q.option_feedback.wrong) {
      // Feedback is keyed by the option INDEX, not its letter.
      const idx = LETTERS.indexOf(topWrong);
      const raw = q.option_feedback.wrong[String(idx)]
        ?? q.option_feedback.wrong[idx];
      if (raw) {
        misconception = teacherFacing(raw);
      }
    }

    return {
      question_text: mathForChat(q.question_text) || '(question unavailable)',
      external_id: q.external_id || null,
      wrong: t.wrong,
      total: t.total,
      top_wrong_option: clustered ? topWrong : null,
      top_wrong_text: clustered ? mathForChat(optionText(q, topWrong)) : null,
      top_wrong_count: clustered ? topCount : 0,
      correct_option: q.correct_option || null,
      correct_text: q.correct_option ? mathForChat(optionText(q, q.correct_option)) : null,
      misconception: mathForChat(misconception),
      // "Why this is the right answer" — authored per question, independent
      // of which distractor the class clustered on (that is `misconception`,
      // and stays exactly as it was).
      explanation: mathForChat(teacherFacing(q.explanation)) || null,
    };
  });
}

/** The taught-level word each language uses when naming an SLO's level in a prompt. */
const TAUGHT_LEVEL_EN = { recall: 'recall', understand: 'understand', apply: 'apply' };
const TAUGHT_LEVEL_UR = { recall: 'یاد', understand: 'سمجھ', apply: 'اطلاق' };

/**
 * Render the lesson digest as a block the prompt can append. Empty/absent
 * fields are simply omitted — a digest with only a topic still contributes
 * that much grounding rather than nothing at all.
 */
function digestBlockEn(digest) {
  if (!digest) return '';
  const lines = [];
  if (digest.topic_as_taught) lines.push(`Topic as taught: ${digest.topic_as_taught}`);
  const slos = (Array.isArray(digest.slos) ? digest.slos : []).filter((s) => s && s.statement);
  if (slos.length) {
    lines.push('Learning goals taught (with the level each was pitched at):');
    slos.forEach((s) => lines.push(
      `  ${s.id || ''} [${TAUGHT_LEVEL_EN[s.taught_level] || s.taught_level || 'understand'}]: ${s.statement}`,
    ));
  }
  if (Array.isArray(digest.misconceptions_surfaced) && digest.misconceptions_surfaced.length) {
    lines.push(`Misconceptions that surfaced in the lesson itself: ${digest.misconceptions_surfaced.join('; ')}`);
  }
  if (digest.lesson_summary) lines.push(`What was taught, in the order it was taught: ${digest.lesson_summary}`);
  return lines.length ? `\nLESSON DIGEST\n${lines.join('\n')}\n` : '';
}

function digestBlockUr(digest) {
  if (!digest) return '';
  const lines = [];
  if (digest.topic_as_taught) lines.push(`جیسا پڑھایا گیا موضوع: ${digest.topic_as_taught}`);
  const slos = (Array.isArray(digest.slos) ? digest.slos : []).filter((s) => s && s.statement);
  if (slos.length) {
    lines.push('پڑھائے گئے اہداف (جس سطح پر پڑھائے گئے اس کے ساتھ):');
    slos.forEach((s) => lines.push(
      `  ${s.id || ''} [${TAUGHT_LEVEL_UR[s.taught_level] || s.taught_level || 'سمجھ'}]: ${s.statement}`,
    ));
  }
  if (Array.isArray(digest.misconceptions_surfaced) && digest.misconceptions_surfaced.length) {
    lines.push(`سبق میں سامنے آنے والی غلط فہمیاں: ${digest.misconceptions_surfaced.join('، ')}`);
  }
  // The summary itself is now written TO the teacher as آپ, so the
  // label in front of it must not name a person at all — the passive does.
  if (digest.lesson_summary) lines.push(`جس ترتیب میں پڑھایا گیا: ${digest.lesson_summary}`);
  return lines.length ? `\nسبق کی تفصیل\n${lines.join('\n')}\n` : '';
}

function buildReteachPromptEn({ grade, topic, evidence, digest }) {
  return `You are helping a Grade ${grade || 'primary'} teacher plan `
    + `tomorrow's ten minutes. The class just took a quiz on "${topic}".\n\n`
    + `Here is what they got wrong, and the wrong answer they agreed on:\n\n`
    + `${evidence}\n`
    + digestBlockEn(digest)
    + `\nReturn ONLY a JSON object with exactly these three keys, each value `
    + `PLAIN TEXT — no markdown, no leading label, no numbering:\n`
    + `{"muddled": "", "board": "", "check": ""}\n\n`
    + `"muddled" — exactly one sentence naming the ONE thing most of them have `
    + `muddled, as a plain statement of what they believe: "They think X is Y." `
    + `Pick the single biggest confusion, not a list of all of them. Do not use `
    + `the words "misconception", "students", "concept" or "understanding".\n`
    + `"board" — exactly 2 to 3 sentences on how the teacher reteaches this `
    + `tomorrow: the concrete move to make, the specific example to put on the board `
    + `(drawn from the questions above and the lesson digest above — the real `
    + `everyday things those questions and that lesson actually talk about, `
    + `never "various examples" or "different items"), and what the CHILDREN `
    + `do. Do not compress this into one sentence and do not pad past three.\n`
    + `"check" — exactly one sentence: the one question to ask at the end to `
    + `check it landed, pitched at the level the lesson taught the learning goal the `
    + `class missed (see the taught level next to each learning goal above). It `
    + `must NOT be a copy of any quiz question above; the children have already `
    + `seen those. Ask the same idea a different way.\n\n`
    + `Never begin any value with "In tomorrow's lesson", "To address this", `
    + `"Focus on" or "Start by". Begin with the children. Do not repeat any `
    + `score or count back to the teacher — they have just read them. Do not `
    + `praise the teacher or the class. Write the way a colleague leans over at `
    + `break, not the way a textbook explains.`;
}

function buildSecurePromptEn({ grade, topic, digest }) {
  return `You are helping a Grade ${grade || 'primary'} teacher plan `
    + `tomorrow's ten minutes. The whole class just took a quiz on "${topic}" `
    + `and got every question right.\n`
    + digestBlockEn(digest)
    + `\nReturn ONLY a JSON object with exactly these two keys, each value `
    + `PLAIN TEXT — no markdown, no leading label, no numbering:\n`
    + `{"secure": "", "stretch": ""}\n\n`
    + `"secure" — exactly one sentence naming the real skill the class now has `
    + `solid, grounded in the learning goals above. Not "they did well" — name `
    + `the actual thing they can now do.\n`
    + `"stretch" — exactly 2 to 3 sentences on how to take them one step `
    + `further tomorrow: the concrete move to make, ONE question pitched one `
    + `level above the highest level the lesson taught (see the taught levels above) `
    + `that goes further than anything the quiz asked, and what the CHILDREN `
    + `do with it. The question must not be a copy of any quiz question. Do `
    + `not compress this into one sentence and do not pad past three.\n\n`
    + `Never begin with "In tomorrow's lesson", "To address this", "Focus on" `
    + `or "Start by". Do not repeat any score. Do not praise the teacher or the class. `
    + `Write the way a colleague leans over at break, not the way a textbook `
    + `explains.`;
}

function buildReteachPromptUr({ grade, topic, evidence, digest }) {
  // Gender-neutral throughout (the Urdu address rule) — the
  // teacher's gender is unknown, so this never asks for a 2nd/3rd-person
  // gendered verb about the teacher. A review found three that had survived the
  // claim (پڑھائیں گی، اٹھائیں گی، بولتی ہے) and replaced them with the
  // impersonal passive, which agrees with the object. Children are "بچے", a
  // gender-neutral plural. Same structure + banned-opener list as the
  // English prompt, translated in spirit, not word-for-word.
  return `آپ کا کام ایک گریڈ ${grade || 'ابتدائی'} استاد کی کل کے دس منٹ کی `
    + `منصوبہ بندی میں مدد کرنا ہے۔ ان کی کلاس نے ابھی "${topic}" پر ایک کوئز دیا ہے۔\n\n`
    + `یہاں وہ چیزیں ہیں جو انہوں نے غلط کیں، اور جس غلط جواب پر اکثریت نے اتفاق کیا:\n\n`
    + `${evidence}\n`
    + digestBlockUr(digest)
    + `\nصرف ایک JSON آبجیکٹ واپس کریں، بالکل ان تین کلیدوں کے ساتھ، ہر ایک کی `
    + `قدر PLAIN TEXT ہو — کوئی مارک ڈاؤن، کوئی نمبر شمار نہیں:\n`
    + `{"muddled": "", "board": "", "check": ""}\n\n`
    + `"muddled" — بالکل ایک جملے میں (exactly one sentence) وہ ایک چیز بتائیں `
    + `جس میں زیادہ تر بچے الجھے ہوئے ہیں، ایک سادہ بیان کے طور پر کہ وہ کیا `
    + `سمجھتے ہیں: "بچے سمجھتے ہیں X، Y ہے۔" سب سے بڑی الجھن چنیں، فہرست نہ `
    + `بنائیں۔ الفاظ "غلط فہمی"، "طلبہ"، "تصور" یا "سمجھ" استعمال نہ کریں۔\n`
    + `"board" — بالکل 2 سے 3 جملوں میں (exactly 2 to 3 sentences) بتائیں کہ `
    + `کل یہ دوبارہ کیسے پڑھایا جائے: وہ عملی قدم جو اٹھایا جائے، بورڈ پر `
    + `لکھی جانے والی مخصوص مثال (اوپر دیے گئے سوالوں اور سبق کی تفصیل سے — `
    + `وہی حقیقی روزمرہ چیزیں؛ کبھی "مختلف مثالیں" نہ لکھیں)، اور بچے کیا کریں `
    + `گے۔ اسے ایک جملے میں نہ سمیٹیں اور تین جملوں سے زیادہ نہ لکھیں۔\n`
    + `"check" — بالکل ایک جملے میں (exactly one sentence): وہ ایک سوال جو `
    + `آخر میں پوچھا جائے تاکہ معلوم ہو کہ بات سمجھ آئی، اسی سطح پر جس پر یہ `
    + `ہدف پڑھایا گیا (اوپر ہر ہدف کے ساتھ دی گئی سطح دیکھیں)۔ یہ اوپر کے کسی `
    + `کوئز سوال کی نقل نہیں ہونی چاہیے؛ بچے وہ پہلے دیکھ چکے ہیں۔ وہی خیال `
    + `دوسرے انداز میں پوچھیں۔\n`
    + `جو سوال بچوں سے پوچھا جائے وہ انہی الفاظ میں لکھیں جن میں کوئز لکھا گیا `
    + `ہے: بچوں کو "آپ" کہہ کر — "کرو"، "بتاؤ" ہرگز نہیں۔ بچوں اور استاد، دونوں سے `
    + `بات کرتے ہوئے فعل کی کوئی جنس نہ ہو: «آپ کیسے سوچیں گے؟» کے بجائے «آپ کیسے سوچیں؟»، `
    + `اور «آپ کس ترتیب سے لکھیں گے؟» کے بجائے «کس ترتیب سے لکھنا ہوگا؟»۔\n`
    + `${URDU_ADDRESS_RULE}\n`
    + `\n`
    + `"کل کے سبق میں"، "اس کو حل کرنے کے لیے"، "پر توجہ دیں" یا "شروع کریں" سے `
    + `شروع نہ کریں۔ بچوں سے شروع کریں۔ کوئی سکور یا گنتی دوبارہ نہ بتائیں — وہ `
    + `ابھی پڑھ چکے ہیں۔ تعریف نہ کریں۔ اس انداز میں لکھیں جیسے ایک ساتھی وقفے `
    + `میں جھک کر بات کرتا ہے، نہ کہ جیسے کوئی نصابی کتاب سمجھاتی ہے۔ مکمل طور `
    + `پر اردو رسم الخط میں لکھیں، رومن اردو میں ہرگز نہیں۔ مضمون اور تکنیکی `
    + `اصطلاحات (جیسے fraction، numerator، circuit، atom، photosynthesis) وہی `
    + `رہنے دیں جو اصطلاحات استاد نے خود استعمال کیں — لاطینی حروف میں، بالکل ویسے جیسے اردو `
    + `میں لکھی جاتی ہیں؛ باقی سب کچھ خالص اردو میں لکھیں۔ بچوں یا استاد کی `
    + `جنس کے بارے میں کوئی قیاس نہ کریں، ہمیشہ غیر جانبدار زبان استعمال کریں۔`;
}

function buildSecurePromptUr({ grade, topic, digest }) {
  return `آپ کا کام ایک گریڈ ${grade || 'ابتدائی'} استاد کی کل کے دس منٹ کی `
    + `منصوبہ بندی میں مدد کرنا ہے۔ ان کی پوری کلاس نے ابھی "${topic}" پر `
    + `ایک کوئز دیا اور ہر سوال درست کیا۔\n`
    + digestBlockUr(digest)
    + `\nصرف ایک JSON آبجیکٹ واپس کریں، بالکل ان دو کلیدوں کے ساتھ، ہر ایک کی `
    + `قدر PLAIN TEXT ہو — کوئی مارک ڈاؤن، کوئی نمبر شمار نہیں:\n`
    + `{"secure": "", "stretch": ""}\n\n`
    + `"secure" — بالکل ایک جملے میں (exactly one sentence) وہ اصل مہارت `
    + `بتائیں جو کلاس نے اب پکی کر لی ہے، اوپر دیے گئے اہداف کی بنیاد پر — `
    + `"انہوں نے اچھا کیا" نہ لکھیں، اصل چیز کا نام لیں۔\n`
    + `"stretch" — بالکل 2 سے 3 جملوں میں (exactly 2 to 3 sentences) بتائیں `
    + `کہ کل انہیں ایک قدم آگے کیسے لے جائیں: وہ عملی قدم جو اٹھایا جائے، `
    + `ایک سوال جو سب سے اونچی پڑھائی گئی سطح سے ایک درجہ اوپر ہو (اوپر دی گئی `
    + `سطحیں دیکھیں) اور کوئز کے کسی بھی سوال سے آگے جائے، اور بچے اس کے ساتھ `
    + `کیا کریں گے۔ سوال کسی کوئز سوال کی نقل نہیں ہونی چاہیے۔ اسے ایک جملے `
    + `میں نہ سمیٹیں اور تین جملوں سے زیادہ نہ لکھیں۔\n`
    + `جو سوال بچوں سے پوچھا جائے وہ انہی الفاظ میں لکھیں جن میں کوئز لکھا گیا `
    + `ہے: بچوں کو "آپ" کہہ کر — "کرو"، "بتاؤ" ہرگز نہیں۔ بچوں اور استاد، دونوں سے `
    + `بات کرتے ہوئے فعل کی کوئی جنس نہ ہو: «آپ کیسے سوچیں گے؟» کے بجائے «آپ کیسے سوچیں؟»، `
    + `اور «آپ کس ترتیب سے لکھیں گے؟» کے بجائے «کس ترتیب سے لکھنا ہوگا؟»۔\n`
    + `${URDU_ADDRESS_RULE}\n`
    + `\n`
    + `"کل کے سبق میں"، "اس کو حل کرنے کے لیے"، "پر توجہ دیں" یا "شروع کریں" سے `
    + `شروع نہ کریں۔ کوئی سکور دوبارہ نہ بتائیں۔ تعریف نہ کریں۔ اس انداز میں `
    + `لکھیں جیسے ایک ساتھی وقفے میں جھک کر بات کرتا ہے۔ مکمل طور پر اردو رسم `
    + `الخط میں لکھیں، رومن اردو میں ہرگز نہیں۔ مضمون اور تکنیکی اصطلاحات `
    + `(جیسے fraction، numerator، circuit، atom، photosynthesis) وہی رہنے دیں `
    + `جو اصطلاحات استاد نے خود استعمال کیں — لاطینی حروف میں، بالکل ویسے جیسے اردو میں لکھی `
    + `جاتی ہیں؛ باقی سب کچھ خالص اردو میں لکھیں۔ بچوں یا استاد کی جنس کے بارے `
    + `میں کوئی قیاس نہ کریں، ہمیشہ غیر جانبدار زبان استعمال کریں۔`;
}

/**
 * The prompt behind the "for tomorrow" reteach box.
 *
 * Deliberately built from the class's OWN answers — the questions they
 * missed, the wrong option they agreed on, the authored reason that mistake
 * happens, AND the lesson digest (topic_as_taught, SLOs with taught_level,
 * misconceptions_surfaced, lesson_summary). A prompt that knows
 * only the average can only return advice that would fit any class on any
 * topic, which a teacher correctly ignores.
 *
 * TWO modes:
 *   - 'reteach' (hardest.length > 0): asks for {muddled, board, check}.
 *   - 'secure' (hardest.length === 0): a class that missed nothing — asks
 *     for {secure, stretch} instead, grounded in the digest alone.
 * `mode` may be passed explicitly; otherwise it is inferred from `hardest`.
 *
 * Returns null when there is nothing to ground guidance in at all: no missed
 * questions AND no usable digest. Inventing advice from an average alone
 * would train the teacher to skip this section.
 *
 * `language` picks the prompt AND the requested output language. The
 * evidence itself needs no translation — question_text/top_wrong_text/
 * correct_text/misconception/digest fields already come from the quiz's own
 * data, authored in whatever script the quiz was taught in (Urdu quizzes
 * carry Urdu evidence). Only the instructions-to-the-model change language.
 */
function buildGuidancePrompt({
  topic, grade, average, finished, started, hardest, language = 'en', digest = null, mode,
} = {}) {
  const missed = Array.isArray(hardest) ? hardest : [];
  const resolvedMode = mode || (missed.length ? 'reteach' : 'secure');

  const hasDigestGrounding = Boolean(digest && (
    (Array.isArray(digest.slos) && digest.slos.some((s) => s && s.statement))
    || digest.topic_as_taught
    || (Array.isArray(digest.misconceptions_surfaced) && digest.misconceptions_surfaced.length)
    || digest.lesson_summary
  ));
  if (!missed.length && !hasDigestGrounding) return null;

  const ur = RTL_LANGS.has(language);

  if (resolvedMode === 'secure') {
    return ur ? buildSecurePromptUr({ grade, topic, digest })
      : buildSecurePromptEn({ grade, topic, digest });
  }

  // Flat, as the class saw it (hardestQuestions already flattens; a caller
  // that passes rows straight from the table is flattened here): a model shown
  // "$\frac{2}{9}$" writes TeX back into the teacher's WhatsApp.
  const evidence = missed.map((h, i) => {
    const lines = [
      `${i + 1}. "${mathForChat(h.question_text)}"`,
      `   ${h.wrong} of ${h.total} answered this wrongly.`,
    ];
    if (h.top_wrong_text) {
      lines.push(`   Most of them chose "${mathForChat(h.top_wrong_text)}". `
        + `The right answer was "${mathForChat(h.correct_text)}".`);
    }
    if (h.misconception) {
      lines.push(`   Explanation: ${mathForChat(h.misconception)}`);
    }
    if (h.slo) {
      lines.push(`   Learning goal this checks: ${h.slo}`);
    }
    return lines.join('\n');
  }).join('\n\n');

  return ur ? buildReteachPromptUr({ grade, topic, evidence, digest })
    : buildReteachPromptEn({ grade, topic, evidence, digest });
}

module.exports = {
  oneAttemptPerChild,
  sendClassCards,
  sendLateClassCards,
  classCardsEnabled,
  CLASS_CARD_WINDOW_MS,
  JOB_TYPE, LEGACY_JOB_TYPE, scheduleForShareCode, maybeSendFollowUp, followUpDecision, generate,
  _sendClaimTiming,
  hardestQuestions, reportTargetUtc, teacherFacing,
  buildGuidancePrompt, generateGuidance, formatGuidanceText, stripEmphasis, classLabel,
  classesTaught, guidanceShape, renderReportPdf,
  CLUSTER_THRESHOLD,
};
