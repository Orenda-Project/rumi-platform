/**
 * Discord modal-workaround renderer — the Flow-equivalent for Discord, but
 * shaped very differently from slack-modal-flow.js because of one hard
 * platform constraint: a Discord Modal (an interaction response of type
 * MODAL) may contain ONLY text inputs — no select menus, no buttons, no
 * checkboxes, ever. Slack's Block Kit modals can render an entire screen's
 * fields (selects included) in one shot; Discord cannot.
 *
 * The workaround, in two stages per screen:
 *   1. Enum fields are collected via ORDINARY chat messages carrying real
 *      select-menu components (Discord DOES support these outside a modal —
 *      the same "genuine native interactivity, not a text degradation"
 *      property Slack's Block Kit has). One message per field (or per
 *      interaction round-trip, for a dependent 2-step field like the
 *      country/region picker), awaited via awaitMessageComponent.
 *   2. Once every enum field is answered, a REAL modal opens containing only
 *      whatever free-text fields remain (if any) — screens with zero
 *      enum fields (e.g. "add student": first_name/last_name) skip stage 1
 *      entirely; screens with zero remaining text fields (e.g. Discord's
 *      settings screen: language + framework, both selects) skip the modal
 *      entirely and call exchange() directly after stage 1.
 *
 * Like Slack, this calls a *-endpoint.js's own {init, exchange, back}
 * functions directly — the same "the endpoint is the renderer-agnostic
 * source of truth" insight, just with a two-stage renderer on top instead
 * of Slack's one-shot view.
 *
 * State-carrying — the one piece with no Slack equivalent needed: Slack's
 * `private_metadata` (up to 3000 chars, round-tripped automatically by
 * Slack on every view interaction) has no Discord analogue for a modal —
 * Discord's modal `customId` caps at 100 characters, nowhere near enough for
 * a JSON blob of {kind, screen, flowToken, collectedEnumAnswers}. So real
 * state is stored in Redis (via railway-redis.service.js, the same service
 * already used elsewhere in this codebase) under a short opaque token; the
 * modal's customId becomes just "<kind>:<token>". A short TTL (5 minutes) is
 * generous enough to fill a form but short enough that an abandoned flow's
 * Redis key self-cleans without a background sweep.
 */

const crypto = require('crypto');
const { logToFile } = require('../../utils/logger');
const redisService = require('../cache/railway-redis.service');

const STATE_KEY_PREFIX = 'discord_modal:';
const STATE_TTL_SECONDS = 300;

// Message ids that currently have an active collectEnumAnswers() collector
// awaiting a reply. Confirmed against the installed discord.js@14.27.0's own
// source (node_modules/discord.js/src/structures/InteractionCollector.js:120):
// Message#awaitMessageComponent's collector subscribes to Events.InteractionCreate
// on the SAME client discord-connection.js owns — Node's EventEmitter invokes
// EVERY listener for an event, not just one, so a matching interaction fires
// BOTH this collector's internal listener AND discord-events.adapter.js's own
// global interactionCreate listener, with no built-in "claiming" between them.
// discord-modal-interactions.handler.js#tryHandleCollected consults this set
// so that global listener can skip an interaction the collector below is
// already about to read and ack itself. Purely in-process (like
// discord-events.adapter.js's own dedup map) — a restart simply drops any
// in-flight collector, matching how a restart already drops Slack's own
// in-flight modal state (Redis TTL aside).
const activeCollectorMessageIds = new Set();

/** discord-modal-interactions.handler.js#tryHandleCollected's read of the set above. */
function isCollectorActiveForMessage(messageId) {
  return Boolean(messageId && activeCollectorMessageIds.has(messageId));
}

function isTerminalScreen(screen) {
  return screen === 'SUCCESS';
}

function mintToken() {
  return crypto.randomBytes(8).toString('hex'); // 16 hex chars — well under the 100-char customId cap alongside a "<kind>:" prefix
}

/** Stores modal state under a fresh short token, returning that token for use in a modal's customId. */
async function storeModalState(state) {
  const token = mintToken();
  await redisService.set(`${STATE_KEY_PREFIX}${token}`, state, STATE_TTL_SECONDS);
  return token;
}

