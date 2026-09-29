/**
 * WhatsApp Ingress Adapter (Meta Cloud API)
 *
 * Implements Meta webhook verification and normalizes incoming WhatsApp webhook
 * payloads into canonical InboundMessageEnvelopes.
 */

const constants = require('../../shared/utils/constants');
const validators = require('../../shared/utils/validators');
const { logToFile } = require('../../shared/utils/logger');
const { generateCorrelationId, runWithCorrelation } = require('../../shared/utils/structured-logger');
const { createInboundEnvelope, ENVELOPE_TYPES } = require('../envelope');

/**
 * Handle GET /webhook Meta verification handshake.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN || constants.WEBHOOK_VERIFY_TOKEN;

  logToFile('WhatsApp verification request received', {
    mode,
    hasToken: !!token,
    hasChallenge: !!challenge
  });

  if (mode === 'subscribe' && token === expectedToken) {
    logToFile('✅ WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logToFile('❌ WhatsApp webhook verification failed');
    res.status(403).send('Forbidden');
  }
}

/**
 * Normalizes WhatsApp webhook payload into a canonical InboundMessageEnvelope.
 *
 * @param {Object} req - Express request
 * @param {string} correlationId - Tracing identifier
 * @returns {Object|null} InboundMessageEnvelope or null if unparseable
 */
function parseToEnvelope(req, correlationId) {
  const statusValidation = validators.validateWebhookStatus(req);
  if (statusValidation && statusValidation.statuses) {
    const primaryStatus = statusValidation.statuses[0] || {};
    return createInboundEnvelope({
      id: primaryStatus.id || `status_${Date.now()}`,
      channel: 'whatsapp',
      from: primaryStatus.recipient_id || '',
      timestamp: primaryStatus.timestamp ? parseInt(primaryStatus.timestamp, 10) : Math.floor(Date.now() / 1000),
      type: ENVELOPE_TYPES.STATUS_UPDATE,
      payload: {
        status: primaryStatus.status,
        statuses: statusValidation.statuses,
        errors: primaryStatus.errors || null
      },
      metadata: {
        correlationId,
        rawEntry: req.body?.entry?.[0]
      },
      rawBody: req.body
    });
  }

  const validation = validators.validateWebhookMessage(req);
  if (!validation) {
    return null;
  }

  const { entry, message, from, messageBody, messageType, messageTimestamp, phoneNumberId } = validation;

  let envelopeType = ENVELOPE_TYPES.UNKNOWN;
  const payload = {
    messageBody
  };

  if (messageType === 'text') {
    envelopeType = ENVELOPE_TYPES.TEXT;
    payload.text = messageBody;
  } else if (messageType === 'interactive' && message.interactive?.type === 'button_reply') {
    if (message.interactive?.button_reply?.id) {
      envelopeType = ENVELOPE_TYPES.INTERACTIVE_BUTTON;
      payload.actionId = message.interactive.button_reply.id;
      payload.text = message.interactive.button_reply.title;
    } else {
      envelopeType = ENVELOPE_TYPES.UNKNOWN;
    }
  } else if (messageType === 'interactive' && message.interactive?.type === 'list_reply') {
    if (message.interactive?.list_reply?.id) {
      envelopeType = ENVELOPE_TYPES.INTERACTIVE_LIST;
      payload.actionId = message.interactive.list_reply.id;
      payload.text = message.interactive.list_reply.title;
    } else {
      envelopeType = ENVELOPE_TYPES.UNKNOWN;
    }
  } else if (messageType === 'interactive' && message.interactive?.type === 'nfm_reply') {
    envelopeType = ENVELOPE_TYPES.INTERACTIVE_FLOW;
    payload.flowName = message.interactive.nfm_reply.name;
    try {
      payload.flowData = JSON.parse(message.interactive.nfm_reply.response_json || '{}');
    } catch (e) {
      payload.flowData = {};
    }
  } else if (messageType === 'audio') {
    envelopeType = ENVELOPE_TYPES.AUDIO;
    payload.mediaId = message.audio?.id;
    payload.mimeType = message.audio?.mime_type;
  } else if (messageType === 'voice') {
    envelopeType = ENVELOPE_TYPES.VOICE;
    payload.mediaId = message.voice?.id;
    payload.mimeType = message.voice?.mime_type;
  } else if (messageType === 'image') {
    envelopeType = ENVELOPE_TYPES.IMAGE;
    payload.mediaId = message.image?.id;
    payload.caption = message.image?.caption;
    payload.mimeType = message.image?.mime_type;
  } else if (messageType === 'document') {
    envelopeType = ENVELOPE_TYPES.DOCUMENT;
    payload.mediaId = message.document?.id;
    payload.filename = message.document?.filename;
    payload.mimeType = message.document?.mime_type;
  }

  return createInboundEnvelope({
    id: message.id,
    channel: 'whatsapp',
    from,
    timestamp: messageTimestamp,
    type: envelopeType,
    payload,
    metadata: {
      correlationId,
      phoneNumberId,
      rawEntry: entry,
      messageType,
      fullMessage: message
    },
    rawBody: req.body
  });
}

/**
 * Creates Express POST /webhook handler.
 *
 * @param {Object} dispatcher - IngressDispatcher instance
 * @returns {Function} Express route handler
 */
function createPostHandler(dispatcher) {
  return async function handleWhatsAppPost(req, res) {
    const correlationId = generateCorrelationId();

    await runWithCorrelation(correlationId, async () => {
      logToFile('=== INCOMING WEBHOOK (GATEWAY) ===', { correlationId });

      try {
        const envelope = parseToEnvelope(req, correlationId);

        // Dispatch normalized envelope to domain processing
        if (envelope && dispatcher) {
          await dispatcher.dispatch(envelope, { req, res, correlationId });
        }

        // Ensure 200 EVENT_RECEIVED is acknowledged if handler hasn't answered
        if (!res.headersSent) {
          res.status(200).send('EVENT_RECEIVED');
        }
      } catch (error) {
        logToFile('❌ Error in WhatsApp gateway handler', {
          error: error.message,
          stack: error.stack,
          correlationId
        });

        if (!res.headersSent) {
          res.status(500).send('QUEUE_ERROR');
        }
      }
    });
  };
}

module.exports = {
  verifyWebhook,
  parseToEnvelope,
  createPostHandler
};
