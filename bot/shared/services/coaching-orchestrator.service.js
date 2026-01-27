/**
 * Coaching Orchestrator Service
 * High-level coordinator for classroom observation workflow
 *
 * This orchestrator provides a clean API and delegates to specialized microservices.
 * It maintains 100% backward compatibility with the original coaching.service.js API
 * while implementing a complete microservices architecture.
 *
 * Phase 3 Complete - All Services Extracted:
 * - ✅ Session Management (coaching-session.service.js)
 * - ✅ Transcription Processing (transcription-processor.service.js)
 * - ✅ Lesson Plan Processing (lesson-plan-processor.service.js)
 * - ✅ Analysis Processing (analysis-processor.service.js)
 * - ✅ Reflective Conversation (reflective-conversation.service.js)
 * - ✅ Report Generation (report-generator.service.js)
 * - ✅ Job Queue Management (coaching-job-queue.service.js)
 * - ✅ Helper Utilities (coaching-helpers.service.js)
 *
 * Original coaching.service.js (1,225 lines) has been fully decomposed into
 * 8 focused microservices (avg 200 lines each), all coordinated by this orchestrator.
 */

const CoachingSessionService = require('./coaching/coaching-session.service');
const TranscriptionProcessorService = require('./coaching/transcription-processor.service');
const LessonPlanProcessorService = require('./coaching/lesson-plan-processor.service');
const AnalysisProcessorService = require('./coaching/analysis-processor.service');
const ReflectiveConversationService = require('./coaching/reflective-conversation.service');
const ReportGeneratorService = require('./coaching/report-generator.service');
const CoachingJobQueueService = require('./coaching/coaching-job-queue.service');
const CoachingHelpersService = require('./coaching/coaching-helpers.service');

class CoachingOrchestrator {
  /**
   * Initiate a new coaching session
   * ✅ Delegated to CoachingSessionService
   */
  static async initiateCoachingSession(userId, sessionId, audioId, from, audioDuration) {
    return await CoachingSessionService.initiateSession(userId, sessionId, audioId, from, audioDuration);
  }

  /**
   * Handle confirmation button response
   * ✅ Delegated to CoachingSessionService + JobQueue
   */
  static async handleConfirmation(coachingSessionId, from, confirmed) {
    const result = await CoachingSessionService.handleConfirmation(coachingSessionId, from, confirmed);

    if (result.confirmed) {
      // Queue transcription job
      await this.queueTranscription(coachingSessionId, {
        from,
        audioId: result.session.audio_id
      });
    }

    return result;
  }

  /**
   * Process transcription job
   * ✅ Delegated to TranscriptionProcessorService
   */
  static async processTranscription(coachingSessionId, payload) {
    return await TranscriptionProcessorService.processTranscription(coachingSessionId, payload);
  }

  /**
   * Handle lesson plan response
   * ✅ Delegated to LessonPlanProcessorService
   */
  static async handleLessonPlanResponse(coachingSessionId, from, hasLessonPlan, documentId = null) {
    return await LessonPlanProcessorService.handleLessonPlanResponse(coachingSessionId, from, hasLessonPlan, documentId);
  }

  /**
   * Process analysis job
   * ✅ Delegated to AnalysisProcessorService
   */
  static async processAnalysis(coachingSessionId, payload) {
    return await AnalysisProcessorService.processAnalysis(coachingSessionId, payload);
  }

  /**
   * Conduct reflective conversation
   * ✅ Delegated to ReflectiveConversationService
   */
  static async conductReflectiveConversation(coachingSessionId, from) {
    return await ReflectiveConversationService.conductReflectiveConversation(coachingSessionId, from);
  }

  /**
   * Handle reflective response
   * ✅ Delegated to ReflectiveConversationService
   */
  static async handleReflectiveResponse(coachingSessionId, from, answer, format, language) {
    return await ReflectiveConversationService.handleReflectiveResponse(coachingSessionId, from, answer, format, language);
  }

  /**
   * Generate report
   * ✅ Delegated to ReportGeneratorService
   */
  static async generateReport(coachingSessionId, payload) {
    return await ReportGeneratorService.generateReport(coachingSessionId, payload);
  }

  /**
   * Queue transcription job
   * ✅ Delegated to CoachingJobQueueService
   */
  static async queueTranscription(coachingSessionId, metadata) {
    return await CoachingJobQueueService.queueTranscription(coachingSessionId, metadata);
  }

