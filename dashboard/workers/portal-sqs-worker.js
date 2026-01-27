/**
 * Portal SQS Worker
 *
 * Processes async jobs from the Portal-specific SQS queue:
 * - transcript_processing: GPT-4o-mini transcript refinement (30-45s)
 * - ama_processing: AMA SQL generation (5-15s)
 *
 * Separate from Main Bot's SQS worker to avoid interference.
 * Designed to run as standalone service or integrated into Portal.
 *
 * Bead: plt-sqs01, plt-sqs02
 */

const http = require('http');
const PortalSQSService = require('../services/queue/portal-sqs.service');

// Supabase client for persisting results
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Supported job types for routing
const SUPPORTED_JOB_TYPES = [
  'transcript_processing',
  'ama_processing'
];

// Worker state
let running = false;
let processedCount = 0;
let errorCount = 0;
let lastError = null;

/**
 * Process a transcript processing job
 *
 * @param {object} job - Job from SQS
 * @returns {Promise<object>} Processing result
 */
async function processTranscriptJob(job) {
  const { sessionId, payload } = job.body;

  console.log(JSON.stringify({
    event: 'portal.worker.transcript.started',
    sessionId,
    messageId: job.messageId,
    timestamp: new Date().toISOString()
  }));

  const startTime = Date.now();

  try {
    // Lazy load transcript processor to avoid circular dependencies
    const TranscriptProcessor = require('../services/transcript-processor.service');

    // Get raw transcript and session info from payload
    const { rawTranscript, sessionInfo } = payload;

    if (!rawTranscript) {
      throw new Error('Missing rawTranscript in payload');
    }

    // Process transcript using GPT-4o-mini
    const processedTranscript = await TranscriptProcessor.processTranscript(
      rawTranscript,
      sessionInfo || {}
    );

    const durationMs = Date.now() - startTime;

    console.log(JSON.stringify({
      event: 'portal.worker.transcript.completed',
      sessionId,
      durationMs,
      sectionsCount: processedTranscript.sections?.length || 0,
      timestamp: new Date().toISOString()
    }));

    // Persist to database (same format as main server)
    await persistTranscriptToDatabase(sessionId, processedTranscript, false);

    return {
      success: true,
      sessionId,
      processedTranscript,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    console.error(JSON.stringify({
      event: 'portal.worker.transcript.failed',
      sessionId,
      durationMs,
      error: error.message,
      timestamp: new Date().toISOString()
    }));

    // Use fallback parser
    try {
      const TranscriptProcessor = require('../services/transcript-processor.service');
      const { rawTranscript } = payload || {};
      const fallbackResult = TranscriptProcessor.fallbackParse(rawTranscript || '');

      // Persist fallback result to database
      await persistTranscriptToDatabase(sessionId, fallbackResult, true);

      return {
        success: true,
        sessionId,
        processedTranscript: fallbackResult,
        fallback: true,
        durationMs
      };
    } catch (fallbackError) {
      return {
        success: false,
        sessionId,
        error: error.message,
        durationMs
      };
    }
  }
}

/**
 * Persist processed transcript to database
 * Same format as main server (index.js lines 1693-1715)
 *
 * @param {string} sessionId - Coaching session ID
 * @param {object} processedData - Processed transcript data
 * @param {boolean} isFallback - Whether this is fallback data
 */
async function persistTranscriptToDatabase(sessionId, processedData, isFallback) {
  try {
    // First get existing analysis_data
    const { data: session, error: fetchError } = await supabase
      .from('coaching_sessions')
      .select('analysis_data')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      console.error(JSON.stringify({
        event: 'portal.worker.persist.fetch_error',
        sessionId,
        error: fetchError.message,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    const existingAnalysisData = session?.analysis_data || {};
    const updatedAnalysisData = {
      ...existingAnalysisData,
      processed_transcript: processedData,
      processed_transcript_fallback: isFallback,
      processed_at: new Date().toISOString(),
      processed_by: 'sqs_worker' // Track that SQS worker processed this
    };

    const { error: updateError } = await supabase
      .from('coaching_sessions')
      .update({ analysis_data: updatedAnalysisData })
      .eq('id', sessionId);

    if (updateError) {
      console.error(JSON.stringify({
        event: 'portal.worker.persist.update_error',
        sessionId,
        error: updateError.message,
        timestamp: new Date().toISOString()
      }));
    } else {
      console.log(JSON.stringify({
        event: 'portal.worker.persist.success',
        sessionId,
        isFallback,
        timestamp: new Date().toISOString()
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: 'portal.worker.persist.exception',
      sessionId,
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
}

/**
 * Process an AMA processing job
 *
 * @param {object} job - Job from SQS
 * @returns {Promise<object>} Processing result
 */
async function processAMAJob(job) {
  const { conversationId, payload } = job.body;

  console.log(JSON.stringify({
    event: 'portal.worker.ama.started',
    conversationId,
    messageId: job.messageId,
    timestamp: new Date().toISOString()
  }));

  const startTime = Date.now();

  try {
    // Lazy load AMA service to avoid circular dependencies
    const AMAService = require('../services/ama.service');

    const { question, userId, followUp } = payload;

    if (!question) {
      throw new Error('Missing question in payload');
    }

    // Process AMA query
    const result = await AMAService.processQuery(
      question,
      userId,
      conversationId,
      { isFollowUp: followUp }
    );

    const durationMs = Date.now() - startTime;

    console.log(JSON.stringify({
      event: 'portal.worker.ama.completed',
      conversationId,
      durationMs,
      hasSQL: !!result.sql,
      timestamp: new Date().toISOString()
    }));

    return {
      success: true,
      conversationId,
      result,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    console.error(JSON.stringify({
      event: 'portal.worker.ama.failed',
      conversationId,
      durationMs,
      error: error.message,
      timestamp: new Date().toISOString()
    }));

    return {
      success: false,
      conversationId,
      error: error.message,
      durationMs
    };
  }
}

/**
 * Route job to appropriate handler based on jobType
 *
 * @param {object} job - Job from SQS
 * @returns {Promise<object>} Processing result
 */
async function processJob(job) {
  const { jobType } = job.body;

  if (!SUPPORTED_JOB_TYPES.includes(jobType)) {
    return {
      success: false,
      error: `Unsupported job type: ${jobType}. Supported: ${SUPPORTED_JOB_TYPES.join(', ')}`
    };
  }

  switch (jobType) {
    case 'transcript_processing':
      return processTranscriptJob(job);

    case 'ama_processing':
      return processAMAJob(job);

    default:
      return {
        success: false,
        error: `Unknown job type: ${jobType}`
      };
  }
}

/**
 * Main worker loop
 * Continuously polls SQS for jobs and processes them
 */
async function workerLoop() {
  while (running) {
    try {
      // Check if service is configured
      if (!PortalSQSService.isConfigured()) {
        console.log('[Portal Worker] SQS not configured, waiting 30s...');
        await sleep(30000);
        continue;
      }

      // Receive jobs (long polling - waits up to 20s)
      const jobs = await PortalSQSService.receiveJobs(1);

      if (jobs.length === 0) {
        // No jobs, continue polling
        continue;
      }

      // Process each job
      for (const job of jobs) {
        try {
          const result = await processJob(job);

          if (result.success) {
            // Job completed successfully - delete from queue
            await PortalSQSService.completeJob(job.receiptHandle);
            processedCount++;
          } else {
            // Job failed - leave in queue for retry (visibility timeout will expire)
            console.error(JSON.stringify({
              event: 'portal.worker.job.error',
              messageId: job.messageId,
              error: result.error,
              timestamp: new Date().toISOString()
            }));
            errorCount++;
            lastError = result.error;
          }

        } catch (jobError) {
          console.error(JSON.stringify({
            event: 'portal.worker.job.exception',
            messageId: job.messageId,
            error: jobError.message,
            timestamp: new Date().toISOString()
          }));
          errorCount++;
          lastError = jobError.message;
        }
      }

    } catch (error) {
      console.error(JSON.stringify({
        event: 'portal.worker.loop.error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
      errorCount++;
      lastError = error.message;

      // Wait before retrying on error
      await sleep(5000);
    }
  }

  console.log(JSON.stringify({
    event: 'portal.worker.stopped',
    processedCount,
    errorCount,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Start the worker
 */
function start() {
  if (running) {
    console.log('[Portal Worker] Already running');
    return;
  }

  console.log(JSON.stringify({
    event: 'portal.worker.started',
    supportedJobTypes: SUPPORTED_JOB_TYPES,
    timestamp: new Date().toISOString()
  }));

  running = true;
  workerLoop().catch(err => {
    console.error('[Portal Worker] Fatal error:', err);
    running = false;
  });
}

/**
 * Stop the worker gracefully
 */
function stop() {
  console.log('[Portal Worker] Stopping...');
  running = false;
}

/**
 * Check if worker is running
 * @returns {boolean}
 */
function isRunning() {
  return running;
}

/**
 * Get worker statistics
 * @returns {object}
 */
function getStats() {
  return {
    running,
    processedCount,
    errorCount,
    lastError,
    uptime: running ? process.uptime() : 0,
    timestamp: new Date().toISOString()
  };
}

/**
 * Helper: Sleep for ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing and external control
module.exports = {
  start,
  stop,
  isRunning,
  getStats,
  processJob,
  processTranscriptJob,
  processAMAJob,
  SUPPORTED_JOB_TYPES
};

// If run directly, start the worker
if (require.main === module) {
  console.log('[Portal SQS Worker] Starting as standalone service...');

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Portal Worker] Received SIGTERM, shutting down...');
    stop();
    if (healthServer) healthServer.close();
  });

  process.on('SIGINT', () => {
    console.log('[Portal Worker] Received SIGINT, shutting down...');
    stop();
    if (healthServer) healthServer.close();
  });

  // Start minimal HTTP health server for Railway healthchecks
  const PORT = process.env.PORT || 3000;
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const stats = getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'portal-sqs-worker',
        ...stats
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  healthServer.listen(PORT, () => {
    console.log(`[Portal SQS Worker] Health server listening on port ${PORT}`);
  });

  start();
}
