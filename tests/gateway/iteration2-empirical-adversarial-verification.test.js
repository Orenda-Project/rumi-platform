/**
 * Iteration 2 Empirical Adversarial Verification Test Suite
 * Challenger 1 (Iteration 2)
 *
 * Verifies the defect fixes against adversarial stress tests:
 * 1. Queue error injection triggers HTTP 500 QUEUE_ERROR instead of 200.
 * 2. Slack messages process through InboundMessageWorker with PHONE_NUMBER_ID set.
 * 3. Concurrency bursts and duplicate message floods under updated post-handler markAsProcessed.
 */

delete process.env.REDIS_URL;
process.env.QUEUE_DRIVER = 'memory';
process.env.WEBHOOK_VERIFY_TOKEN = 'adversarial_iter2_token';
const TEST_SLACK_SECRET = 'adversarial_iter2_slack_secret';
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { performance } = require('perf_hooks');

const memoryQueue = require('../../bot/shared/services/queue/memory-queue.service');
const { IngressDispatcher } = require('../../bot/gateway/ingress-dispatcher');
const { createWebhookRoutes } = require('../../bot/gateway/webhook.routes');
const { createInboundEnvelope, ENVELOPE_TYPES } = require('../../bot/gateway/envelope');
const InboundMessageWorker = require('../../bot/workers/inbound-message.worker');
const SessionService = require('../../bot/shared/services/session.service');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const gatewayServerModule = require('../../bot/gateway/server');
const validators = require('../../bot/shared/utils/validators');

jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendReaction: jest.fn().mockResolvedValue({ success: true }),
  showTypingIndicator: jest.fn().mockResolvedValue({ success: true }),
  sendMessage: jest.fn().mockResolvedValue({ success: true }),
}));

function computeSlackSignature(timestamp, rawBody, secret = TEST_SLACK_SECRET) {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

function generateWhatsAppPayload(messageId, textBody = 'Iter2 burst message', phoneNumberId = 'PHONE_TEST_123', senderPhone = '923001234567') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '1234567890',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: phoneNumberId
          },
          contacts: [{ profile: { name: 'Adversarial Tester' }, wa_id: senderPhone }],
          messages: [{
            id: messageId,
            from: senderPhone,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: textBody }
          }]
        }
      }]
    }]
  };
}

