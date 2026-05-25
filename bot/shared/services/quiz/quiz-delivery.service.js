'use strict';
// QuizDeliveryService — send quiz invitations to all students in a class

const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');  //  structured events
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const redisService = require('../cache/railway-redis.service');
const SQSQueueService = require('../queue');  //  Phase 8 producer side

// Redis keys must use the same phone format the webhook delivers.
// students.parent_phone is stored E.164 with + (e.g. +<country><number>) but Meta webhooks
// deliver `messages[0].from` WITHOUT the +. Normalising both sides to no-plus
// matches the webhook delivery format so getActiveState() in quiz-session
// finds the row when the parent taps Start Quiz.
const stripPlus = (p) => (p && p.startsWith('+')) ? p.slice(1) : p;
const REDIS_ACTIVE_KEY = (phone) => `quiz:student:${stripPlus(phone)}:active`;
const REDIS_QUEUE_KEY  = (phone) => `quiz:student:${stripPlus(phone)}:queue`;

class QuizDeliveryService {
  /**
   * Send the quiz to all students in the class.
   * Creates quiz_session per student, sets Redis state, sends intro + first question.
   *
   * @param {string} quizId        - UUID of the quiz (status must be 'ready')
   * @param {string} teacherPhone  - Teacher's phone (for confirmation message)
   * @param {string} language      - Teacher's language
   */
  static async deliverQuiz(quizId, teacherPhone, language = 'en') {
    logToFile('📤 QuizDeliveryService.deliverQuiz', { quizId });
    logEvent('quiz.delivery.started', { quizId, language });

    // Fetch quiz
    const { data: quiz, error: quizErr } = await supabase
      .from('quizzes')
      .select('id, topic, grade, list_id, status')
      .eq('id', quizId)
      .single();

    // Look up teacher name. Same phone-format issue as:
    // users.phone_number is stored without the leading + for ~5932/5933
    // active rows. Try no-plus first (the common case) then fall back to +.
    // Schema fix: column is `first_name`, not `name`.
    let teacherName = language === 'ur' ? 'آپ کے استاد' : 'Your teacher';
    try {
      const noPlus = teacherPhone.startsWith('+') ? teacherPhone.slice(1) : teacherPhone;
      const withPlus = teacherPhone.startsWith('+') ? teacherPhone : `+${teacherPhone}`;
      let { data: teacher } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('phone_number', noPlus)
        .single();
      if (!teacher) {
        const fallback = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('phone_number', withPlus)
          .single();
        teacher = fallback.data;
      }
      if (teacher?.first_name) {
        teacherName = teacher.last_name
          ? `${teacher.first_name} ${teacher.last_name}`.trim()
          : teacher.first_name;
      }
    } catch (e) {
      logToFile('⚠️ Could not fetch teacher name, using fallback', { error: e.message });
    }

    if (quizErr || !quiz) {
      throw new Error(`Quiz not found: ${quizId}`);
    }

    if (quiz.status !== 'ready' && quiz.status !== 'generating') {
      throw new Error(`Quiz status is "${quiz.status}", expected "ready"`);
    }

    // Fetch students with phone numbers
    const { data: students, error: stuErr } = await supabase
      .from('students')
      .select('id, student_name, parent_phone')
      .eq('list_id', quiz.list_id)
      .not('parent_phone', 'is', null)
      .eq('is_active', true);

    if (stuErr || !students || students.length === 0) {
      await WhatsAppService.sendMessage(teacherPhone,
        '⚠️ No students with phone numbers found. Add phone numbers to your class first.'
      );
      return;
    }

    let sentCount = 0;

    // Group students by phone (siblings)
    const byPhone = {};
    for (const s of students) {
      if (!byPhone[s.parent_phone]) byPhone[s.parent_phone] = [];
      byPhone[s.parent_phone].push(s);
    }

    // Send to each phone (one at a time to respect rate limits)
    for (const [parentPhone, phoneStudents] of Object.entries(byPhone)) {
      try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const firstStudent = phoneStudents[0];

        // queue-skip check FIRST, before creating any session rows.
        //
        // Why this order matters: yesterday's pattern was "create session row
        // → check Redis → maybe queue-skip → continue without sending". That
        // left a zombie quiz_sessions row in 'invited' status with no message
        // ever sent. The next quiz delivery would then find THAT zombie
        // session via Redis lookup and queue-skip again. Self-perpetuating.
        //
        // (yesterday's fix) validated Redis state against DB session
        // status, but only checked status (`invited`/`in_progress`).
        // also requires the session's expires_at to be in the future —
        // because nothing currently enqueues quiz_expire jobs (the handler
        // exists in scheduler.worker.js but no caller), so 'invited' sessions
        // older than 24h pile up forever.
        //
        // Sequence:
        //   1. Look up Redis ACTIVE_KEY for this parent
        //   2. If empty → no prior active quiz, continue to delivery
        //   3. If has state → validate stored sessionId against DB
        //      - status NOT in (invited, in_progress) → stale, clear & deliver
        //      - status invited/in_progress AND expires_at > now() → genuinely active, queue-skip
        //      - status invited/in_progress AND expires_at <= now() → expired-but-stuck, clear & deliver
        //         (and flip the orphaned row to 'expired' so future cancel paths see it)
        const existingState = await redisService.redis.get(REDIS_ACTIVE_KEY(parentPhone));
        if (existingState) {
          let isActuallyActive = false;
          let staleReason = null;
          let staleSessionId = null;
          try {
            const parsed = JSON.parse(existingState);
            if (parsed?.sessionId) {
              staleSessionId = parsed.sessionId;
              const { data: existingSession } = await supabase
                .from('quiz_sessions')
                .select('status, expires_at')
                .eq('id', parsed.sessionId)
                .single();
              if (existingSession) {
                const statusLive = ['invited', 'in_progress'].includes(existingSession.status);
                const notExpired = existingSession.expires_at && new Date(existingSession.expires_at) > new Date();
                isActuallyActive = statusLive && notExpired;
                if (statusLive && !notExpired) staleReason = 'past_expires_at';
                else if (!statusLive) staleReason = `db_status_${existingSession.status}`;
              } else {
                staleReason = 'db_session_not_found';
              }
            } else {
              staleReason = 'redis_state_no_session_id';
            }
          } catch (parseErr) {
            logToFile('⚠️ Could not parse existing Redis quiz state', { phone: parentPhone.slice(-4), error: parseErr.message });
            staleReason = 'redis_parse_error';
          }

          if (isActuallyActive) {
            logToFile('⚠️ Phone already has active quiz — skipping new delivery', { phone: parentPhone.slice(-4) });
            continue;
          }

          // also flip orphaned 'invited'/'in_progress' rows that are past
          // their expires_at to 'expired'. This is what scheduler.worker.js's
          // quiz_expire handler is supposed to do, but no code currently enqueues
          // quiz_expire jobs. Until the worker-side fix lands, do it here at
          // delivery time so the orphan can't block again.
          if (staleSessionId && staleReason === 'past_expires_at') {
            await supabase
              .from('quiz_sessions')
              .update({ status: 'expired' })
              .eq('id', staleSessionId)
              .in('status', ['invited', 'in_progress']);
          }

          logToFile('🧹 Clearing stale Redis quiz state', { phone: parentPhone.slice(-4), reason: staleReason });
          await redisService.redis.del(REDIS_ACTIVE_KEY(parentPhone));
        }

        // ── Past the queue-skip gate. Now create the session row. ──
        const { data: session, error: sessErr } = await supabase
          .from('quiz_sessions')
          .insert({
            quiz_id: quizId,
            student_id: firstStudent.id,
            parent_phone: parentPhone,
            status: 'invited',
            current_difficulty: 3,
            expires_at: expiresAt
          })
          .select('id')
          .single();

        if (sessErr) {
          logToFile('⚠️ Error creating quiz session', { studentId: firstStudent.id, error: sessErr.message });
          continue;
        }

        const state = {
          sessionId: session.id,
          quizId,
          studentId: firstStudent.id,
          studentName: firstStudent.student_name,
          topic: quiz.topic,
          currentDifficulty: 3,
          totalAnswered: 0,
          correctAnswers: 0,
          windowAnswers: [],
          currentQuestionId: null
        };

        // Queue siblings (same phone, additional students)
        if (phoneStudents.length > 1) {
          const queueEntries = [];
          for (let i = 1; i < phoneStudents.length; i++) {
            const sibling = phoneStudents[i];
            const { data: sibSession } = await supabase
              .from('quiz_sessions')
              .insert({
                quiz_id: quizId,
                student_id: sibling.id,
                parent_phone: parentPhone,
                status: 'invited',
                current_difficulty: 3,
                expires_at: expiresAt
              })
              .select('id')
              .single();

            if (sibSession) {
              queueEntries.push({
                studentName: sibling.student_name,
                topic: quiz.topic,
                state: {
                  sessionId: sibSession.id,
                  quizId,
                  studentId: sibling.id,
                  studentName: sibling.student_name,
                  topic: quiz.topic,
                  currentDifficulty: 3,
                  totalAnswered: 0,
                  correctAnswers: 0,
                  windowAnswers: [],
                  currentQuestionId: null
                }
              });
            }
          }

          if (queueEntries.length > 0) {
            await redisService.setexWithCeiling(REDIS_QUEUE_KEY(parentPhone), 86400, JSON.stringify(queueEntries));
            logToFile('📋 Quiz queue set for siblings', { phone: parentPhone.slice(-4), count: queueEntries.length });
          }
        }

        // Set active Redis state
        await redisService.setexWithCeiling(REDIS_ACTIVE_KEY(parentPhone), 86400, JSON.stringify(state));

        // enqueue a quiz_expire SQS message for this
        // session. The design (insert into scheduled_jobs with
        // scheduled_at = expires_at) is replaced by SQS DelaySeconds + the
        // QuizJobHandler.handleQuizExpire cascade re-queue (since SQS
        // DelaySeconds caps at 900s but expires_at is 24h out, the handler
        // cascades every 15 min until expiry is reached).
        try {
          await SQSQueueService.queueJob(
            session.id,
            'quiz_expire',
            { quizId, sessionId: session.id, parentPhone },
            {
              delaySeconds: 900,  // initial 15-min check; handler cascades to 24h
              deduplicationId: `${session.id}-quiz_expire-initial`
            }
          );
        } catch (expireErr) {
          logToFile('⚠️ Could not enqueue quiz_expire (non-fatal)', { sessionId: session.id, error: expireErr.message });
        }

        // 24h window optimization — check if parent messaged in last 24h
        // If yes, send free regular message. If no, use paid template.
        const hasOpenWindow = await this._hasOpenMessageWindow(parentPhone);

        if (hasOpenWindow) {
          // Free message — parent has an open 24h window
          logToFile('💬 Sending quiz invite as regular message (24h window open)', { phone: parentPhone.slice(-4) });
          await WhatsAppService.sendInteractiveButtons(parentPhone, {
            header: language === 'ur' ? `${teacherName} کی طرف سے کوئز` : `Quiz from ${teacherName}`,
            body: language === 'ur'
              ? `السلام علیکم! ${firstStudent.student_name} کے استاد ${teacherName} نے "${quiz.topic}" پر ایک کوئز بھیجا ہے۔\n\n"کوئز شروع کریں" دبائیں اور چند سوالات کے جواب دیں۔ روکنے کے لیے STOP لکھیں۔`
              : `Assalam o Alaikum! ${firstStudent.student_name}'s teacher ${teacherName} has sent a quiz on "${quiz.topic}".\n\nTap "Start Quiz" to answer a few short questions. You can stop anytime by typing STOP.`,
            buttons: [
              { id: 'quiz_invite_start', title: language === 'ur' ? 'کوئز شروع کریں' : 'Start Quiz' },
              { id: 'quiz_invite_skip', title: language === 'ur' ? 'ابھی نہیں' : 'Not now' }
            ]
          });
        } else {
          // Paid utility template — no open 24h window, fall back to
          // an approved template so cold parents still receive the invite.
          //
          // Template names + shape are identical on staging + prod WABA so
          // this code path works in both environments:
          //   quiz_invitation_en / quiz_invitation_ur — UTILITY category
          //   header: static text (no params)
          //   body:  2 params — {{1}} student name, {{2}} quiz topic
          //   buttons: Start Quiz / Not now (QUICK_REPLY)
          //
          // Teacher name is intentionally NOT in this template (kept generic
          // for faster Meta approval + lower per-line variability). The full
          // teacher-name greeting comes through in the free-message path
          // once the parent taps Start Quiz and the 24h window opens.
          logToFile('📨 Sending quiz invite as template (no 24h window)', { phone: parentPhone.slice(-4) });
          const templateName = language === 'ur' ? 'quiz_invitation_ur' : 'quiz_invitation_en';
          await WhatsAppService.sendTemplate(parentPhone, templateName, language === 'ur' ? 'ur' : 'en', [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: firstStudent.student_name },
                { type: 'text', text: quiz.topic }
              ]
            }
          ]);
        }

        sentCount++;

        // Rate limit: 1 second between students
        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        logToFile('❌ Error delivering quiz to student', {
          phone: parentPhone.slice(-4),
          error: err.message
        });
      }
    }

    // Update quiz status and schedule report
    await supabase
      .from('quizzes')
      .update({
        status: 'sent',
        total_students_sent: sentCount,
        report_scheduled_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', quizId);

    // enqueue the 12h report fallback to SQS instead of
    // scheduled_jobs. Initial delay 900s; handler cascades every 15 min.
    // When all students complete, _maybeAdvanceReport enqueues a SECOND
    // message with delaySeconds=60. The handler's quiz_report_sent Redis
    // flag (24h TTL) ensures only one report ever fires per quiz.
    await SQSQueueService.queueJob(
      quizId,
      'quiz_report',
      { teacherPhone, language },
      {
        delaySeconds: 900,  // 15-min cascade start; handler walks to 12h cap
        deduplicationId: `${quizId}-quiz_report-initial`
      }
    );

    // Confirm to teacher
    await WhatsAppService.sendMessage(teacherPhone,
      `✅ Quiz on "${quiz.topic}" sent to ${sentCount} student${sentCount !== 1 ? 's' : ''}!\n\n` +
      `You'll receive a report with results in about 12 hours. 📊`
    );

    logToFile('✅ Quiz delivery complete', { quizId, sentCount });
    logEvent('quiz.delivery.completed', { quizId, sentCount, totalStudents: students.length });
  }
  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Check if parent has an open 24h WhatsApp messaging window.
   * If they messaged the bot within the last 23 hours (1h safety margin),
   * we can send a free regular message instead of a paid template.
   *
   * @param {string} phone - Parent phone number (E.164, with leading +)
   * @returns {boolean} true if we can send free messages
   */
  static async _hasOpenMessageWindow(phone) {
    try {
      // short-circuit when we've recently seen a 131047 from Meta
      // for this phone. The chat_sessions check below is the optimistic
      // path; this cache is the negative override populated by the
      // broadcast-status webhook handler in whatsapp-bot.js. Keeps us out
      // of the "bot thinks window is open, Meta says no" trap that bit
      // a prior stress test.
      try {
        const metaWindowCache = require('./meta-window-cache.service');
        if (await metaWindowCache.isWindowClosed(phone)) {
          logToFile('🚫 Window-closed flag hit (131047 cache) — routing to template', { phone: phone.slice(-4) });
          return false;
        }
      } catch (_) { /* fail-open: cache miss means we fall back to chat_sessions */ }

      // parent_phone is stored E.164 with + (e.g. +<country><number>) but
      // users.phone_number is stored without + for most active rows.
      // Try the no-plus form first (the common case) then fall back to the
      // verbatim form so the 1/5933 + prefixed row still matches.
      const noPlus = phone.startsWith('+') ? phone.slice(1) : phone;
      const withPlus = phone.startsWith('+') ? phone : `+${phone}`;

      let { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', noPlus)
        .single();

      if (!user) {
        const fallback = await supabase
          .from('users')
          .select('id')
          .eq('phone_number', withPlus)
          .single();
        user = fallback.data;
      }

      if (!user) return false;

      // Check last activity within 23 hours (1h safety margin on 24h window)
      const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('user_id', user.id)
        .gte('last_activity_at', cutoff)
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .single();

      return !!session;
    } catch (err) {
      // On error, default to paid template (safer than failing delivery)
      logToFile('⚠️ Could not check 24h window, defaulting to template', { phone: phone.slice(-4), error: err.message });
      return false;
    }
  }
}

module.exports = QuizDeliveryService;
