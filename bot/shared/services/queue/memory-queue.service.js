/**
 * In-memory Queue Service
 *
 * Implements the 16-method queue driver contract matching sqs-queue.service.js
 * and bullmq-queue.service.js for testing and zero-dependency local environments.
 */

const crypto = require('crypto');
const { logToFile } = require('../../utils/logger');
const { getCurrentCorrelationId, logEvent } = require('../../utils/structured-logger');

class MemoryQueueService {
  constructor() {
    this.seq = 0;
    this.clear();
  }

  /**
   * Reset all queues, in-flight jobs, deduplication records, and cancel flags.
   */
  clear() {
    this.seq = 0;
    this._queues = {
      main: { waiting: [], inFlight: new Map(), dedup: new Map() },
      video: { waiting: [], inFlight: new Map(), dedup: new Map() },
      quiz: { waiting: [], inFlight: new Map(), dedup: new Map() }
    };
    this.cancelledFlags = new Set();
  }

  /**
   * Returns current depth of a queue.
   *
   * @param {string} queueKey - 'main' | 'video' | 'quiz'
   * @returns {number}
   */
  size(queueKey = 'main') {
    const q = this._queues[queueKey];
    if (!q) return 0;
    return q.waiting.length + q.inFlight.size;
  }

  /**
   * Internal enqueue helper.
   */
  _add(queueKey, envelope, { jobId, delaySeconds } = {}) {
    const q = this._queues[queueKey] || this._queues.main;

    // Deduplication check
    if (jobId) {
      if (q.dedup.has(jobId)) {
        return q.dedup.get(jobId);
      }
    }

    const id = jobId || `mem-${++this.seq}-${Date.now()}`;
    if (jobId) {
      q.dedup.set(jobId, id);
    }

    const delayMs = (delaySeconds && delaySeconds > 0) ? Math.min(900, delaySeconds) * 1000 : 0;
    const visibleAt = Date.now() + delayMs;

    q.waiting.push({
      id,
      envelope,
      visibleAt,
      addedAt: Date.now()
    });

    return id;
  }

  /**
   * Internal receive helper.
   */
  _receive(queueKey, maxMessages = 1) {
    const q = this._queues[queueKey] || this._queues.main;
    const now = Date.now();
    const limit = Math.min(Math.max(maxMessages, 1), 10);
    const messages = [];

    // Filter and pull visible messages
    let i = 0;
    while (i < q.waiting.length && messages.length < limit) {
      const item = q.waiting[i];
      if (item.visibleAt <= now) {
        q.waiting.splice(i, 1);
        const token = crypto.randomUUID();
        const receiptHandle = `${queueKey}:${item.id}:${token}`;
        q.inFlight.set(receiptHandle, {
          item,
          token,
          deadline: now + 30000
        });

        messages.push({
          messageId: String(item.id),
          receiptHandle,
          body: item.envelope,
          attributes: {},
          receivedAt: new Date().toISOString()
        });
      } else {
        i++;
      }
    }

    return messages;
  }

  /**
   * Internal ack helper.
   */
  _ack(receiptHandle) {
    for (const key of Object.keys(this._queues)) {
      if (this._queues[key].inFlight.has(receiptHandle)) {
        this._queues[key].inFlight.delete(receiptHandle);
        return;
      }
    }
  }

  /**
   * Internal extend timeout helper.
   */
  _extend(receiptHandle, additionalSeconds) {
    for (const key of Object.keys(this._queues)) {
      const entry = this._queues[key].inFlight.get(receiptHandle);
      if (entry) {
        entry.deadline = Date.now() + Math.min(additionalSeconds, 43200) * 1000;
        return;
      }
    }
  }

  /**
   * Internal requeue helper.
   */
  _requeue(receiptHandle) {
    for (const key of Object.keys(this._queues)) {
      const entry = this._queues[key].inFlight.get(receiptHandle);
      if (entry) {
        this._queues[key].inFlight.delete(receiptHandle);
        entry.item.visibleAt = Date.now();
        this._queues[key].waiting.unshift(entry.item);
        return;
      }
    }
  }

