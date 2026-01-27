/**
 * Portal SQS Queue Service
 *
 * Handles job queuing for Portal-specific async processing:
 * - Transcript processing (GPT-4o-mini refinement)
 * - AMA processing (SQL generation)
 *
 * Separate from Main Bot's SQS queue to avoid interference.
 * Uses dedicated SQS_PORTAL_QUEUE_URL environment variable.
 *
 * Bead: plt-sqs01, plt-sqs02
 * Issue: Transcript/AMA processing blocks main thread for 30-45s
 * Solution: Queue jobs to SQS, process in separate worker
 */

const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand, ChangeMessageVisibilityCommand } = require('@aws-sdk/client-sqs');

// Job types for Portal processing
const JOB_TYPES = {
  TRANSCRIPT_PROCESSING: 'transcript_processing',
  AMA_PROCESSING: 'ama_processing'
};

class PortalSQSService {
  constructor() {
    // Configure AWS SDK v3 client
    this.client = new SQSClient({
      region: process.env.AWS_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // Portal-specific queue URL (separate from Main Bot)
    this.queueUrl = process.env.SQS_PORTAL_QUEUE_URL;

    // Job idempotency TTL (1 hour)
    this.JOB_TTL = 3600;

    if (!this.queueUrl) {
      console.log('[Portal SQS] SQS_PORTAL_QUEUE_URL not configured. Queue service disabled.');
    } else {
      console.log('[Portal SQS] Queue service initialized:', this.queueUrl);
    }
  }

  /**
   * Check if the service is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.queueUrl;
  }

  /**
   * Queue a transcript processing job
   *
   * @param {string} sessionId - Coaching session ID
   * @param {object} payload - Job data (rawTranscript, etc.)
   * @returns {Promise<object>} Result with messageId or error
   */
  async queueTranscriptJob(sessionId, payload = {}) {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    return this._queueJob({
      sessionId,
      jobType: JOB_TYPES.TRANSCRIPT_PROCESSING,
      payload,
      groupId: `transcript-${sessionId}`,
      deduplicationId: `transcript-${sessionId}`
    });
  }

  /**
   * Queue an AMA processing job
   *
   * @param {string} conversationId - AMA conversation ID
   * @param {object} payload - Job data (question, userId, etc.)
   * @returns {Promise<object>} Result with messageId or error
   */
  async queueAMAJob(conversationId, payload = {}) {
    if (!conversationId) {
      return { success: false, error: 'conversationId is required' };
    }

    return this._queueJob({
      conversationId,
      jobType: JOB_TYPES.AMA_PROCESSING,
      payload,
      groupId: `ama-${conversationId}`,
      deduplicationId: `ama-${conversationId}-${Date.now()}`
    });
  }

  /**
   * Internal method to queue a job
   */
  async _queueJob(jobData) {
    try {
      if (!this.queueUrl) {
        return { success: false, error: 'SQS Portal Queue not configured' };
      }

      const messageBody = {
        ...jobData,
        queuedAt: new Date().toISOString(),
        version: '1.0',
        source: 'portal'
      };

      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(messageBody),
        MessageGroupId: jobData.groupId,
        MessageDeduplicationId: jobData.deduplicationId,
        MessageAttributes: {
          jobType: {
            DataType: 'String',
            StringValue: jobData.jobType
          },
          source: {
            DataType: 'String',
            StringValue: 'portal'
          }
        }
      });

      const result = await this.client.send(command);

      console.log(JSON.stringify({
        event: 'portal.sqs.job.queued',
        jobType: jobData.jobType,
        messageId: result.MessageId,
        sessionId: jobData.sessionId,
        conversationId: jobData.conversationId,
        timestamp: new Date().toISOString()
      }));

      return {
        success: true,
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber
      };

    } catch (error) {
      console.error(JSON.stringify({
        event: 'portal.sqs.job.failed',
        jobType: jobData.jobType,
        error: error.message,
        sessionId: jobData.sessionId,
        conversationId: jobData.conversationId,
        timestamp: new Date().toISOString()
      }));

      return { success: false, error: error.message };
    }
  }

  /**
   * Receive jobs from the queue (for worker)
   *
   * @param {number} maxMessages - Max messages to retrieve (1-10)
   * @returns {Promise<Array>} Array of job messages
   */
  async receiveJobs(maxMessages = 1) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Portal Queue not configured');
      }

      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: 20, // Long polling
        VisibilityTimeout: 600, // 10 minutes for processing
        MessageAttributeNames: ['All']
      });

      const result = await this.client.send(command);

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
          console.error(JSON.stringify({
            event: 'portal.sqs.message.parse.failed',
            messageId: msg.MessageId,
            error: parseError.message
          }));
          return null;
        }
      }).filter(Boolean);

      console.log(JSON.stringify({
        event: 'portal.sqs.jobs.received',
        count: jobs.length,
        jobTypes: jobs.map(j => j.body.jobType),
        timestamp: new Date().toISOString()
      }));

      return jobs;

    } catch (error) {
      console.error(JSON.stringify({
        event: 'portal.sqs.receive.failed',
        error: error.message
      }));
      throw error;
    }
  }

  /**
   * Mark a job as completed (delete from queue)
   *
   * @param {string} receiptHandle - SQS receipt handle
   * @returns {Promise<void>}
   */
  async completeJob(receiptHandle) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Portal Queue not configured');
      }

      const command = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle
      });

      await this.client.send(command);

      console.log(JSON.stringify({
        event: 'portal.sqs.job.completed',
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error(JSON.stringify({
        event: 'portal.sqs.job.complete.failed',
        error: error.message
      }));
      throw error;
    }
  }

  /**
   * Extend visibility timeout for a job
   *
   * @param {string} receiptHandle - SQS receipt handle
   * @param {number} additionalSeconds - Additional seconds
   * @returns {Promise<void>}
   */
  async extendJobTimeout(receiptHandle, additionalSeconds) {
    try {
      if (!this.queueUrl) {
        throw new Error('SQS Portal Queue not configured');
      }

      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: Math.min(additionalSeconds, 43200)
      });

      await this.client.send(command);

      console.log(JSON.stringify({
        event: 'portal.sqs.job.timeout.extended',
        additionalSeconds,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error(JSON.stringify({
        event: 'portal.sqs.job.timeout.failed',
        error: error.message
      }));
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
        return {
          configured: false,
          messagesAvailable: 0,
          messagesInFlight: 0,
          messagesDelayed: 0
        };
      }

      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed'
        ]
      });

      const result = await this.client.send(command);
      const attrs = result.Attributes;

      return {
        configured: true,
        messagesAvailable: parseInt(attrs.ApproximateNumberOfMessages || '0'),
        messagesInFlight: parseInt(attrs.ApproximateNumberOfMessagesNotVisible || '0'),
        messagesDelayed: parseInt(attrs.ApproximateNumberOfMessagesDelayed || '0'),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(JSON.stringify({
        event: 'portal.sqs.metrics.failed',
        error: error.message
      }));

      return {
        configured: this.isConfigured(),
        error: error.message
      };
    }
  }
}

// Export singleton instance with JOB_TYPES
const service = new PortalSQSService();
service.JOB_TYPES = JOB_TYPES;

module.exports = service;
