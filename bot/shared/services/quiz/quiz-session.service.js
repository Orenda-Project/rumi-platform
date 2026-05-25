'use strict';
// QuizSessionService — handle student answers, track state, adaptive difficulty

const { logToFile } = require('../../utils/logger');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const redisService = require('../cache/railway-redis.service');
const SQSQueueService = require('../queue/sqs-queue.service');  //  Phase 8 producer side
const { computeNextDifficulty, shouldEndQuiz } = require('./quiz-adaptive');
const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../../utils/constants');

// Normalise phone format for Redis keys. Meta webhooks deliver
// `messages[0].from` WITHOUT the leading +, but students.parent_phone is
// stored E.164 with +. Stripping the + on both write (deliverQuiz) and
// read (getActiveState) matches the webhook delivery format and prevents
// the "I couldn't find an active quiz for you right now" error after a
// parent taps Start Quiz.
const stripPlus = (p) => (p && p.startsWith('+')) ? p.slice(1) : p;
const REDIS_KEY = (phone) => `quiz:student:${stripPlus(phone)}:active`;
const QUEUE_KEY = (phone) => `quiz:student:${stripPlus(phone)}:queue`;
const Q_TIME_KEY = (phone) => `quiz:q_time:${stripPlus(phone)}`;
const POSTQUIZ_KEY = (phone) => `quiz:student:${stripPlus(phone)}:postquiz`;

