#!/usr/bin/env node
/**
 * Standalone Webhook Ingestion Gateway Server (rumi-gateway)
 *
 * Runs the channel-agnostic webhook gateway as an independent microservice.
 * Handles incoming webhooks for WhatsApp (Meta Cloud API) and Slack.
 *
 * Requirements:
 * - Independent port resolution (GATEWAY_PORT || PORT || 4000)
 * - Liveness probe: GET /health -> { "status": "ok", "service": "rumi-gateway" }
 * - Zero monolith dependencies (no Supabase, LLM, or whatsapp-bot.js required at boot)
 * - Safe CORS and middleware configuration
 */

const path = require('path');
const http = require('http');
const express = require('express');

// 1. Independent Environment Resolution
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
} catch (_) {
  // Gracefully continue if dotenv is not installed or env vars are pre-set
}

const portEnv = process.env.GATEWAY_PORT || process.env.PORT;
const DEFAULT_PORT = portEnv !== undefined ? Number(portEnv) : 4000;
const CORS_ORIGIN = process.env.GATEWAY_CORS_ORIGIN || '*';

// 2. Import Gateway Router, Dispatcher, and Queue Service
const { createWebhookRoutes } = require('./webhook.routes');
const { IngressDispatcher } = require('./ingress-dispatcher');
const queueService = require('../shared/services/queue');

// 3. Express App Setup
const app = express();
app.disable('x-powered-by');

// Native CORS Middleware (zero external dependency)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-hub-signature-256, x-slack-request-timestamp, x-slack-signature');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 4. Liveness Probes
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'rumi-gateway'
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'rumi-gateway'
  });
});

// 5. Ingress Dispatcher with Async Queue Producer
const dispatcher = new IngressDispatcher();

function resolveQueueService() {
  const driver = (process.env.QUEUE_DRIVER || 'sqs').toLowerCase();
  if (driver === 'memory' || driver === 'mock') {
    return require('../shared/services/queue/memory-queue.service');
  }
  if (driver === 'bullmq') {
    return require('../shared/services/queue/bullmq-queue.service');
  }
  return queueService;
}

const queueProducer = async (envelope) => {
  const activeQueueService = resolveQueueService();
  return await activeQueueService.queueJob(
    envelope.from || envelope.id,
    'inbound_message',
    envelope,
    { deduplicationId: envelope.id }
  );
};

dispatcher.setQueueProducer(queueProducer);

// 6. Mount Decoupled Gateway Routes (/webhook and /api/slack)
app.use(createWebhookRoutes(dispatcher));

// 7. Server Lifecycle & Gating
function startServer(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(port, () => {
      console.log(`[rumi-gateway] Server running on port ${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[rumi-gateway] Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { app, startServer, dispatcher };
