'use strict';
/**
 * SQS-side handlers for quiz job types.
 *
 * The bot enqueues quiz_report / quiz_expire / quiz_nudge / quiz_reminder
 * messages via SQSQueueService.queueJob(). The SQS worker (workers/sqs-worker.js)
 * routes by `body.jobType` to handleQuizJob() below.
 *
 * Each handler does three things in order:
 *   1. Cancel-flag check: read Redis key `sqs:cancel:<jobType>:<groupId>`.
 *      If set, short-circuit (return without doing work). The worker
 *      acknowledges the message on success-return, so the cancelled job
 *      is removed from the queue.
 *   2. Cascade re-queue (quiz_report + quiz_expire only): SQS DelaySeconds
 *      caps at 900s. For longer waits (12h fallback timer, 24h session
 *      expiry) the handler re-queues with another 15-min delay until the
 *      condition is met.
 *   3. Do the actual work: generateReport / DB flip / WhatsApp send.
 *
 * Handlers are exported individually so they can be unit-tested without
 * spinning up the full SQS worker. handleQuizJob() is the dispatcher
 * called from sqs-worker.js's switch statement.
 */

const { logToFile } = require('../shared/utils/logger');
const { logEvent } = require('../shared/utils/structured-logger');
const supabase = require('../shared/config/supabase');
const RedisService = require('../shared/services/cache/railway-redis.service');
const SQSQueueService = require('../shared/services/queue');

const TERMINAL_SESSION_STATES = ['completed', 'incomplete', 'expired', 'cancelled'];
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SQS_MAX_DELAY_SECONDS = 900;  // 15 min — SQS hard cap

// ─── Cancel-flag check (shared) ─────────────────────────────────────────────

/**
 * Check whether a Redis cancellation flag is set for this job.
 * The flag is written by SQSQueueService.cancelByGroupId() with 1h TTL.
 */
async function isCancelled(jobType, groupId) {
  try {
    const flag = await RedisService.get(`sqs:cancel:${jobType}:${groupId}`);
    return !!flag;
  } catch (err) {
    // Probe failures default to "not cancelled" — better to risk firing a
    // cancelled report than block deliveries on a Redis blip.
    logToFile('⚠️ isCancelled probe failed (defaulting to not-cancelled)', { jobType, groupId, error: err.message });
    return false;
  }
}

// ─── quiz_report ────────────────────────────────────────────────────────────

