/**
 * Webhook Ingestion Gateway Unit Tests
 *
 * Validates the canonical envelope factory, ingress dispatcher, WhatsApp/Slack
 * provider adapters, and gateway router in isolation.
 */

const { createInboundEnvelope, ENVELOPE_TYPES } = require('../../bot/gateway/envelope');
const { IngressDispatcher } = require('../../bot/gateway/ingress-dispatcher');
const whatsappAdapter = require('../../bot/gateway/adapters/whatsapp.adapter');
const slackAdapter = require('../../bot/gateway/adapters/slack.adapter');
const { createWebhookRoutes } = require('../../bot/gateway/webhook.routes');

describe('Canonical Inbound Message Envelope', () => {
  it('creates an envelope with default fields', () => {
    const envelope = createInboundEnvelope({
      id: 'msg_123',
      channel: 'whatsapp',
      from: '923001234567'
    });

    expect(envelope.id).toBe('msg_123');
    expect(envelope.channel).toBe('whatsapp');
    expect(envelope.from).toBe('923001234567');
    expect(envelope.type).toBe(ENVELOPE_TYPES.UNKNOWN);
    expect(typeof envelope.timestamp).toBe('number');
    expect(envelope.payload).toEqual({});
    expect(envelope.metadata).toBeDefined();
  });

  it('normalizes custom payload and envelope type', () => {
    const envelope = createInboundEnvelope({
      id: 'btn_456',
      channel: 'whatsapp',
      from: '923001234567',
      type: ENVELOPE_TYPES.INTERACTIVE_BUTTON,
      payload: {
        actionId: 'coaching_confirm_session_123',
        text: 'Confirm'
      },
      metadata: {
        correlationId: 'test-corr-id',
        phoneNumberId: '100000000000001'
      }
    });

    expect(envelope.type).toBe(ENVELOPE_TYPES.INTERACTIVE_BUTTON);
    expect(envelope.payload.actionId).toBe('coaching_confirm_session_123');
    expect(envelope.metadata.correlationId).toBe('test-corr-id');
    expect(envelope.metadata.phoneNumberId).toBe('100000000000001');
  });
});

describe('Ingress Dispatcher', () => {
  it('dispatches synchronously to registered handler in Phase 1', async () => {
    const dispatcher = new IngressDispatcher();
    const mockHandler = jest.fn().mockResolvedValue({ processed: true });

    dispatcher.registerHandler(mockHandler);

    const envelope = createInboundEnvelope({
      id: 'msg_1',
      channel: 'whatsapp',
      from: '923001234567',
      type: ENVELOPE_TYPES.TEXT,
      payload: { text: 'Hello' }
    });

    const context = { correlationId: 'test-corr' };
    const result = await dispatcher.dispatch(envelope, context);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(envelope, context);
    expect(result).toEqual({ processed: true });
  });

  it('routes to queue producer in Phase 2 mode', async () => {
    const dispatcher = new IngressDispatcher();
    const mockProducer = jest.fn().mockResolvedValue('enqueued-job-id-99');

    dispatcher.setQueueProducer(mockProducer);

    const envelope = createInboundEnvelope({
      id: 'msg_async',
      channel: 'whatsapp',
      from: '923001234567',
      type: ENVELOPE_TYPES.TEXT
    });

    const result = await dispatcher.dispatch(envelope);

    expect(mockProducer).toHaveBeenCalledTimes(1);
    expect(mockProducer).toHaveBeenCalledWith(envelope);
    expect(result).toBe('enqueued-job-id-99');
  });

  it('returns null safely when no handler is registered', async () => {
    const dispatcher = new IngressDispatcher();
    const envelope = createInboundEnvelope({ id: 'msg_unhandled' });

    const result = await dispatcher.dispatch(envelope);
    expect(result).toBeNull();
  });

  it('restores sync mode when registerHandler is called after setQueueProducer', async () => {
    const dispatcher = new IngressDispatcher();
    const mockProducer = jest.fn().mockResolvedValue('queued');
    const mockHandler = jest.fn().mockResolvedValue({ sync: true });

    dispatcher.setQueueProducer(mockProducer);
    expect(dispatcher.mode).toBe('async_queue');

    dispatcher.registerHandler(mockHandler);
    expect(dispatcher.mode).toBe('sync');

    const envelope = createInboundEnvelope({ id: 'msg_sync_restore' });
    const result = await dispatcher.dispatch(envelope);

    expect(mockHandler).toHaveBeenCalledWith(envelope, {});
    expect(mockProducer).not.toHaveBeenCalled();
    expect(result).toEqual({ sync: true });
  });
});

