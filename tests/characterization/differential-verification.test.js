/**
 * differential-verification.test.js
 *
 * Differential Verification Test Suite:
 * Compares the Legacy Monolith Ingress Baseline against the Refactored rumi-gateway
 * using synthetic traffic generated from real webhook event patterns.
 *
 * Asserts 100% wire parity and zero divergence across:
 *   1. Meta GET /webhook verification handshakes (8 permutations)
 *   2. Meta POST /webhook incoming WhatsApp messages & multi-language payloads (10 permutations)
 *   3. Meta POST /webhook delivery status receipts and structural edge cases (11 permutations)
 *   4. Slack POST /api/slack/* HMAC security, events, and interactivity (11 permutations)
 *
 * Total: 40 real-world synthetic test cases verified side-by-side with wire latency tracking.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const SNAPSHOT_FILE_PATH = path.resolve(__dirname, 'legacy-baseline-snapshot.json');
const REPORT_FILE_PATH = path.resolve(__dirname, 'differential-verification-report.json');

const TEST_VERIFY_TOKEN = 'test_meta_webhook_verify_token_123';
const TEST_SLACK_SIGNING_SECRET = 'test_slack_signing_secret_xyz789';
const TEST_PHONE_NUMBER_ID = '100000000000001';

process.env.WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SIGNING_SECRET;
process.env.PHONE_NUMBER_ID = TEST_PHONE_NUMBER_ID;
process.env.QUEUE_DRIVER = 'memory';
process.env.NODE_ENV = 'test';

// Safe in-memory mocks for legacy monolith dependencies
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

// Helper to compute Slack HMAC signatures
function computeSlackHmac(timestamp, rawBody, secret = TEST_SLACK_SIGNING_SECRET) {
  const base = `v0:${timestamp}:${rawBody}`;
  return 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
}

// Helper to generate Meta WhatsApp webhook payload wrapper
function createSyntheticWhatsAppPayload({
  messages = [],
  statuses = [],
  phoneNumberId = TEST_PHONE_NUMBER_ID,
  displayPhoneNumber = '15550100000',
  contactName = 'Amina Teacher',
  waId = '923001234567',
  entryId = '123456789012345',
  field = 'messages',
  object = 'whatsapp_business_account',
  overrideValue = null
} = {}) {
  const value = overrideValue || {
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: displayPhoneNumber,
      phone_number_id: phoneNumberId
    },
    ...(contactName ? { contacts: [{ profile: { name: contactName }, wa_id: waId }] } : {}),
    ...(messages.length ? { messages } : {}),
    ...(statuses.length ? { statuses } : {})
  };

  return {
    object,
    entry: [
      {
        id: entryId,
        changes: [
          {
            value,
            field
          }
        ]
      }
    ]
  };
}

describe('Differential Verification: Legacy Monolith vs Refactored Gateway', () => {
  let legacyServer;
  let gatewayServer;
  let legacyBaseUrl;
  let gatewayBaseUrl;
  let baselineSnapshot = {};

  const verificationResults = [];

  beforeAll((done) => {
    // Load historical baseline snapshot if available
    try {
      if (fs.existsSync(SNAPSHOT_FILE_PATH)) {
        baselineSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE_PATH, 'utf8'));
      }
    } catch (_) {
      baselineSnapshot = {};
    }

    // 1. Boot Target A: Legacy Monolith Ingress
    const { app: legacyApp } = require('../../bot/whatsapp-bot');
    legacyServer = http.createServer(legacyApp);

    // 2. Boot Target B: Standalone Refactored Gateway
    const { app: gatewayApp } = require('../../bot/gateway/server');
    gatewayServer = http.createServer(gatewayApp);

    legacyServer.listen(0, '127.0.0.1', () => {
      legacyBaseUrl = `http://127.0.0.1:${legacyServer.address().port}`;

      gatewayServer.listen(0, '127.0.0.1', () => {
        gatewayBaseUrl = `http://127.0.0.1:${gatewayServer.address().port}`;
        done();
      });
    });
  });

  afterAll((done) => {
    // Write differential verification report
    const matchedCount = verificationResults.filter(r => r.divergence === false).length;
    const totalCount = verificationResults.length;
    const parityRate = totalCount > 0 ? ((matchedCount / totalCount) * 100).toFixed(1) + '%' : '100.0%';

    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalSyntheticEvents: totalCount,
        matchedWireResponses: matchedCount,
        divergentResponses: totalCount - matchedCount,
        parityRate,
        zeroDivergenceConfirmed: matchedCount === totalCount
      },
      results: verificationResults
    };

    try {
      fs.writeFileSync(REPORT_FILE_PATH, JSON.stringify(reportData, null, 2), 'utf8');
    } catch (_) {}

    let closed = 0;
    const finish = () => {
      closed++;
      if (closed >= 2) done();
    };

    if (legacyServer && legacyServer.listening) {
      legacyServer.close(finish);
    } else {
      finish();
    }

    if (gatewayServer && gatewayServer.listening) {
      gatewayServer.close(finish);
    } else {
      finish();
    }
  });

  // Wire request executor with latency measurement
  async function performRequest(baseUrl, { method, path: requestPath, headers = {}, body = null }) {
    const targetUrl = `${baseUrl}${requestPath}`;
    const options = {
      method,
      headers: { ...headers }
    };

    if (body != null) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
      if (!options.headers['content-type'] && !options.headers['Content-Type'] && typeof body !== 'string') {
        options.headers['content-type'] = 'application/json';
      }
    }

    const start = process.hrtime.bigint();
    const response = await fetch(targetUrl, options);
    const textBody = await response.text();
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    let parsedBody = textBody;
    try {
      parsedBody = JSON.parse(textBody);
    } catch (_) {}

    return {
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') || '',
      body: parsedBody,
      latencyMs: Math.round(durationMs * 100) / 100
    };
  }

  // Core differential comparator
  async function runDifferentialCheck(testName, requestConfig, { snapshotKey = null, category = 'General' } = {}) {
    const legacyRes = await performRequest(legacyBaseUrl, requestConfig);
    const gatewayRes = await performRequest(gatewayBaseUrl, requestConfig);

    // Verify against historical baseline snapshot if requested
    if (snapshotKey && baselineSnapshot[snapshotKey]) {
      const snap = baselineSnapshot[snapshotKey].response;
      expect(gatewayRes.statusCode).toBe(snap.statusCode);
      if (typeof snap.body === 'object') {
        expect(gatewayRes.body).toEqual(snap.body);
      } else {
        expect(gatewayRes.body).toBe(snap.body);
      }
    }

    // 1. Status Code Parity
    expect(gatewayRes.statusCode).toBe(legacyRes.statusCode);

    // 2. Wire Body Parity
    if (typeof legacyRes.body === 'object') {
      expect(gatewayRes.body).toEqual(legacyRes.body);
    } else {
      expect(gatewayRes.body).toBe(legacyRes.body);
    }

    // 3. Content Type Consistency
    if (legacyRes.contentType.includes('application/json')) {
      expect(gatewayRes.contentType).toContain('application/json');
    }

    const isMatch = (gatewayRes.statusCode === legacyRes.statusCode) &&
      (JSON.stringify(gatewayRes.body) === JSON.stringify(legacyRes.body));

    verificationResults.push({
      testName,
      category,
      method: requestConfig.method,
      path: requestConfig.path,
      legacyStatusCode: legacyRes.statusCode,
      gatewayStatusCode: gatewayRes.statusCode,
      legacyLatencyMs: legacyRes.latencyMs,
      gatewayLatencyMs: gatewayRes.latencyMs,
      divergence: !isMatch,
      status: isMatch ? 'PARITY_VERIFIED' : 'DIVERGENCE_DETECTED'
    });
  }

  // =========================================================================
  // Group 1: Meta GET /webhook Verification Handshakes (8 Permutations)
  // =========================================================================
  describe('Group 1: Meta GET /webhook Verification Handshake Parity', () => {
    it('1.1 Standard alphanumeric verification challenge', async () => {
      const challenge = '1158201444_valid_meta_challenge';
      await runDifferentialCheck('Meta GET Standard Challenge', {
        method: 'GET',
        path: `/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=${encodeURIComponent(challenge)}`
      }, { snapshotKey: 'metaWebhookGetValid', category: 'Meta GET Handshake' });
    });

    it('1.2 UUID / hexadecimal verification challenge', async () => {
      const challenge = '4a7b9c1d-8f2e-4b3a-9c7d-1e5f8a0b2c4d';
      await runDifferentialCheck('Meta GET Hex UUID Challenge', {
        method: 'GET',
        path: `/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=${encodeURIComponent(challenge)}`
      }, { category: 'Meta GET Handshake' });
    });

    it('1.3 URL-safe symbols in verification challenge', async () => {
      const challenge = 'challenge-alpha_beta.gamma~12345';
      await runDifferentialCheck('Meta GET URL-Safe Symbols Challenge', {
        method: 'GET',
        path: `/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=${encodeURIComponent(challenge)}`
      }, { category: 'Meta GET Handshake' });
    });

    it('1.4 Unicode and international character challenge', async () => {
      const challenge = 'challenge_اردو_العربية_हिन्दी_✓';
      await runDifferentialCheck('Meta GET Unicode Challenge', {
        method: 'GET',
        path: `/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=${encodeURIComponent(challenge)}`
      }, { category: 'Meta GET Handshake' });
    });

    it('1.5 Mismatched verification token (403 Forbidden)', async () => {
      await runDifferentialCheck('Meta GET Mismatched Token', {
        method: 'GET',
        path: `/webhook?hub.mode=subscribe&hub.verify_token=completely_wrong_token&hub.challenge=999999`
      }, { snapshotKey: 'metaWebhookGetInvalid', category: 'Meta GET Handshake' });
    });

    it('1.6 Empty verification token (403 Forbidden)', async () => {
      await runDifferentialCheck('Meta GET Empty Token', {
        method: 'GET',
        path: `/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=empty_token_probe`
      }, { category: 'Meta GET Handshake' });
    });

    it('1.7 Missing hub.mode parameter (403 Forbidden)', async () => {
      await runDifferentialCheck('Meta GET Missing Mode', {
        method: 'GET',
        path: `/webhook?hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=missing_mode_probe`
      }, { category: 'Meta GET Handshake' });
    });

    it('1.8 Unrecognized hub.mode parameter (403 Forbidden)', async () => {
      await runDifferentialCheck('Meta GET Unrecognized Mode', {
        method: 'GET',
        path: `/webhook?hub.mode=unsubscribe&hub.verify_token=${encodeURIComponent(TEST_VERIFY_TOKEN)}&hub.challenge=wrong_mode_probe`
      }, { category: 'Meta GET Handshake' });
    });
  });

  // =========================================================================
  // Group 2: Meta POST /webhook Incoming WhatsApp Messages (10 Permutations)
  // =========================================================================
  describe('Group 2: Meta POST /webhook WhatsApp Incoming Message Parity', () => {
    it('2.1 Standard English text message from teacher', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}TextEng`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: 'Hello Rumi, I need a lesson plan for Grade 4 Science' },
          type: 'text'
        }]
      });

      await runDifferentialCheck('WhatsApp POST English Text', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { snapshotKey: 'whatsappWebhookPostText', category: 'WhatsApp Message' });
    });

    it('2.2 Urdu text message with Arabic script characters', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}TextUrdu`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: 'السلام علیکم، کیا آپ مجھے جماعت پنجم کے لیے سبق تیار کر کے دے سکتے ہیں؟' },
          type: 'text'
        }]
      });

      await runDifferentialCheck('WhatsApp POST Urdu Text', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.3 Arabic text message from Middle East / North Africa teacher', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}TextArabic`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: 'مرحبا بك يا رومي، أريد خطة درس نموذجية لمادة الرياضيات' },
          type: 'text'
        }]
      });

      await runDifferentialCheck('WhatsApp POST Arabic Text', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.4 Hindi text message in Devanagari script', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}TextHindi`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: 'नमस्ते रूमी, मुझे कक्षा 4 विज्ञान के लिए पाठ योजना चाहिए' },
          type: 'text'
        }]
      });

      await runDifferentialCheck('WhatsApp POST Hindi Text', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.5 Interactive button reply payload', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}BtnReply`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'interactive',
          interactive: {
            type: 'button_reply',
            button_reply: {
              id: 'coaching_confirm_session_abc123',
              title: 'Yes, Start Reflection'
            }
          }
        }]
      });

      await runDifferentialCheck('WhatsApp POST Button Reply', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { snapshotKey: 'whatsappWebhookPostButton', category: 'WhatsApp Message' });
    });

    it('2.6 Interactive list reply selection payload', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}ListReply`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'interactive',
          interactive: {
            type: 'list_reply',
            list_reply: {
              id: 'lp_shelf_grade4_science_ch1',
              title: 'Chapter 1: Plants',
              description: 'Primary science unit'
            }
          }
        }]
      });

      await runDifferentialCheck('WhatsApp POST List Reply', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.7 Voice note audio debrief attachment', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}AudioDebrief`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'audio',
          audio: {
            id: 'media_audio_debrief_778899',
            mime_type: 'audio/ogg; codecs=opus',
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
          }
        }]
      });

      await runDifferentialCheck('WhatsApp POST Audio Voice Note', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.8 Classroom worksheet photo attachment', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}ImageWorksheet`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'image',
          image: {
            id: 'media_img_worksheet_334455',
            mime_type: 'image/jpeg',
            sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
            caption: 'Grade 4 exam worksheet paper'
          }
        }]
      });

      await runDifferentialCheck('WhatsApp POST Image Worksheet', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.9 School location pin sharing payload', async () => {
      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}LocationPin`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'location',
          location: {
            latitude: 31.5204,
            longitude: 74.3587,
            name: 'Government Primary School',
            address: 'Model Town, Lahore, Pakistan'
          }
        }]
      });

      await runDifferentialCheck('WhatsApp POST Location Pin', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });

    it('2.10 WhatsApp Flow completion (NFM_REPLY submission)', async () => {
      const flowResponse = {
        flow_token: 'flow_token_attendance_marking_2026',
        selected_date: '2026-09-29',
        present_students: ['stud_001', 'stud_002', 'stud_005']
      };

      const payload = createSyntheticWhatsAppPayload({
        messages: [{
          from: '923001234567',
          id: `wamid.HBgL${Date.now()}FlowNfmReply`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              name: 'flow_response',
              response_json: JSON.stringify(flowResponse)
            }
          }
        }]
      });

      await runDifferentialCheck('WhatsApp POST Flow NFM Reply', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Message' });
    });
  });

  // =========================================================================
  // Group 3: WhatsApp Delivery Status Receipts & Edge Cases (11 Permutations)
  // =========================================================================
  describe('Group 3: WhatsApp Status Receipts & Structural Edge Case Parity', () => {
    it('3.1 Message status update: delivered receipt', async () => {
      const payload = createSyntheticWhatsAppPayload({
        statuses: [{
          id: `wamid.HBgL${Date.now()}StatDelivered`,
          status: 'delivered',
          timestamp: String(Math.floor(Date.now() / 1000)),
          recipient_id: '923001234567',
          conversation: { id: 'conv_123', origin: { type: 'user_initiated' } }
        }]
      });

      await runDifferentialCheck('WhatsApp Status Delivered', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Delivery & Receipts' });
    });

    it('3.2 Message status update: read receipt', async () => {
      const payload = createSyntheticWhatsAppPayload({
        statuses: [{
          id: `wamid.HBgL${Date.now()}StatRead`,
          status: 'read',
          timestamp: String(Math.floor(Date.now() / 1000)),
          recipient_id: '923001234567'
        }]
      });

      await runDifferentialCheck('WhatsApp Status Read', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Delivery & Receipts' });
    });

    it('3.3 Message status update: sent receipt', async () => {
      const payload = createSyntheticWhatsAppPayload({
        statuses: [{
          id: `wamid.HBgL${Date.now()}StatSent`,
          status: 'sent',
          timestamp: String(Math.floor(Date.now() / 1000)),
          recipient_id: '923001234567'
        }]
      });

      await runDifferentialCheck('WhatsApp Status Sent', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Delivery & Receipts' });
    });

    it('3.4 Message status update: failed delivery with error code', async () => {
      const payload = createSyntheticWhatsAppPayload({
        statuses: [{
          id: `wamid.HBgL${Date.now()}StatFailed`,
          status: 'failed',
          timestamp: String(Math.floor(Date.now() / 1000)),
          recipient_id: '923001234567',
          errors: [{ code: 131026, title: 'Message Undeliverable', message: 'User phone out of coverage' }]
        }]
      });

      await runDifferentialCheck('WhatsApp Status Failed', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Delivery & Receipts' });
    });

    it('3.5 Multi-message batch: multiple incoming messages in single change', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = createSyntheticWhatsAppPayload({
        messages: [
          { from: '923001234567', id: `wamid.Multi1_${now}`, timestamp: String(now), text: { body: 'Message 1' }, type: 'text' },
          { from: '923009876543', id: `wamid.Multi2_${now}`, timestamp: String(now + 1), text: { body: 'Message 2' }, type: 'text' }
        ]
      });

      await runDifferentialCheck('WhatsApp Batch Multi-Message', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });

    it('3.6 Empty messages array in changes payload', async () => {
      const payload = createSyntheticWhatsAppPayload({
        overrideValue: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550100000', phone_number_id: TEST_PHONE_NUMBER_ID },
          messages: []
        }
      });

      await runDifferentialCheck('WhatsApp Empty Messages Array', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });

    it('3.7 Empty changes array in entry', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{ id: '123456789012345', changes: [] }]
      };

      await runDifferentialCheck('WhatsApp Empty Changes Array', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });

    it('3.8 Empty entry array in webhook root', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: []
      };

      await runDifferentialCheck('WhatsApp Empty Entry Array', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });

    it('3.9 Test webhook entry (Meta Developer Portal ping id: "0")', async () => {
      const payload = createSyntheticWhatsAppPayload({
        entryId: '0',
        messages: [{
          from: '1234567890',
          id: `wamid.TestWebhook_${Date.now()}`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: 'Test webhook from Meta developer console' },
          type: 'text'
        }]
      });

      await runDifferentialCheck('WhatsApp Developer Test Webhook', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });

    it('3.10 Foreign phone number ID (cross-WABA multi-tenant filtering)', async () => {
      const payload = createSyntheticWhatsAppPayload({
        phoneNumberId: '999999999999999_foreign_number',
        messages: [{
          from: '923001234567',
          id: `wamid.Foreign_${Date.now()}`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          text: { body: 'Message to different WABA phone number' },
          type: 'text'
        }]
      });

      await runDifferentialCheck('WhatsApp Foreign Phone ID', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });

    it('3.11 Non-WhatsApp object type in payload root', async () => {
      const payload = {
        object: 'instagram_messaging',
        entry: [{ id: 'insta_123', changes: [] }]
      };

      await runDifferentialCheck('WhatsApp Non-WhatsApp Object', {
        method: 'POST',
        path: '/webhook',
        body: payload
      }, { category: 'WhatsApp Edge Cases' });
    });
  });

  // =========================================================================
  // Group 4: Slack POST Ingress & HMAC Security Parity (11 Permutations)
  // =========================================================================
  describe('Group 4: Slack POST Ingress & HMAC Security Verification Parity', () => {
    it('4.1 Valid HMAC url_verification challenge on /api/slack/events', async () => {
      const challengeToken = 'slack_test_challenge_token_8899aabbcc';
      const payloadObj = {
        token: 'slack_verification_token_dummy',
        challenge: challengeToken,
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Events Challenge Valid', {
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { snapshotKey: 'slackEventsChallengeValid', category: 'Slack Ingress' });
    });

    it('4.2 High-entropy 64-character challenge on /api/slack/events', async () => {
      const hexChallenge = crypto.randomBytes(32).toString('hex');
      const payloadObj = {
        token: 'slack_token_entropy',
        challenge: hexChallenge,
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Events High-Entropy Challenge', {
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { category: 'Slack Ingress' });
    });

    it('4.3 Plain message event callback with valid HMAC signature', async () => {
      const payloadObj = {
        token: 'slack_token_msg',
        team_id: 'T12345678',
        api_app_id: 'A12345678',
        event_id: `Ev_${Date.now()}_msg`,
        event_time: Math.floor(Date.now() / 1000),
        type: 'event_callback',
        event: {
          type: 'message',
          channel: 'C12345678',
          user: 'U98765432',
          text: 'Hello Rumi from Slack workspace teacher',
          ts: '1706400000.000100'
        }
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Events Plain Message', {
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { category: 'Slack Ingress' });
    });

    it('4.4 App mention event callback with valid HMAC signature', async () => {
      const payloadObj = {
        token: 'slack_token_mention',
        team_id: 'T12345678',
        api_app_id: 'A12345678',
        event_id: `Ev_${Date.now()}_mention`,
        event_time: Math.floor(Date.now() / 1000),
        type: 'event_callback',
        event: {
          type: 'app_mention',
          channel: 'C12345678',
          user: 'U98765432',
          text: '<@U_BOT_RUMI> explain phonics assessment guidelines',
          ts: '1706400005.000200'
        }
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Events App Mention', {
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { category: 'Slack Ingress' });
    });

    it('4.5 Mismatched / tampered HMAC signature (401 Invalid signature)', async () => {
      const payloadObj = {
        token: 'slack_token',
        challenge: 'unauthorized_probe',
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = computeSlackHmac(timestamp, rawBody, 'completely_wrong_secret_key');

      await runDifferentialCheck('Slack Invalid HMAC Signature', {
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': invalidSignature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { snapshotKey: 'slackEventsChallengeInvalidSig', category: 'Slack Security' });
    });

    it('4.6 Stale timestamp older than 300 seconds (401 Invalid signature)', async () => {
      const payloadObj = {
        token: 'slack_token',
        challenge: 'replay_attack_probe',
        type: 'url_verification'
      };
      const rawBody = JSON.stringify(payloadObj);
      // 10 minutes ago
      const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
      const signature = computeSlackHmac(staleTimestamp, rawBody);

      await runDifferentialCheck('Slack Stale Timestamp Replay', {
        method: 'POST',
        path: '/api/slack/events',
        headers: {
          'x-slack-request-timestamp': String(staleTimestamp),
          'x-slack-signature': signature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { category: 'Slack Security' });
    });

    it('4.7 Interactivity block_actions button click payload', async () => {
      const actionPayload = {
        type: 'block_actions',
        user: { id: 'U98765432', name: 'teacher_jane' },
        actions: [{ type: 'button', value: 'coaching_start_reflection', text: { text: 'Start Debrief' } }],
        trigger_id: 'trigger_12345'
      };
      const formParams = new URLSearchParams({ payload: JSON.stringify(actionPayload) });
      const rawBody = formParams.toString();
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Interactivity Block Actions', {
        method: 'POST',
        path: '/api/slack/interactions',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: rawBody
      }, { category: 'Slack Ingress' });
    });

    it('4.8 Interactivity view_submission modal form submission', async () => {
      const viewSubmissionPayload = {
        type: 'view_submission',
        user: { id: 'U98765432', name: 'teacher_jane' },
        view: {
          id: 'V12345',
          callback_id: 'attendance_marking_modal',
          state: { values: {} }
        }
      };
      const formParams = new URLSearchParams({ payload: JSON.stringify(viewSubmissionPayload) });
      const rawBody = formParams.toString();
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Interactivity View Submission', {
        method: 'POST',
        path: '/api/slack/interactions',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: rawBody
      }, { category: 'Slack Ingress' });
    });

    it('4.9 Slash command /rumi quiz on /api/slack/commands', async () => {
      const formParams = new URLSearchParams({
        command: '/rumi',
        text: 'quiz grade 4 science',
        user_id: 'U98765432',
        channel_id: 'C12345678'
      });
      const rawBody = formParams.toString();
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack Slash Command Form Body', {
        method: 'POST',
        path: '/api/slack/commands',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: rawBody
      }, { category: 'Slack Ingress' });
    });

    it('4.10 POST /api/slack unmounted root path (404 Not Found)', async () => {
      const payloadObj = { token: 'slack_token', challenge: 'root_challenge', type: 'url_verification' };
      const rawBody = JSON.stringify(payloadObj);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = computeSlackHmac(timestamp, rawBody);

      await runDifferentialCheck('Slack POST Root Unmounted', {
        method: 'POST',
        path: '/api/slack',
        headers: {
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature,
          'content-type': 'application/json'
        },
        body: rawBody
      }, { snapshotKey: 'slackRootPostNotFound', category: 'Slack Routing' });
    });

    it('4.11 GET /api/slack unmounted root path (404 Not Found)', async () => {
      await runDifferentialCheck('Slack GET Root Unmounted', {
        method: 'GET',
        path: '/api/slack'
      }, { category: 'Slack Routing' });
    });
  });
});
