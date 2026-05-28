const path = require('path');
const fs = require('fs');
const WhatsAppService = require('../services/whatsapp.service');
const OpenAIService = require('../services/openai.service');
const AudioService = require('../services/audio.service');
const ContentService = require('../services/content.service');
const FeatureRegistrationService = require('../services/feature-registration.service');
const CoachingService = require('../services/coaching-orchestrator.service');
const MenuService = require('../services/menu.service');
const VideoOrchestrator = require('../services/video/video-orchestrator.service');
const LessonPlanQueueService = require('../services/lesson-plan-queue.service');
const AttendanceConversationService = require('../services/attendance-conversation.service');
const { logToFile } = require('../utils/logger');
const { TEMP_DIR, LOADING_STICKER_PATH, LOADING_STICKER_MEDIA_ID } = require('../utils/constants');
const {
  getOrCreateUser,
  getOrCreateSession,
  updateSessionType,
  storeConversation,
  storeAudioSession,
  storeLessonPlan
} = require('../database/bot-helpers');
const { uploadAudio } = require('../storage/r2');
const supabase = require('../config/supabase');
// Import language detection for content generation
const { detectRequestedLanguage } = require('../utils/language-detection');
// Language cache for ASR routing based on user preference
const { getUserLanguage, setUserLanguage } = require('../utils/language-cache');

/**
 * Handle voice message processing
 * @param {Object} message - WhatsApp message object
 * @param {string} from - Sender phone number
 * @param {Object|null} user - User object from database
 * @returns {Promise<void>}
 */
