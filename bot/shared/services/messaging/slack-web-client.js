/**
 * Thin wrapper around @slack/web-api's WebClient for the modal renderer and
 * anything else that needs to open/push/update a modal or post a plain
 * message outside the normal send-driver path (slack-channel.service.js
 * covers ordinary outbound sends; this file exists so slack-modal-flow.js
 * and slack-flow-registry.js never import @slack/web-api directly — every
 * test mocks THIS module instead, never the real Slack SDK).
 *
 * Lazy client construction mirrors slack-channel.service.js's own
 * convention — nothing touches @slack/web-api until a call actually happens.
 */

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  // eslint-disable-next-line global-require -- lazy on purpose; see file header
  const { WebClient } = require('@slack/web-api');
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('slack-web-client: SLACK_BOT_TOKEN is not set');
  }
  cachedClient = new WebClient(token);
  return cachedClient;
}

/** Opens a NEW modal from a trigger_id (must be used within Slack's ~3s window). */
async function openView(triggerId, view) {
  const client = getClient();
  return client.views.open({ trigger_id: triggerId, view });
}

/** Pushes a new view onto an already-open modal's stack. */
async function pushView(triggerId, view) {
  const client = getClient();
  return client.views.push({ trigger_id: triggerId, view });
}

/** Replaces the CURRENT view in place (used for BACK navigation). */
async function updateView(viewId, view) {
  const client = getClient();
  return client.views.update({ view_id: viewId, view });
}

/** Posts a plain message to a Slack user's DM — used by onFinish handlers on a completed flow. */
async function postMessage(slackUserId, text) {
  const client = getClient();
  const opened = await client.conversations.open({ users: slackUserId });
  const channel = opened?.channel?.id;
  if (!channel) throw new Error(`slack-web-client: could not open a DM with user ${slackUserId}`);
  return client.chat.postMessage({ channel, text });
}

module.exports = { openView, pushView, updateView, postMessage };
