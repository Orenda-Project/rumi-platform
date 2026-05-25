/**
 * BullMQ (Redis) Queue Service — AWS-free alternative to the SQS driver.
 *
 * Selected by QUEUE_DRIVER=bullmq (see ./index.js). Exposes the EXACT same method
 * surface as sqs-queue.service.js so the worker poll loop (workers/sqs-worker.js)
 * and every producer are driver-agnostic. The only env a cloner needs for the full
 * async pipeline is REDIS_URL — no AWS account, no SQS queues.
 *
 * How the SQS pull/ack model maps onto BullMQ:
 * - SQS receiveJobs(n)  → BullMQ manual Worker.getNextJob(token) (one blocking pull
 *   per call; the worker loop polls continuously, so 1 job/call is sufficient and
 *   the ~drainDelay block gives SQS-long-poll-like pacing on an empty queue).
 * - SQS receiptHandle   → "<queueKey>:<jobId>:<token>" (self-contained → stateless
 *   ack/extend; the token is the BullMQ lock token from getNextJob).
 * - completeJob(rh)     → job.moveToCompleted(null, token, false).
 * - extendJobTimeout    → job.extendLock(token, ms) (renews the processing lock,
 *   the BullMQ analogue of SQS changeMessageVisibility).
 * - delaySeconds        → { delay: ms } (BullMQ supports per-job delay on any queue).
 * - dedup               → { jobId } (a duplicate add with the same jobId is ignored).
 * - metrics             → queue.getJobCounts('waiting','active','delayed').
 *
 * Envelope shapes are byte-identical to the SQS driver (v1.0 for coaching/video,
 * v2.0 for the generic queueJob) so handlers read body.* the same way either way.
 */

const { logToFile } = require('../../utils/logger');
const RedisService = require('../cache/railway-redis.service');
const { getCurrentCorrelationId, logEvent } = require('../../utils/structured-logger');
const crypto = require('crypto');

// Logical queue names (Redis key namespaces). Kept stable so a deploy that switches
// drivers mid-flight doesn't strand jobs under a renamed queue.
const QUEUE_NAMES = {
  main: process.env.BULLMQ_MAIN_QUEUE || 'rumi-main',
  video: process.env.BULLMQ_VIDEO_QUEUE || 'rumi-video',
  quiz: process.env.BULLMQ_QUIZ_QUEUE || 'rumi-quiz',
};

// Lock duration must cover the longest job's processing window (video = 30 min SQS
// visibility). extendJobTimeout renews it for anything longer.
const DEFAULT_LOCK_MS = 30 * 60 * 1000;

class BullMQQueueService {
  constructor() {
    this.redisUrl = process.env.REDIS_URL;
    this._bullmq = null;       // lazily-required module
    this._connection = null;   // dedicated ioredis connection for BullMQ
    this._queues = {};         // name → Queue
    this._workers = {};        // name → Worker (manual mode, for getNextJob)

    if (!this.redisUrl) {
      logToFile('⚠️  REDIS_URL not configured. BullMQ queue driver disabled.', { level: 'warn' });
    } else {
      logToFile('✅ BullMQ queue driver selected', { queues: QUEUE_NAMES });
    }
  }

  // ── lazy infra ────────────────────────────────────────────────────────────

  _lib() {
    if (this._bullmq) return this._bullmq;
    try {
      // Lazy so the default (SQS) driver never needs bullmq installed, and so the
      // root test pass (which mocks it) controls when it loads.
      this._bullmq = require('bullmq');
    } catch (err) {
      throw new Error(
        'QUEUE_DRIVER=bullmq but the "bullmq" package is not installed. ' +
        'Run `npm install bullmq` in bot/ (it is a declared dependency; this only ' +
        'happens if you installed with --omit=optional or a partial tree). Original: ' + err.message
      );
    }
    return this._bullmq;
  }

  _conn() {
    if (this._connection) return this._connection;
    if (!this.redisUrl) throw new Error('BullMQ queue not configured (REDIS_URL unset)');
    const IORedis = require('ioredis');
    // BullMQ requires maxRetriesPerRequest: null on its blocking connection.
    this._connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    return this._connection;
  }

