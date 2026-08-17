/**
 * Discord inbound adapter — translates Gateway events into the same
 * Meta-webhook-shaped payload bot/whatsapp-bot.js's handleWebhookPost(req, res)
 * already parses via shared/utils/validators.js#validateWebhookMessage.
 * Mirrors baileys-socket.adapter.js's role and shape — a parallel entry path
 * into the existing ~1000-line dispatch logic, not a rewrite of it.
 *
 * Unlike Slack (pure HTTP webhook, so its adapter is a pair of Express route
 * HANDLERS), Discord uses the Gateway (a persistent WebSocket, like Baileys)
 * for full message support — this adapter is a long-lived event-emitter
 * `attach(dispatch)` subscription, structurally like baileys-socket.adapter.js,
 * not like slack-events.adapter.js's route factories.
 *
 * Key simplification, confirmed against discord.js@14.27.0: a bot using the
 * Gateway (with no separate HTTP "Interactions Endpoint URL" configured in
 * the Developer Portal) receives EVERYTHING over this one connection — plain
 * messages via `messageCreate`, and slash commands / button+select clicks /
 * modal submissions all via `interactionCreate`, discriminated by
 * interaction.isChatInputCommand()/.isButton()/.isStringSelectMenu()/
 * .isModalSubmit() type guards. There is no separate signed HTTP route to
 * build here at all, unlike Slack's HMAC-verified /api/slack/* routes.
 *
 * Identity: `from` is always the PREFIXED "discord:<snowflake>" identifier
 * (see channel-registry.js's CHANNEL_PREFIXES) — minted here, at the one
 * place Discord identities enter the system, then carried unchanged through
 * getOrCreateUserByChannel and every downstream send.
 *
 * Coverage: plain text messages, image/audio/document attachments (mapped by
 * content-type sniffing), slash commands, and ordinary chat button/select
 * clicks map onto Meta's shape and reach the real handlers unchanged. Modal
 * submissions and the enum-collector's own button/select interactions are
 * claimed FIRST by discord-modal-interactions.handler.js (a separate concern,
 * mirroring how Slack's view_submission is handled outside this file too) —
 * only interactions NOT claimed by that machinery fall through to the
 * ordinary chat mapping here.
 */

const { logToFile } = require('../../../utils/logger');
const { prefixFor } = require('../channel-registry');

const DISCORD_PREFIX = prefixFor('discord');
// A stable, non-test, non-zero entry id — passes validators.isTestWebhook().
const SYNTHETIC_ENTRY_ID = 'discord-gateway';

function toPrefixedIdentity(snowflake) {
  return `${DISCORD_PREFIX}:${snowflake}`;
}

// Media ids need the same "discord:" prefix as user identities — messaging/index.js's
// router (channel-registry.js#driverForIdentifier) dispatches getMediaInfo/downloadMedia
// calls by inspecting the id argument itself for a channel prefix. A bare Discord
// attachment id (e.g. a snowflake) has no colon, so without this prefix those calls
// would silently fall through to the WhatsApp-family driver instead of Discord's.
// discord-channel.service.js strips this same prefix before reading its media cache.
function toPrefixedMediaId(attachmentId) {
  return `${DISCORD_PREFIX}:${attachmentId}`;
}

const AUDIO_MIME_RE = /^audio\//i;
const IMAGE_MIME_RE = /^image\//i;

/**
 * Maps a Discord message's first attachment into a Meta-shaped audio/image/
 * document message — mirrors slack-events.adapter.js's mapFileShareToMetaShape
 * for the same three types. Only the first attachment is handled (matching
 * Meta's own one-attachment-per-message model), same as both other adapters.
 *
 * Unlike Slack/Baileys, no eager download happens here — Discord attachments
 * carry a durable, self-describing URL at receive time (attachment.url,
 * .contentType, .size), so only that metadata is cached (see
 * discord-channel.service.js#getMediaInfo's own doc comment on why this
 * differs from Slack's live files.info lookup and Baileys' eager-buffer cache).
 *
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').Attachment} attachment
 * @returns {object|null} Meta-shaped message, or null to skip
 */
