/**
 * Lightweight Span/Trace Support for Rumi
 *
 * Provides operation hierarchy tracking and duration measurement.
 * Compatible with OpenTelemetry concepts but simplified for our use case.
 *
 * Usage:
 *   const { withSpan } = require('./tracing');
 *
 *   await withSpan('video.generation', async (span) => {
 *     span.setAttribute('requestId', videoRequestId);
 *
 *     await withSpan('video.script', async () => {
 *       // Script generation work
 *     }, span.spanId);
 *
 *     return result;
 *   });
 */

const { getCurrentCorrelationId, logger } = require('./structured-logger');

/**
 * Span class for tracking operation duration and hierarchy
 */
class Span {
  /**
   * Create a new span
   * @param {string} name - Span name (e.g., 'video.generation')
   * @param {string|null} parentSpanId - Parent span ID for hierarchy
   */
  constructor(name, parentSpanId = null) {
    this.name = name;
    this.spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
    this.correlationId = getCurrentCorrelationId();
    this.attributes = {};
  }

  /**
   * Set an attribute on the span
   * @param {string} key - Attribute key
   * @param {any} value - Attribute value
   * @returns {Span} This span instance for chaining
   */
  setAttribute(key, value) {
    this.attributes[key] = value;
    return this;
  }

  /**
   * End the span with a status
   * @param {string} status - 'ok' or 'error'
   */
  end(status = 'ok') {
    const durationMs = Date.now() - this.startTime;

    logger.info({
      span: this.name,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      correlationId: this.correlationId,
      durationMs,
      status,
      ...this.attributes
    }, `span.${this.name}.${status}`);
  }

  /**
   * End the span with an error
   * @param {Error} err - The error that occurred
   */
  error(err) {
    this.setAttribute('error.type', err.name);
    this.setAttribute('error.message', err.message);
    this.end('error');
  }
}

/**
 * Run a function within a span, automatically tracking duration
 *
 * @param {string} name - Span name
 * @param {Function} fn - Async function to run (receives span as argument)
 * @param {string|null} parentSpanId - Parent span ID for hierarchy
 * @returns {Promise<any>} Result of the function
 *
 * @example
 * const result = await withSpan('video.generation', async (span) => {
 *   span.setAttribute('topic', 'Math');
 *   // Do work
 *   return videoUrl;
 * });
 */
async function withSpan(name, fn, parentSpanId = null) {
  const span = new Span(name, parentSpanId);
  try {
    const result = await fn(span);
    span.end('ok');
    return result;
  } catch (err) {
    span.error(err);
    throw err;
  }
}

module.exports = { Span, withSpan };