class QuizSessionService {
  /**
   * Handle an incoming answer from a student (button tap or text A/B/C).
   * Called from whatsapp-bot.js when quizState is active for this phone.
   *
   * @param {string} phone    - Parent's phone number
   * @param {string} input    - Button ID (quiz_{qId}_A) or text ("A"/"B"/"C")
   * @param {Object} state    - State from Redis { sessionId, quizId, studentId, currentDifficulty, windowAnswers, totalAnswered }
   */
  static async handleAnswer(phone, input, state) {
    try {
      logToFile('📨 QuizSessionService.handleAnswer', { phone: phone.slice(-4), input: input.slice(0, 20) });

      // cancelled-quiz guard. If the teacher cancelled the quiz
      // mid-flight, end the parent's session cleanly with a friendly message
      // instead of letting them keep answering into the void.
      const { data: parentQuiz } = await supabase
        .from('quizzes')
        .select('status, topic')
        .eq('id', state.quizId)
        .single();
      if (parentQuiz?.status === 'cancelled') {
        logToFile('🛑 Quiz cancelled by teacher — ending parent session', {
          phone: phone.slice(-4),
          quizId: state.quizId
        });
        await WhatsAppService.sendMessage(phone,
          `Your child's teacher cancelled this quiz on "${parentQuiz.topic}". Thanks for joining in — see you next time!`
        );
        await this.endSession(phone, state, 'cancelled');
        return;
      }

      // Parse button ID or plain text
      let questionId, selectedOption;

      const buttonMatch = input.match(/^quiz_([a-zA-Z0-9\-]+)_([ABC])$/i);
      if (buttonMatch) {
        questionId = buttonMatch[1];
        selectedOption = buttonMatch[2].toUpperCase();
      } else {
        // Plain text answer A/B/C
        const textOption = input.trim().toUpperCase();
        if (!['A', 'B', 'C'].includes(textOption)) {
          await WhatsAppService.sendMessage(phone,
            '❓ Please tap one of the answer buttons above, or type A, B, or C.\n\n' +
            'Type STOP to exit the quiz.'
          );
          return;
        }
        // Get current question from state
        if (!state.currentQuestionId) {
          await WhatsAppService.sendMessage(phone,
            '❓ I couldn\'t find the current question. Type STOP to exit and try again later.'
          );
          return;
        }
        questionId = state.currentQuestionId;
        selectedOption = textOption;
      }

      // Handle STOP
      if (input.trim().toUpperCase() === 'STOP') {
        await this.endSession(phone, state, 'incomplete');
        return;
      }

      // Fetch question
      const { data: question, error: qErr } = await supabase
        .from('quiz_questions')
        .select('id, question_text, correct_option, explanation, misconception_feedback, option_a, option_b, option_c')
        .eq('id', questionId)
        .single();

      if (qErr || !question) {
        logToFile('❌ Question not found', { questionId });
        return;
      }

      const isCorrect = selectedOption === question.correct_option;

      // Calculate response time
      const sendTimeRaw = await redisService.redis.get(Q_TIME_KEY(phone));
      const responseTime = sendTimeRaw ? Math.floor((Date.now() - parseInt(sendTimeRaw)) / 1000) : null;

      // Store answer (UNIQUE constraint prevents double-tap)
      const { error: insertErr } = await supabase
        .from('quiz_answers')
        .insert({
          session_id: state.sessionId,
          question_id: questionId,
          selected_option: selectedOption,
          is_correct: isCorrect,
          difficulty_at_time: state.currentDifficulty || 3,
          response_time_seconds: responseTime
        });

      if (insertErr) {
        if (insertErr.code === '23505') {
          // Duplicate — idempotency
          await WhatsAppService.sendMessage(phone,
            'Already recorded your answer for this question!'
          );
          return;
        }
        logToFile('❌ Error storing answer', { error: insertErr.message });
        return;
      }

      // Update state
      const windowAnswers = [...(state.windowAnswers || []), isCorrect];
      const totalAnswered = (state.totalAnswered || 0) + 1;
      const correctAnswers = (state.correctAnswers || 0) + (isCorrect ? 1 : 0);
      const newDifficulty = computeNextDifficulty(state.currentDifficulty || 3, windowAnswers);

      // Send feedback
      await this._sendFeedback(phone, question, selectedOption, isCorrect, state);

      // Check if quiz should end
      const stopCheck = shouldEndQuiz(newDifficulty, windowAnswers, totalAnswered);

      if (stopCheck.end) {
        await this._finishQuiz(phone, {
          ...state,
          totalAnswered,
          correctAnswers,
          currentDifficulty: newDifficulty
        });
      } else {
        // Update Redis state and send next question
        const updatedState = {
          ...state,
          windowAnswers: windowAnswers.slice(-3),
          totalAnswered,
          correctAnswers,
          currentDifficulty: newDifficulty,
          currentQuestionId: null  // Will be set when next question is sent
        };

        await supabase
          .from('quiz_sessions')
          .update({
            total_questions_answered: totalAnswered,
            correct_answers: correctAnswers,
            current_difficulty: newDifficulty
          })
          .eq('id', state.sessionId);

        // Small delay for natural feel
        await new Promise(r => setTimeout(r, 1500));

        await this.sendNextQuestion(phone, updatedState);
      }

    } catch (err) {
      logToFile('❌ QuizSessionService.handleAnswer error', { error: err.message, phone: phone.slice(-4) });
    }
  }

  /**
   * Start the quiz for a parent who tapped "Start Quiz" on the
   * invite (free-message button or template Quick Reply). Reads the
   * Redis state set by QuizDeliveryService.deliverQuiz and sends Q1.
   * Idempotent — re-tapping after start is a no-op.
   *
   * @param {string} phone - Parent phone (E.164 with leading + or no plus)
   * @returns {boolean} true if a quiz was started, false otherwise
   */
  static async startQuizFromInvite(phone) {
    try {
      const state = await this.getActiveState(phone);
      if (!state) {
        logToFile('⚠️ Start Quiz tapped but no active state', { phone: phone.slice(-4) });
        await WhatsAppService.sendMessage(phone,
          "I couldn't find an active quiz for you right now. If your teacher has just sent one, please wait a moment and tap Start Quiz again."
        );
        return false;
      }

      // Idempotency: if a question is already in flight, don't resend
      if (state.totalAnswered > 0 || state.currentQuestionId) {
        logToFile('ℹ️ Start Quiz tapped but session already in progress', {
          phone: phone.slice(-4),
          totalAnswered: state.totalAnswered,
          currentQuestionId: state.currentQuestionId
        });
        // Re-send the current question if we have one cached, otherwise send next
        if (state.currentQuestionId) {
          // Pull the cached question and re-render it
          const { data: q } = await supabase
            .from('quiz_questions')
            .select('id, question_text, option_a, option_b, option_c')
            .eq('id', state.currentQuestionId)
            .single();
          if (q) {
            const questionNum = (state.totalAnswered || 0) + 1;
            await this._sendQuestion(phone, q, questionNum);
            return true;
          }
        }
        await this.sendNextQuestion(phone, state);
        return true;
      }

      // Mark in_progress on first start
      await supabase
        .from('quiz_sessions')
        .update({ status: 'in_progress' })
        .eq('id', state.sessionId);

      logToFile('▶️ Quiz started from invite', { phone: phone.slice(-4), sessionId: state.sessionId });
      await this.sendNextQuestion(phone, state);
      return true;
    } catch (err) {
      logToFile('❌ Error in startQuizFromInvite', { error: err.message, phone: phone.slice(-4) });
      return false;
    }
  }