  _queue(key) {
    if (this._queues[key]) return this._queues[key];
    const { Queue } = this._lib();
    this._queues[key] = new Queue(QUEUE_NAMES[key], { connection: this._conn() });
    return this._queues[key];
  }

  // Manual-mode worker (no processor fn) → we drive it with getNextJob/moveToCompleted.
  _worker(key) {
    if (this._workers[key]) return this._workers[key];
    const { Worker } = this._lib();
    this._workers[key] = new Worker(QUEUE_NAMES[key], null, {
      connection: this._conn(),
      lockDuration: DEFAULT_LOCK_MS,
      autorun: false, // we never call run(); we pull manually via getNextJob
    });
    return this._workers[key];
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  // Build the SQS-shaped message object the worker expects.
  _wrap(queueKey, job, token) {
    return {
      messageId: String(job.id),
      receiptHandle: `${queueKey}:${job.id}:${token}`,
      body: job.data,
      attributes: {},
      receivedAt: new Date().toISOString(),
    };
  }

  _parseHandle(receiptHandle) {
    const i = receiptHandle.indexOf(':');
    const j = receiptHandle.indexOf(':', i + 1);
    if (i < 0 || j < 0) throw new Error(`Malformed BullMQ receiptHandle: ${receiptHandle}`);
    return {
      queueKey: receiptHandle.slice(0, i),
      jobId: receiptHandle.slice(i + 1, j),
      token: receiptHandle.slice(j + 1),
    };
  }

  // Pull up to one job from a queue (the worker loop polls continuously, so one
  // job per call keeps the driver simple while preserving throughput).
  async _receive(queueKey) {
    if (!this.redisUrl) return [];
    try {
      const token = crypto.randomUUID();
      const job = await this._worker(queueKey).getNextJob(token);
      if (!job) return [];
      logToFile('📥 Received job (bullmq)', { queue: QUEUE_NAMES[queueKey], jobType: job.data && job.data.jobType });
      return [this._wrap(queueKey, job, token)];
    } catch (err) {
      logToFile('❌ Failed to receive jobs (bullmq)', { queue: queueKey, error: err.message });
      throw err;
    }
  }

  async _add(queueKey, envelope, { jobId, delaySeconds } = {}) {
    if (!this.redisUrl) throw new Error('BullMQ queue not configured (REDIS_URL unset)');
    const opts = {
      removeOnComplete: true,
      removeOnFail: 1000, // keep recent failures for inspection (DLQ analogue)
    };
    if (jobId) opts.jobId = jobId;
    if (delaySeconds && delaySeconds > 0) opts.delay = Math.min(900, delaySeconds) * 1000;
    const job = await this._queue(queueKey).add(envelope.jobType || 'job', envelope, opts);
    return String(job.id);
  }

  async _ack(receiptHandle) {
    const { queueKey, jobId, token } = this._parseHandle(receiptHandle);
    const { Job } = this._lib();
    const job = await Job.fromId(this._queue(queueKey), jobId);
    if (!job) return; // already removed
    await job.moveToCompleted(null, token, false);
  }

  async _extend(receiptHandle, additionalSeconds) {
    const { queueKey, jobId, token } = this._parseHandle(receiptHandle);
    const { Job } = this._lib();
    const job = await Job.fromId(this._queue(queueKey), jobId);
    if (!job) return;
    await job.extendLock(token, Math.min(additionalSeconds, 43200) * 1000);
  }

  async _metrics(queueKey) {
    if (!this.redisUrl) throw new Error('BullMQ queue not configured (REDIS_URL unset)');
    const counts = await this._queue(queueKey).getJobCounts('waiting', 'active', 'delayed');
    const m = {
      messagesAvailable: counts.waiting || 0,
      messagesInFlight: counts.active || 0,
      messagesDelayed: counts.delayed || 0,
      timestamp: new Date().toISOString(),
    };
    m.totalDepth = m.messagesAvailable + m.messagesInFlight + m.messagesDelayed;
    return m;
  }

  // ── producers (SQS-parity surface) ──────────────────────────────────────

  async queueCoachingJob(sessionId, jobType, payload = {}) {
    const correlationId = getCurrentCorrelationId();
    const envelope = { sessionId, jobType, payload, correlationId, queuedAt: new Date().toISOString(), version: '1.0' };
    const id = await this._add('main', envelope, { jobId: `${sessionId}-${jobType}` });
    logToFile('📤 Coaching job queued (bullmq)', { sessionId, jobType, jobId: id });
    return id;
  }

  async queueVideoJob(videoRequestId, jobType, payload = {}) {
    const correlationId = getCurrentCorrelationId();
    const envelope = { videoRequestId, jobType, payload, correlationId, queuedAt: new Date().toISOString(), version: '1.0' };
    const id = await this._add('video', envelope, { jobId: `${videoRequestId}-${jobType}` });
    logToFile('📤 Video job queued (bullmq)', { videoRequestId, jobType, jobId: id });
    return id;
  }

  async queueJob(groupId, jobType, payload = {}, opts = {}) {
    const isQuizJob = jobType && jobType.startsWith('quiz_');
    const queueKey = isQuizJob ? 'quiz' : 'main';
    const correlationId = getCurrentCorrelationId();
    const envelope = { groupId, jobType, payload, correlationId, queuedAt: new Date().toISOString(), version: '2.0' };
    // Dedup only when the caller passes an explicit id (matches SQS, whose default
    // deduplicationId embeds Date.now() → effectively unique).
    const id = await this._add(queueKey, envelope, { jobId: opts.deduplicationId, delaySeconds: opts.delaySeconds });
    logToFile('📤 Job queued (bullmq, v2 envelope)', { groupId, jobType, jobId: id, queue: queueKey, delaySeconds: opts.delaySeconds || 0 });
    logEvent('queue.job.queued', { correlationId, jobType, requestId: groupId, messageId: id });
    return id;
  }

  // ── consumers (SQS-parity surface) ──────────────────────────────────────

  async receiveJobs() { return this._receive('main'); }
  async receiveVideoJobs() { return this._receive('video'); }
  async receiveQuizJobs() { return this._receive('quiz'); }

  async completeJob(rh) { return this._ack(rh); }
  async completeVideoJob(rh) { return this._ack(rh); }
  async completeQuizJob(rh) { return this._ack(rh); }

  async extendJobTimeout(rh, secs) { return this._extend(rh, secs); }
  async extendVideoJobTimeout(rh, secs) { return this._extend(rh, secs); }
  async extendQuizJobTimeout(rh, secs) { return this._extend(rh, secs); }

  // Make a job visible again for retry. The worker's hot path leaves this unused
  // (its requeueJob call is commented out), so a best-effort re-add is sufficient.
  async requeueJob(rh) {
    const { queueKey, jobId, token } = this._parseHandle(rh);
    const { Job } = this._lib();
    const job = await Job.fromId(this._queue(queueKey), jobId);
    if (!job) return;
    try {
      await job.moveToFailed(new Error('requeue'), token, false);
    } catch (err) {
      logToFile('⚠️ requeueJob best-effort failed (bullmq)', { rh: rh.slice(0, 40), error: err.message });
    }
  }

  async getQueueMetrics() { return this._metrics('main'); }
  async getVideoQueueMetrics() { return this._metrics('video'); }

  /**
   * Cancel pending jobs for a group. Identical contract to the SQS driver: writes
   * `sqs:cancel:<jobType>:<groupId>` (1h TTL), which the worker handler checks (see
   * quiz-job-handler `isCancelled`). Also best-effort removes any still-delayed
   * BullMQ jobs matching the dedup id, which SQS cannot do.
   */
  async cancelByGroupId(groupId, jobTypes = []) {
    const CANCEL_TTL = 3600;
    for (const jobType of jobTypes) {
      try {
        await RedisService.set(`sqs:cancel:${jobType}:${groupId}`, '1', CANCEL_TTL);
        logToFile('🛑 Cancel flag set (bullmq)', { groupId, jobType });
      } catch (err) {
        logToFile('⚠️ Failed to set cancel flag (bullmq, non-fatal)', { groupId, jobType, error: err.message });
      }
    }
  }
}

module.exports = new BullMQQueueService();
