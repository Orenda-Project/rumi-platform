/**
 * Empirical Reproduction Suite: Standalone Microservice & Normalization Edge Cases
 *
 * Authored by Challenger 2 (Empirical Challenger)
 * Demonstrates confirmed bugs, edge cases, and architectural flaws in Phase 3 gateway:
 *
 * 1. CRITICAL: Standalone server process terminates with exit code 78 (EX_CONFIG)
 *    when handling Slack open_modal block_actions without Supabase credentials.
 * 2. CRITICAL: Standalone server drops inbound Slack Events because the Slack router
 *    is bound to defaultDispatcher instead of server.js's local IngressDispatcher.
 * 3. MEDIUM: createInboundEnvelope({ metadata: null }) crashes with TypeError.
 * 4. MEDIUM: parseToEnvelope crashes on button_reply: null and list_reply: null with TypeError.
 * 5. MEDIUM: Slack media/file shares normalized as ENVELOPE_TYPES.UNKNOWN with lost media metadata.
 */

delete process.env.REDIS_URL;

const fs = require('fs');
const path = require('path');
const http = require('http');

const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SERVER_PATH = path.resolve(REPO_ROOT, 'bot/gateway/server.js');
const memoryQueue = require('../../bot/shared/services/queue/memory-queue.service');
const { createInboundEnvelope, ENVELOPE_TYPES } = require('../../bot/gateway/envelope');
const whatsappAdapter = require('../../bot/gateway/adapters/whatsapp.adapter');
const slackAdapter = require('../../bot/gateway/adapters/slack.adapter');
const gatewayModule = require('../../bot/gateway/server');

const TEST_SLACK_SECRET = 'chal2_slack_secret_123';
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;
process.env.QUEUE_DRIVER = 'memory';

