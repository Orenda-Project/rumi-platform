/**
 * Reflective Conversation Service
 * Manages multi-turn Q&A reflective conversations with teachers
 *
 * Responsibilities:
 * - Generate reflective questions using GPT-4o
 * - Conduct 3-question reflective conversation
 * - Store teacher responses
 * - Manage conversation state
 * - Trigger report generation after completion
 *
 * Extracted from coaching.service.js as part of Phase 3 refactoring
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const GPT5MiniService = require('../gpt5-mini.service');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const ElevenLabsService = require('../elevenlabs.service');
const { getUserLanguage, setUserLanguage } = require('../../utils/language-cache');
const { TEMP_DIR } = require('../../utils/constants');
const path = require('path');

class ReflectiveConversationService {
  /**
   * Conduct reflective conversation (generate and send question)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {number} questionNumber - Question number (1-3), defaults to 1
   * @returns {Promise<void>}
   */
  static async conductReflectiveConversation(coachingSessionId, from, questionNumber = 1) {
    try {
      logToFile('Conducting reflective conversation', { coachingSessionId, questionNumber });

      // Get session data including full transcript and user_id
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('analysis_data, conversation_state, transcript_text, user_id')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      // Determine language for question generation
      let questionLanguage;
      if (questionNumber === 1) {
        // First question - use user's preferred language
        questionLanguage = await getUserLanguage(session.user_id);
      } else {
        // Subsequent questions - use conversation language if set, otherwise user preference
        questionLanguage = session.conversation_state.conversation_language ||
                         await getUserLanguage(session.user_id);
      }

      // Generate reflective question using GPT-4o with full transcript
      const conversationHistory = session.conversation_state.questions || [];
      const question = await GPT5MiniService.generateReflectiveQuestion(
        session.analysis_data,
        conversationHistory,
        questionNumber,
        session.transcript_text,  // Pass full transcript for specific evidence
        questionLanguage  // Pass language for generation
      );

      logToFile('Reflective question generated', {
        coachingSessionId,
        questionNumber,
        question
      });

      // Determine language for voice synthesis
      let languageCode;

      if (questionNumber === 1) {
        // First question - lock the language for entire conversation
        languageCode = await getUserLanguage(session.user_id);
        logToFile('🔒 Locking conversation language for reflective session', {
          coachingSessionId,
          lockedLanguage: languageCode,
          questionNumber
        });
      } else {
        // Subsequent questions - use locked language or smart update
        const conversationLanguage = session.conversation_state.conversation_language;

        if (conversationLanguage) {
          // Use the locked/updated conversation language
          languageCode = conversationLanguage;
          logToFile('Using conversation language for question', {
            coachingSessionId,
            conversationLanguage,
            questionNumber
          });
        } else {
          // Fallback for old sessions without conversation_language
          languageCode = await getUserLanguage(session.user_id);
          logToFile('Using user preference (no conversation language set)', {
            coachingSessionId,
            languageCode,
            questionNumber
          });
        }
      }

      logToFile('Generating voice for reflective question', {
        coachingSessionId,
        questionNumber,
        languageCode,
        questionLength: question.length
      });

      // Generate voice from question text
      const voiceBuffer = await ElevenLabsService.generateSpeechForLanguage(question, languageCode);

      // Send voice question to teacher
      await WhatsAppService.sendAudio(from, voiceBuffer, TEMP_DIR);

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
        conversation_language: languageCode, // Store the locked/current language
        current_state: `REFLECTIVE_QUESTION_${questionNumber}`,
        last_interaction: new Date().toISOString()
      };

      await CoachingSessionService.updateConversationState(coachingSessionId, updatedState);
      await CoachingSessionService.updateStatus(coachingSessionId, 'conducting_conversation');

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
   * @returns {Promise<void>}
   */
  static async handleReflectiveResponse(coachingSessionId, from, response, format = 'text', language = null) {
    try {
      logToFile('Handling reflective response', {
        coachingSessionId,
        format,
        responseLength: response.length,
        detectedLanguage: language
      });

      // Get session data including user_id for language updates
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('conversation_state, user_id')
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

      // Check if language changed and update immediately
      let newConversationLanguage = session.conversation_state.conversation_language;

      if (language && language !== session.conversation_state.conversation_language) {
        logToFile('🔄 Language change detected in response', {
          coachingSessionId,
          previousLanguage: session.conversation_state.conversation_language,
          newLanguage: language,
          questionNumber
        });

        // Update conversation language immediately
        newConversationLanguage = language;

        // Also update user's global preference for consistency
        try {
          await setUserLanguage(session.user_id, language);
          logToFile('✅ Updated user language preference', {
            userId: session.user_id,
            newLanguage: language
          });
        } catch (error) {
          logToFile('⚠️ Failed to update user language preference', {
            error: error.message,
            userId: session.user_id
          });
        }
      }

      // Update conversation state with new language if changed
      const updatedState = {
        ...session.conversation_state,
        questions: questions,
        questions_answered: questionsAnswered,
        conversation_language: newConversationLanguage, // Use the updated language
        last_interaction: new Date().toISOString()
      };

      await CoachingSessionService.updateConversationState(coachingSessionId, updatedState);

      logToFile('Response stored', {
        coachingSessionId,
        questionsAnswered,
        conversationLanguage: newConversationLanguage
      });

      // Check if we need more questions
      if (questionsAnswered < 3) {
        // Generate next question
        await this.conductReflectiveConversation(coachingSessionId, from, questionsAnswered + 1);
      } else {
        // All questions answered - proceed to report generation
        // Get user's language for thank you message
        const { data: sessionData } = await supabase
          .from('coaching_sessions')
          .select('user_id')
          .eq('id', coachingSessionId)
          .single();

        if (sessionData) {
          const languageCode = await getUserLanguage(sessionData.user_id);
          const thankYouMessage = "Thank you for your thoughtful reflections!";

          try {
            const voiceBuffer = await ElevenLabsService.generateSpeechForLanguage(thankYouMessage, languageCode);
            await WhatsAppService.sendAudio(from, voiceBuffer, TEMP_DIR);
          } catch (voiceError) {
            // Fallback to text if voice fails
            logToFile('⚠️  Voice generation failed for thank you message, sending text', { error: voiceError.message });
            await WhatsAppService.sendMessage(from, "Thank you for your thoughtful reflections! 🙏");
          }
        } else {
          await WhatsAppService.sendMessage(from, "Thank you for your thoughtful reflections! 🙏");
        }

        // Queue report generation job
        const CoachingJobQueueService = require('./coaching-job-queue.service');
        await CoachingJobQueueService.queueReport(coachingSessionId, { from });

        // Update status
        await CoachingSessionService.updateConversationState(coachingSessionId, {
          ...updatedState,
          current_state: 'GENERATING_REPORT'
        });
        await CoachingSessionService.updateStatus(coachingSessionId, 'generating_report');
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
}

module.exports = ReflectiveConversationService;
