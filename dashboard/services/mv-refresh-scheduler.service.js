/**
 * Materialized View Refresh Scheduler
 *
 * Automatically refreshes dashboard materialized views every 5 minutes.
 * Uses PostgreSQL REFRESH MATERIALIZED VIEW CONCURRENTLY to allow reads during refresh.
 *
 * Strategies considered:
 * 1. Application scheduler (this file) - Simple, no external dependencies
 * 2. pg_cron extension - Better for production, requires Supabase config
 * 3. External cron (Railway, GitHub Actions) - More complex setup
 *
 * Current implementation: Application scheduler with setInterval
 * Recommended for production: pg_cron for reliability
 *
 * @module mv-refresh-scheduler.service
 * @bead bd-044
 */

const { Pool } = require('pg');
const materializedViews = require('./materialized-views.service');

// Configuration
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_DELAY_MS = 30 * 1000; // 30 seconds after startup

let isRunning = false;
let refreshInterval = null;
let pool = null;

/**
 * Initialize the refresh scheduler
 * Called once on application startup
 *
 * @param {Object} options - Scheduler options
 * @param {string} options.connectionString - PostgreSQL connection string
 * @param {number} options.intervalMs - Refresh interval in milliseconds
 */
function start(options = {}) {
  if (isRunning) {
    console.log('[MV Scheduler] Already running, skipping start');
    return;
  }

  const connectionString = options.connectionString || process.env.DATABASE_URL;
  const intervalMs = options.intervalMs || REFRESH_INTERVAL_MS;

  if (!connectionString) {
    console.error('[MV Scheduler] No DATABASE_URL configured, skipping scheduler');
    return;
  }

  // Create dedicated pool for refresh operations
  pool = new Pool({
    connectionString,
    max: 2, // Only need 1-2 connections for refresh
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'mv_refresh_scheduler'
  });

  pool.on('error', (err) => {
    console.error('[MV Scheduler] Pool error:', err.message);
  });

  isRunning = true;
  console.log(`[MV Scheduler] Starting with ${intervalMs / 1000}s interval`);

  // Initial delay before first refresh
  setTimeout(async () => {
    await refreshWithPool();

    // Then schedule regular refreshes
    refreshInterval = setInterval(async () => {
      await refreshWithPool();
    }, intervalMs);
  }, INITIAL_DELAY_MS);

  console.log(`[MV Scheduler] First refresh in ${INITIAL_DELAY_MS / 1000}s`);
}

/**
 * Stop the refresh scheduler
 */
function stop() {
  if (!isRunning) {
    return;
  }

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  if (pool) {
    pool.end().catch(err => {
      console.error('[MV Scheduler] Error closing pool:', err.message);
    });
    pool = null;
  }

  isRunning = false;
  console.log('[MV Scheduler] Stopped');
}

/**
 * Perform refresh using pool connection
 */
async function refreshWithPool() {
  if (!pool) {
    console.error('[MV Scheduler] Pool not initialized');
    return;
  }

  let client;
  try {
    client = await pool.connect();
    console.log('[MV Scheduler] Starting refresh...');

    const startTime = Date.now();
    const result = await materializedViews.refreshAllViews(client);
    const duration = Date.now() - startTime;

    console.log(`[MV Scheduler] Refresh completed in ${duration}ms`, {
      views: result.views.length,
      errors: result.errors.length,
      timings: result.timings
    });

    if (result.errors.length > 0) {
      console.error('[MV Scheduler] Refresh errors:', result.errors);
    }
  } catch (error) {
    console.error('[MV Scheduler] Refresh failed:', error.message);
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Force an immediate refresh (for manual triggers)
 *
 * @param {Object} dbClient - Database client to use
 */
async function forceRefresh(dbClient) {
  console.log('[MV Scheduler] Force refresh triggered');
  return await materializedViews.refreshAllViews(dbClient);
}

/**
 * Get scheduler status
 *
 * @returns {Object} Current scheduler status
 */
function getStatus() {
  return {
    isRunning,
    intervalMs: REFRESH_INTERVAL_MS,
    poolConnected: pool !== null
  };
}

module.exports = {
  start,
  stop,
  forceRefresh,
  getStatus,
  REFRESH_INTERVAL_MS
};
