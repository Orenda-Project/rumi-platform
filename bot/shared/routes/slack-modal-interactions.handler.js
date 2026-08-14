/**
 * Slack modal interaction handling — the counterpart to
 * flow-endpoint.routes.js's registration/settings blocks, but for Slack's
 * Interactivity payload shapes instead of Meta's encrypted Flow envelope.
 *
 * Handles the three modal-specific interaction shapes Slack sends, none of
 * which are ordinary chat button/select clicks (those stay
 * slack-events.adapter.js's job):
 *   - block_actions with an `open_modal:<kind>` action_id — opens the FIRST
 *     modal view for that Flow-equivalent kind.
 *   - view_submission — the modal's Next/Save/Finish button; advances or
 *     completes the flow.
 *   - block_actions with a `<kind>_back` action_id — the modal's own Back
 *     button (not Slack's native stack pop — see slack-modal-flow.js's file
 *     header for why registration needs real server-side back navigation).
 */

const { logToFile } = require('../utils/logger');
const flowRegistry = require('./slack-flow-registry');
const slackWebClient = require('./../services/messaging/slack-web-client');
const { decodeMetadata } = require('../services/messaging/slack-modal-flow');
const { getOrCreateUserByChannel } = require('../database/bot-helpers');

const OPEN_MODAL_PREFIX = 'open_modal:';
const BACK_ACTION_SUFFIX = '_back';

function isOpenModalAction(actionId) {
  return typeof actionId === 'string' && actionId.startsWith(OPEN_MODAL_PREFIX);
}

function isBackAction(actionId) {
  return typeof actionId === 'string' && actionId.endsWith(BACK_ACTION_SUFFIX);
}

function kindFromBackAction(actionId) {
  return actionId.slice(0, -BACK_ACTION_SUFFIX.length);
}

function buildCtx(slackUserId, flowToken) {
  return { userId: flowToken.split(':')[0] || null, slackUserId, flowToken };
}

/**
 * A `block_actions` payload whose first action opens a modal
 * (`open_modal:<kind>`). Returns true if this payload was handled here.
 */
async function handleOpenModal(payload) {
  const action = payload?.actions?.[0];
  if (!action || !isOpenModalAction(action.action_id)) return false;

  flowRegistry.ensureRegistered();
  const kind = action.action_id.slice(OPEN_MODAL_PREFIX.length);
  const renderer = flowRegistry.get(kind);
  if (!renderer) {
    logToFile('⚠️ Slack modal: no renderer registered for kind', { kind });
    return true;
  }

  const slackUserId = payload.user?.id;
  // registration/settings endpoints key everything off the DB user's UUID
  // (flow_token = "userId:kind:timestamp", parsed as flow_token.split(':')[0]
  // by the same convention flow-endpoint.routes.js uses for Meta) — never
  // the Slack user id itself. Resolves/creates the multi-homed user row the
  // same way whatsapp-bot.js's ordinary dispatch already does for messages.
  const user = await getOrCreateUserByChannel('slack', slackUserId);
  const flowToken = flowRegistry.buildFlowToken(user.id, kind);
  const ctx = buildCtx(slackUserId, flowToken);

  try {
    const view = await renderer.buildInitialView(ctx);
    await slackWebClient.openView(payload.trigger_id, view);
  } catch (error) {
    logToFile('❌ Slack modal: failed to open initial view', { kind, error: error.message, stack: error.stack });
  }
  return true;
}

/**
 * A `block_actions` payload whose action is a modal's own Back button
 * (`<kind>_back`). Returns true if this payload was handled here.
 */
async function handleBackButton(payload) {
  const action = payload?.actions?.[0];
  if (!action || !isBackAction(action.action_id)) return false;

  flowRegistry.ensureRegistered();
  const kind = kindFromBackAction(action.action_id);
  const renderer = flowRegistry.get(kind);
  if (!renderer) return true;

  const { screen, flowToken } = decodeMetadata(payload.view?.private_metadata);
  const ctx = buildCtx(payload.user?.id, flowToken);

  try {
    const previousView = await renderer.handleBack(ctx, screen);
    if (previousView) {
      await slackWebClient.updateView(payload.view.id, previousView);
    }
  } catch (error) {
    logToFile('❌ Slack modal: BACK handling failed', { kind, screen, error: error.message, stack: error.stack });
  }
  return true;
}

/**
 * A `view_submission` payload — the modal's Next/Save/Finish button.
 * Returns the response Slack expects back in the HTTP response body
 * (a `response_action`), or null if this kind has no registered renderer.
 */
async function handleViewSubmission(payload) {
  flowRegistry.ensureRegistered();
  const { kind, screen, flowToken } = decodeMetadata(payload.view?.private_metadata);
  const renderer = flowRegistry.get(kind);
  if (!renderer) {
    logToFile('⚠️ Slack modal: no renderer registered for view_submission kind', { kind });
    return null;
  }

  const ctx = buildCtx(payload.user?.id, flowToken);
  const stateValues = payload.view?.state?.values || {};

  try {
    return await renderer.handleSubmission(ctx, screen, stateValues);
  } catch (error) {
    logToFile('❌ Slack modal: view_submission handling failed', { kind, screen, error: error.message, stack: error.stack });
    return { response_action: 'errors', errors: {} };
  }
}

module.exports = {
  handleOpenModal,
  handleBackButton,
  handleViewSubmission,
  isOpenModalAction,
  isBackAction,
  OPEN_MODAL_PREFIX,
};
