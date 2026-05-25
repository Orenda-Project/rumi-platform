'use strict';
// Cross-feature "is the teacher busy right now?" probe + the cancellable
// resource list that powers the /status flow.
//
// probeTeacherBusy is lazy: invoked when a scheduled quiz_report job is about
// to fire, so the report can be deferred a few minutes when the teacher is
// mid-coaching/LP/video/reading/attendance.
//
// Sources of state checked:
// - Coaching:   Postgres `coaching_sessions` rows, non-terminal, last hour
// - LP request: Postgres `lesson_plan_requests` rows in pending/processing/extracting
// - Video:      Redis keys `user:{id}:awaiting_video_*`
// - Reading:    Redis key `reading:user:{id}:current_assessment`
// - Attendance: Redis key `attendance:session:{id}`
//
// Defaults to "not busy" on any probe error so a Redis/DB blip never blocks
// reports forever.

const supabase = require('../config/supabase');
const redisService = require('./cache/railway-redis.service');
const { logToFile } = require('../utils/logger');

const ONE_HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const THIRTY_MIN_AGO = () => new Date(Date.now() - 30 * 60 * 1000).toISOString();

const COACHING_TERMINAL = ['completed', 'failed', 'cancelled', 'report_sent'];
const LP_IN_FLIGHT = ['pending', 'processing', 'extracting'];

/**
 * @returns {Promise<{busy: boolean, feature: string|null, etaSeconds: number|null}>}
 *   busy=false       → the scheduler delivers the report immediately
 *   busy=true,
 *     feature=string  → which feature is occupying her right now
 *     etaSeconds=N|null → hint for how long to defer; scheduler uses
 *                          a default (10 min) when null
 */
async function probeTeacherBusy(userId) {
  if (!userId) return { busy: false, feature: null, etaSeconds: null };

  // 1. Coaching session in flight
  try {
    const { data: coachingRows } = await supabase
      .from('coaching_sessions')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .not('status', 'in', `(${COACHING_TERMINAL.join(',')})`)
      .gte('created_at', ONE_HOUR_AGO())
      .limit(1);
    if (coachingRows && coachingRows.length > 0) {
      return { busy: true, feature: 'coaching', etaSeconds: null };
    }
  } catch (err) {
    logToFile('⚠️ probeTeacherBusy: coaching probe failed (defaulting to not-busy)', { userId, error: err.message });
  }

  // 2. LP request currently being processed
  try {
    const { data: lpRows } = await supabase
      .from('lesson_plan_requests')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .in('status', LP_IN_FLIGHT)
      .gte('created_at', THIRTY_MIN_AGO())
      .limit(1);
    if (lpRows && lpRows.length > 0) {
      // LPs typically finish within 30-60s; defer 5 min as a safety
      return { busy: true, feature: 'lesson_plan', etaSeconds: 300 };
    }
  } catch (err) {
    logToFile('⚠️ probeTeacherBusy: LP probe failed (defaulting to not-busy)', { userId, error: err.message });
  }

  // 3. Video flow open (any of the four awaiting-* states)
  try {
    if (redisService.isAvailable && redisService.isAvailable()) {
      const videoKeys = [
        `user:${userId}:awaiting_video_topic`,
        `user:${userId}:awaiting_video_language`,
        `user:${userId}:awaiting_video_customization`,
        `user:${userId}:awaiting_video_style`,
      ];
      for (const k of videoKeys) {
        const v = await redisService.redis.get(k);
        if (v) {
          return { busy: true, feature: 'video', etaSeconds: 900 }; // 15 min — matches video state TTL
        }
      }
    }
  } catch (err) {
    logToFile('⚠️ probeTeacherBusy: video probe failed (defaulting to not-busy)', { userId, error: err.message });
  }

  // 4. Reading assessment in flight
  try {
    if (redisService.isAvailable && redisService.isAvailable()) {
      const readingState = await redisService.redis.get(`reading:user:${userId}:current_assessment`);
      if (readingState) {
        return { busy: true, feature: 'reading', etaSeconds: null };
      }
    }
  } catch (err) {
    logToFile('⚠️ probeTeacherBusy: reading probe failed (defaulting to not-busy)', { userId, error: err.message });
  }

  // 5. Attendance flow open
  try {
    if (redisService.isAvailable && redisService.isAvailable()) {
      const attState = await redisService.redis.get(`attendance:session:${userId}`);
      if (attState) {
        return { busy: true, feature: 'attendance', etaSeconds: null };
      }
    }
  } catch (err) {
    logToFile('⚠️ probeTeacherBusy: attendance probe failed (defaulting to not-busy)', { userId, error: err.message });
  }

  return { busy: false, feature: null, etaSeconds: null };
}

