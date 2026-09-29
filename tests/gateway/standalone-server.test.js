/**
 * Standalone Webhook Ingestion Gateway Server Tests (rumi-gateway)
 *
 * Validates Phase 3 requirements:
 * 1. Independent boot on port 4000 (respecting GATEWAY_PORT and PORT).
 * 2. GET /health and GET / liveness probes returning { "status": "ok", "service": "rumi-gateway" }.
 * 3. Native zero-dependency CORS headers for preflight OPTIONS and standard requests.
 * 4. Wire-level compatibility for Meta /webhook and Slack /api/slack endpoints.
 * 5. Boot independence: microservice runs cleanly without Supabase credentials.
 */



const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SERVER_PATH = path.resolve(REPO_ROOT, 'bot/gateway/server.js');
const memoryQueue = require('../../bot/shared/services/queue/memory-queue.service');

const TEST_VERIFY_TOKEN = 'standalone_meta_verify_token_456';
const TEST_SLACK_SECRET = 'standalone_slack_signing_secret_123';

process.env.WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
process.env.SLACK_SIGNING_SECRET = TEST_SLACK_SECRET;
process.env.QUEUE_DRIVER = 'memory';

// Helper to generate Slack HMAC signature
function computeSlackSignature(timestamp, rawBody, secret = TEST_SLACK_SECRET) {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('Standalone Gateway Microservice (bot/gateway/server.js)', () => {
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
    if (options.body != null) {
      opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!opts.headers['content-type'] && !opts.headers['Content-Type']) {
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

  describe('Contract and Source Hygiene', () => {
    it('bot/gateway/server.js exists on disk', () => {
      expect(fs.existsSync(SERVER_PATH)).toBe(true);
    });

    it('bot/gateway/server.js passes node --check syntax validation', () => {
      expect(() => {
        execFileSync('node', ['--check', SERVER_PATH], { encoding: 'utf8' });
      }).not.toThrow();
    });

    it('gates top-level execution behind require.main === module', () => {
      const source = fs.readFileSync(SERVER_PATH, 'utf8');
      const gateRegex = /^[ \t]*if\s*\(\s*require\.main\s*===\s*module\s*\)/m;
      expect(gateRegex.test(source)).toBe(true);
    });

    it('exports app and startServer', () => {
      expect(typeof gatewayModule.app).toBe('function');
      expect(typeof gatewayModule.startServer).toBe('function');
    });

    it('contains no internal ticket references in source', () => {
      const source = fs.readFileSync(SERVER_PATH, 'utf8');
      const ticketRegex = /\b(?:bd-\d+|BUG-\d+|PROJ-\d+|FEAT-\d+|TASK-\d+|plt-[a-z0-9]+|etv-[a-z0-9]+|[Bb][Uu][Gg]\s*#\d+)\b/;
      expect(ticketRegex.test(source)).toBe(false);
    });

    it('does not mutate or register queue producer on global defaultDispatcher', () => {
      const { defaultDispatcher } = require('../../bot/gateway/ingress-dispatcher');
      expect(defaultDispatcher.mode).toBe('sync');
      expect(defaultDispatcher.queueProducer).toBeNull();
    });
  });

  describe('Liveness Probe & Health Endpoints', () => {
    it('GET /health returns HTTP 200 with { status: "ok", service: "rumi-gateway" }', async () => {
      const res = await request('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        service: 'rumi-gateway'
      });
    });

    it('GET / returns HTTP 200 with { status: "ok", service: "rumi-gateway" }', async () => {
      const res = await request('/');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        service: 'rumi-gateway'
      });
    });

    it('returns HTTP 404 for undefined routes', async () => {
      const res = await request('/non-existent-route');
      expect(res.status).toBe(404);
    });
  });

  describe('CORS Headers & OPTIONS Preflight', () => {
    it('returns CORS headers on standard GET request', async () => {
      const res = await request('/health');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET, POST, OPTIONS');
    });

    it('handles OPTIONS preflight request with HTTP 200 and signature headers', async () => {
      const res = await request('/webhook', { method: 'OPTIONS' });
      expect([200, 204]).toContain(res.status);
      const allowHeaders = res.headers.get('access-control-allow-headers') || '';
      expect(allowHeaders.toLowerCase()).toContain('x-hub-signature-256');
    });
  });

  describe('Wire-Level Webhook Ingress Compatibility', () => {
    it('GET /webhook returns challenge string when verify token matches', async () => {
      const challenge = 'standalone_test_challenge_789';
      const res = await request(`/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challenge}`);
      expect(res.status).toBe(200);
      expect(res.body).toBe(challenge);
    });

    it('GET /webhook returns 403 Forbidden when verify token does not match', async () => {
      const res = await request('/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=abc');
      expect(res.status).toBe(403);
      expect(res.body).toBe('Forbidden');
    });

    it('POST /webhook acknowledges HTTP 200 in < 100ms and enqueues canonical envelope', async () => {
      const testPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: 'ENTRY_GATEWAY_1',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: 'TEST_PHONE_123'
              },
              contacts: [{
                profile: { name: 'Teacher Gateway' },
                wa_id: '923001234567'
              }],
              messages: [{
                from: '923001234567',
                id: 'wamid.gateway.test.001',
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: 'Hello Gateway!' }
              }]
            }
          }]
        }]
      };

      const startTime = Date.now();
      const res = await request('/webhook', {
        method: 'POST',
        body: testPayload
      });
      const durationMs = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(res.body).toBe('EVENT_RECEIVED');
      expect(durationMs).toBeLessThan(100);

      // Verify envelope arrived in queue
      expect(memoryQueue.size('main')).toBe(1);
      const jobs = await memoryQueue.receiveJobs();
      expect(jobs).toHaveLength(1);

      const job = jobs[0];
      expect(job.body.jobType).toBe('inbound_message');
      expect(job.body.groupId).toBe('923001234567');
      expect(job.body.payload.id).toBe('wamid.gateway.test.001');
      expect(job.body.payload.channel).toBe('whatsapp');
      expect(job.body.payload.type).toBe('text');
      expect(job.body.payload.payload.text).toBe('Hello Gateway!');
    });

    it('POST /api/slack/events with valid HMAC signature returns 200 with challenge', async () => {
      const challengeCode = 'slack_challenge_xyz_standalone';
      const bodyPayload = JSON.stringify({
        type: 'url_verification',
        token: 'legacy_token_ignored',
        challenge: challengeCode
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeSlackSignature(timestamp, bodyPayload);

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': signature
        },
        body: bodyPayload
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ challenge: challengeCode });
    });

    it('POST /api/slack/events with invalid HMAC signature returns 401', async () => {
      const bodyPayload = JSON.stringify({
        type: 'url_verification',
        challenge: 'test_challenge'
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const invalidSignature = 'v0=0000000000000000000000000000000000000000000000000000000000000000';

      const res = await request('/api/slack/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': invalidSignature
        },
        body: bodyPayload
      });

      expect(res.status).toBe(401);
    });
  });

  describe('startServer Export and Port Resolution', () => {
    it('exports startServer function capable of binding to an ephemeral port', async () => {
      expect(typeof gatewayModule.startServer).toBe('function');
      const testInstance = await gatewayModule.startServer(0);
      expect(testInstance.listening).toBe(true);
      await new Promise((resolve) => testInstance.close(resolve));
    });
  });

  describe('Boot Independence (No Supabase or DB Credentials)', () => {
    it('boots standalone server in child process without SUPABASE_URL and responds to /health', async () => {
      const testPort = 4822;
      const childEnv = {
        ...process.env,
        GATEWAY_PORT: String(testPort),
        PORT: String(testPort),
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        OPENAI_API_KEY: '',
        ELEVENLABS_API_KEY: ''
      };

      const child = spawn('node', [SERVER_PATH], {
        env: childEnv,
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let startupError = '';

      child.stderr.on('data', (data) => {
        startupError += data.toString();
      });

      const startTime = Date.now();
      let healthResponseOk = false;

      while (Date.now() - startTime < 4000) {
        try {
          const res = await fetch(`http://127.0.0.1:${testPort}/health`);
          if (res.status === 200) {
            const data = await res.json();
            if (data.status === 'ok' && data.service === 'rumi-gateway') {
              healthResponseOk = true;
              break;
            }
          }
        } catch (_) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));

      expect(startupError).not.toContain('process.exit(78)');
      expect(healthResponseOk).toBe(true);
    }, 6000);
  });
});