function mapAttachmentToMetaShape(message, attachment) {
  const from = toPrefixedIdentity(message.author.id);
  const timestamp = Math.floor(message.createdTimestamp / 1000);
  const id = message.id;
  const base = { from, id, timestamp };

  const mediaId = toPrefixedMediaId(attachment.id);
  const mimeType = attachment.contentType || 'application/octet-stream';

  // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
  const discordChannel = require('../discord-channel.service');
  discordChannel._cacheIncomingMedia(mediaId, {
    url: attachment.url,
    mime_type: mimeType,
    file_size: attachment.size,
  });

  if (AUDIO_MIME_RE.test(mimeType)) {
    return { ...base, type: 'audio', audio: { id: mediaId, mime_type: mimeType } };
  }
  if (IMAGE_MIME_RE.test(mimeType)) {
    return { ...base, type: 'image', image: { id: mediaId, mime_type: mimeType, caption: message.content || '' } };
  }
  return {
    ...base, type: 'document',
    document: { id: mediaId, mime_type: mimeType, filename: attachment.name || 'file' },
  };
}

/**
 * Maps a Discord `messageCreate` event into Meta's message shape.
 * Only plain user-authored DM messages are dispatchable — bot messages and
 * non-DM channels are skipped, mirroring both other adapters' scoping to a
 * 1:1 conversation.
 *
 * @param {import('discord.js').Message} message
 * @returns {object|null} Meta-shaped message, or null to skip
 */
function mapMessageToMetaShape(message) {
  if (!message || message.author?.bot) return null;
  // Discord's DM channel type is 1 (ChannelType.DM) — scoping to DMs only,
  // matching Slack/Baileys' own 1:1-conversation-only scope.
  if (message.channel?.type !== 1) return null;

  const attachment = message.attachments?.first?.();
  if (attachment) return mapAttachmentToMetaShape(message, attachment);

  if (!message.content) return null;

  const from = toPrefixedIdentity(message.author.id);
  const timestamp = Math.floor(message.createdTimestamp / 1000);

  return {
    from,
    id: message.id,
    timestamp,
    type: 'text',
    text: { body: message.content },
  };
}

// Discord occasionally re-emits interaction/message events, and the Gateway
// itself can redeliver on reconnect — the same redelivery class both other
// adapters guard against, same fix shape: an in-memory, TTL'd seen-id set
// checked synchronously before any async work.
const SEEN_ID_TTL_MS = 5 * 60 * 1000;
const seenIds = new Map(); // message/interaction id -> firstSeenAt

function isDuplicateDelivery(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [seenId, seenAt] of seenIds) {
    if (now - seenAt > SEEN_ID_TTL_MS) seenIds.delete(seenId);
  }
  if (seenIds.has(id)) return true;
  seenIds.set(id, now);
  return false;
}

/** Test-only: clears the seen-id dedup cache between test runs. */
function _resetSeenIdsForTests() {
  seenIds.clear();
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
      return { send: (body) => logToFile('Discord inbound: synthetic response', { code, body }) };
    },
  };
}

/**
 * Maps a Discord button/select-menu interaction into Meta's
 * `interactive.button_reply`/`list_reply` shape — the identical branches
 * whatsapp-bot.js's `messageType === 'interactive'` dispatch already handles
 * for Meta/Slack. Discord's button `customId`/selected option `value` already
 * IS the real Meta-shaped `id` (see discord-channel.service.js's
 * sendInteractiveButtons/sendInteractiveMessage), so this is a direct field
 * read, no menu-bookkeeping needed — same reasoning as Slack's adapter.
 *
 * @param {import('discord.js').ButtonInteraction|import('discord.js').StringSelectMenuInteraction} interaction
 * @returns {object|null}
 */
function mapInteractionToMetaShape(interaction) {
  const from = toPrefixedIdentity(interaction.user.id);
  const timestamp = Math.floor(Date.now() / 1000);
  const id = interaction.message?.id || String(timestamp);

  if (interaction.isButton?.()) {
    return {
      from, id, timestamp, type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: interaction.customId, title: interaction.customId } },
    };
  }

  if (interaction.isStringSelectMenu?.()) {
    const value = interaction.values?.[0];
    if (!value) return null;
    return {
      from, id, timestamp, type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: value, title: value } },
    };
  }

  return null;
}

