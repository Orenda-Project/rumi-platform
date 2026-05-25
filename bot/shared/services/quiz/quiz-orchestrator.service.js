'use strict';
// QuizOrchestrator — entry point for all quiz triggers
// Handles /quiz command (Trigger 1), LP-anchored offers, and class gate logic

const { logToFile } = require('../../utils/logger');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const redisService = require('../cache/railway-redis.service');

class QuizOrchestrator {
  // ─── Trigger 1: /quiz command ─────────────────────────────────────────────

  /**
   * Entry point for /quiz command.
   * Always shows class selection list first so teacher confirms which class receives the quiz.
   *
   * @param {Object} user           - Teacher user object
   * @param {string} from           - Teacher's phone number
   * @param {string} sessionId      - Conversation session ID
   * @param {string} language       - Response language
   * @param {string|null} preTopic  - Optional pre-supplied topic (from /quiz fractions)
   */
  static async initiateQuizRequest(user, from, sessionId, language = 'en', preTopic = null) {
    try {
      // defensive LP-shelf flush on real feature switches
      try {
        const LPShelfService = require('../lp-shelf.service');
        await LPShelfService.flushShelf(user.id);
      } catch (err) {
        logToFile('⚠️ LP shelf flush failed at quiz start (non-blocking)', { error: err.message });
      }

      logToFile('📝 QuizOrchestrator.initiateQuizRequest', { userId: user.id, preTopic });

      // 1. Get teacher's active classes
      const { data: classes, error: classErr } = await supabase
        .from('student_lists')
        .select('id, class_name, section')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(10);

      if (classErr || !classes || classes.length === 0) {
        await WhatsAppService.sendMessage(from,
          '📚 To send quizzes, you need to set up a class first with your students\' phone numbers.\n\n' +
          'Type "set up class" or say "class setup" to get started!'
        );
        return;
      }

      // 2. Always show class selection list (confirms which class receives the quiz)
      const rows = classes.map(c => ({
        id: `quiz_class_${c.id}`,
        title: c.section ? `${c.class_name} - ${c.section}` : c.class_name,
        description: 'Tap to select this class'
      }));

      // Store state (including pre-supplied topic if any) — non-fatal if Redis is down
      try {
        await redisService.setexWithCeiling(`quiz:awaiting_class:${user.id}`, 3600, JSON.stringify({ sessionId, language, preTopic }));
      } catch (redisErr) {
        logToFile('⚠️ quiz:awaiting_class Redis write failed (non-fatal)', { error: redisErr.message });
      }

      logToFile('📋 Sending class selection list', { classCount: classes.length });
      await WhatsAppService.sendInteractiveMessage(from, {
        header: 'Send a quiz',
        body: 'Which class should receive this quiz?',
        action: {
          button: 'Select class',
          sections: [{ title: 'Your classes', rows }]
        }
      });

    } catch (err) {
      logToFile('❌ QuizOrchestrator.initiateQuizRequest error', { error: err.message, userId: user?.id });
      await WhatsAppService.sendMessage(from,
        'Sorry, something went wrong starting the quiz. Please try again.\n\nمعذرت، کوئز شروع کرنے میں کچھ غلط ہو گیا۔'
      );
    }
  }

  /**
   * Handle teacher's topic reply (from quiz:awaiting_topic Redis state).
   */
  static async handleTopicReply(user, from, topicText, state) {
    await this._handleTopicReply(user, from, topicText, state);
  }

