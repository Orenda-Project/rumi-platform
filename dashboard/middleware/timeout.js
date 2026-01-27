/**
 * Request Timeout Middleware
 *
 * Prevents hung requests from blocking workers indefinitely.
 * Different timeouts for different route types.
 *
 * Bead: plt-tout01
 * Issue: No explicit request timeouts causing hung requests
 * Solution: Configurable timeouts based on route patterns
 */

// Default timeouts (in milliseconds)
const DEFAULT_TIMEOUT = 30000; // 30 seconds for normal routes
const GPT_TIMEOUT = 120000; // 120 seconds for GPT-heavy routes
const STATIC_TIMEOUT = 10000; // 10 seconds for static files

// Routes that need longer timeouts (GPT processing or heavy queries)
const GPT_HEAVY_ROUTES = [
  '/observability/api/coaching/session/',
  '/observability/api/transcript/',
  '/observability/api/ama',
  '/api/portal/coaching-session/',
  '/api/portal/coaching-analytics',
  '/observability/retention' // bd-044: MV fallback can be slow during optimization
];

// Static file patterns
const STATIC_PATTERNS = [
  '/assets/',
  '/css/',
  '/js/',
  '/images/',
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.svg',
  '.ico'
];

/**
 * Determine the appropriate timeout for a request
 * @param {string} path - Request path
 * @returns {number} Timeout in milliseconds
 */
function getTimeoutForRoute(path) {
  // Check if it's a static file
  if (STATIC_PATTERNS.some(pattern => path.includes(pattern))) {
    return STATIC_TIMEOUT;
  }

  // Check if it's a GPT-heavy route
  if (GPT_HEAVY_ROUTES.some(route => path.startsWith(route))) {
    return GPT_TIMEOUT;
  }

  // Default timeout
  return DEFAULT_TIMEOUT;
}

/**
 * Create timeout middleware
 * @param {Object} options - Configuration options
 * @param {number} options.defaultTimeout - Default timeout in ms
 * @param {number} options.gptTimeout - GPT route timeout in ms
 * @param {number} options.staticTimeout - Static file timeout in ms
 * @returns {Function} Express middleware
 */
function createTimeoutMiddleware(options = {}) {
  const config = {
    defaultTimeout: options.defaultTimeout || DEFAULT_TIMEOUT,
    gptTimeout: options.gptTimeout || GPT_TIMEOUT,
    staticTimeout: options.staticTimeout || STATIC_TIMEOUT
  };

  return function timeoutMiddleware(req, res, next) {
    const timeout = getTimeoutForRoute(req.path);

    // Set timeout on the request
    req.setTimeout(timeout);

    // Create a timeout handler
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`[TIMEOUT] Request timed out: ${req.method} ${req.path} (${timeout}ms)`);

        // Log to Axiom if available
        if (global.logEvent) {
          global.logEvent('request.timeout', {
            method: req.method,
            path: req.path,
            timeout: timeout,
            userAgent: req.get('User-Agent')
          });
        }

        res.status(503).json({
          error: 'Request Timeout',
          message: 'The request took too long to process. Please try again.',
          timeout: timeout
        });
      }
    }, timeout);

    // Clear timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeoutId);
    });

    // Clear timeout on error
    res.on('close', () => {
      clearTimeout(timeoutId);
    });

    next();
  };
}

/**
 * Simple timeout middleware with default settings
 */
const timeoutMiddleware = createTimeoutMiddleware();

module.exports = {
  timeoutMiddleware,
  createTimeoutMiddleware,
  getTimeoutForRoute,
  DEFAULT_TIMEOUT,
  GPT_TIMEOUT,
  STATIC_TIMEOUT
};
