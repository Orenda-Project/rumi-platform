const WhatsAppService = require('./whatsapp.service');
const supabase = require('../config/supabase');
const redisService = require('./cache/railway-redis.service');
const { logToFile } = require('../utils/logger');
const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../utils/constants');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * Reading Assessment Service
 * Manages early-grade reading fluency assessments based on EGRA/ASER frameworks
 */
class ReadingAssessmentService {
  /**
   * Initiate a new reading assessment
   * Sends language selection buttons to user
   */
  static async initiateAssessment(userId, sessionId, phoneNumber, userLanguage = 'en') {
    try {
      logToFile('📖 Initiating reading assessment', { userId, sessionId });

      // Check for concurrent active assessments
      const { data: activeAssessments } = await supabase
        .from('reading_assessments')
        .select('id, student_identifier')
        .eq('user_id', userId)
        .in('status', ['pending', 'passage_generated', 'processing'])
        .order('created_at', { ascending: false });

      const concurrentCount = activeAssessments?.length || 0;

      // Get or increment student counter from Redis
      const studentCountKey = `reading:user:${userId}:student_count`;
      const studentNum = await redisService.redis.incr(studentCountKey);
      await redisService.redis.expire(studentCountKey, 86400); // Reset daily

      const studentIdentifier = `Student ${studentNum}`;

      logToFile('📊 Concurrent assessment check', {
        userId,
        concurrentCount,
        studentIdentifier
      });

      // Store assessment initiation in Redis (temporary state)
      const assessmentStateKey = `reading:user:${userId}:current_assessment`;
      await redisService.redis.setex(
        assessmentStateKey,
        3600, // 1 hour expiry
        JSON.stringify({
          sessionId,
          studentIdentifier,
          studentNum,
          concurrentCount,
          initiatedAt: new Date().toISOString()
        })
      );

      // Generate welcome message in user's language
      const welcomePrompt = `Generate a brief, friendly message in language code "${userLanguage}" that:
1. Welcomes the teacher to reading assessment
2. Explains this will test a student's reading fluency (takes 3-5 minutes)
3. Asks them to select the language for the reading passage
4. Uses 2-3 sentences max
5. NO markdown, NO meta-commentary

If this is a concurrent session (student number > 1), mention this is for "${studentIdentifier}".`;

      const welcomeResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: welcomePrompt }],
        temperature: 0.3,
        max_tokens: 150
      });

      const welcomeMessage = welcomeResponse.choices[0].message.content.trim();

      // Send welcome + language selection list
      await WhatsAppService.sendMessage(phoneNumber, welcomeMessage);

      // Send language selection list
      const languageList = {
        type: 'list',
        header: {
          type: 'text',
          text: userLanguage === 'ur' ? 'زبان منتخب کریں' : 'Select Language'
        },
        body: {
          text: userLanguage === 'ur'
            ? 'قرائت کا اقتباس کس زبان میں ہونا چاہیے؟'
            : 'What language should the reading passage be in?'
        },
        footer: {
          text: 'Rumi Reading Assessment'
        },
        action: {
          button: userLanguage === 'ur' ? 'زبانیں' : 'Languages',
          sections: [
            {
              title: userLanguage === 'ur' ? 'دستیاب زبانیں' : 'Available Languages',
              rows: [
                {
                  id: 'reading_lang_en',
                  title: 'English',
                  description: 'English reading passage'
                },
                {
                  id: 'reading_lang_ur',
                  title: 'اردو (Urdu)',
                  description: 'Urdu reading passage'
                }
              ]
            }
          ]
        }
      };

      await WhatsAppService.sendInteractiveMessage(phoneNumber, languageList);

      // Create conversation state record (INSERT first to ensure it exists)
      // If a conversation record already exists for this session, we'll update it instead
      // CRITICAL: Check for errors from BOTH query and insert operations
      const { data: existingConversation, error: queryError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when no rows found

      if (queryError) {
        logToFile('❌ Error querying existing conversation', {
          userId,
          sessionId,
          error: queryError.message,
          code: queryError.code
        });
      }

      if (existingConversation) {
        // Update existing conversation record
        const { error: updateError } = await supabase
          .from('conversations')
          .update({
            current_state: 'AWAITING_READING_LANGUAGE'
            // Note: conversations table has no updated_at column
          })
          .eq('id', existingConversation.id);

        if (updateError) {
          logToFile('❌ Error updating conversation state', {
            conversationId: existingConversation.id,
            error: updateError.message,
            code: updateError.code
          });
          throw updateError;
        }

        logToFile('✅ Updated existing conversation state', {
          conversationId: existingConversation.id,
          newState: 'AWAITING_READING_LANGUAGE'
        });
      } else {
        // Insert new conversation record for state tracking
        const insertData = {
          user_id: userId,
          session_id: sessionId,
          role: 'system',
          content: 'Reading assessment initiated',
          message_type: 'system',
          current_state: 'AWAITING_READING_LANGUAGE'
          // Note: created_at has default value now(), no need to specify
          // conversations table has no updated_at column
        };

        logToFile('🔄 Attempting to insert conversation record', {
          userId,
          sessionId,
          insertData
        });

        const { data: insertedData, error: insertError } = await supabase
          .from('conversations')
          .insert(insertData)
          .select();

        if (insertError) {
          logToFile('❌ CRITICAL: Conversation INSERT failed', {
            userId,
            sessionId,
            error: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
            insertData
          });
          throw insertError;
        }

        logToFile('✅ Conversation record created successfully', {
          insertedId: insertedData?.[0]?.id,
          currentState: insertedData?.[0]?.current_state
        });
      }

      logToFile('✅ Reading assessment initiated - awaiting language selection', {
        userId,
        studentIdentifier,
        conversationCreated: !existingConversation
      });

      return { success: true, studentIdentifier };

    } catch (error) {
      logToFile('❌ Error initiating reading assessment', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Handle language selection
   * Send grade level selection buttons
   */
  static async handleLanguageSelection(userId, sessionId, phoneNumber, language, userLanguage = 'en') {
    try {
      logToFile('🌐 Language selected for reading assessment', { userId, language });

      // Update Redis state
      const assessmentStateKey = `reading:user:${userId}:current_assessment`;
      const stateData = await redisService.redis.get(assessmentStateKey);

      if (!stateData) {
        throw new Error('Assessment state not found - please start again with /reading test');
      }

      const state = JSON.parse(stateData);
      state.passageLanguage = language;

      await redisService.redis.setex(
        assessmentStateKey,
        3600,
        JSON.stringify(state)
      );

      // Send grade level selection
      const gradeLevelPrompt = `Generate a brief message in language code "${userLanguage}" asking the teacher to select the student's grade/reading level. Use 1-2 sentences. NO markdown.`;

      const gradeResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: gradeLevelPrompt }],
        temperature: 0.3,
        max_tokens: 100
      });

      const gradeMessage = gradeResponse.choices[0].message.content.trim();

      await WhatsAppService.sendMessage(phoneNumber, gradeMessage);

      // Send grade level list (supports up to 10 rows)
      const gradeList = {
        type: 'list',
        header: {
          type: 'text',
          text: userLanguage === 'ur' ? 'گریڈ منتخب کریں' : 'Select Grade Level'
        },
        body: {
          text: userLanguage === 'ur'
            ? 'طالب علم کی پڑھنے کی سطح منتخب کریں:'
            : 'Select the student\'s reading level:'
        },
        footer: {
          text: 'Choose the best match'
        },
        action: {
          button: userLanguage === 'ur' ? 'سطحیں' : 'Levels',
          sections: [
            {
              title: userLanguage === 'ur' ? 'ابتدائی سطح' : 'Beginner Levels',
              rows: [
                {
                  id: 'reading_grade_0',
                  title: userLanguage === 'ur' ? 'حروف/آوازیں' : 'Letters/Sounds',
                  description: userLanguage === 'ur' ? 'ابتدائی (EY)' : 'Pre-reading (EY)'
                },
                {
                  id: 'reading_grade_1',
                  title: userLanguage === 'ur' ? 'الفاظ' : 'Words',
                  description: userLanguage === 'ur' ? 'گریڈ 1' : 'Grade 1'
                },
                {
                  id: 'reading_grade_2',
                  title: userLanguage === 'ur' ? 'جملے' : 'Sentences',
                  description: userLanguage === 'ur' ? 'گریڈ 1-2' : 'Grade 1-2'
                }
              ]
            },
            {
              title: userLanguage === 'ur' ? 'اعلیٰ سطح' : 'Advanced Levels',
              rows: [
                {
                  id: 'reading_grade_3',
                  title: userLanguage === 'ur' ? 'پیراگراف' : 'Paragraph',
                  description: userLanguage === 'ur' ? 'گریڈ 2-3' : 'Grade 2-3'
                },
                {
                  id: 'reading_grade_4',
                  title: userLanguage === 'ur' ? 'کہانی' : 'Story',
                  description: userLanguage === 'ur' ? 'گریڈ 3-5' : 'Grade 3-5'
                }
              ]
            }
          ]
        }
      };

      await WhatsAppService.sendInteractiveMessage(phoneNumber, gradeList);

      // Update conversation state
      const { data: updateData, error: stateUpdateError } = await supabase
        .from('conversations')
        .update({
          current_state: 'AWAITING_READING_GRADE'
          // Note: conversations table has no updated_at column
        })
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .select();

      if (stateUpdateError) {
        logToFile('❌ Failed to update conversation state to AWAITING_READING_GRADE', {
          userId,
          sessionId,
          error: stateUpdateError.message,
          code: stateUpdateError.code,
          details: stateUpdateError.details
        });
        throw stateUpdateError;
      }

      if (!updateData || updateData.length === 0) {
        logToFile('⚠️ No conversation record found to update', {
          userId,
          sessionId,
          hint: 'Conversation record may not exist - need to create one first'
        });
        throw new Error('No conversation record found to update state');
      }

      logToFile('✅ Language selected - awaiting grade level', {
        userId,
        language,
        updatedRecords: updateData.length,
        newState: updateData[0]?.current_state
      });

      return { success: true };

    } catch (error) {
      logToFile('❌ Error handling language selection', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Handle grade level selection
   * Generate passage and create assessment record
   */
  static async handleGradeSelection(userId, sessionId, phoneNumber, gradeLevel, userLanguage = 'en') {
    try {
      logToFile('📊 Grade level selected for reading assessment', { userId, gradeLevel });

      // Get assessment state from Redis
      const assessmentStateKey = `reading:user:${userId}:current_assessment`;
      const stateData = await redisService.redis.get(assessmentStateKey);

      if (!stateData) {
        throw new Error('Assessment state not found - please start again with /reading test');
      }

      const state = JSON.parse(stateData);
      const passageLanguage = state.passageLanguage;
      const studentIdentifier = state.studentIdentifier;

      // Map grade level to passage type
      // Bug #21 Fix: Changed words from 30 to 14 for 2-column layout
      // Bug #24 Fix: Changed letters from 20 to 14 for 3x4+2 grid layout
      const gradeMap = {
        0: { type: 'letters', wordCount: 14, grade: 0 },
        1: { type: 'words', wordCount: 14, grade: 1 },
        2: { type: 'sentences', wordCount: 50, grade: 2 },
        3: { type: 'paragraph', wordCount: 80, grade: 2 },
        4: { type: 'story', wordCount: 120, grade: 3 }
      };

      const passageConfig = gradeMap[gradeLevel];

      // Create assessment record in database
      const { data: assessment, error: createError } = await supabase
        .from('reading_assessments')
        .insert({
          user_id: userId,
          session_id: sessionId,
          student_identifier: studentIdentifier,
          student_number: state.studentNum,
          concurrent_session_count: state.concurrentCount,
          redis_session_key: assessmentStateKey,
          grade_level: passageConfig.grade,
          language: passageLanguage,
          passage_type: passageConfig.type,
          passage_text: '', // Will be filled by passage generation
          passage_word_count: passageConfig.wordCount,
          status: 'pending',
          is_second_language: passageLanguage === 'ur' // Default true for Urdu (93% L2)
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      logToFile('✅ Assessment record created', {
        assessmentId: assessment.id,
        userId,
        studentIdentifier
      });

      // Send "generating passage" message
      const generatingPrompt = `Generate a brief message in language code "${userLanguage}" saying:
1. We're generating a ${passageConfig.type} passage for them
2. This will take 10-20 seconds
3. Use 1-2 sentences, friendly tone
4. NO markdown`;

      const generatingResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: generatingPrompt }],
        temperature: 0.3,
        max_tokens: 80
      });

      const generatingMessage = generatingResponse.choices[0].message.content.trim();

      await WhatsAppService.sendMessage(phoneNumber, generatingMessage);

      // Queue passage generation (will be handled by passage generation service)
      // For now, we'll call it directly (TODO: move to BullMQ worker)
      const PassageGenerationService = require('./reading/passage-generation.service');
      await PassageGenerationService.generateAndSendPassage(
        assessment.id,
        userId,
        phoneNumber,
        passageLanguage,
        passageConfig,
        userLanguage
      );

      // Update conversation state
      const { data: updateData, error: stateUpdateError } = await supabase
        .from('conversations')
        .update({
          current_state: 'AWAITING_READING_AUDIO'
          // Note: conversations table has no updated_at column
        })
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .select();

      if (stateUpdateError) {
        logToFile('❌ Failed to update conversation state to AWAITING_READING_AUDIO', {
          userId,
          sessionId,
          error: stateUpdateError.message,
          code: stateUpdateError.code,
          details: stateUpdateError.details
        });
        throw stateUpdateError;
      }

      if (!updateData || updateData.length === 0) {
        logToFile('⚠️ No conversation record found to update', {
          userId,
          sessionId,
          hint: 'Conversation record may not exist - need to create one first'
        });
        throw new Error('No conversation record found to update state');
      }

      logToFile('✅ Passage generation initiated', {
        assessmentId: assessment.id,
        updatedRecords: updateData.length,
        newState: updateData[0]?.current_state
      });

      return { success: true, assessmentId: assessment.id };

    } catch (error) {
      logToFile('❌ Error handling grade selection', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Handle audio receipt
   * Queue assessment analysis job
   */
  static async handleAudioReceipt(userId, sessionId, phoneNumber, audioData, userLanguage = 'en') {
    try {
      logToFile('🎤 Audio received for reading assessment', { userId });

      // FIX 3 (Bug #34): Find active assessment with row-level locking
      // First, get the assessment ID without locking (only assessments from last 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const { data: assessments, error: findError } = await supabase
        .from('reading_assessments')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'passage_generated')
        .gte('created_at', thirtyMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (findError || !assessments || assessments.length === 0) {
        logToFile('❌ No active assessment found for user', { userId, error: findError?.message });
        throw new Error('No active assessment found');
      }

      const assessmentId = assessments[0].id;

      // Acquire row-level lock using database function
      logToFile('🔒 Attempting to acquire assessment lock', { assessmentId, userId });

      const { data: lockResult, error: lockError } = await supabase
        .rpc('acquire_assessment_lock', {
          p_assessment_id: assessmentId,
          p_expected_status: 'passage_generated'
        });

      if (lockError) {
        logToFile('❌ Error calling acquire_assessment_lock function', {
          assessmentId,
          error: lockError.message,
          code: lockError.code
        });
        throw new Error(`Failed to acquire lock: ${lockError.message}`);
      }

      // Check if lock was acquired
      const lockData = lockResult && lockResult.length > 0 ? lockResult[0] : null;

      if (!lockData || !lockData.locked) {
        const errorMsg = lockData?.error_message || 'Unknown lock acquisition error';
        logToFile('🚫 Assessment lock not acquired', {
          assessmentId,
          userId,
          errorMessage: errorMsg,
          reason: errorMsg.includes('locked by another worker') ? 'concurrent_processing' :
                  errorMsg.includes('Status mismatch') ? 'status_changed' :
                  errorMsg.includes('too old') ? 'assessment_expired' :
                  'unknown'
        });

        // Send user-friendly error message
        const errorMessages = {
          en: "This reading assessment is already being processed or has expired. Please start a new assessment with /reading test",
          ur: "یہ reading assessment پہلے سے پروسیس ہو رہی ہے یا ختم ہو گئی ہے۔ براہ کرم /reading test کے ساتھ نیا assessment شروع کریں",
          ar: "هذا التقييم القرائي قيد المعالجة بالفعل أو انتهت صلاحيته. يرجى بدء تقييم جديد باستخدام /reading test",
          es: "Esta evaluación de lectura ya está siendo procesada o ha caducado. Por favor, inicia una nueva evaluación con /reading test"
        };

        const userErrorMessage = errorMessages[userLanguage] || errorMessages.en;
        await WhatsAppService.sendMessage(phoneNumber, userErrorMessage);

        throw new Error(`Lock acquisition failed: ${errorMsg}`);
      }

      // Lock acquired successfully - extract assessment data from JSONB
      const assessment = lockData.assessment_data;
      logToFile('✅ Assessment lock acquired successfully', {
        assessmentId: assessment.id,
        userId,
        studentIdentifier: assessment.student_identifier,
        assessmentAge: Math.round((Date.now() - new Date(assessment.created_at).getTime()) / 60000) + ' minutes'
      });

      // Update assessment with audio info
      const { error: updateError } = await supabase
        .from('reading_assessments')
        .update({
          audio_url: audioData.url,
          audio_duration_seconds: audioData.duration,
          audio_format: audioData.format,
          audio_size_bytes: audioData.sizeBytes,
          audio_uploaded_at: new Date().toISOString(),
          status: 'audio_received'
        })
        .eq('id', assessment.id);

      if (updateError) {
        throw updateError;
      }

      logToFile('✅ Audio info stored', { assessmentId: assessment.id });

      // Send "analyzing" message
      const analyzingPrompt = `Generate a brief message in language code "${userLanguage}" saying:
1. We received the audio
2. We're analyzing ${assessment.student_identifier}'s reading
3. This will take 3-5 minutes
4. Use friendly, encouraging tone
5. NO markdown`;

      const analyzingResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: analyzingPrompt }],
        temperature: 0.3,
        max_tokens: 100
      });

      const analyzingMessage = analyzingResponse.choices[0].message.content.trim();

      await WhatsAppService.sendMessage(phoneNumber, analyzingMessage);

      // Queue analysis job (TODO: move to BullMQ worker)
      const AnalysisService = require('./reading/analysis.service');
      await AnalysisService.queueAnalysis(assessment.id, userId, phoneNumber, userLanguage);

      logToFile('✅ Analysis job queued', { assessmentId: assessment.id });

      return { success: true, assessmentId: assessment.id };

    } catch (error) {
      logToFile('❌ Error handling audio receipt', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = ReadingAssessmentService;
