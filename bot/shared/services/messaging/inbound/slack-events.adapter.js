/**
 * Slack inbound adapter — translates Slack Events API messages and
 * Interactivity (block_actions) payloads into the same Meta-webhook-shaped
 * payload bot/whatsapp-bot.js's handleWebhookPost(req, res) already parses
 * via shared/utils/validators.js#validateWebhookMessage. Mirrors
 * baileys-socket.adapter.js's role — a parallel entry path into the existing
 * ~1000-line dispatch logic, not a rewrite of it.
 *
 * Unlike Baileys (a persistent socket, so its adapter subscribes to an
 * event emitter), Slack is HTTP-webhook-based like Meta — this adapter is a
 * pair of Express route HANDLERS (handleEvent, handleInteraction), mounted
 * directly by whatsapp-bot.js, not a long-lived "attach" subscription.
 *
 * Identity: `from` is always the PREFIXED "slack:<slack-user-id>" identifier
 * (see channel-registry.js's CHANNEL_PREFIXES) — minted here, at the one
 * place Slack identities enter the system, then carried unchanged through
 * getOrCreateUserByChannel and every downstream send.
 *
 * Coverage: plain text messages (Events API `message` events) and button
 * clicks / select-menu choices (`block_actions` interactivity payloads) map
 * onto Meta's shape and reach the real handlers unchanged. Slack has no
 * Flow-submission equivalent here — that is slack-modal-flow.js's
 * `view_submission` handling, a separate route entirely (see
 * slack-interactions.routes.js).
 */

const { logToFile } = require('../../../utils/logger');
const { prefixFor } = require('../channel-registry');

const SLACK_PREFIX = prefixFor('slack');
// A stable, non-test, non-zero entry id — passes validators.isTestWebhook().
const SYNTHETIC_ENTRY_ID = 'slack-events';

function toPrefixedIdentity(slackUserId) {
  return `${SLACK_PREFIX}:${slackUserId}`;
}

// Media ids need the same "slack:" prefix as user identities — messaging/index.js's
// router (channel-registry.js#driverForIdentifier) dispatches getMediaInfo/downloadMedia
// calls by inspecting the id argument itself for a channel prefix. A bare Slack file id
// (e.g. "F0123FILE") has no colon, so without this prefix those calls would silently fall
// through to the WhatsApp-family driver instead of Slack's. slack-channel.service.js
// strips this same prefix before calling the real Slack Web API.
function toPrefixedMediaId(slackFileId) {
  return `${SLACK_PREFIX}:${slackFileId}`;
}

// Slack's audio-representable mimetypes — used only to pick "audio" vs "voice" the
// same way Meta's own message.type does; both map to handleVoiceMessage either way
// (see whatsapp-bot.js's messageType dispatch), so this only affects downstream framing.
const AUDIO_MIME_RE = /^audio\//i;
const IMAGE_MIME_RE = /^image\//i;

/**
 * Maps a Slack `file_share` message event's first file into a Meta-shaped
 * audio/image/document message — mirrors baileys-socket.adapter.js's own
 * mapToMetaShape for the same three types. Only the first file is handled
 * (matching Meta's own one-attachment-per-message model); a multi-file share
 * is otherwise ignored beyond that first file, same as Baileys' adapter.
 *
 * @param {object} event - Slack's inner `event` object (subtype 'file_share')
 * @returns {object|null} Meta-shaped message, or null to skip
 */
function mapFileShareToMetaShape(event) {
  if (!event || event.bot_id) return null;
  const file = event.files?.[0];
  if (!event.user || !file) return null;

  const from = toPrefixedIdentity(event.user);
  const timestamp = event.ts ? Math.floor(Number(event.ts)) : Math.floor(Date.now() / 1000);
  const id = event.ts || String(timestamp);
  const mediaId = toPrefixedMediaId(file.id);
  const mimeType = file.mimetype || 'application/octet-stream';

  if (AUDIO_MIME_RE.test(mimeType)) {
    return { from, id, timestamp, type: 'audio', audio: { id: mediaId, mime_type: mimeType } };
  }
  if (IMAGE_MIME_RE.test(mimeType)) {
    return { from, id, timestamp, type: 'image', image: { id: mediaId, mime_type: mimeType, caption: event.text || '' } };
  }
  return {
    from, id, timestamp, type: 'document',
    document: { id: mediaId, mime_type: mimeType, filename: file.name || 'file' },
  };
}

// Slack occasionally redelivers the identical event (its own documented
// at-least-once retry behavior, e.g. on a slow ack) — the same redelivery
// class Baileys' adapter guards against, same fix shape: an in-memory,
// TTL'd seen-id set checked synchronously before any async work.
const SEEN_EVENT_TTL_MS = 5 * 60 * 1000;
const seenEventIds = new Map(); // event_id (or ts fallback) -> firstSeenAt

