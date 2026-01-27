/**
 * Video Job Queue Service
 *
 * Queues video generation jobs to SQS for async processing.
 * Follows pattern from lesson-plan-queue.service.js
 */

const { logToFile } = require('../../utils/logger');

class VideoJobQueueService {

  /**
   * Queue a video generation job to dedicated video queue
   * @param {string} videoRequestId - UUID of the video request
   * @param {Object} metadata - Additional metadata (userId, from, topic, language)
   */
  static async queueGeneration(videoRequestId, metadata) {
    const SQSQueueService = require('../queue/sqs-queue.service');

    try {
      // Use dedicated video queue (falls back to main queue if not configured)
      const messageId = await SQSQueueService.queueVideoJob(
        videoRequestId,
        'video_generation',
        {
          videoRequestId,
          ...metadata
        }
      );

      logToFile('Video generation job queued to dedicated video queue', {
        videoRequestId,
        messageId,
        topic: metadata.topic,
        language: metadata.language,
        usingDedicatedQueue: !!process.env.SQS_VIDEO_QUEUE_URL
      });

      return messageId;
    } catch (error) {
      logToFile('Error queuing video generation job', {
        videoRequestId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Queue a specific step for retry/resume to dedicated video queue
   * @param {string} videoRequestId - UUID of the video request
   * @param {string} step - Step name (script, images, animation, assembly)
   * @param {Object} metadata - Step-specific data
   */
  static async queueStep(videoRequestId, step, metadata) {
    const SQSQueueService = require('../queue/sqs-queue.service');

    try {
      // Use dedicated video queue (falls back to main queue if not configured)
      const messageId = await SQSQueueService.queueVideoJob(
        videoRequestId,
        `video_${step}`,
        {
          videoRequestId,
          step,
          ...metadata
        }
      );

      logToFile(`Video ${step} step queued to dedicated video queue`, {
        videoRequestId,
        messageId,
        step,
        usingDedicatedQueue: !!process.env.SQS_VIDEO_QUEUE_URL
      });

      return messageId;
    } catch (error) {
      logToFile(`Error queuing video ${step} step`, {
        videoRequestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get video queue depth for concurrency control
   * Issue #43: Used to reject requests when queue is full (>50)
   *
   * @returns {Promise<number>} Total queue depth (waiting + in progress + delayed)
   */
  static async getQueueDepth() {
    const SQSQueueService = require('../queue/sqs-queue.service');

    try {
      const metrics = await SQSQueueService.getVideoQueueMetrics();
      logToFile('Video queue depth retrieved', {
        totalDepth: metrics.totalDepth,
        available: metrics.messagesAvailable,
        inFlight: metrics.messagesInFlight
      });
      return metrics.totalDepth;
    } catch (error) {
      // On error, return 0 to allow job through (fail-open for availability)
      logToFile('⚠️  Could not get video queue depth, allowing job', {
        error: error.message
      });
      return 0;
    }
  }
}

module.exports = VideoJobQueueService;
