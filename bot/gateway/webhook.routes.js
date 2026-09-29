/**
 * Webhook Ingestion Gateway Routes
 *
 * Centralized, channel-agnostic webhook gateway routing for all inbound channels
 * (WhatsApp/Meta, Slack, and future provider webhooks).
 *
 * In Phase 1: Mounts into existing Express app and dispatches in-process synchronously.
 * In Phase 2: Will dispatch asynchronously to background queue.
 * In Phase 3: Can run as an independent microservice server process.
 */

const express = require('express');
const whatsappAdapter = require('./adapters/whatsapp.adapter');
const slackAdapter = require('./adapters/slack.adapter');
const { defaultDispatcher } = require('./ingress-dispatcher');

/**
 * Creates the gateway Express router with configured ingress dispatcher.
 *
 * @param {Object} [dispatcher=defaultDispatcher] - IngressDispatcher instance
 * @returns {express.Router}
 */
function createWebhookRoutes(dispatcher = defaultDispatcher) {
  const router = express.Router();

  // 1. Slack Ingress - Captures exact raw body bytes for HMAC verification
  router.use('/api/slack', express.raw({ type: '*/*' }), (req, res, next) => {
    req.rawBody = req.body;
    next();
  });
  router.use('/api/slack', slackAdapter.createSlackRouter(dispatcher));

  // 2. WhatsApp Ingress - Parses JSON body and handles Meta verification / messages
  router.use('/webhook', express.json());
  router.get('/webhook', whatsappAdapter.verifyWebhook);
  router.post('/webhook', whatsappAdapter.createPostHandler(dispatcher));

  return router;
}

// Default router instance using the global defaultDispatcher
const defaultRouter = createWebhookRoutes(defaultDispatcher);

// Attach factory method to the exported router for flexibility
defaultRouter.createWebhookRoutes = createWebhookRoutes;

module.exports = defaultRouter;