  /**
   * Queue analysis job
   * ✅ Delegated to CoachingJobQueueService
   */
  static async queueAnalysis(coachingSessionId, metadata) {
    return await CoachingJobQueueService.queueAnalysis(coachingSessionId, metadata);
  }

  /**
   * Queue report generation job
   * ✅ Delegated to CoachingJobQueueService
   */
  static async queueReport(coachingSessionId, metadata) {
    return await CoachingJobQueueService.queueReport(coachingSessionId, metadata);
  }

  // ============================================================================
  // HELPER METHODS (Delegated to CoachingHelpersService)
  // ============================================================================

  /**
   * Generate encouraging message
   * ✅ Delegated to CoachingHelpersService
   */
  static async generateEncouragingMessage(firstName, durationSeconds) {
    return await CoachingHelpersService.generateEncouragingMessage(firstName, durationSeconds);
  }

  /**
   * Determine output language
   * ✅ Delegated to CoachingHelpersService
   */
  static async determineOutputLanguage(userId, sessionId, transcriptLanguage) {
    return await CoachingHelpersService.determineOutputLanguage(userId, sessionId, transcriptLanguage);
  }

  /**
   * Record quality metrics
   * ✅ Delegated to CoachingHelpersService
   */
  static async recordQualityMetrics(session) {
    return await CoachingHelpersService.recordQualityMetrics(session);
  }

  /**
   * Calculate total cost
   * ✅ Delegated to CoachingHelpersService
   */
  static calculateTotalCost(transcriptionCost, analysisCost, reportCost, voiceCost) {
    return CoachingHelpersService.calculateTotalCost(transcriptionCost, analysisCost, reportCost, voiceCost);
  }

  // ============================================================================
  // SESSION MANAGEMENT (Delegated to CoachingSessionService)
  // ============================================================================

  /**
   * Get session by ID
   * ✅ Delegated to CoachingSessionService
   */
  static async getSession(coachingSessionId) {
    return await CoachingSessionService.getSession(coachingSessionId);
  }

  /**
   * Update session status
   * ✅ Delegated to CoachingSessionService
   */
  static async updateSessionStatus(coachingSessionId, status, updates = {}) {
    return await CoachingSessionService.updateStatus(coachingSessionId, status, updates);
  }

  /**
   * Update conversation state
   * ✅ Delegated to CoachingSessionService
   */
  static async updateConversationState(coachingSessionId, stateUpdates) {
    return await CoachingSessionService.updateConversationState(coachingSessionId, stateUpdates);
  }

  /**
   * Mark session as failed
   * ✅ Delegated to CoachingSessionService
   */
  static async markSessionAsFailed(coachingSessionId, failedStep, errorMessage) {
    return await CoachingSessionService.markAsFailed(coachingSessionId, failedStep, errorMessage);
  }

  /**
   * Mark session as completed
   * ✅ Delegated to CoachingSessionService
   */
  static async markSessionAsCompleted(coachingSessionId, completionData) {
    return await CoachingSessionService.markAsCompleted(coachingSessionId, completionData);
  }

  /**
   * Retry analysis for a stuck session
   * Used for session state recovery
   */
  static async retryAnalysis(coachingSessionId, from) {
    const supabase = require('../config/supabase');
    const { logToFile } = require('../utils/logger');

    logToFile('♻️  Retrying analysis for stuck session', { coachingSessionId });

    // Get session data
    const { data: session, error } = await supabase
      .from('coaching_sessions')
      .select('*')
      .eq('id', coachingSessionId)
      .single();

    if (error || !session) {
      throw new Error('Session not found');
    }

    // Check if session has required data
    if (!session.transcript_text) {
      throw new Error('Session has no transcript');
    }

    // Reset conversation state to start of reflective questions
    const resetState = {
      current_state: 'AWAITING_ANALYSIS',
      questions: [],
      current_question_index: 0
    };

    // Update session status
    await supabase
      .from('coaching_sessions')
      .update({
        status: 'confirmed',
        conversation_state: resetState,
        analysis_data: null, // Clear incomplete analysis
        updated_at: new Date().toISOString()
      })
      .eq('id', coachingSessionId);

    // Re-queue analysis job
    await this.queueAnalysis(coachingSessionId, {
      from,
      retryAttempt: true
    });

    logToFile('✅ Analysis requeued successfully', { coachingSessionId });
    return { success: true };
  }
}

module.exports = CoachingOrchestrator;