  /**
   * Continue after teacher selects a class from the list.
   * Called from whatsapp-bot.js list_reply handler.
   *
   * @param {Object} user      - Teacher user object
   * @param {string} from      - Teacher's phone
   * @param {string} classId   - Selected student_list ID
   * @param {string} language  - Language
   * @param {string} sessionId - Session ID
   */
  static async continueWithClass(user, from, classId, language = 'en', sessionId = null) {
    try {
      logToFile('📝 QuizOrchestrator.continueWithClass', { userId: user.id, classId });

      // Fetch class details
      const { data: classData, error: classErr } = await supabase
        .from('student_lists')
        .select('id, class_name, section')
        .eq('id', classId)
        .single();

      if (classErr || !classData) {
        await WhatsAppService.sendMessage(from, 'Sorry, that class was not found. Please try /quiz again.');
        return;
      }

      // Check students with phones
      const { data: studentsWithPhones } = await supabase
        .from('students')
        .select('id')
        .eq('list_id', classId)
        .eq('is_active', true)
        .not('parent_phone', 'is', null)
        .limit(1);

      if (!studentsWithPhones || studentsWithPhones.length === 0) {
        const classDisplay = classData.section
          ? `${classData.class_name} - ${classData.section}`
          : classData.class_name;
        await WhatsAppService.sendMessage(from,
          `📱 Your class "${classDisplay}" doesn't have any parent phone numbers yet.\n\n` +
          `To send quizzes, add parent WhatsApp numbers when setting up your class.\n\n` +
          `Type "edit class" or set up a new class with phone numbers.`
        );
        return;
      }

      // Check for active quiz on this class
      const activeQuiz = await this._getActiveQuiz(classId);
      if (activeQuiz) {
        await WhatsAppService.sendMessage(from,
          `⚠️ You already have an active quiz on "${activeQuiz.topic}" sent to this class.\n\n` +
          `Please wait for it to complete before sending a new one.`
        );
        return;
      }

      // Get pre-supplied topic or state from Redis (non-fatal if Redis is down)
      let stateRaw = null;
      try {
        stateRaw = await redisService.redis.get(`quiz:awaiting_class:${user.id}`);
      } catch (redisErr) {
        logToFile('⚠️ quiz:awaiting_class Redis read failed (non-fatal)', { error: redisErr.message });
      }
      const savedState = stateRaw ? JSON.parse(stateRaw) : {};
      const lang = savedState.language || language;
      const sid = savedState.sessionId || sessionId;
      const preTopic = savedState.preTopic;

      const classDisplay = classData.section
        ? `${classData.class_name} - ${classData.section}`
        : classData.class_name;

      // If topic was pre-supplied (/quiz fractions), generate immediately
      if (preTopic) {
        await this._generateAndDeliver(user, from, preTopic, classId, classData, lang);
        return;
      }

      // Fetch recent lesson plans (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentLPs } = await supabase
        .from('lesson_plans')
        .select('id, topic, grade, created_at')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentLPs && recentLPs.length > 0) {
        await this._presentLPList(from, recentLPs, sid, lang, classId, classDisplay);
      } else {
        await this._promptForTopic(user, from, sid, lang, classId);
      }

    } catch (err) {
      logToFile('❌ QuizOrchestrator.continueWithClass error', { error: err.message });
      await WhatsAppService.sendMessage(from, 'Sorry, something went wrong. Please try /quiz again.');
    }
  }

  /**
   * Initiate quiz from a specific lesson plan ID (Triggers 2 & 3).
   * Called when teacher accepts a quiz offer from button or LP list selection.
   *
   * @param {Object} user          - Teacher user
   * @param {string} from          - Teacher phone
   * @param {string} lessonPlanId  - LP UUID
   * @param {string} language      - Language
   * @param {string|null} classId  - Pre-selected class (skips class gate if provided)
   */
  static async initiateFromLessonPlan(user, from, lessonPlanId, language = 'en', classId = null) {
    try {
      logToFile('📝 QuizOrchestrator.initiateFromLessonPlan', { userId: user.id, lessonPlanId, classId });

      // Resolve class: use provided classId or run gate
      let targetClassId = classId;
      let classData = null;

      if (!targetClassId) {
        const gateResult = await this._checkClassGate(user.id, from);
        if (!gateResult.proceed) return;
        targetClassId = gateResult.targetClass.id;
        classData = gateResult.targetClass;
      } else {
        const { data } = await supabase
          .from('student_lists')
          .select('id, class_name, section')
          .eq('id', targetClassId)
          .single();
        classData = data;
      }

      // Fetch LP
      const { data: lp, error } = await supabase
        .from('lesson_plans')
        .select('id, topic, grade, subject, content')
        .eq('id', lessonPlanId)
        .single();

      if (error || !lp) {
        await WhatsAppService.sendMessage(from,
          'I could not find that lesson plan. Please try /quiz to start a new quiz.'
        );
        return;
      }

      // Check for active quiz on this class
      const activeQuiz = await this._getActiveQuiz(targetClassId);
      if (activeQuiz) {
        await WhatsAppService.sendMessage(from,
          `⚠️ You already have an active quiz on "${activeQuiz.topic}" sent to this class. ` +
          `Wait for it to complete before sending a new one.`
        );
        return;
      }

      const classDisplay = classData
        ? (classData.section ? `${classData.class_name} - ${classData.section}` : classData.class_name)
        : '';

      await WhatsAppService.sendMessage(from,
        `📝 Creating a quiz on "${lp.topic}"${classDisplay ? ` for ${classDisplay}` : ''}... This takes about 30 seconds.`
      );

      const QuizGenerationService = require('./quiz-generation.service');
      const QuizDeliveryService = require('./quiz-delivery.service');

      const quizId = await QuizGenerationService.generateAndStore({
        teacherId: user.id,
        listId: targetClassId,
        lessonPlanId: lp.id,
        topic: lp.topic,
        grade: lp.grade || classData?.class_name,
        subject: lp.subject,
        sourceContent: lp.content ? JSON.stringify(lp.content) : null,
        quizSource: 'lesson_plan',
        language
      });

      await QuizDeliveryService.deliverQuiz(quizId, from, language);

    } catch (err) {
      logToFile('❌ QuizOrchestrator.initiateFromLessonPlan error', { error: err.message });
      await WhatsAppService.sendMessage(from,
        'Sorry, something went wrong creating the quiz. Please try /quiz to start again.\n\nمعذرت، کوئز بنانے میں کچھ غلط ہو گیا۔'
      );
    }
  }

  // ─── Public quiz trigger gate ─────────────────────────────────────

  /**
   * Shared gate: checks class, students with phones, active quiz.
   * Returns { proceed, targetClass, reason }.
   */
  static async quizTriggerGate(userId, phone) {
    return this._checkClassGate(userId, phone);
  }

  // ───: Cancel an active quiz ────────────────────────────────────────
  /**
   * Cancels an active quiz, tears down all per-parent Redis state,
   * notifies any parent who hasn't started yet, and ensures the 12h report
   * scheduler will skip this quiz (it filters status='sent' so 'cancelled'
   * is naturally skipped).
   *
   * Idempotent: re-cancelling a cancelled quiz is a no-op.
   */
  static async cancelQuiz(quizId) {
    logToFile('🛑 QuizOrchestrator.cancelQuiz', { quizId });

    // 1. Fetch first, then check status in JS, then update.
    // Earlier impl chained .update().eq().in('status', [...]).select().single()
    // which silently returned no row even when the WHERE actually matched
    // status='sent'. Splitting fetch + update + idempotent status guard is more
    // robust and gives clearer error attribution.
    const { data: existing, error: fetchErr } = await supabase
      .from('quizzes')
      .select('id, topic, list_id, status')
      .eq('id', quizId)
      .single();

    if (fetchErr || !existing) {
      logToFile('ℹ️ Quiz not found — skipping cancel teardown', { quizId, error: fetchErr?.message });
      return;
    }

    if (!['ready', 'sent'].includes(existing.status)) {
      logToFile('ℹ️ Quiz already finalized — skipping cancel teardown', { quizId, status: existing.status });
      return;
    }

    const { error: updateErr } = await supabase
      .from('quizzes')
      .update({ status: 'cancelled' })
      .eq('id', quizId);

    if (updateErr) {
      logToFile('❌ Failed to mark quiz cancelled', { quizId, error: updateErr.message });
      throw updateErr;
    }

    const quiz = existing;
    logToFile('✅ Quiz row marked cancelled', { quizId, topic: quiz.topic });

    // 2. Pull all sessions for this quiz so we can clean Redis per-parent
    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select('id, parent_phone, status')
      .eq('quiz_id', quizId);

    const liveSessions = (sessions || []).filter(s =>
      s.status === 'invited' || s.status === 'in_progress'
    );

    // 3. Mark all live sessions cancelled — pass the live IDs explicitly to
    // avoid the same .update().eq().in() pattern that returned no rows above.
    if (liveSessions.length > 0) {
      const liveIds = liveSessions.map(s => s.id);
      const { error: sessUpdateErr } = await supabase
        .from('quiz_sessions')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .in('id', liveIds);
      if (sessUpdateErr) {
        logToFile('⚠️ Failed to mark live quiz_sessions cancelled (non-fatal)', { error: sessUpdateErr.message });
      }
    }

    // 4. For each parent_phone, tear down Redis state + send a notification
    const phonesNotified = new Set();
    for (const s of liveSessions) {
      const phone = s.parent_phone;
      if (!phone || phonesNotified.has(phone)) continue;

      try {
        await redisService.redis.del(`quiz:student:${phone}:active`);
        await redisService.redis.del(`quiz:student:${phone}:queue`);
        await redisService.redis.del(`quiz:q_time:${phone}`);
        await redisService.redis.del(`quiz:student:${phone}:postquiz`);
      } catch (rErr) {
        logToFile('⚠️ Redis teardown error (non-fatal)', { phone: phone.slice(-4), error: rErr.message });
      }

      // Notify parents who already received the invite — only if they're in
      // an open 24h window. Otherwise silent: a paid template just to tell
      // them "nevermind" would be wasteful and Meta-policy-fragile.
      try {
        const QuizDeliveryService = require('./quiz-delivery.service');
        const hasWindow = await QuizDeliveryService._hasOpenMessageWindow(phone);
        if (hasWindow && s.status === 'in_progress') {
          await WhatsAppService.sendMessage(phone,
            `Your child's teacher cancelled this quiz on "${quiz.topic}". You don't need to answer the rest. Thanks for participating!`
          );
        }
        phonesNotified.add(phone);
      } catch (sErr) {
        logToFile('⚠️ Cancel notification error (non-fatal)', { phone: phone.slice(-4), error: sErr.message });
      }
    }

    // 5.: mark in-flight SQS messages as cancelled via
    // Redis flags. The QuizJobHandler reads `sqs:cancel:<jobType>:<groupId>`
    // on dequeue and short-circuits if set. SQS FIFO has no delete-by-group
    // primitive, so the cascade re-queue messages will fire eventually but
    // the handler will skip cleanly. Replaces the scheduled_jobs
    // UPDATE — Phase 8 deletes scheduled_jobs entirely.
    try {
      const SQSQueueService = require('../queue');
      await SQSQueueService.cancelByGroupId(quizId, ['quiz_report']);
      // Sibling sessions may also have quiz_expire messages keyed by sessionId
      for (const s of liveSessions) {
        await SQSQueueService.cancelByGroupId(s.id, ['quiz_expire']);
      }
    } catch (cancelErr) {
      logToFile('⚠️ Failed to set SQS cancel flags (non-fatal)', { quizId, error: cancelErr.message });
    }

    logToFile('✅ Quiz cancelled', { quizId, sessionsCancelled: liveSessions.length });
  }

  // ───: List-reply dispatch ──────────────────────────────────────────
  // The orchestrator emits list rows with IDs `quiz_lp_<lpId>` and
  // `quiz_new_topic` (see _presentLPList). The list_reply handler in
  // whatsapp-bot.js calls this method to route the tap. Without this,
  // taps fall through to "Unknown list item ID" and the quiz never delivers.

  /**
   * Handle a tap on a row from the LP-selection list (after the teacher
   * picked a class). The Redis state set by _presentLPList tells us which
   * class the user already chose so we can route directly into generation.
   *
   * @param {Object} user      - Teacher user
   * @param {string} from      - Teacher phone
   * @param {string} listId    - Row id: quiz_lp_<lpId> | quiz_new_topic
   * @param {string} sessionId - Conversation session ID (for Redis state lookup)
   */
  static async handleLPListSelection(user, from, listId, sessionId) {
    try {
      // Pull the awaiting state set by _presentLPList — non-fatal if missing
      let saved = {};
      try {
        const raw = await redisService.redis.get(`quiz:awaiting_lp_selection:${sessionId}`);
        if (raw) saved = JSON.parse(raw);
      } catch (redisErr) {
        logToFile('⚠️ quiz:awaiting_lp_selection Redis read failed (non-fatal)', { error: redisErr.message });
      }

      const language = saved.language || user.preferred_language || 'en';
      const classId = saved.classId;

      if (!classId) {
        logToFile('⚠️ quiz LP-list tap with no classId in Redis — sending recovery', { listId, sessionId });
        await WhatsAppService.sendMessage(from,
          'Sorry, the quiz session expired. Please type /quiz to start again.'
        );
        return;
      }

      if (listId === 'quiz_new_topic') {
        // Re-fetch class for naming + run the topic-prompt path
        const { data: classData } = await supabase
          .from('student_lists')
          .select('id, class_name, section')
          .eq('id', classId)
          .single();
        await this._promptForTopic(user, from, sessionId, language, classId);
        // Clear the awaiting_lp_selection state — we are moving to awaiting_topic
        try { await redisService.redis.del(`quiz:awaiting_lp_selection:${sessionId}`); } catch (_) {}
        return;
      }

      if (listId.startsWith('quiz_lp_')) {
        const lessonPlanId = listId.replace('quiz_lp_', '');
        // Clear the awaiting state before generate — generation can take 30s
        try { await redisService.redis.del(`quiz:awaiting_lp_selection:${sessionId}`); } catch (_) {}
        await this.initiateFromLessonPlan(user, from, lessonPlanId, language, classId);
        return;
      }

      logToFile('⚠️ Unrecognised quiz LP-list row', { listId });
    } catch (err) {
      logToFile('❌ QuizOrchestrator.handleLPListSelection error', { error: err.message });
      await WhatsAppService.sendMessage(from,
        'Sorry, something went wrong. Please type /quiz to start again.'
      );
    }
  }

  // ─── Trigger 3: Post-coaching quiz offer ─────────────────────────

  /**
   * Offer quiz after coaching report. Called from report-generator.
   * Silently skips if teacher has no class or no students with phones.
   */
  static async offerQuizAfterReport(teacher, phone, lessonPlanId, topic, language = 'en') {
    try {
      logToFile('📝 QuizOrchestrator.offerQuizAfterReport', { userId: teacher.id, lessonPlanId, topic });

      // Check if teacher has a class with students who have phones
      const { data: classes } = await supabase
        .from('student_lists')
        .select('id, class_name, section')
        .eq('user_id', teacher.id)
        .eq('is_active', true)
        .limit(10);

      if (!classes || classes.length === 0) {
        logToFile('⚠️ offerQuizAfterReport: no classes, skipping');
        return;
      }

      // Check at least one class has students with phones
      const targetClass = classes[0];
      const { data: studentsWithPhones } = await supabase
        .from('students')
        .select('id')
        .eq('list_id', targetClass.id)
        .eq('is_active', true)
        .not('parent_phone', 'is', null)
        .limit(1);

      if (!studentsWithPhones || studentsWithPhones.length === 0) {
        logToFile('⚠️ offerQuizAfterReport: no students with phones, skipping');
        return;
      }

      const msg = language === 'ur'
        ? `کیا آپ "${topic}" پر اپنے طلباء کو کوئز بھیجنا چاہیں گے؟`
        : `Would you like to send a quiz on "${topic}" to your students?`;

      await WhatsAppService.sendInteractiveButtons(phone, {
        body: msg,
        buttons: [
          { id: `quiz_yes_send_${lessonPlanId}`, title: language === 'ur' ? 'ہاں، بھیجیں' : 'Yes, send quiz' },
          { id: 'quiz_not_now', title: language === 'ur' ? 'ابھی نہیں' : 'Not right now' }
        ]
      });

    } catch (err) {
      logToFile('⚠️ offerQuizAfterReport error (non-fatal)', { error: err.message });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Class gate for initiateFromLessonPlan (Triggers 2 & 3).
   * Auto-selects single class, prompts for selection if multiple.
   * @private
   */
  static async _checkClassGate(userId, from) {
    const { data: classes, error: classErr } = await supabase
      .from('student_lists')
      .select('id, class_name, section')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(10);

    if (classErr || !classes || classes.length === 0) {
      await WhatsAppService.sendMessage(from,
        '📚 To send quizzes, you need to set up a class first with your students\' phone numbers.\n\n' +
        'Type "set up class" or say "class setup" to get started!'
      );
      return { proceed: false, reason: 'no_class' };
    }

    // Auto-select for single class
    if (classes.length === 1) {
      const targetClass = classes[0];

      // Check students with phones
      const { data: studentsWithPhones } = await supabase
        .from('students')
        .select('id')
        .eq('list_id', targetClass.id)
        .eq('is_active', true)
        .not('parent_phone', 'is', null)
        .limit(1);

      if (!studentsWithPhones || studentsWithPhones.length === 0) {
        await WhatsAppService.sendMessage(from,
          `📱 Your class "${targetClass.class_name}" doesn't have any phone numbers yet.\n\n` +
          `To send quizzes, you need to add parent WhatsApp numbers for your students.\n\n` +
          `Type "edit class" to add phone numbers.`
        );
        return { proceed: false, reason: 'no_phone_numbers' };
      }

      return { proceed: true, targetClass };
    }

    // Multiple classes — prompt selection via button reply
    await WhatsAppService.sendMessage(from,
      'You have multiple classes. Please use /quiz to select which class should receive the quiz.'
    );
    return { proceed: false, reason: 'multiple_classes_use_quiz' };
  }

  /**
   * Show LP selection list to teacher.
   * @private
   */
  static async _presentLPList(from, recentLPs, sessionId, language, classId, classDisplay = '') {
    const formatDate = (iso) => {
      const d = new Date(iso);
      const now = new Date();
      const diffHours = (now - d) / 3600000;
      if (diffHours < 24) return 'today';
      if (diffHours < 48) return 'yesterday';
      return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
    };

    const rows = recentLPs.map(lp => ({
      id: `quiz_lp_${lp.id}`,
      title: lp.topic.substring(0, 24),
      description: `${lp.grade || ''} — ${formatDate(lp.created_at)}`.trim()
    }));

    // Add "new topic" option
    rows.push({
      id: 'quiz_new_topic',
      title: 'New topic',
      description: 'Not from a lesson plan'
    });

    // Store state so we can resume after list selection
    await redisService.setexWithCeiling(
      `quiz:awaiting_lp_selection:${sessionId}`,
      3600,
      JSON.stringify({ sessionId, language, classId })
    );

    await WhatsAppService.sendInteractiveMessage(from, {
      header: classDisplay ? `Quiz for ${classDisplay}` : 'Send a quiz',
      body: 'Which topic should the quiz cover?',
      action: {
        button: 'Choose topic',
        sections: [{ title: 'Recent lesson plans', rows }]
      }
    });
  }

  /**
   * Ask teacher to enter a topic (standalone quiz path).
   * @private
   */
  static async _promptForTopic(user, from, sessionId, language, classId) {
    await redisService.setexWithCeiling(
      `quiz:awaiting_topic:${user.id}`,
      3600,
      JSON.stringify({ sessionId, language, classId })
    );

    await WhatsAppService.sendMessage(from,
      '📝 What topic should the quiz cover?\n\n' +
      'For example: "Fractions", "Water Cycle", "Parts of Speech"\n\n' +
      'موضوع کیا ہونا چاہیے؟'
    );
  }

  /**
   * Handle topic text reply from teacher — skip grade, go directly to generation.
   * Grade is inferred from the class name.
   * @private
   */
  static async _handleTopicReply(user, from, topicText, state) {
    const { language, classId } = state;

    // Fetch class for grade inference and display
    const { data: classData } = await supabase
      .from('student_lists')
      .select('class_name, section')
      .eq('id', classId)
      .single();

    // Check for active quiz
    const activeQuiz = await this._getActiveQuiz(classId);
    if (activeQuiz) {
      await WhatsAppService.sendMessage(from,
        `⚠️ You already have an active quiz on "${activeQuiz.topic}" sent to your students. ` +
        `Wait for it to complete before sending a new one.`
      );
      return;
    }

    await this._generateAndDeliver(user, from, topicText, classId, classData, language || 'en');
  }

  /**
   * Generate and deliver a quiz — shared by all topic paths.
   * @private
   */
  static async _generateAndDeliver(user, from, topic, classId, classData, language) {
    const classDisplay = classData
      ? (classData.section ? `${classData.class_name} - ${classData.section}` : classData.class_name)
      : '';
    const grade = classData?.class_name || null;

    await WhatsAppService.sendMessage(from,
      `📝 Creating a quiz on "${topic}"${classDisplay ? ` for ${classDisplay}` : ''}... This takes about 30 seconds.`
    );

    try {
      const QuizGenerationService = require('./quiz-generation.service');
      const QuizDeliveryService = require('./quiz-delivery.service');

      const quizId = await QuizGenerationService.generateAndStore({
        teacherId: user.id,
        listId: classId,
        topic,
        grade,
        quizSource: 'manual',
        language
      });

      await QuizDeliveryService.deliverQuiz(quizId, from, language);

    } catch (err) {
      logToFile('❌ QuizOrchestrator._generateAndDeliver error', { error: err.message });
      await WhatsAppService.sendMessage(from,
        'Sorry, something went wrong creating the quiz. Please try /quiz again.'
      );
    }
  }

  /**
   * Get active quiz for a class (status 'sent', created in last 24hrs).
   * @private
   */
  static async _getActiveQuiz(listId) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('quizzes')
      .select('id, topic, created_at')
      .eq('list_id', listId)
      .eq('status', 'sent')
      .gte('created_at', yesterday)
      .limit(1)
      .single();
    return data || null;
  }
}

module.exports = QuizOrchestrator;