async function handleVoiceMessage(message, from, user = null) {
  logToFile('🎤 VOICE MESSAGE DETECTED - Starting processing...');

  // Start continuous typing indicator immediately
  const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

  try {
    const audioId = message.audio?.id || message.voice?.id;
    logToFile('Audio ID extracted', { audioId });

    if (!audioId) {
      throw new Error('No audio ID found in message');
    }

    // Get or create session BEFORE any routing checks (needed for session ID)
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
    // FEATURE-BASED REGISTRATION: Check if waiting for name (voice)
    // ============================================================
    if (user) {
      try {
        const isPendingName = await FeatureRegistrationService.isPendingName(user.id);
        if (isPendingName) {
          logToFile('📝 User is pending name registration (voice), transcribing for name', { userId: user.id });

          // Get user's current language
          const userLanguage = user.preferred_language || 'en';

          // Download and transcribe the audio to get the name
          const audioUrl = await WhatsAppService.getMediaUrl(audioId);
          const audioBuffer = await WhatsAppService.downloadMedia(audioUrl);

          // Transcribe with OpenAI Whisper
          const transcriptText = await AudioService.transcribeAudio(audioBuffer, userLanguage);
          logToFile('Voice name transcription result', { transcript: transcriptText });

          // Handle the name response
          const result = await FeatureRegistrationService.handleNameResponse(
            user.id,
            transcriptText,
            from,
            userLanguage,
            'voice'
          );

          if (result.success) {
            logToFile('✅ Name registration completed via voice', { userId: user.id, firstName: result.firstName });
          } else {
            logToFile('⚠️ Name extraction failed (voice), asking again', { userId: user.id });
            // Ask again if extraction failed - use voice since they're using voice
            const retryMessages = {
              en: "I didn't quite catch your name. Could you say it again?",
              ur: "میں آپ کا نام سمجھ نہیں سکی۔ براہ کرم دوبارہ بتائیں؟",
              ar: "لم أفهم اسمك. هل يمكنك قوله مرة أخرى؟",
              es: "No entendí tu nombre. ¿Puedes repetirlo?"
            };
            const retryMessage = retryMessages[userLanguage] || retryMessages.en;
            const speechBuffer = await AudioService.generateSpeechForLanguage(retryMessage, userLanguage);
            await WhatsAppService.sendAudio(from, speechBuffer, TEMP_DIR);
          }

          // Stop typing and return early
          if (typingController) typingController.stop();
          return;
        }
      } catch (error) {
        logToFile('⚠️ Error checking pending name status (voice)', { error: error.message });
        // Continue with normal flow if check fails
      }
    }

    // ============================================================
    // ATTENDANCE VOICE INPUT CHECK
    // Check if user is awaiting voice input for attendance roll call
    // ============================================================
    if (user) {
      try {
        const attendanceState = await AttendanceConversationService.getSessionState(user.id);

        if (attendanceState?.state === AttendanceConversationService.STATES.AWAITING_VOICE_INPUT) {
          logToFile('📋 Attendance voice input detected', { userId: user.id, sessionState: attendanceState.state });

          // Download the audio
          const audioUrl = await WhatsAppService.getMediaUrl(audioId);
          const audioBuffer = await WhatsAppService.downloadMedia(audioUrl);

          // Save to temp file for processing
          const tempAudioPath = path.join(TEMP_DIR, `attendance_${user.id}_${Date.now()}.ogg`);
          fs.writeFileSync(tempAudioPath, audioBuffer);

          // Convert to WAV for Soniox (16kHz mono)
          const wavPath = path.join(TEMP_DIR, `attendance_${user.id}_${Date.now()}.wav`);
          await AudioService.convertToWav(audioBuffer, wavPath);

          logToFile('Attendance audio saved', { tempAudioPath, wavPath });

          // Process voice attendance using the conversation service
          const result = await AttendanceConversationService.handleVoiceInput(user.id, wavPath);

          // Cleanup temp files
          try {
            if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
            if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
          } catch (cleanupError) {
            logToFile('⚠️ Temp file cleanup failed', { error: cleanupError.message });
          }

          // Stop typing indicator
          typingController.stop();

          // Handle the result
          if (result.action === 'VERIFY_ATTENDANCE') {
            // Send verification message
            await WhatsAppService.sendMessage(from, result.message);
            logToFile('✅ Attendance verification sent', {
              present: result.summary.present,
              absent: result.summary.absent
            });
          } else if (result.action === 'ERROR') {
            // Send error message
            await WhatsAppService.sendMessage(from, result.message);
          } else {
            // Unexpected action
            await WhatsAppService.sendMessage(from, result.message || 'Please try again.');
          }

          return; // Exit early - handled by attendance system
        }
      } catch (error) {
        logToFile('⚠️ Error checking attendance voice state', { error: error.message, stack: error.stack, userId: user?.id });
        // Continue with normal flow if attendance check fails
      }
    }

    // PRIORITY 1: CHECK FOR COMPREHENSION QUESTION ANSWER (Sprint 1.8)
    // CRITICAL: Must check BEFORE reading assessment to avoid routing comprehension answers as new readings
    // Query Redis instead of conversations table (context_data column doesn't exist)
    if (user) {
      try {
        const RedisComprehensionService = require('../services/redis-comprehension.service');
        const activeFlow = await RedisComprehensionService.findActiveFlowByUser(user.id);

        logToFile('🔍 Voice routing check - comprehension', {
          hasActiveFlow: !!activeFlow,
          assessmentId: activeFlow?.assessment_id || 'none',
          currentQuestion: activeFlow?.current_question_index,
          totalQuestions: activeFlow?.questions?.length,
          answersCollected: activeFlow?.answers?.length || 0
        });

        if (activeFlow) {
          logToFile('📚 Comprehension answer detected', {
            assessmentId: activeFlow.assessment_id,
            currentQuestion: activeFlow.current_question_index
          });

          // Download audio
          const audioBuffer = await WhatsAppService.downloadMedia(audioId);

          // Save to temp file for transcription
          const audioPath = path.join(TEMP_DIR, `comprehension_${Date.now()}.ogg`);
          fs.writeFileSync(audioPath, audioBuffer);

          logToFile('Audio saved for comprehension answer', { audioPath });

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
            .select('language')
            .eq('id', assessmentId)
            .single();
          const language = assessment?.language || 'en';

          // Evaluate answer
          const answerEvaluation = await ComprehensionService.evaluateAnswer(
            questionData,
            audioPath,
            language
          );

          // Clean up temp file
          fs.unlinkSync(audioPath);

          logToFile('Comprehension answer evaluated', {
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

          logToFile('🔄 Comprehension progress check', {
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
              hasImage: !!nextQuestion.imageUrl,
              questionText: nextQuestion.question.substring(0, 50) + '...'
            });

            // Handle image questions (word-level comprehension)
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

            // State already updated in Redis by recordAnswer
            logToFile('✅ Next comprehension question sent, state updated in Redis', {
              questionIndex: nextQuestionIndex,
              totalQuestions: questions.length,
              answersStored: updatedFlow.answers.length
            });
          } else {
            // All questions answered - finalize comprehension assessment
            const answers = updatedFlow.answers;
            logToFile('🎉 All comprehension questions answered - finalizing assessment', {
              assessmentId,
              totalAnswers: answers.length,
              correctAnswers: answers.filter(a => a.correct).length,
              score: Math.round((answers.filter(a => a.correct).length / answers.length) * 100) + '%'
            });

            // Get assessment for grade level
            const { data: assessmentData } = await supabase
              .from('reading_assessments')
              .select('grade_level')
              .eq('id', assessmentId)
              .single();

            // Analyze comprehension results
            const comprehensionAnalysis = await ComprehensionService.analyzeComprehension(
              questions,
              answers,
              assessmentData.grade_level,
              language
            );

            // Save to reading_assessments table (proper persistence)
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

            // Clear Redis state (no conversations table cleanup needed)
            await RedisComprehensionService.clearFlow(assessmentId);

            // Import AnalysisService to generate combined report
            const AnalysisService = require('../services/reading/analysis.service');

            // Generate combined fluency + comprehension report
            try {
              await AnalysisService.generateCombinedReport(
                assessmentId,
                user.id,
                from,
                user.preferred_language || 'en'
              );

              logToFile('✅ Comprehension assessment completed and combined report generated');
            } catch (reportError) {
              logToFile('❌ CRITICAL: Failed to generate combined report after comprehension completion', {
                assessmentId,
                userId: user.id,
                error: reportError.message,
                stack: reportError.stack,
                errorType: 'COMPREHENSION_REPORT_GENERATION_FAILED'
              });

              // Send error message to user
              const errorMessages = {
                en: "I've recorded all your answers but encountered an error generating the report. Please try /reading test again.",
                ur: "میں نے آپ کے تمام جوابات ریکارڈ کر لیے ہیں لیکن رپورٹ بناتے وقت خرابی آگئی۔ براہ کرم /reading test دوبارہ کریں۔",
                ar: "لقد سجلت جميع إجاباتك ولكن حدث خطأ عند إنشاء التقرير. يرجى المحاولة مرة أخرى باستخدام /reading test",
                es: "He registrado todas tus respuestas pero ocurrió un error al generar el informe. Por favor intenta /reading test nuevamente."
              };

              const userLanguage = user.preferred_language || 'en';
              await WhatsAppService.sendMessage(from, errorMessages[userLanguage] || errorMessages.en);
            }
          }

          return; // Exit early - comprehension flow handled
        }
      } catch (error) {
        if (error.code !== 'PGRST116') { // Ignore "no rows found"
          logToFile('⚠️ Error checking comprehension state', {
            error: error.message,
            stack: error.stack
          });
        }
        // CRITICAL FIX: Don't continue to normal conversation if comprehension was being processed
        // Check if we were in comprehension flow by checking the database
        if (user) {
          const { data: recentAssessment } = await supabase
            .from('reading_assessments')
            .select('status')
            .eq('user_id', user.id)
            .eq('status', 'comprehension_completed')
            .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Within last 10 minutes
            .single();

          if (recentAssessment) {
            logToFile('⚠️ Comprehension was completed but error occurred. Preventing fallthrough to normal conversation.');
            return; // Exit to prevent normal conversation processing
          }
        }
      }
    }

    // PRIORITY 2: CHECK FOR ACTIVE READING ASSESSMENT (Student Reading Recording)
    // Comes after comprehension check to avoid interference
    if (user) {
      try {
        // Abandon any stale comprehension flows before processing new reading
        const RedisComprehensionService = require('../services/redis-comprehension.service');
        await RedisComprehensionService.abandonUserFlows(user.id);

        // FIX: Only find assessments created in last 30 minutes (prevents finding old abandoned assessments)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: activeAssessment } = await supabase
          .from('reading_assessments')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'passage_generated')
          .gte('created_at', thirtyMinutesAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (activeAssessment) {
          // FIX 2: Validate assessment state to detect stale reads and invalid states
          const validationErrors = [];

          // Validation 1: Check assessment age (reject if >30 minutes old)
          const assessmentAge = Date.now() - new Date(activeAssessment.created_at).getTime();
          const MAX_ASSESSMENT_AGE_MS = 30 * 60 * 1000; // 30 minutes

          if (assessmentAge > MAX_ASSESSMENT_AGE_MS) {
            validationErrors.push(`Assessment too old: ${Math.round(assessmentAge / 60000)} minutes`);
          }

          // Validation 2: Check audio_url is NULL (should be NULL for 'passage_generated' status)
          if (activeAssessment.audio_url !== null) {
            validationErrors.push(`Invalid state: audio_url is ${activeAssessment.audio_url} but status is 'passage_generated'`);
          }

          // Validation 3: Check student_identifier exists
          if (!activeAssessment.student_identifier) {
            validationErrors.push('Missing student_identifier');
          }

          // If validation fails, log critical error and notify user
          if (validationErrors.length > 0) {
            logToFile('🚨 CRITICAL: Invalid assessment state detected - possible stale read or data corruption', {
              assessmentId: activeAssessment.id,
              userId: user.id,
              status: activeAssessment.status,
              audio_url: activeAssessment.audio_url,
              student_identifier: activeAssessment.student_identifier,
              created_at: activeAssessment.created_at,
              assessmentAge: Math.round(assessmentAge / 60000) + ' minutes',
              validationErrors,
              errorType: 'STALE_READ_OR_INVALID_STATE'
            });

            // Notify user in their preferred language
            const errorMessages = {
              en: "I found an assessment that's no longer active. Please start a new reading assessment with /reading test",
              ur: "مجھے ایک تشخیص ملا جو اب فعال نہیں ہے۔ براہ کرم /reading test کے ساتھ نیا reading assessment شروع کریں",
              ar: "وجدت تقييمًا لم يعد نشطًا. يرجى بدء تقييم قراءة جديد باستخدام /reading test",
              es: "Encontré una evaluación que ya no está activa. Por favor, inicia una nueva evaluación de lectura con /reading test"
            };

            const userLanguage = user.preferred_language || 'en';
            const errorMessage = errorMessages[userLanguage] || errorMessages.en;

            typingController.stop();
            await WhatsAppService.sendMessage(from, errorMessage);

            return; // Exit - don't process this invalid assessment
          }

          // Validation passed - proceed with normal processing
          logToFile('✅ Assessment validation passed - processing as student reading', {
            assessmentId: activeAssessment.id,
            language: activeAssessment.language,
            gradeLevel: activeAssessment.grade_level,
            assessmentAge: Math.round(assessmentAge / 60000) + ' minutes'
          });

          // FIX 5: Enhanced error logging for reading assessment processing
          logToFile('📥 Starting reading assessment audio processing', {
            assessmentId: activeAssessment.id,
            userId: user.id,
            sessionId,
            studentIdentifier: activeAssessment.student_identifier,
            status: activeAssessment.status,
            audioId,
            from
          });

          try {
            // Download audio
            const audioBuffer = await WhatsAppService.downloadMedia(audioId);

            logToFile('✓ Audio downloaded successfully', {
              assessmentId: activeAssessment.id,
              bufferSize: audioBuffer.length,
              sizeKB: Math.round(audioBuffer.length / 1024)
            });

            // Get audio metadata
            const audioMetadata = await WhatsAppService.getMediaInfo(audioId);
            const audioDuration = audioMetadata?.audio?.duration || audioMetadata?.voice?.duration || 0;
            const audioFormat = message.audio ? 'audio' : 'voice';

            logToFile('✓ Audio metadata retrieved', {
              assessmentId: activeAssessment.id,
              duration: audioDuration,
              format: audioFormat,
              mimeType: audioMetadata?.mime_type
            });

            // Save to temp file for upload
            const audioPath = path.join(TEMP_DIR, `reading_${activeAssessment.id}_${Date.now()}.ogg`);
            fs.writeFileSync(audioPath, audioBuffer);

            logToFile('✓ Audio saved to temp file', {
              assessmentId: activeAssessment.id,
              audioPath
            });

            // Upload audio to R2
            const audioUrl = await uploadAudio(audioPath, user.id, audioId);

            logToFile('✓ Audio uploaded to R2', {
              assessmentId: activeAssessment.id,
              audioUrl
            });

            // Clean up temp file
            fs.unlinkSync(audioPath);

            logToFile('✓ Temp file cleaned up', {
              assessmentId: activeAssessment.id
            });

            // Stop typing indicator
            typingController.stop();

            // Import ReadingAssessmentService
            const ReadingAssessmentService = require('../services/reading-assessment.service');

            // Route to reading assessment service
            logToFile('🔀 Routing to reading assessment service', {
              assessmentId: activeAssessment.id,
              userId: user.id,
              sessionId,
              audioUrl,
              duration: audioDuration
            });

            await ReadingAssessmentService.handleAudioReceipt(
              user.id,
              sessionId,
              from,
              {
                url: audioUrl,
                duration: audioDuration,
                format: audioFormat,
                sizeBytes: audioBuffer.length
              },
              user.preferred_language || 'en'
            );

            logToFile('✅ Reading assessment audio processing completed successfully', {
              assessmentId: activeAssessment.id,
              userId: user.id
            });

            return; // Exit early - reading assessment flow handled

          } catch (processingError) {
            // FIX 5: Enhanced error logging for processing failures
            logToFile('🚨 CRITICAL: Reading assessment audio processing failed', {
              assessmentId: activeAssessment.id,
              userId: user.id,
              sessionId,
              studentIdentifier: activeAssessment.student_identifier,
              audioId,
              error: processingError.message,
              errorStack: processingError.stack,
              errorName: processingError.name,
              errorCode: processingError.code,
              from,
              timestamp: new Date().toISOString(),
              errorType: 'READING_ASSESSMENT_PROCESSING_ERROR'
            });

            // Stop typing indicator
            typingController.stop();

            // Send error message to user
            const errorMessages = {
              en: "Sorry, there was an error processing the reading assessment. Please try again with /reading test",
              ur: "معذرت، reading assessment پر کارروائی کرتے وقت خرابی آ گئی۔ براہ کرم /reading test کے ساتھ دوبارہ کوشش کریں",
              ar: "عذراً، حدث خطأ أثناء معالجة تقييم القراءة. يرجى المحاولة مرة أخرى باستخدام /reading test",
              es: "Lo siento, hubo un error al procesar la evaluación de lectura. Por favor, inténtalo de nuevo con /reading test"
            };

            const userLanguage = user.preferred_language || 'en';
            const errorMessage = errorMessages[userLanguage] || errorMessages.en;

            await WhatsAppService.sendMessage(from, errorMessage);

            // Re-throw to be caught by outer handler
            throw processingError;
          }
        }
      } catch (error) {
        // If no active assessment or error, continue with normal flow
        // FIX 5: Enhanced logging for assessment query errors
        if (error.code !== 'PGRST116') { // Not a "no rows found" error
          logToFile('⚠️ Error checking for active reading assessment', {
            userId: user.id,
            error: error.message,
            errorCode: error.code,
            errorStack: error.stack,
            errorName: error.name
          });
        } else {
          logToFile('No active reading assessment found (normal)', {
            userId: user.id,
            errorCode: error.code
          });
        }
      }
    }

    // PRIORITY 3: CHECK FOR ACTIVE COACHING SESSION (Reflective Question Response)
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
          logToFile('🎓 Active coaching session detected - processing as reflective response', {
            coachingSessionId: activeCoaching.id,
            conversationState: activeCoaching.conversation_state?.current_state
          });

          // Download audio as buffer (same pattern as line 181 below)
          const audioBuffer = await WhatsAppService.downloadMedia(audioId);

          // Save to temp file for transcription
          const audioPath = path.join(TEMP_DIR, `audio_${Date.now()}.ogg`);
          fs.writeFileSync(audioPath, audioBuffer);

          // Get user's language preference for ASR routing
          const coachingUserLanguage = await getUserLanguage(user.id);

          // Transcribe audio with language-aware routing
          const transcriptionResult = await AudioService.transcribeWithLanguagePreference(audioPath, coachingUserLanguage);
          const transcript = transcriptionResult.text;
          const detectedLanguage = transcriptionResult.language;

          logToFile('Voice transcribed for reflective response', {
            transcript: transcript.substring(0, 100),
            detectedLanguage,
            asrEngine: transcriptionResult.engine,
            userLanguage: coachingUserLanguage
          });

          // Clean up audio file
          fs.unlinkSync(audioPath);

          // Stop typing indicator
          typingController.stop();

          // Route to coaching service as reflective response
          await CoachingService.handleReflectiveResponse(
            activeCoaching.id,
            from,
            transcript,
            'voice',
            detectedLanguage
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

    // CLASSROOM COACHING DETECTION: Check audio duration before processing
    try {
      const audioMetadata = await WhatsAppService.getMediaInfo(audioId);
      const audioDuration = audioMetadata?.audio?.duration || audioMetadata?.voice?.duration || 0;
      const audioDurationRounded = Math.round(audioDuration); // Round to integer for database
      const audioFormat = message.audio ? 'audio' : 'voice'; // 'audio' = document, 'voice' = voice message

      logToFile('Audio metadata retrieved', {
        duration: audioDuration,
        durationRounded: audioDurationRounded,
        format: audioFormat,
        mimeType: audioMetadata.mime_type
      });

      // Check if audio is 15+ minutes (900 seconds) = classroom audio
      const CLASSROOM_AUDIO_THRESHOLD = 900; // 15 minutes in seconds

      if (audioDurationRounded >= CLASSROOM_AUDIO_THRESHOLD) {
        logToFile('🎓 CLASSROOM AUDIO DETECTED (15+ minutes)', {
          duration: audioDuration,
          durationMinutes: Math.round(audioDuration / 60)
        });

        // Stop typing indicator
        typingController.stop();

        // Opus format warning (if voice message)
        if (audioFormat === 'voice') {
          const mimeType = audioMetadata.mime_type || '';
          const isOpus = mimeType.includes('opus') || mimeType.includes('ogg');

          if (isOpus) {
            await WhatsAppService.sendMessage(from,
              "⚠️ I noticed you sent this as a voice message. For best analysis quality, " +
              "I recommend sending classroom recordings as a document (tap 📎 → Document).\n\n" +
              "I'll proceed with analyzing this audio, but the transcription quality may be affected."
            );
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
          }
        }

        // Route to classroom coaching flow
        if (user && sessionId) {
          await CoachingService.initiateCoachingSession(
            user.id,
            sessionId,
            audioId,
            from,
            audioDurationRounded
          );
        } else {
          await WhatsAppService.sendMessage(from,
            "Please complete your registration first before using classroom coaching. Type /register to get started."
          );
        }

        return; // Exit early - coaching flow will handle everything
      }

      logToFile('Regular voice message (< 15 minutes) - proceeding with normal flow');
    } catch (metadataError) {
      logToFile('⚠️ Could not get audio metadata, proceeding with normal flow', {
        error: metadataError.message
      });
      // Continue with normal flow if metadata fetch fails
    }

    // Step 1: Download audio from WhatsApp (normal voice message flow)
    logToFile('Step 1: Downloading audio from WhatsApp...');
    const audioBuffer = await WhatsAppService.downloadMedia(audioId);
    logToFile('Audio downloaded', { bufferSize: audioBuffer.length });

    // Step 2: Upload audio to R2 storage
    logToFile('Step 2: Uploading audio to R2 storage...');
    let audioUrl = null;
    const oggPath = path.join(TEMP_DIR, `audio_${Date.now()}.ogg`);
    fs.writeFileSync(oggPath, audioBuffer);
    try {
      audioUrl = await uploadAudio(oggPath, from, message.id);
      logToFile('✅ Audio uploaded to R2', { audioUrl });
    } catch (error) {
      logToFile('⚠️ Failed to upload audio to R2', { error: error.message });
    }
    // Clean up OGG file
    if (fs.existsSync(oggPath)) {
      fs.unlinkSync(oggPath);
    }

    // Step 3: Convert to WAV for Soniox
    logToFile('Step 3: Converting audio to WAV...');
    const wavPath = path.join(TEMP_DIR, `audio_${Date.now()}.wav`);
    await AudioService.convertToWav(audioBuffer, wavPath);
    logToFile('Audio converted to WAV', { wavPath });

    // Step 4: Transcribe using language-aware ASR routing
    // Routes to Soniox (7 languages) or MMS-ASR (bal-PK, sd-PK, ps-PK)
    const userPreferredLanguage = user ? await getUserLanguage(user.id) : 'en';

    logToFile('Step 4: Transcribing audio with ASR routing...', {
      userPreferredLanguage,
      asrEngine: AudioService.getASREngine(userPreferredLanguage)
    });

    const transcriptionResult = await AudioService.transcribeWithLanguagePreference(wavPath, userPreferredLanguage);
    const transcription = transcriptionResult.text;
    const sonioxLanguage = transcriptionResult.language;

    // Log ASR engine used for Axiom analytics
    logToFile('🎤 ASR transcription complete', {
      asrEngine: transcriptionResult.engine,
      userLanguage: userPreferredLanguage,
      detectedLanguage: sonioxLanguage,
      transcriptLength: transcription?.length || 0
    });

    // Language detection with GPT-4o-mini confirmation for ambiguous cases
    // This handles: Urdu vs Sindhi vs Balochi vs Pashto (all use similar scripts)
    const LanguageDetectorService = require('../services/language-detector.service');
    let detectedLanguage = await LanguageDetectorService.getConfirmedLanguage(transcription, sonioxLanguage);

    logToFile('Transcription received', {
      transcription,
      sonioxLanguage,
      confirmedLanguage: detectedLanguage
    });

    // Clean up WAV file
    fs.unlinkSync(wavPath);

    if (!transcription || transcription.trim() === '') {
      logToFile('⚠️ Empty transcription - sending error message to user');
      typingController.stop(); // Stop typing indicator before sending error message
      await WhatsAppService.sendMessage(from, 'معذرت، میں آپ کا پیغام سمجھ نہیں سکی۔');
      return;
    }

    // Check for explicit language switch command in voice transcription
    const { detectLanguageOverride } = require('../utils/language-detector');

    // Get current language preference using user ID
    const currentUserLanguage = user ? await getUserLanguage(user.id) : 'en';

    // BUG FIX: Check if user has locked their language preference
    // If language_locked = true, use their preferred_language instead of GPT detection
    // This prevents auto-detection from overriding explicit user choice
    if (user && user.language_locked === true) {
      logToFile('Language preference is LOCKED - using user preference over GPT detection', {
        gptDetected: detectedLanguage,
        userPreference: user.preferred_language,
        using: user.preferred_language
      });
      detectedLanguage = user.preferred_language || currentUserLanguage;
    } else {
      // Auto-detect mode: GPT detection is used (detectedLanguage already set above)
      logToFile('Language preference is UNLOCKED - using GPT detection', {
        gptDetected: detectedLanguage,
        userPreference: user?.preferred_language,
        using: detectedLanguage
      });
    }

    // Check if user said a language switch command
    const overrideLanguage = detectLanguageOverride(transcription);
    if (overrideLanguage && overrideLanguage !== currentUserLanguage) {
      // Update user's language preference using user ID
      if (user) {
        await setUserLanguage(user.id, overrideLanguage);
      }
      detectedLanguage = overrideLanguage; // Use the explicitly requested language

      logToFile('Language switched by voice command', {
        from: currentUserLanguage,
        to: overrideLanguage,
        command: transcription
      });

      // Send confirmation in new language (voice)
      const confirmations = {
        en: "I've switched to English. How can I help you today?",
        ur: "میں نے اردو میں تبدیل کر دیا ہے۔ آج میں آپ کی کیسے مدد کر سکتی ہوں؟",
        ar: "لقد تحولت إلى اللغة العربية. كيف يمكنني مساعدتك اليوم؟",
        es: "He cambiado al español. ¿Cómo puedo ayudarte hoy?",
        'pa-PK': "میں پنجابی وچ بدل گئی ہاں۔ آج میں تہاڈی کیویں مدد کر سکدی ہاں؟",
        'ps-PK': "زه پښتو ته بدل شوم. نن زه ستاسو څنګه مرسته کولای شم؟",
        'sd-PK': "مون سنڌيءَ ۾ تبديل ڪيو. اڄ مان توهان جي ڪيئن مدد ڪري سگهان ٿي؟",
        'bal-PK': "من بلوچی ءَ بدل کتگ۔ اڈا من شما ءِ کمک چے کنگ ءَ توانیں؟",
        'ta-LK': "நான் தமிழுக்கு மாறிவிட்டேன். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?"
      };

      // Generate and send voice confirmation
      const confirmationSpeech = await AudioService.generateSpeechForLanguage(
        confirmations[overrideLanguage],
        overrideLanguage
      );
      typingController.stop();
      await WhatsAppService.sendAudio(from, confirmationSpeech, TEMP_DIR);

      logToFile('✅ Language switch confirmation sent via voice');
    }

    // Session was already created at the start of the handler (for classroom coaching detection)
    // No need to create it again here

    // Store user voice message in database with session and language
    if (user && sessionId) {
      try {
        await storeConversation(
          user.id,
          'user',
          transcription,
          'voice',
          sessionId,
          'voice', // inputFormat
          detectedLanguage, // inputLanguage
          null, // outputFormat (not applicable for user messages)
          null  // outputLanguage (not applicable for user messages)
        );
        logToFile('✅ User voice message stored in database with session and language');
      } catch (error) {
        logToFile('⚠️ Failed to store user voice message', { error: error.message });
      }
    }

    // ============================================================
    // MENU SYSTEM INTEGRATION (for voice)
    // ============================================================

    // Check for /menu command in transcription
    const transcriptionLower = transcription.toLowerCase().trim();
    if (transcriptionLower === '/menu' || transcriptionLower === 'menu' || transcriptionLower.includes('/menu')) {
      logToFile('📋 Menu command detected in voice transcription');
      typingController.stop();

      if (user && sessionId) {
        await MenuService.sendMenu(from, user.id, sessionId);
      } else {
        await WhatsAppService.sendMessage(from, "Please complete registration first.");
      }
      return; // Exit early
    }

    // Get current conversation state to check for menu flows
    let conversationState = null;
    if (user && sessionId) {
      try {
        const { data: conversation } = await supabase
          .from('conversations')
          .select('conversation_state')
          .eq('user_id', user.id)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        conversationState = conversation?.conversation_state?.current_state || null;
        logToFile('Conversation state retrieved (voice)', { state: conversationState });
      } catch (error) {
        if (error.code !== 'PGRST116') { // Ignore "no rows found"
          logToFile('⚠️ Error retrieving conversation state', { error: error.message });
        }
      }
    }

    // Handle menu choice (1-4 or words like "one", "two", etc.)
    if (conversationState === 'AWAITING_MENU_CHOICE' && user && sessionId) {
      const choice = transcription.trim();
      const numericChoice = choice.match(/[1-4]/)?.[0]; // Extract numeric digit
      const wordToNumber = {
        'one': '1', 'ایک': '1',
        'two': '2', 'دو': '2',
        'three': '3', 'تین': '3',
        'four': '4', 'چار': '4'
      };
      const choiceLower = choice.toLowerCase();
      const mappedChoice = wordToNumber[choiceLower] || numericChoice;

      if (mappedChoice && ['1', '2', '3', '4'].includes(mappedChoice)) {
        logToFile('📋 Menu choice detected in voice', { choice: mappedChoice, original: choice });
        typingController.stop();

        await MenuService.handleMenuChoice(
          mappedChoice,
          user.id,
          sessionId,
          from,
          'voice', // messageFormat
          detectedLanguage
        );
        return; // Exit early
      }
    }

    // Handle video topic request (Issue #28: Route to AI Video Generation)
    // Support both old state name (AWAITING_MEDIA_LIBRARY_QUERY) and new (AWAITING_VIDEO_TOPIC) for transition
    if ((conversationState === 'AWAITING_VIDEO_TOPIC' || conversationState === 'AWAITING_MEDIA_LIBRARY_QUERY') && user && sessionId) {
      logToFile('🎬 Video topic received via voice - routing to AI video generation');
      typingController.stop();

      // Route to AI video generation with user's topic (from voice transcription)
      await VideoOrchestrator.initiateVideoRequest(user, from, sessionId, detectedLanguage, transcription.trim());

      // Clear the awaiting state
      try {
        await supabase.from('chat_sessions').update({ conversation_state: null }).eq('id', sessionId);
      } catch (error) {
        logToFile('⚠️ Failed to clear conversation state', { error: error.message });
      }

      return; // Exit early
    }

    // Step 5: Detect intent from transcription
    logToFile('Step 5: Detecting intent from transcription...');
    const intent = await OpenAIService.detectIntent(transcription);
    logToFile('Intent detected', { intent: intent.type });

    // Update session type for voice messages
    if (sessionId && intent.type !== 'general') {
      try {
        const sessionType = intent.type === 'lesson_plan' || intent.type === 'presentation'
          ? intent.type
          : 'audio_coaching';
        await updateSessionType(sessionId, sessionType);
        logToFile('✅ Session type updated for voice', { sessionType });
      } catch (error) {
        logToFile('⚠️ Failed to update session type', { error: error.message });
      }
    }

    // Step 6: Get AI response with format-aware prompting (voice format, detected language)
    logToFile('Step 6: Getting AI response (format-aware for voice)...');

    // Get firstName from user if registered
    const firstName = user?.first_name || null;

    const aiResponse = await OpenAIService.getResponseWithFormat(
      transcription,
      user.id, // Use UUID, not phone number - for DB conversation history
      'voice', // outputFormat: voice response
      detectedLanguage, // outputLanguage: mirror user's language
      firstName // firstName: for personalization
    );
    logToFile('AI response generated (format-aware)', {
      response: aiResponse,
      language: detectedLanguage,
      firstName,
      hasEmotionTags: /\[[\w]+\]/.test(aiResponse)
    });

    // Step 7: Generate speech using appropriate TTS service based on language
    logToFile('Step 7: Generating speech for language:', { language: detectedLanguage });
    const speechBuffer = await AudioService.generateSpeechForLanguage(aiResponse, detectedLanguage);
    logToFile('Speech generated', {
      bufferSize: speechBuffer.length,
      ttsService: detectedLanguage === 'en' ? 'ElevenLabs' : 'Uplift'
    });

    // Step 8: Send audio response (stop typing indicator first)
    logToFile('Step 8: Sending audio response...');
    typingController.stop();
    await WhatsAppService.sendAudio(from, speechBuffer, TEMP_DIR);

    logToFile('✅ Voice acknowledgment sent successfully!');

    // Step 8.5: Send loading sticker if intent is presentation or lesson plan
    if (intent.type === 'lesson_plan' || intent.type === 'presentation') {
      logToFile('Step 8.5: Sending loading sticker...');
      try {
        if (LOADING_STICKER_MEDIA_ID) {
          // Use cached media ID for instant sending
          await WhatsAppService.sendSticker(from, LOADING_STICKER_MEDIA_ID);
          logToFile('Loading sticker sent successfully (cached ID)');
        } else {
          // Fallback: Upload sticker file
          logToFile('⚠️ No cached media ID, uploading sticker file...');
          await WhatsAppService.sendSticker(from, LOADING_STICKER_PATH);
          logToFile('Loading sticker sent successfully (uploaded)');
        }
      } catch (error) {
        logToFile('⚠️ Failed to send loading sticker', { error: error.message });
        // Continue without loading sticker
      }
    }

    // Store bot voice response in database with session and language
    if (user && sessionId) {
      try {
        await storeConversation(
          user.id,
          'assistant',
          aiResponse,
          'voice',
          sessionId,
          null, // inputFormat (not applicable for assistant messages)
          null, // inputLanguage (not applicable for assistant messages)
          'voice', // outputFormat
          detectedLanguage // outputLanguage
        );
        logToFile('✅ Bot voice response stored in database with session and language');
      } catch (error) {
        logToFile('⚠️ Failed to store bot voice response', { error: error.message });
      }

      // Store audio session
      if (audioUrl) {
        try {
          await storeAudioSession(user.id, audioUrl, 0, transcription);
          logToFile('✅ Audio session stored in database');
        } catch (error) {
          logToFile('⚠️ Failed to store audio session', { error: error.message });
        }
      }
    }

    // Step 9: If lesson plan or presentation request, generate materials
    if (intent.type === 'lesson_plan') {
      await handleVoiceLessonPlanRequest(from, transcription, user, sessionId, detectedLanguage);
    } else if (intent.type === 'presentation') {
      await handleVoicePresentationRequest(from, transcription, user, sessionId, detectedLanguage);
    }

    logToFile('✅ Voice message processing completed!');
  } catch (error) {
    logToFile('❌ Error processing voice message', {
      error: error.message,
      stack: error.stack,
      errorDetails: error.response?.data
    });
    typingController.stop(); // Stop typing indicator before sending error message
    await WhatsAppService.sendMessage(
      from,
      'معذرت، آواز پیغام پر کارروائی کرتے وقت خرابی آ گئی۔' // Sorry, error processing voice message
    );
  } finally {
    // CRITICAL: Always stop typing indicator, even if function exits early or throws
    typingController.stop();
  }
}

/**
 * Handle lesson plan request from voice message
 * @param {string} from - Sender phone number
 * @param {string} transcription - Transcribed text
 * @param {Object|null} user - User object from database
 * @param {string|null} sessionId - Session ID
 * @param {string} detectedLanguage - Detected language ('en' or 'ur')
 * @returns {Promise<void>}
 */
async function handleVoiceLessonPlanRequest(from, transcription, user, sessionId, detectedLanguage) {
  logToFile('Queueing lesson plan from voice request...');
  try {
    // Extract topic
    const topic = await OpenAIService.extractTopic(transcription);
    logToFile('Topic extracted', { topic });

    // Detect explicitly requested language from transcription (defaults to 'en')
    const contentLanguage = detectRequestedLanguage(transcription);
    logToFile('Content language detected for voice lesson plan', { contentLanguage });

    // Queue lesson plan for async processing (survives server restarts)
    if (user) {
      const requestId = await LessonPlanQueueService.createAndQueue({
        userId: user.id,
        phoneNumber: from,
        topic,
        fullMessage: transcription,
        language: contentLanguage,
        contentType: 'lesson_plan'
      });

      logToFile('✅ Voice lesson plan queued for async processing', {
        requestId,
        userId: user.id,
        topic
      });

      // Store acknowledgment in conversations
      try {
        const ackMessage = 'میں آپ کے لیے ایک تفصیلی پانچ مرحلہ سبق کا منصوبہ تیار کر رہی ہوں۔ براہ کرم تھوڑا انتظار کریں...';
        await storeConversation(user.id, 'assistant', ackMessage, 'text', sessionId);
      } catch (error) {
        logToFile('⚠️ Failed to store acknowledgment', { error: error.message });
      }
    } else {
      logToFile('⚠️ Cannot queue voice lesson plan - no user account', { from });
      await WhatsAppService.sendMessage(from, 'معذرت، سبق کا منصوبہ بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔');
    }
  } catch (error) {
    logToFile('❌ Error queueing lesson plan from voice request', {
      error: error.message,
      stack: error.stack
    });
    await WhatsAppService.sendMessage(
      from,
      'معذرت، سبق کا منصوبہ بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔'
    );
  }
}

/**
 * Handle presentation request from voice message
 * @param {string} from - Sender phone number
 * @param {string} transcription - Transcribed text
 * @param {Object|null} user - User object from database
 * @param {string|null} sessionId - Session ID
 * @param {string} detectedLanguage - Detected language ('en' or 'ur')
 * @returns {Promise<void>}
 */
async function handleVoicePresentationRequest(from, transcription, user, sessionId, detectedLanguage) {
  logToFile('Queueing presentation from voice request...');
  try {
    // Extract topic
    const topic = await OpenAIService.extractTopic(transcription);
    logToFile('Topic extracted', { topic });

    // Detect explicitly requested language from transcription (defaults to 'en')
    const contentLanguage = detectRequestedLanguage(transcription);
    logToFile('Content language detected for voice presentation', { contentLanguage });

    // Queue presentation for async processing (survives server restarts)
    if (user) {
      const requestId = await LessonPlanQueueService.createAndQueue({
        userId: user.id,
        phoneNumber: from,
        topic,
        fullMessage: transcription,
        language: contentLanguage,
        contentType: 'presentation'
      });

      logToFile('✅ Voice presentation queued for async processing', {
        requestId,
        userId: user.id,
        topic
      });

      // Store acknowledgment in conversations
      try {
        const ackMessage = 'میں آپ کے لیے ایک تعلیمی پریزنٹیشن تیار کر رہی ہوں۔ براہ کرم تھوڑا انتظار کریں...';
        await storeConversation(user.id, 'assistant', ackMessage, 'text', sessionId);
      } catch (error) {
        logToFile('⚠️ Failed to store acknowledgment', { error: error.message });
      }
    } else {
      logToFile('⚠️ Cannot queue voice presentation - no user account', { from });
      await WhatsAppService.sendMessage(from, 'معذرت، پریزنٹیشن بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔');
    }
  } catch (error) {
    logToFile('❌ Error queueing presentation from voice request', {
      error: error.message,
      stack: error.stack
    });
    await WhatsAppService.sendMessage(
      from,
      'معذرت، پریزنٹیشن بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔'
    );
  }
}

// checkAndTriggerRegistration() REMOVED - Feature-based registration replaces turn-based
// Registration now triggers after first feature completion via FeatureRegistrationService

module.exports = {
  handleVoiceMessage
};
