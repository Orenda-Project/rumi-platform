/**
 * Structured Logger with Console Override + Axiom HTTP Ingest
 *
 * This module:
 * 1. Creates a Pino logger that outputs structured JSON to stdout (Railway)
 * 2. Sends logs to Axiom via HTTP (no worker threads, no ESM issues)
 * 3. Overrides console.log/error/warn to produce structured output
 *
 * Usage: Simply require this file at the top of entry points
 *   require('./shared/utils/structured-logger');
 *
 * All existing console.log calls will automatically output structured JSON.
 *
 * NOTE: We use simple HTTP batching for Axiom instead of pino.transport()
 * to avoid worker thread issues that caused Railway to hang.
 */

const pino = require('pino');
const { Writable } = require('stream');
const https = require('https');

// Determine if we're in development (local) or production
const isDev = process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT;

// ============================================================
// Axiom HTTP Ingest (No Worker Threads)
// ============================================================

/**
 * AxiomBatcher - Collects logs and sends to Axiom in batches via HTTP
 *
 * Why not use @axiomhq/pino transport?
 * - pino.transport() spawns worker threads that can hang on startup
 * - @axiomhq/pino has ESM/CJS compatibility issues in production builds
 * - Simple HTTP batching is more reliable and debuggable
 *
 * @see https://axiom.co/docs/send-data/ingest
 */
class AxiomBatcher {
  constructor(options = {}) {
    this.dataset = options.dataset || process.env.AXIOM_DATASET;
    this.token = options.token || process.env.AXIOM_TOKEN;
    this.batchSize = options.batchSize || 50;
    this.flushIntervalMs = options.flushIntervalMs || 5000; // 5 seconds
    this.buffer = [];
    this.flushTimer = null;
    this.isFlushing = false;

    // Only enable if we have credentials
    this.enabled = !!(this.dataset && this.token);

    // DIAGNOSTIC: Log Axiom status at startup (to stderr so it doesn't go through Pino)
    if (this.enabled) {
      process.stderr.write(`[Axiom] ✅ Logging enabled - dataset=${this.dataset}\n`);

      // Start periodic flush
      this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
      // Don't prevent process exit
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }

      // Flush on process exit
      process.on('beforeExit', () => this.flush());
      process.on('SIGTERM', () => this.flush());
      process.on('SIGINT', () => this.flush());
    } else {
      process.stderr.write(`[Axiom] ⚠️ Logging DISABLED - dataset=${this.dataset || 'MISSING'}, token=${this.token ? 'SET' : 'MISSING'}\n`);
    }
  }

  /**
   * Add a log entry to the buffer
   * @param {Object} logObj - The Pino log object
   */
  add(logObj) {
    if (!this.enabled) return;

    this.buffer.push(logObj);

    // Flush if buffer is full
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Send buffered logs to Axiom using https module (Node.js 18 compatible)
   */
  flush() {
    if (!this.enabled || this.buffer.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);

    // Axiom expects newline-delimited JSON (ndjson)
    const ndjson = batch.map(obj => JSON.stringify(obj)).join('\n');

    const options = {
      hostname: 'api.axiom.co',
      port: 443,
      path: `/v1/datasets/${this.dataset}/ingest`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/x-ndjson',
        'Content-Length': Buffer.byteLength(ndjson),
      },
    };

    const req = https.request(options, (res) => {
      // Collect response body for error diagnosis
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk.toString();
      });
      res.on('end', () => {
        this.isFlushing = false;
        if (res.statusCode !== 200) {
          process.stderr.write(`[Axiom] Ingest failed: ${res.statusCode} - ${responseBody}\n`);
        } else {
          // Parse response to check for partial failures
          try {
            const result = JSON.parse(responseBody);
            if (result.failed > 0) {
              process.stderr.write(`[Axiom] Partial failure: ${result.failed}/${result.ingested + result.failed} failed - ${JSON.stringify(result.failures).slice(0, 500)}\n`);
            }
            // Log first successful batch for debugging
            if (!this._loggedFirstBatch && result.ingested > 0) {
              process.stderr.write(`[Axiom] First batch ingested: ${result.ingested} logs\n`);
              this._loggedFirstBatch = true;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });
    });

    req.on('error', (err) => {
      this.isFlushing = false;
      process.stderr.write(`[Axiom] Ingest error: ${err.message}\n`);
    });

    // Set a timeout to prevent hanging requests
    req.setTimeout(30000, () => {
      req.destroy();
      this.isFlushing = false;
      process.stderr.write(`[Axiom] Ingest timeout after 30s\n`);
    });

    req.write(ndjson);
    req.end();
  }

  /**
   * Stop the batcher and flush remaining logs
   */
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}