/**
 * listActiveResources(userId)
 *   Returns an ordered array of cancellable items for the /status flow.
 *   Each item: { id, title, kind, refId }
 *     id     → the radio-row id ('cancel_quiz_<uuid>' / 'cancel_lp_<uuid>' / 'cancel_coaching_<uuid>' / 'cancel_video' / 'cancel_reading' / 'cancel_attendance')
 *     title  → human-friendly label shown to the teacher
 *     kind   → one of 'quiz' | 'lesson_plan' | 'coaching' | 'video' | 'reading' | 'attendance'
 *     refId  → UUID where applicable, else null
 *
 *   Cancel coverage:
 *     ✅ quiz        — QuizOrchestrator.cancelQuiz (orchestrator path)
 *     ⚠ coaching    — DB status flip + Redis state delete (teacher-only)
 *     ⚠ lesson_plan — DB status='cancelled' (background job continues, result discarded)
 *     ⚠ video       — Redis state delete only (running job continues)
 *     ⚠ reading     — Redis flow delete only
 *     ⚠ attendance  — Redis state delete only
 */
async function listActiveResources(userId) {
  if (!userId) return [];
  const items = [];

  // Quizzes — pull active ones for this teacher
  try {
    const { data: quizzes } = await supabase
      .from('quizzes')
      .select(`
        id, topic, list_id,
        student_lists ( class_name, section )
      `)
      .eq('teacher_id', userId)
      .in('status', ['sent', 'ready', 'completed'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    for (const q of (quizzes || [])) {
      const cls = q.student_lists
        ? (q.student_lists.section ? `${q.student_lists.class_name}-${q.student_lists.section}` : q.student_lists.class_name)
        : '?';
      // Skip quizzes whose every session is already terminal
      const { data: peers } = await supabase
        .from('quiz_sessions').select('status').eq('quiz_id', q.id);
      const allDone = (peers || []).length > 0 && peers.every(s =>
        ['completed', 'incomplete', 'expired', 'cancelled'].includes(s.status)
      );
      if (allDone) continue;
      items.push({
        id: `cancel_quiz_${q.id}`,
        title: `Quiz · ${cls} · ${q.topic}`.slice(0, 70),
        kind: 'quiz',
        refId: q.id
      });
    }
  } catch (err) {
    logToFile('⚠️ listActiveResources: quiz probe failed', { error: err.message });
  }

  // Coaching sessions
  try {
    const { data: coachingRows } = await supabase
      .from('coaching_sessions')
      .select('id, created_at, status')
      .eq('user_id', userId)
      .not('status', 'in', `(${COACHING_TERMINAL.join(',')})`)
      .gte('created_at', ONE_HOUR_AGO())
      .limit(2);
    for (const c of (coachingRows || [])) {
      items.push({
        id: `cancel_coaching_${c.id}`,
        title: 'Coaching session in progress',
        kind: 'coaching',
        refId: c.id
      });
    }
  } catch (err) {
    logToFile('⚠️ listActiveResources: coaching probe failed', { error: err.message });
  }

  // LP requests
  try {
    const { data: lpRows } = await supabase
      .from('lesson_plan_requests')
      .select('id, topic, created_at, status')
      .eq('user_id', userId)
      .in('status', LP_IN_FLIGHT)
      .gte('created_at', THIRTY_MIN_AGO())
      .limit(2);
    for (const lp of (lpRows || [])) {
      items.push({
        id: `cancel_lp_${lp.id}`,
        title: `Lesson plan · ${lp.topic || 'in progress'}`.slice(0, 70),
        kind: 'lesson_plan',
        refId: lp.id
      });
    }
  } catch (err) {
    logToFile('⚠️ listActiveResources: LP probe failed', { error: err.message });
  }

  // Redis-backed flows: video / reading / attendance
  try {
    if (redisService.isAvailable && redisService.isAvailable()) {
      const videoKeys = [
        `user:${userId}:awaiting_video_topic`,
        `user:${userId}:awaiting_video_language`,
        `user:${userId}:awaiting_video_customization`,
        `user:${userId}:awaiting_video_style`
      ];
      for (const k of videoKeys) {
        const v = await redisService.redis.get(k);
        if (v) {
          items.push({ id: 'cancel_video', title: 'Video generation', kind: 'video', refId: null });
          break;
        }
      }
      const readingState = await redisService.redis.get(`reading:user:${userId}:current_assessment`);
      if (readingState) {
        items.push({ id: 'cancel_reading', title: 'Reading assessment in progress', kind: 'reading', refId: null });
      }
      const attState = await redisService.redis.get(`attendance:session:${userId}`);
      if (attState) {
        items.push({ id: 'cancel_attendance', title: 'Attendance flow open', kind: 'attendance', refId: null });
      }
    }
  } catch (err) {
    logToFile('⚠️ listActiveResources: redis probe failed', { error: err.message });
  }

  return items;
}

/**
 * cancelResource(item, userId)
 *   Routes cancel by kind. Quizzes go through the full orchestrator;
 *   the others do a state-delete with a polite acknowledgement.
 */
async function cancelResource(item, userId) {
  if (!item || !item.kind) return { ok: false, reason: 'invalid resource' };
  try {
    if (item.kind === 'quiz' && item.refId) {
      const QuizOrchestrator = require('./quiz/quiz-orchestrator.service');
      await QuizOrchestrator.cancelQuiz(item.refId, userId);
      return { ok: true, message: `🛑 Quiz cancelled. The scheduled report won't be generated for it.` };
    }
    if (item.kind === 'coaching' && item.refId) {
      await supabase
        .from('coaching_sessions')
        .update({ status: 'cancelled' })
        .eq('id', item.refId)
        .eq('user_id', userId);
      return { ok: true, message: `🛑 Coaching session stopped on our end.` };
    }
    if (item.kind === 'lesson_plan' && item.refId) {
      await supabase
        .from('lesson_plan_requests')
        .update({ status: 'cancelled' })
        .eq('id', item.refId)
        .eq('user_id', userId);
      return {
        ok: true,
        message: `🛑 Lesson plan cancelled on our end. The background generation may still finish but you won't be notified.`
      };
    }
    if (item.kind === 'video') {
      const keys = [
        `user:${userId}:awaiting_video_topic`,
        `user:${userId}:awaiting_video_language`,
        `user:${userId}:awaiting_video_customization`,
        `user:${userId}:awaiting_video_style`
      ];
      for (const k of keys) await redisService.redis.del(k);
      return {
        ok: true,
        message: `🛑 Video flow stopped on our end. The background generation may still finish but you won't be notified.`
      };
    }
    if (item.kind === 'reading') {
      await redisService.redis.del(`reading:user:${userId}:current_assessment`);
      return { ok: true, message: `🛑 Reading assessment stopped. Tap /reading test to start a fresh one.` };
    }
    if (item.kind === 'attendance') {
      await redisService.redis.del(`attendance:session:${userId}`);
      return { ok: true, message: `🛑 Attendance flow closed. Tap "attendance" to start a new one.` };
    }
    return { ok: false, reason: 'unknown kind' };
  } catch (err) {
    logToFile('❌ cancelResource error', { kind: item.kind, refId: item.refId, error: err.message });
    return { ok: false, reason: err.message };
  }
}

/**
 * Parse a status-flow row id like 'cancel_quiz_<uuid>' / 'cancel_video' /
 * 'done' back into { kind, refId } or 'done'/'unknown'.
 */
function parseResourceId(rowId) {
  if (!rowId) return { kind: 'unknown' };
  if (rowId === 'done') return { kind: 'done' };
  const m = rowId.match(/^cancel_(quiz|coaching|lp|video|reading|attendance)(?:_(.+))?$/);
  if (!m) return { kind: 'unknown' };
  const kindMap = { quiz: 'quiz', coaching: 'coaching', lp: 'lesson_plan', video: 'video', reading: 'reading', attendance: 'attendance' };
  return { kind: kindMap[m[1]], refId: m[2] || null };
}

module.exports = {
  probeTeacherBusy,
  listActiveResources,
  cancelResource,
  parseResourceId
};
