/**
 * AWS SQS Coaching Worker
 * Replaces PostgreSQL queue with AWS SQS for better scalability
 * Updated: Dec 24, 2025 - Added video_generation job type
 *
 * Features:
 * - AWS SQS long polling (efficient message retrieval)
 * - Concurrent job processing (3 jobs per worker)
 * - Automatic retry with DLQ (dead letter queue)
 * - Graceful shutdown handling
 * - Health check endpoint
 * - Monitoring and metrics
 *
 * Job Types Processed:
 * 1. transcription - Audio transcription via Soniox (30-60s)
 * 2. analysis - Pedagogical analysis via GPT-5 mini (20-40s)
 * 3. report_generation - Report + voice generation via Gamma/ElevenLabs (60-120s)
 * 4. lesson_plan_generation - Lesson plan/presentation via Gamma (60-180s)
 * 5. lesson_plan_extraction - Extract text from uploaded lesson plans
 * 6. video_generation - Educational video via Kie.ai + FFmpeg (10-12 min)
 * 7. exam_grading - Exam checking with OCR + GPT grading (5-10 min)
 *
 * Advantages over PostgreSQL queue:
 * - No database polling (reduces DB load by 90%)
 * - Better horizontal scaling (add more workers)
 * - Built-in retry and DLQ
 * - 5x lower latency (100ms vs 500ms)
 * - Fully managed service
 */

// Structured logging - must be first to capture all console.log calls
const { runWithCorrelation, generateCorrelationId } = require('../shared/utils/structured-logger');

require('dotenv').config();
const supabase = require('../shared/config/supabase');
const { logToFile } = require('../shared/utils/logger');
const SQSQueueService = require('../shared/services/queue/sqs-queue.service');
const CoachingService = require('../shared/services/coaching-orchestrator.service');
const LessonPlanExtractionWorker = require('./lesson-plan-extraction.worker');
const LessonPlanGenerationWorker = require('./lesson-plan-generation.worker');
const VideoGenerationWorker = require('./video-generation.worker');
const ExamGradingWorker = require('./exam-grading.worker');
const os = require('os');

// Configuration
// Issue #43 Phase 2: Include RAILWAY_REPLICA_ID for parallel worker identification
const REPLICA_ID = process.env.RAILWAY_REPLICA_ID || 'local';
const WORKER_ID = `sqs-worker-${os.hostname()}-${process.pid}-${REPLICA_ID}`;
const CONCURRENCY_PER_WORKER = parseInt(process.env.SQS_WORKER_CONCURRENCY || '3');
const POLL_INTERVAL_MS = parseInt(process.env.SQS_POLL_INTERVAL || '100'); // Short poll between batches
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000');

/**
 * SQS Coaching Worker Class
 * Processes coaching jobs from AWS SQS queue
 */
class SQSCoachingWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.activeJobs = new Map(); // Map of receiptHandle -> Promise
    this.isShuttingDown = false;
    this.isRunning = false;
    this.stats = {
      jobsProcessed: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      messagesDeleted: 0,
      messagesRequeued: 0,
      startTime: new Date(),
      lastJobTime: null
    };
  }

  /**
   * Start the worker main loop
   */
  async start() {
    logToFile(`🚀 SQS Coaching Worker ${this.workerId} starting`, {
      concurrency: CONCURRENCY_PER_WORKER,
      pollInterval: POLL_INTERVAL_MS,
      pid: process.pid,
      hostname: os.hostname(),
      replicaId: REPLICA_ID  // Issue #43 Phase 2: Track parallel worker replicas
    });

    this.isRunning = true;

    // Main processing loop
    while (!this.isShuttingDown) {
      try {
        // Only fetch new jobs if we have capacity
        const availableSlots = CONCURRENCY_PER_WORKER - this.activeJobs.size;

        if (availableSlots > 0) {
          await this.processNextBatch(availableSlots);
        } else {
          logToFile('Worker at max capacity, waiting...', {
            workerId: this.workerId,
            activeJobs: this.activeJobs.size,
            maxConcurrency: CONCURRENCY_PER_WORKER
          });
        }

        // Small delay between batches
        await this.sleep(POLL_INTERVAL_MS);

      } catch (error) {
        logToFile('❌ Error in worker main loop', {
          workerId: this.workerId,
          error: error.message,
          stack: error.stack
        });

        // Don't backoff here - SQS long polling handles this
        await this.sleep(1000);
      }
    }

    // Wait for active jobs to complete during shutdown
    await this.waitForActiveJobs();

    logToFile(`✅ SQS Worker ${this.workerId} stopped gracefully`, {
      stats: this.stats
    });

    this.isRunning = false;
  }

  /**
   * Process a batch of jobs from SQS
   * Uses long polling for efficiency
   * Polls both main queue and dedicated video queue (if configured)
   */
  async processNextBatch(maxMessages) {
    try {
      // Poll main + (optional) video + (optional) quiz queues in parallel.
      const hasVideoQueue = !!process.env.SQS_VIDEO_QUEUE_URL;
      const hasQuizQueue = !!process.env.SQS_QUIZ_QUEUE_URL;

      // Reserve 1 slot for each dedicated queue that's configured.
      const dedicated = (hasVideoQueue ? 1 : 0) + (hasQuizQueue ? 1 : 0);
      const mainQueueSlots = dedicated ? Math.max(1, maxMessages - dedicated) : maxMessages;

      // Poll queues in parallel
      const pollPromises = [
        SQSQueueService.receiveJobs(mainQueueSlots)
      ];
      if (hasVideoQueue) pollPromises.push(SQSQueueService.receiveVideoJobs(1));
      if (hasQuizQueue) pollPromises.push(SQSQueueService.receiveQuizJobs(1));

      const results = await Promise.all(pollPromises);
      const mainJobs = results[0] || [];
      let idx = 1;
      const videoJobs = hasVideoQueue ? (results[idx++] || []) : [];
      const quizJobs = hasQuizQueue ? (results[idx++] || []) : [];

      // Mark jobs with their source queue for proper completion
      mainJobs.forEach(job => { job.sourceQueue = 'main'; });
      videoJobs.forEach(job => { job.sourceQueue = 'video'; });
      quizJobs.forEach(job => { job.sourceQueue = 'quiz'; });

      const allJobs = [...mainJobs, ...videoJobs, ...quizJobs];

      if (allJobs.length === 0) {
        // No jobs available (normal - SQS long polling will wait)
        return;
      }

      logToFile('📥 Received batch from SQS', {
        workerId: this.workerId,
        batchSize: allJobs.length,
        mainQueueJobs: mainJobs.length,
        videoQueueJobs: videoJobs.length,
        jobTypes: allJobs.map(j => j.body.jobType),
        usingDedicatedVideoQueue: hasVideoQueue
      });

      // Process each job concurrently
      for (const job of allJobs) {
        this.processJob(job);
      }

    } catch (error) {
      logToFile('❌ Error processing batch', {
        workerId: this.workerId,
        error: error.message
      });
    }
  }

  /**
   * Process a single job
   * Non-blocking - runs in background
   */
  processJob(job) {
    const { receiptHandle, body, sourceQueue } = job;
    const { sessionId, jobType, payload, correlationId: incomingCorrelationId } = body;

    // Use correlation ID from message or generate new one
    const correlationId = incomingCorrelationId || generateCorrelationId();

    logToFile('📋 Job claimed from SQS', {
      workerId: this.workerId,
      replicaId: REPLICA_ID,
      messageId: job.messageId,
      sessionId,
      jobType,
      correlationId,
      sourceQueue: sourceQueue || 'main'
    });

    // Create job promise wrapped with correlation context
    // All logs within the job will automatically include correlationId
    const jobPromise = runWithCorrelation(correlationId, async () => {
      return this.executeJob(sessionId, jobType, payload, receiptHandle, sourceQueue, body)
        .then(async () => {
          // Job succeeded - delete from queue using correct completion method
          if (sourceQueue === 'video') {
            await SQSQueueService.completeVideoJob(receiptHandle);
          } else if (sourceQueue === 'quiz') {
            await SQSQueueService.completeQuizJob(receiptHandle);
          } else {
            await SQSQueueService.completeJob(receiptHandle);
          }
          this.stats.jobsSucceeded++;
          this.stats.messagesDeleted++;

          logToFile('✅ Job completed and removed from queue', {
            workerId: this.workerId,
            replicaId: REPLICA_ID,
            sessionId,
            jobType,
            sourceQueue: sourceQueue || 'main'
          });
        })
        .catch(async (error) => {
          // Job failed
          await this.handleJobFailure(job, error);
          this.stats.jobsFailed++;

          logToFile('❌ Job failed', {
            workerId: this.workerId,
            replicaId: REPLICA_ID,
            sessionId,
            jobType,
            error: error.message
          });
        })
        .finally(() => {
          // Remove from active jobs
          this.activeJobs.delete(receiptHandle);
          this.stats.lastJobTime = new Date();
        });
    });

    // Add to active jobs
    this.activeJobs.set(receiptHandle, jobPromise);
    this.stats.jobsProcessed++;
  }

  /**
   * Execute a job based on its type
   * @param {string} sessionId - Session or request ID
   * @param {string} jobType - Type of job
   * @param {object} payload - Job payload
   * @param {string} receiptHandle - SQS receipt handle
   * @param {string} sourceQueue - Source queue ('main' or 'video')
   */
  async executeJob(sessionId, jobType, payload, receiptHandle, sourceQueue = 'main', body = null) {
    logToFile(`🔄 Executing ${jobType} job`, {
      workerId: this.workerId,
      sessionId,
      jobType,
      sourceQueue
    });

    switch (jobType) {
      case 'transcription':
        // Check if we need more time (transcription can be long)
        // Extend timeout to 20 minutes if audio is > 10 minutes
        if (payload.duration && payload.duration > 600) {
          await SQSQueueService.extendJobTimeout(receiptHandle, 1200); // 20 min
        }
        await CoachingService.processTranscription(sessionId, payload);
        break;

      case 'analysis':
        await CoachingService.processAnalysis(sessionId, payload);
        break;

      case 'lesson_plan_extraction':
        await LessonPlanExtractionWorker.process({
          coachingSessionId: sessionId,
          ...payload
        });
        break;

      case 'lesson_plan_generation':
        // Lesson plan generation via Gamma API (can take 1-3 minutes)
        await SQSQueueService.extendJobTimeout(receiptHandle, 600); // 10 min
        await LessonPlanGenerationWorker.process(payload);
        break;

      case 'report_generation':
        // Report generation can be slow (Gamma API + voice generation)
        // This step includes: enhancing analysis, generating PDF/Gamma report,
        // creating voice debrief, and sending all results to user
        await SQSQueueService.extendJobTimeout(receiptHandle, 1200); // 20 min
        await CoachingService.generateReport(sessionId, payload);
        break;

      case 'video_generation':
        // Video generation takes 10-12 minutes
        // Pipeline: Script → TTS → Images → Videos → Assembly
        // Use correct queue for timeout extension
        if (sourceQueue === 'video') {
          await SQSQueueService.extendVideoJobTimeout(receiptHandle, 900); // 15 min
        } else {
          await SQSQueueService.extendJobTimeout(receiptHandle, 900); // 15 min
        }
        await VideoGenerationWorker.process(payload);
        break;

      case 'exam_grading':
        // Exam grading with OCR + GPT (can take 5-10 minutes)
        await SQSQueueService.extendJobTimeout(receiptHandle, 720); // 12 min
        await ExamGradingWorker.process(payload);
        break;

      case 'pic_lp_kieai_generation': {
        // Pic-to-LP via Kie.ai. English ~80s typical; Urdu/Sindhi/Punjabi
        // ~4 min typical, up to 7 min at peak. 12-min extension covers both.
        await SQSQueueService.extendJobTimeout(receiptHandle, 720); // 12 min
        const PicLpKieaiWorker = require('./pic-lp-kieai.worker');
        await PicLpKieaiWorker.process(payload);
        break;
      }

      // Quiz jobs (v2 envelope with body.groupId). Producers enqueue via
      // SQSQueueService.queueJob(); each handler in quiz-job-handler does a
      // cancel-flag check, an optional cascade re-queue (quiz_report/quiz_expire),
      // then the work. Returns { ok } or { skipped } — either way we ack.
      case 'quiz_report': {
        // PDF render + R2 upload + WhatsApp send (up to ~10 min worst case).
        if (sourceQueue === 'quiz') {
          await SQSQueueService.extendQuizJobTimeout(receiptHandle, 600);
        } else {
          await SQSQueueService.extendJobTimeout(receiptHandle, 600);
        }
        const QuizJobHandler = require('./quiz-job-handler');
        await QuizJobHandler.handleQuizReport(this._buildQuizBody(body));
        break;
      }
      case 'quiz_expire': {
        const QuizJobHandler = require('./quiz-job-handler');
        await QuizJobHandler.handleQuizExpire(this._buildQuizBody(body));
        break;
      }
      case 'quiz_nudge': {
        const QuizJobHandler = require('./quiz-job-handler');
        await QuizJobHandler.handleQuizNudge(this._buildQuizBody(body));
        break;
      }
      case 'quiz_reminder': {
        const QuizJobHandler = require('./quiz-job-handler');
        await QuizJobHandler.handleQuizReminder(this._buildQuizBody(body));
        break;
      }

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }

  /**
   * Build the body shape quiz-job-handler expects from either envelope.
   * v2.0 messages have body.groupId; v1.0 (legacy coaching/video) have
   * sessionId / videoRequestId. Aliasing here lets quiz job-types ride the
   * same worker without touching existing producers.
   */
  _buildQuizBody(body) {
    const b = body || {};
    return {
      groupId: b.groupId || b.sessionId || b.videoRequestId,
      payload: b.payload || {}
    };
  }

  /**
   * Handle job failure
   * SQS will automatically retry up to 3 times, then move to DLQ
   */
  async handleJobFailure(job, error) {
    const { receiptHandle, body } = job;
    const { sessionId, jobType } = body;

    try {
      logToFile('Handling job failure', {
        workerId: this.workerId,
        messageId: job.messageId,
        sessionId,
        jobType,
        error: error.message
      });

      // Skip DB update for lesson_plan_generation - it handles its own error state
      if (jobType === 'lesson_plan_generation') {
        logToFile('Lesson plan generation failure handled by worker', { sessionId });
        return;
      }

      // Update coaching session with error
      const { error: updateError } = await supabase
        .from('coaching_sessions')
        .update({
          status: 'failed',
          error_message: error.message,
          error_stack: error.stack,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (updateError) {
        logToFile('Warning: Could not update session status', {
          sessionId,
          error: updateError.message
        });
      }

      // SQS will automatically retry the message (up to 3 times)
      // After 3 failures, it goes to DLQ
      // We can manually requeue for immediate retry if desired:

      // Option 1: Let SQS handle retry (recommended)
      // Do nothing - message visibility timeout will expire and it will be retried

      // Option 2: Manual requeue for immediate retry (not recommended)
      // await SQSQueueService.requeueJob(receiptHandle);
      // this.stats.messagesRequeued++;

      // For now, we let SQS handle it (Option 1)

    } catch (err) {
      logToFile('❌ Exception in handleJobFailure', {
        workerId: this.workerId,
        sessionId,
        error: err.message
      });
    }
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown() {
    logToFile(`🛑 Graceful shutdown initiated for worker ${this.workerId}`, {
      activeJobs: this.activeJobs.size
    });

    this.isShuttingDown = true;

    // Wait for active jobs to complete (with timeout)
    const shutdownPromise = this.waitForActiveJobs();
    const timeoutPromise = this.sleep(GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    await Promise.race([shutdownPromise, timeoutPromise]);

    if (this.activeJobs.size > 0) {
      logToFile(`⚠️ Shutdown timeout reached with ${this.activeJobs.size} jobs still active`, {
        workerId: this.workerId
      });
      // Note: Uncompleted jobs will become visible again in SQS after visibility timeout
    }
  }

  /**
   * Wait for all active jobs to complete
   */
  async waitForActiveJobs() {
    if (this.activeJobs.size === 0) {
      return;
    }

    logToFile(`⏳ Waiting for ${this.activeJobs.size} active jobs to complete...`, {
      workerId: this.workerId
    });

    await Promise.allSettled(Array.from(this.activeJobs.values()));

    logToFile('✅ All active jobs completed', {
      workerId: this.workerId
    });
  }

  /**
   * Get worker statistics
   */
  getStats() {
    const uptime = new Date() - this.stats.startTime;
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      isShuttingDown: this.isShuttingDown,
      activeJobs: this.activeJobs.size,
      maxConcurrency: CONCURRENCY_PER_WORKER,
      totalJobsProcessed: this.stats.jobsProcessed,
      jobsSucceeded: this.stats.jobsSucceeded,
      jobsFailed: this.stats.jobsFailed,
      messagesDeleted: this.stats.messagesDeleted,
      messagesRequeued: this.stats.messagesRequeued,
      successRate: this.stats.jobsProcessed > 0
        ? ((this.stats.jobsSucceeded / this.stats.jobsProcessed) * 100).toFixed(2) + '%'
        : 'N/A',
      uptimeSeconds: Math.round(uptime / 1000),
      lastJobTime: this.stats.lastJobTime,
      startTime: this.stats.startTime
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

// Create worker instance
const worker = new SQSCoachingWorker(WORKER_ID);

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logToFile('Received SIGTERM signal');
  await worker.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logToFile('Received SIGINT signal');
  await worker.shutdown();
  process.exit(0);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logToFile('❌ UNCAUGHT EXCEPTION', {
    error: error.message,
    stack: error.stack
  });
  worker.shutdown().then(() => {
    process.exit(1);
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logToFile('❌ UNHANDLED REJECTION', {
    reason: reason,
    promise: promise
  });
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

const express = require('express');
const app = express();
const HEALTH_PORT = process.env.SQS_WORKER_HEALTH_PORT || 3200;

app.get('/health', async (req, res) => {
  const stats = worker.getStats();

  // Worker is healthy if it's running and not stuck
  const isHealthy = worker.isRunning && !worker.isShuttingDown;

  // Check if worker is stuck (no job processed in last 15 minutes)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const isStuck = stats.lastJobTime && stats.lastJobTime < fifteenMinutesAgo;

  // Get queue metrics
  let queueMetrics = null;
  try {
    queueMetrics = await SQSQueueService.getQueueMetrics();
  } catch (error) {
    logToFile('Warning: Could not get queue metrics', { error: error.message });
  }

  res.status(isHealthy && !isStuck ? 200 : 503).json({
    status: isHealthy && !isStuck ? 'healthy' : 'unhealthy',
    worker: stats,
    queue: queueMetrics,
    isStuck: isStuck,
    timestamp: new Date().toISOString()
  });
});

app.get('/stats', (req, res) => {
  res.json(worker.getStats());
});

app.get('/queue-metrics', async (req, res) => {
  try {
    const metrics = await SQSQueueService.getQueueMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root path for Railway healthcheck (railway.json uses healthcheckPath: "/")
app.get('/', (req, res) => {
  const isHealthy = worker.isRunning && !worker.isShuttingDown;
  res.status(isHealthy ? 200 : 503).json({ status: isHealthy ? 'ok' : 'unhealthy' });
});

// Readiness probe (for Railway/Kubernetes)
app.get('/ready', (req, res) => {
  const isReady = worker.isRunning && !worker.isShuttingDown;
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    timestamp: new Date().toISOString()
  });
});

app.listen(HEALTH_PORT, () => {
  logToFile(`Health check endpoint listening on port ${HEALTH_PORT}`, {
    workerId: WORKER_ID
  });
});

// ============================================================================
// LESSON PLAN RECOVERY
// ============================================================================

const LessonPlanQueueService = require('../shared/services/lesson-plan-queue.service');
const WhatsAppService = require('../shared/services/whatsapp.service');

/**
 * Recover stale lesson plan requests
 * Re-queues requests that were stuck in 'processing' state
 * Called on startup AND periodically to catch jobs stuck after deployment
 */
async function recoverStaleLessonPlanRequests() {
  try {
    logToFile('Checking for stale lesson plan requests...');

    // Get requests stuck in processing for > 5 minutes (reduced from 10 to catch deployment issues faster)
    const staleRequests = await LessonPlanQueueService.getStaleRequests(5);

    if (staleRequests.length === 0) {
      logToFile('No stale lesson plan requests found');
      return;
    }

    logToFile(`Found ${staleRequests.length} stale lesson plan requests`, {
      requestIds: staleRequests.map(r => r.id)
    });

    for (const request of staleRequests) {
      // Re-check status to avoid race conditions with worker
      const currentRequest = await LessonPlanQueueService.getRequest(request.id);
      if (!currentRequest || currentRequest.status !== 'processing') {
        logToFile('Stale request no longer processing, skipping', {
          requestId: request.id,
          currentStatus: currentRequest?.status
        });
        continue;
      }

      if (request.retry_count >= 3) {
        // Max retries exceeded - send apology and mark failed
        logToFile('Stale request exceeded max retries, sending apology', {
          requestId: request.id,
          retryCount: request.retry_count
        });

        // Mark as failed FIRST to prevent race conditions
        await LessonPlanQueueService.markFailed(request.id, 'Exceeded max retries during recovery');

        try {
          const apologyMessages = {
            en: "I'm sorry, there was a problem creating your lesson plan. Please try again by sending your request one more time.",
            ur: "معذرت، آپ کا لیسن پلان بنانے میں مسئلہ ہوا۔ براہ کرم اپنی درخواست دوبارہ بھیج کر کوشش کریں۔",
            ar: "عذراً، حدثت مشكلة في إنشاء خطة درسك. يرجى المحاولة مرة أخرى بإرسال طلبك مرة أخرى.",
            es: "Lo siento, hubo un problema al crear tu plan de lección. Por favor intenta de nuevo enviando tu solicitud una vez más."
          };
          await WhatsAppService.sendMessage(
            request.phone_number,
            apologyMessages[request.language] || apologyMessages.en
          );
        } catch (msgError) {
          logToFile('Failed to send apology for stale request', { error: msgError.message });
        }
      } else {
        // Re-queue for processing
        await LessonPlanQueueService.requeueRequest(request);
        logToFile('Stale request re-queued', { requestId: request.id });
      }
    }

    logToFile(`Recovered ${staleRequests.length} stale lesson plan requests`);
  } catch (error) {
    logToFile('Error recovering stale lesson plan requests', {
      error: error.message,
      stack: error.stack
    });
  }
}

// ============================================================================
// VIDEO GENERATION RECOVERY (Issue #38)
// ============================================================================

/**
 * Recover stale video generation requests
 * Re-queues requests that were stuck in 'processing' state due to deployment
 * Issue #38: Video jobs lost during Railway deployments
 * Called on startup AND periodically to catch jobs stuck after deployment
 */
async function recoverStaleVideoRequests() {
  const MAX_RETRIES = 3;
  const STALE_THRESHOLD_MINUTES = 12; // Video gen takes ~10 min, so 12 min = definitely stale (reduced from 15)

  try {
    logToFile('Checking for stale video requests...');

    // Get video requests stuck in processing for > 12 minutes
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    const { data: staleRequests, error } = await supabase
      .from('video_requests')
      .select('id, user_id, topic, language, customization, style, retry_count, session_id')
      .eq('status', 'processing')
      .lt('started_at', staleThreshold);

    if (error) {
      logToFile('Error querying stale video requests', { error: error.message });
      return;
    }

    if (!staleRequests || staleRequests.length === 0) {
      logToFile('No stale video requests found');
      return;
    }

    logToFile(`Found ${staleRequests.length} stale video requests`, {
      requestIds: staleRequests.map(r => r.id)
    });

    for (const request of staleRequests) {
      const currentRetryCount = request.retry_count || 0;

      if (currentRetryCount >= MAX_RETRIES) {
        // Max retries exceeded - send apology and mark failed
        logToFile('Stale video request exceeded max retries, sending apology', {
          requestId: request.id,
          retryCount: currentRetryCount
        });

        try {
          // Get user's phone number
          const { data: user } = await supabase
            .from('users')
            .select('phone_number')
            .eq('id', request.user_id)
            .single();

          if (user?.phone_number) {
            const apologyMessages = {
              en: "I'm sorry, there was a problem creating your video about \"" + request.topic + "\". Please try again by sending /video.",
              ur: "معذرت، آپ کی ویڈیو \"" + request.topic + "\" بنانے میں مسئلہ ہوا۔ براہ کرم /video بھیج کر دوبارہ کوشش کریں۔",
              ar: "عذراً، حدثت مشكلة في إنشاء الفيديو عن \"" + request.topic + "\". يرجى المحاولة مرة أخرى بإرسال /video.",
              es: "Lo siento, hubo un problema al crear tu video sobre \"" + request.topic + "\". Por favor intenta de nuevo enviando /video."
            };
            await WhatsAppService.sendMessage(
              user.phone_number,
              apologyMessages[request.language] || apologyMessages.en
            );
          }
        } catch (msgError) {
          logToFile('Failed to send apology for stale video request', { error: msgError.message });
        }

        // Mark as failed
        await supabase
          .from('video_requests')
          .update({
            status: 'failed',
            error_message: 'Exceeded max retries after deployment interruption',
            completed_at: new Date().toISOString()
          })
          .eq('id', request.id);

      } else {
        // Reset to pending and re-queue
        logToFile('Re-queuing stale video request', {
          requestId: request.id,
          topic: request.topic,
          previousRetryCount: currentRetryCount
        });

        // Update status to pending and increment retry count
        await supabase
          .from('video_requests')
          .update({
            status: 'pending',
            retry_count: currentRetryCount + 1,
            started_at: null  // Reset started_at so it doesn't look stale immediately
          })
          .eq('id', request.id);

        // Re-queue to dedicated video queue (or main queue if not configured)
        try {
          await SQSQueueService.queueVideoJob(
            request.id,
            'video_generation',
            {
              videoRequestId: request.id,
              userId: request.user_id,
              topic: request.topic,
              language: request.language,
              customization: request.customization,
              style: request.style
            }
          );

          logToFile('Stale video request re-queued to video queue', {
            requestId: request.id,
            usingDedicatedQueue: !!process.env.SQS_VIDEO_QUEUE_URL
          });
        } catch (sqsError) {
          logToFile('Failed to re-queue video request to SQS', {
            requestId: request.id,
            error: sqsError.message
          });
        }
      }
    }

    logToFile(`Recovered ${staleRequests.length} stale video requests`);
  } catch (error) {
    logToFile('Error recovering stale video requests', {
      error: error.message,
      stack: error.stack
    });
  }
}

// ============================================================================
// START WORKER
// ============================================================================

logToFile('🚀 Starting SQS Coaching Worker', {
  workerId: WORKER_ID,
  nodeVersion: process.version,
  platform: process.platform,
  concurrency: CONCURRENCY_PER_WORKER,
  pollInterval: POLL_INTERVAL_MS,
  environment: process.env.NODE_ENV || 'development',
  sqsQueueUrl: process.env.SQS_QUEUE_URL
});

// Recover stale requests before starting worker
// Issue #38: Added video request recovery alongside lesson plan recovery
// bd-092: Added exam grading recovery
Promise.all([
  recoverStaleLessonPlanRequests(),
  recoverStaleVideoRequests(),
  ExamGradingWorker.recoverStaleExamSessions()
]).then(() => {
  worker.start().catch((error) => {
    logToFile('❌ Fatal error in worker', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  // Periodic stale job recovery - runs every 5 minutes
  // Catches jobs that got stuck after deployment (not caught by startup check)
  const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(async () => {
    if (worker.isShuttingDown) return;
    try {
      await recoverStaleLessonPlanRequests();
      await recoverStaleVideoRequests();
      await ExamGradingWorker.recoverStaleExamSessions();
    } catch (error) {
      logToFile('Error in periodic stale check', { error: error.message });
    }
  }, STALE_CHECK_INTERVAL_MS);

  logToFile('Periodic stale job recovery enabled (every 5 minutes)');
});

// Export for testing
module.exports = { SQSCoachingWorker, WORKER_ID };