  /**
   * Internal metrics helper.
   */
  _metrics(queueKey) {
    const q = this._queues[queueKey] || this._queues.main;
    const now = Date.now();
    const available = q.waiting.filter(m => m.visibleAt <= now).length;
    const delayed = q.waiting.filter(m => m.visibleAt > now).length;
    const inFlight = q.inFlight.size;

    return {
      messagesAvailable: available,
      messagesInFlight: inFlight,
      messagesDelayed: delayed,
      totalDepth: available + inFlight + delayed,
      timestamp: new Date().toISOString()
    };
  }

  // ── Producers ─────────────────────────────────────────────────────────────

  async queueCoachingJob(sessionId, jobType, payload = {}) {
    const correlationId = getCurrentCorrelationId();
    const envelope = {
      sessionId,
      jobType,
      payload,
      correlationId,
      queuedAt: new Date().toISOString(),
      version: '1.0'
    };
    const id = this._add('main', envelope, { jobId: `${sessionId}-${jobType}` });
    logToFile('📤 Coaching job queued (memory)', { sessionId, jobType, jobId: id });
    return id;
  }

  async queueVideoJob(videoRequestId, jobType, payload = {}) {
    const correlationId = getCurrentCorrelationId();
    const envelope = {
      videoRequestId,
      jobType,
      payload,
      correlationId,
      queuedAt: new Date().toISOString(),
      version: '1.0'
    };
    const id = this._add('video', envelope, { jobId: `${videoRequestId}-${jobType}` });
    logToFile('📤 Video job queued (memory)', { videoRequestId, jobType, jobId: id });
    return id;
  }

  async queueJob(groupId, jobType, payload = {}, opts = {}) {
    const isQuizJob = jobType && jobType.startsWith('quiz_');
    const queueKey = isQuizJob ? 'quiz' : 'main';
    const correlationId = getCurrentCorrelationId();
    const envelope = {
      groupId,
      jobType,
      payload,
      correlationId,
      queuedAt: new Date().toISOString(),
      version: '2.0'
    };
    const id = this._add(queueKey, envelope, {
      jobId: opts.deduplicationId,
      delaySeconds: opts.delaySeconds
    });
    logToFile('📤 Job queued (memory, v2 envelope)', {
      groupId,
      jobType,
      jobId: id,
      queue: queueKey,
      delaySeconds: opts.delaySeconds || 0
    });
    logEvent('queue.job.queued', { correlationId, jobType, requestId: groupId, messageId: id });
    return id;
  }

  // ── Consumers (Pull) ──────────────────────────────────────────────────────

  async receiveJobs(maxMessages = 1) {
    return this._receive('main', maxMessages);
  }

  async receiveVideoJobs(maxMessages = 1) {
    return this._receive('video', maxMessages);
  }

  async receiveQuizJobs(maxMessages = 1) {
    return this._receive('quiz', maxMessages);
  }

  // ── Consumers (Ack) ───────────────────────────────────────────────────────

  async completeJob(receiptHandle) {
    this._ack(receiptHandle);
  }

  async completeVideoJob(receiptHandle) {
    this._ack(receiptHandle);
  }

  async completeQuizJob(receiptHandle) {
    this._ack(receiptHandle);
  }

  // ── Consumers (Heartbeat / Visibility) ─────────────────────────────────────

  async extendJobTimeout(receiptHandle, additionalSeconds) {
    this._extend(receiptHandle, additionalSeconds);
  }

  async extendVideoJobTimeout(receiptHandle, additionalSeconds) {
    this._extend(receiptHandle, additionalSeconds);
  }

  async extendQuizJobTimeout(receiptHandle, additionalSeconds) {
    this._extend(receiptHandle, additionalSeconds);
  }

  // ── Retry / Metrics / Cancel ──────────────────────────────────────────────

  async requeueJob(receiptHandle) {
    this._requeue(receiptHandle);
  }

  async getQueueMetrics() {
    return this._metrics('main');
  }

  async getVideoQueueMetrics() {
    return this._metrics('video');
  }

  async cancelByGroupId(groupId, jobTypes = []) {
    for (const jobType of jobTypes) {
      const cancelKey = `sqs:cancel:${jobType}:${groupId}`;
      this.cancelledFlags.add(cancelKey);
    }
  }
}

const memoryQueueSingleton = new MemoryQueueService();
module.exports = memoryQueueSingleton;
module.exports.MemoryQueueService = MemoryQueueService;
