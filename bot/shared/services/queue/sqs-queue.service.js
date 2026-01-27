/**
 * AWS SQS Queue Service
 * Handles job queuing for coaching session processing
 *
 * Features:
 * - FIFO ordering (process jobs in order)
 * - Automatic deduplication (prevent duplicate processing)
 * - Dead letter queue (handle failed jobs)
 * - Long polling (efficient message retrieval)
 * - Retry with exponential backoff
 *
 * Job Types:
 * - transcription: Audio transcription via Soniox
 * - analysis: Pedagogical analysis via GPT-5 mini
 * - report_generation: Report creation via Gamma
 * - voice_generation: Voice debrief via ElevenLabs
 * - notification: Send final results to user
 */

const AWS = require('aws-sdk');
const { logToFile } = require('../../utils/logger');
const RedisService = require('../cache/railway-redis.service');
const { getCurrentCorrelationId } = require('../../utils/structured-logger');

class SQSQueueService {
  constructor() {
    // Configure AWS SDK
    AWS.config.update({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });

    this.sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
    this.queueUrl = process.env.SQS_QUEUE_URL;
    this.videoQueueUrl = process.env.SQS_VIDEO_QUEUE_URL;  // Dedicated video queue
    this.dlqUrl = process.env.SQS_DLQ_URL;

    // Redis key prefix for job idempotency
    this.JOB_PREFIX = 'coaching:job:';
    this.JOB_TTL = 3600; // 1 hour TTL for job idempotency keys

    if (!this.queueUrl) {
      logToFile('⚠️  SQS_QUEUE_URL not configured. Queue service disabled.', { level: 'warn' });
    }
    if (this.videoQueueUrl) {
      logToFile('✅ Dedicated video queue configured', { videoQueueUrl: this.videoQueueUrl });
    }
  }

  /**
   * Queue a coaching job for processing with Redis-based idempotency
   *
   * @param {string} sessionId - Coaching session ID
   * @param {string} jobType - Type of job (transcription, analysis, etc.)
   * @param {object} payload - Job-specific data
   * @returns {Promise<string>} SQS Message ID
   */
  async queueCoachingJob(sessionId, jobType, payload = {}) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      // Check Redis for duplicate job (idempotency check)
      const idempotencyKey = `${this.JOB_PREFIX}${sessionId}:${jobType}`;

      try {
        const existingMessageId = await RedisService.get(idempotencyKey);

        if (existingMessageId) {
          logToFile('⚠️  Duplicate job detected, skipping queue (Redis idempotency)', {
            sessionId,
            jobType,
            existingMessageId,
            idempotencyKey
          });

          return existingMessageId; // Return cached message ID
        }
      } catch (redisError) {
        logToFile('⚠️  Redis idempotency check failed, proceeding with queue', {
          sessionId,
          jobType,
          error: redisError.message
        });
        // Continue with queuing - better to risk duplicate than block processing
      }

      // Include correlation ID for request tracing across services
      const correlationId = getCurrentCorrelationId();

      const messageBody = {
        sessionId,
        jobType,
        payload,
        correlationId, // Pass correlation ID to worker for tracing
        queuedAt: new Date().toISOString(),
        version: '1.0'
      };

      const params = {
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(messageBody),

        // FIFO queue parameters
        MessageGroupId: sessionId,  // Ensures all jobs for a session are processed in order
        MessageDeduplicationId: `${sessionId}-${jobType}`,  // Stable deduplication ID (no timestamp)

        // Message attributes for filtering/monitoring
        MessageAttributes: {
          jobType: {
            DataType: 'String',
            StringValue: jobType
          },
          sessionId: {
            DataType: 'String',
            StringValue: sessionId
          },
          queuedAt: {
            DataType: 'Number',
            StringValue: Date.now().toString()
          }
        }
      };

      const result = await this.sqs.sendMessage(params).promise();

      logToFile('📤 Job queued to SQS', {
        sessionId,
        jobType,
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber,
        deduplicationId: params.MessageDeduplicationId
      });

      // Store message ID in Redis for idempotency (with TTL)
      try {
        await RedisService.set(idempotencyKey, result.MessageId, this.JOB_TTL);

        logToFile('✅ Job idempotency key stored in Redis', {
          sessionId,
          jobType,
          messageId: result.MessageId,
          ttl: this.JOB_TTL,
          idempotencyKey
        });
      } catch (redisError) {
        logToFile('⚠️  Failed to store job idempotency key in Redis', {
          sessionId,
          jobType,
          error: redisError.message
        });
        // Non-fatal - job was queued successfully
      }

