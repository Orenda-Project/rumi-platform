// Structured logging - must be first to capture all console.log calls
const { generateCorrelationId, runWithCorrelation } = require('./shared/utils/structured-logger');

require('dotenv').config();
const express = require('express');
const fs = require('fs');

// Import Services
const WhatsAppService = require('./shared/services/whatsapp.service');
const SessionService = require('./shared/services/session.service');
const OpenAIService = require('./shared/services/openai.service');
const CoachingService = require('./shared/services/coaching-orchestrator.service');
const PortalInviteService = require('./shared/services/portal-invite.service');
const ReadingAssessmentService = require('./shared/services/reading-assessment.service');

// Import Handlers
const { handleTextMessage } = require('./shared/handlers/text-message.handler');
const { handleVoiceMessage } = require('./shared/handlers/voice-message.handler');
const { handleImageMessage } = require('./shared/handlers/image-message.handler');
const ExamCheckerHandler = require('./shared/handlers/exam-checker.handler');

// Import Utils
const { logToFile, LOGS_DIR } = require('./shared/utils/logger');
const validators = require('./shared/utils/validators');
const constants = require('./shared/utils/constants');
const { setUserLanguage, setLanguageLock } = require('./shared/utils/language-cache');

// Import Database helpers
const { getOrCreateUser, trackChatStart } = require('./shared/database/bot-helpers');
const supabase = require('./shared/config/supabase');

// Import Routes (bd-186: Flow encryption endpoints)
const flowEndpointRoutes = require('./shared/routes/flow-endpoint.routes');

// Create Express app
const app = express();
app.use(express.json());

// Mount routes (bd-186: Flow encryption endpoints)
app.use('/api/flows', flowEndpointRoutes);

// Create temp directory if it doesn't exist
if (!fs.existsSync(constants.TEMP_DIR)) {
  fs.mkdirSync(constants.TEMP_DIR, { recursive: true });
}

/**
 * Handle broadcast status webhooks (delivered/read notifications)
 * Updates broadcast_messages table with delivery status for tracking
 * @param {Array} statuses - Array of status objects from webhook
 */
async function handleBroadcastStatusWebhook(statuses) {
  for (const status of statuses) {
    try {
      const messageWamid = status.id;
      const newStatus = status.status; // 'sent', 'delivered', 'read', 'failed'
      const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString();

      // BUG-001 FIX: Log failed message statuses with error details
      // Error 131042 (payment issue), 131049 (frequency cap), etc. come here
      if (newStatus === 'failed') {
        const errorCode = status.errors?.[0]?.code || 'unknown';
        const errorTitle = status.errors?.[0]?.title || 'Unknown error';
        const errorMessage = status.errors?.[0]?.message || '';
        logToFile('❌ MESSAGE DELIVERY FAILED', {
          messageWamid,
          errorCode,
          errorTitle,
          errorMessage,
          recipientId: status.recipient_id,
          timestamp,
          fullErrors: status.errors
        });
        // Don't continue - let it fall through to potentially update broadcast_messages if needed
      }

      // Only track delivered and read statuses for broadcasts (not sent/failed)
      if (!['delivered', 'read', 'failed'].includes(newStatus)) {
        continue;
      }

      logToFile('📬 Broadcast status update received', {
        messageWamid,
        status: newStatus,
        timestamp
      });

      // Find the broadcast message by message_id (WhatsApp wamid) and update its status
      const { data: broadcastMessage, error: findError } = await supabase
        .from('broadcast_messages')
        .select('id, broadcast_id, status')
        .eq('message_id', messageWamid)
        .single();

      if (findError || !broadcastMessage) {
        // Not a broadcast message - this is normal for regular messages
        continue;
      }

      // Only update if new status is "higher" than current
      // Status progression: pending → sent → delivered → read
      const statusOrder = { 'pending': 0, 'sent': 1, 'delivered': 2, 'read': 3, 'failed': -1 };
      if (statusOrder[newStatus] <= statusOrder[broadcastMessage.status]) {
        continue; // Don't downgrade status
      }

      // Update the broadcast message status
      const updateFields = { status: newStatus };
      if (newStatus === 'delivered') {
        updateFields.delivered_at = timestamp;
      } else if (newStatus === 'read') {
        updateFields.read_at = timestamp;
      }

      const { error: updateError } = await supabase
        .from('broadcast_messages')
        .update(updateFields)
        .eq('id', broadcastMessage.id);

      if (updateError) {
        logToFile('❌ Failed to update broadcast message status', {
          error: updateError.message,
          messageId: broadcastMessage.id
        });
        continue;
      }

      // Update the count in broadcast_logs using RPC function
      if (newStatus === 'delivered') {
        await supabase.rpc('increment_broadcast_count', {
          p_broadcast_id: broadcastMessage.broadcast_id,
          p_column_name: 'delivered_count'
        });
      } else if (newStatus === 'read') {
        await supabase.rpc('increment_broadcast_count', {
          p_broadcast_id: broadcastMessage.broadcast_id,
          p_column_name: 'read_count'
        });
      }

      logToFile('✅ Broadcast message status updated', {
        messageId: broadcastMessage.id,
        broadcastId: broadcastMessage.broadcast_id,
        newStatus
      });
    } catch (error) {
      logToFile('❌ Error processing broadcast status', {
        error: error.message,
        status
      });
    }
  }
}

/**
 * Track when a user replies after receiving a broadcast
 * Updates broadcast_messages.replied_at and increments replied_count
 * @param {string} userId - User UUID
 */
async function trackBroadcastReply(userId) {
  try {
    // Find any broadcast messages for this user that:
    // 1. Were sent/delivered/read (not pending or failed)
    // 2. Haven't been marked as replied yet
    // 3. Were sent in the last 7 days (reasonable engagement window)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: unrepliedMessages, error: findError } = await supabase
      .from('broadcast_messages')
      .select('id, broadcast_id')
      .eq('user_id', userId)
      .in('status', ['sent', 'delivered', 'read'])
      .is('replied_at', null)
      .gte('sent_at', sevenDaysAgo)
      .limit(10); // Cap to prevent large updates

    if (findError || !unrepliedMessages || unrepliedMessages.length === 0) {
      return; // No unreplied broadcasts to track
    }

    logToFile('📬 User replied after broadcast', {
      userId,
      unrepliedCount: unrepliedMessages.length
    });

    // Mark all as replied
    const messageIds = unrepliedMessages.map(m => m.id);
    const { error: updateError } = await supabase
      .from('broadcast_messages')
      .update({ replied_at: new Date().toISOString() })
      .in('id', messageIds);

    if (updateError) {
      logToFile('❌ Failed to update broadcast replied_at', {
        error: updateError.message,
        messageIds
      });
      return;
    }

    // Increment replied_count for each unique broadcast
    const broadcastIds = [...new Set(unrepliedMessages.map(m => m.broadcast_id))];
    for (const broadcastId of broadcastIds) {
      // Use RPC function to increment replied_count
      await supabase.rpc('increment_replied_count', { p_broadcast_id: broadcastId });
    }

    logToFile('✅ Broadcast reply tracked', {
      userId,
      messagesUpdated: messageIds.length,
      broadcastsUpdated: broadcastIds.length
    });
  } catch (error) {
    logToFile('❌ Error in trackBroadcastReply', {
      error: error.message,
      userId
    });
  }
}

