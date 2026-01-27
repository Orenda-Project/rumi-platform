/**
 * BullMQ Queue Service
 *
 * Drop-in replacement for sqs-queue.service.js using Redis-based BullMQ.
 * Provides the same interface: enqueue(), queueCoachingJob(), queueVideoJob().
 *
 * Requires: REDIS_URL environment variable.
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');

const QUEUE_NAME = process.env.QUEUE_NAME || 'rumi-jobs';

class BullMQQueueService {
  constructor(options = {}) {
    const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  /**
   * Enqueue a job.
   * @param {string} jobType - One of the 7 job types
   * @param {object} data - Job payload
   * @param {object} [options] - Optional: { jobId, correlationId, priority, delay }
   * @returns {Promise<{id: string}>} Job info
   */
  async enqueue(jobType, data, options = {}) {
    const jobData = { ...data };
    if (options.correlationId) {
      jobData.correlationId = options.correlationId;
    }
    jobData.queuedAt = new Date().toISOString();
    jobData.version = '1.0';

    const jobOptions = {
      attempts: options.attempts || 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    };

    if (options.jobId) {
      jobOptions.jobId = options.jobId;
    }
    if (options.priority) {
      jobOptions.priority = options.priority;
    }
    if (options.delay) {
      jobOptions.delay = options.delay;
    }

    const job = await this.queue.add(jobType, jobData, jobOptions);
    return { id: job.id, name: job.name };
  }

  /**
   * Queue a coaching pipeline job (transcription, analysis, report, extraction).
   * Uses sessionId-based jobId for deduplication.
   */
  async queueCoachingJob(sessionId, jobType, payload = {}) {
    return this.enqueue(jobType, { sessionId, ...payload }, {
      jobId: `${sessionId}:${jobType}`,
      correlationId: payload.correlationId,
    });
  }

  /**
   * Queue a video generation job.
   * Uses videoRequestId-based jobId for deduplication.
   */
  async queueVideoJob(videoRequestId, jobType, payload = {}) {
    return this.enqueue(jobType, { videoRequestId, ...payload }, {
      jobId: `${videoRequestId}:${jobType}`,
      correlationId: payload.correlationId,
    });
  }

  /**
   * Get queue job counts for monitoring.
   */
  async getJobCounts() {
    return this.queue.getJobCounts();
  }

  /**
   * Close the queue connection.
   */
  async close() {
    await this.queue.close();
    await this.connection.quit();
  }
}

module.exports = BullMQQueueService;
