/**
 * Database Context Middleware - FIXED VERSION
 *
 * Fixes applied (bd-039):
 * - Uses res.on('finish') for reliable cleanup (works with ALL response types)
 * - No method overriding (res.send/json) - avoids race conditions
 * - Single release point with 'released' flag (no double release)
 * - Handles res.render(), res.redirect(), and all response methods
 * - Request timeout protection (30s default)
 * - Slow request logging (>5s)
 *
 * Flow:
 * 1. Get user ID from session (req.session.userId)
 * 2. Get database client from pool
 * 3. SET ROLE portal_app_user
 * 4. SELECT set_portal_user_context(userId)
 * 5. Attach client to req.dbClient for use in route handlers
 * 6. Ensure RESET ROLE and release happen after response via res.on('finish')
 *
 * Bead: bd-039 - Fix portal database connection pool leak
 */

const pool = require('../../config/database');

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Database Context Middleware
 * Applies portal_app_user role and sets user context for RLS
 */
async function setDatabaseContext(req, res, next) {
  let client;
  let released = false;
  const startTime = Date.now();

  // Cleanup function - only releases once (protected by 'released' flag)
  const cleanup = async (source) => {
    if (released) return;
    released = true;

    const duration = Date.now() - startTime;

    try {
      if (client) {
        // Reset role if it was set
        if (req._dbRoleSet) {
          await client.query('RESET ROLE');
        }
        client.release();
        client = null;
        req.dbClient = null;
      }
    } catch (err) {
      console.error(`[DB Context] Cleanup error (${source}):`, err.message);
    }

    // Log slow requests for debugging
    if (duration > 5000) {
      console.warn(`[DB Context] Slow request: ${req.method} ${req.url} took ${duration}ms`);
    }
  };

  // Request timeout protection - prevents connections being held indefinitely
  const timeoutId = setTimeout(() => {
    console.error(`[DB Context] Request timeout: ${req.method} ${req.url}`);
    cleanup('timeout');
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout' });
    }
  }, REQUEST_TIMEOUT_MS);

  try {
    // Get a database client from the pool
    client = await pool.connect();
    req.dbClient = client;

    const isAuthenticated = req.session && req.session.userId;

    // Apply RLS context for authenticated users
    if (isAuthenticated) {
      await client.query('SET ROLE portal_app_user');
      await client.query('SELECT set_portal_user_context($1)', [req.session.userId]);
      req._dbRoleSet = true;
    } else {
      req._dbRoleSet = false;
    }

    // FIXED: Single cleanup point using 'finish' event
    // This fires for ALL response types: send, json, render, redirect, etc.
    res.on('finish', () => {
      clearTimeout(timeoutId);
      cleanup('finish');
    });

    // Also handle aborted/closed connections (client disconnected early)
    res.on('close', () => {
      if (!res.writableEnded) {
        console.warn(`[DB Context] Connection closed early: ${req.method} ${req.url}`);
        clearTimeout(timeoutId);
        cleanup('close');
      }
    });

    next();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[DB Context] Setup error:', error.message);

    // Cleanup on error
    await cleanup('error');
    next(error);
  }
}

/**
 * Helper function to execute queries with database context
 * Simplified - no cleanup responsibility (middleware handles it)
 */
async function withDatabaseContext(req, queryFn) {
  if (!req.dbClient) {
    throw new Error('Database context not set. Ensure setDatabaseContext middleware is applied.');
  }
  // Just run the query, let middleware handle cleanup
  return await queryFn(req.dbClient);
}

module.exports = {
  setDatabaseContext,
  withDatabaseContext
};