async function handleQuizReport(body) {
  const quizId = body.groupId;
  const payload = body.payload || {};

  logEvent('quiz.report.dequeued', { quizId });

  if (await isCancelled('quiz_report', quizId)) {
    logToFile('🛑 quiz_report cancelled — skipping', { quizId });
    logEvent('quiz.report.skipped', { quizId, reason: 'cancelled' });
    return { skipped: true, reason: 'cancelled' };
  }

  // Idempotency. Prevents double-firing when both the initial 12h-cascade
  // message (enqueued at delivery, delaySeconds=900) and the finalized message
  // (enqueued when all sessions are terminal, delaySeconds=60) target the same
  // quiz. Whichever wins the race fires the report and sets this flag; the
  // loser short-circuits cleanly. 24h TTL > the 12h cascade ceiling so a stale
  // cascade can't slip through after the report's already gone out.
  const SENT_FLAG_KEY = `quiz_report_sent:${quizId}`;
  if (await RedisService.get(SENT_FLAG_KEY)) {
    logToFile('🔁 quiz_report already fired for this quiz — skipping (cascade dedup)', { quizId });
    logEvent('quiz.report.skipped', { quizId, reason: 'already_fired' });
    return { skipped: true, reason: 'already_fired' };
  }

  // Lookup quiz row (also pull teacher_id so we can resolve teacherPhone from
  // the DB when the payload arrived empty — happens with the 60s grace message
  // which doesn't pass teacherPhone since the call site doesn't have it).
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, teacher_id, created_at, status')
    .eq('id', quizId)
    .single();

  if (!quiz) {
    logToFile('ℹ️ quiz_report: quiz row not found — skipping', { quizId });
    logEvent('quiz.report.skipped', { quizId, reason: 'quiz_not_found' });
    return { skipped: true, reason: 'quiz_not_found' };
  }

  // Defensive: if the quiz was cancelled AFTER the message was queued AND the
  // Redis cancel flag is missing (TTL expired or cancelByGroupId failed), the
  // quiz.status='cancelled' read still protects us.
  if (quiz.status === 'cancelled') {
    logToFile('ℹ️ quiz_report: quiz already cancelled — skipping', { quizId });
    logEvent('quiz.report.skipped', { quizId, reason: 'quiz_already_cancelled' });
    return { skipped: true, reason: 'quiz_already_cancelled' };
  }

  // Lookup peer sessions
  const { data: peers } = await supabase
    .from('quiz_sessions')
    .select('status')
    .eq('quiz_id', quizId);

  const allFinal = peers && peers.length > 0 && peers.every(s => TERMINAL_SESSION_STATES.includes(s.status));
  const ageMs = Date.now() - new Date(quiz.created_at).getTime();
  const past12h = ageMs > TWELVE_HOURS_MS;

  if (!allFinal && !past12h) {
    // Cascade re-queue: not finalised yet, not yet 12h old → check again in 15 min
    await SQSQueueService.queueJob(quizId, 'quiz_report', payload, {
      delaySeconds: SQS_MAX_DELAY_SECONDS,
      deduplicationId: `${quizId}-quiz_report-recheck-${Date.now()}`
    });
    logToFile('⏩ quiz_report not yet ready — re-queued for 15 min', { quizId, ageMs, peerCount: peers?.length || 0 });
    logEvent('quiz.report.cascade_requeued', { quizId, ageMs, peerCount: peers?.length || 0, allFinal });
    return { skipped: true, reason: 'requeued', ageMs };
  }

  // Resolve teacherPhone before firing the report. Two sources in priority
  // order: payload.teacherPhone → quiz.teacher_id → users.phone_number.
  // If both miss, we MUST NOT set quiz_report_sent below — otherwise the
  // sibling 15-min cascade message (which DOES carry teacherPhone) will hit
  // the flag and skip with reason='already_fired'.
  let teacherPhone = payload.teacherPhone;
  if (!teacherPhone && quiz.teacher_id) {
    const { data: teacher } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', quiz.teacher_id)
      .single();
    if (teacher && teacher.phone_number) {
      const raw = String(teacher.phone_number);
      teacherPhone = raw.startsWith('+') ? raw : `+${raw}`;
    }
  }

  if (!teacherPhone) {
    logToFile('⚠️ quiz_report: no teacher phone could be resolved — skipping (retry stays alive, idempotency flag NOT set)', { quizId, teacherIdPresent: !!quiz.teacher_id });
    logEvent('quiz.report.skipped', { quizId, reason: 'no_teacher_phone' });
    return { skipped: true, reason: 'no_teacher_phone' };
  }

  // Generate the report (12h timeout safety OR all sessions terminal)
  logEvent('quiz.report.generation_started', { quizId, allFinal, past12h, peerCount: peers?.length || 0 });
  const QuizReportService = require('../shared/services/quiz/quiz-report.service');
  await QuizReportService.generateReport(quizId, { ...payload, teacherPhone });
  logEvent('quiz.report.fired', { quizId });

  // Mark fired so cascade dedup short-circuits any future dequeue for this
  // quiz. 24h TTL — well past the 12h cascade ceiling.
  try {
    await RedisService.set(SENT_FLAG_KEY, '1', 86400);
  } catch (err) {
    logToFile('⚠️ Could not set quiz_report_sent flag (non-fatal — cascade may double-fire)', { quizId, error: err.message });
  }

  return { ok: true };
}

// ─── quiz_expire ────────────────────────────────────────────────────────────

