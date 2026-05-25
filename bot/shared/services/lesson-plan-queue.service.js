/**
 * Lesson Plan Queue Service
 * Handles async lesson plan generation via SQS queue
 *
 * Flow:
 * 1. Handler creates request in DB + queues to SQS
 * 2. Worker picks up job, generates with Gamma, sends result
 * 3. Survives server restarts - job persists in queue
 */

const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');
const SQSQueueService = require('./queue');

class LessonPlanQueueService {
  /**
   * Create a lesson plan request and queue it for processing
   * @param {Object} params - Request parameters
   * @param {string} params.userId - User's UUID
   * @param {string} params.phoneNumber - User's phone number
   * @param {string} params.topic - Extracted topic
   * @param {string} params.fullMessage - Full user message for context
   * @param {string} params.language - Language code (en, ur, ar, es)
   * @param {string} params.contentType - 'lesson_plan' or 'presentation'
   * @returns {Promise<string>} Request ID
   */
  static async createAndQueue(params) {
    const { userId, phoneNumber, topic, fullMessage, language = 'en', contentType = 'lesson_plan' } = params;

    try {
      // 1. Create request in database
      const { data: request, error } = await supabase
        .from('lesson_plan_requests')
        .insert({
          user_id: userId,
          phone_number: phoneNumber,
          topic,
          full_message: fullMessage,
          language,
          content_type: contentType,
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(`Failed to create lesson plan request: ${error.message}`);
      }

      const requestId = request.id;

      logToFile('Lesson plan request created', {
        requestId,
        userId,
        topic,
        contentType
      });

      // 2. Queue to SQS for async processing
      try {
        await SQSQueueService.queueCoachingJob(requestId, 'lesson_plan_generation', {
          requestId,
          userId,
          phoneNumber,
          topic,
          fullMessage,
          language,
          contentType
        });

        logToFile('Lesson plan job queued to SQS', { requestId });
      } catch (sqsError) {
        // If SQS fails, mark request for retry and log error
        await supabase
          .from('lesson_plan_requests')
          .update({
            status: 'pending',
            error_message: `SQS queue failed: ${sqsError.message}`
          })
          .eq('id', requestId);

        logToFile('Failed to queue lesson plan to SQS, marked for retry', {
          requestId,
          error: sqsError.message
        });
      }

      return requestId;

    } catch (error) {
      logToFile('Error in lesson plan queue service', {
        error: error.message,
        userId,
        topic
      });
      throw error;
    }
  }

  /**
   * Update request status to processing
   * @param {string} requestId - Request UUID
   */
  static async markProcessing(requestId) {
    await supabase
      .from('lesson_plan_requests')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', requestId);

    logToFile('Lesson plan request marked processing', { requestId });
  }

  /**
   * Mark request as completed with results
   * @param {string} requestId - Request UUID
   * @param {Object} result - { gammaUrl, pdfUrl }
   */
  static async markCompleted(requestId, result) {
    await supabase
      .from('lesson_plan_requests')
      .update({
        status: 'completed',
        gamma_url: result.gammaUrl,
        pdf_url: result.pdfUrl,
        completed_at: new Date().toISOString()
      })
      .eq('id', requestId);

    logToFile('Lesson plan request completed', { requestId });
  }

  /**
   * Mark request as failed
   * @param {string} requestId - Request UUID
   * @param {string} errorMessage - Error description
   */
  static async markFailed(requestId, errorMessage) {
    const { data: request } = await supabase
      .from('lesson_plan_requests')
      .select('retry_count')
      .eq('id', requestId)
      .single();

    await supabase
      .from('lesson_plan_requests')
      .update({
        status: 'failed',
        error_message: errorMessage,
        retry_count: (request?.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString()
      })
      .eq('id', requestId);

    logToFile('Lesson plan request failed', { requestId, errorMessage });
  }

  /**
   * Get request by ID
   * @param {string} requestId - Request UUID
   * @returns {Promise<Object>} Request data
   */
  static async getRequest(requestId) {
    const { data, error } = await supabase
      .from('lesson_plan_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error) {
      throw new Error(`Failed to get lesson plan request: ${error.message}`);
    }

    return data;
  }

  /**
   * Get stale processing requests (for recovery on startup)
   * @param {number} staleMinutes - Minutes after which a processing request is considered stale
   * @returns {Promise<Array>} Stale requests
   */
  static async getStaleRequests(staleMinutes = 10) {
    const staleTime = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('lesson_plan_requests')
      .select('*')
      .eq('status', 'processing')
      .lt('processing_started_at', staleTime);

    if (error) {
      logToFile('Error fetching stale requests', { error: error.message });
      return [];
    }

    return data || [];
  }

  /**
   * Get pending requests that weren't queued (for recovery)
   * @returns {Promise<Array>} Pending requests
   */
  static async getPendingRequests() {
    const { data, error } = await supabase
      .from('lesson_plan_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      logToFile('Error fetching pending requests', { error: error.message });
      return [];
    }

    return data || [];
  }

  /**
   * Requeue a request for retry
   * @param {Object} request - Request data from DB
   */
  static async requeueRequest(request) {
    try {
      // Reset status to pending
      await supabase
        .from('lesson_plan_requests')
        .update({
          status: 'pending',
          processing_started_at: null
        })
        .eq('id', request.id);

      // Queue to SQS
      await SQSQueueService.queueCoachingJob(request.id, 'lesson_plan_generation', {
        requestId: request.id,
        userId: request.user_id,
        phoneNumber: request.phone_number,
        topic: request.topic,
        fullMessage: request.full_message,
        language: request.language,
        contentType: request.content_type
      });

      logToFile('Lesson plan request requeued', { requestId: request.id });
    } catch (error) {
      logToFile('Error requeuing lesson plan request', {
        requestId: request.id,
        error: error.message
      });
    }
  }
}

module.exports = LessonPlanQueueService;