      return result.MessageId;

    } catch (error) {
      logToFile('❌ Failed to queue job to SQS', {
        sessionId,
        jobType,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Queue a video generation job to the dedicated video queue
   * Falls back to main queue if video queue not configured
   *
   * @param {string} videoRequestId - Video request ID
   * @param {string} jobType - Type of video job (video_generation, video_script, etc.)
   * @param {object} payload - Job-specific data
   * @returns {Promise<string>} SQS Message ID
   */
  async queueVideoJob(videoRequestId, jobType, payload = {}) {
    try {
      // Use dedicated video queue if configured, otherwise fall back to main queue
      const queueUrl = this.videoQueueUrl || this.queueUrl;

      if (!queueUrl) {
        throw new Error('No queue configured for video jobs');
      }

      const isVideoQueue = !!this.videoQueueUrl;

      // Check Redis for duplicate job (idempotency check)
      const idempotencyKey = `video:job:${videoRequestId}:${jobType}`;

      try {
        const existingMessageId = await RedisService.get(idempotencyKey);

        if (existingMessageId) {
          logToFile('⚠️  Duplicate video job detected, skipping queue (Redis idempotency)', {
            videoRequestId,
            jobType,
            existingMessageId,
            idempotencyKey,
            usingVideoQueue: isVideoQueue
          });

          return existingMessageId;
        }
      } catch (redisError) {
        logToFile('⚠️  Redis idempotency check failed for video job, proceeding', {
          videoRequestId,
          jobType,
          error: redisError.message
        });
      }

      // Include correlation ID for request tracing
      const correlationId = getCurrentCorrelationId();

      const messageBody = {
        videoRequestId,
        jobType,
        payload,
        correlationId,
        queuedAt: new Date().toISOString(),
        version: '1.0'
      };

      const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody),

        // FIFO queue parameters
        MessageGroupId: videoRequestId,
        MessageDeduplicationId: `${videoRequestId}-${jobType}`,

        // Message attributes for filtering/monitoring
        MessageAttributes: {
          jobType: {
            DataType: 'String',
            StringValue: jobType
          },
          videoRequestId: {
            DataType: 'String',
            StringValue: videoRequestId
          },
          queuedAt: {
            DataType: 'Number',
            StringValue: Date.now().toString()
          }
        }
      };

      const result = await this.sqs.sendMessage(params).promise();

      logToFile('📤 Video job queued to SQS', {
        videoRequestId,
        jobType,
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber,
        usingVideoQueue: isVideoQueue,
        queueUrl: isVideoQueue ? 'video-queue' : 'main-queue'
      });

      // Store message ID in Redis for idempotency
      try {
        await RedisService.set(idempotencyKey, result.MessageId, this.JOB_TTL);
      } catch (redisError) {
        logToFile('⚠️  Failed to store video job idempotency key', {
          videoRequestId,
          jobType,
          error: redisError.message
        });
      }

      return result.MessageId;

    } catch (error) {
      logToFile('❌ Failed to queue video job to SQS', {
        videoRequestId,
        jobType,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Receive video jobs from the dedicated video queue
   * Falls back to main queue if video queue not configured
   *
   * @param {number} maxMessages - Maximum messages to retrieve (1-10)
   * @returns {Promise<Array>} Array of video job messages
   */
  async receiveVideoJobs(maxMessages = 1) {
    try {
      const queueUrl = this.videoQueueUrl || this.queueUrl;

      if (!queueUrl) {
        throw new Error('No queue configured for video jobs');
      }

      const isVideoQueue = !!this.videoQueueUrl;

      const params = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: 20,
        VisibilityTimeout: 1800,  // 30 minutes for video processing
        MessageAttributeNames: ['All']
      };

      const result = await this.sqs.receiveMessage(params).promise();

      if (!result.Messages || result.Messages.length === 0) {
        return [];
      }

      const jobs = result.Messages.map(msg => {
        try {
          return {
            messageId: msg.MessageId,
            receiptHandle: msg.ReceiptHandle,
            body: JSON.parse(msg.Body),
            attributes: msg.MessageAttributes || {},
            receivedAt: new Date().toISOString()
          };
        } catch (parseError) {
          logToFile('❌ Failed to parse video SQS message', {
            messageId: msg.MessageId,
            error: parseError.message
          });
          return null;
        }
      }).filter(Boolean);

      logToFile('📥 Received video jobs from SQS', {
        count: jobs.length,
        jobTypes: jobs.map(j => j.body.jobType),
        usingVideoQueue: isVideoQueue
      });

      return jobs;

    } catch (error) {
      logToFile('❌ Failed to receive video jobs from SQS', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Complete a video job (delete from queue)
   *
   * @param {string} receiptHandle - SQS receipt handle
   * @returns {Promise<void>}
   */
  async completeVideoJob(receiptHandle) {
    try {
      const queueUrl = this.videoQueueUrl || this.queueUrl;

      if (!queueUrl) {
        throw new Error('No queue configured for video jobs');
      }

      await this.sqs.deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle
      }).promise();

      logToFile('✅ Video job completed and removed from queue', {
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });

    } catch (error) {
      logToFile('❌ Failed to complete video job', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extend visibility timeout for a video job
   *
   * @param {string} receiptHandle - SQS receipt handle
   * @param {number} additionalSeconds - Additional seconds (max 43200)
   * @returns {Promise<void>}
   */
  async extendVideoJobTimeout(receiptHandle, additionalSeconds) {
    try {
      const queueUrl = this.videoQueueUrl || this.queueUrl;

      if (!queueUrl) {
        throw new Error('No queue configured for video jobs');
      }

      await this.sqs.changeMessageVisibility({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: Math.min(additionalSeconds, 43200)
      }).promise();

      logToFile('⏰ Video job timeout extended', {
        additionalSeconds,
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });

    } catch (error) {
      logToFile('❌ Failed to extend video job timeout', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Receive and process jobs from the queue
   * Long polling for efficiency (waits up to 20 seconds for messages)
   *
   * @param {number} maxMessages - Maximum messages to retrieve (1-10)
   * @returns {Promise<Array>} Array of job messages
   */
  async receiveJobs(maxMessages = 1) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      const params = {
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),  // AWS max is 10
        WaitTimeSeconds: 20,  // Long polling (reduces costs, increases efficiency)
        VisibilityTimeout: 900,  // 15 minutes to process (matches coaching job duration)
        MessageAttributeNames: ['All']
      };

      const result = await this.sqs.receiveMessage(params).promise();

      if (!result.Messages || result.Messages.length === 0) {
        return [];
      }

      const jobs = result.Messages.map(msg => {
        try {
          return {
            messageId: msg.MessageId,
            receiptHandle: msg.ReceiptHandle,
            body: JSON.parse(msg.Body),
            attributes: msg.MessageAttributes || {},
            receivedAt: new Date().toISOString()
          };
        } catch (parseError) {
          logToFile('❌ Failed to parse SQS message', {
            messageId: msg.MessageId,
            error: parseError.message
          });
          return null;
        }
      }).filter(Boolean);

      logToFile('📥 Received jobs from SQS', {
        count: jobs.length,
        jobTypes: jobs.map(j => j.body.jobType)
      });

      return jobs;

    } catch (error) {
      logToFile('❌ Failed to receive jobs from SQS', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark a job as successfully completed and remove from queue
   *
   * @param {string} receiptHandle - SQS receipt handle from received message
   * @returns {Promise<void>}
   */
  async completeJob(receiptHandle) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      await this.sqs.deleteMessage({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle
      }).promise();

      logToFile('✅ Job completed and removed from queue', {
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });

    } catch (error) {
      logToFile('❌ Failed to complete job', {
        error: error.message,
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  /**
   * Extend visibility timeout for a job that needs more processing time
   * Use this if job will take longer than expected
   *
   * @param {string} receiptHandle - SQS receipt handle
   * @param {number} additionalSeconds - Additional seconds to extend (max 43200 = 12 hours)
   * @returns {Promise<void>}
   */
  async extendJobTimeout(receiptHandle, additionalSeconds) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      await this.sqs.changeMessageVisibility({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: Math.min(additionalSeconds, 43200)  // AWS max is 12 hours
      }).promise();

      logToFile('⏰ Job timeout extended', {
        additionalSeconds,
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });

    } catch (error) {
      logToFile('❌ Failed to extend job timeout', {
        error: error.message,
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  /**
   * Return job to queue for retry
   * Job will become visible again after current visibility timeout expires
   *
   * @param {string} receiptHandle - SQS receipt handle
   * @returns {Promise<void>}
   */
  async requeueJob(receiptHandle) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      // Make message immediately visible again
      await this.sqs.changeMessageVisibility({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0  // Makes it visible immediately
      }).promise();

      logToFile('🔄 Job requeued for retry', {
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });

    } catch (error) {
      logToFile('❌ Failed to requeue job', {
        error: error.message,
        receiptHandle: receiptHandle.substring(0, 50) + '...'
      });
      throw error;
    }
  }

  /**
   * Get queue metrics for monitoring
   *
   * @returns {Promise<object>} Queue metrics
   */
  async getQueueMetrics() {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      const params = {
        QueueUrl: this.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed'
        ]
      };

      const result = await this.sqs.getQueueAttributes(params).promise();
      const attrs = result.Attributes;

      return {
        messagesAvailable: parseInt(attrs.ApproximateNumberOfMessages || '0'),
        messagesInFlight: parseInt(attrs.ApproximateNumberOfMessagesNotVisible || '0'),
        messagesDelayed: parseInt(attrs.ApproximateNumberOfMessagesDelayed || '0'),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logToFile('❌ Failed to get queue metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get video queue metrics for monitoring/concurrency control
   * Issue #43: Support queue depth check for 50 concurrent users
   *
   * @returns {Promise<object>} Video queue metrics
   */
  async getVideoQueueMetrics() {
    try {
      const queueUrl = this.videoQueueUrl || this.queueUrl;

      if (!queueUrl) {
        throw new Error('No queue configured for video jobs');
      }

      const params = {
        QueueUrl: queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed'
        ]
      };

      const result = await this.sqs.getQueueAttributes(params).promise();
      const attrs = result.Attributes;

      const metrics = {
        messagesAvailable: parseInt(attrs.ApproximateNumberOfMessages || '0'),
        messagesInFlight: parseInt(attrs.ApproximateNumberOfMessagesNotVisible || '0'),
        messagesDelayed: parseInt(attrs.ApproximateNumberOfMessagesDelayed || '0'),
        timestamp: new Date().toISOString()
      };

      // Total queue depth = waiting + in progress + delayed
      metrics.totalDepth = metrics.messagesAvailable + metrics.messagesInFlight + metrics.messagesDelayed;

      return metrics;

    } catch (error) {
      logToFile('❌ Failed to get video queue metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get messages from Dead Letter Queue (failed jobs)
   *
   * @param {number} maxMessages - Maximum messages to retrieve
   * @returns {Promise<Array>} Failed job messages
   */
  async getFailedJobs(maxMessages = 10) {
    try {
      if (!this.dlqUrl) {
        throw new Error('DLQ not configured');
      }

      const params = {
        QueueUrl: this.dlqUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: 1,  // Short poll for DLQ
        MessageAttributeNames: ['All']
      };

      const result = await this.sqs.receiveMessage(params).promise();

      if (!result.Messages || result.Messages.length === 0) {
        return [];
      }

      return result.Messages.map(msg => ({
        messageId: msg.MessageId,
        receiptHandle: msg.ReceiptHandle,
        body: JSON.parse(msg.Body),
        attributes: msg.MessageAttributes || {},
        receivedCount: parseInt(msg.Attributes?.ApproximateReceiveCount || '0')
      }));

    } catch (error) {
      logToFile('❌ Failed to get failed jobs from DLQ', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Purge all messages from queue (use with caution!)
   * Only use in development/testing
   *
   * @returns {Promise<void>}
   */
  async purgeQueue() {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Queue not configured');
      }

      if (process.env.NODE_ENV === 'production') {
        throw new Error('Cannot purge queue in production!');
      }

      await this.sqs.purgeQueue({
        QueueUrl: this.queueUrl
      }).promise();

      logToFile('🗑️  Queue purged', { environment: process.env.NODE_ENV });

    } catch (error) {
      logToFile('❌ Failed to purge queue', {
        error: error.message
      });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new SQSQueueService();