  /**
   * Get active quiz state for a phone number.
   * Returns null if no active quiz.
   */
  static async getActiveState(phone) {
    try {
      const raw = await redisService.redis.get(REDIS_KEY(phone));
      if (raw) return JSON.parse(raw);

      // Redis miss — try to recover from DB
      return await this._recoverFromDB(phone);
    } catch (err) {
      logToFile('⚠️ Error getting quiz state', { error: err.message });
      return null;
    }
  }

  /**
   * Send next question to student.
   */
  static async sendNextQuestion(phone, state) {
    // Get questions at target difficulty (±1 for variety)
    const { data: questions } = await supabase
      .from('quiz_questions')
      .select('id, question_text, option_a, option_b, option_c, difficulty_level')
      .eq('quiz_id', state.quizId)
      .in('difficulty_level', [
        Math.max(1, state.currentDifficulty - 1),
        state.currentDifficulty,
        Math.min(5, state.currentDifficulty + 1)
      ])
      .order('sort_order');

    // Get already answered question IDs
    const { data: answered } = await supabase
      .from('quiz_answers')
      .select('question_id')
      .eq('session_id', state.sessionId);

    const answeredIds = new Set((answered || []).map(a => a.question_id));

    // Find next unanswered question at target difficulty
    const available = (questions || []).filter(q =>
      !answeredIds.has(q.id) &&
      q.difficulty_level === state.currentDifficulty
    );

    // Fallback to any unanswered
    const fallback = (questions || []).filter(q => !answeredIds.has(q.id));
    const next = available[0] || fallback[0];

    if (!next) {
      // question pool exhausted before MAX_QUESTIONS — finish the
      // quiz cleanly with the same completion path as a normal end (mastery,
      // floor, or max_questions). Prior code called endSession silently here,
      // which deleted Redis state but sent no completion message and never
      // offered post-quiz chat — making the quiz appear to "disappear" on
      // the parent's last screen.
      await this._finishQuiz(phone, state);
      return;
    }

    // Track question send time
    await redisService.setexWithCeiling(Q_TIME_KEY(phone), 3600, Date.now().toString());

    // Update state with current question ID
    const updatedState = { ...state, currentQuestionId: next.id };
    await redisService.setexWithCeiling(REDIS_KEY(phone), 86400, JSON.stringify(updatedState));

    const questionNum = (state.totalAnswered || 0) + 1;
    await this._sendQuestion(phone, next, questionNum);
  }

