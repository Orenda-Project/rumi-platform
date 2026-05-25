/**
 * Queue driver selector.
 *
 *   QUEUE_DRIVER=sqs    (default) → AWS SQS  (needs SQS_QUEUE_URL + AWS creds)
 *   QUEUE_DRIVER=bullmq           → BullMQ/Redis (needs only REDIS_URL — no AWS)
 *
 * Both drivers expose the identical method surface (producers + pull/ack consumers
 * + cancelByGroupId), so every consumer requires THIS module and is agnostic to the
 * backend. Defaulting to sqs and requiring the SQS singleton lazily here means
 * existing deploys are byte-identical and the bullmq package is never loaded unless
 * explicitly selected.
 */

const driver = (process.env.QUEUE_DRIVER || 'sqs').toLowerCase();

if (driver === 'bullmq') {
  module.exports = require('./bullmq-queue.service');
} else {
  if (driver !== 'sqs') {
    require('../../utils/logger').logToFile(
      `⚠️  Unknown QUEUE_DRIVER="${driver}" — falling back to sqs. Valid values: sqs | bullmq.`,
      { level: 'warn' }
    );
  }
  module.exports = require('./sqs-queue.service');
}