/** Recovers the state a storeModalState() call saved. redisService.get already JSON-parses; null if expired/missing. */
async function loadModalState(token) {
  return redisService.get(`${STATE_KEY_PREFIX}${token}`);
}

/** Explicitly clears state once consumed, rather than waiting out the TTL. */
async function deleteModalState(token) {
  await redisService.delete(`${STATE_KEY_PREFIX}${token}`);
}

const LOOP_STATE_KEY_PREFIX = 'discord_modal_loop:';

/**
 * Stores a loop screen's response {screen, data} keyed by flowToken (not a
 * fresh token — a later "Add Another"/"I'm Done" BUTTON click needs to look
 * this up by the flowToken it already carries in its own customId, unlike a
 * modal submission which decodes its token straight off the customId).
 * Used by config.onScreenLoop's caller (e.g. discord-flow-registry.js's
 * attendance registration) to resume runScreen()/exchange() on the next
 * button click, since nothing else keeps this response alive between the
 * loop message being sent and the teacher's next action.
 */
async function storeLoopScreenData(flowToken, screen, data) {
  await redisService.set(`${LOOP_STATE_KEY_PREFIX}${flowToken}`, { screen, data }, STATE_TTL_SECONDS);
}

async function loadLoopScreenData(flowToken) {
  return redisService.get(`${LOOP_STATE_KEY_PREFIX}${flowToken}`);
}

async function deleteLoopScreenData(flowToken) {
  await redisService.delete(`${LOOP_STATE_KEY_PREFIX}${flowToken}`);
}

/** Builds the "<kind>:<token>" customId a modal/select menu carries, and splits it back apart on submission. */
function encodeCustomId(kind, token) {
  return `${kind}:${token}`;
}

function decodeCustomId(customId) {
  const idx = String(customId || '').indexOf(':');
  if (idx === -1) return { kind: null, token: null };
  return { kind: customId.slice(0, idx), token: customId.slice(idx + 1) };
}

/**
 * Sends ONE OR MORE select-menu messages — one per enum field, or one per
 * interaction round-trip for a dependent multi-step field (e.g. the
 * country/region picker: pick a region, THEN pick a country within it) —
 * collecting each answer via awaitMessageComponent before sending the next.
 *
 * Every step EXCEPT THE LAST is acked here (deferUpdate()) once its answer
 * is read, since another select-menu message follows immediately. The LAST
 * step's interaction is deliberately left UN-acked and returned to the
 * caller: if a modal follows, interaction.showModal() must be THAT
 * interaction's own direct acknowledgment (it cannot follow a prior
 * deferUpdate() on the same interaction) — see openTextFieldsModal's own
 * doc comment. A caller with no modal to show (an all-enum screen) must ack
 * it itself (deferUpdate()) before calling exchange().
 *
 * @param {import('discord.js').User} user
 * @param {Array<{
 *   fieldName: string,
 *   promptText: string,
 *   buildMenu: (answersSoFar: object) => import('discord.js').StringSelectMenuBuilder,
 *   multi?: boolean,
 * }>} steps - `multi: true` reads ALL selected values (a real multi-select field, e.g. "subjects"); otherwise only the first.
 * @param {number} [timeoutMs=120000] - how long to wait for each step's reply
 * @returns {Promise<{answers: object, lastInteraction: import('discord.js').StringSelectMenuInteraction}|null>}
 *   null if any step timed out
 */
