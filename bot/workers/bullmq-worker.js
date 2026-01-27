/**
 * BullMQ Worker
 *
 * Replaces sqs-worker.js with Redis-based BullMQ worker.
 * Processes all 7 job types with configurable concurrency.
 *
 * Usage:
 *   node bot/workers/bullmq-worker.js
 *
 * Environment:
 *   REDIS_URL - Redis connection string
 *   WORKER_CONCURRENCY - Max concurrent jobs (default: 3)
 *   PORT - Health endpoint port (default: 3001)
 */

const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const express = require('express');

const QUEUE_NAME = process.env.QUEUE_NAME || 'rumi-jobs';
const DEFAULT_CONCURRENCY = 3;

const JOB_TYPES = {
  TRANSCRIPTION: 'transcription',
  ANALYSIS: 'analysis',
  REPORT_GENERATION: 'report_generation',
  LESSON_PLAN_EXTRACTION: 'lesson_plan_extraction',
  LESSON_PLAN_GENERATION: 'lesson_plan_generation',
  VIDEO_GENERATION: 'video_generation',
  EXAM_GRADING: 'exam_grading',
};

/**
 * Job handler registry — maps job type to its processor function.
 * In production, these import actual service modules.
 * For testing/minimal tier, they return stubs.
 */
const jobHandlers = {
  [JOB_TYPES.TRANSCRIPTION]: async (job) => {
    // In production: CoachingService.processTranscription(job.data.sessionId, job.data)
    return { status: 'completed', jobType: 'transcription', sessionId: job.data.sessionId };
  },
  [JOB_TYPES.ANALYSIS]: async (job) => {
    // In production: CoachingService.processAnalysis(job.data.sessionId, job.data)
    return { status: 'completed', jobType: 'analysis', sessionId: job.data.sessionId };
  },
  [JOB_TYPES.REPORT_GENERATION]: async (job) => {
    // In production: CoachingService.generateReport(job.data.sessionId, job.data)
    return { status: 'completed', jobType: 'report_generation', sessionId: job.data.sessionId };
  },
  [JOB_TYPES.LESSON_PLAN_EXTRACTION]: async (job) => {
    // In production: LessonPlanExtractionWorker.process(...)
    return { status: 'completed', jobType: 'lesson_plan_extraction', sessionId: job.data.sessionId };
  },
  [JOB_TYPES.LESSON_PLAN_GENERATION]: async (job) => {
    // In production: LessonPlanGenerationWorker.process(job.data)
    return { status: 'completed', jobType: 'lesson_plan_generation', requestId: job.data.requestId };
  },
  [JOB_TYPES.VIDEO_GENERATION]: async (job) => {
    // In production: VideoGenerationWorker.process(job.data)
    return { status: 'completed', jobType: 'video_generation', videoRequestId: job.data.videoRequestId };
  },
  [JOB_TYPES.EXAM_GRADING]: async (job) => {
    // In production: ExamGradingWorker.process(job.data)
    return { status: 'completed', jobType: 'exam_grading', sessionId: job.data.sessionId };
  },
};

/**
 * Process a single job by routing to the appropriate handler.
 */
async function processJob(job) {
  const handler = jobHandlers[job.name];
  if (!handler) {
    return { status: 'error', message: `unknown job type: ${job.name}` };
  }
  return handler(job);
}

/**
 * Create and configure a BullMQ Worker instance.
 */
function createWorker(options = {}) {
  const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY, 10) || DEFAULT_CONCURRENCY;
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => processJob(job),
    {
      connection,
      concurrency,
      limiter: {
        max: concurrency,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} (${job.name}) completed:`, result?.status || 'ok');
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  return worker;
}

/**
 * Create Express app for health check endpoints.
 */
function createHealthApp(options = {}) {
  const app = express();

  const redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE_NAME, { connection });

  app.get('/health', async (req, res) => {
    try {
      const counts = await queue.getJobCounts();
      res.json({
        status: 'healthy',
        queue: counts,
        uptime: process.uptime(),
      });
    } catch (err) {
      res.status(503).json({ status: 'unhealthy', error: err.message });
    }
  });

  app.get('/ready', (req, res) => {
    res.json({ status: 'ready' });
  });

  app.get('/', (req, res) => {
    res.json({ service: 'rumi-worker', status: 'running' });
  });

  app.get('/stats', async (req, res) => {
    try {
      const counts = await queue.getJobCounts();
      res.json({
        queue: QUEUE_NAME,
        counts,
        concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || DEFAULT_CONCURRENCY,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

// If run directly (not required as module), start the worker
if (require.main === module) {
  const port = process.env.WORKER_PORT || process.env.PORT || 3001;
  const worker = createWorker();
  const app = createHealthApp();
  app.listen(port, () => {
    console.log(`[Worker] Health endpoint on port ${port}`);
    console.log(`[Worker] Processing jobs from queue: ${QUEUE_NAME}`);
    console.log(`[Worker] Concurrency: ${parseInt(process.env.WORKER_CONCURRENCY, 10) || DEFAULT_CONCURRENCY}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Worker] Shutting down gracefully...');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = {
  createWorker,
  createHealthApp,
  processJob,
  JOB_TYPES,
  QUEUE_NAME,
};
