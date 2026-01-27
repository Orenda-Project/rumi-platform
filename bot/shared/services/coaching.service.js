const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const AudioService = require('./audio.service');
const GPT5MiniService = require('./gpt5-mini.service');
const WhatsAppService = require('./whatsapp.service');
const ContentService = require('./content.service');
const FeatureRegistrationService = require('./feature-registration.service');
const { uploadClassroomAudio, uploadLessonPlan, uploadVoiceDebrief } = require('../storage/r2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { TEMP_DIR, LISTENING_ANIMATION_MEDIA_ID, PEDAGOGICAL_ANALYSIS_MEDIA_ID } = require('../utils/constants');
const OpenAI = require('openai');

/**
 * Coaching Service
 * Orchestrates the complete classroom observation and pedagogical coaching workflow
 */
class CoachingService {
  /**
   * Initiate a new coaching session
   * @param {string} userId - User's UUID from database
   * @param {string} sessionId - Chat session UUID
   * @param {string} audioId - WhatsApp audio media ID
   * @param {string} from - User's WhatsApp phone number
   * @param {number} audioDuration - Audio duration in seconds
   * @returns {Promise<object>} Created coaching session
   */
  static async initiateCoachingSession(userId, sessionId, audioId, from, audioDuration) {
    try {
      logToFile('Initiating coaching session', {
        userId,
        sessionId,
        audioId,
        audioDuration
      });

      // Check if user is registered
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('registration_completed, name, first_name, last_name')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Registration no longer required upfront - feature-based registration happens after first feature

      // Create coaching_sessions record
      const { data: coachingSession, error: createError } = await supabase
        .from('coaching_sessions')
        .insert({
          user_id: userId,
          session_id: sessionId,
          audio_id: audioId,
          audio_duration_seconds: audioDuration,
          status: 'initiated',
          conversation_state: {
            current_state: 'AWAITING_CONFIRMATION',
            questions_answered: 0,
            questions: [],
            skipped: false,
            started_at: new Date().toISOString(),
            last_interaction: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logToFile('❌ Error creating coaching session', { error: createError });
        throw createError;
      }

      logToFile('✅ Coaching session created', {
        coachingSessionId: coachingSession.id,
        status: coachingSession.status
      });

      // Send confirmation message with buttons
      const confirmationMessage = `I detected a ${Math.round(audioDuration / 60)}-minute audio recording.\n\nIs this classroom audio you'd like me to analyze using research-based pedagogical frameworks?`;

      await WhatsAppService.sendInteractiveButtons(from, {
        body: confirmationMessage,
        buttons: [
          { id: `coaching_confirm_${coachingSession.id}`, title: 'Yes, Analyze' },
          { id: `coaching_cancel_${coachingSession.id}`, title: 'No' }
        ]
      });

      return coachingSession;
    } catch (error) {
      logToFile('❌ Error in initiateCoachingSession', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Handle confirmation button response
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {boolean} confirmed - Whether user confirmed
   */
  static async handleConfirmation(coachingSessionId, from, confirmed) {
    try {
      logToFile('Handling coaching confirmation', { coachingSessionId, confirmed });

      if (!confirmed) {
        // User declined - update status and exit
        await supabase
          .from('coaching_sessions')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString()
          })
          .eq('id', coachingSessionId);

        await WhatsAppService.sendMessage(from, "No problem! If you'd like to analyze classroom audio in the future, just send me a recording.");
        return;
      }

      // Get coaching session to retrieve audio_id
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('audio_id')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      // User confirmed - update status and queue transcription
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          conversation_state: {
            current_state: 'TRANSCRIBING',
            questions_answered: 0,
            questions: [],
            skipped: false,
            started_at: new Date().toISOString(),
            last_interaction: new Date().toISOString()
          }
        })
        .eq('id', coachingSessionId);

      // Send progress message (no time estimate)
      await WhatsAppService.sendMessage(from,
        "✅ Classroom audio received! I'll start analyzing it now and send you updates as I progress.\n\nYou can continue chatting with me while I work on this in the background."
      );

      // Queue transcription job with audioId
      await this._queueJob(coachingSessionId, 'transcription', {
        from,
        audioId: session.audio_id
      });

      logToFile('✅ Transcription job queued', { coachingSessionId });
    } catch (error) {
      logToFile('❌ Error in handleConfirmation', {
        error: error.message,
        coachingSessionId
      });
      throw error;
    }
  }

  /**
   * Process transcription job (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload with metadata
   */
  static async processTranscription(coachingSessionId, payload) {
    const tempAudioPath = path.join(TEMP_DIR, `classroom_${coachingSessionId}_${Date.now()}.ogg`);

    try {
      // Ensure temp directory exists
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      logToFile('🔄 Starting transcription processing', { coachingSessionId });

      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('*, users!inner(phone_number, first_name)')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      const from = payload.from || session.users.phone_number;

      // Update status
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'transcribing',
          transcription_started_at: new Date().toISOString()
        })
        .eq('id', coachingSessionId);

      // Send progress update with listening animation
      await WhatsAppService.sendMessage(from, "🔄 Step 1/5: Transcribing your classroom audio. This may take 30-60 seconds...hang in there!");

      // Send listening animation if available
      if (LISTENING_ANIMATION_MEDIA_ID) {
        await WhatsAppService.sendSticker(from, LISTENING_ANIMATION_MEDIA_ID);
      }

      // Download audio from WhatsApp
      // Note: We need to store the audio_id during initiation or get it from another source
      // For now, we'll assume it's passed in payload
      const audioId = payload.audioId;
      if (!audioId) {
        throw new Error('Audio ID not found in payload');
      }

      const audioData = await WhatsAppService.downloadMedia(audioId);
      fs.writeFileSync(tempAudioPath, audioData);

      logToFile('Audio downloaded from WhatsApp', {
        coachingSessionId,
        fileSize: audioData.length
      });

      // Upload to R2 storage
      const r2Url = await uploadClassroomAudio(
        tempAudioPath,
        session.user_id,
        coachingSessionId,
        {
          duration: session.audio_duration_seconds,
          language: 'unknown',
          format: 'ogg'
        }
      );

      logToFile('Audio uploaded to R2', { coachingSessionId, r2Url });

      // Transcribe with Soniox (includes speaker diarization)
      // Note: We need to add diarization configuration to AudioService
      const transcriptionResult = await this._transcribeWithDiarization(tempAudioPath);

      logToFile('Transcription completed', {
        coachingSessionId,
        transcriptLength: transcriptionResult.transcript.length,
        speakerCount: transcriptionResult.diarization.speakers.length,
        confidence: transcriptionResult.diarization.confidence
      });

      // Update database
      await supabase
        .from('coaching_sessions')
        .update({
          audio_url: r2Url,
          audio_format: 'ogg',
          audio_size_bytes: audioData.length,
          transcript_text: transcriptionResult.transcript,
          transcript_language: transcriptionResult.language,
          diarization_data: transcriptionResult.diarization,
          diarization_confidence: transcriptionResult.diarization.confidence,
          status: 'transcription_complete',
          transcription_completed_at: new Date().toISOString(),
          transcription_cost: transcriptionResult.cost || 0
        })
        .eq('id', coachingSessionId);

      // Send encouraging message using GPT-4o
      const encouragingMessage = await this._generateEncouragingMessage(
        session.users.first_name,
        session.audio_duration_seconds
      );
      await WhatsAppService.sendMessage(from, encouragingMessage);

      // Ask about lesson plan
      await WhatsAppService.sendInteractiveButtons(from, {
        body: "Do you have a lesson plan for this class that you'd like me to consider in my analysis?",
        buttons: [
          { id: `lessonplan_yes_${coachingSessionId}`, title: 'Yes' },
          { id: `lessonplan_no_${coachingSessionId}`, title: 'No' }
        ]
      });

      // Update conversation state
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'awaiting_lesson_plan',
          conversation_state: {
            current_state: 'AWAITING_LESSON_PLAN',
            questions_answered: 0,
            questions: [],
            skipped: false,
            started_at: session.conversation_state.started_at,
            last_interaction: new Date().toISOString()
          }
        })
        .eq('id', coachingSessionId);

      // Clean up temp file
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      logToFile('✅ Transcription processing complete', { coachingSessionId });
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      logToFile('❌ Error in processTranscription', {
        error: error.message,
        stack: error.stack,
        coachingSessionId
      });

      // Get user phone number for notification
      let from = payload.from;
      if (!from) {
        try {
          const { data: session } = await supabase
            .from('coaching_sessions')
            .select('users!inner(phone_number)')
            .eq('id', coachingSessionId)
            .single();
          from = session?.users?.phone_number;
        } catch (e) {
          logToFile('⚠️  Could not get user phone for error notification', { error: e.message });
        }
      }

      // Update session with error
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'failed',
          failed_step: 'transcription',
          error_message: error.message
        })
        .eq('id', coachingSessionId);

      // ✅ NOTIFY USER
      if (from) {
        const errorMessage = "معذرت، آپ کی کلاس کی آڈیو کو ٹرانسکرائب کرتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error transcribing your classroom audio. Please try again.";
        await WhatsAppService.sendMessage(from, errorMessage);
      }

      throw error;
    }
  }

  /**
   * Handle lesson plan response (Yes/No/Document upload)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {boolean} hasLessonPlan - Whether user has lesson plan
   * @param {string|null} documentId - WhatsApp document media ID (if uploaded)
   */
  static async handleLessonPlanResponse(coachingSessionId, from, hasLessonPlan, documentId = null) {
    try {
      logToFile('Handling lesson plan response', {
        coachingSessionId,
        hasLessonPlan,
        hasDocument: !!documentId
      });

      if (!hasLessonPlan) {
        // User doesn't have lesson plan - proceed immediately to analysis
        await supabase
          .from('coaching_sessions')
          .update({
            has_lesson_plan: false
          })
          .eq('id', coachingSessionId);

        await WhatsAppService.sendMessage(from, "No problem! I'll analyze your classroom audio without the lesson plan.");

        // Queue analysis job
        await this._queueJob(coachingSessionId, 'analysis', { from });
        return;
      }

      // User has lesson plan
      if (documentId) {
        // Document provided - download and extract text
        await this._processLessonPlanDocument(coachingSessionId, from, documentId);
      } else {
        // User said yes but no document yet - ask them to send it
        await WhatsAppService.sendMessage(from,
          "Great! Please send your lesson plan as a document (PDF, Word, or image).\n\nTap 📎 → Document to upload it."
        );

        // Set timeout for 24 hours with reminders
        // TODO: Implement reminder system (can be done in Phase 4)
      }
    } catch (error) {
      logToFile('❌ Error in handleLessonPlanResponse', {
        error: error.message,
        coachingSessionId
      });
      throw error;
    }
  }

  /**
   * Process analysis job (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload
   */
  static async processAnalysis(coachingSessionId, payload) {
    try {
      logToFile('🔄 Starting pedagogical analysis', { coachingSessionId });

      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('*, users!inner(phone_number, first_name, last_name)')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        logToFile('❌ Session query error', { sessionError, coachingSessionId });
        throw new Error('Coaching session not found');
      }

      const from = payload.from || session.users.phone_number;

      // Update status
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'analyzing',
          analysis_started_at: new Date().toISOString()
        })
        .eq('id', coachingSessionId);

      // Send progress update
      await WhatsAppService.sendMessage(from, "🔄 Step 2/5: Analyzing your teaching using research-based pedagogical frameworks...");

      // Send pedagogical analysis animation if available
      if (PEDAGOGICAL_ANALYSIS_MEDIA_ID) {
        await WhatsAppService.sendSticker(from, PEDAGOGICAL_ANALYSIS_MEDIA_ID);
      }

      // Fetch prior coaching session for feedback incorporation
      const ReportGeneratorService = require('./coaching/report-generator.service');
      const priorSession = await ReportGeneratorService.fetchPriorSession(session.user_id, coachingSessionId);

      let priorFeedbackContext = null;
      if (priorSession && priorSession.analysis_data) {
        priorFeedbackContext = ReportGeneratorService.extractGrowthAreas(priorSession.analysis_data);
        logToFile('Prior feedback context extracted', { priorFeedbackContext });
      } else {
        logToFile('No prior session found - this is first observation');
      }

      // Run GPT-5 mini analysis
      const metadata = {
        duration: session.audio_duration_seconds,
        language: session.transcript_language,
        teacherFirstName: session.users?.first_name || null,
        priorFeedback: priorFeedbackContext
      };

      logToFile('Analysis metadata', metadata);

      const analysisResult = await GPT5MiniService.analyzePedagogy(
        session.transcript_text,
        metadata,
        session.lesson_plan_text
      );

      logToFile('Analysis completed', {
        coachingSessionId,
        inputTokens: analysisResult.usage.input_tokens,
        outputTokens: analysisResult.usage.output_tokens,
        cachedTokens: analysisResult.usage.cached_tokens,
        cost: analysisResult.usage.cost
      });

      // Update database
      await supabase
        .from('coaching_sessions')
        .update({
          analysis_data: analysisResult.analysis,
          status: 'analysis_complete',
          analysis_completed_at: new Date().toISOString(),
          analysis_cost: analysisResult.usage.cost,
          gpt5_input_tokens: analysisResult.usage.input_tokens,
          gpt5_output_tokens: analysisResult.usage.output_tokens,
          gpt5_cached_tokens: analysisResult.usage.cached_tokens
        })
        .eq('id', coachingSessionId);

      // Send progress update
      await WhatsAppService.sendMessage(from, "🔄 Step 3/5: Let's reflect on your teaching together...");

      // Brief pause before first question
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start reflective conversation
      await this.conductReflectiveConversation(coachingSessionId, from, 1);

      logToFile('✅ Analysis processing complete', { coachingSessionId });
    } catch (error) {
      logToFile('❌ Error in processAnalysis', {
        error: error.message,
        stack: error.stack,
        coachingSessionId
      });

      // Get user phone number for notification
      let from = payload.from;
      if (!from) {
        try {
          const { data: session } = await supabase
            .from('coaching_sessions')
            .select('users!inner(phone_number)')
            .eq('id', coachingSessionId)
            .single();
          from = session?.users?.phone_number;
        } catch (e) {
          logToFile('⚠️  Could not get user phone for error notification', { error: e.message });
        }
      }

      // Update session with error
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'failed',
          failed_step: 'analysis',
          error_message: error.message
        })
        .eq('id', coachingSessionId);

      // ✅ NOTIFY USER
      if (from) {
        const errorMessage = "معذرت، آپ کی کلاس کا تجزیہ کرتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error analyzing your classroom. Please try again.";
        await WhatsAppService.sendMessage(from, errorMessage);
      }

      throw error;
    }
  }

  /**
   * Conduct reflective conversation (generate and send question)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {number} questionNumber - Question number (1-3)
   */
  static async conductReflectiveConversation(coachingSessionId, from, questionNumber) {
    try {
      logToFile('Conducting reflective conversation', { coachingSessionId, questionNumber });

      // Get session data including full transcript
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('analysis_data, conversation_state, transcript_text')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      // Generate reflective question using GPT-4o with full transcript
      const conversationHistory = session.conversation_state.questions || [];
      const question = await GPT5MiniService.generateReflectiveQuestion(
        session.analysis_data,
        conversationHistory,
        questionNumber,
        session.transcript_text  // Pass full transcript for specific evidence
      );

      logToFile('Reflective question generated', {
        coachingSessionId,
        questionNumber,
        question
      });

      // Send question to teacher
      await WhatsAppService.sendMessage(from, question);

      // Update conversation state - STORE THE QUESTION
      const existingQuestions = session.conversation_state.questions || [];
      const updatedQuestions = [...existingQuestions];

      // Add or update the current question
      const existingQuestionIndex = updatedQuestions.findIndex(q => q.question_number === questionNumber);
      if (existingQuestionIndex >= 0) {
        // Update existing question entry
        updatedQuestions[existingQuestionIndex].question = question;
        updatedQuestions[existingQuestionIndex].asked_at = new Date().toISOString();
      } else {
        // Add new question entry
        updatedQuestions.push({
          question_number: questionNumber,
          question: question,
          asked_at: new Date().toISOString(),
          answer: null,  // Will be filled in when teacher responds
          format: null,
          language: null,
          answered_at: null
        });
      }

      const updatedState = {
        ...session.conversation_state,
        questions: updatedQuestions,
        current_state: `REFLECTIVE_QUESTION_${questionNumber}`,
        last_interaction: new Date().toISOString()
      };

      await supabase
        .from('coaching_sessions')
        .update({
          status: 'conducting_conversation',
          conversation_state: updatedState
        })
        .eq('id', coachingSessionId);

      logToFile('✅ Reflective question sent', { coachingSessionId, questionNumber });
    } catch (error) {
      logToFile('❌ Error in conductReflectiveConversation', {
        error: error.message,
        coachingSessionId,
        questionNumber
      });
      throw error;
    }
  }

  /**
   * Handle reflective response from teacher
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {string} response - Teacher's response text
   * @param {string} format - Response format ('text' or 'voice')
   * @param {string|null} language - Detected language
   */
  static async handleReflectiveResponse(coachingSessionId, from, response, format = 'text', language = null) {
    try {
      logToFile('Handling reflective response', {
        coachingSessionId,
        format,
        responseLength: response.length
      });

      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('conversation_state')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      // Extract current question number from state
      const currentState = session.conversation_state.current_state;
      const questionNumber = parseInt(currentState.match(/\d+/)?.[0] || '1');

      // Store response - UPDATE the existing question entry with the answer
      const questions = session.conversation_state.questions || [];
      const questionIndex = questions.findIndex(q => q.question_number === questionNumber);

      if (questionIndex >= 0) {
        // Update existing question with answer
        questions[questionIndex].answer = response;
        questions[questionIndex].format = format;
        questions[questionIndex].language = language;
        questions[questionIndex].answered_at = new Date().toISOString();
      } else {
        // Fallback: create entry if question wasn't stored (shouldn't happen)
        questions.push({
          question_number: questionNumber,
          question: null,  // Question wasn't stored properly
          answer: response,
          format: format,
          language: language,
          answered_at: new Date().toISOString()
        });
      }

      // Count how many questions have been answered
      const questionsAnswered = questions.filter(q => q.answer !== null).length;

      // Update conversation state
      const updatedState = {
        ...session.conversation_state,
        questions: questions,
        questions_answered: questionsAnswered,
        last_interaction: new Date().toISOString()
      };

      await supabase
        .from('coaching_sessions')
        .update({
          conversation_state: updatedState
        })
        .eq('id', coachingSessionId);

      logToFile('Response stored', { coachingSessionId, questionsAnswered });

      // Check if we need more questions
      if (questionsAnswered < 3) {
        // Generate next question
        await this.conductReflectiveConversation(coachingSessionId, from, questionsAnswered + 1);
      } else {
        // All questions answered - proceed to report generation
        await WhatsAppService.sendMessage(from, "Thank you for your thoughtful reflections! 🙏");

        // Queue report generation job
        await this._queueJob(coachingSessionId, 'report_generation', { from });

        // Update status
        await supabase
          .from('coaching_sessions')
          .update({
            status: 'generating_report',
            conversation_state: {
              ...updatedState,
              current_state: 'GENERATING_REPORT'
            }
          })
          .eq('id', coachingSessionId);
      }

      logToFile('✅ Reflective response handled', { coachingSessionId, questionsAnswered });
    } catch (error) {
      logToFile('❌ Error in handleReflectiveResponse', {
        error: error.message,
        coachingSessionId
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive observation report (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload
   */
  static async generateReport(coachingSessionId, payload) {
    try {
      logToFile('🔄 Starting report generation', { coachingSessionId });

      // Get complete session data (Bug #10: Include response_language for report generation)
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('*, users!inner(phone_number, first_name, last_name, response_language)')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        logToFile('❌ Session query error', { sessionError, coachingSessionId });
        throw new Error('Coaching session not found');
      }

      const from = payload.from || session.users.phone_number;
      const teacherName = `${session.users.first_name} ${session.users.last_name}`.trim();
      const isRetry = payload.attempt && payload.attempt > 1;

      // Send progress update (only on first attempt to avoid duplicate messages)
      if (!isRetry) {
        await WhatsAppService.sendMessage(from, "🔄 Step 4/5: Generating your comprehensive observation report with visualizations...");
      }

      // Enhance analysis with teacher reflections (Q&A)
      logToFile('Enhancing analysis with reflections', { coachingSessionId });
      const enhancedAnalysis = await GPT5MiniService.enhanceAnalysisWithReflections(
        session.analysis_data,
        session.transcript_text,
        session.conversation_state,
        {
          duration: session.audio_duration_seconds
        }
      );

      // Update database with enhanced analysis
      await supabase
        .from('coaching_sessions')
        .update({
          analysis_data: enhancedAnalysis
        })
        .eq('id', coachingSessionId);

      logToFile('Analysis enhanced and saved', { coachingSessionId, hasDomain4: !!enhancedAnalysis.domain4_professional_responsibilities });

      // Generate report using Gamma API (replaces PDFKit and chart generation)
      // Bug #10: Pass user's response_language for RTL support
      const reportLanguage = session.users.response_language || 'en';
      logToFile('Generating report with Gamma API', { coachingSessionId, reportLanguage });
      const { gammaUrl, pdfUrl } = await ContentService.generateClassroomObservationReport({
        teacherName: teacherName,
        teacherPhone: session.users.phone_number,
        reportDate: new Date().toISOString(),
        lessonDate: session.created_at,
        audioDuration: session.audio_duration_seconds,
        analysis: enhancedAnalysis,  // Use enhanced analysis with Q&A
        scores: enhancedAnalysis.scores,
        conversationState: session.conversation_state,  // Include reflective Q&A
        language: reportLanguage  // Bug #10: Pass language for RTL support
      });

      logToFile('Gamma report generated', { coachingSessionId, gammaUrl, pdfUrl });

      // Update database with both Gamma and PDF URLs
      await supabase
        .from('coaching_sessions')
        .update({
          report_pdf_url: pdfUrl,
          report_gamma_url: gammaUrl,
          report_generated_at: new Date().toISOString()
        })
        .eq('id', coachingSessionId);

      // Send PDF immediately (before voice generation, so user gets report even if voice fails)
      try {
        await WhatsAppService.sendMessage(from, "✅ Your Classroom Observation Report is ready! 📄");

        // Download PDF from Gamma and send
        const tempPdfPath = path.join(TEMP_DIR, `report_${coachingSessionId}_${Date.now()}.pdf`);

        // Ensure temp directory exists
        if (!fs.existsSync(TEMP_DIR)) {
          fs.mkdirSync(TEMP_DIR, { recursive: true });
        }

        // Download PDF from Gamma URL
        const pdfResponse = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempPdfPath, pdfResponse.data);

        logToFile('PDF downloaded from Gamma, sending to user', {
          coachingSessionId,
          pdfSize: pdfResponse.data.length
        });

        // Send document using local file
        await WhatsAppService.sendDocument(from, tempPdfPath, 'Classroom_Observation_Report.pdf');

        // Clean up temp file
        if (fs.existsSync(tempPdfPath)) {
          fs.unlinkSync(tempPdfPath);
        }

        logToFile('PDF report sent', { coachingSessionId });
      } catch (error) {
        logToFile('Warning: Failed to send PDF', {
          coachingSessionId,
          error: error.message
        });
      }

      // Send progress update (only on first attempt to avoid duplicate messages)
      if (!isRetry) {
        await WhatsAppService.sendMessage(from, "🔄 Step 5/5: Creating your personalized voice debrief...");
      }

      // Generate voice debrief (wrapped in try-catch so PDF is still delivered if voice fails)
      try {
        const outputLanguage = await this._determineOutputLanguage(session.user_id, session.session_id, session.transcript_language);

        const voiceScript = await GPT5MiniService.summarizeForVoiceDebrief(
          {
            analysis: enhancedAnalysis,  // Use enhanced analysis with Q&A
            conversation: session.conversation_state
          },
          outputLanguage
        );

        logToFile('Voice debrief script generated', {
          coachingSessionId,
          language: outputLanguage,
          scriptLength: voiceScript.length
        });

        // Validate script is not empty
        if (!voiceScript || voiceScript.trim().length === 0) {
          throw new Error('Voice debrief script generation returned empty content');
        }

        // Generate audio from script
        const voiceBuffer = await AudioService.generateSpeechForLanguage(voiceScript, outputLanguage);

        // Upload voice debrief to R2
        const voiceUrl = await uploadVoiceDebrief(
          voiceBuffer,
          session.user_id,
          coachingSessionId,
          outputLanguage
        );

        logToFile('Voice debrief uploaded', { coachingSessionId, voiceUrl });

        // Update database
        await supabase
          .from('coaching_sessions')
          .update({
            voice_debrief_url: voiceUrl,
            voice_debrief_language: outputLanguage,
            voice_debrief_duration_seconds: Math.round(voiceBuffer.length / 16000) // Approximate
          })
          .eq('id', coachingSessionId);

        // Send voice debrief (PDF was already sent earlier)
        await WhatsAppService.sendMessage(from, "🎤 Here's your personalized voice summary:");
        await WhatsAppService.sendAudioFromUrl(from, voiceUrl);

        logToFile('✅ Voice debrief sent successfully', { coachingSessionId });
      } catch (voiceError) {
        logToFile('⚠️  Voice debrief generation failed, but PDF was already sent', {
          coachingSessionId,
          error: voiceError.message
        });
        await WhatsAppService.sendMessage(from,
          "Note: Voice summary could not be generated, but your written report is complete! You can review it in the PDF above. 📄"
        );
      }

      // Mark session as completed regardless of voice success
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', coachingSessionId);

      // Calculate total cost
      const totalCost = (session.transcription_cost || 0) + (session.analysis_cost || 0);
      await supabase
        .from('coaching_sessions')
        .update({ total_cost: totalCost })
        .eq('id', coachingSessionId);

      logToFile('✅ Report generation complete', { coachingSessionId, totalCost });

      // Create quality metrics record
      await this._recordQualityMetrics(session);

      // Check and trigger registration if needed (non-blocking)
      try {
        await FeatureRegistrationService.checkAndTriggerRegistration(
          session.user_id,
          'coaching',
          from,
          reportLanguage,
          'voice' // Coaching uses voice messages
        );
      } catch (regError) {
        logToFile('Registration trigger error (non-fatal)', { error: regError.message });
      }
    } catch (error) {
      logToFile('❌ Error in generateReport', {
        error: error.message,
        stack: error.stack,
        coachingSessionId
      });

      // Get user phone number for notification
      let from = payload.from;
      if (!from) {
        try {
          const { data: session } = await supabase
            .from('coaching_sessions')
            .select('users!inner(phone_number)')
            .eq('id', coachingSessionId)
            .single();
          from = session?.users?.phone_number;
        } catch (e) {
          logToFile('⚠️  Could not get user phone for error notification', { error: e.message });
        }
      }

      // Update session with error
      await supabase
        .from('coaching_sessions')
        .update({
          status: 'failed',
          failed_step: 'report_generation',
          error_message: error.message
        })
        .eq('id', coachingSessionId);

      // ✅ NOTIFY USER
      if (from) {
        const errorMessage = "معذرت، آپ کی رپورٹ بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error generating your report. Please try again.";
        await WhatsAppService.sendMessage(from, errorMessage);
      }

      throw error;
    }
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  /**
   * Queue a background job to AWS SQS
   * @private
   */
  static async _queueJob(coachingSessionId, jobType, payload = {}) {
    try {
      const SQSQueueService = require('./queue/sqs-queue.service');

      const messageId = await SQSQueueService.queueCoachingJob(
        coachingSessionId,
        jobType,
        payload
      );

      logToFile('Job queued to SQS', { coachingSessionId, jobType, messageId });
      return messageId;
    } catch (error) {
      logToFile('❌ Error queuing job to SQS', { error: error.message, jobType });
      throw error;
    }
  }

  /**
   * Transcribe audio with speaker diarization
   * @private
   */
  static async _transcribeWithDiarization(audioPath) {
    // Enable diarization for classroom audio transcription
    const transcriptionResult = await AudioService.transcribe(audioPath, true);

    // Mock diarization data (will be replaced with real Soniox diarization)
    const mockDiarization = {
      speakers: [
        { id: 'speaker_1', label: 'Teacher', segments: [] },
        { id: 'speaker_2', label: 'Student', segments: [] }
      ],
      confidence: 75.0
    };

    return {
      transcript: transcriptionResult.text,
      language: transcriptionResult.language,
      diarization: mockDiarization,
      cost: 0.10 // Approximate Soniox cost
    };
  }

  /**
   * Process lesson plan document
   * @private
   */
  static async _processLessonPlanDocument(coachingSessionId, from, documentId) {
    const tempDocPath = path.join(TEMP_DIR, `lessonplan_${coachingSessionId}_${Date.now()}.pdf`);

    try {
      logToFile('Processing lesson plan document', { coachingSessionId, documentId });

      // Download document
      const docData = await WhatsAppService.downloadMedia(documentId);
      fs.writeFileSync(tempDocPath, docData);

      // Upload to R2
      const r2Url = await uploadLessonPlan(tempDocPath, sessionData.user_id, coachingSessionId);

      // Extract text (TODO: Add PDF/image text extraction in Phase 3)
      const lessonPlanText = 'Lesson plan text extraction to be implemented in Phase 3';

      // Update database
      await supabase
        .from('coaching_sessions')
        .update({
          has_lesson_plan: true,
          lesson_plan_url: r2Url,
          lesson_plan_text: lessonPlanText,
          lesson_plan_format: 'pdf'
        })
        .eq('id', coachingSessionId);

      await WhatsAppService.sendMessage(from, "✅ Lesson plan received! I'll include this in my analysis.");

      // Queue analysis job
      await this._queueJob(coachingSessionId, 'analysis', { from });

      // Clean up temp file
      if (fs.existsSync(tempDocPath)) {
        fs.unlinkSync(tempDocPath);
      }
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempDocPath)) {
        fs.unlinkSync(tempDocPath);
      }

      logToFile('❌ Error processing lesson plan document', {
        error: error.message,
        coachingSessionId
      });
      throw error;
    }
  }

  /**
   * Determine output language for voice debrief
   * @private
   */
  static async _determineOutputLanguage(userId, sessionId, transcriptLanguage) {
    try {
      // Get recent conversation messages to detect user's communication language
      const { data: recentMessages } = await supabase
        .from('conversations')
        .select('input_language, output_language')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 0) {
        // Find most recent user message language
        for (const msg of recentMessages) {
          if (msg.input_language && msg.input_language !== 'mixed') {
            return msg.input_language;
          }
        }
      }

      // Fallback to transcript language
      return transcriptLanguage || 'ur';
    } catch (error) {
      logToFile('Warning: Could not determine output language, defaulting to Urdu', {
        error: error.message
      });
      return 'ur';
    }
  }

  /**
   * Send text summary (fallback when PDF not available)
   * @private
   */
  static async _sendTextSummary(from, session) {
    const analysis = session.analysis_data;

    const summary = `📊 *Classroom Observation Summary*\n\n` +
      `*Executive Summary:*\n${analysis.executive_summary}\n\n` +
      `*Talk Time:*\n` +
      `• Teacher: ${analysis.talk_time.teacher_percentage}%\n` +
      `• Students: ${analysis.talk_time.student_percentage}%\n\n` +
      `*Questions Asked:*\n` +
      `• Open-ended: ${analysis.questions.open_ended_count}\n` +
      `• Closed-ended: ${analysis.questions.closed_ended_count}\n\n` +
      `*Overall Score:* ${analysis.scores.overall}/4\n\n` +
      `*Key Strengths:*\n` +
      analysis.strengths.map(s => `• ${s.title}`).join('\n') + '\n\n' +
      `*Growth Opportunities:*\n` +
      analysis.growth_opportunities.map(g => `• ${g.area}`).join('\n') + '\n\n' +
      `Full PDF report will be available soon! 📄`;

    await WhatsAppService.sendMessage(from, summary);
  }

  /**
   * Record quality metrics
   * @private
   */
  static async _recordQualityMetrics(session) {
    try {
      const processingTime = new Date(session.completed_at) - new Date(session.created_at);
      const transcriptionTime = new Date(session.transcription_completed_at) - new Date(session.transcription_started_at);
      const analysisTime = new Date(session.analysis_completed_at) - new Date(session.analysis_started_at);

      await supabase
        .from('coaching_quality_metrics')
        .insert({
          coaching_session_id: session.id,
          diarization_confidence: session.diarization_confidence,
          processing_time_seconds: Math.round(processingTime / 1000),
          transcription_time_seconds: Math.round(transcriptionTime / 1000),
          analysis_time_seconds: Math.round(analysisTime / 1000),
          session_cost: session.total_cost,
          had_errors: false,
          retry_count: 0,
          created_at: new Date().toISOString()
        });

      logToFile('Quality metrics recorded', { coachingSessionId: session.id });
    } catch (error) {
      logToFile('Warning: Failed to record quality metrics (non-critical)', {
        error: error.message,
        coachingSessionId: session.id
      });
    }
  }

  /**
   * Generate encouraging message after transcription using GPT-4o
   * @param {string} firstName - Teacher's first name
   * @param {number} durationSeconds - Audio duration in seconds
   * @returns {Promise<string>} Encouraging message
   * @private
   */
  static async _generateEncouragingMessage(firstName, durationSeconds) {
    try {
      const durationMinutes = Math.round(durationSeconds / 60);
      const {OPENAI_API_KEY} = require('../utils/constants');

      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a supportive teaching coach in Pakistan. Generate a brief, warm, encouraging message (1-2 sentences max) acknowledging a teacher after they complete a classroom recording. Be authentic and specific, using their name and the lesson duration.'
          },
          {
            role: 'user',
            content: `Teacher's name: ${firstName}\nLesson duration: ${durationMinutes} minutes\n\nGenerate an encouraging message.`
          }
        ],
        max_tokens: 100,
        temperature: 0.8
      });

      return `✅ ${response.choices[0].message.content.trim()}`;
    } catch (error) {
      logToFile('Warning: Failed to generate encouraging message, using fallback', {
        error: error.message
      });

      // Fallback message if LLM call fails
      const durationMinutes = Math.round(durationSeconds / 60);
      return `✅ Transcription complete, ${firstName}! You taught for ${durationMinutes} minutes - that's great stamina! 💪`;
    }
  }
}

module.exports = CoachingService;
