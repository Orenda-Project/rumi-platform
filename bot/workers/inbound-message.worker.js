/**
 * Inbound Message Background Worker
 *
 * Dequeues and processes canonical InboundMessageEnvelope jobs from the queue.
 * Implements:
 * - Distributed message deduplication via SessionService.isProcessed
 * - Execution tracing via runWithCorrelation
 * - Immediate conversational feedback (reaction + typing indicator)
 * - Domain handler dispatching to text, voice, image, button, and flow workflows
 */

const { logToFile } = require('../shared/utils/logger');
const { generateCorrelationId, runWithCorrelation } = require('../shared/utils/structured-logger');
const SessionService = require('../shared/services/session.service');

function envelopeToMetaWebhook(envelope) {
  if (envelope.rawBody && envelope.rawBody.entry) {
    return envelope.rawBody;
  }

  const message = {
    id: envelope.id,
    from: envelope.from,
    timestamp: String(envelope.timestamp || Math.floor(Date.now() / 1000)),
    type: (typeof envelope.type === 'string' && envelope.type.startsWith('interactive'))
      ? 'interactive'
      : (envelope.type || 'text')
  };

  if (envelope.type === 'text') {
    message.text = { body: envelope.payload?.text || '' };
  } else if (envelope.type === 'interactive_button') {
    message.interactive = {
      type: 'button_reply',
      button_reply: {
        id: envelope.payload?.actionId || envelope.payload?.buttonId || '',
        title: envelope.payload?.title || ''
      }
    };
  } else if (envelope.type === 'interactive_list') {
    message.interactive = {
      type: 'list_reply',
      list_reply: {
        id: envelope.payload?.actionId || envelope.payload?.listId || '',
        title: envelope.payload?.title || ''
      }
    };
  } else if (envelope.type === 'interactive_flow') {
    message.interactive = {
      type: 'nfm_reply',
      nfm_reply: {
        name: envelope.payload?.flowName,
        response_json: typeof envelope.payload?.responseJson === 'string'
          ? envelope.payload.responseJson
          : JSON.stringify(envelope.payload?.flowData || envelope.payload?.responseJson || {})
      }
    };
  } else if (envelope.type === 'voice' || envelope.type === 'audio') {
    message[envelope.type] = envelope.payload?.audio || envelope.payload || { id: envelope.id };
  } else if (envelope.type === 'image') {
    message.image = envelope.payload?.image || envelope.payload || { id: envelope.id };
  } else if (envelope.type === 'document') {
    message.document = envelope.payload?.document || envelope.payload || { id: envelope.id };
  }

  const isWhatsapp = !envelope.channel || envelope.channel === 'whatsapp';
  const phoneNumberId = envelope.metadata?.phoneNumberId
    || (isWhatsapp ? process.env.PHONE_NUMBER_ID : undefined);
  const isStatus = envelope.type === 'status_update';

  const changeValue = {
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: '1234567890',
      ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {})
    },
    contacts: [{
      profile: { name: 'User' },
      wa_id: envelope.from
    }]
  };

  if (isStatus) {
    changeValue.statuses = Array.isArray(envelope.payload?.statuses)
      ? envelope.payload.statuses
      : [envelope.payload || { id: envelope.id, status: 'delivered' }];
  } else {
    changeValue.messages = [message];
  }

  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_ENTRY_ID',
      changes: [{
        field: isStatus ? 'statuses' : 'messages',
        value: changeValue
      }]
    }]
  };
}

class InboundMessageWorker {
  static customHandler = null;

  static setHandler(handlerFn) {
    InboundMessageWorker.customHandler = handlerFn;
  }

  static getHandler() {
    if (InboundMessageWorker.customHandler) {
      return InboundMessageWorker.customHandler;
    }
    try {
      const bot = require('../whatsapp-bot');
      return bot.handleWebhookPost;
    } catch (err) {
      logToFile('⚠️ Could not load whatsapp-bot handleWebhookPost', { error: err.message });
      return null;
    }
  }

  /**
   * Processes a single inbound message envelope.
   *
   * @param {Object} envelope - Canonical InboundMessageEnvelope
   * @param {Object} context - Queue job context
   */
  static async process(envelope, context = {}) {
    if (!envelope || !envelope.id) {
      logToFile('⚠️ InboundMessageWorker received empty envelope', { envelope });
      return;
    }

    const correlationId = envelope.metadata?.correlationId || generateCorrelationId();

    return await runWithCorrelation(correlationId, async () => {
      logToFile('⚙️ InboundMessageWorker processing envelope', {
        id: envelope.id,
        channel: envelope.channel,
        from: envelope.from,
        type: envelope.type,
        correlationId
      });

      // 1. Idempotency check via Redis / session store
      const dedupeKey = envelope.type === 'status_update'
        ? `${envelope.id}:${envelope.payload?.status || 'status'}`
        : envelope.id;
      const alreadyProcessed = await SessionService.isProcessed(dedupeKey);
      if (alreadyProcessed) {
        logToFile('⚠️ Duplicate inbound message skipped by worker', {
          envelopeId: dedupeKey,
          channel: envelope.channel,
          from: envelope.from
        });
        return { duplicate: true };
      }

      // 2. Immediate conversational feedback for WhatsApp channel
      if ((!envelope.channel || envelope.channel === 'whatsapp') && envelope.type !== 'status_update') {
        try {
          const WhatsAppService = require('../shared/services/whatsapp.service');
          const emoji = SessionService.getReactionEmoji(envelope.from);
          await WhatsAppService.sendReaction(envelope.from, envelope.id, emoji);
          await WhatsAppService.showTypingIndicator(envelope.from, envelope.id);
        } catch (feedbackErr) {
          logToFile('⚠️ Could not send immediate reaction/typing indicator', {
            error: feedbackErr.message,
            from: envelope.from
          });
        }
      }

      // 3. Domain dispatching
      const syntheticReq = {
        body: envelopeToMetaWebhook(envelope),
        headers: {},
        query: {},
        __skipDuplicateCheck: true,
        envelope
      };

      const syntheticRes = {
        headersSent: false,
        status() { return this; },
        send() { this.headersSent = true; return this; },
        json() { this.headersSent = true; return this; }
      };

      const handler = InboundMessageWorker.getHandler();
      if (typeof handler === 'function') {
        await handler(syntheticReq, syntheticRes);
      } else {
        logToFile('⚠️ No domain handler available for inbound message', { envelopeId: envelope.id });
      }

      // Mark as processed in session store ONLY after domain handler resolves successfully
      await SessionService.markAsProcessed(dedupeKey);

      return { success: true };
    });
  }
}

module.exports = InboundMessageWorker;
