/**
 * Slack routes — mounted at /api/slack in whatsapp-bot.js.
 *
 *   POST /api/slack/events        - Events API (plain messages)
 *   POST /api/slack/interactions  - Interactivity (button clicks, select
 *                                   menus, AND modal view_submission)
 *   POST /api/slack/commands      - Slash Commands (/quiz, /settings, ...)
 *
 * Every request here is HMAC-signature-verified (slack-signature.service.js)
 * BEFORE any dispatch — mirrors flow-endpoint.routes.js's own shape (route
 * layer owns the platform-specific security/envelope concern; the actual
 * business logic in the inbound adapter / endpoint functions never sees it).
 *
 * whatsapp-bot.js mounts a raw-body-capturing middleware ahead of this
 * router (see its own header comment) so req.rawBody holds the exact bytes
 * Slack signed — required for signature verification to succeed at all.
 *
 * /commands is a SEPARATE route from /interactions even though both carry
 * form-encoded bodies: Slack's Slash Command payload puts command/text/
 * user_id at the TOP LEVEL of the body, whereas /interactions' block_actions/
 * view_submission payloads are JSON-encoded inside a single `payload` field.
 * Each Slash Command is registered in the Slack app config with its own
 * Request URL — point every one of them at this same /commands URL.
 */

const express = require('express');
const router = express.Router();
const SlackSignatureService = require('../services/slack-signature.service');
const { logToFile } = require('../utils/logger');
const { makeEventsHandler, makeInteractionsHandler, makeSlashCommandHandler } = require('../services/messaging/inbound/slack-events.adapter');
const modalInteractions = require('./slack-modal-interactions.handler');

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

/**
 * Dispatches an already-verified Interactivity payload to the right place:
 *   - view_submission            -> the modal renderer, response body carries
 *                                    the response_action Slack itself reads
 *   - block_actions "open_modal:<kind>" / "<kind>_back" -> the modal
 *     renderer's open/back handling (fire-and-forget from Slack's POV — it
 *     already got its 200 ack; the modal update happens via a separate
 *     views.open/views.update API call)
 *   - any other block_actions     -> ordinary chat button/select click,
 *                                    the existing inbound adapter's job
 */
function makeRoutedInteractionsHandler(dispatch) {
  const chatHandler = makeInteractionsHandler(dispatch);

  return async function routeSlackInteraction(req, res) {
    let payload;
    try {
      payload = JSON.parse(req.body.payload);
    } catch (error) {
      res.status(400).send('Bad payload');
      return;
    }

    if (payload.type === 'view_submission') {
      try {
        const result = await modalInteractions.handleViewSubmission(payload);
        if (result) {
          res.status(200).json(result);
        } else {
          res.status(200).send('');
        }
      } catch (error) {
        logToFile('❌ Slack interactions: view_submission dispatch failed', { error: error.message });
        res.status(200).send('');
      }
      return;
    }

    if (payload.type === 'block_actions') {
      const action = payload?.actions?.[0];
      if (modalInteractions.isOpenModalAction(action?.action_id) || modalInteractions.isBackAction(action?.action_id)) {
        res.status(200).send(''); // ack immediately — the modal update is a separate API call
        try {
          if (modalInteractions.isOpenModalAction(action.action_id)) {
            await modalInteractions.handleOpenModal(payload);
          } else {
            await modalInteractions.handleBackButton(payload);
          }
        } catch (error) {
          logToFile('❌ Slack interactions: modal block_actions dispatch failed', { error: error.message });
        }
        return;
      }
    }

    // Not a modal-related payload — ordinary chat interactivity.
    // req.body still holds the raw form-encoded body chatHandler expects.
    await chatHandler(req, res);
  };
}

function mount(dispatch) {
  router.post('/events', verifyAndParse('json'), makeEventsHandler(dispatch));
  router.post('/interactions', verifyAndParse('form'), makeRoutedInteractionsHandler(dispatch));
  router.post('/commands', verifyAndParse('form'), makeSlashCommandHandler(dispatch));
  return router;
}

module.exports = mount;