function computeSlackSignature(timestamp, rawBody, secret = TEST_SLACK_SECRET) {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('Challenger 2 Empirical Bug Reproduction & Edge Case Harness', () => {
  beforeEach(() => {
    memoryQueue.clear();
  });

  // =========================================================================
  // DEFECT 1: Process crash with exit code 78 upon receiving Slack interactions
  // =========================================================================
  describe('Defect 1: Standalone Process Crash on Slack open_modal Without Supabase', () => {
    it('empirically reproduces process.exit(78) crash when open_modal interaction is sent to standalone gateway', async () => {
      const testPort = 4988;
      const strippedEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME || '/tmp',
        NODE_ENV: 'production',
        GATEWAY_PORT: String(testPort),
        SLACK_SIGNING_SECRET: TEST_SLACK_SECRET,
        QUEUE_DRIVER: 'memory'
        // Intentionally NO SUPABASE_URL, NO SUPABASE_SERVICE_ROLE_KEY
      };

      const child = spawn(process.execPath, [SERVER_PATH], {
        env: strippedEnv,
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrOutput = '';
      child.stderr.on('data', (d) => { stderrOutput += d.toString(); });

      // Wait for server to boot and answer /health
      let ready = false;
      const start = Date.now();
      while (Date.now() - start < 4000) {
        try {
          const res = await fetch(`http://127.0.0.1:${testPort}/health`);
          if (res.status === 200) {
            ready = true;
            break;
          }
        } catch (_) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      expect(ready).toBe(true);

      // Now send a validly signed Slack block_actions interaction opening a registration modal
      const payloadJson = JSON.stringify({
        type: 'block_actions',
        actions: [{ action_id: 'open_modal:registration' }],
        user: { id: 'U_TEST_TEACHER' },
        trigger_id: '12345.67890.abcdef'
      });
      const body = 'payload=' + encodeURIComponent(payloadJson);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeSlackSignature(timestamp, body, TEST_SLACK_SECRET);

      // Send the request
      await fetch(`http://127.0.0.1:${testPort}/api/slack/interactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature
        },
        body
      });

      // Wait for child process to exit
      const exitCode = await new Promise((resolve) => {
        child.on('exit', (code) => resolve(code));
        setTimeout(() => resolve('STILL_RUNNING'), 2000);
      });

      // REMEDIATED:
      // The child process does NOT exit with code 78 and remains running
      expect(exitCode).toBe('STILL_RUNNING');
      expect(stderrOutput).not.toContain('Missing REQUIRED env var(s): SUPABASE_URL');
      child.kill();
    }, 10000);
  });

  // =========================================================================
  // DEFECT 2: Inbound Slack Events Dropped in Standalone Server
  // =========================================================================
  describe('Defect 2: Standalone Gateway Drops Inbound Slack Events', () => {
    let server;
    let serverUrl;

    beforeAll((done) => {
      server = http.createServer(gatewayModule.app);
      server.listen(0, '127.0.0.1', () => {
        serverUrl = `http://127.0.0.1:${server.address().port}`;
        done();
      });
    });

    afterAll((done) => {
      if (server && server.listening) {
        server.close(done);
      } else {
        done();
      }
    });

    it('empirically demonstrates that Slack events are acknowledged 200 OK and properly queued in standalone server', async () => {
      memoryQueue.clear();

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const slackBody = JSON.stringify({
        type: 'event_callback',
        event_id: `slack_evt_${Date.now()}`,
        event: {
          type: 'message',
          user: 'U_CHALLENGER_2',
          text: 'Empirical challenge message',
          ts: `${timestamp}.000500`
        }
      });
      const signature = computeSlackSignature(timestamp, slackBody, TEST_SLACK_SECRET);

      const res = await fetch(`${serverUrl}/api/slack/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature
        },
        body: slackBody
      });

      // HTTP response returns 200 OK
      expect(res.status).toBe(200);

      // REMEDIATED: Queue depth is 1 because router is bound to local dispatcher
      expect(memoryQueue.size('main')).toBe(1);
    });
  });

  // =========================================================================
  // DEFECT 3: createInboundEnvelope({ metadata: null }) crash
  // =========================================================================
  describe('Defect 3: Envelope Factory Null Pointer on metadata: null', () => {
    it('safely handles metadata explicitly passed as null without throwing', () => {
      const envelope = createInboundEnvelope({
        id: 'test_null_meta',
        channel: 'whatsapp',
        from: '123456',
        metadata: null
      });
      expect(envelope).toBeDefined();
      expect(envelope.metadata.correlationId).toBeNull();
    });
  });

  // =========================================================================
  // DEFECT 4: parseToEnvelope TypeError on null interactive reply objects
  // =========================================================================
  describe('Defect 4: parseToEnvelope Unhandled TypeError on button_reply: null', () => {
    it('handles interactive.type button_reply safely when button_reply object is null', () => {
      const req = {
        body: {
          object: 'whatsapp_business_account',
          entry: [{
            changes: [{
              value: {
                messaging_product: 'whatsapp',
                messages: [{
                  id: 'wamid.bad_btn',
                  from: '923001234567',
                  timestamp: '1720000000',
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: null
                  }
                }]
              }
            }]
          }]
        }
      };

      const envelope = whatsappAdapter.parseToEnvelope(req, 'test-corr-id');
      expect(envelope).toBeDefined();
      expect(envelope.type).toBe(ENVELOPE_TYPES.UNKNOWN);
    });

    it('handles interactive.type list_reply safely when list_reply object is null', () => {
      const req = {
        body: {
          object: 'whatsapp_business_account',
          entry: [{
            changes: [{
              value: {
                messaging_product: 'whatsapp',
                messages: [{
                  id: 'wamid.bad_list',
                  from: '923001234567',
                  timestamp: '1720000000',
                  type: 'interactive',
                  interactive: {
                    type: 'list_reply',
                    list_reply: null
                  }
                }]
              }
            }]
          }]
        }
      };

      const envelope = whatsappAdapter.parseToEnvelope(req, 'test-corr-id');
      expect(envelope).toBeDefined();
      expect(envelope.type).toBe(ENVELOPE_TYPES.UNKNOWN);
    });
  });

  // =========================================================================
  // DEFECT 5: Slack Media Share Loss in normalizeSlackEvent
  // =========================================================================
  describe('Defect 5: Slack Media Share Normalization Loss', () => {
    it('normalizes Slack audio file share as UNKNOWN and omits audio payload', () => {
      const syntheticReq = {
        body: {
          entry: [{
            id: 'slack-events',
            changes: [{
              value: {
                messages: [{
                  from: 'slack:U12345',
                  id: '1720000100.0001',
                  timestamp: 1720000100,
                  type: 'audio',
                  audio: { id: 'slack:F_AUDIO_1', mime_type: 'audio/mp4' }
                }]
              }
            }]
          }]
        }
      };

      const envelope = slackAdapter.normalizeSlackEvent(syntheticReq);
      expect(envelope.type).toBe(ENVELOPE_TYPES.UNKNOWN);
      expect(envelope.payload.audio).toBeUndefined();
      expect(envelope.payload.mediaId).toBeUndefined();
    });
  });
});
