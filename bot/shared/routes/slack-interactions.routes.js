/**
 * Slack routes — mounted at /api/slack in whatsapp-bot.js.
 *
 *   POST /api/slack/events        - Events API (plain messages)
 *   POST /api/slack/interactions  - Interactivity (button clicks, select
 *                                   menus, AND modal view_submission)
 *
 * Every request here is HMAC-signature-verified (slack-signature.service.js)
 * BEFORE any dispatch — mirrors flow-endpoint.routes.js's own shape (route
 * layer owns the platform-specific security/envelope concern; the actual
 * business logic in the inbound adapter / endpoint functions never sees it).
 *
 * whatsapp-bot.js mounts a raw-body-capturing middleware ahead of this
 * router (see its own header comment) so req.rawBody holds the exact bytes
 * Slack signed — required for signature verification to succeed at all.
 */

const express = require('express');
const router = express.Router();
const SlackSignatureService = require('../services/slack-signature.service');
const { logToFile } = require('../utils/logger');
const { makeEventsHandler, makeInteractionsHandler } = require('../services/messaging/inbound/slack-events.adapter');

/**
 * express.raw() (mounted by whatsapp-bot.js ahead of this router) leaves
 * req.body as a Buffer. Every handler below needs it parsed — as JSON for
 * Events API, as an x-www-form-urlencoded `payload` field for
 * Interactivity — so parse it once here, after signature verification.
 */
function verifyAndParse(contentType) {
  return (req, res, next) => {
    if (!SlackSignatureService.verify(req)) {
      logToFile('⚠️ Slack signature verification failed', { path: req.path });
      res.status(401).send('Invalid signature');
      return;
    }

    const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
    try {
      if (contentType === 'json') {
        req.body = raw ? JSON.parse(raw) : {};
      } else {
        // application/x-www-form-urlencoded, Slack's Interactivity content type.
        const params = new URLSearchParams(raw);
        req.body = Object.fromEntries(params.entries());
      }
    } catch (error) {
      res.status(400).send('Bad request body');
      return;
    }
    next();
  };
}

function mount(dispatch) {
  router.post('/events', verifyAndParse('json'), makeEventsHandler(dispatch));
  router.post('/interactions', verifyAndParse('form'), makeInteractionsHandler(dispatch));
  return router;
}

module.exports = mount;
