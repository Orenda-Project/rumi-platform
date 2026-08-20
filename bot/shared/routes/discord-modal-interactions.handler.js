/**
 * Discord modal-workaround interaction handling — the counterpart to
 * slack-modal-interactions.handler.js, but for discord.js's interaction
 * shapes instead of Slack's Interactivity payloads.
 *
 * Handles three interaction shapes discord-events.adapter.js routes here,
 * none of which are ordinary chat button/select clicks (those stay
 * discord-events.adapter.js's own job, mapped to Meta's button_reply/
 * list_reply shape):
 *   - a "Get started"-style button click — the Discord analogue of Slack's
 *     `open_modal:<kind>` block_actions, opening the FIRST screen of a
 *     registered flow kind.
 *   - a modal submission (isModalSubmit()) — advances or completes the flow.
 *   - a button/select click that belongs to an ACTIVE collectEnumAnswers()
 *     collector — claimed here FIRST via tryHandleCollected() so
 *     discord-events.adapter.js's own listener never double-acks or
 *     mis-dispatches it as an ordinary chat interaction.
 *
 * Why tryHandleCollected() must exist at all (confirmed against the
 * installed discord.js@14.27.0's own source, not assumed): Message#
 * awaitMessageComponent builds an InteractionCollector that subscribes to
 * Events.InteractionCreate on the SAME client discord-connection.js owns
 * (see node_modules/discord.js/src/structures/InteractionCollector.js:120).
 * Node's EventEmitter invokes EVERY listener registered for an event, not
 * just one — so a matching interaction fires BOTH the collector's internal
 * listener (which resolves collectEnumAnswers's own awaitMessageComponent
 * Promise) AND discord-events.adapter.js's global interactionCreate
 * listener, with no built-in "claiming" between them. Without this check,
 * the global listener would race the collector: calling deferUpdate() on an
 * interaction collectEnumAnswers's own loop is about to act on, and
 * dispatching a spurious button_reply/list_reply chat message mid-flow.
 * The active-collector registry itself lives in discord-modal-flow.js
 * (collectEnumAnswers registers/deregisters each step's message id there
 * directly) — this just reads it.
 */

const { logToFile } = require('../utils/logger');
const flowRegistry = require('./discord-flow-registry');
const { decodeCustomId, loadModalState, deleteModalState, isCollectorActiveForMessage } = require('../services/messaging/discord-modal-flow');
const { getOrCreateUserByChannel } = require('../database/bot-helpers');

const START_FLOW_PREFIX = 'discord_start_flow:';
const LOOP_ADD_PREFIX = 'discord_attendance_add:';
const LOOP_DONE_PREFIX = 'discord_attendance_done:';

function isStartFlowAction(customId) {
  return typeof customId === 'string' && customId.startsWith(START_FLOW_PREFIX);
}

/**
 * Splits "discord_start_flow:<kind>" or "discord_start_flow:<kind>:<sessionId>"
 * into its parts. The optional 3rd segment exists ONLY for exam_confirm,
 * whose flowToken must be the exam session's own session.id (passed in by
 * whoever sent this button — see exam-checker.handler.js's
 * trySendExamConfirmModalTrigger) rather than a freshly-minted
 * "userId:kind:timestamp" token. Every other kind's customId has no 3rd
 * segment at all — sessionId is null for those.
 */
function parseStartFlowAction(customId) {
  const rest = customId.slice(START_FLOW_PREFIX.length);
  const idx = rest.indexOf(':');
  if (idx === -1) return { kind: rest, sessionId: null };
  return { kind: rest.slice(0, idx), sessionId: rest.slice(idx + 1) };
}

function kindFromStartFlowAction(customId) {
  return parseStartFlowAction(customId).kind;
}

/**
 * Claims a button/select interaction that belongs to an in-flight
 * collectEnumAnswers() collector, so discord-events.adapter.js's own
 * listener skips it entirely (no deferUpdate(), no chat-shape dispatch) —
 * collectEnumAnswers's own awaitMessageComponent() call already handles
 * reading and acking it. Returns true if this interaction was claimed here.
 */
function tryHandleCollected(interaction) {
  return isCollectorActiveForMessage(interaction.message?.id);
}

/**
 * A button click starting a registered flow from scratch — the Discord
 * analogue of Slack's handleOpenModal. Every Discord flow (including its
 * very first screen) needs a real, current interaction to directly
 * acknowledge: there is no Slack-style trigger_id letting a flow open a
 * modal out of the blue, so feature-registration.service.js and friends
 * must first send a plain "Get started" button message, and this only
 * fires once that button is actually clicked.
 *
 * customId shape: "discord_start_flow:<kind>" for userId-keyed kinds
 * (registration/settings/attendance/reading_assessment), or
 * "discord_start_flow:<kind>:<sessionId>" for exam_confirm specifically —
 * see parseStartFlowAction()'s own doc comment.
 * @returns {Promise<boolean>} true if this interaction was handled here
 */