async function collectEnumAnswers(user, steps, timeoutMs = 120_000) {
  // eslint-disable-next-line global-require -- lazy: avoids requiring discord.js at module load
  const { ActionRowBuilder } = require('discord.js');
  const answers = {};
  const dmChannel = user.dmChannel || await user.createDM();
  let lastInteraction = null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const menu = step.buildMenu(answers);
    const row = new ActionRowBuilder().addComponents(menu);
    // eslint-disable-next-line no-await-in-loop -- each step depends on the previous answer, must be sequential
    const sent = await dmChannel.send({ content: step.promptText, components: [row] });
    activeCollectorMessageIds.add(sent.id);

    let interaction;
    try {
      // eslint-disable-next-line no-await-in-loop -- see above
      interaction = await sent.awaitMessageComponent({ time: timeoutMs });
    } catch (error) {
      logToFile('ℹ️ Discord modal-flow: enum-collection step timed out', { fieldName: step.fieldName });
      return null;
    } finally {
      activeCollectorMessageIds.delete(sent.id);
    }

    answers[step.fieldName] = step.multi ? interaction.values : interaction.values?.[0];

    const isLastStep = i === steps.length - 1;
    if (isLastStep) {
      lastInteraction = interaction; // left un-acked — see doc comment above
    } else {
      // eslint-disable-next-line no-await-in-loop -- see above
      await interaction.deferUpdate();
    }
  }

  return { answers, lastInteraction };
}

/**
 * Opens the modal for whatever free-text fields remain, stashing the
 * already-collected enum answers (plus kind/screen/flowToken) under a
 * short Redis-backed token carried in the modal's customId.
 *
 * MUST be called as the direct, synchronous acknowledgment of the
 * triggering interaction — interaction.showModal() cannot follow a prior
 * deferReply()/deferUpdate() on the SAME interaction. Every caller here is
 * itself the last enum-collection step's interaction, or a plain button
 * click for a screen with no enum fields at all — never a re-used stale one.
 *
 * @param {object} args
 * @param {import('discord.js').Interaction} args.interaction - must support showModal()
 * @param {string} args.kind
 * @param {string} args.screen
 * @param {string} args.flowToken
 * @param {object} args.collectedEnumAnswers
 * @param {object} args.carriedData - this screen's own init()/exchange() response data, round-tripped
 *   back to mergeScreenData() on submission — carries fields like attendance's
 *   `_list_id`/`_class_display` that aren't collected from the teacher at all,
 *   just threaded through from the previous screen's response.
 * @param {Array<{name: string, label: string, multiline?: boolean, required?: boolean}>} args.textFields
 * @param {string} args.title
 */
