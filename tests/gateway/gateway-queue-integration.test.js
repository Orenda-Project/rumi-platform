/**
 * Gateway Queue-and-Ack Integration Tests (Phase 2)
 *
 * Verifies end-to-end asynchronous ingestion requirements:
 * 1. Fast HTTP 200 acknowledgment (< 100ms) on POST /webhook and POST /api/slack/events
 * 2. Inbound payload normalization to canonical InboundMessageEnvelope
 * 3. Enqueueing to QUEUE_DRIVER (MemoryQueueService)
 * 4. InboundMessageWorker consumer processing, domain handler dispatching, and SQS worker bridge
 * 5. Redis/Session duplicate message suppression (SessionService.isProcessed)
 * 6. Immediate WhatsApp reaction and typing indicator
 * 7. End-to-end correlation ID propagation
 */

delete process.env.REDIS_URL;

const http = require('http');
const crypto = require('crypto');
const express = require('express');

const memoryQueue = require('../../bot/shared/services/queue/memory-queue.service');
const { IngressDispatcher } = require('../../bot/gateway/ingress-dispatcher');
const { createInboundEnvelope, ENVELOPE_TYPES } = require('../../bot/gateway/envelope');
const { createWebhookRoutes } = require('../../bot/gateway/webhook.routes');
const InboundMessageWorker = require('../../bot/workers/inbound-message.worker');
const SessionService = require('../../bot/shared/services/session.service');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const { runWithCorrelation, getCurrentCorrelationId } = require('../../bot/shared/utils/structured-logger');

// Mock SessionService directly to isolate message deduplication without touching Redis
const mockProcessedSet = new Set();
jest.mock('../../bot/shared/services/session.service', () => ({
  isProcessed: jest.fn().mockImplementation((id) => Promise.resolve(mockProcessedSet.has(id))),
  markAsProcessed: jest.fn().mockImplementation((id) => { mockProcessedSet.add(id); return Promise.resolve(true); }),
  getReactionEmoji: jest.fn().mockReturnValue('👋'),
}));

// Mock WhatsAppService reaction and typing indicator
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendReaction: jest.fn().mockResolvedValue({ success: true }),
  showTypingIndicator: jest.fn().mockResolvedValue({ success: true }),
  sendMessage: jest.fn().mockResolvedValue({ success: true }),
}));

const TEST_SLACK_SECRET = 'test_slack_signing_secret_queue_int_789';
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;
process.env.WEBHOOK_VERIFY_TOKEN = 'test_meta_verify_token_queue_int';