async function tryHandleStartFlow(interaction) {
  if (!interaction.isButton?.() || !isStartFlowAction(interaction.customId)) return false;

  const { kind, sessionId } = parseStartFlowAction(interaction.customId);
  flowRegistry.ensureRegistered();
  const renderer = flowRegistry.get(kind);
  if (!renderer) {
    logToFile('⚠️ Discord modal: no renderer registered for kind', { kind });
    await interaction.deferUpdate();
    return true;
  }

  const discordUserId = interaction.user.id;

  try {
    let ctx;
    if (sessionId) {
      // exam_confirm: flowToken IS the exam session's own session.id,
      // unchanged — never buildFlowToken()'s minted token. userId isn't
      // resolvable from discordUserId alone for this kind anyway; the
      // renderer's endpoint calls key everything off flowToken (the session
      // id) directly, and onFinish looks the session's own user_id back up.
      ctx = { userId: null, discordUserId, flowToken: sessionId };
    } else {
      // registration/settings/attendance/reading_assessment key everything
      // off the DB user's UUID (flowToken = "userId:kind:timestamp", parsed
      // via flowToken.split(':')[0], the same convention
      // flow-endpoint.routes.js uses for Meta) — never the Discord snowflake.
      const user = await getOrCreateUserByChannel('discord', discordUserId);
      ctx = { userId: user.id, discordUserId, flowToken: flowRegistry.buildFlowToken(user.id, kind) };
    }

    const result = await renderer.startFlow(ctx, interaction);
    if (result === 'timed_out') {
      // runScreen() gives up silently after 2 minutes with no reply from the
      // teacher on a select menu — without this, they're just left staring
      // at a menu that stopped working, with zero indication anything ended.
      const discordChannel = require('../services/messaging/discord-channel.service');
      await discordChannel.sendMessage(`discord:${discordUserId}`, 'That took too long to answer, so I\'ve stopped waiting. Send the command again whenever you\'re ready.');
    }
  } catch (error) {
    logToFile('❌ Discord modal: failed to start flow', { kind, error: error.message, stack: error.stack });
  }
  return true;
}

/**
 * The "Add Another"/"I'm Done" buttons attendance's onScreenLoop hook sends
 * after each student is added (see discord-flow-registry.js's own comment on
 * why the ADD_STUDENT loop can't use the generic modal-reopening
 * auto-recursion). customId shape: "discord_attendance_add:<flowToken>" /
 * "discord_attendance_done:<flowToken>".
 *   - "Add Another" resumes the ADD_STUDENT screen via renderer.resumeLoopScreen(),
 *     which re-opens a fresh modal directly acking THIS button click.
 *   - "I'm Done" calls exchange() directly with `_action: 'done'` — no modal
 *     needed for this action at all, matching the endpoint's own
 *     screenData._action contract.
 * @returns {Promise<boolean>} true if this interaction was handled here
 */
async function tryHandleAttendanceLoopButton(interaction) {
  if (!interaction.isButton?.()) return false;
  const customId = interaction.customId;
  const isAdd = typeof customId === 'string' && customId.startsWith(LOOP_ADD_PREFIX);
  const isDone = typeof customId === 'string' && customId.startsWith(LOOP_DONE_PREFIX);
  if (!isAdd && !isDone) return false;

  flowRegistry.ensureRegistered();
  const renderer = flowRegistry.get('attendance');
  if (!renderer) {
    logToFile('⚠️ Discord modal: no renderer registered for attendance');
    await interaction.deferUpdate();
    return true;
  }

  const flowToken = customId.slice((isAdd ? LOOP_ADD_PREFIX : LOOP_DONE_PREFIX).length);
  const ctx = { userId: flowToken.split(':')[0] || null, discordUserId: interaction.user.id, flowToken };

  try {
    if (isAdd) {
      const result = await renderer.resumeLoopScreen(ctx, interaction);
      if (result === 'timed_out') {
        const discordChannel = require('../services/messaging/discord-channel.service');
        await discordChannel.sendMessage(`discord:${interaction.user.id}`, 'That took too long to answer, so I\'ve stopped waiting. Send the command again whenever you\'re ready.');
      }
    } else {
      // "I'm Done" needs the same {list_id, class_display} the loop screen
      // was showing — recover it the same way resumeLoopScreen() would,
      // since exchange() expects ADD_STUDENT's screenData shape either way.
      const { loadLoopScreenData, deleteLoopScreenData } = require('../services/messaging/discord-modal-flow');
      const stored = await loadLoopScreenData(flowToken);
      await deleteLoopScreenData(flowToken);
      await interaction.deferUpdate();
      if (!stored) {
        logToFile('⚠️ Discord modal: attendance "I\'m Done" arrived after its loop state expired', { flowToken });
        return true;
      }
      await renderer._advance(ctx, interaction, 'ADD_STUDENT', {
        _action: 'done',
        _list_id: stored.data?.list_id,
        _class_display: stored.data?.class_display,
      });
    }
  } catch (error) {
    logToFile('❌ Discord modal: attendance loop button handling failed', { flowToken, isAdd, error: error.message, stack: error.stack });
  }
  return true;
}

/**
 * A modal submission (isModalSubmit()). Recovers {kind, screen, flowToken,
 * collectedEnumAnswers} from Redis via the token embedded in customId
 * ("<kind>:<token>"), merges in this submission's text-field answers, and
 * advances the flow. The Redis entry is deleted either way — a modal can
 * only be submitted once.
 */
async function handleModalSubmit(interaction) {
  const { kind, token } = decodeCustomId(interaction.customId);
  flowRegistry.ensureRegistered();
  const renderer = flowRegistry.get(kind);
  if (!renderer) {
    logToFile('⚠️ Discord modal: no renderer registered for modal-submit kind', { kind });
    await interaction.deferUpdate();
    return;
  }

  const state = await loadModalState(token);
  await deleteModalState(token);
  if (!state) {
    logToFile('⚠️ Discord modal: submission arrived after its state expired', { kind });
    await interaction.deferUpdate();
    return;
  }

  try {
    await renderer.handleModalSubmit(interaction, state);
  } catch (error) {
    logToFile('❌ Discord modal: handleModalSubmit failed', { kind, screen: state.screen, error: error.message, stack: error.stack });
  }
}

module.exports = {
  tryHandleStartFlow,
  tryHandleAttendanceLoopButton,
  tryHandleCollected,
  handleModalSubmit,
  isStartFlowAction,
  kindFromStartFlowAction,
  parseStartFlowAction,
  START_FLOW_PREFIX,
};