/**
 * Maps a Discord Slash Command (ChatInputCommandInteraction) into the same
 * Meta-shaped TEXT message every `/command` in text-message.handler.js
 * already parses via `trimmedMessage === '/x'` / `.startsWith('/x ')` checks
 * — no new command vocabulary, this just reconstructs the plain-text form a
 * WhatsApp/Slack user would have typed, so the existing command waterfall
 * needs zero changes. Mirrors slack-events.adapter.js#mapSlashCommandToMetaShape
 * exactly, including the `/readingtest` special-case (trailing text dropped,
 * since text-message.handler.js matches it via an exact string, not a prefix).
 *
 * Discord slash-command trailing text (if the command has a "text" option
 * registered — most of the 9 commands here take no options) arrives as a
 * named option, not free text after the command name.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {object|null} Meta-shaped text message, or null to skip
 */
function mapSlashCommandToMetaShape(interaction) {
  if (!interaction?.commandName || !interaction.user?.id) return null;

  const command = `/${interaction.commandName}`;
  const trailingText = String(interaction.options?.getString?.('text') || '').trim();
  const from = toPrefixedIdentity(interaction.user.id);
  const timestamp = Math.floor(Date.now() / 1000);

  const messageText = command === '/readingtest'
    ? '/readingtest'
    : (trailingText ? `${command} ${trailingText}` : command);

  return {
    from,
    id: `slash-${timestamp}-${interaction.user.id}`,
    timestamp,
    type: 'text',
    text: { body: messageText },
  };
}

/**
 * Attaches every Gateway listener this bot needs onto the shared client
 * discord-connection.js owns. Mirrors baileys-socket.adapter.js's attach()
 * shape: a long-lived subscription, not a per-request handler.
 *
 * @param {(req: object, res: object) => Promise<void>} dispatch  handleWebhookPost from whatsapp-bot.js
 */
async function attach(dispatch) {
  const connection = require('../discord-connection');
  const client = await connection.getClient();

  client.on('messageCreate', async (message) => {
    try {
      if (isDuplicateDelivery(message.id)) {
        logToFile('⚠️ Discord inbound: duplicate message delivery skipped', { messageId: message.id });
        return;
      }
      const metaMessage = mapMessageToMetaShape(message);
      if (!metaMessage) return;

      await dispatch(buildSyntheticRequest(metaMessage), buildSyntheticResponse());
    } catch (error) {
      logToFile('❌ Discord inbound: error processing message', { error: error.message, stack: error.stack });
    }
  });

  // interactionCreate fires for slash commands, component clicks (buttons/
  // selects), AND modal submissions, all over this SAME Gateway connection —
  // discriminated below by type guard. Every branch acks within Discord's
  // ~3s window before any slow work, mirroring Slack's own 3s ack constraint.
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand?.()) {
        if (isDuplicateDelivery(interaction.id)) return;
        await interaction.deferReply({ ephemeral: true });
        const metaMessage = mapSlashCommandToMetaShape(interaction);
        if (metaMessage) await dispatch(buildSyntheticRequest(metaMessage), buildSyntheticResponse());
        return;
      }

      if (interaction.isModalSubmit?.()) {
        // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
        const discordModalInteractions = require('../../../routes/discord-modal-interactions.handler');
        await discordModalInteractions.handleModalSubmit(interaction);
        return;
      }

      if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
        // Pre-modal-collector interactions (registration/settings/attendance/
        // exam-confirm's enum-picking steps) are claimed FIRST, then a
        // "Get started"-style flow-launch button, then attendance's own
        // "Add Another"/"I'm Done" loop buttons — only an interaction none of
        // those claim falls through to ordinary chat button/select mapping.
        // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
        const discordModalInteractions = require('../../../routes/discord-modal-interactions.handler');
        if (discordModalInteractions.tryHandleCollected(interaction)) return;
        if (await discordModalInteractions.tryHandleStartFlow(interaction)) return;
        if (await discordModalInteractions.tryHandleAttendanceLoopButton(interaction)) return;

        if (isDuplicateDelivery(interaction.id)) return;
        await interaction.deferUpdate();
        const metaMessage = mapInteractionToMetaShape(interaction);
        if (metaMessage) await dispatch(buildSyntheticRequest(metaMessage), buildSyntheticResponse());
      }
    } catch (error) {
      logToFile('❌ Discord inbound: error processing interaction', { error: error.message, stack: error.stack });
    }
  });

  logToFile('✅ Discord inbound listener attached', {});
}

module.exports = {
  attach,
  mapMessageToMetaShape,
  mapAttachmentToMetaShape,
  mapInteractionToMetaShape,
  mapSlashCommandToMetaShape,
  toPrefixedIdentity,
  toPrefixedMediaId,
  isDuplicateDelivery,
  _resetSeenIdsForTests,
};