async function handleQuizExpire(body) {
  const sessionId = body.groupId;
  const payload = body.payload || {};

  if (await isCancelled('quiz_expire', sessionId)) {
    return { skipped: true, reason: 'cancelled' };
  }

  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('id, status, expires_at, parent_phone')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return { skipped: true, reason: 'session_not_found' };
  }
  if (TERMINAL_SESSION_STATES.includes(session.status)) {
    return { skipped: true, reason: 'already_terminal' };
  }

  const expiresMs = new Date(session.expires_at).getTime();
  const remainingMs = expiresMs - Date.now();

  if (remainingMs > 0) {
    // Not yet expired — cascade re-queue
    const delaySeconds = Math.min(SQS_MAX_DELAY_SECONDS, Math.ceil(remainingMs / 1000));
    await SQSQueueService.queueJob(sessionId, 'quiz_expire', payload, {
      delaySeconds,
      deduplicationId: `${sessionId}-quiz_expire-recheck-${Date.now()}`
    });
    return { skipped: true, reason: 'requeued', remainingMs };
  }

  // Past expiry — flip 'invited'/'in_progress' → 'expired' for THIS session
  // (and only this session — broader sweeps belong elsewhere).
  await supabase
    .from('quiz_sessions')
    .update({ status: 'expired' })
    .eq('id', sessionId)
    .in('status', ['invited', 'in_progress']);

  // Clear Redis ACTIVE_KEY only if it still points to this session
  // (don't trample a fresh quiz the parent has just been invited to).
  if (session.parent_phone) {
    const stripPlus = (p) => (p || '').replace(/^\+/, '');
    const key = `quiz:student:${stripPlus(session.parent_phone)}:active`;
    try {
      const existing = await RedisService.get(key);
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed && parsed.sessionId === sessionId) {
            await RedisService.del(key);
            logToFile('🧹 quiz_expire: cleared stale Redis ACTIVE_KEY', {
              sessionId, phone: session.parent_phone.slice(-4)
            });
          }
        } catch (parseErr) {
          // Malformed Redis value — leave it alone, delivery-side cleanup catches it
        }
      }
    } catch (rErr) {
      logToFile('⚠️ quiz_expire: Redis cleanup error (non-fatal)', { sessionId, error: rErr.message });
    }
  }

  return { ok: true };
}

// ─── quiz_nudge ─────────────────────────────────────────────────────────────

async function handleQuizNudge(body) {
  const groupId = body.groupId;
  const payload = body.payload || {};

  if (await isCancelled('quiz_nudge', groupId)) {
    return { skipped: true, reason: 'cancelled' };
  }

  if (!payload.teacherPhone || !payload.topic || !payload.lpId) {
    logToFile('⚠️ quiz_nudge: missing required payload fields — skipping', { groupId });
    return { skipped: true, reason: 'missing_payload_fields' };
  }

  const WhatsAppService = require('../shared/services/whatsapp.service');
  await WhatsAppService.sendInteractiveButtons(payload.teacherPhone, {
    body: `Hi! You generated a lesson plan on "${payload.topic}" earlier.\n\nWould you like to send a quiz to your students? 📝`,
    buttons: [
      { id: `quiz_yes_send_${payload.lpId}`, title: 'Yes, send quiz ✓' },
      { id: 'quiz_maybe_later', title: 'Maybe later' }
    ]
  });

  await supabase
    .from('lesson_plans')
    .update({ quiz_nudge_sent: true })
    .eq('id', payload.lpId);

  return { ok: true };
}

// ─── quiz_reminder ──────────────────────────────────────────────────────────

async function handleQuizReminder(body) {
  const groupId = body.groupId;
  const payload = body.payload || {};

  if (await isCancelled('quiz_reminder', groupId)) {
    return { skipped: true, reason: 'cancelled' };
  }

  if (!payload.parentPhone || !payload.topic) {
    return { skipped: true, reason: 'missing_payload_fields' };
  }

  const WhatsAppService = require('../shared/services/whatsapp.service');
  await WhatsAppService.sendMessage(
    payload.parentPhone,
    `Still there? Your quiz on "${payload.topic}" is waiting! Tap an answer above to continue. 📚`
  );

  return { ok: true };
}

// ─── Dispatcher (called from sqs-worker.js) ─────────────────────────────────

async function handleQuizJob(jobType, body) {
  switch (jobType) {
    case 'quiz_report':   return handleQuizReport(body);
    case 'quiz_expire':   return handleQuizExpire(body);
    case 'quiz_nudge':    return handleQuizNudge(body);
    case 'quiz_reminder': return handleQuizReminder(body);
    default:
      throw new Error(`Unknown quiz job type: ${jobType}`);
  }
}

module.exports = {
  handleQuizJob,
  handleQuizReport,
  handleQuizExpire,
  handleQuizNudge,
  handleQuizReminder,
  isCancelled,
};
