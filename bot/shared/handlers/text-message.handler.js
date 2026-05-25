const WhatsAppService = require('../services/whatsapp.service');
const OpenAIService = require('../services/openai.service');
const ContentService = require('../services/content.service');
const LanguageDetectorService = require('../services/language-detector.service');
const FeatureRegistrationService = require('../services/feature-registration.service');
const ContextService = require('../services/context.service'); // Phase 2: Conditional Feature Context
const redisService = require('../services/cache/railway-redis.service');
const redis = redisService.redis; // Get Redis instance
const CoachingService = require('../services/coaching-orchestrator.service');
const MenuService = require('../services/menu.service');
// MediaLibraryService removed - Issue #28: AI Video Generation replaces Media Library
const HelperAgentService = require('../services/helper-agent.service');
const { handlePortalCommand } = require('./portal-command.handler');
const ReadingAssessmentService = require('../services/reading-assessment.service');
const FeatureLinkerService = require('../services/feature-linker.service');
const FeatureIntroService = require('../services/feature-intro.service');
const LessonPlanQueueService = require('../services/lesson-plan-queue.service');
const handleCurriculumLessonPlan = require('./lesson-plan-v2.handler');
const RegionFeaturesService = require('../services/region-features.service');
const { getUserRegion } = require('../utils/region');
const VideoOrchestrator = require('../services/video/video-orchestrator.service');
const AttendanceDetectorService = require('../services/attendance-detector.service');
const AttendanceConversationService = require('../services/attendance-conversation.service');
const AttendanceDeliveryService = require('../services/attendance-delivery.service');
const { logToFile } = require('../utils/logger');
const { TEMP_DIR, LOADING_STICKER_PATH, LOADING_STICKER_MEDIA_ID, OPENAI_API_KEY, ATTENDANCE_SETUP_FLOW_ID, ATTENDANCE_MARKING_FLOW_ID } = require('../utils/constants');
const { getClient } = require('../services/llm-client');

const openai = getClient();
// Import REAL language detection utilities for command detection
const { detectLanguageOverride } = require('../utils/language-detector');
const { getUserLanguage, setUserLanguage } = require('../utils/language-cache');
// Bug #10: Import language detection for content generation
const { detectRequestedLanguage, parseSubjectAndGrade } = require('../utils/language-detection');
const path = require('path');
const {
  getOrCreateUser,
  getOrCreateSession,
  updateSessionType,
  storeConversation,
  storeLessonPlan
} = require('../database/bot-helpers');
const supabase = require('../config/supabase');
const fs = require('fs');

/**
 * Curriculum pre-gen intercept. If the teacher's region enables curriculum LPs
 * (region_features.curriculum_lp_enabled) and the topic maps to a pre-generated
 * chapter LP, serve it and return true. Returns false (no-op) for regions
 * without curriculum LPs — the caller then falls through to the standard Gamma
 * flow. region_features defaults curriculum_lp_enabled=false, so this is inert
 * for a default deployment.
 */
async function tryCurriculumLessonPlanServe(from, topic, user, language) {
  try {
    const features = await RegionFeaturesService.getRegionFeatures(getUserRegion(user));
    if (!features.curriculum_lp_enabled || !features.curriculum_key) return false;
    const grade = parseInt(user && user.grade, 10) || (user && user.grade) || undefined;
    const result = await handleCurriculumLessonPlan({
      userId: from,
      topic,
      grade,
      subject: user && user.subject,
      curriculum: features.curriculum_key,
      language,
    });
    return !!(result && result.source === 'pre_generated');
  } catch (e) {
    logToFile('Curriculum LP intercept failed, falling through to Gamma', { error: e.message });
    return false;
  }
}

/**
 * Handle text message processing
 * @param {Object} message - WhatsApp message object
 * @param {string} from - Sender phone number
 * @param {string} messageBody - Message text
 * @param {Object|null} user - User object from database (optional for backwards compatibility)
 * @returns {Promise<void>}
 */