// Create global Axiom batcher instance
const axiomBatcher = new AxiomBatcher();

// ============================================================
// Field Normalization for Axiom Column Limit
// ============================================================

/**
 * Core fields that stay at top level in Axiom.
 * All other fields get nested under 'data' to prevent column explosion.
 * Axiom free tier has 257 column limit.
 */
const AXIOM_CORE_FIELDS = new Set([
  // Pino standard fields
  'level', 'time', 'msg', 'pid', 'hostname',
  // Our base fields
  'service', 'env',
  // Key identifiers for filtering/searching
  'correlationId', 'phone', 'userId', 'sessionId',
  // Error info
  'err',
]);

/**
 * Normalize log object for Axiom to prevent column explosion.
 * Keeps core fields at top level, STRINGIFIES everything else under 'data_json'.
 *
 * IMPORTANT: Axiom free tier has 257 column limit. Even nested objects get
 * flattened into columns (e.g., data.foo.bar becomes a column). By stringifying
 * the extra data, we ensure only ONE additional column (data_json) is created.
 *
 * @param {Object} logObj - The raw log object
 * @returns {Object} Normalized log object
 */
function normalizeForAxiom(logObj) {
  const normalized = {};
  const data = {};

  for (const [key, value] of Object.entries(logObj)) {
    if (AXIOM_CORE_FIELDS.has(key)) {
      normalized[key] = value;
    } else {
      data[key] = value;
    }
  }

  // Stringify extra data to prevent Axiom from flattening nested objects into columns
  // Use data_json (string) instead of data (object) to guarantee single column
  if (Object.keys(data).length > 0) {
    try {
      normalized.data_json = JSON.stringify(data);
    } catch (e) {
      normalized.data_json = '{"error":"Failed to stringify data"}';
    }
  }

  return normalized;
}

/**
 * Create a writable stream that outputs to stdout AND sends to Axiom
 * This replaces the problematic pino.transport({ targets: [...] })
 */
function createDualOutputStream() {
  return new Writable({
    write(chunk, encoding, callback) {
      // 1. Always write to stdout (Railway captures this)
      process.stdout.write(chunk);

      // 2. Send to Axiom if configured (with field normalization)
      if (axiomBatcher.enabled) {
        try {
          const logObj = JSON.parse(chunk.toString());
          // Normalize to prevent column explosion (257 column limit)
          const normalizedObj = normalizeForAxiom(logObj);
          axiomBatcher.add(normalizedObj);
        } catch (e) {
          // If not valid JSON, just skip Axiom
        }
      }

      callback();
    },
  });
}

// ============================================================
// Logger Creation
// ============================================================

let logger;

