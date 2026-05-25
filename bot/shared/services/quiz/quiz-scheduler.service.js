'use strict';
// QuizSchedulerService — Trigger 2 (post-LP elapsed nudge) + school hours logic

const { logToFile } = require('../../utils/logger');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');

class QuizSchedulerService {
  /**
   * Process Trigger 2: find LPs generated 2+ hours ago with no coaching,
   * where teacher has a class with phone numbers, and send a quiz nudge.
   * Called by scheduler.worker.js every 5 minutes.
   */
  static async processElapsedLPNudges() {
    logToFile('🔔 QuizSchedulerService.processElapsedLPNudges');

    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      // Find lesson plans generated 2+ hours ago, no quiz nudge sent yet, no coaching
      const { data: lps, error } = await supabase
        .from('lesson_plans')
        .select('id, user_id, topic, grade, subject, created_at, users(id, phone_number, name)')
        .eq('status', 'completed')
        .eq('quiz_nudge_sent', false)
        .lt('created_at', twoHoursAgo)
        .is('quiz_id', null)
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) {
        logToFile('❌ Error fetching LPs for nudge', { error: error.message });
        return;
      }

      for (const lp of (lps || [])) {
        try {
          await this._processOneLP(lp);
        } catch (err) {
          logToFile('⚠️ Error processing LP nudge', { lpId: lp.id, error: err.message });
        }
      }

    } catch (err) {
      logToFile('❌ QuizSchedulerService.processElapsedLPNudges error', { error: err.message });
    }
  }

  /**
   * Process nudge for a single LP.
   * @private
   */
  static async _processOneLP(lp) {
    const teacher = lp.users || lp.user;
    if (!teacher?.phone_number) return;

    // Check if teacher started coaching for this LP period
    const { data: coachingSessions } = await supabase
      .from('coaching_sessions')
      .select('id')
      .eq('user_id', lp.user_id)
      .gte('created_at', lp.created_at)
      .limit(1);

    if (coachingSessions && coachingSessions.length > 0) {
      // Teacher already did coaching — mark nudge as sent (skip it)
      await supabase
        .from('lesson_plans')
        .update({ quiz_nudge_sent: true })
        .eq('id', lp.id);
      return;
    }

    // Check teacher has a class with phone numbers
    const { data: classes } = await supabase
      .from('student_lists')
      .select('id, class_name')
      .eq('user_id', lp.user_id)
      .limit(1);

    if (!classes || classes.length === 0) return;

    // Check school hours
    if (!this.isSchoolHours()) {
      const nextTime = this.nextSchoolHour();
      // enqueue via SQS instead of scheduled_jobs.
      // SQS DelaySeconds caps at 900s; if next school hour is further out
      // the handler's cascade re-queue logic walks the rest. SQS dedup on
      // the deduplicationId means we don't need the existing-job check —
      // duplicate enqueues for the same lp.id are rejected at the queue level
      // within the 5-min FIFO dedup window.
      const delaySeconds = Math.max(0, Math.min(900, Math.ceil((nextTime.getTime() - Date.now()) / 1000)));
      try {
        const SQSQueueService = require('../queue/sqs-queue.service');
        await SQSQueueService.queueJob(
          lp.id,
          'quiz_nudge',
          { teacherPhone: teacher.phone_number, topic: lp.topic, lpId: lp.id },
          {
            delaySeconds,
            deduplicationId: `${lp.id}-quiz_nudge-initial`
          }
        );
      } catch (err) {
        logToFile('⚠️ Could not enqueue quiz_nudge', { lpId: lp.id, error: err.message });
      }
      return;
    }

    // Send nudge
    await WhatsAppService.sendInteractiveButtons(teacher.phone_number, {
      body: `Hi! You generated a lesson plan on "${lp.topic}" earlier today.\n\nWould you like to send a quiz to your students to check their understanding? 📝`,
      buttons: [
        { id: `quiz_yes_send_${lp.id}`, title: 'Yes, send quiz ✓' },
        { id: 'quiz_maybe_later', title: 'Maybe later' }
      ]
    });

    // Mark nudge sent
    await supabase
      .from('lesson_plans')
      .update({ quiz_nudge_sent: true })
      .eq('id', lp.id);

    logToFile('✅ Quiz nudge sent', { lpId: lp.id, topic: lp.topic });
  }

  /**
   * Is the current time within Pakistan school hours?
   * Mon-Sat 8 AM - 4 PM PKT (UTC+5), except Friday until 12 PM.
   *
   * @param {Date} date - Defaults to now
   * @returns {boolean}
   */
  static isSchoolHours(date = new Date()) {
    const pktHour = (date.getUTCHours() + 5) % 24;
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

    if (dayOfWeek === 0) return false; // Sunday
    if (dayOfWeek === 5) return pktHour >= 8 && pktHour < 12; // Friday (Jummah)
    return pktHour >= 8 && pktHour < 16;
  }

  /**
   * Get the next school-hours timestamp.
   * Used for scheduling nudges outside school hours.
   *
   * @param {Date} from - Starting point (defaults to now)
   * @returns {Date} Next 9 AM PKT on a school day
   */
  static nextSchoolHour(from = new Date()) {
    const next = new Date(from);
    // Set to 9 AM PKT = 4 AM UTC
    next.setUTCHours(4, 0, 0, 0);

    // If 9 AM today already passed, move to tomorrow
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }

    // Skip Sunday (day 0)
    while (next.getDay() === 0) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  // ───: Idle reminder (30 min) ─────────────────────────────────────────

  /**
   * Find quiz sessions that have been idle for 30+ minutes and send a nudge.
   * Called by scheduler worker periodically.
   */
  static async processIdleReminders() {
    logToFile('🔔 QuizSchedulerService.processIdleReminders');
    const redisService = require('../cache/railway-redis.service');

    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      // Find active sessions with no recent activity
      const { data: sessions, error } = await supabase
        .from('quiz_sessions')
        .select('id, parent_phone, student_id, students(student_name)')
        .in('status', ['active', 'in_progress'])
        .lt('updated_at', thirtyMinAgo)
        .eq('idle_reminder_sent', false)
        .limit(20);

      if (error || !sessions) return;

      for (const session of sessions) {
        try {
          // Verify there's still an active Redis state (session hasn't completed)
          const stateRaw = await redisService.redis.get(`quiz:student:${session.parent_phone}:active`);
          if (!stateRaw) continue;

          const studentName = session.students?.student_name || 'there';
          await WhatsAppService.sendMessage(session.parent_phone,
            `Hey ${studentName}! You still have quiz questions waiting. ` +
            `Tap an answer to continue, or type STOP if you're done. 😊`
          );

          await supabase
            .from('quiz_sessions')
            .update({ idle_reminder_sent: true })
            .eq('id', session.id);

          logToFile('📨 Idle reminder sent', { sessionId: session.id, phone: session.parent_phone.slice(-4) });
        } catch (err) {
          logToFile('⚠️ Error sending idle reminder', { sessionId: session.id, error: err.message });
        }
      }
    } catch (err) {
      logToFile('❌ processIdleReminders error', { error: err.message });
    }
  }

  // ───: Expire old sessions (24h) ─────────────────────────────────────

  /**
   * Expire quiz sessions older than 24 hours that are still active.
   * Called by scheduler worker periodically.
   */
  static async expireOldSessions() {
    logToFile('🔔 QuizSchedulerService.expireOldSessions');
    const redisService = require('../cache/railway-redis.service');

    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Find sessions that should be expired
      const { data: sessions, error } = await supabase
        .from('quiz_sessions')
        .select('id, parent_phone, total_questions_answered, correct_answers')
        .in('status', ['invited', 'active', 'in_progress'])
        .lt('created_at', twentyFourHoursAgo)
        .limit(50);

      if (error || !sessions) return;

      for (const session of sessions) {
        try {
          // Mark as expired in DB
          const mastery = session.total_questions_answered > 0
            ? Math.round((session.correct_answers / session.total_questions_answered) * 100)
            : 0;

          await supabase
            .from('quiz_sessions')
            .update({
              status: 'expired',
              mastery_percentage: mastery,
              completed_at: new Date().toISOString()
            })
            .eq('id', session.id);

          // Clean up Redis
          await redisService.redis.del(`quiz:student:${session.parent_phone}:active`);
          await redisService.redis.del(`quiz:student:${session.parent_phone}:queue`);
          await redisService.redis.del(`quiz:student:${session.parent_phone}:postquiz`);
          await redisService.redis.del(`quiz:q_time:${session.parent_phone}`);

          logToFile('⏰ Session expired', { sessionId: session.id, phone: session.parent_phone.slice(-4) });
        } catch (err) {
          logToFile('⚠️ Error expiring session', { sessionId: session.id, error: err.message });
        }
      }

      if (sessions.length > 0) {
        logToFile(`✅ Expired ${sessions.length} old quiz sessions`);
      }
    } catch (err) {
      logToFile('❌ expireOldSessions error', { error: err.message });
    }
  }
}

module.exports = QuizSchedulerService;
