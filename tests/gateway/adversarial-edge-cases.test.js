/**
 * Adversarial Edge Cases & Empirical Challenge Suite for Webhook Gateway (Phase 3)
 *
 * Tests standalone microservice resilience, security posture, and edge-case behavior:
 * 1. Subprocess boot with strictly stripped minimal env (zero Supabase / AWS / Redis credentials).
 * 2. Port precedence hierarchy: GATEWAY_PORT > PORT > default 4000.
 * 3. Module isolation: zero Supabase, bot-helpers, or database modules in require.cache.
 * 4. Comprehensive CORS & preflight OPTIONS probing across all ingress and health routes.
 * 5. Dynamic GATEWAY_CORS_ORIGIN configuration.
 * 6. Malformed, truncated, and adversarial payloads for WhatsApp POST /webhook.
 * 7. Malformed, truncated, tampered, and expired HMAC payloads for Slack /api/slack/*.
 * 8. Meta GET /webhook handshake edge cases.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SERVER_PATH = path.resolve(REPO_ROOT, 'bot/gateway/server.js');
const memoryQueue = require('../../bot/shared/services/queue/memory-queue.service');

const TEST_VERIFY_TOKEN = 'adversarial_verify_token_777';
const TEST_SLACK_SECRET = 'adversarial_slack_secret_888';

process.env.WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;
process.env.QUEUE_DRIVER = 'memory';

function computeSlackSignature(timestamp, rawBody, secret = TEST_SLACK_SECRET) {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('Empirical Adversarial Challenges: Standalone Gateway & Normalization Edge Cases', () => {
  let server;
  let serverUrl;
  let gatewayModule;

  beforeAll((done) => {
    gatewayModule = require(SERVER_PATH);
    server = http.createServer(gatewayModule.app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      serverUrl = `http://127.0.0.1:${port}`;
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

  beforeEach(() => {
    memoryQueue.clear();
  });

  async function request(reqPath, options = {}) {
    const url = `${serverUrl}${reqPath}`;
    const opts = {
      method: options.method || 'GET',
      headers: { ...(options.headers || {}) }
    };
    if (options.body !== undefined) {
      opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!opts.headers['content-type'] && !opts.headers['Content-Type'] && typeof options.body !== 'string') {
        opts.headers['content-type'] = 'application/json';
      }
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch (_) {}

    return {
      status: res.status,
      headers: res.headers,
      body
    };
  }

  // =========================================================================
  // 1. Subprocess Boot Independence & Stripped Environment
  // =========================================================================
  describe('1. Subprocess Boot Independence (Stripped Minimal Env)', () => {
    it('boots standalone server in child process with zero Supabase/monolith env vars', async () => {
      const testPort = 4911;
      const strippedEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME || '/tmp',
        NODE_ENV: 'test',
        GATEWAY_PORT: String(testPort),
        QUEUE_DRIVER: 'memory'
      };

      const child = spawn(process.execPath, [SERVER_PATH], {
        env: strippedEnv,
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrOutput = '';
      child.stderr.on('data', (d) => { stderrOutput += d.toString(); });

      let responded = false;
      const start = Date.now();

      while (Date.now() - start < 5000) {
        try {
          const res = await fetch(`http://127.0.0.1:${testPort}/health`);
          if (res.status === 200) {
            const data = await res.json();
            if (data.status === 'ok' && data.service === 'rumi-gateway') {
              responded = true;
              break;
            }
          }
        } catch (_) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));

      expect(responded).toBe(true);
      expect(stderrOutput).not.toContain('EX_CONFIG');
      expect(stderrOutput).not.toContain('process.exit(78)');
    }, 8000);

    it('respects PORT when GATEWAY_PORT is not specified', async () => {
      const testPort = 4912;
      const strippedEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME || '/tmp',
        PORT: String(testPort),
        QUEUE_DRIVER: 'memory'
      };

      const child = spawn(process.execPath, [SERVER_PATH], {
        env: strippedEnv,
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let responded = false;
      const start = Date.now();

      while (Date.now() - start < 5000) {
        try {
          const res = await fetch(`http://127.0.0.1:${testPort}/health`);
          if (res.status === 200) {
            responded = true;
            break;
          }
        } catch (_) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));
      expect(responded).toBe(true);
    }, 8000);

    it('gives GATEWAY_PORT precedence over PORT when both are specified', async () => {
      const gatewayPort = 4913;
      const plainPort = 4914;
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME || '/tmp',
        GATEWAY_PORT: String(gatewayPort),
        PORT: String(plainPort),
        QUEUE_DRIVER: 'memory'
      };

      const child = spawn(process.execPath, [SERVER_PATH], {
        env,
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let boundToGatewayPort = false;
      const start = Date.now();

      while (Date.now() - start < 5000) {
        try {
          const res = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
          if (res.status === 200) {
            boundToGatewayPort = true;
            break;
          }
        } catch (_) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));
      expect(boundToGatewayPort).toBe(true);
    }, 8000);
  });

  // =========================================================================
  // 2. Module Isolation & Leakage Stress Test
  // =========================================================================
  describe('2. Module Isolation & Zero-Monolith Leakage', () => {
    it('does not load Supabase client or bot-helpers into require.cache on server require', () => {
      const cached = Object.keys(require.cache);
      const supabaseLoaded = cached.some((k) => k.includes('supabase.js'));
      const botHelpersLoaded = cached.some((k) => k.includes('bot-helpers.js'));
      const whatsappBotLoaded = cached.some((k) => k.includes('whatsapp-bot.js'));

      expect(supabaseLoaded).toBe(false);
      expect(botHelpersLoaded).toBe(false);
      expect(whatsappBotLoaded).toBe(false);
    });
  });

  // =========================================================================
  // 3. CORS Headers & Preflight OPTIONS Edge Cases
  // =========================================================================
  describe('3. CORS Headers & Preflight OPTIONS Edge Cases', () => {
    const routesToTest = [
      '/health',
      '/',
      '/webhook',
      '/api/slack/events',
      '/api/slack/interactions',
      '/api/slack/commands'
    ];

    routesToTest.forEach((route) => {
      it(`responds to OPTIONS ${route} with HTTP 200 and all necessary CORS headers`, async () => {
        const res = await request(route, { method: 'OPTIONS' });
        expect([200, 204]).toContain(res.status);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');

        const methods = res.headers.get('access-control-allow-methods') || '';
        expect(methods).toContain('GET');
        expect(methods).toContain('POST');
        expect(methods).toContain('OPTIONS');

        const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
        expect(allowHeaders).toContain('x-hub-signature-256');
        expect(allowHeaders).toContain('x-slack-signature');
        expect(allowHeaders).toContain('x-slack-request-timestamp');
        expect(allowHeaders).toContain('content-type');
      });
    });

    it('OPTIONS request on Slack routes does not require HMAC signature or fail with 401', async () => {
      const res = await request('/api/slack/events', { method: 'OPTIONS' });
      expect(res.status).toBe(200);
    });

    it('OPTIONS request on /webhook does not require query parameters or fail with 403', async () => {
      const res = await request('/webhook', { method: 'OPTIONS' });
      expect(res.status).toBe(200);
    });

    it('handles HEAD /health with HTTP 200 and identical headers to GET', async () => {
      const res = await request('/health', { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.body).toBe('');
    });

    it('handles HEAD / with HTTP 200', async () => {
      const res = await request('/', { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect(res.body).toBe('');
    });
  });

  // =========================================================================
  // 4. Malformed Payload Handling: WhatsApp Webhook (POST /webhook)
  // =========================================================================
  describe('4. Malformed Payload Handling: WhatsApp POST /webhook', () => {
    it('handles completely empty JSON object {} gracefully without crashing (returns 200 EVENT_RECEIVED)', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {}
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
      expect(memoryQueue.size('main')).toBe(0);
    });

    it('handles empty array [] body gracefully', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]'
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
    });

    it('handles missing entry array gracefully ({ object: "whatsapp_business_account" })', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { object: 'whatsapp_business_account' }
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
      expect(memoryQueue.size('main')).toBe(0);
    });

    it('handles empty entry array ({ entry: [] })', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { entry: [] }
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
    });

    it('handles entry with empty changes array ({ entry: [{ changes: [] }] })', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { entry: [{ changes: [] }] }
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
    });

    it('handles changes with empty messages array', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          entry: [{
            changes: [{
              value: {
                messaging_product: 'whatsapp',
                messages: []
              }
            }]
          }]
        }
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
    });

    it('handles message with empty object [{}] without throwing unhandled exception', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          entry: [{
            changes: [{
              value: {
                messaging_product: 'whatsapp',
                messages: [{}]
              }
            }]
          }]
        }
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');

      // Envelope should have fallen back safely
      expect(memoryQueue.size('main')).toBe(1);
      const jobs = await memoryQueue.receiveJobs();
      expect(jobs[0].body.payload.type).toBe('unknown');
    });

    it('handles invalid raw JSON syntax with HTTP 400 Bad Request without process crash', async () => {
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"entry": [malformed_json_here{'
      });
      expect(res.status).toBe(400);
    });

    it('handles oversized payloads (> 100kb default limit) with HTTP 413 Payload Too Large', async () => {
      const hugeBody = JSON.stringify({ padding: 'a'.repeat(120 * 1024) });
      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hugeBody
      });
      expect(res.status).toBe(413);
    });

    it('handles unknown message types (e.g. location, sticker) as ENVELOPE_TYPES.UNKNOWN', async () => {
      const locationPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              messages: [{
                from: '923009998877',
                id: 'wamid.location.001',
                timestamp: '1720000000',
                type: 'location',
                location: { latitude: 24.8607, longitude: 67.0011 }
              }]
            }
          }]
        }]
      };

      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: locationPayload
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');

      const jobs = await memoryQueue.receiveJobs();
      expect(jobs[0].body.payload.type).toBe('unknown');
      expect(jobs[0].body.payload.id).toBe('wamid.location.001');
    });

    it('handles interactive flow reply with corrupted response_json gracefully', async () => {
      const flowPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              messages: [{
                from: '923009998877',
                id: 'wamid.flow.001',
                timestamp: '1720000000',
                type: 'interactive',
                interactive: {
                  type: 'nfm_reply',
                  nfm_reply: {
                    name: 'registration_flow',
                    response_json: 'corrupted-not-json{{{'
                  }
                }
              }]
            }
          }]
        }]
      };

      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: flowPayload
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');

      const jobs = await memoryQueue.receiveJobs();
      expect(jobs[0].body.payload.type).toBe('interactive_flow');
      expect(jobs[0].body.payload.payload.flowData).toEqual({});
    });

    it('handles WhatsApp status updates (delivery/read receipts) with status_update envelope', async () => {
      const statusPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: 'TEST_PHONE_123' },
              statuses: [{
                id: 'wamid.broadcast.sent.123',
                status: 'delivered',
                timestamp: '1720000000',
                recipient_id: '923001122334'
              }]
            }
          }]
        }]
      };

      const res = await request('/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: statusPayload
      });
      expect(res.status).toBe(200);

      const jobs = await memoryQueue.receiveJobs();
      expect(jobs[0].body.payload.type).toBe('status_update');
      expect(jobs[0].body.payload.id).toBe('wamid.broadcast.sent.123');
      expect(jobs[0].body.payload.from).toBe('923001122334');
      expect(jobs[0].body.payload.payload.status).toBe('delivered');
    });
  });

  // =========================================================================
  // 5. Malformed Payload Handling: Slack HMAC Security & Endpoints
  // =========================================================================
  describe('5. Malformed Payload Handling: Slack HMAC Security & Endpoints', () => {
    it('returns 401 when x-slack-signature header is missing', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp
        },
        body: JSON.stringify({ type: 'url_verification', challenge: 'xyz' })
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 401 when x-slack-request-timestamp header is missing', async () => {
      const sig = computeSlackSignature(Math.floor(Date.now() / 1000), '{}');
      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-signature': sig
        },
        body: JSON.stringify({ type: 'url_verification', challenge: 'xyz' })
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 401 when timestamp is older than 5 minutes (replay attack protection)', async () => {
      const staleTimestamp = (Math.floor(Date.now() / 1000) - 350).toString();
      const body = JSON.stringify({ type: 'url_verification', challenge: 'xyz' });
      const sig = computeSlackSignature(staleTimestamp, body);

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': staleTimestamp,
          'x-slack-signature': sig
        },
        body
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 401 when timestamp is > 5 minutes in the future', async () => {
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 350).toString();
      const body = JSON.stringify({ type: 'url_verification', challenge: 'xyz' });
      const sig = computeSlackSignature(futureTimestamp, body);

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': futureTimestamp,
          'x-slack-signature': sig
        },
        body
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 401 when signature was computed with a different secret', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ type: 'url_verification', challenge: 'xyz' });
      const sig = computeSlackSignature(timestamp, body, 'completely_wrong_secret_123');

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': sig
        },
        body
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 401 when body was tampered with after signature generation', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const originalBody = JSON.stringify({ type: 'url_verification', challenge: 'legitimate' });
      const sig = computeSlackSignature(timestamp, originalBody);
      const tamperedBody = JSON.stringify({ type: 'url_verification', challenge: 'malicious' });

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': sig
        },
        body: tamperedBody
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 401 when signature is truncated or malformed format', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ type: 'url_verification', challenge: 'xyz' });

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': 'v0=short_invalid_signature'
        },
        body
      });
      expect(res.status).toBe(401);
      expect(res.body).toBe('Invalid signature');
    });

    it('returns 400 Bad request body when signature is valid but JSON body is malformed in /api/slack/events', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const malformedJson = '{"broken": json[';
      const sig = computeSlackSignature(timestamp, malformedJson);

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': sig
        },
        body: malformedJson
      });
      expect(res.status).toBe(400);
      expect(res.body).toBe('Bad request body');
    });

    it('returns 400 Bad payload when /api/slack/interactions receives valid signature but missing payload parameter', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const formBody = 'not_payload=something';
      const sig = computeSlackSignature(timestamp, formBody);

      const res = await request('/api/slack/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': sig
        },
        body: formBody
      });
      expect(res.status).toBe(400);
      expect(res.body).toBe('Bad payload');
    });

    it('returns 400 Bad payload when /api/slack/interactions receives valid signature but corrupted JSON inside payload parameter', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const formBody = 'payload=not_a_valid_json_string';
      const sig = computeSlackSignature(timestamp, formBody);

      const res = await request('/api/slack/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': sig
        },
        body: formBody
      });
      expect(res.status).toBe(400);
      expect(res.body).toBe('Bad payload');
    });

    it('returns 404 when POSTing to unknown sub-route /api/slack/unknown', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = '{}';
      const sig = computeSlackSignature(timestamp, body);

      const res = await request('/api/slack/unknown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': sig
        },
        body
      });
      expect(res.status).toBe(404);
    });

    it('returns 404 when sending GET to /api/slack/events (only POST allowed)', async () => {
      const res = await request('/api/slack/events', { method: 'GET' });
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 6. WhatsApp GET Verification Handshake Edge Cases
  // =========================================================================
  describe('6. WhatsApp GET /webhook Verification Handshake Edge Cases', () => {
    it('returns 403 when hub.mode is not "subscribe"', async () => {
      const res = await request(`/webhook?hub.mode=unsubscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=abc`);
      expect(res.status).toBe(403);
      expect(res.body).toBe('Forbidden');
    });

    it('returns 403 when hub.verify_token is empty or missing', async () => {
      const res = await request('/webhook?hub.mode=subscribe&hub.challenge=abc');
      expect(res.status).toBe(403);
      expect(res.body).toBe('Forbidden');
    });

    it('returns 403 when hub.mode is missing completely', async () => {
      const res = await request(`/webhook?hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=abc`);
      expect(res.status).toBe(403);
      expect(res.body).toBe('Forbidden');
    });

    it('returns 403 when query parameters are completely empty', async () => {
      const res = await request('/webhook');
      expect(res.status).toBe(403);
      expect(res.body).toBe('Forbidden');
    });
  });
});