function isDuplicateDelivery(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [seenId, seenAt] of seenEventIds) {
    if (now - seenAt > SEEN_EVENT_TTL_MS) seenEventIds.delete(seenId);
  }
  if (seenEventIds.has(id)) return true;
  seenEventIds.set(id, now);
  return false;
}

/** Test-only: clears the seen-event dedup cache between test runs. */
function _resetSeenEventsForTests() {
  seenEventIds.clear();
}

function buildSyntheticRequest(metaMessage) {
  return {
    body: {
      entry: [{
        id: SYNTHETIC_ENTRY_ID,
        changes: [{
          value: {
            messages: [metaMessage],
            metadata: {}, // no phone_number_id — validators.isOurPhoneNumber() auto-allows when absent
          },
        }],
      }],
    },
  };
}

function buildSyntheticResponse() {
  return {
    status(code) {
      return { send: (body) => logToFile('Slack inbound: synthetic response', { code, body }) };
    },
  };
}

/**
 * Maps a Slack Events API `message` event into Meta's message shape.
 * Only plain user-authored text messages are dispatchable — bot messages,
 * message-changed/deleted subtypes, and thread-broadcast echoes are skipped,
 * the same category of "not a genuine new inbound" Baileys' adapter filters
 * via hasDispatchableContent().
 *
 * @param {object} event - Slack's inner `event` object from an event_callback payload
 * @returns {object|null} Meta-shaped message, or null to skip
 */
function mapEventToMetaShape(event) {
  if (!event || event.bot_id) return null;
  // file_share carries the file(s), not text — dispatched separately, below.
  if (event.subtype && event.subtype !== 'file_share') return null;
  if (event.subtype === 'file_share') return mapFileShareToMetaShape(event);
  if (!event.user || !event.text) return null;

  const from = toPrefixedIdentity(event.user);
  const timestamp = event.ts ? Math.floor(Number(event.ts)) : Math.floor(Date.now() / 1000);

  return {
    from,
    id: event.ts,
    timestamp,
    type: 'text',
    text: { body: event.text },
  };
}

/**
 * Express handler for Slack's Events API Request URL.
 *
 * Handles the one-time `url_verification` handshake (echo `challenge` back,
 * unsigned — Slack sends this before SLACK_SIGNING_SECRET-based verification
 * is even meaningful to the requester) and real `event_callback` deliveries,
 * which ARE signature-verified by the caller before this handler runs (see
 * slack-interactions.routes.js — signature verification is a route-layer
 * concern, mirrored from how flow-endpoint.routes.js keeps FlowEncryptionService
 * out of the endpoint functions themselves).
 *
 * @param {(req: object, res: object) => Promise<void>} dispatch - handleWebhookPost from whatsapp-bot.js
 */
function makeEventsHandler(dispatch) {
  return async function handleSlackEvent(req, res) {
    const payload = req.body || {};

    if (payload.type === 'url_verification') {
      res.status(200).json({ challenge: payload.challenge });
      return;
    }

    // Ack immediately — Slack requires a response within 3s, and expects a
    // 2xx regardless of whether we act on the event.
    res.status(200).send('');

    if (payload.type !== 'event_callback') return;

    const event = payload.event;
    if (isDuplicateDelivery(payload.event_id)) {
      logToFile('⚠️ Slack inbound: duplicate event delivery skipped', { eventId: payload.event_id });
      return;
    }

    try {
      const metaMessage = mapEventToMetaShape(event);
      if (!metaMessage) return;

      const dispatchReq = buildSyntheticRequest(metaMessage);
      const dispatchRes = buildSyntheticResponse();
      await dispatch(dispatchReq, dispatchRes);
    } catch (error) {
      logToFile('❌ Slack inbound: error processing event', { error: error.message, stack: error.stack });
    }
  };
}

/**
 * Maps a Slack `block_actions` interactivity payload (a button click or
 * static_select choice) into Meta's `interactive.button_reply`/`list_reply`
 * shape — the identical branches whatsapp-bot.js's `messageType ===
 * 'interactive'` dispatch already handles for Meta and (via numeric-reply
 * resolution) for Baileys. Unlike Baileys, Slack's button `value`/selected
 * option `value` already IS the real Meta-shaped `id` (see
 * slack-channel.service.js's sendInteractiveButtons/sendInteractiveMessage),
 * so this is a direct field read, no pending-menu bookkeeping needed.
 *
 * @param {object} payload - the parsed `payload` JSON field from a block_actions interaction
 * @returns {object|null}
 */