/**
 * Webhook verification endpoint (GET)
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Webhook verification request received');
  console.log('Mode:', mode);
  console.log('Token:', token);

  if (mode === 'subscribe' && token === constants.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully!');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

/**
 * Webhook endpoint to receive messages (POST)
 */
app.post('/webhook', async (req, res) => {
  // Generate correlation ID for tracing this request across all logs
  const correlationId = generateCorrelationId();

  // Wrap the entire request processing with correlation context
  // All console.log calls inside will automatically include correlationId
  await runWithCorrelation(correlationId, async () => {
    logToFile('=== INCOMING WEBHOOK ===', { correlationId });

    // Issue #58 FIX: Add button payload diagnostic logging
    // Helps debug why some button clicks aren't being processed
    const webhookValue = req.body.entry?.[0]?.changes?.[0]?.value;
    logToFile('Webhook diagnostic', {
      correlationId,
      hasMessages: !!webhookValue?.messages,
      hasStatuses: !!webhookValue?.statuses,
      messageType: webhookValue?.messages?.[0]?.type,
      buttonPayload: webhookValue?.messages?.[0]?.button?.payload,
      interactiveType: webhookValue?.messages?.[0]?.interactive?.type,
      interactiveId: webhookValue?.messages?.[0]?.interactive?.list_reply?.id ||
                     webhookValue?.messages?.[0]?.interactive?.button_reply?.id
    });

    try {
      // Check for status webhooks first (delivered/read notifications)
      // Used for broadcast delivery tracking
      const statusValidation = validators.validateWebhookStatus(req);
      if (statusValidation) {
        await handleBroadcastStatusWebhook(statusValidation.statuses);
        res.status(200).send('EVENT_RECEIVED');
        return;
      }

      // Validate webhook structure
      const validation = validators.validateWebhookMessage(req);

    if (!validation) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    const { entry, message, from, messageBody, messageType, messageTimestamp, phoneNumberId } = validation;

    // Skip webhooks for other phone numbers (prevents cross-WABA processing)
    if (!validators.isOurPhoneNumber(phoneNumberId)) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    // Skip test webhooks
    if (validators.isTestWebhook(entry)) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    logToFile(`Message received from ${from}`, {
      messageType: messageType,
      messageId: message.id,
      timestamp: messageTimestamp,
      hasText: !!message.text,
      hasAudio: !!message.audio,
      hasVoice: !!message.voice,
      fullMessage: message
    });

    // Skip test phone numbers
    if (validators.isTestPhoneNumber(from)) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    // Check message timestamp (24-hour window)
    if (!validators.isWithin24Hours(messageTimestamp, from)) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    // Check if already processed (Redis-backed duplicate detection)
    const alreadyProcessed = await SessionService.isProcessed(message.id);
    if (alreadyProcessed) {
      logToFile('⚠️  Duplicate message detected and skipped', {
        messageId: message.id,
        from,
        timestamp: messageTimestamp
      });
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    // Mark as processed
    await SessionService.markAsProcessed(message.id);

    logToFile('✅ Message accepted for processing', {
      messageId: message.id,
      from,
      type: messageType
    });

    // Send appropriate reaction based on whether this is user's first message
    const emoji = SessionService.getReactionEmoji(from);
    await WhatsAppService.sendReaction(from, message.id, emoji);

    // Show typing indicator
    await WhatsAppService.showTypingIndicator(from, message.id);

    // Get or create user in database
    let user = null;
    try {
      user = await getOrCreateUser(from);
      logToFile('User retrieved/created', { userId: user.id, phoneNumber: from });
    } catch (error) {
      logToFile('⚠️ Error with database user operation', { error: error.message });
      // Continue without database - bot will still work
    }

    // Track chat start for funnel analysis (for all message types)
    if (user) {
      try {
        // For text messages, pass the messageBody to extract session_id
        // For voice/audio messages, pass empty string (no session_id possible)
        const trackingMessage = messageType === 'text' ? messageBody : '';
        await trackChatStart(user, from, trackingMessage);
      } catch (error) {
        logToFile('⚠️ Error with funnel tracking', { error: error.message });
        // Continue - tracking failure shouldn't break bot
      }

      // Track broadcast reply engagement (non-blocking)
      trackBroadcastReply(user.id).catch(err => {
        logToFile('⚠️ Error tracking broadcast reply', { error: err.message });
      });
    }

    // Route to appropriate handler based on message type
    if (messageType === 'text' && messageBody) {
      await handleTextMessage(message, from, messageBody, user);
    } else if (messageType === 'audio' || messageType === 'voice') {
      await handleVoiceMessage(message, from, user);
    } else if (messageType === 'image' && message.image) {
      // Handle image messages for multimodal vision analysis
      await handleImageMessage(message, from, user);
    } else if (messageType === 'document' && message.document) {
      // Handle document uploads (lesson plans for coaching)
      await handleDocumentMessage(message, from, user);
    } else if (messageType === 'interactive' && message.interactive?.type === 'button_reply') {
      // Handle interactive button responses
      const buttonId = message.interactive.button_reply.id;
      logToFile('📱 Interactive button clicked', { buttonId, from });

      // Coaching confirmation buttons
      if (buttonId.startsWith('coaching_confirm_')) {
        const sessionId = buttonId.replace('coaching_confirm_', '');
        await CoachingService.handleConfirmation(sessionId, from, true);
      } else if (buttonId.startsWith('coaching_cancel_')) {
        const sessionId = buttonId.replace('coaching_cancel_', '');
        await CoachingService.handleConfirmation(sessionId, from, false);
      }
      // Lesson plan buttons
      else if (buttonId.startsWith('lessonplan_yes_')) {
        const sessionId = buttonId.replace('lessonplan_yes_', '');
        await CoachingService.handleLessonPlanResponse(sessionId, from, true);
      } else if (buttonId.startsWith('lessonplan_no_')) {
        const sessionId = buttonId.replace('lessonplan_no_', '');
        await CoachingService.handleLessonPlanResponse(sessionId, from, false);
      }
      // Bug #9: Stale session reminder buttons - Continue coaching
      else if (buttonId.startsWith('coaching_continue_')) {
        const sessionId = buttonId.replace('coaching_continue_', '');
        logToFile('🔄 User clicked Continue on stale session reminder', { sessionId, from });

        // Fetch session to determine where to resume
        const { data: session } = await supabase
          .from('coaching_sessions')
          .select('conversation_state, transcript_text, analysis_data')
          .eq('id', sessionId)
          .single();

        if (session) {
          const questionsAnswered = session.conversation_state?.questions_answered || 0;
          const nextQuestionNumber = questionsAnswered + 1;

          logToFile('📊 Resuming coaching session', {
            sessionId,
            questionsAnswered,
            nextQuestionNumber
          });

          if (nextQuestionNumber > 3) {
            // All questions already answered, go to report
            const CoachingJobQueueService = require('./shared/services/coaching/coaching-job-queue.service');
            await CoachingJobQueueService.queueReport(sessionId, { from });
            await WhatsAppService.sendMessage(from,
              "Great! All your reflections are recorded. Generating your coaching report now..."
            );
          } else {
            // Resume reflective conversation from next question
            const ReflectiveConversationService = require('./shared/services/coaching/reflective-conversation.service');
            await ReflectiveConversationService.conductReflectiveConversation(
              sessionId,
              from,
              nextQuestionNumber
            );

            // Clear reminder_sent_at since user re-engaged
            await supabase
              .from('coaching_sessions')
              .update({ reminder_sent_at: null })
              .eq('id', sessionId);
          }
        } else {
          await WhatsAppService.sendMessage(from, 'Sorry, I could not find that coaching session.');
        }
      }
      // Bug #9: Stale session reminder buttons - Finish and get partial report
      else if (buttonId.startsWith('coaching_finish_')) {
        const sessionId = buttonId.replace('coaching_finish_', '');
        logToFile('📊 User clicked Finish on stale session reminder', { sessionId, from });

        // Fetch session to get progress
        const { data: session } = await supabase
          .from('coaching_sessions')
          .select('conversation_state')
          .eq('id', sessionId)
          .single();

        if (session) {
          const questionsAnswered = session.conversation_state?.questions_answered || 0;

          // Update state to mark as user-requested early completion
          await supabase
            .from('coaching_sessions')
            .update({
              status: 'generating_report',
              conversation_state: {
                ...session.conversation_state,
                current_state: 'USER_REQUESTED_EARLY_COMPLETION',
                early_completion_at: new Date().toISOString(),
                questions_at_completion: questionsAnswered
              }
            })
            .eq('id', sessionId);

          // Queue report generation with partial flag
          const CoachingJobQueueService = require('./shared/services/coaching/coaching-job-queue.service');
          await CoachingJobQueueService.queueReport(sessionId, {
            from,
            partial: questionsAnswered < 3,
            userRequestedEarly: true
          });

          const progressMsg = questionsAnswered > 0
            ? `Got it! I'll generate your report based on the ${questionsAnswered} reflection${questionsAnswered > 1 ? 's' : ''} you provided. 📊`
            : `Got it! I'll generate your report based on your classroom audio analysis. 📊`;

          await WhatsAppService.sendMessage(from, progressMsg);
        } else {
          await WhatsAppService.sendMessage(from, 'Sorry, I could not find that coaching session.');
        }
      }
      // Bug #7: Vocabulary comprehension button answers
      else if (buttonId.startsWith('vocab_answer_')) {
        const selectedOption = buttonId.replace('vocab_answer_', '');  // "1", "2", or "3"
        logToFile('📖 Vocabulary answer button clicked', { buttonId, selectedOption, from });

        // Check if user is in comprehension flow
        const RedisComprehensionService = require('./shared/services/redis-comprehension.service');
        // Bug #15 Fix: Correct function name (was getFlowByUserId, should be findActiveFlowByUser)
        const flowData = await RedisComprehensionService.findActiveFlowByUser(user.id);

        if (flowData) {
          const assessmentId = flowData.assessment_id;  // Bug #15 Fix: Use correct property name
          const questions = flowData.questions;
          const currentQuestionIndex = flowData.current_question_index;
          const currentQuestion = questions[currentQuestionIndex];

          // Record the answer
          const isCorrect = currentQuestion.expected_answer === selectedOption;
          const answerResult = {
            questionId: currentQuestion.id,
            questionType: currentQuestion.type,
            question: currentQuestion.question,
            studentAnswer: selectedOption,
            expectedAnswer: currentQuestion.expected_answer,
            correct: isCorrect,
            confidence: 1.0,  // Button answers are definitive
            explanation: isCorrect ? 'Correct button selection' : 'Incorrect button selection'
          };

          // Bug #15 Fix: recordAnswer only takes 2 params (assessmentId, answerResult)
          const updatedFlow = await RedisComprehensionService.recordAnswer(
            assessmentId,
            answerResult
          );

          logToFile('✅ Vocabulary answer recorded', {
            assessmentId,
            questionIndex: currentQuestionIndex,
            selectedOption,
            isCorrect
          });

          // Send feedback
          if (isCorrect) {
            await WhatsAppService.sendMessage(from, '✅ Correct!');
          } else {
            await WhatsAppService.sendMessage(from, `❌ That was ${currentQuestion.expected_answer}`);
          }

          // Check if more questions
          const nextQuestionIndex = updatedFlow.current_question_index;
          if (nextQuestionIndex < questions.length) {
            const nextQuestion = questions[nextQuestionIndex];

            // Send next question (handle image questions)
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
          } else {
            // All questions answered - finalize
            const ComprehensionService = require('./shared/services/reading/comprehension.service');
            const { data: assessment } = await supabase
              .from('reading_assessments')
              .select('grade_level')
              .eq('id', assessmentId)
              .single();

            const comprehensionAnalysis = await ComprehensionService.analyzeComprehension(
              questions,
              updatedFlow.answers,
              assessment?.grade_level || 2,
              user.language || 'en'
            );

            // Store results
            await supabase
              .from('reading_assessments')
              .update({
                comprehension_answers: updatedFlow.answers,
                comprehension_score: comprehensionAnalysis.score,
                comprehension_analysis: comprehensionAnalysis
              })
              .eq('id', assessmentId);

            // Clear Redis state
            await RedisComprehensionService.clearFlow(assessmentId);

            // Generate combined report
            const AnalysisService = require('./shared/services/reading/analysis.service');
            await AnalysisService.generateCombinedReport(
              assessmentId,
              user.id,
              from,
              user.language || 'en'
            );
          }
        } else {
          logToFile('⚠️ No comprehension flow found for vocab answer', { userId: user.id });
          await WhatsAppService.sendMessage(from, 'Please start a reading assessment first.');
        }
      }
      // Feature video consent buttons (Integration Point 1 - after feature completion)
      else if (buttonId.startsWith('show_feature_video_') || buttonId.startsWith('skip_feature_video_')) {
        logToFile('🎥 Feature consent button clicked', { buttonId, from, userId: user?.id });

        if (user) {
          const FeatureLinkerService = require('./shared/services/feature-linker.service');
          const handled = await FeatureLinkerService.handleConsentButtonResponse(user.id, from, buttonId);

          if (!handled) {
            logToFile('⚠️ Feature consent button not handled', { buttonId, userId: user.id });
          }
        } else {
          logToFile('⚠️ No user found for feature consent button', { buttonId, from });
        }
      }
      // Keyword detection consent buttons (Integration Point 3 - chat keywords)
      else if (buttonId.startsWith('keyword_show_video_') || buttonId.startsWith('keyword_skip_video_')) {
        logToFile('🔍 Keyword consent button clicked', { buttonId, from, userId: user?.id });

        if (user) {
          const FeatureKeywordDetectorService = require('./shared/services/feature-keyword-detector.service');
          const handled = await FeatureKeywordDetectorService.handleKeywordConsentButton(user.id, from, buttonId);

          if (!handled) {
            logToFile('⚠️ Keyword consent button not handled', { buttonId, userId: user.id });
          }
        } else {
          logToFile('⚠️ No user found for keyword consent button', { buttonId, from });
        }
      }
      // Issue #35: Video Style Selection - Carousel button callback
      else if (buttonId.startsWith('style_')) {
        logToFile('🎨 Video style button clicked', { buttonId, from, userId: user?.id });

        if (user) {
          const VideoOrchestrator = require('./shared/services/video/video-orchestrator.service');
          const { parseStyleFromButtonId } = require('./shared/handlers/text-message.handler');

          // Parse style from button ID (style_photorealistic → photorealistic)
          const selectedStyle = parseStyleFromButtonId(buttonId);

          // Check if user was awaiting style selection
          const styleState = await VideoOrchestrator.checkAwaitingStyle(user.id);

          if (styleState) {
            logToFile('✅ Processing video style selection', {
              userId: user.id,
              selectedStyle,
              topic: styleState.topic
            });

            await VideoOrchestrator.handleStyleSelection(
              user,
              from,
              selectedStyle,
              styleState.sessionId,
              styleState.topic,
              styleState.language,
              styleState.customization
            );
          } else {
            // No awaiting state - might be stale button click
            logToFile('⚠️ Style button clicked but no awaiting state', { buttonId, userId: user.id });
            await WhatsAppService.sendMessage(from,
              "That style selection has expired. Please use /video to start a new video request."
            );
          }
        } else {
          logToFile('⚠️ No user found for style button', { buttonId, from });
        }
      }
      // bd-086: Exam Checker buttons
      else if (ExamCheckerHandler.isExamCheckerButton(buttonId)) {
        if (user) {
          await ExamCheckerHandler.handleExamButton(buttonId, from, user);
        } else {
          logToFile('⚠️ No user found for exam checker button', { buttonId, from });
        }
      } else {
        logToFile('⚠️ Unknown button ID', { buttonId });
      }
    } else if (messageType === 'button' && message.button) {
      // Issue #35: Handle carousel template button responses
      // Carousel template buttons come as messageType='button' with payload in message.button.payload
      const buttonPayload = message.button.payload;
      const buttonText = message.button.text;

      logToFile('🎠 Carousel template button clicked', {
        buttonPayload,
        buttonText,
        from,
        userId: user?.id
      });

      // Handle style_* payloads from video style carousel
      if (buttonPayload && buttonPayload.startsWith('style_')) {
        if (user) {
          const VideoOrchestrator = require('./shared/services/video/video-orchestrator.service');
          const { parseStyleFromButtonId } = require('./shared/handlers/text-message.handler');

          // Parse style from payload (style_photorealistic → photorealistic)
          const selectedStyle = parseStyleFromButtonId(buttonPayload);

          // Check if user was awaiting style selection
          const styleState = await VideoOrchestrator.checkAwaitingStyle(user.id);

          if (styleState) {
            logToFile('✅ Processing video style selection (carousel template)', {
              userId: user.id,
              selectedStyle,
              topic: styleState.topic
            });

            await VideoOrchestrator.handleStyleSelection(
              user,
              from,
              selectedStyle,
              styleState.sessionId,
              styleState.topic,
              styleState.language,
              styleState.customization
            );
          } else {
            // No awaiting state - might be stale button click
            logToFile('⚠️ Style carousel button clicked but no awaiting state', {
              buttonPayload,
              userId: user.id
            });
            await WhatsAppService.sendMessage(from,
              "That style selection has expired. Please use /video to start a new video request."
            );
          }
        } else {
          logToFile('⚠️ No user found for carousel button', { buttonPayload, from });
        }
      } else if (buttonPayload && buttonPayload.startsWith('menu_')) {
        // Handle menu_* payloads from feature menu carousel
        if (user) {
          const MenuService = require('./shared/services/menu.service');

          logToFile('📋 Processing menu selection (carousel/list)', {
            userId: user.id,
            buttonPayload
          });

          await MenuService.handleMenuButtonResponse(
            user,
            from,
            buttonPayload,
            user.language || 'en'
          );
        } else {
          logToFile('⚠️ No user found for menu button', { buttonPayload, from });
        }
      } else {
        logToFile('⚠️ Unknown carousel button payload', { buttonPayload, buttonText });
      }
    } else if (messageType === 'interactive' && message.interactive?.type === 'nfm_reply') {
      // Handle WhatsApp Flow submissions (registration, reading assessment, etc.)
      const flowName = message.interactive?.nfm_reply?.name || '';

      // Parse response_json to determine flow type
      let responseJson = {};
      try {
        responseJson = JSON.parse(message.interactive?.nfm_reply?.response_json || '{}');
      } catch (error) {
        logToFile('❌ Failed to parse flow response_json', { from, error: error.message });
      }

      // Use centralized flow type detection (bd-387: fixes registration→attendance misrouting)
      const { detectFlowType } = require('./shared/utils/flow-type-detector');
      const flowType = detectFlowType(responseJson);

      logToFile('📋 Processing flow submission', {
        from,
        flowName,
        flowType,
        responseFields: Object.keys(responseJson)
      });

      const FlowResponseHandler = require('./shared/handlers/flow-response.handler');

      if (flowType === 'reading_assessment') {
        // Reading Assessment Flow
        logToFile('📖 Detected reading assessment flow submission', {
          from,
          responseFields: Object.keys(responseJson)
        });

        try {
          const success = await FlowResponseHandler.handleReadingAssessmentFlow(message, from, user.id);

          if (!success) {
            logToFile('❌ Reading assessment flow processing failed', { from, responseJson });
          } else {
            logToFile('✅ Reading assessment flow processed successfully', { from });
          }
        } catch (flowError) {
          logToFile('❌ Exception in reading assessment flow handler', {
            from,
            error: flowError.message,
            stack: flowError.stack,
            responseJson
          });
        }
      } else if (flowType === 'registration') {
        // Registration Flow (bd-387: PROJ-010)
        logToFile('📝 Detected registration flow submission', {
          from,
          responseFields: Object.keys(responseJson)
        });

        try {
          const success = await FlowResponseHandler.handleRegistrationFlow(message, from, user?.id);

          if (!success) {
            logToFile('❌ Registration flow processing failed', { from, responseJson });
            await WhatsAppService.sendMessage(from, 'Sorry, something went wrong with your registration. Please try /register to try again.');
          } else {
            logToFile('✅ Registration flow processed successfully', { from });
          }
        } catch (flowError) {
          logToFile('❌ Exception in registration flow handler', {
            from,
            error: flowError.message,
            stack: flowError.stack
          });
          await WhatsAppService.sendMessage(from, 'Sorry, something went wrong with your registration. Please try /register to try again.');
        }
      } else if (flowType === 'attendance_setup') {
        // Attendance Setup Flow - creating a new class
        logToFile('📋 Detected attendance setup flow submission', {
          from,
          responseFields: Object.keys(responseJson)
        });

        try {
          const success = await FlowResponseHandler.handleAttendanceSetupFlow(message, from, user?.id);

          if (!success) {
            logToFile('❌ Attendance setup flow processing failed', { from, responseJson });
            await WhatsAppService.sendMessage(from, 'Sorry, there was an error setting up your class. Please try again.');
          } else {
            logToFile('✅ Attendance setup flow processed successfully', { from });
          }
        } catch (flowError) {
          logToFile('❌ Exception in attendance setup flow handler', {
            from,
            error: flowError.message,
            stack: flowError.stack
          });
          await WhatsAppService.sendMessage(from, 'Sorry, there was an error setting up your class. Please try again.');
        }
      } else if (flowType === 'attendance_marking') {
        // Attendance Marking Flow - marking students absent
        logToFile('📋 Detected attendance marking flow submission', {
          from,
          responseFields: Object.keys(responseJson)
        });

        try {
          const success = await FlowResponseHandler.handleAttendanceMarkingFlow(message, from, user?.id);

          if (!success) {
            logToFile('❌ Attendance marking flow processing failed', { from, responseJson });
            await WhatsAppService.sendMessage(from, 'Sorry, there was an error recording attendance. Please try again.');
          } else {
            logToFile('✅ Attendance marking flow processed successfully', { from });
          }
        } catch (flowError) {
          logToFile('❌ Exception in attendance marking flow handler', {
            from,
            error: flowError.message,
            stack: flowError.stack
          });
          await WhatsAppService.sendMessage(from, 'Sorry, there was an error recording attendance. Please try again.');
        }
      } else {
        // Unknown flow type
        logToFile('⚠️ Received unknown flow submission', {
          from,
          flowType,
          responseFields: Object.keys(responseJson)
        });

        await WhatsAppService.sendMessage(
          from,
          "Thanks for your response! Type /menu to see what I can help you with."
        );
      }
    } else if (messageType === 'interactive' && message.interactive?.type === 'list_reply') {
      // Handle interactive list responses (Reading Assessment)
      const listReply = message.interactive.list_reply;
      const listId = listReply.id;
      logToFile('📋 Interactive list item selected', { listId, from });

      // CRITICAL: Get the CURRENT session first, then query conversations in THAT session
      const { getOrCreateSession } = require('./shared/database/bot-helpers');
      const currentSessionId = await getOrCreateSession(user.id);

      logToFile('📋 Current session retrieved', { currentSessionId });

      // Get conversation state for the CURRENT session (not just any recent conversation)
      // Note: Multiple conversations can exist in same session, so we get the most recent one
      const { data: conversationsList, error: sessionError } = await supabase
        .from('conversations')
        .select('session_id, current_state')
        .eq('user_id', user?.id)
        .eq('session_id', currentSessionId)  // CRITICAL: Filter by current session
        .not('current_state', 'is', null)  // Only get conversations with state set
        .order('created_at', { ascending: false })
        .limit(1);

      // Get first result (most recent conversation with state)
      const sessionData = conversationsList?.[0] || null;
      const sessionId = sessionData?.session_id || currentSessionId;  // Fallback to current session
      const currentState = sessionData?.current_state;

      logToFile('📋 Interactive list - session state check', {
        listId,
        currentSessionId,
        sessionDataFound: !!sessionData,
        sessionId,
        currentState,
        sessionError: sessionError?.message
      });

      // Reading Assessment language selection
      if (listId.startsWith('reading_lang_')) {
        const language = listId.replace('reading_lang_', ''); // 'en' or 'ur'

        if (currentState !== 'AWAITING_READING_LANGUAGE') {
          logToFile('⚠️ Invalid state for language selection', {
            currentState: currentState || 'null/undefined',
            expectedState: 'AWAITING_READING_LANGUAGE',
            sessionDataFound: !!sessionData,
            userId: user?.id
          });
          await WhatsAppService.sendMessage(
            from,
            'Sorry, this selection is no longer valid. Please start a new reading test with /reading test'
          );
          return;
        }

        try {
          await ReadingAssessmentService.handleLanguageSelection(
            user.id,
            sessionId,
            from,
            language,
            user.preferred_language || 'en'
          );
          logToFile('✅ Language selection processed', { userId: user.id, language });
        } catch (error) {
          logToFile('❌ Error processing language selection', {
            userId: user.id,
            error: error.message,
            stack: error.stack
          });
          await WhatsAppService.sendMessage(
            from,
            'Sorry, there was an error processing your selection. Please try again with /reading test'
          );
        }
      }
      // Reading Assessment grade level selection
      else if (listId.startsWith('reading_grade_')) {
        const gradeLevel = parseInt(listId.replace('reading_grade_', '')); // 0-4

        if (currentState !== 'AWAITING_READING_GRADE') {
          logToFile('⚠️ Invalid state for grade selection', { currentState, expectedState: 'AWAITING_READING_GRADE' });
          await WhatsAppService.sendMessage(
            from,
            'Sorry, this selection is no longer valid. Please start a new reading test with /reading test'
          );
          return;
        }

        try {
          await ReadingAssessmentService.handleGradeSelection(
            user.id,
            sessionId,
            from,
            gradeLevel,
            user.preferred_language || 'en'
          );
          logToFile('✅ Grade selection processed', { userId: user.id, gradeLevel });
        } catch (error) {
          logToFile('❌ Error processing grade selection', {
            userId: user.id,
            error: error.message,
            stack: error.stack
          });
          await WhatsAppService.sendMessage(
            from,
            'Sorry, there was an error processing your selection. Please try again with /reading test'
          );
        }
      }
      // Language preference selection (from /language command)
      else if (listId.startsWith('lang_')) {
        const languageCode = listId.replace('lang_', ''); // 'auto', 'en', 'ur', 'pa-PK', etc.

        logToFile('🌐 Language preference selection', { listId, languageCode, userId: user?.id });

        try {
          if (languageCode === 'auto') {
            // Auto-detect mode: unlock language (uses consolidated language-cache function)
            const success = await setLanguageLock(user.id, false);

            if (!success) {
              logToFile('❌ Failed to update language preference', { userId: user.id });
              await WhatsAppService.sendMessage(from, 'Sorry, there was an error updating your language preference. Please try again.');
              return;
            }

            // Send confirmation in user's current language
            const confirmMessage = user.preferred_language === 'ur'
              ? '✅ آٹو ڈیٹیکٹ فعال ہو گیا۔ اب میں خودکار طور پر آپ کی زبان پہچانوں گا۔'
              : '✅ Auto-detect enabled. I will now automatically detect your language.';

            await WhatsAppService.sendMessage(from, confirmMessage);
            logToFile('✅ Language set to auto-detect', { userId: user.id });
          } else {
            // Specific language selected: set language and lock it (uses consolidated language-cache function)
            const success = await setUserLanguage(user.id, languageCode, true);

            if (!success) {
              logToFile('❌ Failed to update language preference', { userId: user.id, languageCode });
              await WhatsAppService.sendMessage(from, 'Sorry, there was an error updating your language preference. Please try again.');
              return;
            }

            // Send confirmation in the newly selected language
            // IMPORTANT: Pakistani languages use Perso-Arabic/Shahmukhi scripts, NOT Gurmukhi/Devanagari
            const confirmMessages = {
              'en': '✅ Language set to English. I will now respond in English.',
              'ur': '✅ زبان اردو میں تبدیل ہو گئی۔ اب میں اردو میں جواب دوں گا۔',
              'ar': '✅ تم تغيير اللغة إلى العربية. سأرد الآن بالعربية.',
              'es': '✅ Idioma cambiado a español. Ahora responderé en español.',
              'pa-PK': '✅ زبان پنجابی تے سیٹ ہو گئی۔ ہن میں پنجابی وچ جواب دیاں گا۔',  // Shahmukhi script
              'sd-PK': '✅ ٻولي سنڌي تي سيٽ ٿي وئي۔ هاڻي مان سنڌي ۾ جواب ڏيندس۔',  // Arabic-Sindhi script
              'ps-PK': '✅ ژبه پښتو ته ټاکل شوه۔ اوس به زه په پښتو ځواب ورکوم۔',  // Pashto script
              'bal-PK': '✅ زبان بلوچی ءَ سیٹ بوت۔ انچو من بلوچی ءَ جواب دیان۔',  // Balochi script
              'ta-LK': '✅ மொழி தமிழ் என்று அமைக்கப்பட்டது. இனி நான் தமிழில் பதிலளிப்பேன்.'  // Tamil script
            };

            const confirmMessage = confirmMessages[languageCode] || `✅ Language set to ${languageCode}.`;
            await WhatsAppService.sendMessage(from, confirmMessage);
            logToFile('✅ Language preference updated', { userId: user.id, languageCode, locked: true });
          }
        } catch (error) {
          logToFile('❌ Error processing language selection', {
            userId: user?.id,
            languageCode,
            error: error.message,
            stack: error.stack
          });
          await WhatsAppService.sendMessage(from, 'Sorry, there was an error processing your selection. Please try again with /language');
        }
      }
      // Issue #35: Video style selection via list fallback (when carousel template fails)
      else if (listId.startsWith('style_')) {
        logToFile('🎨 Video style list selection detected (fallback)', { listId, userId: user?.id });

        if (user) {
          const VideoOrchestrator = require('./shared/services/video/video-orchestrator.service');
          const { parseStyleFromButtonId } = require('./shared/handlers/text-message.handler');

          // Parse style from list ID (style_photorealistic → photorealistic)
          const selectedStyle = parseStyleFromButtonId(listId);

          // Check if user was awaiting style selection
          const styleState = await VideoOrchestrator.checkAwaitingStyle(user.id);

          if (styleState) {
            logToFile('✅ Processing video style selection (list fallback)', {
              userId: user.id,
              selectedStyle,
              topic: styleState.topic
            });

            await VideoOrchestrator.handleStyleSelection(
              user,
              from,
              selectedStyle,
              styleState.sessionId,
              styleState.topic,
              styleState.language,
              styleState.customization
            );
          } else {
            // No awaiting state - might be stale selection
            logToFile('⚠️ Style list selection but no awaiting state', { listId, userId: user.id });
            await WhatsAppService.sendMessage(from,
              "That style selection has expired. Please use /video to start a new video request."
            );
          }
        } else {
          logToFile('⚠️ No user found for style list selection', { listId, from });
        }
      }
      // Feature menu selection via list fallback (when carousel template fails)
      else if (listId.startsWith('menu_')) {
        logToFile('📋 Menu list selection detected (fallback)', { listId, userId: user?.id });

        if (user) {
          const MenuService = require('./shared/services/menu.service');

          logToFile('✅ Processing menu selection (list fallback)', {
            userId: user.id,
            listId
          });

          await MenuService.handleMenuButtonResponse(
            user,
            from,
            listId,
            user.language || 'en'
          );
        } else {
          logToFile('⚠️ No user found for menu list selection', { listId, from });
        }
      }
      // Video language selection (Issue #8 fix - handler was missing)
      else if (['en', 'ur', 'ar', 'es', 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK', 'ta-LK'].includes(listId)) {
        logToFile('🎬 Video language selection detected', { listId, userId: user?.id });

        try {
          const VideoOrchestrator = require('./shared/services/video/video-orchestrator.service');
          const languageState = await VideoOrchestrator.checkAwaitingLanguage(user.id);

          if (languageState) {
            await VideoOrchestrator.handleLanguageSelection(
              user,
              from,
              listId,
              languageState.sessionId,
              languageState.topic
            );
            logToFile('✅ Video language selection processed', { userId: user.id, language: listId });
          } else {
            // No video language state - might be stale selection
            logToFile('⚠️ Video language selection but no awaiting state', { listId, userId: user?.id });
          }
        } catch (error) {
          logToFile('❌ Error processing video language selection', {
            userId: user?.id,
            language: listId,
            error: error.message,
            stack: error.stack
          });
          await WhatsAppService.sendMessage(from, 'Sorry, there was an error processing your language selection. Please try /video again.');
        }
      }
      else {
        logToFile('⚠️ Unknown list item ID', { listId });
      }
    } else {
      // Handle unsupported message types
      logToFile(`⚠️ Unsupported message type: ${messageType}`);
      await WhatsAppService.sendMessage(
        from,
        'میں صرف متن اور آواز پیغامات کا جواب دے سکتا ہوں۔' // I can only respond to text and voice messages
      );
    }

    // Always respond with 200 OK to acknowledge receipt
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    logToFile('❌ Error processing webhook', {
      error: error.message,
      stack: error.stack
    });
    res.status(200).send('EVENT_RECEIVED'); // Still send 200 to avoid retries
  }
  }); // End of runWithCorrelation
});

/**
 * Handle document messages (classroom audio or lesson plan uploads for coaching)
 * @param {Object} message - WhatsApp message object
 * @param {string} from - Sender phone number
 * @param {Object|null} user - User object from database
 * @returns {Promise<void>}
 */
async function handleDocumentMessage(message, from, user) {
  logToFile('📄 Document received', { from, documentId: message.document.id });

  // Check if user exists
  if (!user) {
    await WhatsAppService.sendMessage(from, "Please complete registration first.");
    return;
  }

  try {
    const documentId = message.document.id;
    const mimeType = message.document.mime_type || '';

    logToFile('Document details', { documentId, mimeType, filename: message.document.filename });

    // CLASSROOM COACHING DETECTION: Check if document is an audio file (15+ minutes)
    const isAudioDocument = mimeType.includes('audio') ||
                           mimeType.includes('m4a') ||
                           mimeType.includes('mp3') ||
                           mimeType.includes('mpeg') ||
                           mimeType.includes('wav');

    if (isAudioDocument) {
      logToFile('🎵 Audio document detected, checking duration...');

      try {
        // Download audio to check duration with ffprobe
        // WhatsApp API doesn't provide duration for documents, only for voice messages
        logToFile('Downloading audio document to check duration...');
        const audioBuffer = await WhatsAppService.downloadMedia(documentId);
        logToFile('Audio downloaded', { bufferSize: audioBuffer.length });

        // Get duration using ffprobe
        const AudioService = require('./shared/services/audio.service');
        const audioDuration = await AudioService.getAudioDuration(audioBuffer);
        const audioDurationRounded = Math.round(audioDuration); // Round to integer for database

        logToFile('Audio duration extracted via ffprobe', {
          duration: audioDuration,
          durationRounded: audioDurationRounded,
          durationMinutes: Math.round(audioDuration / 60),
          mimeType
        });

        // Check if audio is 15+ minutes (900 seconds) = classroom audio
        const CLASSROOM_AUDIO_THRESHOLD = 900; // 15 minutes in seconds

        if (audioDurationRounded >= CLASSROOM_AUDIO_THRESHOLD) {
          logToFile('🎓 CLASSROOM AUDIO DETECTED (15+ minutes)', {
            duration: audioDuration,
            durationMinutes: Math.round(audioDuration / 60)
          });

          // Create session for this user (needed for coaching flow)
          const { getOrCreateSession } = require('./shared/database/bot-helpers');
          const sessionId = await getOrCreateSession(user.id);

          logToFile('✅ Session created for classroom coaching', { sessionId });

          // Route to classroom coaching flow
          await CoachingService.initiateCoachingSession(
            user.id,
            sessionId,
            documentId,
            from,
            audioDurationRounded
          );

          return; // Exit early - coaching flow will handle everything
        }

        // BUG-005 FIX: Route short audio documents to voice handler for transcription
        // Instead of showing confusing "send classroom audio first" message
        logToFile('🎤 BUG-005: Audio document < 15 min, routing to voice handler for transcription', {
          duration: audioDuration,
          durationMinutes: Math.round(audioDuration / 60),
          documentId,
          mimeType
        });

        // Construct a message object that voice handler expects
        // Voice handler looks for message.audio?.id || message.voice?.id
        const voiceMessage = {
          audio: { id: documentId },
          // Include original message properties for compatibility
          from: from,
          type: 'audio'
        };

        // Route to voice message handler
        await handleVoiceMessage(voiceMessage, from, user);

        return; // Exit early - voice handler will process the audio
      } catch (durationError) {
        logToFile('⚠️ Could not get audio duration, treating as regular document', {
          error: durationError.message
        });
        // Continue with regular document flow if duration check fails
      }
    }

    // LESSON PLAN DOCUMENT: Check if there's an active coaching session awaiting lesson plan
    const { data: coachingSession } = await supabase
      .from('coaching_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'awaiting_lesson_plan')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (coachingSession) {
      // Document is lesson plan for active coaching session
      await CoachingService.handleLessonPlanResponse(
        coachingSession.id,
        from,
        true,
        documentId
      );
    } else {
      // No active coaching session - regular document
      await WhatsAppService.sendMessage(from,
        "I received your document. If you're trying to submit a lesson plan for classroom coaching, " +
        "please send me a classroom audio recording first (15+ minutes)."
      );
    }
  } catch (error) {
    logToFile('❌ Error handling document', {
      error: error.message,
      from
    });
    await WhatsAppService.sendMessage(from, "Sorry, I encountered an error processing your document.");
  }
}

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.send('WhatsApp AI Bot is running!');
});

