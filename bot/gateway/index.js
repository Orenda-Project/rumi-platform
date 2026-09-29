/**
 * Gateway Barrel Module
 *
 * Exports the primary components of the decoupled webhook ingestion gateway.
 */

const webhookRoutes = require('./webhook.routes');
const { createWebhookRoutes } = require('./webhook.routes');
const { IngressDispatcher, defaultDispatcher } = require('./ingress-dispatcher');
const { createInboundEnvelope, ENVELOPE_TYPES } = require('./envelope');
const whatsappAdapter = require('./adapters/whatsapp.adapter');
const slackAdapter = require('./adapters/slack.adapter');

module.exports = {
  webhookRoutes,
  createWebhookRoutes,
  IngressDispatcher,
  defaultDispatcher,
  createInboundEnvelope,
  ENVELOPE_TYPES,
  whatsappAdapter,
  slackAdapter
};
