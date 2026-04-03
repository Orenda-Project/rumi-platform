/**
 * Analysis Processor Service
 * Handles pedagogical analysis of classroom observations
 *
 * Responsibilities:
 * - Orchestrate GPT-5 mini analysis
 * - Send progress updates with animations
 * - Store analysis results
 * - Handle analysis errors with notifications
 * - Trigger reflective conversation
 *
 * Extracted from coaching.service.js as part of Phase 3 refactoring
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const GPT5MiniService = require('../gpt5-mini.service');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const { PEDAGOGICAL_ANALYSIS_MEDIA_ID } = require('../../utils/constants');
const { selectFramework } = require('./frameworks/framework-selector');

class AnalysisProcessorService {
  /**
   * Process analysis job (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload
   * @returns {Promise<void>}
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
      await CoachingSessionService.updateStatus(coachingSessionId, 'analyzing', {
        analysis_started_at: new Date().toISOString()
      });

      // Send progress update
      await this.sendProgressUpdate(from, 2);

      // Fetch and compress prior feedback
      const ReportGeneratorService = require('./report-generator.service');
      const priorFeedbackData = await ReportGeneratorService.fetchAndCompressPriorFeedback(
        session.user_id,
        coachingSessionId
      );

      // Format prior feedback for prompt
      let priorFeedbackText = null;
      if (priorFeedbackData.exists) {
        if (priorFeedbackData.compressed) {
          // 4+ sessions: use compressed summary
          priorFeedbackText = priorFeedbackData.summary;
        } else {
          // 1-3 sessions: format verbatim sessions with dates
          priorFeedbackText = priorFeedbackData.summary.map(s => {
            const growthAreasText = s.growth_areas.map(ga => ga.area || ga.observation || 'N/A').join(', ');
            const recommendationsText = s.recommendations.join(', ');
            return `Observation ${s.date}:\nGrowth Areas: ${growthAreasText}\nRecommendations: ${recommendationsText}`;
          }).join('\n\n');
        }

        logToFile('Prior feedback fetched and formatted', {
          sessionCount: priorFeedbackData.sessionCount,
          compressed: priorFeedbackData.compressed,
          feedbackLength: priorFeedbackText?.length || 0
        });
      }

      // Run GPT-5 mini analysis with prior feedback
      const metadata = {
        duration: session.audio_duration_seconds,
        language: session.transcript_language,
        teacherFirstName: session.users.first_name,
        priorFeedback: priorFeedbackText,
        lessonPlanExcerpt: session.lesson_plan_excerpt || null,
        lessonPlanStatus: session.lesson_plan_extraction_status || null,
        lessonPlanSubject: session.lesson_plan_structured?.subject || null,
        lessonPlanTopic: session.lesson_plan_structured?.topic || null
      };

      logToFile('Analysis metadata', metadata);

      // Resolve pedagogical framework for this user (bd-609)
      const framework = await selectFramework(session.user_id);
      logToFile('Framework resolved', { userId: session.user_id, framework: framework.name });

      const analysisResult = await GPT5MiniService.analyzePedagogy(
        session.transcript_text,
        metadata,
        session.lesson_plan_structured || null,
        framework
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

      // Send progress update - Step 3
      await WhatsAppService.sendMessage(from, "🔄 Step 3/5: Let's reflect on your teaching together...");

      // Brief pause before first question
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start reflective conversation
      const ReflectiveConversationService = require('./reflective-conversation.service');
      await ReflectiveConversationService.conductReflectiveConversation(coachingSessionId, from);

      logToFile('✅ Analysis processing complete', { coachingSessionId });
    } catch (error) {
      await this.handleAnalysisError(coachingSessionId, error, payload.from);
      throw error;
    }
  }

  /**
   * Send progress update to user
   * @param {string} phoneNumber - User's phone number
   * @param {number} step - Current step (1-5)
   * @returns {Promise<void>}
   */
  static async sendProgressUpdate(phoneNumber, step) {
    try {
      await WhatsAppService.sendMessage(phoneNumber, `🔄 Step ${step}/5: Analyzing your teaching using research-based pedagogical frameworks...`);

      // Send pedagogical analysis animation if available
      if (PEDAGOGICAL_ANALYSIS_MEDIA_ID) {
        await WhatsAppService.sendSticker(phoneNumber, PEDAGOGICAL_ANALYSIS_MEDIA_ID);
      }
    } catch (error) {
      logToFile('⚠️  Failed to send progress update (non-critical)', {
        error: error.message,
        phoneNumber
      });
    }
  }

  /**
   * Handle analysis error
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {Error} error - Error object
   * @param {string} phoneNumber - User's phone number (optional)
   * @returns {Promise<void>}
   */
  static async handleAnalysisError(coachingSessionId, error, phoneNumber) {
    try {
      logToFile('❌ Error in processAnalysis', {
        error: error.message,
        stack: error.stack,
        coachingSessionId
      });

      // Get user phone number if not provided
      let from = phoneNumber;
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
      await CoachingSessionService.markAsFailed(coachingSessionId, 'analysis', error.message);

      // Notify user (bilingual)
      if (from) {
        const errorMessage = "معذرت، آپ کی کلاس کا تجزیہ کرتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error analyzing your classroom. Please try again.";
        await WhatsAppService.sendMessage(from, errorMessage);
      }
    } catch (handlerError) {
      logToFile('❌ Error in handleAnalysisError', {
        error: handlerError.message,
        coachingSessionId
      });
    }
  }
}

module.exports = AnalysisProcessorService;