/**
 * Clear conversation history endpoint
 */
app.post('/clear-history/:userId', (req, res) => {
  const userId = req.params.userId;
  OpenAIService.clearHistory(userId);
  res.send(`Conversation history cleared for user ${userId}`);
});

/**
 * Get session statistics endpoint (for debugging)
 */
app.get('/stats', (req, res) => {
  const stats = SessionService.getStats();
  res.json(stats);
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const path = require('path');
  const versionFile = path.join(__dirname, 'VERSION');
  let version = '2.1.0'; // Default fallback

  try {
    if (fs.existsSync(versionFile)) {
      version = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (err) {
    console.error('Error reading VERSION file:', err);
  }

  res.json({
    status: 'healthy',
    service: 'Rumi WhatsApp Bot',
    version: version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Internal API: Send password reset code via WhatsApp
 * Called by portal backend to send reset codes through the main bot
 *
 * Security: API key authentication required
 */
app.post('/api/internal/send-password-reset', async (req, res) => {
  try {
    // Verify API key (shared secret between portal and main bot)
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (apiKey !== expectedApiKey) {
      logToFile('❌ Unauthorized internal API call', {
        endpoint: '/api/internal/send-password-reset',
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { phoneNumber, code, firstName, language } = req.body;

    if (!phoneNumber || !code || !firstName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, code, firstName'
      });
    }

    logToFile('📞 Internal API: Sending password reset code', {
      phoneNumber,
      language,
      caller: 'portal-backend'
    });

    // Multilingual reset code messages
    const messages = {
      en: `Hi ${firstName}! 👋

Your Rumi portal password reset code is:

*${code}*

This code expires in 10 minutes.

If you didn't request this, please ignore this message.`,

      ur: `ہیلو ${firstName}! 👋

آپ کا Rumi پورٹل پاسورڈ ری سیٹ کوڈ ہے:

*${code}*

یہ کوڈ 10 منٹ میں ختم ہو جائے گا۔

اگر آپ نے یہ درخواست نہیں کی تو براہ کرم اس پیغام کو نظر انداز کریں۔`,

      ar: `مرحباً ${firstName}! 👋

رمز إعادة تعيين كلمة مرور بوابة Rumi الخاص بك هو:

*${code}*

تنتهي صلاحية هذا الرمز خلال 10 دقائق.

إذا لم تطلب ذلك، يرجى تجاهل هذه الرسالة.`,

      es: `¡Hola ${firstName}! 👋

Tu código de restablecimiento de contraseña del portal Rumi es:

*${code}*

Este código expira en 10 minutos.

Si no solicitaste esto, ignora este mensaje.`
    };

    // Get localized message (fallback to English)
    const message = messages[language] || messages.en;

    // Send WhatsApp message using main bot's WhatsApp service
    const sent = await WhatsAppService.sendMessage(phoneNumber, message);

    if (sent) {
      logToFile('✅ Password reset code sent via WhatsApp', {
        phoneNumber,
        language
      });
      res.json({
        success: true,
        message: 'Password reset code sent successfully'
      });
    } else {
      logToFile('❌ Failed to send password reset code', {
        phoneNumber
      });
      res.status(500).json({
        success: false,
        error: 'Failed to send WhatsApp message'
      });
    }
  } catch (error) {
    logToFile('❌ Internal API error', {
      endpoint: '/api/internal/send-password-reset',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Start server
 */
app.listen(constants.PORT, () => {
  // Read version from VERSION file
  const path = require('path');
  const versionFile = path.join(__dirname, 'VERSION');
  let version = '2.1.0'; // Default fallback

  try {
    if (fs.existsSync(versionFile)) {
      version = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (err) {
    console.error('Error reading VERSION file:', err);
  }

  const startupMessage = `\n${'='.repeat(70)}
🤖 Rumi v${version}
${'='.repeat(70)}

✅ Server running on port ${constants.PORT}
📍 Local URL: http://localhost:${constants.PORT}
🔗 Health Check: http://localhost:${constants.PORT}/health

📝 LOGGING ENABLED
   All webhook activity is logged to: ${LOGS_DIR}
   Log file: bot-${new Date().toISOString().split('T')[0]}.log

${'='.repeat(70)}
📋 NEXT STEP: Start ngrok in a NEW terminal window
${'='.repeat(70)}

   Run this command in a new terminal:

   npx ngrok http ${constants.PORT} --authtoken 34qBnAEGwRHyHrUTvfPV7uJ2gf9_44iab5yW8EXtPAmxeZN2z

${'='.repeat(70)}

Then copy the ngrok URL and configure it in Meta:
   1. Go to: https://developers.facebook.com/apps/
   2. Navigate to: WhatsApp → Configuration → Webhook
   3. Paste ngrok URL with /webhook (e.g., https://abc.ngrok-free.app/webhook)
   4. Verify Token: ${constants.WEBHOOK_VERIFY_TOKEN}
   5. Subscribe to: messages
   6. Send a test message to your WhatsApp bot number

${'='.repeat(70)}
\n`;

  console.log(startupMessage);
  logToFile('🚀 Bot server started', { port: constants.PORT, logsDir: LOGS_DIR });

  // Non-blocking startup checks (delayed to not slow boot)
  setTimeout(() => {
    try {
      const { validateBootRequirements } = require('./shared/utils/setup-validator');
      const result = validateBootRequirements();
      if (!result.ok) {
        logToFile('Setup validation issues detected', { warnings: result.warnings, errors: result.errors });
      }
    } catch (err) {
      // setup-validator is optional — skip silently if not present
    }

    try {
      const { checkForUpdates } = require('./shared/utils/version-check');
      checkForUpdates(version).catch(() => {});
    } catch (err) {
      // version-check is optional — skip silently if not present
    }
  }, 10000);
});
