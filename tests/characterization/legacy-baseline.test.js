/**
 * legacy-baseline.test.js
 *
 * Characterization snapshot test for legacy monolith ingress endpoints:
 *   1. GET /webhook (Meta handshake with hub.verify_token)
 *   2. POST /webhook (WhatsApp text and button payload)
 *   3. POST /api/slack (HMAC signature raw-body challenge)
 *
 * Records and asserts exact wire responses into tests/characterization/legacy-baseline-snapshot.json
 * without modifying any production code.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');

const SNAPSHOT_FILE_PATH = path.resolve(__dirname, 'legacy-baseline-snapshot.json');
const TEST_VERIFY_TOKEN = 'test_meta_webhook_verify_token_123';
const TEST_SLACK_SIGNING_SECRET = 'test_slack_signing_secret_xyz789';
const TEST_PHONE_NUMBER_ID = '100000000000001';

process.env.WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SIGNING_SECRET;
process.env.PHONE_NUMBER_ID = TEST_PHONE_NUMBER_ID;

// Mock external services that pull in non-root or uninstalled dependencies
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => {
  const memoryStore = new Map();
  return {
    get: jest.fn().mockImplementation((key) => Promise.resolve(memoryStore.get(key) || null)),
    set: jest.fn().mockImplementation((key, val) => { memoryStore.set(key, val); return Promise.resolve(true); }),
    setex: jest.fn().mockImplementation((key, ttl, val) => { memoryStore.set(key, val); return Promise.resolve(true); }),
    del: jest.fn().mockImplementation((key) => { memoryStore.delete(key); return Promise.resolve(true); }),
    isReady: jest.fn().mockReturnValue(true),
    redis: {
      get: jest.fn().mockImplementation((key) => Promise.resolve(memoryStore.get(key) || null)),
      set: jest.fn().mockImplementation((key, val) => { memoryStore.set(key, val); return Promise.resolve('OK'); }),
      del: jest.fn().mockImplementation((key) => { memoryStore.delete(key); return Promise.resolve(1); }),
    }
  };
});

jest.mock('../../bot/shared/routes/flow-endpoint.routes', () => {
  const express = require('express');
  return express.Router();
});

jest.mock('../../bot/shared/services/portal-invite.service', () => ({
  createInvite: jest.fn().mockResolvedValue('https://portal.test/invite'),
}));

jest.mock('../../bot/shared/services/reading-assessment.service', () => ({
  startAssessment: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../bot/shared/services/openai.service', () => ({
  generateChatCompletion: jest.fn().mockResolvedValue('Mock AI response'),
}));

jest.mock('../../bot/shared/services/coaching-orchestrator.service', () => ({
  handleConfirmation: jest.fn().mockResolvedValue(true),
  handleLessonPlanResponse: jest.fn().mockResolvedValue(true),
  processTranscription: jest.fn().mockResolvedValue(true),
  processAnalysis: jest.fn().mockResolvedValue(true),
  generateReport: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../bot/shared/handlers/exam-checker.handler', () => ({
  handleExamImage: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../bot/shared/handlers/text-message.handler', () => ({
  handleTextMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../bot/shared/handlers/voice-message.handler', () => ({
  handleVoiceMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../bot/shared/handlers/image-message.handler', () => ({
  handleImageMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendReaction: jest.fn().mockResolvedValue({ success: true }),
  showTypingIndicator: jest.fn().mockResolvedValue({ success: true }),
  sendMessage: jest.fn().mockResolvedValue({ success: true }),
  sendTemplateMessage: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../bot/shared/database/bot-helpers', () => ({
  getOrCreateUser: jest.fn().mockResolvedValue({ id: 'test-user-uuid', phone_number: '923001234567' }),
  getOrCreateUserByChannel: jest.fn().mockResolvedValue({ id: 'test-user-uuid' }),
  trackChatStart: jest.fn().mockResolvedValue(true),
  getOrCreateSession: jest.fn().mockResolvedValue('test-session-uuid'),
  updateSessionType: jest.fn().mockResolvedValue(true),
  storeConversation: jest.fn().mockResolvedValue(true),
  storeLessonPlan: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../bot/shared/services/flow-id-validator.service', () => ({
  validateFlowIdsOnBoot: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn(),
  LOGS_DIR: '/tmp/logs',
}));

describe('Legacy Monolith Ingress Characterization Baseline', () => {
  let server;
  let serverUrl;
  let recordedSnapshots = {};

  beforeAll((done) => {
    // Require app directly from whatsapp-bot without calling startServer
    const { app } = require('../../bot/whatsapp-bot');
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      serverUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    // Write recorded snapshot to file
    fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(recordedSnapshots, null, 2), 'utf8');

    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  // Helper to make wire HTTP requests and record response wire details
  async function performRequest({ method, path: requestPath, headers = {}, body = null }) {
    const targetUrl = `${serverUrl}${requestPath}`;
    const options = {
      method,
      headers: { ...headers }
    };

    if (body != null) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!options.headers['content-type'] && !options.headers['Content-Type']) {
        options.headers['content-type'] = 'application/json';
      }
    }

    const response = await fetch(targetUrl, options);
    const textBody = await response.text();
    let parsedBody = textBody;
    try {
      parsedBody = JSON.parse(textBody);
    } catch (_) {
      // Retain as text
    }

    return {
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      body: parsedBody
    };
  }

  // 1. GET /webhook (Meta handshake with hub.verify_token)
  describe('1. GET /webhook (Meta verification handshake)', () => {
    it('returns 200 and challenge string when verify token matches', async () => {
      const challengeToken = '1158201444_valid_meta_challenge';
      const pathWithQuery = `/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=${encodeURIComponent(challengeToken)}`;

      const wireResponse = await performRequest({
        method: 'GET',
        path: pathWithQuery
      });

      expect(wireResponse.statusCode).toBe(200);
      expect(wireResponse.body).toBe(challengeToken);

      recordedSnapshots.metaWebhookGetValid = {
        request: {
          method: 'GET',
          path: '/webhook',
          query: {
            'hub.mode': 'subscribe',
            'hub.verify_token': TEST_VERIFY_TOKEN,
            'hub.challenge': challengeToken
          }
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });

    it('returns 403 Forbidden when verify token does not match', async () => {
      const pathWithQuery = `/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=999999`;

      const wireResponse = await performRequest({
        method: 'GET',
        path: pathWithQuery
      });

      expect(wireResponse.statusCode).toBe(403);
      expect(wireResponse.body).toBe('Forbidden');

      recordedSnapshots.metaWebhookGetInvalid = {
        request: {
          method: 'GET',
          path: '/webhook',
          query: {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'wrong_token',
            'hub.challenge': '999999'
          }
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });
  });

  // 2. POST /webhook (WhatsApp text and button payload)
  describe('2. POST /webhook (WhatsApp text and button payloads)', () => {
    it('returns 200 EVENT_RECEIVED for standard WhatsApp text message payload', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const textMessagePayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789012345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550100000',
                    phone_number_id: TEST_PHONE_NUMBER_ID
                  },
                  contacts: [
                    {
                      profile: { name: 'Amina Teacher' },
                      wa_id: '923001234567'
                    }
                  ],
                  messages: [
                    {
                      from: '923001234567',
                      id: `wamid.HBgL${Date.now()}TextMsg`,
                      timestamp: String(nowSeconds),
                      text: { body: 'Hello Rumi, I need a lesson plan for Grade 4 Science' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const wireResponse = await performRequest({
        method: 'POST',
        path: '/webhook',
        body: textMessagePayload
      });

      expect(wireResponse.statusCode).toBe(200);
      expect(wireResponse.body).toBe('EVENT_RECEIVED');

      recordedSnapshots.whatsappWebhookPostText = {
        request: {
          method: 'POST',
          path: '/webhook',
          samplePayload: textMessagePayload
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });

    it('returns 200 EVENT_RECEIVED for WhatsApp interactive button reply payload', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const buttonPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789012345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550100000',
                    phone_number_id: TEST_PHONE_NUMBER_ID
                  },
                  contacts: [
                    {
                      profile: { name: 'Amina Teacher' },
                      wa_id: '923001234567'
                    }
                  ],
                  messages: [
                    {
                      from: '923001234567',
                      id: `wamid.HBgL${Date.now()}ButtonReply`,
                      timestamp: String(nowSeconds),
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: {
                          id: 'coaching_confirm_session_abc123',
                          title: 'Yes, Start Reflection'
                        }
                      }
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const wireResponse = await performRequest({
        method: 'POST',
        path: '/webhook',
        body: buttonPayload
      });

      expect(wireResponse.statusCode).toBe(200);
      expect(wireResponse.body).toBe('EVENT_RECEIVED');

      recordedSnapshots.whatsappWebhookPostButton = {
        request: {
          method: 'POST',
          path: '/webhook',
          samplePayload: buttonPayload
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });
  });

  // 3. POST /api/slack (HMAC signature raw-body challenge)
  describe('3. POST /api/slack (HMAC signature raw-body challenge)', () => {
    function createSlackSignature(timestamp, rawBody, secret = TEST_SLACK_SIGNING_SECRET) {
      const base = `v0:${timestamp}:${rawBody}`;
      return 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
    }

    it('returns 200 with challenge object for valid HMAC-signed url_verification on /api/slack/events', async () => {
      const challengeCode = 'slack_test_challenge_token_8899aabbcc';
      const payloadObj = {
        token: 'slack_verification_token_dummy',
        challenge: challengeCode,
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = createSlackSignature(timestamp, rawBody);

      const wireResponse = await performRequest({
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': validSignature,
          'content-type': 'application/json'
        },
        body: rawBody
      });

      expect(wireResponse.statusCode).toBe(200);
      expect(wireResponse.body).toEqual({ challenge: challengeCode });

      recordedSnapshots.slackEventsChallengeValid = {
        request: {
          method: 'POST',
          path: '/api/slack/events',
          headers: {
            'x-slack-request-timestamp': String(timestamp),
            'x-slack-signature': '[HMAC-SHA256 signature]'
          },
          body: payloadObj
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });

    it('returns 401 Invalid signature when HMAC signature does not match on /api/slack/events', async () => {
      const payloadObj = {
        token: 'slack_verification_token_dummy',
        challenge: 'unauthorized_challenge_attempt',
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      // Generate signature with wrong secret
      const invalidSignature = createSlackSignature(timestamp, rawBody, 'completely_wrong_secret');

      const wireResponse = await performRequest({
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': invalidSignature,
          'content-type': 'application/json'
        },
        body: rawBody
      });

      expect(wireResponse.statusCode).toBe(401);
      expect(wireResponse.body).toBe('Invalid signature');

      recordedSnapshots.slackEventsChallengeInvalidSig = {
        request: {
          method: 'POST',
          path: '/api/slack/events',
          headers: {
            'x-slack-request-timestamp': String(timestamp),
            'x-slack-signature': '[Invalid HMAC-SHA256 signature]'
          },
          body: payloadObj
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });

    it('returns 404 when posting directly to /api/slack root (since handlers are mounted at /events, /interactions, /commands)', async () => {
      const payloadObj = {
        token: 'slack_token',
        challenge: 'root_challenge',
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = createSlackSignature(timestamp, rawBody);

      const wireResponse = await performRequest({
        method: 'POST',
        path: '/api/slack',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': validSignature,
          'content-type': 'application/json'
        },
        body: rawBody
      });

      expect(wireResponse.statusCode).toBe(404);

      recordedSnapshots.slackRootPostNotFound = {
        request: {
          method: 'POST',
          path: '/api/slack',
          body: payloadObj
        },
        response: {
          statusCode: wireResponse.statusCode,
          contentType: wireResponse.contentType,
          body: wireResponse.body
        }
      };
    });
  });
});