describe('Iteration 2 Empirical Adversarial Verification', () => {
  let server;
  let serverUrl;
  let port;

  beforeAll(async () => {
    process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;
    process.env.PHONE_NUMBER_ID = 'PROD_PHONE_NUMBER_ID_888';

    await new Promise((resolve) => {
      server = http.createServer(gatewayServerModule.app);
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    memoryQueue.clear();
    SessionService.processedMessages.clear();
    jest.clearAllMocks();
    InboundMessageWorker.setHandler(null);
    process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;
    process.env.PHONE_NUMBER_ID = 'PROD_PHONE_NUMBER_ID_888';
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Queue Error Injection: Triggers HTTP 500 QUEUE_ERROR instead of 200
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Queue Error Injection Verification', () => {
    it('synchronous queue exception triggers HTTP 500 QUEUE_ERROR (never 200)', async () => {
      const failingDispatcher = new IngressDispatcher();
      let queueErrorInvoked = false;

      failingDispatcher.setQueueProducer(() => {
        queueErrorInvoked = true;
        throw new Error('SIMULATED_SYNC_QUEUE_DOWN: AWS SQS connection refused');
      });

      const app = express();
      app.use(createWebhookRoutes(failingDispatcher));
      const testServer = http.createServer(app);
      await new Promise(r => testServer.listen(0, '127.0.0.1', r));
      const p = testServer.address().port;

      const res = await fetch(`http://127.0.0.1:${p}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateWhatsAppPayload('wamid.sync_err_1', 'Sync fail'))
      });

      expect(queueErrorInvoked).toBe(true);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe('QUEUE_ERROR');
      expect(memoryQueue.size('main')).toBe(0);

      await new Promise(r => testServer.close(r));
    });

    it('asynchronous queue rejection triggers HTTP 500 QUEUE_ERROR (never 200)', async () => {
      const failingDispatcher = new IngressDispatcher();
      let asyncErrorInvoked = false;

      failingDispatcher.setQueueProducer(async () => {
        await new Promise(r => setTimeout(r, 10));
        asyncErrorInvoked = true;
        throw new Error('SIMULATED_ASYNC_QUEUE_REJECT: SQS SendMessage timed out');
      });

      const app = express();
      app.use(createWebhookRoutes(failingDispatcher));
      const testServer = http.createServer(app);
      await new Promise(r => testServer.listen(0, '127.0.0.1', r));
      const p = testServer.address().port;

      const res = await fetch(`http://127.0.0.1:${p}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateWhatsAppPayload('wamid.async_err_1', 'Async fail'))
      });

      expect(asyncErrorInvoked).toBe(true);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toBe('QUEUE_ERROR');
      expect(memoryQueue.size('main')).toBe(0);

      await new Promise(r => testServer.close(r));
    });

    it('recovers immediately after queue outage and accepts subsequent messages with HTTP 200', async () => {
      let isOutage = true;
      const recoverableDispatcher = new IngressDispatcher();

      recoverableDispatcher.setQueueProducer(async (envelope) => {
        if (isOutage) {
          throw new Error('TEMPORARY_NETWORK_PARTITION');
        }
        return await memoryQueue.queueJob(envelope.from, 'inbound_message', envelope);
      });

      const app = express();
      app.use(createWebhookRoutes(recoverableDispatcher));
      const testServer = http.createServer(app);
      await new Promise(r => testServer.listen(0, '127.0.0.1', r));
      const p = testServer.address().port;

      // 1. Under outage -> 500
      const resFail = await fetch(`http://127.0.0.1:${p}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateWhatsAppPayload('wamid.part_1', 'Fail during outage'))
      });
      expect(resFail.status).toBe(500);
      expect(await resFail.text()).toBe('QUEUE_ERROR');
      expect(memoryQueue.size('main')).toBe(0);

      // 2. Outage resolved -> 200
      isOutage = false;
      const resSuccess = await fetch(`http://127.0.0.1:${p}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateWhatsAppPayload('wamid.part_2', 'Success after outage'))
      });
      expect(resSuccess.status).toBe(200);
      expect(await resSuccess.text()).toBe('EVENT_RECEIVED');
      expect(memoryQueue.size('main')).toBe(1);

      await new Promise(r => testServer.close(r));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Slack Message Processing Through InboundMessageWorker with PHONE_NUMBER_ID
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Slack Message Processing & Phone Number Validation', () => {
    it('processes Slack message through InboundMessageWorker when PHONE_NUMBER_ID is set in production', async () => {
      process.env.PHONE_NUMBER_ID = 'PROD_PHONE_NUMBER_ID_888';

      let receivedReq = null;
      InboundMessageWorker.setHandler(async (req, res) => {
        receivedReq = req;
        const validation = validators.validateWebhookMessage(req);
        if (!validation) return res.status(200).send('EVENT_RECEIVED');

        const { phoneNumberId } = validation;
        // Verify isOurPhoneNumber behaves correctly
        const isOurs = validators.isOurPhoneNumber(phoneNumberId);
        if (!isOurs) {
          return res.status(200).send('EVENT_RECEIVED');
        }

        res.status(200).send('EVENT_RECEIVED');
      });

      const slackEnvelope = createInboundEnvelope({
        id: `slack_msg_${Date.now()}`,
        channel: 'slack',
        from: 'slack:U987654321',
        timestamp: Math.floor(Date.now() / 1000),
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Hello from Slack user' },
        metadata: {}
      });

      const result = await InboundMessageWorker.process(slackEnvelope);

      expect(result).toEqual({ success: true });
      expect(receivedReq).not.toBeNull();
      // Verify phone number validation passed
      const validation = validators.validateWebhookMessage(receivedReq);
      expect(validation).not.toBeNull();
      expect(validators.isOurPhoneNumber(validation.phoneNumberId)).toBe(true);
      // WhatsApp reaction/typing feedback should NOT be invoked for Slack
      expect(WhatsAppService.sendReaction).not.toHaveBeenCalled();
      expect(WhatsAppService.showTypingIndicator).not.toHaveBeenCalled();
    });

    it('processes Slack interactive button reply through InboundMessageWorker with PHONE_NUMBER_ID set', async () => {
      process.env.PHONE_NUMBER_ID = 'PROD_PHONE_NUMBER_ID_888';

      let receivedMessage = null;
      InboundMessageWorker.setHandler(async (req, res) => {
        const validation = validators.validateWebhookMessage(req);
        if (validation && validators.isOurPhoneNumber(validation.phoneNumberId)) {
          receivedMessage = validation.message;
        }
        res.status(200).send('EVENT_RECEIVED');
      });

      const slackButtonEnvelope = createInboundEnvelope({
        id: `slack_btn_${Date.now()}`,
        channel: 'slack',
        from: 'slack:U11223344',
        timestamp: Math.floor(Date.now() / 1000),
        type: ENVELOPE_TYPES.INTERACTIVE_BUTTON,
        payload: { actionId: 'action_quiz_start' },
        metadata: {}
      });

      const result = await InboundMessageWorker.process(slackButtonEnvelope);

      expect(result).toEqual({ success: true });
      expect(receivedMessage).not.toBeNull();
      expect(receivedMessage.type).toBe('interactive');
      expect(receivedMessage.interactive.type).toBe('button_reply');
      expect(receivedMessage.interactive.button_reply.id).toBe('action_quiz_start');
    });

    it('end-to-end: Slack Events API POST -> Standalone Gateway -> Queue -> InboundMessageWorker', async () => {
      process.env.PHONE_NUMBER_ID = 'PROD_PHONE_NUMBER_ID_888';

      let workerProcessedReq = null;
      InboundMessageWorker.setHandler(async (req, res) => {
        workerProcessedReq = req;
        res.status(200).send('EVENT_RECEIVED');
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const slackBody = JSON.stringify({
        type: 'event_callback',
        event_id: `slack_e2e_${Date.now()}`,
        event: {
          type: 'message',
          user: 'U_SLACK_STUDENT_42',
          text: 'Can you help me with lesson 3?',
          ts: `${timestamp}.000200`
        }
      });
      const signature = computeSlackSignature(timestamp, slackBody, TEST_SLACK_SECRET);

      // Ingest through standalone gateway
      const res = await fetch(`${serverUrl}/api/slack/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': String(timestamp),
          'x-slack-signature': signature
        },
        body: slackBody
      });

      expect(res.status).toBe(200);

      // Dequeue from memory queue and process through InboundMessageWorker
      const jobs = await memoryQueue.receiveJobs(10);
      expect(jobs.length).toBe(1);

      const job = jobs[0];
      expect(job.body.jobType).toBe('inbound_message');
      const envelope = job.body.payload;
      expect(envelope.channel).toBe('slack');
      expect(envelope.from).toBe('slack:U_SLACK_STUDENT_42');

      const workerResult = await InboundMessageWorker.process(envelope);
      expect(workerResult).toEqual({ success: true });
      expect(workerProcessedReq).not.toBeNull();
    });

    it('preserves cross-WABA isolation: rejects WhatsApp messages directed to foreign phone number IDs', async () => {
      process.env.PHONE_NUMBER_ID = 'PROD_PHONE_NUMBER_ID_888';

      let domainHandlerExecuted = false;
      InboundMessageWorker.setHandler(async (req, res) => {
        const validation = validators.validateWebhookMessage(req);
        if (validation && validators.isOurPhoneNumber(validation.phoneNumberId)) {
          domainHandlerExecuted = true;
        }
        res.status(200).send('EVENT_RECEIVED');
      });

      // Foreign WhatsApp message with phone_number_id = 'FOREIGN_WABA_999'
      const foreignEnvelope = createInboundEnvelope({
        id: `wamid.foreign_${Date.now()}`,
        channel: 'whatsapp',
        from: '923000000000',
        timestamp: Math.floor(Date.now() / 1000),
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Cross-WABA message' },
        metadata: { phoneNumberId: 'FOREIGN_WABA_999' }
      });

      await InboundMessageWorker.process(foreignEnvelope);
      expect(domainHandlerExecuted).toBe(false);

      // Valid WhatsApp message with phone_number_id = 'PROD_PHONE_NUMBER_ID_888'
      const validEnvelope = createInboundEnvelope({
        id: `wamid.valid_${Date.now()}`,
        channel: 'whatsapp',
        from: '923000000000',
        timestamp: Math.floor(Date.now() / 1000),
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Our WABA message' },
        metadata: { phoneNumberId: 'PROD_PHONE_NUMBER_ID_888' }
      });

      await InboundMessageWorker.process(validEnvelope);
      expect(domainHandlerExecuted).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Concurrency Bursts & Duplicate Message Floods Under Post-Handler markAsProcessed
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Concurrency Bursts & Duplicate Message Floods', () => {
    it('handles 100-request high-concurrency burst in < 100ms average with 0% queue packet loss', async () => {
      const concurrency = 100;
      const latencies = [];

      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const messageId = `wamid.iter2_burst_${i}_${Date.now()}`;
        const payload = generateWhatsAppPayload(messageId, `Burst ${i}`, 'PROD_PHONE_NUMBER_ID_888');

        const start = performance.now();
        const res = await fetch(`${serverUrl}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const duration = performance.now() - start;
        const text = await res.text();
        latencies.push(duration);

        return { status: res.status, text };
      });

      const results = await Promise.all(promises);

      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.text).toBe('EVENT_RECEIVED');
      }

      latencies.sort((a, b) => a - b);
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      console.log(`[Iter2 Ingestion Benchmark] 100 requests: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);
      expect(avg).toBeLessThan(100);
      expect(p95).toBeLessThan(100);
      expect(memoryQueue.size('main')).toBe(concurrency);
    });

    it('suppresses identical message floods at queue ingress level', async () => {
      const floodCount = 100;
      const floodId = `wamid.flood_dedup_${Date.now()}`;
      const payload = generateWhatsAppPayload(floodId, 'Duplicate flood', 'PROD_PHONE_NUMBER_ID_888');

      const promises = Array.from({ length: floodCount }, () =>
        fetch(`${serverUrl}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.status)
      );

      const statuses = await Promise.all(promises);
      for (const s of statuses) expect(s).toBe(200);

      // Ingress deduplication: only 1 job enqueued in memoryQueue
      expect(memoryQueue.size('main')).toBe(1);
    });

    it('sequential duplicate redeliveries in worker are suppressed by post-handler markAsProcessed', async () => {
      let domainExecutionCount = 0;
      InboundMessageWorker.setHandler(async (req, res) => {
        domainExecutionCount++;
        res.status(200).send('EVENT_RECEIVED');
      });

      const envelopeId = `wamid.seq_dedup_${Date.now()}`;
      const envelope = createInboundEnvelope({
        id: envelopeId,
        channel: 'whatsapp',
        from: '923001234567',
        timestamp: Math.floor(Date.now() / 1000),
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Sequential dedup test' }
      });

      // First run: successfully processes and marks as processed
      const firstRun = await InboundMessageWorker.process(envelope);
      expect(firstRun).toEqual({ success: true });
      expect(domainExecutionCount).toBe(1);

      // Subsequent 50 redeliveries: must be suppressed
      for (let i = 0; i < 50; i++) {
        const nextRun = await InboundMessageWorker.process(envelope);
        expect(nextRun).toEqual({ duplicate: true });
      }

      expect(domainExecutionCount).toBe(1);
      expect(WhatsAppService.sendReaction).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL RETRY SEMANTICS: if domain handler fails, markAsProcessed is NOT executed, allowing redelivery retry', async () => {
      let attemptCount = 0;
      let shouldFail = true;

      InboundMessageWorker.setHandler(async (req, res) => {
        attemptCount++;
        if (shouldFail) {
          throw new Error('DATABASE_CONNECTION_TRANSIENT_TIMEOUT');
        }
        res.status(200).send('EVENT_RECEIVED');
      });

      const envelopeId = `wamid.retry_test_${Date.now()}`;
      const envelope = createInboundEnvelope({
        id: envelopeId,
        channel: 'whatsapp',
        from: '923001234567',
        timestamp: Math.floor(Date.now() / 1000),
        type: ENVELOPE_TYPES.TEXT,
        payload: { text: 'Retry test message' }
      });

      // 1. First execution fails during domain handling
      await expect(InboundMessageWorker.process(envelope)).rejects.toThrow('DATABASE_CONNECTION_TRANSIENT_TIMEOUT');
      expect(attemptCount).toBe(1);

      // Verify SessionService has NOT marked it as processed!
      const isMarked = await SessionService.isProcessed(envelopeId);
      expect(isMarked).toBe(false);

      // 2. Queue redelivers (transient DB issue now resolved)
      shouldFail = false;
      const retryResult = await InboundMessageWorker.process(envelope);
      expect(retryResult).toEqual({ success: true });
      expect(attemptCount).toBe(2);

      // Verify SessionService NOW marks it as processed after successful domain execution
      const isMarkedAfterSuccess = await SessionService.isProcessed(envelopeId);
      expect(isMarkedAfterSuccess).toBe(true);

      // 3. Any further redelivery is now properly rejected as duplicate
      const thirdRun = await InboundMessageWorker.process(envelope);
      expect(thirdRun).toEqual({ duplicate: true });
      expect(attemptCount).toBe(2); // Domain handler was NOT called again
    });
  });
});