function mapBlockActionToMetaShape(payload) {
  const action = payload?.actions?.[0];
  if (!action) return null;

  const from = toPrefixedIdentity(payload.user?.id);
  const timestamp = Math.floor(Date.now() / 1000);
  const id = payload.container?.message_ts || String(timestamp);

  if (action.type === 'button') {
    return {
      from,
      id,
      timestamp,
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: action.value, title: action.text?.text || action.value } },
    };
  }

  if (action.type === 'static_select') {
    const selected = action.selected_option;
    if (!selected) return null;
    return {
      from,
      id,
      timestamp,
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: selected.value, title: selected.text?.text || selected.value } },
    };
  }

  return null;
}

/**
 * Express handler for Slack's Interactivity Request URL — block_actions only.
 * `view_submission` (modal form submits) is handled by slack-modal-flow.js's
 * own dispatch, a separate concern from ordinary chat button/select clicks.
 *
 * @param {(req: object, res: object) => Promise<void>} dispatch
 */
function makeInteractionsHandler(dispatch) {
  return async function handleSlackInteraction(req, res) {
    let payload;
    try {
      payload = JSON.parse(req.body.payload);
    } catch (error) {
      res.status(400).send('Bad payload');
      return;
    }

    res.status(200).send('');

    if (payload.type !== 'block_actions') return; // view_submission etc. handled elsewhere

    try {
      const metaMessage = mapBlockActionToMetaShape(payload);
      if (!metaMessage) return;

      const dispatchReq = buildSyntheticRequest(metaMessage);
      const dispatchRes = buildSyntheticResponse();
      await dispatch(dispatchReq, dispatchRes);
    } catch (error) {
      logToFile('❌ Slack inbound: error processing interaction', { error: error.message, stack: error.stack });
    }
  };
}

/**
 * Maps a Slack Slash Command payload into the same Meta-shaped TEXT message
 * every `/command` in text-message.handler.js already parses via
 * `trimmedMessage === '/x'` / `.startsWith('/x ')` checks — no new command
 * vocabulary, this just reconstructs the plain-text form a WhatsApp/Baileys
 * user would have typed, so the existing ~2000-line waterfall of command
 * checks needs zero changes.
 *
 * Slack's Slash Command request is a DIFFERENT payload shape than
 * block_actions/view_submission: the command/text/user fields arrive at the
 * TOP LEVEL of the form-encoded body (no `payload` JSON wrapper), which is
 * why this is routed separately in slack-interactions.routes.js rather than
 * through makeInteractionsHandler's `JSON.parse(req.body.payload)` path.
 *
 * `/readingtest` is special-cased: text-message.handler.js matches it via an
 * EXACT string check (`'/reading test'` or `'/readingtest'`, no trailing-arg
 * parsing, unlike `/quiz`/`/video`), so any trailing free text after the
 * Slack command is intentionally dropped rather than appended.
 *
 * @param {object} body - the parsed top-level Slack Slash Command form body
 *   (fields: command, text, user_id, ...)
 * @returns {object|null} Meta-shaped text message, or null to skip
 */
function mapSlashCommandToMetaShape(body) {
  if (!body || !body.command || !body.user_id) return null;

  const command = String(body.command).trim(); // Slack always includes the leading "/"
  const trailingText = String(body.text || '').trim();
  const from = toPrefixedIdentity(body.user_id);
  const timestamp = Math.floor(Date.now() / 1000);

  const messageText = command === '/readingtest'
    ? '/readingtest'
    : (trailingText ? `${command} ${trailingText}` : command);

  return {
    from,
    id: `slash-${timestamp}-${body.user_id}`,
    timestamp,
    type: 'text',
    text: { body: messageText },
  };
}

/**
 * Express handler for Slack's Slash Command Request URL(s). Slack requires a
 * response within 3s same as Events API/Interactivity — acks immediately
 * with an empty 200 (no visible slash-command response bubble; Rumi's real
 * reply arrives moments later as an ordinary message, same UX as every other
 * async command reply on this channel).
 *
 * @param {(req: object, res: object) => Promise<void>} dispatch
 */
function makeSlashCommandHandler(dispatch) {
  return async function handleSlackSlashCommand(req, res) {
    res.status(200).send('');

    try {
      const metaMessage = mapSlashCommandToMetaShape(req.body);
      if (!metaMessage) return;

      const dispatchReq = buildSyntheticRequest(metaMessage);
      const dispatchRes = buildSyntheticResponse();
      await dispatch(dispatchReq, dispatchRes);
    } catch (error) {
      logToFile('❌ Slack inbound: error processing slash command', { error: error.message, stack: error.stack });
    }
  };
}

module.exports = {
  makeEventsHandler,
  makeInteractionsHandler,
  makeSlashCommandHandler,
  mapEventToMetaShape,
  mapFileShareToMetaShape,
  mapBlockActionToMetaShape,
  mapSlashCommandToMetaShape,
  toPrefixedIdentity,
  toPrefixedMediaId,
  isDuplicateDelivery,
  _resetSeenEventsForTests,
};
