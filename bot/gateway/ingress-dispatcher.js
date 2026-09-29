/**
 * Ingress Dispatcher
 *
 * Serves as the decoupling boundary between transport/channel adapters and
 * downstream message processing.
 *
 * Phase 1: Dispatches envelopes synchronously in-process to domain handlers.
 * Phase 2: Will publish envelopes to background message queue (SQS / BullMQ).
 */

const { logToFile } = require('../shared/utils/logger');

class IngressDispatcher {
  constructor() {
    this.handler = null;
    this.queueProducer = null;
    this.mode = 'sync'; // 'sync' (Phase 1) or 'async_queue' (Phase 2)
  }

  /**
   * Register a synchronous domain handler for in-process execution (Phase 1).
   * @param {Function} handlerFn - Async function (envelope, context) => Promise<any>
   */
  registerHandler(handlerFn) {
    this.handler = handlerFn;
    this.mode = 'sync';
  }

  /**
   * Configure an asynchronous queue producer (Phase 2).
   * @param {Function} producerFn - Async function (envelope) => Promise<void>
   */
  setQueueProducer(producerFn) {
    this.queueProducer = producerFn;
    this.mode = 'async_queue';
  }

  /**
   * Dispatch a normalized inbound envelope.
   *
   * @param {Object} envelope - Normalized InboundMessageEnvelope
   * @param {Object} context - Execution context { req, res, correlationId }
   * @returns {Promise<any>}
   */
  async dispatch(envelope, context = {}) {
    if (this.mode === 'async_queue' && this.queueProducer) {
      logToFile('📤 Dispatching envelope to background queue (Phase 2)', {
        envelopeId: envelope.id,
        channel: envelope.channel,
        type: envelope.type
      });
      return await this.queueProducer(envelope);
    }

    if (this.handler) {
      return await this.handler(envelope, context);
    }

    logToFile('⚠️ IngressDispatcher: No handler registered for envelope', {
      envelopeId: envelope?.id,
      channel: envelope?.channel
    });
    return null;
  }
}

// Global default singleton instance
const defaultDispatcher = new IngressDispatcher();

module.exports = {
  IngressDispatcher,
  defaultDispatcher
};