  /**
   * Gracefully end a quiz session.
   * - 'incomplete' (parent typed STOP): "Quiz ended" message
   * - 'cancelled'  (teacher cancelled): no message — handleAnswer already sent one
   * - 'completed'  (normal end): use _finishQuiz, not this — this is for early exits only
   */
  static async endSession(phone, state, reason = 'completed') {
    const statusByReason = {
      incomplete: 'incomplete',
      cancelled: 'cancelled',
      completed: 'completed'
    };
    await supabase
      .from('quiz_sessions')
      .update({
        status: statusByReason[reason] || 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', state.sessionId);

    await redisService.redis.del(REDIS_KEY(phone));

    if (reason === 'incomplete') {
      await WhatsAppService.sendMessage(phone,
        'Quiz ended. Your teacher will receive your results so far. JazakAllah!'
      );
    }
  }

  /**
   * Single completion path used by both the normal end-of-quiz
   * (mastery / floor / max_questions in handleAnswer) and the
   * pool-exhausted end (sendNextQuestion runs out of questions in the
   * ±1 difficulty window). Sends the completion message, cleans up Redis,
   * processes the sibling queue, and offers post-quiz chat. Previously the
   * pool-exhausted path called endSession() silently, leaving the parent
   * with no completion message and no post-quiz chat.
   */
  static async _finishQuiz(phone, state) {
    const totalAnswered = state.totalAnswered || 0;
    const correctAnswers = state.correctAnswers || 0;
    const mastery = totalAnswered > 0 ? correctAnswers / totalAnswered : 0;
    const masteryLevel = mastery >= 0.8 ? 'mastered'
      : mastery >= 0.6 ? 'developing'
      : 'needs_practice';

    await supabase
      .from('quiz_sessions')
      .update({
        status: 'completed',
        total_questions_answered: totalAnswered,
        correct_answers: correctAnswers,
        mastery_percentage: Math.round(mastery * 100),
        mastery_level: masteryLevel,
        current_difficulty: state.currentDifficulty || 3,
        completed_at: new Date().toISOString()
      })
      .eq('id', state.sessionId);

    if (totalAnswered > 0) {
      await this._sendCompletionMessage(phone, totalAnswered, correctAnswers, masteryLevel);
    }

    await redisService.redis.del(REDIS_KEY(phone));

    const hasNextSibling = await this._processQueue(phone);

    if (!hasNextSibling) {
      await this._offerPostQuizChat(phone, state);
    }

    try {
      await supabase.rpc('increment_quiz_completions', { quiz_id_param: state.quizId });
    } catch (rpcErr) {
      logToFile('⚠️ increment_quiz_completions RPC failed (non-fatal)', { error: rpcErr.message });
    }

    // fire-when-all-done. After this session transitions to
    // 'completed', check if every session for this quiz is now in a
    // terminal state. If yes, advance the quiz_report scheduled_jobs row
    // from +12h to +5min (grace window for slow stragglers / sibling-queue
    // handoffs). Idempotent: only mutates rows still in 'pending'.
    await this._maybeAdvanceReport(state.quizId);
  }

  /**
   * When every quiz_sessions row for `quizId` has reached a
   * terminal state, advance the matching scheduled_jobs row's
   * `scheduled_at` to now+5min so the report fires soon instead of
   * waiting the full 12h. Idempotent on already-processing/completed
   * jobs.
   */
  static async _maybeAdvanceReport(quizId) {
    if (!quizId) return;
    try {
      const TERMINAL = ['completed', 'incomplete', 'expired', 'cancelled'];
      const { data: peers, error } = await supabase
        .from('quiz_sessions')
        .select('status')
        .eq('quiz_id', quizId);
      if (error || !peers) return;

      const allFinal = peers.length > 0 && peers.every(s => TERMINAL.includes(s.status));
      if (!allFinal) return;

      // enqueue the "fire in 1 min" finalized report
      // message via SQS. The 1-min DelaySeconds is the grace window
      // (teacher can still cancel). The 12h-cascade message enqueued at
      // delivery is still in flight; whichever fires first wins via the
      // handler's Redis idempotency flag (quiz_report_sent:<quizId>).
      //
      // Replaces:
      // - the scheduled_jobs UPDATE that advanced scheduled_at
      // - the setTimeout + _triggerReportInProcess inline trigger
      // Both removed in one go — SQS DelaySeconds handles the grace
      // natively; SQS at-most-once semantics handle the race.
      //
      // dedupe by stable id so concurrent _finishQuiz calls (multiple
      // students finishing within ~5min) only enqueue one finalized
      // message — SQS rejects duplicates with the same MessageDeduplicationId
      // within its 5-min FIFO dedup window.
      try {
        await SQSQueueService.queueJob(
          quizId,
          'quiz_report',
          {},
          {
            delaySeconds: 60,
            deduplicationId: `${quizId}-quiz_report-finalized`
          }
        );
        logToFile('⏩ All students done — finalized report queued (60s SQS delay)', { quizId });
      } catch (err) {
        logToFile('⚠️ Could not enqueue finalized quiz_report (cascade message will fire eventually)', { quizId, error: err.message });
      }
    } catch (err) {
      logToFile('⚠️ _maybeAdvanceReport non-fatal error', { quizId, error: err.message });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Render an MCQ question to WhatsApp.
   *
   * Why this helper exists: WhatsApp interactive button.title has a hard
   * 20-character limit. Rendering full option text in titles caused silent
   * mid-word truncation (whatsapp.service.js does substring(0,20) without
   * warning). This was hit on staging — long options like "Norwegian
   * Forest Cat" / "Hypoallergenic" appeared chopped on the parent's screen.
   *
   * Fix (Option C): render the full options
   * inline in the message body, with buttons that just say "A", "B", "C".
   * Pakistani teachers literally call out options A/B/C to a class anyway —
   * this matches the verbal-MCQ pattern. Also: the bot already accepts
   * free-text "A"/"B"/"C" from parents who type instead of tap,
   * so existing dispatch keeps working. Button IDs (`quiz_<qid>_A`) stay
   * the same — no whatsapp-bot.js change needed.
   *
   * Body math: Meta's interactive-message body limit is 1024 chars. With
   * "Question N\n\nQ: <text>\n\nA. <opt>\nB. <opt>\nC. <opt>", typical
   * ~200 chars and worst-case (250-char options) ~830 — well under 1024.
   * Quiz generation prompt enforces ≤ 250 chars per option as a guardrail.
   */
  static async _sendQuestion(phone, q, questionNum) {
    const body = [
      `Question ${questionNum}`,
      '',
      q.question_text,
      '',
      `A. ${q.option_a}`,
      `B. ${q.option_b}`,
      `C. ${q.option_c}`,
    ].join('\n');

    await WhatsAppService.sendInteractiveButtons(phone, {
      body,
      buttons: [
        { id: `quiz_${q.id}_A`, title: 'A' },
        { id: `quiz_${q.id}_B`, title: 'B' },
        { id: `quiz_${q.id}_C`, title: 'C' },
      ],
    });
  }

  static async _sendFeedback(phone, question, selectedOption, isCorrect, state) {
    const correctAnswer = question[`option_${question.correct_option.toLowerCase()}`];

    if (isCorrect) {
      const streak = (state.currentStreak || 0) + 1;
      let streakMsg = '';
      if (streak >= 3) streakMsg = '\n🔥 You\'re on fire!';
      else if (streak === 2) streakMsg = '\n⭐ Nice streak!';

      await WhatsAppService.sendMessage(phone,
        `✅ That's right!\n\n${question.explanation}${streakMsg}`
      );
    } else {
      // do NOT include question.misconception_feedback here. After
      //, that field is derived from distractor_misconceptions[firstWrong]
      // — a TEACHER-side label phrased as the student's mental model
      // ("student thinks Biryani is only significant in weddings..."). Showing
      // that to the student is jarring and breaks the encouraging-feedback
      // pedagogy. We keep the explanation (correct answer + reasoning) and
      // the encouragement, drop the misconception label. The label still
      // lives in DB for teacher-side cluster analysis on quiz reports.
      await WhatsAppService.sendMessage(phone,
        `Not quite!\n\nThe answer is ${question.correct_option}: ${correctAnswer}\n\n` +
        `${question.explanation || ''}\n\nKeep going — mistakes help you learn! 💪`
      );
    }
  }

  static async _sendCompletionMessage(phone, totalAnswered, correctAnswers, masteryLevel) {
    const pct = Math.round((correctAnswers / totalAnswered) * 100);
    let masteryMsg;

    if (masteryLevel === 'mastered') {
      masteryMsg = "You've mastered this topic! Excellent work! 🌟";
    } else if (masteryLevel === 'developing') {
      masteryMsg = "You're getting there! A little more practice and you'll master it. 👍";
    } else {
      masteryMsg = "This topic needs some more practice. Ask your teacher for help! 📚";
    }

    await WhatsAppService.sendMessage(phone,
      `🎉 Great effort! Quiz complete!\n\n` +
      `You answered ${correctAnswers}/${totalAnswered} questions correctly (${pct}%).\n\n` +
      `${masteryMsg}\n\n` +
      `Your teacher will receive your results. Keep up the great work!`
    );
  }

  static async _processQueue(phone) {
    try {
      const queueRaw = await redisService.redis.get(QUEUE_KEY(phone));
      if (!queueRaw) return false;

      const queue = JSON.parse(queueRaw);
      if (!queue.length) return false;

      const nextSession = queue.shift();
      await redisService.setexWithCeiling(QUEUE_KEY(phone), 86400, JSON.stringify(queue));

      // Delay between siblings
      await new Promise(r => setTimeout(r, 3000));

      await WhatsAppService.sendMessage(phone,
        `Now it's ${nextSession.studentName}'s turn! Same quiz on "${nextSession.topic}".\n\n` +
        `Get ready! First question coming up...`
      );

      // Set active state for next sibling
      await redisService.setexWithCeiling(REDIS_KEY(phone), 86400, JSON.stringify(nextSession.state));
      await this.sendNextQuestion(phone, nextSession.state);
      return true;

    } catch (err) {
      logToFile('⚠️ Error processing quiz queue', { error: err.message });
      return false;
    }
  }

  static async _recoverFromDB(phone) {
    try {
      // parent_phone is stored E.164 with + but webhook delivers
      // phone without +. Try both formats.
      const noPlus = phone.startsWith('+') ? phone.slice(1) : phone;
      const withPlus = phone.startsWith('+') ? phone : `+${phone}`;

      // pull the SINGLE most-recent session for this phone regardless
      // of status, then only treat it as recoverable if its status is invited
      // or in_progress. The previous .in() filter could pick up an older
      // 'invited' session even when a newer 'completed' or 'cancelled' session
      // existed — making post-quiz text trigger the active-quiz nudge.
      let { data: session } = await supabase
        .from('quiz_sessions')
        .select('id, quiz_id, student_id, current_difficulty, total_questions_answered, correct_answers, status')
        .eq('parent_phone', withPlus)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!session) {
        const fallback = await supabase
          .from('quiz_sessions')
          .select('id, quiz_id, student_id, current_difficulty, total_questions_answered, correct_answers, status')
          .eq('parent_phone', noPlus)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        session = fallback.data;
      }

      if (!session) return null;
      if (!['invited', 'in_progress'].includes(session.status)) {
        // Most-recent session is completed/cancelled/expired — there is no
        // active quiz for this phone. Don't resurrect older invited rows.
        return null;
      }

      // Rebuild window from recent answers
      const { data: recentAnswers } = await supabase
        .from('quiz_answers')
        .select('is_correct, question_id')
        .eq('session_id', session.id)
        .order('answered_at', { ascending: false })
        .limit(3);

      const windowAnswers = (recentAnswers || []).reverse().map(a => a.is_correct);

      const state = {
        sessionId: session.id,
        quizId: session.quiz_id,
        studentId: session.student_id,
        currentDifficulty: session.current_difficulty || 3,
        totalAnswered: session.total_questions_answered || 0,
        correctAnswers: session.correct_answers || 0,
        windowAnswers,
        currentQuestionId: null
      };

      // Restore to Redis
      await redisService.setexWithCeiling(REDIS_KEY(phone), 86400, JSON.stringify(state));
      logToFile('🔄 Recovered quiz state from DB', { phone: phone.slice(-4), sessionId: session.id });

      return state;
    } catch (err) {
      logToFile('⚠️ Could not recover quiz state from DB', { error: err.message });
      return null;
    }
  }

  // ─── Post-quiz student mode ───────────────────────────────────────

  /**
   * Offer post-quiz chat after quiz completion.
   * Sets a 30-minute Redis state so Rumi can answer the child's questions.
   *
   * Seeds the post-quiz state with a snapshot of every question
   * the student saw + which option they picked + whether it was correct.
   * handlePostQuizChat injects that snapshot into the GPT-4o-mini system
   * prompt so Rumi can answer follow-ups in context ("why was Q3 not B?",
   * "explain the one I got wrong"). The general OpenAIService.getConversationHistory
   * pattern isn't reusable here — it keys on users.id (UUID) and parents
   * may not be Rumi users, plus the conversations table is for general
   * teacher chat, not quiz Q&A. Same shape (system + last-N + new), just
   * persisted in Redis alongside POSTQUIZ_KEY with the same 30-min TTL.
   */
  static async _offerPostQuizChat(phone, state) {
    try {
      const quizContext = await this._buildQuizContext(state.sessionId);

      const postQuizState = {
        studentName: state.studentName || 'Student',
        topic: state.topic || 'the quiz topic',
        quizId: state.quizId,
        sessionId: state.sessionId,
        quizContext,         //  snapshot of Q&A so chat can answer in context
        messages: []         //  rolling chat history (last 10 user/assistant turns)
      };

      // 30-minute TTL for post-quiz chat
      await redisService.setexWithCeiling(POSTQUIZ_KEY(phone), 1800, JSON.stringify(postQuizState));

      await WhatsAppService.sendInteractiveButtons(phone, {
        header: 'Ask Rumi!',
        body: `Do you have any questions about ${postQuizState.topic} or anything else? ` +
              `I'm here to help! Type your question or send a voice note 🎤 — I'll listen and reply.\n\n` +
              `This chat will be available for 30 minutes.`,
        buttons: [
          { id: 'postquiz_done', title: 'I\'m done, thanks!' }
        ]
      });

      logToFile('💬 Post-quiz chat offered', { phone: phone.slice(-4), topic: postQuizState.topic });
    } catch (err) {
      logToFile('⚠️ Error offering post-quiz chat', { error: err.message });
    }
  }

  /**
   * Check if phone is in post-quiz chat mode.
   * @returns {Object|null} { studentName, topic, quizId } or null
   */
  static async getPostQuizState(phone) {
    try {
      const raw = await redisService.redis.get(POSTQUIZ_KEY(phone));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Handle a message from a student in post-quiz chat mode.
   * Uses GPT-4o mini for cost-effective, student-friendly responses.
   */
  static async handlePostQuizChat(phone, message, postQuizState) {
    try {
      logToFile('💬 Post-quiz chat message', { phone: phone.slice(-4), message: message.slice(0, 50) });

      // Rate limit: max 20 messages per session, min 3s between messages
      const msgCount = (postQuizState._msgCount || 0) + 1;
      if (msgCount > 20) {
        await this.endPostQuizChat(phone);
        return;
      }

      const lastMsgTime = postQuizState._lastMsgAt || 0;
      if (Date.now() - lastMsgTime < 3000) {
        return; // Silently ignore rapid-fire messages
      }

      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      // build the system prompt with the quiz Q&A snapshot so
      // Rumi can answer in context. The snapshot is fetched once at
      // _offerPostQuizChat time and frozen into the state — questions
      // and feedback don't change after the quiz ends.
      const systemPrompt = this._buildPostQuizSystemPrompt(postQuizState);

      // roll a windowed history of the last 10 messages
      // (user/assistant turns) so follow-up questions like "what did
      // I get wrong?" → "explain the photosynthesis one again" work.
      const history = Array.isArray(postQuizState.messages) ? postQuizState.messages : [];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        max_tokens: 250,
        temperature: 0.7
      });

      const reply = response.choices[0]?.message?.content || 'Hmm, I\'m not sure about that. Try asking another way!';

      await WhatsAppService.sendMessage(phone, reply);

      // Append the new turn and cap at last 10 messages (5 user/assistant pairs).
      const newHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }];
      const cappedHistory = newHistory.slice(-10);

      // Refresh TTL and update rate-limit counters
      const updatedState = {
        ...postQuizState,
        messages: cappedHistory,
        _msgCount: msgCount,
        _lastMsgAt: Date.now()
      };
      await redisService.setexWithCeiling(POSTQUIZ_KEY(phone), 1800, JSON.stringify(updatedState));

    } catch (err) {
      logToFile('❌ Post-quiz chat error', { error: err.message, phone: phone.slice(-4) });
      await WhatsAppService.sendMessage(phone,
        'Sorry, I had trouble understanding that. Try asking again!'
      );
    }
  }

  /**
   * End post-quiz chat mode.
   */
  static async endPostQuizChat(phone) {
    await redisService.redis.del(POSTQUIZ_KEY(phone));
    await WhatsAppService.sendMessage(phone,
      'Thanks for chatting! Keep being curious and keep learning. See you next time! 🌟'
    );
  }

  /**
   * Build a frozen snapshot of every question the student saw
   * in this session — question text, the four options, the correct
   * option, what the student picked, and whether they got it right.
   * The snapshot is stored on postQuizState and used by
   * _buildPostQuizSystemPrompt so Rumi can answer follow-ups like
   * "what did I get wrong?" or "explain the third question again".
   */
  static async _buildQuizContext(sessionId) {
    if (!sessionId) return [];
    try {
      const { data: answers } = await supabase
        .from('quiz_answers')
        .select('question_id, selected_option, is_correct, answered_at, quiz_questions(question_text, option_a, option_b, option_c, correct_option, explanation)')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true });

      return (answers || []).map((a, i) => {
        const q = a.quiz_questions || {};
        return {
          n: i + 1,
          question: q.question_text,
          options: { A: q.option_a, B: q.option_b, C: q.option_c },
          correct: q.correct_option,
          picked: a.selected_option,
          isCorrect: a.is_correct,
          explanation: q.explanation
        };
      });
    } catch (err) {
      logToFile('⚠️ _buildQuizContext failed (post-quiz chat will run without Q&A context)', { error: err.message });
      return [];
    }
  }

  /**
   * Compose the system prompt for post-quiz chat. Includes the
   * Q&A snapshot so the model can ground answers in what actually
   * happened during the quiz.
   */
  static _buildPostQuizSystemPrompt(postQuizState) {
    const ctx = postQuizState.quizContext || [];
    const total = ctx.length;
    const correct = ctx.filter(q => q.isCorrect).length;

    let qaSection = '';
    if (total > 0) {
      const lines = ctx.map(q => {
        const verdict = q.isCorrect ? 'CORRECT' : 'WRONG';
        const pickedText = q.options[q.picked] || q.picked || '?';
        const correctText = q.options[q.correct] || q.correct || '?';
        return `Q${q.n}: ${q.question}\n` +
          `  - Options: A) ${q.options.A}  B) ${q.options.B}  C) ${q.options.C}\n` +
          `  - Correct answer: ${q.correct} (${correctText})\n` +
          `  - Student picked: ${q.picked} (${pickedText}) → ${verdict}` +
          (q.explanation ? `\n  - Explanation: ${q.explanation}` : '');
      });
      qaSection = `\n\n## Quiz the student just finished (${correct}/${total} correct):\n${lines.join('\n\n')}\n` +
        `When the student references "the quiz" or "the question I got wrong" or asks about a specific question, ground your answer in the data above.`;
    }

    return `You are Rumi, a friendly and encouraging AI learning assistant for school children in Pakistan. ` +
      `A student named ${postQuizState.studentName} just finished a quiz on "${postQuizState.topic}". ` +
      `They may ask questions about the topic, follow up on a question they got wrong, ask about other subjects, or anything a curious child might ask.` +
      qaSection +
      `\n\nRules:\n` +
      `- Keep answers SHORT (2-4 sentences max) and age-appropriate\n` +
      `- Use simple language a child can understand\n` +
      `- Be warm, encouraging, and patient\n` +
      `- If they reference a specific quiz question, look it up in the snapshot above and answer in context\n` +
      `- If they ask about the quiz topic, give clear educational explanations\n` +
      `- If they ask about other topics, help them too — curiosity is good!\n` +
      `- If they say something inappropriate, gently redirect to learning\n` +
      `- Never share personal information or links\n` +
      `- You can respond in English or Urdu based on what they write`;
  }
}

module.exports = QuizSessionService;
