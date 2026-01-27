/**
 * Classroom Coaching Background Worker
 * Bulletproof worker architecture for 1000+ concurrent users
 *
 * Features:
 * - PostgreSQL SELECT FOR UPDATE SKIP LOCKED for distributed locking
 * - Concurrency control (3 jobs per worker)
 * - Exponential backoff retry logic
 * - Graceful shutdown handling
 * - Health check endpoint
 * - Monitoring and alerting
 */

// Structured logging - must be first to capture all console.log calls
require('../shared/utils/structured-logger');

require('dotenv').config();
const supabase = require('../shared/config/supabase');
const { logToFile } = require('../shared/utils/logger');
const CoachingService = require('../shared/services/coaching.service');
const os = require('os');

// Configuration
const WORKER_ID = `worker-${os.hostname()}-${process.pid}`;
const CONCURRENCY_PER_WORKER = parseInt(process.env.COACHING_WORKER_CONCURRENCY || '3');
const POLL_INTERVAL_MS = parseInt(process.env.COACHING_POLL_INTERVAL || '1000'); // 1 second
const ERROR_BACKOFF_MS = parseInt(process.env.COACHING_ERROR_BACKOFF || '5000'); // 5 seconds
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000'); // 30 seconds

/**
 * Coaching Worker Class
 * Handles distributed job processing with concurrency control
 */
class CoachingWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.activeJobs = new Map(); // Map of jobId -> Promise
    this.isShuttingDown = false;
    this.isRunning = false;
    this.stats = {
      jobsProcessed: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      startTime: new Date(),
      lastJobTime: null
    };
  }

  /**
   * Start the worker main loop
   */
  async start() {
    logToFile(`🚀 Coaching Worker ${this.workerId} starting`, {
      concurrency: CONCURRENCY_PER_WORKER,
      pollInterval: POLL_INTERVAL_MS,
      pid: process.pid,
      hostname: os.hostname()
    });

    this.isRunning = true;

    // Main processing loop
    while (!this.isShuttingDown) {
      try {
        // Only fetch new jobs if we have capacity
        if (this.activeJobs.size < CONCURRENCY_PER_WORKER) {
          await this.processNextJob();
        } else {
          logToFile('Worker at max capacity, waiting...', {
            workerId: this.workerId,
            activeJobs: this.activeJobs.size,
            maxConcurrency: CONCURRENCY_PER_WORKER
          });
        }

        // Small delay to prevent CPU thrashing
        await this.sleep(POLL_INTERVAL_MS);
      } catch (error) {
        logToFile('❌ Error in worker main loop', {
          workerId: this.workerId,
          error: error.message,
          stack: error.stack
        });

        // Back off on error to prevent rapid failures
        await this.sleep(ERROR_BACKOFF_MS);
      }
    }

    // Wait for active jobs to complete during shutdown
    await this.waitForActiveJobs();

    logToFile(`✅ Coaching Worker ${this.workerId} stopped gracefully`, {
      stats: this.stats
    });

    this.isRunning = false;
  }

  /**
   * Process next job from queue
   */
  async processNextJob() {
    try {
      // Claim next job using PostgreSQL distributed locking
      const job = await this.claimNextJob();

      if (!job) {
        // No jobs available
        return;
      }

      logToFile('📋 Job claimed', {
        workerId: this.workerId,
        jobId: job.id,
        jobType: job.job_type,
        coachingSessionId: job.coaching_session_id,
        attempt: job.attempts
      });

      // Add to active jobs
      const jobPromise = this.executeJob(job)
        .then(async () => {
          await this.markJobCompleted(job.id);
          this.stats.jobsSucceeded++;
          logToFile('✅ Job completed', {
            workerId: this.workerId,
            jobId: job.id,
            jobType: job.job_type
          });
        })
        .catch(async (error) => {
          await this.handleJobFailure(job, error);
          this.stats.jobsFailed++;
          logToFile('❌ Job failed', {
            workerId: this.workerId,
            jobId: job.id,
            jobType: job.job_type,
            error: error.message
          });
        })
        .finally(() => {
          // Remove from active jobs
          this.activeJobs.delete(job.id);
          this.stats.lastJobTime = new Date();
        });

      this.activeJobs.set(job.id, jobPromise);
      this.stats.jobsProcessed++;
    } catch (error) {
      logToFile('❌ Error processing next job', {
        workerId: this.workerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Claim next job from queue using PostgreSQL distributed locking
   * Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions
   */
  async claimNextJob() {
    try {
      const { data, error } = await supabase.rpc('claim_next_coaching_job', {
        p_worker_id: this.workerId,
        p_max_attempts: 3
      });

      if (error) {
        logToFile('Error claiming job', {
          workerId: this.workerId,
          error: error.message
        });
        return null;
      }

      // RPC returns array, get first item
      if (data && data.length > 0) {
        return data[0];
      }

      return null;
    } catch (error) {
      logToFile('❌ Error in claimNextJob', {
        workerId: this.workerId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Execute a job based on its type
   */
  async executeJob(job) {
    const { job_type, coaching_session_id, payload } = job;

    logToFile(`🔄 Executing ${job_type} job`, {
      workerId: this.workerId,
      jobId: job.id,
      coachingSessionId: coaching_session_id
    });

    // Add attempt number to payload to avoid duplicate progress messages on retry
    const enrichedPayload = { ...(payload || {}), attempt: job.attempts };

    switch (job_type) {
      case 'transcription':
        await CoachingService.processTranscription(coaching_session_id, enrichedPayload);
        break;

      case 'analysis':
        await CoachingService.processAnalysis(coaching_session_id, enrichedPayload);
        break;

      case 'reflective_question':
        // This job type is handled inline in CoachingService, not via background worker
        logToFile('Warning: reflective_question should not be in queue', { jobId: job.id });
        break;

      case 'report_generation':
        await CoachingService.generateReport(coaching_session_id, enrichedPayload);
        break;

      case 'voice_debrief':
        // Voice debrief is part of report_generation
        logToFile('Warning: voice_debrief should be part of report_generation', { jobId: job.id });
        break;

      default:
        throw new Error(`Unknown job type: ${job_type}`);
    }
  }

  /**
   * Mark job as completed
   */
  async markJobCompleted(jobId) {
    try {
      const { error } = await supabase.rpc('complete_coaching_job', {
        p_job_id: jobId
      });

      if (error) {
        logToFile('Warning: Error marking job as completed (non-critical)', {
          workerId: this.workerId,
          jobId,
          error: error.message
        });
      }
    } catch (error) {
      logToFile('Warning: Exception marking job as completed (non-critical)', {
        workerId: this.workerId,
        jobId,
        error: error.message
      });
    }
  }

  /**
   * Handle job failure with exponential backoff retry
   */
  async handleJobFailure(job, error) {
    try {
      logToFile('Handling job failure', {
        workerId: this.workerId,
        jobId: job.id,
        jobType: job.job_type,
        attempt: job.attempts,
        maxAttempts: job.max_attempts,
        error: error.message
      });

      // Calculate exponential backoff: 60s, 120s, 240s, etc.
      const retryDelaySeconds = 60 * Math.pow(2, job.attempts - 1);

      const { error: rpcError } = await supabase.rpc('fail_coaching_job', {
        p_job_id: job.id,
        p_error_message: error.message,
        p_error_stack: error.stack,
        p_retry_delay_seconds: retryDelaySeconds
      });

      if (rpcError) {
        logToFile('❌ Error calling fail_coaching_job RPC', {
          workerId: this.workerId,
          jobId: job.id,
          error: rpcError.message
        });
      }
    } catch (err) {
      logToFile('❌ Exception in handleJobFailure', {
        workerId: this.workerId,
        jobId: job.id,
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
const worker = new CoachingWorker(WORKER_ID);

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
  // Don't exit immediately, try to shutdown gracefully
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
// HEALTH CHECK ENDPOINT (Optional HTTP server)
// ============================================================================

const express = require('express');
const app = express();
const HEALTH_PORT = process.env.COACHING_WORKER_HEALTH_PORT || 3100;

app.get('/health', (req, res) => {
  const stats = worker.getStats();

  // Worker is healthy if it's running and not stuck
  const isHealthy = worker.isRunning && !worker.isShuttingDown;

  // Check if worker is stuck (no job processed in last 10 minutes)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const isStuck = stats.lastJobTime && stats.lastJobTime < tenMinutesAgo;

  res.status(isHealthy && !isStuck ? 200 : 503).json({
    status: isHealthy && !isStuck ? 'healthy' : 'unhealthy',
    worker: stats,
    isStuck: isStuck,
    timestamp: new Date().toISOString()
  });
});

app.get('/stats', (req, res) => {
  res.json(worker.getStats());
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
// START WORKER
// ============================================================================

logToFile('🚀 Starting Classroom Coaching Worker', {
  workerId: WORKER_ID,
  nodeVersion: process.version,
  platform: process.platform,
  concurrency: CONCURRENCY_PER_WORKER,
  pollInterval: POLL_INTERVAL_MS,
  environment: process.env.NODE_ENV || 'development'
});

worker.start().catch((error) => {
  logToFile('❌ Fatal error in worker', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Export for testing
module.exports = { CoachingWorker, WORKER_ID };