async function openTextFieldsModal({ interaction, kind, screen, flowToken, collectedEnumAnswers, carriedData, textFields, title }) {
  // eslint-disable-next-line global-require -- lazy: avoids requiring discord.js at module load
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

  const token = await storeModalState({ kind, screen, flowToken, collectedEnumAnswers, carriedData });
  const modal = new ModalBuilder().setCustomId(encodeCustomId(kind, token)).setTitle(title.slice(0, 45));

  for (const field of textFields) {
    const input = new TextInputBuilder()
      .setCustomId(field.name)
      .setLabel(field.label.slice(0, 45))
      .setStyle(field.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(Boolean(field.required));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  await interaction.showModal(modal);
}

/**
 * Reads every TextInputComponent's value off a submitted modal interaction,
 * keyed by the customId each field was given in openTextFieldsModal.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @returns {object}
 */
function readModalTextAnswers(interaction) {
  const answers = {};
  for (const [customId, component] of interaction.fields.fields) {
    answers[customId] = component.value;
  }
  return answers;
}

/**
 * @param {object} config
 * @param {string} config.kind - registry key, e.g. 'registration'
 * @param {(ctx: object) => Promise<{screen: string, data: object}>} config.init
 * @param {(ctx: object, screen: string, screenData: object) => Promise<{screen: string, data: object} | {data: {error: {message: string}}}>} config.exchange
 * @param {(ctx: object, screen: string) => Promise<{screen: string, data: object}>} [config.back]
 * @param {(screen: string, data: object) => {steps: Array, textFields: Array, title: string}} config.screenToSteps -
 *   returns this screen's collectEnumAnswers `steps` (empty array if none) and remaining `textFields` (empty array if none)
 * @param {(screen: string, enumAnswers: object, modalAnswers: object, carriedData: object) => object} config.mergeScreenData -
 *   combines the collected enum/text answers into the single screenData object exchange() expects.
 *   `carriedData` is this screen's own init()/exchange() response `data` — for fields that aren't
 *   collected from the teacher at all, just threaded through unchanged (e.g. attendance's
 *   `_list_id`/`_class_display`/`_action`); most views ignore this 4th argument entirely.
 * @param {(response: {screen: string, data: object}, ctx: object) => Promise<void>} [config.onFinish] - called once, on the terminal screen
 * @param {Set<string>} [config.loopScreens] - screen names that re-visit themselves in a loop
 *   (e.g. attendance's ADD_STUDENT, added again each time a student is added) where the DEFAULT
 *   auto-recursion into runScreen() is WRONG: it would immediately reopen a modal reusing an
 *   already-acked interaction, which Discord's showModal() forbids (it must be a fresh
 *   interaction's direct ack, never following a prior deferUpdate()). When exchange() returns a
 *   screen in this set, config.onScreenLoop is called INSTEAD of recursing.
 * @param {(response: {screen: string, data: object}, ctx: object) => Promise<void>} [config.onScreenLoop] -
 *   called for a loopScreens screen instead of auto-recursing — e.g. attendance's Discord view
 *   sends a fresh "Add Another / I'm Done" button message rather than reopening the modal outright.
 */
function buildEndpointModal(config) {
  const { kind, init, exchange, back, screenToSteps, mergeScreenData, onFinish, loopScreens, onScreenLoop } = config;

  if (!kind || typeof init !== 'function' || typeof exchange !== 'function'
      || typeof screenToSteps !== 'function' || typeof mergeScreenData !== 'function') {
    throw new Error('discord-modal-flow: buildEndpointModal needs { kind, init, exchange, screenToSteps, mergeScreenData }');
  }

  return {
    kind,

    /**
     * Runs a screen end-to-end: collects any enum fields via chat messages,
     * then either opens a modal for the remaining text fields (if any) or —
     * for an all-enum screen like Discord's settings — acks, calls
     * exchange(), and recurses into the NEXT screen directly (there is no
     * other driver advancing a Discord flow screen-to-screen the way Slack's
     * view_submission naturally does one view at a time).
     *
     * The interaction ultimately used to ack (either by showing a modal or
     * by deferUpdate()+exchange()) is always the LAST one reached: the final
     * enum step's own interaction if this screen has any enum fields, or the
     * original trigger interaction if it has none at all (e.g. "add student",
     * whose fields are pure text).
     *
     * @param {object} ctx - {userId, discordUserId, flowToken}
     * @param {import('discord.js').Interaction} triggerInteraction - the button/select/modal-submit interaction that reached this screen
     * @param {string} screen
     * @param {object} data - this screen's init()/exchange() response data
     * @returns {Promise<'awaiting_modal'|'finished'|'timed_out'>}
     */
    async runScreen(ctx, triggerInteraction, screen, data) {
      const { steps, textFields, title } = screenToSteps(screen, data);

      let enumAnswers = {};
      let ackInteraction = triggerInteraction;
      if (steps.length) {
        const user = await triggerInteraction.client.users.fetch(ctx.discordUserId);
        const collected = await collectEnumAnswers(user, steps);
        if (!collected) return 'timed_out';
        enumAnswers = collected.answers;
        ackInteraction = collected.lastInteraction; // left un-acked by collectEnumAnswers, ready for either path below
      }

      if (!textFields.length) {
        // No free text left on this screen — ack the last interaction
        // ourselves (no modal to ack it) and go straight to exchange().
        await ackInteraction.deferUpdate();
        const screenData = mergeScreenData(screen, enumAnswers, {}, data);
        return this._advance(ctx, ackInteraction, screen, screenData);
      }

      await openTextFieldsModal({
        interaction: ackInteraction, kind, screen, flowToken: ctx.flowToken,
        collectedEnumAnswers: enumAnswers, carriedData: data, textFields, title,
      });
      return 'awaiting_modal';
    },

    /**
     * Calls exchange() for a screen whose acknowledgment is already handled
     * (either an all-enum screen's deferUpdate(), or a submitted modal), and
     * either finishes the flow or recurses into runScreen() for whatever
     * screen exchange() returns next.
     */
    async _advance(ctx, ackedInteraction, screen, screenData) {
      const response = await exchange(ctx, screen, screenData);

      if (response?.data?.error) {
        logToFile('⚠️ Discord modal-flow: exchange() returned a validation error with no modal open to re-show it on', {
          kind, screen, error: response.data.error.message,
        });
        return 'finished';
      }
      if (isTerminalScreen(response.screen)) {
        if (onFinish) await onFinish(response, ctx);
        return 'finished';
      }
      if (loopScreens && loopScreens.has(response.screen) && onScreenLoop) {
        // Persisted BEFORE calling the hook — resumeLoopScreen() (below) is
        // how a later "Add Another"/"I'm Done" button click continues this
        // exact screen with its own fresh interaction, since runScreen()'s
        // caller here (ackedInteraction, already consumed) can't be reused.
        await storeLoopScreenData(ctx.flowToken, response.screen, response.data);
        await onScreenLoop(response, ctx, ackedInteraction);
        return 'awaiting_choice';
      }
      return this.runScreen(ctx, ackedInteraction, response.screen, response.data);
    },

    /**
     * Resumes a loopScreens screen from a FRESH interaction (e.g. the "Add
     * Another" button click) — recovers {screen, data} that _advance()
     * persisted via storeLoopScreenData() right before calling onScreenLoop(),
     * since the interaction that reached that screen has already been
     * consumed and can't directly ack a new modal itself.
     */
    async resumeLoopScreen(ctx, triggerInteraction) {
      const stored = await loadLoopScreenData(ctx.flowToken);
      if (!stored) return 'expired';
      await deleteLoopScreenData(ctx.flowToken);
      return this.runScreen(ctx, triggerInteraction, stored.screen, stored.data);
    },

    /**
     * Called from discord-modal-interactions.handler.js#triggerFlow — the
     * Discord analogue of Slack's handleOpenModal, but there is no
     * proactive "open a modal into someone's DM" the way Slack's trigger_id
     * allows: this must be called as the ack of a REAL interaction (a button
     * click on a "Get started"-style message), never invoked out of the blue.
     */
    async startFlow(ctx, triggerInteraction) {
      const response = await init(ctx);
      return this.runScreen(ctx, triggerInteraction, response.screen, response.data);
    },

    /** Called from discord-modal-interactions.handler.js#handleModalSubmit. */
    async handleModalSubmit(interaction, state) {
      const modalAnswers = readModalTextAnswers(interaction);
      const ctx = { userId: state.flowToken.split(':')[0], discordUserId: interaction.user.id, flowToken: state.flowToken };
      const screenData = mergeScreenData(state.screen, state.collectedEnumAnswers, modalAnswers, state.carriedData);
      // A modal's own submission is itself the interaction to ack — no prior
      // deferUpdate() needed (unlike the all-enum path in runScreen), since
      // the modal was shown as the direct response to the PREVIOUS
      // interaction, and submitting it is a fresh one of its own.
      await interaction.deferUpdate();
      return this._advance(ctx, interaction, state.screen, screenData);
    },

    /**
     * Called from a "Back" button click — a real button, not Slack's native
     * modal-stack pop (Discord has no modal stack at all here; every screen
     * is its own fresh enum-collector-then-modal sequence). Re-runs the
     * previous screen from scratch via runScreen(), the same as arriving at
     * it forward would.
     */
    async handleBack(ctx, triggerInteraction, screen) {
      if (!back) return null;
      const response = await back(ctx, screen);
      return this.runScreen(ctx, triggerInteraction, response.screen, response.data);
    },
  };
}

module.exports = {
  buildEndpointModal,
  collectEnumAnswers,
  openTextFieldsModal,
  readModalTextAnswers,
  storeModalState,
  loadModalState,
  deleteModalState,
  storeLoopScreenData,
  loadLoopScreenData,
  deleteLoopScreenData,
  encodeCustomId,
  decodeCustomId,
  isTerminalScreen,
  isCollectorActiveForMessage,
};
