/**
 * Latency Logging Middleware
 *
 * Tracks request duration and logs to console/Axiom.
 * Alerts on slow requests exceeding threshold.
 *
 * Bead: plt-mon01
 * Issue: No visibility into request latency patterns
 * Solution: Log all request durations, alert on slow requests
 */

// Threshold for "slow" request alerts (milliseconds)
const SLOW_REQUEST_THRESHOLD = 5000; // 5 seconds

// Routes to exclude from logging (too noisy)
const EXCLUDED_ROUTES = [
  '/health',
  '/favicon.ico'
];

// Static file extensions to log at reduced verbosity
const STATIC_EXTENSIONS = ['.css', '.js', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2'];

/**
 * Determine if a path is a static file
 * @param {string} path - Request path
 * @returns {boolean}
 */
function isStaticFile(path) {
  return STATIC_EXTENSIONS.some(ext => path.endsWith(ext)) ||
         path.startsWith('/assets/') ||
         path.startsWith('/css/') ||
         path.startsWith('/js/') ||
         path.startsWith('/images/');
}

/**
 * Create latency logging middleware
 * @param {Object} options - Configuration options
 * @param {number} options.slowThreshold - Threshold for slow request alerts (ms)
 * @param {boolean} options.logStaticFiles - Whether to log static file requests
 * @returns {Function} Express middleware
 */
function createLatencyLogger(options = {}) {
  const config = {
    slowThreshold: options.slowThreshold || SLOW_REQUEST_THRESHOLD,
    logStaticFiles: options.logStaticFiles !== false // Default true
  };

  return function latencyLogger(req, res, next) {
    // Skip excluded routes
    if (EXCLUDED_ROUTES.includes(req.path)) {
      return next();
    }

    const startTime = Date.now();
    const startHrTime = process.hrtime();

    // Capture response finish
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const [seconds, nanoseconds] = process.hrtime(startHrTime);
      const preciseMs = (seconds * 1000 + nanoseconds / 1000000).toFixed(2);

      const isStatic = isStaticFile(req.path);

      // Skip static file logging if disabled
      if (isStatic && !config.logStaticFiles) {
        return;
      }

      // Build log data
      const logData = {
        event: 'http.request.completed',
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: parseFloat(preciseMs),
        userAgent: req.get('User-Agent'),
        isStatic,
        timestamp: new Date().toISOString()
      };

      // Log to console (brief format for static, full for API)
      if (isStatic) {
        // Only log slow static files
        if (durationMs > 1000) {
          console.log(`[LATENCY] ${req.method} ${req.path} - ${preciseMs}ms (slow static)`);
        }
      } else {
        console.log(`[LATENCY] ${req.method} ${req.path} - ${preciseMs}ms - ${res.statusCode}`);
      }

      // Log to Axiom if available
      if (global.logEvent) {
        global.logEvent('http.request.completed', logData);
      }

      // Alert on slow requests
      if (durationMs > config.slowThreshold) {
        console.warn(`[SLOW REQUEST] ${req.method} ${req.path} took ${preciseMs}ms (threshold: ${config.slowThreshold}ms)`);

        const slowLogData = {
          event: 'http.request.slow',
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          durationMs: parseFloat(preciseMs),
          threshold: config.slowThreshold,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        };

        if (global.logEvent) {
          global.logEvent('http.request.slow', slowLogData);
        }
      }
    });

    next();
  };
}

/**
 * Simple latency logger middleware with default settings
 */
const latencyLogger = createLatencyLogger();

module.exports = {
  latencyLogger,
  createLatencyLogger,
  SLOW_REQUEST_THRESHOLD
};