async function handleTextMessage(message, from, messageBody, user = null) {
  logToFile(`Processing TEXT message: ${messageBody}`);

  // Start continuous typing indicator immediately
  const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

  try {
    // ============================================================
    // QUIZ STATE INTERCEPT — runs BEFORE user creation so parents (who may
    // not have a Rumi account) can answer quizzes. Post-quiz AI chat is checked
    // FIRST (it is the most-recent state; running getActiveState first could
    // recover a stale 'invited' session and send the wrong nudge), then an
    // active quiz session.
    // ============================================================
    if (messageBody) {
      try {
        const QuizSessionService = require('../services/quiz/quiz-session.service');

        const postQuizState = await QuizSessionService.getPostQuizState(from);
        if (postQuizState) {
          const lowerQ = (messageBody || '').trim().toLowerCase();
          if (lowerQ === 'stop' || lowerQ === 'done') {
            await QuizSessionService.endPostQuizChat(from);
          } else {
            await QuizSessionService.handlePostQuizChat(from, messageBody, postQuizState);
          }
          typingController.stop();
          return;
        }

        const quizState = await QuizSessionService.getActiveState(from);
        if (quizState) {
          const trimmedQ = messageBody.trim();
          const lowerQ = trimmedQ.toLowerCase();
          if (/^(start quiz|start_quiz|کوئز شروع کریں)$/i.test(trimmedQ)) {
            await QuizSessionService.startQuizFromInvite(from);
          } else if (lowerQ === 'stop' || trimmedQ === 'روکیں') {
            await QuizSessionService.endSession(from, quizState, 'incomplete');
          } else if (/^[abc]$/i.test(trimmedQ) && quizState.currentQuestionId) {
            await QuizSessionService.handleAnswer(from, trimmedQ, quizState);
          } else {
            await WhatsAppService.sendMessage(from,
              '❓ Tap one of the answer buttons above, or type A, B, or C.\n\nType STOP to exit the quiz.'
            );
          }
          typingController.stop();
          return;
        }
      } catch (qErr) {
        logToFile('⚠️ Quiz state intercept error (non-fatal)', { error: qErr.message });
      }
    }

    // ============================================================
    // DATABASE INTEGRATION: Use provided user or get/create
    // ============================================================
  if (!user) {
    try {
      user = await getOrCreateUser(from);
      logToFile('User retrieved/created', { userId: user.id, phoneNumber: from });
    } catch (error) {
      logToFile('⚠️ Error with database user operation', { error: error.message });
      // Continue without database - bot will still work
    }
  } else {
    logToFile('Using provided user object', { userId: user.id, phoneNumber: from });
  }

  // NOTE: Funnel tracking (chat start) is handled centrally in whatsapp-bot.js
  // before routing to this handler

  // Get or create session for this user
  let sessionId = null;
  if (user) {
    try {
      sessionId = await getOrCreateSession(user.id);
      logToFile('✅ Session retrieved/created', { sessionId });
    } catch (error) {
      logToFile('⚠️ Error with session management', { error: error.message });
    }
  }

  // ============================================================
  // FEATURE-BASED REGISTRATION: Check if waiting for name
  // ============================================================
  if (user) {
    try {
      const isPendingName = await FeatureRegistrationService.isPendingName(user.id);
      if (isPendingName) {
        logToFile('📝 User is pending name registration, handling name response', { userId: user.id });

        // Get user's current language
        const userLanguage = user.preferred_language || 'en';

        // Handle the name response
        const result = await FeatureRegistrationService.handleNameResponse(
          user.id,
          messageBody,
          from,
          userLanguage,
          'text'
        );

        if (result.success) {
          logToFile('✅ Name registration completed via text', { userId: user.id, firstName: result.firstName });
        } else {
          logToFile('⚠️ Name extraction failed, asking again', { userId: user.id });
          // Ask again if extraction failed
          const retryMessages = {
            en: "I didn't quite catch that. What name should I call you by?",
            ur: "میں سمجھ نہیں سکی۔ آپ کو کس نام سے بلاؤں؟",
            ar: "لم أفهم ذلك. ما اسمك؟",
            es: "No entendí bien. ¿Cómo te llamo?"
          };
          await WhatsAppService.sendMessage(from, retryMessages[userLanguage] || retryMessages.en);
        }

        // Stop typing and return early
        if (typingController) typingController.stop();
        return;
      }
    } catch (error) {
      logToFile('⚠️ Error checking pending name status', { error: error.message });
      // Continue with normal flow if check fails
    }
  }

  // Get user's current language preference using user ID
  const currentLanguage = user ? await getUserLanguage(user.id) : 'en';
  logToFile('Current user language preference', { language: currentLanguage, userId: user?.id });

  // Check for explicit language switch command FIRST
  const overrideLanguage = detectLanguageOverride(messageBody);
  let responseLanguage = currentLanguage;
  let languageSwitched = false;

  if (overrideLanguage && overrideLanguage !== currentLanguage) {
    // Update user's language preference in database and cache using user ID
    if (user) {
      await setUserLanguage(user.id, overrideLanguage);
    }
    responseLanguage = overrideLanguage;
    languageSwitched = true;

    logToFile('🌐 Language switched by user command', {
      from: currentLanguage,
      to: overrideLanguage,
      command: messageBody,
      phoneNumber: from
    });

    // Send confirmation in the NEW language
    const confirmations = {
      en: "✅ I've switched to English. How can I help you today?",
      ur: "✅ میں نے اردو میں تبدیل کر دیا ہے۔ آج میں آپ کی کیسے مدد کر سکتی ہوں؟",
      ar: "✅ لقد تحولت إلى اللغة العربية. كيف يمكنني مساعدتك اليوم؟",
      es: "✅ He cambiado al español. ¿Cómo puedo ayudarte hoy?"
    };

    await WhatsAppService.sendMessage(from, confirmations[overrideLanguage]);

    // Return early if this was just a language switch command
    return;
  }

  // ============================================================
  // ICE BREAKER DETECTION: Handle tapped ice breakers (BUG-001 fix)
  // ============================================================
  const trimmedMessage = messageBody.trim().toLowerCase();

  // When user taps ice breaker, WhatsApp sends the ice breaker text as message
  const iceBreakers = {
    'show menu - see all features i can help with': 'menu',
    'plan lesson - create pdf lesson plans instantly': 'lesson_plan',
    'create video - make animated educational videos': 'video',
    'get coaching - classroom audio feedback & tips': 'coaching'
  };

  if (iceBreakers[trimmedMessage]) {
    const action = iceBreakers[trimmedMessage];
    logToFile('🧊 Ice breaker detected', { action, userId: user?.id, phoneNumber: from });

    if (!user) {
      await WhatsAppService.sendMessage(
        from,
        'Sorry, I could not find your account. Please send me a message first.\n\nمعذرت، میں آپ کا اکاؤنٹ نہیں مل سکا۔'
      );
      typingController.stop();
      return;
    }

    try {
      switch (action) {
        case 'menu':
          await MenuService.sendMenu(from, user.id, sessionId, responseLanguage);
          break;
        case 'lesson_plan':
          await MenuService._handleLessonPlanningChoice(user.id, sessionId, from, responseLanguage);
          break;
        case 'video':
          await MenuService._handleMediaLibraryChoice(user.id, sessionId, from, responseLanguage);
          break;
        case 'coaching':
          await MenuService._handleClassroomCoachingChoice(user.id, sessionId, from, responseLanguage);
          break;
      }
      logToFile('✅ Ice breaker action completed', { action, userId: user.id });
    } catch (error) {
      logToFile('❌ Error handling ice breaker', { action, error: error.message });
      await WhatsAppService.sendMessage(from, 'Something went wrong. Please try again or type /menu.');
    }

    typingController.stop();
    return; // Stop further processing
  }

  // ============================================================
  // EXAM CHECKER DETECTION (bd-086): Check for exam check trigger
  // ============================================================
  if (user) {
    try {
      const ExamCheckerHandler = require('./exam-checker.handler');
      const result = await ExamCheckerHandler.handleExamText(message, from, user);
      if (result && result.handled) {
        logToFile('✅ Message handled by Exam Checker', { userId: user.id });
        typingController.stop();
        return;
      }
    } catch (error) {
      logToFile('⚠️ Error in exam checker detection', { error: error.message });
      // Continue with regular message handling
    }
  }

  // ============================================================
  // PORTAL COMMAND DETECTION: Check for /portal command
  // ============================================================
  if (trimmedMessage === '/portal' || trimmedMessage.startsWith('/portal ')) {
    logToFile('📱 /portal command detected', { userId: user?.id, phoneNumber: from });

    if (!user) {
      // Edge case: user not found in database
      await WhatsAppService.sendMessage(
        from,
        'Sorry, I could not find your account. Please send me a message first to register.\n\nمعذرت، میں آپ کا اکاؤنٹ نہیں مل سکا۔'
      );
      return;
    }

    try {
      const response = await handlePortalCommand(user, from);

      // Only send message if handler returned non-empty response
      // (PortalInviteService sends its own message for new invitations)
      if (response && response.trim().length > 0) {
        await WhatsAppService.sendMessage(from, response);
      }

      logToFile('✅ /portal command processed successfully', { userId: user.id });
    } catch (error) {
      logToFile('❌ Error processing /portal command', {
        userId: user.id,
        error: error.message,
        stack: error.stack
      });

      await WhatsAppService.sendMessage(
        from,
        'Sorry, something went wrong with the portal command. Please try again later.\n\nمعذرت، پورٹل کمانڈ میں کچھ غلط ہو گیا۔'
      );
    }

    return; // Stop further processing
  }

  // ============================================================
  // READING TEST COMMAND DETECTION: Check for /reading test command
  // ============================================================
  if (trimmedMessage === '/reading test' || trimmedMessage === '/readingtest') {
    logToFile('📖 /reading test command detected', { userId: user?.id, phoneNumber: from });

    if (!user) {
      // Edge case: user not found in database
      await WhatsAppService.sendMessage(
        from,
        'Sorry, I could not find your account. Please send me a message first to register.\n\nمعذرت، میں آپ کا اکاؤنٹ نہیں مل سکا۔'
      );
      return;
    }

    try {
      // Stop typing indicator before sending video
      typingController.stop();

      // Get user's language for intro message
      const userLanguage = await getUserLanguage(from) || 'en';

      // Integration Point 2: First-time slash command - send intro video if first use
      // This is implicit consent since user initiated the command
      const videoSent = await FeatureIntroService.sendFirstUseIntroIfNeeded(
        user.id,
        from,
        'reading',
        userLanguage
      );

      if (videoSent) {
        logToFile('📹 First-use intro video sent for reading assessment', { userId: user.id });
      }

      // Send WhatsApp Flow for reading assessment setup
      const flowSent = await WhatsAppService.sendFlow(from, {
        flowId: process.env.READING_ASSESSMENT_FLOW_ID,
        header: '📚 Reading Assessment',
        body: 'Let\'s set up a reading assessment for your student. This will help measure their reading fluency and comprehension.',
        footer: 'Takes about 5-10 minutes',
        buttonText: 'Start Assessment',
        screen: 'BASIC_INFO'  // Multi-screen flow v3: first screen
      });

      if (flowSent) {
        logToFile('✅ Reading assessment flow sent successfully', { userId: user.id });
        // Mark feature as used (after video was shown)
        await FeatureIntroService.markFeatureUsed(user.id, 'reading');
      } else {
        throw new Error('Failed to send WhatsApp Flow');
      }
    } catch (error) {
      logToFile('❌ Error sending reading assessment flow', {
        userId: user?.id,
        error: error.message,
        stack: error.stack
      });

      await WhatsAppService.sendMessage(
        from,
        'Sorry, something went wrong starting the reading test. Please try again later.\n\nمعذرت، ریڈنگ ٹیسٹ شروع کرنے میں کچھ غلط ہو گیا۔'
      );
    }

    return; // Stop further processing
  }

  // ============================================================
  // QUIZ FOLLOW-UP: teacher tapped a follow-up button earlier ("Revise +
  // next topic" / "Extension" / "Bridge") and we asked for the next topic.
  // This reply is that topic — route it to the follow-up service.
  // ============================================================
  if (user?.id && messageBody) {
    try {
      const QuizFollowUpService = require('../services/quiz/quiz-follow-up.service');
      const awaiting = await QuizFollowUpService.getAwaitingState(user.id);
      if (awaiting) {
        typingController.stop();
        await QuizFollowUpService.handleNextTopicReply(user.id, from, await getUserLanguage(from) || 'en', messageBody);
        return;
      }
    } catch (e) {
      logToFile('⚠️ Quiz follow-up topic check error (non-fatal)', { error: e.message });
    }
  }

  // ============================================================
  // QUIZ TOPIC RESPONSE: user is replying with a quiz topic after /quiz
  // ============================================================
  if (user?.id) {
    try {
      const awaitingQuizTopic = await redis.get(`quiz:awaiting_topic:${user.id}`);
      if (awaitingQuizTopic) {
        const state = JSON.parse(awaitingQuizTopic);
        await redis.del(`quiz:awaiting_topic:${user.id}`);
        typingController.stop();
        const QuizOrchestrator = require('../services/quiz/quiz-orchestrator.service');
        await QuizOrchestrator.handleTopicReply(user, from, messageBody.trim(), state);
        return;
      }
    } catch (error) {
      logToFile('⚠️ Error checking quiz topic state', { userId: user?.id, error: error.message });
    }
  }

  // ============================================================
  // QUIZ COMMAND: /quiz [topic] — generate + send a quiz to the class.
  // Direct path (QuizOrchestrator). A Quiz Manager Flow can be layered later
  // via QUIZ_FLOW_ID, but the direct path needs no Meta-flow registration.
  // ============================================================
  if (trimmedMessage === '/quiz' || trimmedMessage.startsWith('/quiz ')) {
    logToFile('📝 /quiz command detected', { userId: user?.id, phoneNumber: from });
    if (!user) {
      typingController.stop();
      await WhatsAppService.sendMessage(
        from,
        'Sorry, I could not find your account. Please send me a message first to register.\n\nمعذرت، میں آپ کا اکاؤنٹ نہیں مل سکا۔'
      );
      return;
    }
    try {
      const QuizOrchestrator = require('../services/quiz/quiz-orchestrator.service');
      const responseLanguage = await getUserLanguage(from) || 'en';
      const topic = trimmedMessage.replace(/^\/quiz[\s,:;\-]*/i, '').trim() || null;
      await QuizOrchestrator.initiateQuizRequest(user, from, sessionId, responseLanguage, topic);
      logToFile('✅ Quiz orchestration started', { userId: user.id, topic });
    } catch (error) {
      logToFile('❌ Error initiating quiz', { userId: user?.id, error: error.message });
      typingController.stop();
      await WhatsAppService.sendMessage(
        from,
        'Sorry, something went wrong starting the quiz. Please try again.\n\nمعذرت، کوئز شروع کرنے میں کچھ غلط ہو گیا۔'
      );
    }
    return;
  }

  // ============================================================
  // VIDEO GENERATION COMMAND: Check for /video command
  // ============================================================
  if (trimmedMessage === '/video' || trimmedMessage.startsWith('/video ')) {
    logToFile('🎬 /video command detected', { userId: user?.id, phoneNumber: from });

    if (!user) {
      await WhatsAppService.sendMessage(
        from,
        'Sorry, I could not find your account. Please send me a message first to register.\n\nمعذرت، میں آپ کا اکاؤنٹ نہیں مل سکا۔'
      );
      return;
    }

    try {
      typingController.stop();

      // Extract topic from command if provided (e.g., "/video gravity")
      const topic = trimmedMessage.replace(/^\/video\s*/i, '').trim() || null;

      await VideoOrchestrator.initiateVideoRequest(user, from, sessionId, responseLanguage, topic);
      logToFile('✅ Video generation initiated', { userId: user.id, topic });
    } catch (error) {
      logToFile('❌ Error initiating video generation', {
        userId: user?.id,
        error: error.message,
        stack: error.stack
      });

      await WhatsAppService.sendMessage(
        from,
        'Sorry, something went wrong starting video generation. Please try again later.\n\nمعذرت، ویڈیو بنانے میں کچھ غلط ہو گیا۔'
      );
    }

    return; // Stop further processing
  }

  // ============================================================
  // VIDEO TOPIC RESPONSE: Check if user is replying with video topic
  // CRITICAL: Must check BEFORE other processing to capture topic reply
  // ============================================================
  if (user) {
    try {
      const awaitingTopicState = await VideoOrchestrator.checkAwaitingTopic(user.id);

      if (awaitingTopicState) {
        logToFile('📹 User responding to video topic prompt', {
          userId: user.id,
          topic: messageBody.substring(0, 100)
        });

        typingController.stop();

        // Clear the awaiting state
        await VideoOrchestrator.clearAwaitingTopic(user.id);

        // Use the message as the topic and initiate video generation
        await VideoOrchestrator.initiateVideoRequest(
          user,
          from,
          awaitingTopicState.sessionId,
          awaitingTopicState.language,
          messageBody.trim()  // User's reply IS the topic
        );

        return; // Stop further processing
      }
    } catch (error) {
      logToFile('⚠️ Error checking video topic state', {
        userId: user?.id,
        error: error.message
      });
      // Continue with normal flow if state check fails
    }
  }

  // ============================================================
  // VIDEO CUSTOMIZATION RESPONSE: Check if user is providing customization
  // CRITICAL: Must check BEFORE other processing to capture customization reply
  // Issue #35: After customization → Style selection (not direct generation)
  // ============================================================
  if (user) {
    try {
      const awaitingCustomizationState = await VideoOrchestrator.checkAwaitingCustomization(user.id);

      if (awaitingCustomizationState) {
        logToFile('📹 User responding to video customization prompt', {
          userId: user.id,
          response: messageBody.substring(0, 100)
        });

        typingController.stop();

        // Clear the awaiting state
        await VideoOrchestrator.clearAwaitingCustomization(user.id);

        // Check if user wants to skip
        const skipKeywords = ['skip', 'no', 'نہیں', 'لا', 'تخطي', 'saltar'];
        const isSkip = skipKeywords.some(kw =>
          messageBody.toLowerCase().trim() === kw.toLowerCase()
        );

        const customization = isSkip ? null : messageBody.trim();

        // Issue #35: Proceed to style selection (not direct generation)
        await VideoOrchestrator.askForStyle(
          from,
          user.id,
          awaitingCustomizationState.sessionId,
          awaitingCustomizationState.language,
          awaitingCustomizationState.topic,
          customization
        );

        return; // Stop further processing
      }
    } catch (error) {
      logToFile('⚠️ Error checking video customization state', {
        userId: user?.id,
        error: error.message
      });
      // Continue with normal flow if state check fails
    }
  }

  // ============================================================
  // BUG #18: COMPREHENSION TEXT ANSWER HANDLING
  // CRITICAL: Must check BEFORE normal conversation to route comprehension answers
  // ============================================================
  if (user) {
    try {
      const RedisComprehensionService = require('../services/redis-comprehension.service');
      const activeFlow = await RedisComprehensionService.findActiveFlowByUser(user.id);

      logToFile('🔍 Text routing check - comprehension', {
        hasActiveFlow: !!activeFlow,
        assessmentId: activeFlow?.assessment_id || 'none',
        currentQuestion: activeFlow?.current_question_index,
        totalQuestions: activeFlow?.questions?.length,
        answersCollected: activeFlow?.answers?.length || 0
      });

      if (activeFlow) {
        logToFile('📝 Comprehension TEXT answer detected (Bug #18)', {
          assessmentId: activeFlow.assessment_id,
          currentQuestion: activeFlow.current_question_index,
          answerText: messageBody.substring(0, 50) + '...'
        });

        // Stop typing indicator
        typingController.stop();

        // Import ComprehensionService
        const ComprehensionService = require('../services/reading/comprehension.service');

        // Get question data from Redis flow state
        const questions = activeFlow.questions;
        const currentQuestionIndex = activeFlow.current_question_index;
        const questionData = questions[currentQuestionIndex];
        const assessmentId = activeFlow.assessment_id;

        // Get language from assessment record
        const { data: assessment } = await supabase
          .from('reading_assessments')
          .select('language, grade_level')
          .eq('id', assessmentId)
          .single();
        const language = assessment?.language || 'en';

        // Bug #18: Evaluate TEXT answer directly (no transcription needed)
        const answerEvaluation = await ComprehensionService.evaluateTextAnswer(
          questionData,
          messageBody,
          language
        );

        logToFile('Comprehension text answer evaluated', {
          questionId: questionData.id,
          correct: answerEvaluation.correct,
          confidence: answerEvaluation.confidence
        });

        // Record answer in Redis and get updated state
        const updatedFlow = await RedisComprehensionService.recordAnswer(
          assessmentId,
          answerEvaluation
        );

        // Check if more questions remain
        const nextQuestionIndex = updatedFlow.current_question_index;

        logToFile('🔄 Comprehension progress check (text)', {
          currentQuestionIndex,
          nextQuestionIndex,
          totalQuestions: questions.length,
          answersCollected: updatedFlow.answers.length,
          hasMoreQuestions: nextQuestionIndex < questions.length
        });

        if (nextQuestionIndex < questions.length) {
          // Send next question immediately
          const nextQuestion = questions[nextQuestionIndex];

          logToFile('📤 Sending next comprehension question', {
            questionNumber: nextQuestionIndex + 1,
            totalQuestions: questions.length,
            questionType: nextQuestion.type,
            hasImage: !!nextQuestion.imageUrl
          });

          // Bug #7: Handle image questions (word-level comprehension)
          if (nextQuestion.imageUrl && nextQuestion.buttons) {
            await WhatsAppService.sendImageWithButtons(
              from,
              nextQuestion.imageUrl,
              `Question ${nextQuestionIndex + 1}/${questions.length}: ${nextQuestion.question}`,
              nextQuestion.buttons
            );
          } else {
            await WhatsAppService.sendMessage(
              from,
              `Question ${nextQuestionIndex + 1}/${questions.length}: ${nextQuestion.question}`
            );
          }

          logToFile('✅ Next comprehension question sent (text flow)', {
            questionIndex: nextQuestionIndex,
            totalQuestions: questions.length,
            answersStored: updatedFlow.answers.length
          });
        } else {
          // All questions answered - finalize comprehension assessment
          const answers = updatedFlow.answers;
          logToFile('🎉 All comprehension questions answered (text) - finalizing assessment', {
            assessmentId,
            totalAnswers: answers.length,
            correctAnswers: answers.filter(a => a.correct).length,
            score: Math.round((answers.filter(a => a.correct).length / answers.length) * 100) + '%'
          });

          // Analyze comprehension results
          const comprehensionAnalysis = await ComprehensionService.analyzeComprehension(
            questions,
            answers,
            assessment.grade_level,
            language
          );

          // Save to reading_assessments table
          await supabase
            .from('reading_assessments')
            .update({
              comprehension_questions: questions,
              comprehension_answers: answers,
              comprehension_analysis: comprehensionAnalysis,
              comprehension_score: comprehensionAnalysis.score,
              status: 'comprehension_completed'
            })
            .eq('id', assessmentId);

          // Clean up Redis flow state
          await RedisComprehensionService.clearComprehensionState(assessmentId);

          // Generate combined fluency + comprehension report
          const ReadingAnalysisService = require('../services/reading/analysis.service');
          try {
            await ReadingAnalysisService.generateCombinedReport(assessmentId, from);
          } catch (reportError) {
            logToFile('❌ CRITICAL: Failed to generate combined report after comprehension completion', {
              assessmentId,
              error: reportError.message,
              stack: reportError.stack
            });
            await WhatsAppService.sendMessage(
              from,
              'Sorry, there was an error generating the final report. Please contact support.\n\nمعذرت، رپورٹ بنانے میں خرابی آ گئی۔'
            );
          }
        }

        return; // Exit early - comprehension flow handled
      }
    } catch (error) {
      logToFile('⚠️ Error checking comprehension state (text)', {
        userId: user?.id,
        error: error.message,
        stack: error.stack
      });
      // Don't return - let the message continue to normal processing if comprehension check fails
    }
  }

  // If no explicit switch, detect language from content and use it for response
  const detectedLanguage = LanguageDetectorService.detectLanguage(messageBody);

  // BUG FIX: Check if user has locked their language preference
  // If language_locked = true, use their preferred_language instead of auto-detection
  // This prevents auto-detection from overriding explicit user choice via /language command
  if (user && user.language_locked === true) {
    // Language is locked - use user's explicit preference
    responseLanguage = user.preferred_language || currentLanguage;

    logToFile('Language preference is LOCKED - using user preference over auto-detection', {
      detectedLanguage: detectedLanguage,
      userPreference: user.preferred_language,
      using: responseLanguage
    });
  } else if (detectedLanguage && detectedLanguage !== currentLanguage) {
    // Auto-detect mode: Use detected language for this response (temporary override, doesn't update stored preference)
    responseLanguage = detectedLanguage;

    logToFile('🔄 Auto-adapting response language based on message content (UNLOCKED)', {
      storedPreference: currentLanguage,
      detectedLanguage: detectedLanguage,
      usingForResponse: responseLanguage
    });
  } else {
    logToFile('Language detected from text content (UNLOCKED)', {
      detected: detectedLanguage,
      using: responseLanguage
    });
  }

  // Store user message in database with session
  if (user && sessionId) {
    try {
      await storeConversation(
        user.id,
        'user',
        messageBody,
        'text',
        sessionId,
        'text', // inputFormat
        responseLanguage, // Use the actual response language
        null, // outputFormat (not applicable for user messages)
        null  // outputLanguage (not applicable for user messages)
      );
      logToFile('✅ User message stored in database with session and language');
    } catch (error) {
      logToFile('⚠️ Failed to store user message', { error: error.message });
    }
  }

  // CHECK FOR ACTIVE COACHING SESSION (Reflective Question Response)
  if (user) {
    try {
      const { data: activeCoaching } = await supabase
        .from('coaching_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'conducting_conversation')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (activeCoaching) {
        // Check if session is stuck (no update in last hour)
        const lastUpdate = new Date(activeCoaching.updated_at);
        const now = new Date();
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

        if (hoursSinceUpdate > 1) {
          logToFile('⚠️  Stuck coaching session detected', {
            coachingSessionId: activeCoaching.id,
            lastUpdate: activeCoaching.updated_at,
            hoursSinceUpdate: hoursSinceUpdate.toFixed(2),
            conversationState: activeCoaching.conversation_state?.current_state
          });

          // Offer recovery options
          typingController.stop();
          await WhatsAppService.sendMessage(
            from,
            "⚠️ I noticed your previous coaching session didn't complete properly.\n\n" +
            "Would you like to:\n" +
            "1️⃣ *Try again* - I'll re-analyze your lesson\n" +
            "2️⃣ *Start fresh* - Begin a new coaching session\n\n" +
            "Reply with *1* or *2*"
          );
          return;
        }

        logToFile('🎓 Active coaching session detected - routing as reflective response', {
          coachingSessionId: activeCoaching.id
        });

        // Stop typing indicator
        typingController.stop();

        // Route to coaching service
        await CoachingService.handleReflectiveResponse(
          activeCoaching.id,
          from,
          messageBody,
          'text',
          responseLanguage
        );

        return; // Exit early - coaching flow handled
      }
    } catch (error) {
      // If no active coaching or error, continue with normal flow
      logToFile('No active coaching session or error checking', {
        error: error.code === 'PGRST116' ? 'No rows found' : error.message
      });
    }
  }

  // ============================================================
  // PAUSE-AND-RESUME: Stuck Session Detection (Non-Blocking)
  // ============================================================

  // Detect stuck sessions but DON'T block user - store reminder for later
  if (user) {
    try {
      const { data: stuckSession } = await supabase
        .from('coaching_sessions')
        .select('id, status, updated_at, conversation_state')
        .eq('user_id', user.id)
        .in('status', ['conducting_conversation', 'analyzing'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (stuckSession) {
        const lastUpdate = new Date(stuckSession.updated_at);
        const minutesSinceUpdate = (new Date() - lastUpdate) / (1000 * 60);

        if (minutesSinceUpdate > 60) {
          // Store context in Redis for later reminder (don't block user NOW)
          const reminderKey = `user:${user.id}:stuck:reminder`;
          const reminderData = JSON.stringify({
            sessionId: stuckSession.id,
            status: stuckSession.status,
            state: stuckSession.conversation_state?.current_state,
            detectedAt: new Date().toISOString()
          });

          await redis.setex(reminderKey, 604800, reminderData); // 7 days TTL

          logToFile('📌 Stuck session detected but user not blocked', {
            sessionId: stuckSession.id,
            status: stuckSession.status,
            minutesSinceUpdate: minutesSinceUpdate.toFixed(1)
          });

          // DON'T RETURN - let user continue with current request
        }
      }
    } catch (error) {
      if (error.code !== 'PGRST116') { // Ignore "no rows found"
        logToFile('Error checking for stuck sessions', { error: error.message });
      }
    }
  }

  // Check if user is responding to a stuck session recovery prompt
  if (user) {
    try {
      const expectingRecoveryKey = `user:${user.id}:expecting:recovery`;
      const stuckSessionId = await redis.get(expectingRecoveryKey);

      if (stuckSessionId) {
        // User is responding to recovery prompt
        logToFile('🔍 User responding to stuck session recovery', {
          sessionId: stuckSessionId,
          response: messageBody
        });

        // Fetch the stuck session
        const { data: stuckSession } = await supabase
          .from('coaching_sessions')
          .select('*')
          .eq('id', stuckSessionId)
          .single();

        if (stuckSession) {
          const choice = messageBody.trim();

          if (choice === '1') {
            // Retry analysis
            typingController.stop();
            await redis.del(expectingRecoveryKey);

            logToFile('♻️ User chose to retry stuck session', { sessionId: stuckSessionId });
            await WhatsAppService.sendMessage(from, "⏳ Retrying your lesson analysis...");

            try {
              await CoachingService.retryAnalysis(stuckSessionId, from);
            } catch (error) {
              logToFile('❌ Failed to retry analysis', { error: error.message });
              await WhatsAppService.sendMessage(
                from,
                "❌ Sorry, I couldn't retry the analysis. Please try starting a new session."
              );
            }
            return;
          } else if (choice === '2') {
            // Start fresh
            typingController.stop();
            await redis.del(expectingRecoveryKey);

            logToFile('🆕 User chose to start fresh', { oldSessionId: stuckSessionId });

            await supabase
              .from('coaching_sessions')
              .update({ status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', stuckSessionId);

            const freshMessages = {
              en: "✅ Okay! Starting fresh.\n\nTo begin a new coaching session, please send me:\n1️⃣ Your classroom audio or video\n2️⃣ Your lesson plan (PDF or text)",
              ur: "✅ ٹھیک ہے! نیا آغاز کرتے ہیں۔\n\nنیا کوچنگ سیشن شروع کرنے کے لیے، براہ کرم بھیجیں:\n1️⃣ اپنی کلاس روم آڈیو یا ویڈیو\n2️⃣ اپنا لیسن پلان (PDF یا ٹیکسٹ)",
              ar: "✅ حسناً! نبدأ من جديد.\n\nلبدء جلسة تدريب جديدة، يرجى إرسال:\n1️⃣ صوت أو فيديو الفصل الدراسي\n2️⃣ خطة الدرس (PDF أو نص)",
              es: "✅ ¡De acuerdo! Empecemos de nuevo.\n\nPara comenzar una nueva sesión de coaching, envíame:\n1️⃣ Tu audio o video del aula\n2️⃣ Tu plan de lección (PDF o texto)"
            };

            await WhatsAppService.sendMessage(from, freshMessages[responseLanguage] || freshMessages.en);
            return;
          } else if (choice === '3') {
            // Ignore/archive
            typingController.stop();
            await redis.del(expectingRecoveryKey);

            logToFile('📦 User chose to ignore/archive stuck session', { sessionId: stuckSessionId });

            await supabase
              .from('coaching_sessions')
              .update({ status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', stuckSessionId);

            const ignoreMessages = {
              en: "✅ Got it! I've archived that session. What would you like to do now?",
              ur: "✅ سمجھ گئی! میں نے اس سیشن کو آرکائیو کر دیا۔ اب آپ کیا کرنا چاہتے ہیں؟",
              ar: "✅ فهمت! لقد أرشفت تلك الجلسة. ماذا تريد أن تفعل الآن؟",
              es: "✅ ¡Entendido! He archivado esa sesión. ¿Qué te gustaría hacer ahora?"
            };

            await WhatsAppService.sendMessage(from, ignoreMessages[responseLanguage] || ignoreMessages.en);
            return;
          } else {
            // Invalid choice - ask again
            typingController.stop();
            const clarificationMessages = {
              en: "I didn't quite understand. Please reply with *1*, *2*, or *3*:",
              ur: "میں سمجھ نہیں پائی۔ براہ کرم *1*، *2*، یا *3* سے جواب دیں:",
              ar: "لم أفهم تماماً. يرجى الرد بـ *1* أو *2* أو *3*:",
              es: "No entendí bien. Por favor responde con *1*, *2* o *3*:"
            };

            await WhatsAppService.sendMessage(from, clarificationMessages[responseLanguage] || clarificationMessages.en);
            return;
          }
        }
      }
    } catch (error) {
      logToFile('Error checking recovery prompt response', { error: error.message });
    }
  }

  // ============================================================
  // MENU SYSTEM INTEGRATION
  // ============================================================

  // Check for /menu command
  if (messageBody === '/menu' || messageBody.toLowerCase() === '/menu') {
    logToFile('📋 Menu command detected');
    typingController.stop();

    if (user && sessionId) {
      // Store user's menu request
      await storeConversation(user.id, 'user', messageBody, 'text', sessionId);
      await MenuService.sendMenu(from, user.id, sessionId);
    } else {
      const fallbackMsg = "Please complete registration first. Type /register to get started.";
      await WhatsAppService.sendMessage(from, fallbackMsg);
    }
    return; // Exit early
  }

  // Check for /register command
  if (messageBody === '/register' || messageBody.toLowerCase() === '/register') {
    logToFile('📝 Register command detected');
    typingController.stop();

    // Check if user is already registered (has first_name)
    if (user?.first_name) {
      await WhatsAppService.sendMessage(from, `✅ You're already registered, ${user.first_name}! What would you like to do next?`);
      return;
    }

    // BUG-002 FIX: Check if user has features but missed registration (recovery path)
    // This handles users who used features but never got asked for name
    if (user?.id) {
      const featureCount = await FeatureRegistrationService.countUserFeatures(user.id);
      logToFile('📝 BUG-002: Checking feature count for recovery registration', {
        userId: user.id,
        featureCount,
        phoneNumber: from
      });

      if (featureCount > 0) {
        // User has features but never got registered - trigger recovery registration
        logToFile('📝 BUG-002: Triggering recovery registration for user with features', {
          userId: user.id,
          featureCount,
          phoneNumber: from
        });

        await FeatureRegistrationService.sendNameQuestion(
          user.id,
          from,
          responseLanguage,
          'text'
        );
        return;
      }
    }

    // New registration happens after first feature completion
    // Guide user to use a feature instead (only for users with 0 features)
    const guideMessages = {
      en: "I'll ask for your name after you try one of my features! You can:\n\n• Request a *lesson plan* - just tell me a topic\n• Start a *reading assessment* - type /reading test\n• Get *coaching feedback* - send me your classroom audio\n• Create a *video* - type /video\n\nWhat would you like to try?",
      ur: "میں آپ کا نام پوچھوں گی جب آپ میری کوئی feature استعمال کریں گے!\n\n• *لیسن پلان* کی درخواست کریں - بس موضوع بتائیں\n• *ریڈنگ ٹیسٹ* شروع کریں - /reading test ٹائپ کریں\n• *کوچنگ فیڈبیک* حاصل کریں - اپنی کلاس کی آڈیو بھیجیں\n• *ویڈیو* بنائیں - /video ٹائپ کریں\n\nآپ کیا آزمانا چاہیں گے؟"
    };

    await WhatsAppService.sendMessage(from, guideMessages[responseLanguage] || guideMessages.en);
    return; // Exit early
  }

  // Check for /language command (December 2025 - Language Expansion)
  if (messageBody === '/language' || messageBody.toLowerCase() === '/language') {
    logToFile('🌐 Language command detected');
    typingController.stop();

    // Check if user is in an active coaching session
    if (sessionId && user?.id) {
      const sessionType = await redisService.get(`session:${sessionId}:type`);
      if (sessionType === 'coaching' || sessionType === 'coaching_active') {
        // Block language change during coaching session
        const blockMessage = responseLanguage === 'ur'
          ? '⚠️ آپ ابھی کوچنگ سیشن میں ہیں۔ سیشن ختم ہونے کے بعد زبان تبدیل کر سکتے ہیں۔'
          : 'You can change language after the coaching session completes.';
        await WhatsAppService.sendMessage(from, blockMessage);
        return;
      }
    }

    // Send language selection interactive list
    await WhatsAppService.sendLanguageSelectionList(from, responseLanguage);
    return; // Exit early
  }

  // ============================================================
  // ATTENDANCE SYSTEM INTEGRATION (bd-060)
  // ============================================================
  // Check if user is in an active attendance session
  if (user?.id) {
    try {
      const isInAttendanceSession = await AttendanceConversationService.isInAttendanceSession(user.id);

      if (isInAttendanceSession) {
        logToFile('📋 User in active attendance session, routing message', { userId: user.id });

        // Get current session state
        const sessionState = await AttendanceConversationService.getSessionState(user.id);

        // Handle cancel command
        if (messageBody.toLowerCase() === 'cancel' || messageBody.toLowerCase() === 'منسوخ') {
          typingController.stop();
          const result = await AttendanceConversationService.cancelSession(user.id);
          await WhatsAppService.sendMessage(from, result.message);
          return;
        }

        let result;

        // Route based on current state
        switch (sessionState.state) {
          case AttendanceConversationService.STATES.AWAITING_CLASS_SELECTION:
            result = await AttendanceConversationService.handleClassSelection(user.id, messageBody);
            break;

          case AttendanceConversationService.STATES.AWAITING_MARKING_METHOD:
            // Check for "everyone present" shortcut
            const everyonePresentKeywords = ['everyone present', 'all present', 'سب حاضر', 'سب موجود', '3'];
            if (everyonePresentKeywords.some(kw => messageBody.toLowerCase().includes(kw))) {
              result = await AttendanceConversationService.handleEveryonePresent(user.id);
            } else {
              result = await AttendanceConversationService.handleMarkingMethodSelection(user.id, messageBody);
            }
            break;

          case AttendanceConversationService.STATES.AWAITING_VOICE_INPUT:
            // User sent text when expecting voice - prompt them
            result = {
              action: 'PROMPT_VOICE',
              message: 'Please send a *voice message* with your roll call.\n\nOr reply "2" to switch to Tap to Mark.'
            };
            // Allow switching to tap method
            if (messageBody === '2' || messageBody.toLowerCase().includes('tap')) {
              result = await AttendanceConversationService.handleMarkingMethodSelection(user.id, '2');
            }
            break;

          case AttendanceConversationService.STATES.AWAITING_VERIFICATION:
            // User is verifying attendance results (yes/edit/cancel)
            result = await AttendanceConversationService.handleVerificationResponse(user.id, messageBody);
            break;

          case AttendanceConversationService.STATES.AWAITING_DATE_SELECTION:
            // User selecting date for attendance (bd-065)
            result = await AttendanceConversationService.handleDateSelection(user.id, messageBody);
            break;

          case AttendanceConversationService.STATES.AWAITING_SESSION_TYPE:
            // User selecting AM/PM session type (bd-066)
            result = await AttendanceConversationService.handleSessionTypeSelection(user.id, messageBody);
            break;

          case AttendanceConversationService.STATES.IDLE:
          case AttendanceConversationService.STATES.COMPLETED:
            // Session is idle or completed - restart fresh
            logToFile('📋 Attendance session idle/completed, restarting', { userId: user.id, state: sessionState.state });
            await AttendanceConversationService.clearSessionState(user.id);
            result = await AttendanceConversationService.startAttendanceSession(user.id);
            break;

          case AttendanceConversationService.STATES.PROCESSING:
            // Check if processing has timed out (bd-190)
            if (AttendanceConversationService.isProcessingTimedOut(sessionState)) {
              logToFile('⚠️ Processing timeout detected, clearing stuck state', { userId: user.id, processingStartedAt: sessionState.processingStartedAt });
              await AttendanceConversationService.clearSessionState(user.id);
              result = {
                action: 'ERROR',
                message: 'Your previous attendance session timed out. Say "attendance" to start a new one.'
              };
            } else {
              // Still processing - ask user to wait
              result = {
                action: 'PROCESSING',
                message: 'Your attendance is being processed. Please wait a moment...'
              };
            }
            break;

          default:
            // Unknown state - log and restart
            logToFile('⚠️ Unknown attendance state, clearing session', { userId: user.id, state: sessionState?.state });
            await AttendanceConversationService.clearSessionState(user.id);
            result = {
              action: 'ERROR',
              message: 'Something went wrong with attendance. Say "attendance" to start again.'
            };
        }

        typingController.stop();

        // Handle the result
        if (result.action === 'ASK_MARKING_METHOD' || result.action === 'ASK_CLASS_SELECTION') {
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'AWAIT_VOICE_INPUT' || result.action === 'PROMPT_VOICE') {
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'SEND_MARKING_FLOW') {
          // Send the WhatsApp Flow for marking attendance (bd-186: encryption endpoint implemented)
          if (ATTENDANCE_MARKING_FLOW_ID) {
            const sessionState = await AttendanceConversationService.getSessionState(user.id);
            const today = new Date().toISOString().split('T')[0];
            // Flow token format: userId:classId:date:sessionType:className - all data for response handling (bd-193)
            const sessionType = sessionState?.selectedSession || 'morning';
            const className = result.selectedClass?.class_name || 'Class';
            const section = result.selectedClass?.section || '';
            const flowToken = `${user.id}:${sessionState?.selectedListId}:${today}:${sessionType}:${encodeURIComponent(className)}`;
            // bd-198: Dynamic header with class + section (e.g., "5A Attendance")
            const displayName = section ? `${className}${section}` : className;

            await WhatsAppService.sendFlow(from, {
              flowId: ATTENDANCE_MARKING_FLOW_ID,
              header: `📋 ${displayName} Attendance`,
              body: result.message,
              buttonText: 'Mark Attendance',
              // Note: Don't specify screen for data_api_version 3.0+ flows with endpoint
              // The endpoint determines first screen via INIT response (bd-191)
              flowToken: flowToken
            });
            logToFile('📋 Sent attendance marking flow', {
              userId: user.id,
              flowId: ATTENDANCE_MARKING_FLOW_ID,
              classId: sessionState?.selectedListId,
              studentCount: result.students?.length,
              className: className
            });
          } else {
            // Fallback if flow not configured
            await WhatsAppService.sendMessage(from, 'The marking form is not configured. Please use voice marking instead.\n\nSay something like: "Everyone is here except Ali and Sara"');
            logToFile('⚠️ ATTENDANCE_MARKING_FLOW_ID not configured', { userId: user.id });
          }
        } else if (result.action === 'GENERATE_ATTENDANCE') {
          // Send initial "generating" message
          await WhatsAppService.sendMessage(from, result.message);

          // Generate, upload, and deliver Excel (bd-063)
          try {
            const sessionState = await AttendanceConversationService.getSessionState(user.id);
            const deliveryResult = await AttendanceDeliveryService.processAndDeliver(
              user.id,
              from,
              {
                selectedClass: result.selectedClass,
                selectedListId: sessionState?.selectedListId,
                records: result.records,
                summary: sessionState?.summary,
                transcript: sessionState?.transcript,
                markingMethod: sessionState?.markingMethod || 'voice'
              }
            );

            if (!deliveryResult.success) {
              // bd-190: Clear state on delivery failure to prevent stuck PROCESSING
              await AttendanceConversationService.clearSessionState(user.id);
              logToFile('📋 Cleared session state after delivery failure', { userId: user.id, error: deliveryResult.error });
              await WhatsAppService.sendMessage(from, `Sorry, there was an error generating your attendance file: ${deliveryResult.error}\n\nSay "attendance" to try again.`);
            } else {
              // bd-190: Clear state on successful completion
              await AttendanceConversationService.clearSessionState(user.id);
              logToFile('📋 Cleared session state after successful delivery', { userId: user.id });
            }
          } catch (deliveryError) {
            // bd-190: Clear state on exception to prevent stuck PROCESSING
            await AttendanceConversationService.clearSessionState(user.id);
            logToFile('Attendance delivery error - state cleared', { error: deliveryError.message, userId: user.id });
            await WhatsAppService.sendMessage(from, 'Sorry, something went wrong delivering your attendance file. Say "attendance" to try again.');
          }
        } else if (result.action === 'VERIFY_ATTENDANCE') {
          // Verification message already sent by handleVoiceInput
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'SESSION_CANCELLED') {
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'INVALID_SELECTION' || result.action === 'INVALID_STATE') {
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'PROCESSING') {
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'SESSION_COMPLETED') {
          await WhatsAppService.sendMessage(from, result.message);
        } else if (result.action === 'ERROR') {
          await WhatsAppService.sendMessage(from, result.message);
        }

        return; // Exit early - handled by attendance system
      }
    } catch (error) {
      logToFile('Error checking attendance session', { error: error.message, userId: user?.id });
      // Continue with normal flow if attendance check fails
    }
  }

  // ============================================================
  // ADD CLASS DETECTION (bd-205)
  // Check BEFORE attendance - triggers setup flow even with existing classes
  // ============================================================
  const addClassDetection = AttendanceDetectorService.detectAddClassIntent(messageBody);
  if (user?.id && addClassDetection.detected) {
    logToFile('📋 Add class keyword detected', { userId: user.id, keyword: addClassDetection.keyword });
    typingController.stop();

    if (ATTENDANCE_SETUP_FLOW_ID) {
      await WhatsAppService.sendFlow(from, {
        flowId: ATTENDANCE_SETUP_FLOW_ID,
        header: '📋 Add New Class',
        body: "Let's set up a new class for attendance tracking!",
        buttonText: 'Add Class',
        screen: 'CLASS_INFO',
        flowToken: user.id  // Pass user ID so endpoint can create class for correct user
      });
      logToFile('📋 Sent add class flow', { userId: user.id, flowId: ATTENDANCE_SETUP_FLOW_ID });
    } else {
      await WhatsAppService.sendMessage(from, 'Sorry, class setup is not available right now. Please try again later.');
      logToFile('⚠️ ATTENDANCE_SETUP_FLOW_ID not configured', { userId: user.id });
    }
    return;
  }

  // Check for attendance keyword trigger
  const attendanceDetection = AttendanceDetectorService.detectAttendanceIntent(messageBody);
  if (user?.id && attendanceDetection.detected) {
    logToFile('📋 Attendance keyword detected, starting session', { userId: user.id, message: messageBody, confidence: attendanceDetection.confidence });
    typingController.stop();

    try {
      const result = await AttendanceConversationService.startAttendanceSession(user.id);

      if (result.action === 'SEND_SETUP_FLOW') {
        // User has no classes - send setup flow
        if (ATTENDANCE_SETUP_FLOW_ID) {
          // Send the WhatsApp Flow for class setup
          await WhatsAppService.sendFlow(from, {
            flowId: ATTENDANCE_SETUP_FLOW_ID,
            header: '📋 Class Setup',
            body: result.message,
            buttonText: 'Set Up Class',
            screen: 'CLASS_INFO',
            flowToken: user.id  // Pass user ID so endpoint can create class for correct user
          });
          logToFile('📋 Sent attendance setup flow', { userId: user.id, flowId: ATTENDANCE_SETUP_FLOW_ID });
        } else {
          // Fallback if flow not configured - just send the message
          await WhatsAppService.sendMessage(from, result.message);
          logToFile('⚠️ ATTENDANCE_SETUP_FLOW_ID not configured, sent text message instead', { userId: user.id });
        }
      } else if (result.action === 'ASK_CLASS_SELECTION' || result.action === 'ASK_MARKING_METHOD') {
        await WhatsAppService.sendMessage(from, result.message);
      } else if (result.action === 'ERROR') {
        await WhatsAppService.sendMessage(from, result.message);
      }

      return; // Exit early - handled by attendance system
    } catch (error) {
      logToFile('Error starting attendance session', { error: error.message, userId: user?.id });
      await WhatsAppService.sendMessage(from, 'Sorry, something went wrong. Please try again.');
      return;
    }
  }

  // ============================================================
  // REGISTRATION KEYWORD DETECTION
  // ============================================================
  const registrationKeywords = ['register', 'registration', 'sign up', 'رجسٹر', 'تسجيل', 'registrar'];
  const registrationRequested = registrationKeywords.some(kw =>
    messageBody.toLowerCase().includes(kw.toLowerCase())
  );

  if (registrationRequested) {
    typingController.stop();

    // Check if user is already registered
    if (user?.first_name) {
      // User already registered - confirm and guide to menu
      await WhatsAppService.sendMessage(from, `✅ You're already registered, ${user.first_name}! Type /menu to see what I can help you with.`);
      return;
    }

    // BUG-002 FIX: Check if user has features but missed registration (recovery path)
    if (user?.id) {
      const featureCount = await FeatureRegistrationService.countUserFeatures(user.id);

      if (featureCount > 0) {
        // User has features but never got registered - trigger recovery registration
        logToFile('📝 BUG-002: Recovery registration for user with features', {
          userId: user.id,
          featureCount,
          phoneNumber: from
        });

        await FeatureRegistrationService.sendNameQuestion(
          user.id,
          from,
          responseLanguage,
          'text'
        );
        return;
      }
    }

    // User has no features - guide them to use a feature first
    logToFile('🔐 User requested registration via keyword - guiding to features', { userId: user?.id, keyword: messageBody });

    const guideMessages = {
      en: "I'll ask for your name after you try one of my features! You can:\n\n• Request a *lesson plan* - just tell me a topic\n• Start a *reading assessment* - type /reading test\n• Get *coaching feedback* - send me your classroom audio\n• Create a *video* - type /video\n\nWhat would you like to try?",
      ur: "میں آپ کا نام پوچھوں گی جب آپ میری کوئی feature استعمال کریں گے!\n\n• *لیسن پلان* کی درخواست کریں - بس موضوع بتائیں\n• *ریڈنگ ٹیسٹ* شروع کریں - /reading test ٹائپ کریں\n• *کوچنگ فیڈبیک* حاصل کریں - اپنی کلاس کی آڈیو بھیجیں\n• *ویڈیو* بنائیں - /video ٹائپ کریں\n\nآپ کیا آزمانا چاہیں گے؟"
    };

    await WhatsAppService.sendMessage(from, guideMessages[responseLanguage] || guideMessages.en);
    return;
  }

  // ============================================================
  // CAPABILITY INQUIRY DETECTION
  // ⚠️ ADDING A NEW FEATURE? Update shared/config/capabilities.config.js
  // ============================================================
  try {
    const capabilityCheck = await HelperAgentService.detectCapabilityInquiry(
      messageBody,
      responseLanguage
    );

    if (capabilityCheck.detected) {
      typingController.stop();

      // Send capability guidance
      logToFile('💬 Capability inquiry detected, sending guidance', {
        userMessage: messageBody,
        language: responseLanguage
      });

      // Store user's capability inquiry and bot's response
      if (user && sessionId) {
        await storeConversation(user.id, 'user', messageBody, 'text', sessionId);
        await WhatsAppService.sendMessage(from, capabilityCheck.guidanceMessage);
        await storeConversation(user.id, 'assistant', capabilityCheck.guidanceMessage, 'text', sessionId);
      } else {
        await WhatsAppService.sendMessage(from, capabilityCheck.guidanceMessage);
      }
      return; // Exit early
    }
  } catch (error) {
    logToFile('⚠️ Error in capability detection', {
      error: error.message,
      userMessage: messageBody
    });
    // Continue to normal flow if capability detection fails
  }

  // Get current conversation state to check for menu flows
  // Issue #41 FIX: Read from correct column (current_state VARCHAR, not conversation_state JSONB)
  let conversationState = null;
  if (user && sessionId) {
    try {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('current_state')  // Issue #41 FIX: Correct column name
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      conversationState = conversation?.current_state || null;  // Issue #41 FIX: VARCHAR, not nested JSONB
      logToFile('Conversation state retrieved', { state: conversationState });
    } catch (error) {
      if (error.code !== 'PGRST116') { // Ignore "no rows found"
        logToFile('⚠️ Error retrieving conversation state', { error: error.message });
      }
    }
  }

  // Handle menu choice (1-4)
  if (conversationState === 'AWAITING_MENU_CHOICE' && user && sessionId) {
    const choice = messageBody.trim();
    if (['1', '2', '3', '4'].includes(choice)) {
      logToFile('📋 Menu choice detected', { choice });
      typingController.stop();

      await MenuService.handleMenuChoice(
        choice,
        user.id,
        sessionId,
        from,
        'text', // messageFormat
        responseLanguage
      );
      return; // Exit early
    } else {
      // Invalid menu choice - use Helper Agent to guide user
      logToFile('⚠️  Invalid menu choice', { choice: messageBody });
      typingController.stop();

      const escapeMessage = HelperAgentService.getEscapePathMessage('AWAITING_MENU_CHOICE', responseLanguage);
      await WhatsAppService.sendMessage(from, escapeMessage);
      return; // Don't fall through to intent detection
    }
  }

  // Handle AWAITING_CLASSROOM_AUDIO state (user sent text instead of audio)
  if (conversationState === 'AWAITING_CLASSROOM_AUDIO' && user && sessionId) {
    // Check for /menu escape command
    if (messageBody.toLowerCase() === '/menu') {
      logToFile('📋 User requesting menu from classroom audio state');
      typingController.stop();
      await MenuService.sendMenu(from, user.id, sessionId);
      return;
    }

    // User sent text when we're expecting audio - provide helpful guidance
    logToFile('⚠️  User sent text while awaiting classroom audio');
    typingController.stop();

    const escapeMessage = HelperAgentService.getEscapePathMessage('AWAITING_CLASSROOM_AUDIO', responseLanguage);
    await WhatsAppService.sendMessage(from, escapeMessage);
    return; // Don't process text as general conversation
  }

  // Handle video topic request (Issue #28: Route to AI Video Generation)
  // Support both old state name (AWAITING_MEDIA_LIBRARY_QUERY) and new (AWAITING_VIDEO_TOPIC) for transition
  if ((conversationState === 'AWAITING_VIDEO_TOPIC' || conversationState === 'AWAITING_MEDIA_LIBRARY_QUERY') && user && sessionId) {
    // Check for /menu escape command
    if (messageBody.toLowerCase() === '/menu') {
      logToFile('📋 User requesting menu from video topic state');
      typingController.stop();
      await MenuService.sendMenu(from, user.id, sessionId);
      return;
    }

    logToFile('🎬 Video topic received - routing to AI video generation');
    typingController.stop();

    // Route to AI video generation with user's topic
    await VideoOrchestrator.initiateVideoRequest(user, from, sessionId, responseLanguage, messageBody.trim());

    // Clear the awaiting state
    try {
      await supabase.from('sessions').update({ conversation_state: null }).eq('id', sessionId);
    } catch (error) {
      logToFile('⚠️ Failed to clear conversation state', { error: error.message });
    }

    return; // Exit early
  }

  // ============================================================
  // INTEGRATION POINT 3: KEYWORD DETECTION FOR FEATURE VIDEOS
  // Check if message contains feature keywords and offer intro video
  // This happens BEFORE intent detection to catch general questions
  // ============================================================
  if (user) {
    try {
      const FeatureKeywordDetectorService = require('../services/feature-keyword-detector.service');
      const keywordHandled = await FeatureKeywordDetectorService.detectAndOfferVideo(
        messageBody,
        user.id,
        from,
        responseLanguage
      );

      if (keywordHandled) {
        logToFile('🎯 Keyword detection handled - stopping normal flow', { userId: user.id });
        return; // Stop processing - consent buttons were sent
      }
    } catch (error) {
      logToFile('⚠️ Error in keyword detection (non-blocking)', { error: error.message });
      // Continue with normal flow on error
    }
  }

  // ============================================================
  // VIDEO GENERATION NATURAL LANGUAGE DETECTION (All 9 Languages)
  // Detects "make me a video", "create video", etc. in supported languages
  // MUST come BEFORE intent detection to differentiate from video search
  // ============================================================
  if (user) {
    const videoGenerationKeywords = [
      // English
      'make me a video', 'create a video', 'generate video', 'generate a video',
      'make video about', 'make a video about', 'create video about',
      // Urdu
      'ویڈیو بناؤ', 'ویڈیو بنا دو', 'mujhe video', 'ویڈیو چاہیے', 'video bana do',
      'video banao', 'mujhe video bana do', 'meri video bana do',
      // Arabic
      'أنشئ فيديو', 'اصنع فيديو', 'اعمل فيديو', 'فيديو عن',
      // Spanish
      'hacer un video', 'crear video', 'generar video', 'hazme un video',
      'crea un video', 'haz un video sobre',
      // Punjabi
      'ویڈیو بنا', 'ویڈیو بناؤ جی', 'video bana ji',
      // Sindhi
      'وڊيو ٺاھيو', 'وڊيو بڻايو',
      // Pashto
      'ویډیو جوړه کړه', 'ویډیو جوړ کړه',
      // Balochi
      'ویڈیو بناء',
      // Tamil
      'வீடியோ உருவாக்கு', 'வீடியோ செய்'
    ];

    const messageBodyLower = messageBody.toLowerCase();
    const videoGenerationRequested = videoGenerationKeywords.some(kw =>
      messageBodyLower.includes(kw.toLowerCase())
    );

    if (videoGenerationRequested) {
      logToFile('🎬 Video GENERATION request detected via natural language', {
        userId: user.id,
        message: messageBody.substring(0, 100)
      });

      typingController.stop();

      // Extract topic from message using GPT
      const topic = await VideoOrchestrator.extractTopicFromMessage(messageBody, responseLanguage);

      await VideoOrchestrator.initiateVideoRequest(user, from, sessionId, responseLanguage, topic);
      return; // Stop further processing
    }
  }

  // ============================================================
  // Issue #57 FIX: CHECK LESSON PLAN STATE FROM MENU
  // If user clicked "Lesson Planning" from menu, their next message
  // is the topic - route directly to lesson plan, skip intent detection
  // ============================================================
  if (user) {
    const MenuService = require('../services/menu.service');
    const lessonPlanState = await MenuService.checkAwaitingLessonPlanTopic(user.id);

    if (lessonPlanState) {
      logToFile('📚 User provided lesson plan topic from menu', {
        userId: user.id,
        topic: messageBody,
        sessionId: lessonPlanState.sessionId
      });

      typingController.stop();

      // Clear the state
      await MenuService.clearAwaitingLessonPlanTopic(user.id);

      // Curriculum pre-gen intercept (no-op unless the region enables it)
      if (await tryCurriculumLessonPlanServe(from, messageBody, user, lessonPlanState.language)) {
        return; // curriculum pre-generated LP served instantly
      }

      // Route directly to lesson plan handler (skip intent detection)
      await handleLessonPlanRequest(from, messageBody, user, lessonPlanState.sessionId, lessonPlanState.language, typingController);
      return; // Stop further processing
    }
  }

  // Detect intent (lesson plan, presentation, or general)
  const intent = await OpenAIService.detectIntent(messageBody);
  logToFile('Intent detected', { intent: intent.type });

  // Update session type based on intent
  if (sessionId && intent.type !== 'general') {
    try {
      await updateSessionType(sessionId, intent.type);
      logToFile('✅ Session type updated', { sessionType: intent.type });
    } catch (error) {
      logToFile('⚠️ Failed to update session type', { error: error.message });
    }
  }

  if (intent.type === 'lesson_plan') {
    // Curriculum pre-gen intercept (no-op unless the region enables it)
    if (await tryCurriculumLessonPlanServe(from, messageBody, user, responseLanguage)) {
      return; // curriculum pre-generated LP served instantly
    }
    await handleLessonPlanRequest(from, messageBody, user, sessionId, responseLanguage, typingController);
  } else if (intent.type === 'presentation') {
    await handlePresentationRequest(from, messageBody, user, sessionId, responseLanguage, typingController);
  } else if (intent.type === 'video') {
    // Route to AI video generation (same as /video command) - Issue #28
    typingController.stop();
    const topic = await VideoOrchestrator.extractTopicFromMessage(messageBody, responseLanguage);
    await VideoOrchestrator.initiateVideoRequest(user, from, sessionId, responseLanguage, topic);
  } else {
    await handleGeneralConversation(from, messageBody, user, sessionId, responseLanguage, typingController);
  }
  } finally {
    // CRITICAL: Always stop typing indicator, even if function exits early or throws
    typingController.stop();
  }
}

/**
 * Handle lesson plan request
 * @param {string} from - Sender phone number
 * @param {string} messageBody - Message text
 * @param {Object|null} user - User object from database
 * @param {string|null} sessionId - Session ID
 * @param {string} responseLanguage - User's preferred language ('en', 'ur', 'ar', 'es')
 * @param {Object} typingController - Typing indicator controller
 * @returns {Promise<void>}
 */
async function handleLessonPlanRequest(from, messageBody, user, sessionId, responseLanguage, typingController) {
  try {
    // Multi-language message maps
    const lessonPlanMessages = {
      en: {
        preparing: "I'm preparing a detailed five-step lesson plan for you. Please wait a moment...",
        successWithPdf: (topic) => `✅ Your lesson plan is ready!\n\nTopic: ${topic}\n\nThis five-step lesson plan is ready for use in your classroom.`,
        successWithoutPdf: (topic, url) => `✅ Your lesson plan is ready!\n\n📊 Topic: ${topic}\n\n🔗 Link: ${url}\n\nNote: PDF is not available. Please view from the Gamma link.`,
        error: "Sorry, there was an error creating the lesson plan. Please try again."
      },
      ur: {
        preparing: 'میں آپ کے لیے ایک تفصیلی پانچ مرحلہ سبق کا منصوبہ تیار کر رہی ہوں۔ براہ کرم تھوڑا انتظار کریں...',
        successWithPdf: (topic) => `✅ آپ کا سبق کا منصوبہ تیار ہے!\n\nموضوع: ${topic}\n\nیہ پانچ مرحلہ سبق کا منصوبہ آپ کی کلاس میں استعمال کے لیے تیار ہے۔`,
        successWithoutPdf: (topic, url) => `✅ آپ کا سبق کا منصوبہ تیار ہے!\n\n📊 موضوع: ${topic}\n\n🔗 لنک: ${url}\n\nنوٹ: PDF دستیاب نہیں ہے۔ براہ کرم Gamma لنک سے دیکھیں۔`,
        error: 'معذرت، سبق کا منصوبہ بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔'
      },
      ar: {
        preparing: "أقوم بإعداد خطة درس مفصلة من خمس خطوات لك. يرجى الانتظار لحظة...",
        successWithPdf: (topic) => `✅ خطة الدرس جاهزة!\n\nالموضوع: ${topic}\n\nخطة الدرس هذه من خمس خطوات جاهزة للاستخدام في فصلك.`,
        successWithoutPdf: (topic, url) => `✅ خطة الدرس جاهزة!\n\n📊 الموضوع: ${topic}\n\n🔗 الرابط: ${url}\n\nملاحظة: ملف PDF غير متوفر. يرجى العرض من رابط Gamma.`,
        error: "عذرًا، حدث خطأ في إنشاء خطة الدرس. يرجى المحاولة مرة أخرى."
      },
      es: {
        preparing: "Estoy preparando un plan de lección detallado de cinco pasos para ti. Por favor espera un momento...",
        successWithPdf: (topic) => `✅ ¡Tu plan de lección está listo!\n\nTema: ${topic}\n\nEste plan de lección de cinco pasos está listo para usar en tu clase.`,
        successWithoutPdf: (topic, url) => `✅ ¡Tu plan de lección está listo!\n\n📊 Tema: ${topic}\n\n🔗 Enlace: ${url}\n\nNota: PDF no disponible. Por favor ver desde el enlace de Gamma.`,
        error: "Lo siento, hubo un error al crear el plan de lección. Por favor intenta de nuevo."
      }
    };

    // Get messages for user's language, fallback to English
    const messages = lessonPlanMessages[responseLanguage] || lessonPlanMessages.en;

    // Send loading sticker (stop typing indicator first)
    try {
      typingController.stop();
      if (LOADING_STICKER_MEDIA_ID) {
        // Use cached media ID for instant sending
        await WhatsAppService.sendSticker(from, LOADING_STICKER_MEDIA_ID);
      } else {
        // Fallback: Upload sticker file
        await WhatsAppService.sendSticker(from, LOADING_STICKER_PATH);
      }
    } catch (error) {
      logToFile('⚠️ Failed to send loading sticker', { error: error.message });
    }

    // Send acknowledgment in user's language
    await WhatsAppService.sendMessage(from, messages.preparing);

    // Extract topic
    const topic = await OpenAIService.extractTopic(messageBody);
    logToFile('Topic extracted', { topic });

    // Bug #10: Detect explicitly requested language (defaults to 'en')
    const contentLanguage = detectRequestedLanguage(messageBody);
    logToFile('Content language detected', { contentLanguage, messageBody: messageBody.substring(0, 100) });

    // Queue lesson plan for async processing (survives server restarts)
    if (user) {
      const requestId = await LessonPlanQueueService.createAndQueue({
        userId: user.id,
        phoneNumber: from,
        topic,
        fullMessage: messageBody,
        language: contentLanguage,
        contentType: 'lesson_plan'
      });

      logToFile('✅ Lesson plan queued for async processing', {
        requestId,
        userId: user.id,
        topic
      });

      // Store acknowledgment in conversations
      try {
        await storeConversation(user.id, 'assistant', messages.preparing, 'text', sessionId);
      } catch (error) {
        logToFile('⚠️ Failed to store acknowledgment', { error: error.message });
      }
    } else {
      // Fallback for users without account (shouldn't happen normally)
      logToFile('⚠️ Cannot queue lesson plan - no user account', { from });
      await WhatsAppService.sendMessage(from, messages.error);
    }
  } catch (error) {
    logToFile('❌ Error processing lesson plan request', {
      error: error.message,
      stack: error.stack
    });
    typingController.stop(); // Stop typing indicator before sending error message

    // Get error message in user's language
    const errorMessages = {
      en: "Sorry, there was an error creating the lesson plan. Please try again.",
      ur: 'معذرت، سبق کا منصوبہ بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔',
      ar: "عذرًا، حدث خطأ في إنشاء خطة الدرس. يرجى المحاولة مرة أخرى.",
      es: "Lo siento, hubo un error al crear el plan de lección. Por favor intenta de nuevo."
    };

    await WhatsAppService.sendMessage(
      from,
      errorMessages[responseLanguage] || errorMessages.en
    );
  }
}

/**
 * Handle presentation request
 * @param {string} from - Sender phone number
 * @param {string} messageBody - Message text
 * @param {Object|null} user - User object from database
 * @param {string|null} sessionId - Session ID
 * @param {string} responseLanguage - User's preferred language ('en', 'ur', 'ar', 'es')
 * @param {Object} typingController - Typing indicator controller
 * @returns {Promise<void>}
 */
async function handlePresentationRequest(from, messageBody, user, sessionId, responseLanguage, typingController) {
  try {
    // Multi-language message maps
    const presentationMessages = {
      en: {
        preparing: "I'm preparing an educational presentation for you. Please wait a moment...",
        successWithPdf: (topic) => `✅ Your presentation is ready!\n\n📊 Topic: ${topic}\n\nThis presentation is ready for use in your classroom.`,
        successWithoutPdf: (topic, url) => `✅ Your presentation is ready!\n\n📊 Topic: ${topic}\n\n🔗 Link: ${url}\n\nNote: PDF is not available. Please view from the Gamma link.`,
        error: "Sorry, there was an error creating the presentation. Please try again."
      },
      ur: {
        preparing: 'میں آپ کے لیے ایک تعلیمی پریزنٹیشن تیار کر رہی ہوں۔ براہ کرم تھوڑا انتظار کریں...',
        successWithPdf: (topic) => `✅ آپ کی پریزنٹیشن تیار ہے!\n\n📊 موضوع: ${topic}\n\nیہ پریزنٹیشن آپ کی کلاس میں استعمال کے لیے تیار ہے۔`,
        successWithoutPdf: (topic, url) => `✅ آپ کی پریزنٹیشن تیار ہے!\n\n📊 موضوع: ${topic}\n\n🔗 لنک: ${url}\n\nنوٹ: PDF دستیاب نہیں ہے۔ براہ کرم Gamma لنک سے دیکھیں۔`,
        error: 'معذرت، پریزنٹیشن بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔'
      },
      ar: {
        preparing: "أقوم بإعداد عرض تقديمي تعليمي لك. يرجى الانتظار لحظة...",
        successWithPdf: (topic) => `✅ العرض التقديمي جاهز!\n\n📊 الموضوع: ${topic}\n\nهذا العرض التقديمي جاهز للاستخدام في فصلك.`,
        successWithoutPdf: (topic, url) => `✅ العرض التقديمي جاهز!\n\n📊 الموضوع: ${topic}\n\n🔗 الرابط: ${url}\n\nملاحظة: ملف PDF غير متوفر. يرجى العرض من رابط Gamma.`,
        error: "عذرًا، حدث خطأ في إنشاء العرض التقديمي. يرجى المحاولة مرة أخرى."
      },
      es: {
        preparing: "Estoy preparando una presentación educativa para ti. Por favor espera un momento...",
        successWithPdf: (topic) => `✅ ¡Tu presentación está lista!\n\n📊 Tema: ${topic}\n\nEsta presentación está lista para usar en tu clase.`,
        successWithoutPdf: (topic, url) => `✅ ¡Tu presentación está lista!\n\n📊 Tema: ${topic}\n\n🔗 Enlace: ${url}\n\nNota: PDF no disponible. Por favor ver desde el enlace de Gamma.`,
        error: "Lo siento, hubo un error al crear la presentación. Por favor intenta de nuevo."
      }
    };

    // Get messages for user's language, fallback to English
    const messages = presentationMessages[responseLanguage] || presentationMessages.en;

    // Send loading sticker (stop typing indicator first)
    try {
      typingController.stop();
      if (LOADING_STICKER_MEDIA_ID) {
        // Use cached media ID for instant sending
        await WhatsAppService.sendSticker(from, LOADING_STICKER_MEDIA_ID);
      } else {
        // Fallback: Upload sticker file
        await WhatsAppService.sendSticker(from, LOADING_STICKER_PATH);
      }
    } catch (error) {
      logToFile('⚠️ Failed to send loading sticker', { error: error.message });
    }

    // Send acknowledgment in user's language
    await WhatsAppService.sendMessage(from, messages.preparing);

    // Extract topic
    const topic = await OpenAIService.extractTopic(messageBody);
    logToFile('Topic extracted', { topic });

    // Bug #10: Detect explicitly requested language (defaults to 'en')
    const contentLanguage = detectRequestedLanguage(messageBody);
    logToFile('Content language detected for presentation', { contentLanguage });

    // Queue presentation for async processing (survives server restarts)
    if (user) {
      const requestId = await LessonPlanQueueService.createAndQueue({
        userId: user.id,
        phoneNumber: from,
        topic,
        fullMessage: messageBody,
        language: contentLanguage,
        contentType: 'presentation'
      });

      logToFile('✅ Presentation queued for async processing', {
        requestId,
        userId: user.id,
        topic
      });

      // Store acknowledgment in conversations
      try {
        await storeConversation(user.id, 'assistant', messages.preparing, 'text', sessionId);
      } catch (error) {
        logToFile('⚠️ Failed to store acknowledgment', { error: error.message });
      }
    } else {
      // Fallback for users without account (shouldn't happen normally)
      logToFile('⚠️ Cannot queue presentation - no user account', { from });
      await WhatsAppService.sendMessage(from, messages.error);
    }
  } catch (error) {
    logToFile('❌ Error processing presentation request', {
      error: error.message,
      stack: error.stack
    });
    typingController.stop(); // Stop typing indicator before sending error message

    // Get error message in user's language
    const errorMessages = {
      en: "Sorry, there was an error creating the presentation. Please try again.",
      ur: 'معذرت، پریزنٹیشن بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔',
      ar: "عذرًا، حدث خطأ في إنشاء العرض التقديمي. يرجى المحاولة مرة أخرى.",
      es: "Lo siento, hubo un error al crear la presentación. Por favor intenta de nuevo."
    };

    await WhatsAppService.sendMessage(
      from,
      errorMessages[responseLanguage] || errorMessages.en
    );
  }
}

/**
 * Handle general conversation
 * @param {string} from - Sender phone number
 * @param {string} messageBody - Message text
 * @param {Object|null} user - User object from database
 * @param {string|null} sessionId - Session ID
 * @param {string} responseLanguage - User's preferred language ('en', 'ur', 'ar', 'es')
 * @param {Object} typingController - Typing indicator controller
 * @returns {Promise<void>}
 */
async function handleGeneralConversation(from, messageBody, user, sessionId, responseLanguage, typingController) {
  // Get firstName from user if registered
  const firstName = user?.first_name || null;

  // Phase 2: Conditional Feature Context Injection
  let featureContext = null;
  if (user) {
    const contextCheck = ContextService.shouldInjectContext(messageBody);
    if (contextCheck.shouldInject) {
      logToFile('Phase 2: Context injection triggered', { featureType: contextCheck.featureType, mode: contextCheck.mode });
      featureContext = await ContextService.getUserFeatureContext(user.id, messageBody, contextCheck.mode);
      if (featureContext) {
        logToFile('Phase 2: Feature context retrieved', { contextLength: featureContext.length });
      }
    }
  }

  // Get AI response with format-aware prompting (text format, detected language)
  const aiResponse = await OpenAIService.getResponseWithFormat(
    messageBody,
    user.id, // Use UUID, not phone number - for DB conversation history
    'text', // outputFormat: always text for text messages
    responseLanguage, // outputLanguage: use user's preferred language
    firstName, // firstName: for personalization
    featureContext // Phase 2: Feature context for past work references
  );
  logToFile('AI response generated (format-aware)', { response: aiResponse, language: responseLanguage, firstName });

  // Stop typing indicator before sending reply
  typingController.stop();

  // Send reply
  await WhatsAppService.sendMessage(from, aiResponse);
  logToFile('Text response sent successfully');

  // Store bot response in database with session
  if (user && sessionId) {
    try {
      await storeConversation(
        user.id,
        'assistant',
        aiResponse,
        'text',
        sessionId,
        null, // inputFormat (not applicable for assistant messages)
        null, // inputLanguage (not applicable for assistant messages)
        'text', // outputFormat
        responseLanguage // outputLanguage
      );
      logToFile('✅ Bot response stored in database with session and language');
    } catch (error) {
      logToFile('⚠️ Failed to store bot response', { error: error.message });
    }

    // Show stuck session reminder (non-blocking) if applicable
    await showStuckSessionReminder(from, user.id, responseLanguage);
  }
}

// handleVideoRequest() REMOVED - Issue #28: AI Video Generation replaces Media Library
// Video requests now route to VideoOrchestrator.initiateVideoRequest() in intent handling

// checkAndTriggerRegistration() REMOVED - Feature-based registration replaces turn-based
// Registration now triggers after first feature completion via FeatureRegistrationService

/**
 * Show non-blocking stuck session reminder AFTER user's current request completes
 * Part of pause-and-resume architecture
 *
 * @param {string} from - Sender phone number
 * @param {string} userId - User ID
 * @param {string} language - User's language preference
 * @returns {Promise<void>}
 */
async function showStuckSessionReminder(from, userId, language) {
  try {
    const reminderKey = `user:${userId}:stuck:reminder`;
    const reminderData = await redis.get(reminderKey);

    if (reminderData) {
      const reminder = JSON.parse(reminderData);
      const reminderAge = (new Date() - new Date(reminder.detectedAt)) / (1000 * 60);

      // Only show reminder once, and only if detected within last 24 hours
      if (reminderAge < 1440) { // 24 hours
        await redis.del(reminderKey); // Show once only

        const reminderMessages = {
          en: "📝 By the way, you have an unfinished coaching session from earlier. Would you like to:\n" +
              "1️⃣ Complete it\n" +
              "2️⃣ Start fresh\n" +
              "3️⃣ Ignore (I'll archive it)\n\n" +
              "Reply with 1, 2, or 3",
          ur: "📝 ویسے، آپ کا ایک نامکمل کوچنگ سیشن ہے۔ کیا آپ:\n" +
              "1️⃣ اسے مکمل کرنا چاہتے ہیں\n" +
              "2️⃣ نیا شروع کرنا چاہتے ہیں\n" +
              "3️⃣ نظر انداز کریں (میں اسے آرکائیو کر دوں گی)\n\n" +
              "1، 2، یا 3 سے جواب دیں",
          ar: "📝 بالمناسبة، لديك جلسة تدريب غير مكتملة من وقت سابق. هل تريد:\n" +
              "1️⃣ إكمالها\n" +
              "2️⃣ البدء من جديد\n" +
              "3️⃣ تجاهلها (سأقوم بأرشفتها)\n\n" +
              "رد بـ 1 أو 2 أو 3",
          es: "📝 Por cierto, tienes una sesión de coaching sin terminar. ¿Te gustaría:\n" +
              "1️⃣ Completarla\n" +
              "2️⃣ Empezar de nuevo\n" +
              "3️⃣ Ignorarla (la archivaré)\n\n" +
              "Responde con 1, 2 o 3"
        };

        await WhatsAppService.sendMessage(from, reminderMessages[language] || reminderMessages.en);

        // Set a flag to expect recovery response on NEXT message
        await redis.setex(`user:${userId}:expecting:recovery`, 300, reminder.sessionId); // 5 min expiry

        logToFile('📬 Stuck session reminder sent', {
          userId,
          sessionId: reminder.sessionId,
          language
        });
      }
    }
  } catch (error) {
    logToFile('⚠️ Error showing stuck session reminder', {
      userId,
      error: error.message
    });
  }
}

/**
 * Parse style from carousel button ID
 * Issue #35: Video Style Selection
 * @param {string} buttonId - Button ID like "style_photorealistic"
 * @returns {string} Style name (photorealistic, infographic, cartoon, sketch)
 */
function parseStyleFromButtonId(buttonId) {
  if (!buttonId || typeof buttonId !== 'string') {
    return 'infographic'; // Default
  }

  const validStyles = ['photorealistic', 'infographic', 'cartoon', 'sketch'];
  const stylePart = buttonId.replace('style_', '').toLowerCase();

  if (validStyles.includes(stylePart)) {
    return stylePart;
  }

  return 'infographic'; // Default for invalid IDs
}

module.exports = {
  handleTextMessage,
  parseStyleFromButtonId
};