describe('WhatsApp Ingress Adapter', () => {
  const originalVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  beforeEach(() => {
    process.env.WEBHOOK_VERIFY_TOKEN = 'test_secret_token';
  });

  afterEach(() => {
    process.env.WEBHOOK_VERIFY_TOKEN = originalVerifyToken;
  });

  it('verifies handshake when mode and token match', () => {
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_secret_token',
        'hub.challenge': 'meta_challenge_xyz'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };

    whatsappAdapter.verifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('meta_challenge_xyz');
  });

  it('rejects handshake with 403 Forbidden when token does not match', () => {
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'meta_challenge_xyz'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };

    whatsappAdapter.verifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
  });

  it('parses WhatsApp text message into canonical envelope', () => {
    const req = {
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1234567890',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '100000000000001' },
                  contacts: [{ wa_id: '923001234567' }],
                  messages: [
                    {
                      id: 'wamid.12345',
                      from: '923001234567',
                      timestamp: '1790561399',
                      type: 'text',
                      text: { body: 'Hello Rumi' }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    };

    const envelope = whatsappAdapter.parseToEnvelope(req, 'test-corr-1');

    expect(envelope).toBeDefined();
    expect(envelope.id).toBe('wamid.12345');
    expect(envelope.channel).toBe('whatsapp');
    expect(envelope.from).toBe('923001234567');
    expect(envelope.type).toBe(ENVELOPE_TYPES.TEXT);
    expect(envelope.payload.text).toBe('Hello Rumi');
    expect(envelope.metadata.phoneNumberId).toBe('100000000000001');
  });

  it('parses WhatsApp interactive button reply into canonical envelope', () => {
    const req = {
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1234567890',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '100000000000001' },
                  messages: [
                    {
                      id: 'wamid.btn123',
                      from: '923001234567',
                      timestamp: '1790561399',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: {
                          id: 'coaching_confirm_session_abc',
                          title: 'Yes, Start'
                        }
                      }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    };

    const envelope = whatsappAdapter.parseToEnvelope(req, 'test-corr-btn');

    expect(envelope).toBeDefined();
    expect(envelope.type).toBe(ENVELOPE_TYPES.INTERACTIVE_BUTTON);
    expect(envelope.payload.actionId).toBe('coaching_confirm_session_abc');
    expect(envelope.payload.text).toBe('Yes, Start');
  });

  it('parses WhatsApp broadcast status update into status_update envelope', () => {
    const req = {
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '1234567890',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: 'wamid.status999',
                      status: 'delivered',
                      timestamp: '1790561400',
                      recipient_id: '923001234567'
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    };

    const envelope = whatsappAdapter.parseToEnvelope(req, 'test-corr-status');

    expect(envelope).toBeDefined();
    expect(envelope.type).toBe(ENVELOPE_TYPES.STATUS_UPDATE);
    expect(envelope.payload.status).toBe('delivered');
    expect(envelope.from).toBe('923001234567');
  });
});

describe('Slack Ingress Adapter', () => {
  it('normalizes Slack event into canonical envelope', () => {
    const syntheticReq = {
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'slack_msg_1',
                      from: 'slack:U123456',
                      timestamp: 1790561399,
                      type: 'text',
                      text: { body: 'Hello Slack Rumi' }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    };

    const envelope = slackAdapter.normalizeSlackEvent(syntheticReq);

    expect(envelope.channel).toBe('slack');
    expect(envelope.from).toBe('slack:U123456');
    expect(envelope.type).toBe(ENVELOPE_TYPES.TEXT);
    expect(envelope.payload.text).toBe('Hello Slack Rumi');
  });
});

describe('Webhook Routes Router Factory', () => {
  it('creates an Express router with /webhook and /api/slack mounts', () => {
    const mockDispatcher = new IngressDispatcher();
    const router = createWebhookRoutes(mockDispatcher);

    expect(router).toBeDefined();
    expect(typeof router).toBe('function'); // Express Router is callable function
  });
});