function computeSlackSignature(timestamp, rawBody, secret = TEST_SLACK_SECRET) {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('Gateway Queue-and-Ack Integration (Phase 2)', () => {
  let server;
  let serverUrl;
  let dispatcher;

  beforeAll(async () => {
    const app = express();
    dispatcher = new IngressDispatcher();

    dispatcher.setQueueProducer(async (envelope) => {
      return await memoryQueue.queueJob(
        envelope.from || envelope.id,
        'inbound_message',
        envelope,
        { deduplicationId: envelope.id }
      );
    });

    app.use(createWebhookRoutes(dispatcher));

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Warm-up JIT and express routing to eliminate parallel cold-start jitter
    await fetch(`${serverUrl}/webhook`).catch(() => {});
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    memoryQueue.clear();
    mockProcessedSet.clear();
    if (SessionService.processedMessages) SessionService.processedMessages.clear();
    jest.clearAllMocks();
    InboundMessageWorker.setHandler(null);
  });

  describe('1. Fast Ingestion Acknowledgment (< 100ms Ack)', () => {
    it('POST /webhook acknowledges WhatsApp message with HTTP 200 in < 100ms', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1234567890',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '100000000000001' },
              contacts: [{ wa_id: '923001234567' }],
              messages: [{
                id: 'wamid.perf_test_001',
                from: '923001234567',
                timestamp: '1790561399',
                type: 'text',
                text: { body: 'Rapid ack test' }
              }]
            }
          }]
        }]
      };

      const startTime = Date.now();
      const response = await fetch(`${serverUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const durationMs = Date.now() - startTime;

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('EVENT_RECEIVED');
      expect(durationMs).toBeLessThan(100);

      // Verify arrived in queue
      expect(memoryQueue.size('main')).toBe(1);
    });

    it('POST /api/slack/events acknowledges Slack event with HTTP 200 in < 100ms', async () => {
      const bodyPayload = JSON.stringify({
        type: 'url_verification',
        challenge: 'slack_perf_challenge_999'
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeSlackSignature(timestamp, bodyPayload);

      const startTime = Date.now();
      const response = await fetch(`${serverUrl}/api/slack/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature
        },
        body: bodyPayload
      });
      const durationMs = Date.now() - startTime;

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ challenge: 'slack_perf_challenge_999' });
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('2. Canonical InboundMessageEnvelope Normalization', () => {
    it('normalizes WhatsApp text message into canonical envelope with correlation ID and metadata', async () => {
      const messageId = 'wamid.norm_text_001';
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1234567890',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '100000000000001' },
              contacts: [{ wa_id: '923001234567' }],
              messages: [{
                id: messageId,
                from: '923001234567',
                timestamp: '1790561399',
                type: 'text',
                text: { body: 'Hello normalized universe' }
              }]
            }
          }]
        }]
      };

      const response = await fetch(`${serverUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const jobs = await memoryQueue.receiveJobs(1);
      expect(jobs).toHaveLength(1);

      const envelope = jobs[0].body.payload;
      expect(envelope.id).toBe(messageId);
      expect(envelope.channel).toBe('whatsapp');
      expect(envelope.from).toBe('923001234567');
      expect(envelope.type).toBe(ENVELOPE_TYPES.TEXT);
      expect(envelope.payload.text).toBe('Hello normalized universe');
      expect(envelope.metadata.phoneNumberId).toBe('100000000000001');
      expect(typeof envelope.metadata.correlationId).toBe('string');
      expect(envelope.rawBody).toBeDefined();
    });

    it('normalizes WhatsApp interactive button reply into canonical envelope', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1234567890',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '100000000000001' },
              messages: [{
                id: 'wamid.btn_reply_001',
                from: '923001234567',
                timestamp: '1790561399',
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: {
                    id: 'confirm_session_abc',
                    title: 'Yes, Confirm'
                  }
                }
              }]
            }
          }]
        }]
      };

      const response = await fetch(`${serverUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const jobs = await memoryQueue.receiveJobs(1);
      expect(jobs).toHaveLength(1);

      const envelope = jobs[0].body.payload;
      expect(envelope.type).toBe(ENVELOPE_TYPES.INTERACTIVE_BUTTON);
      expect(envelope.payload.actionId).toBe('confirm_session_abc');
      expect(envelope.payload.text).toBe('Yes, Confirm');
    });

    it('normalizes WhatsApp status update into status_update envelope', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1234567890',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              statuses: [{
                id: 'wamid.status_update_001',
                status: 'delivered',
                timestamp: '1790561400',
                recipient_id: '923001234567'
              }]
            }
          }]
        }]
      };

      const response = await fetch(`${serverUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      const jobs = await memoryQueue.receiveJobs(1);
      expect(jobs).toHaveLength(1);

      const envelope = jobs[0].body.payload;
      expect(envelope.type).toBe(ENVELOPE_TYPES.STATUS_UPDATE);
      expect(envelope.payload.status).toBe('delivered');
      expect(envelope.from).toBe('923001234567');
    });
  });

  describe('3. Queue Enqueueing to Pluggable Memory Driver', () => {
    it('enqueues job into memory queue with correct v2 envelope structure and metrics', async () => {
      expect(memoryQueue.size('main')).toBe(0);

      const envelope = createInboundEnvelope({
        id: 'msg_queue_test_001',
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Enqueued message' },
        metadata: { correlationId: 'corr-queue-001' }
      });

      const jobId = await memoryQueue.queueJob(
        envelope.from || envelope.id,
        'inbound_message',
        envelope,
        { deduplicationId: envelope.id }
      );

      expect(jobId).toBeDefined();
      expect(memoryQueue.size('main')).toBe(1);

      const metrics = await memoryQueue.getQueueMetrics();
      expect(metrics.messagesAvailable).toBe(1);
      expect(metrics.messagesInFlight).toBe(0);
      expect(metrics.totalDepth).toBe(1);
    });

    it('receives enqueued jobs via receiveJobs with receiptHandle', async () => {
      const envelope = createInboundEnvelope({
        id: 'msg_pull_test_002',
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Pull test' }
      });

      await memoryQueue.queueJob(envelope.from, 'inbound_message', envelope, {
        deduplicationId: envelope.id
      });

      const jobs = await memoryQueue.receiveJobs(5);
      expect(jobs.length).toBe(1);
      expect(jobs[0].messageId).toBeDefined();
      expect(jobs[0].receiptHandle).toBeDefined();
      expect(jobs[0].body.jobType).toBe('inbound_message');
      expect(jobs[0].body.payload.id).toBe('msg_pull_test_002');

      await memoryQueue.completeJob(jobs[0].receiptHandle);
      expect(memoryQueue.size('main')).toBe(0);
    });
  });

  describe('4. InboundMessageWorker Consumer', () => {
    it('processes envelope, marks as processed, and invokes domain handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ handled: true });
      InboundMessageWorker.setHandler(mockHandler);

      const testMsgId = `unique-msg-${Date.now()}`;
      const envelope = createInboundEnvelope({
        id: testMsgId,
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Coaching question' },
        metadata: { correlationId: 'corr-worker-1' }
      });

      const result = await InboundMessageWorker.process(envelope);
      expect(result).toEqual({ success: true });

      expect(mockHandler).toHaveBeenCalledTimes(1);
      const [req, res] = mockHandler.mock.calls[0];
      expect(req.__skipDuplicateCheck).toBe(true);
      expect(req.body.entry[0].changes[0].value.messages[0].id).toBe(testMsgId);

      const isProcessed = await SessionService.isProcessed(testMsgId);
      expect(isProcessed).toBe(true);
    });

    it('suppresses duplicate delivery using SessionService.isProcessed', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ handled: true });
      InboundMessageWorker.setHandler(mockHandler);

      const duplicateMsgId = `duplicate-msg-${Date.now()}`;
      const envelope = createInboundEnvelope({
        id: duplicateMsgId,
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'First delivery' }
      });

      const result1 = await InboundMessageWorker.process(envelope);
      expect(result1).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledTimes(1);

      const result2 = await InboundMessageWorker.process(envelope);
      expect(result2).toEqual({ duplicate: true });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('sends immediate reaction and typing indicator for WhatsApp messages', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ handled: true });
      InboundMessageWorker.setHandler(mockHandler);

      const msgId = `reaction-msg-${Date.now()}`;
      const envelope = createInboundEnvelope({
        id: msgId,
        channel: 'whatsapp',
        from: '923009998877',
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Check feedback' }
      });

      await InboundMessageWorker.process(envelope);

      expect(WhatsAppService.sendReaction).toHaveBeenCalledWith('923009998877', msgId, expect.any(String));
      expect(WhatsAppService.showTypingIndicator).toHaveBeenCalledWith('923009998877', msgId);
    });

    it('handles interactive button envelope and constructs proper Meta structure', async () => {
      let receivedReq = null;
      InboundMessageWorker.setHandler((req, res) => {
        receivedReq = req;
        return Promise.resolve();
      });

      const btnMsgId = `btn-msg-${Date.now()}`;
      const envelope = createInboundEnvelope({
        id: btnMsgId,
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.INTERACTIVE_BUTTON,
        payload: { actionId: 'coaching_confirm_session_123', title: 'Yes' }
      });

      await InboundMessageWorker.process(envelope);

      expect(receivedReq).toBeDefined();
      const msg = receivedReq.body.entry[0].changes[0].value.messages[0];
      expect(msg.type).toBe('interactive');
      expect(msg.interactive.type).toBe('button_reply');
      expect(msg.interactive.button_reply.id).toBe('coaching_confirm_session_123');
    });

    it('does not send reaction emoji or typing indicator for status_update envelopes', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ handled: true });
      InboundMessageWorker.setHandler(mockHandler);

      const statusEnvelope = createInboundEnvelope({
        id: 'wamid.OUT_STATUS_001',
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.STATUS_UPDATE,
        payload: { status: 'delivered' }
      });

      await InboundMessageWorker.process(statusEnvelope);

      expect(WhatsAppService.sendReaction).not.toHaveBeenCalled();
      expect(WhatsAppService.showTypingIndicator).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('allows successive status updates (delivered then read) for the same message ID without dropping', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ handled: true });
      InboundMessageWorker.setHandler(mockHandler);

      const messageId = `wamid.OUT_${Date.now()}`;
      const deliveredEnvelope = createInboundEnvelope({
        id: messageId,
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.STATUS_UPDATE,
        payload: { status: 'delivered' }
      });

      const readEnvelope = createInboundEnvelope({
        id: messageId,
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.STATUS_UPDATE,
        payload: { status: 'read' }
      });

      const resDelivered = await InboundMessageWorker.process(deliveredEnvelope);
      expect(resDelivered).toEqual({ success: true });

      const resRead = await InboundMessageWorker.process(readEnvelope);
      expect(resRead).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledTimes(2);

      // Re-delivery of the same status should be suppressed
      const resReadDuplicate = await InboundMessageWorker.process(readEnvelope);
      expect(resReadDuplicate).toEqual({ duplicate: true });
      expect(mockHandler).toHaveBeenCalledTimes(2);
    });

    it('reconstructs interactive_flow envelopes preserving flowName and flowData JSON payload', async () => {
      let receivedReq = null;
      InboundMessageWorker.setHandler((req, res) => {
        receivedReq = req;
        return Promise.resolve();
      });

      const flowEnvelope = createInboundEnvelope({
        id: `flow-msg-${Date.now()}`,
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.INTERACTIVE_FLOW,
        payload: {
          flowName: 'coaching_feedback_flow',
          flowData: { quality: 5, comments: 'Helpful prompt' }
        }
      });

      await InboundMessageWorker.process(flowEnvelope);

      expect(receivedReq).toBeDefined();
      const msg = receivedReq.body.entry[0].changes[0].value.messages[0];
      expect(msg.type).toBe('interactive');
      expect(msg.interactive.type).toBe('nfm_reply');
      expect(msg.interactive.nfm_reply.name).toBe('coaching_feedback_flow');
      expect(JSON.parse(msg.interactive.nfm_reply.response_json)).toEqual({
        quality: 5,
        comments: 'Helpful prompt'
      });
    });
  });

  describe('5. SQS Worker Integration Bridge', () => {
    it('dispatches inbound_message job through InboundMessageWorker', async () => {
      const { SQSCoachingWorker } = require('../../bot/workers/sqs-worker');
      const worker = new SQSCoachingWorker();

      const mockProcess = jest.spyOn(InboundMessageWorker, 'process').mockResolvedValue({ success: true });

      const envelope = createInboundEnvelope({
        id: 'msg-sqs-worker-1',
        channel: 'whatsapp',
        from: '923001234567',
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Testing worker bridge' }
      });

      await worker.executeJob(
        '923001234567',
        'inbound_message',
        envelope,
        'main:msg-1:token-1',
        'main',
        { payload: envelope, jobType: 'inbound_message' }
      );

      expect(mockProcess).toHaveBeenCalledWith(envelope, expect.objectContaining({
        sessionId: '923001234567',
        receiptHandle: 'main:msg-1:token-1',
        sourceQueue: 'main'
      }));

      mockProcess.mockRestore();
    });
  });

  describe('6. Correlation ID Propagation', () => {
    it('propagates correlation ID end-to-end through queue and worker execution context', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1234567890',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '100000000000001' },
              messages: [{
                id: 'wamid.corr_test_001',
                from: '923001234567',
                timestamp: '1790561399',
                type: 'text',
                text: { body: 'Trace check' }
              }]
            }
          }]
        }]
      };

      const response = await fetch(`${serverUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);

      const jobs = await memoryQueue.receiveJobs(1);
      expect(jobs).toHaveLength(1);
      const enqueuedJob = jobs[0];

      const activeCorrelationId = enqueuedJob.body.correlationId;
      expect(typeof activeCorrelationId).toBe('string');
      expect(activeCorrelationId.length).toBeGreaterThan(0);
      expect(enqueuedJob.body.payload.metadata.correlationId).toBe(activeCorrelationId);

      let workerSeenCorrelationId = null;
      await runWithCorrelation(enqueuedJob.body.correlationId, async () => {
        workerSeenCorrelationId = getCurrentCorrelationId();
      });

      expect(workerSeenCorrelationId).toBe(activeCorrelationId);
      await memoryQueue.completeJob(enqueuedJob.receiptHandle);
    });
  });

  describe('7. Edge Cases and Resilience', () => {
    it('handles queue producer failure gracefully without crashing the server', async () => {
      const failingDispatcher = new IngressDispatcher();
      failingDispatcher.setQueueProducer(async () => {
        throw new Error('Simulated queue driver connection error');
      });

      const failApp = express();
      failApp.use(createWebhookRoutes(failingDispatcher));

      const failServer = http.createServer(failApp);
      await new Promise((resolve) => failServer.listen(0, '127.0.0.1', resolve));
      const failPort = failServer.address().port;

      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '1234567890',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              messages: [{
                id: 'wamid.fail_test_001',
                from: '923001234567',
                timestamp: '1790561399',
                type: 'text',
                text: { body: 'Trigger failure' }
              }]
            }
          }]
        }]
      };

      const response = await fetch(`http://127.0.0.1:${failPort}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect([200, 500]).toContain(response.status);

      await new Promise((resolve) => failServer.close(resolve));
    });
  });
});