if (isDev) {
  // Pretty print in development (single transport is fine)
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: {
      service: process.env.RAILWAY_SERVICE_NAME || process.env.SERVICE_NAME || 'digital-coach',
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
} else {
  // Production: JSON to custom stream (stdout + Axiom HTTP)
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: {
      service: process.env.RAILWAY_SERVICE_NAME || process.env.SERVICE_NAME || 'digital-coach',
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }, createDualOutputStream());
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Generate a unique correlation ID for request tracing
 * Format: corr-{timestamp}-{random} for easy sorting and uniqueness
 * @returns {string} Correlation ID
 */
function generateCorrelationId() {
  return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a child logger with request-specific context
 * @param {Object} context - Context to include in all logs (e.g., correlationId, userId, phone)
 * @returns {Object} Child logger instance
 */
function createRequestLogger(context) {
  return logger.child(context);
}

// ============================================================
// AsyncLocalStorage for Request-Scoped Correlation ID
// ============================================================

const { AsyncLocalStorage } = require('async_hooks');

/**
 * AsyncLocalStorage for maintaining correlation ID across async boundaries
 * This allows the correlation ID to be automatically included in logs
 * without explicitly passing it through every function call.
 */
const correlationStorage = new AsyncLocalStorage();

/**
 * Run a function with a correlation ID in context
 * All logs within this function (and async calls) will include the correlationId
 * @param {string} correlationId - The correlation ID to use
 * @param {Function} fn - The function to run
 * @returns {Promise} Result of the function
 */
function runWithCorrelation(correlationId, fn) {
  return correlationStorage.run({ correlationId }, fn);
}

/**
 * Get the current correlation ID from context (if any)
 * @returns {string|undefined} The correlation ID or undefined
 */
function getCurrentCorrelationId() {
  const store = correlationStorage.getStore();
  return store?.correlationId;
}

// ============================================================
// Console Override
// ============================================================

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

/**
 * Convert console arguments to a structured log object
 * @param {Array} args - Console arguments
 * @returns {Object} { message, data }
 */
function parseConsoleArgs(args) {
  if (args.length === 0) {
    return { message: '', data: {} };
  }

  // If first arg is a string, use it as message
  if (typeof args[0] === 'string') {
    const message = args[0];
    const data = {};

    // Process remaining args
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === null || arg === undefined) {
        continue;
      }
      if (typeof arg === 'object') {
        // Merge objects into data
        if (arg instanceof Error) {
          data.err = {
            name: arg.name,
            message: arg.message,
            stack: arg.stack,
          };
        } else {
          Object.assign(data, arg);
        }
      } else {
        // Add primitives with index key
        data[`arg${i}`] = arg;
      }
    }

    return { message, data };
  }

  // First arg is not a string
  if (args[0] instanceof Error) {
    return {
      message: args[0].message,
      data: {
        err: {
          name: args[0].name,
          message: args[0].message,
          stack: args[0].stack,
        },
      },
    };
  }

  if (typeof args[0] === 'object') {
    return {
      message: 'Object logged',
      data: { logged: args[0] },
    };
  }

  return {
    message: String(args[0]),
    data: {},
  };
}

/**
 * Enhance log data with correlation ID if available in context
 */
function enhanceWithCorrelation(data) {
  const correlationId = getCurrentCorrelationId();
  if (correlationId && !data.correlationId) {
    return { correlationId, ...data };
  }
  return data;
}

// Override console methods to produce structured output
console.log = (...args) => {
  const { message, data } = parseConsoleArgs(args);
  logger.info(enhanceWithCorrelation(data), message);
};

console.error = (...args) => {
  const { message, data } = parseConsoleArgs(args);
  logger.error(enhanceWithCorrelation(data), message);
};

console.warn = (...args) => {
  const { message, data } = parseConsoleArgs(args);
  logger.warn(enhanceWithCorrelation(data), message);
};

console.info = (...args) => {
  const { message, data } = parseConsoleArgs(args);
  logger.info(enhanceWithCorrelation(data), message);
};

console.debug = (...args) => {
  const { message, data } = parseConsoleArgs(args);
  logger.debug(enhanceWithCorrelation(data), message);
};

// ============================================================
// Semantic Event Logging
// ============================================================

/**
 * Log a semantic event with consistent naming
 *
 * Event names follow the convention: feature.action.result
 * Examples: video.generation.started, coaching.session.completed
 *
 * @param {string} eventName - Format: feature.action.result (e.g., video.generation.started)
 * @param {Object} data - Event data to include
 */
function logEvent(eventName, data = {}) {
  const correlationId = getCurrentCorrelationId();
  const parts = eventName.split('.');
  const [feature, action, result] = parts;

  logger.info({
    event: eventName,
    feature,
    action,
    result,
    correlationId,
    ...data
  }, eventName);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  logger,
  logEvent,                // Semantic event logging
  createRequestLogger,
  generateCorrelationId,
  runWithCorrelation,      // Wrap async operations with correlation context
  getCurrentCorrelationId, // Get current correlation ID from context
  originalConsole,         // In case you need unmodified console
  axiomBatcher,            // For manual flush if needed
};
