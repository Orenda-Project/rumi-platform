/**
 * Slack Block Kit modal renderer — the Flow-equivalent for Slack, but NOT
 * built on text-flow.js's one-question-per-message engine. That engine
 * exists only because Baileys can't render a native multi-field form and
 * must degrade to asking one field at a time; Slack modals render a whole
 * screen's fields in ONE shot and submit them all at once via
 * view_submission, so reusing the step-sequencing machinery here would
 * degrade a channel that doesn't need degrading.
 *
 * Instead, this calls a *-endpoint.js's own {init, exchange, back} functions
 * directly — the same "the endpoint is the renderer-agnostic source of
 * truth" insight endpoint-text-flow.js is built on, just with a much
 * thinner renderer on top, because Slack modals don't need step-flattening.
 *
 * State (which kind/screen a view represents, plus the endpoint's own
 * flowToken) is carried in Slack's own `private_metadata` field — Slack
 * round-trips this unchanged on every subsequent interaction against a view
 * or any view pushed from it, so no NEW Redis session is needed here; the
 * endpoint's own flowToken-keyed Redis state (already channel-scoped, since
 * a Slack flowToken is minted per-conversation, never shared across
 * channels) is reused unchanged.
 */

const { logToFile } = require('../../utils/logger');

function isTerminalScreen(screen) {
  return screen === 'SUCCESS';
}

function encodeMetadata(kind, screen, flowToken) {
  return JSON.stringify({ kind, screen, flowToken });
}

function decodeMetadata(privateMetadata) {
  try {
    return JSON.parse(privateMetadata || '{}');
  } catch (error) {
    logToFile('⚠️ slack-modal-flow: failed to decode private_metadata', { error: error.message });
    return {};
  }
}

/**
 * @param {object} config
 * @param {string} config.kind - registry key, e.g. 'registration'
 * @param {(ctx: object) => Promise<{screen: string, data: object}>} config.init
 * @param {(ctx: object, screen: string, screenData: object) => Promise<{screen: string, data: object} | {data: {error: {message: string}}}>} config.exchange
 * @param {(ctx: object, screen: string) => Promise<{screen: string, data: object}>} [config.back]
 * @param {(screen: string, data: object, ctx: object) => object} config.screenToView - builds a Slack `view` object for a screen
 * @param {(screen: string, stateValues: object) => object} config.viewToScreenData - extracts screenData from a view_submission's state.values
 * @param {Object<string, string>} config.firstInputBlockId - per-screen block_id to attach a validation error to (screen -> blockId)
 * @param {(response: {screen: string, data: object}, ctx: object) => Promise<void>} [config.onFinish] - called once, on the terminal screen
 */
function buildEndpointModal(config) {
  const { kind, init, exchange, back, screenToView, viewToScreenData, firstInputBlockId, onFinish } = config;

  if (!kind || typeof init !== 'function' || typeof exchange !== 'function'
      || typeof screenToView !== 'function' || typeof viewToScreenData !== 'function') {
    throw new Error('slack-modal-flow: buildEndpointModal needs { kind, init, exchange, screenToView, viewToScreenData }');
  }

  return {
    kind,

    /** Called when a shortcut/button opens the FIRST modal. Returns a Slack `views.open` `view` argument. */
    async buildInitialView(ctx) {
      const response = await init(ctx);
      const metadata = encodeMetadata(kind, response.screen, ctx.flowToken);
      return screenToView(response.screen, response.data, { ...ctx, metadata });
    },

    /**
     * Called from a `view_submission` interaction.
     * @returns one of:
     *   {response_action: 'push', view} — advance to the next screen
     *   {response_action: 'clear'}      — the flow finished (terminal screen)
     *   {response_action: 'errors', errors: {blockId: message}} — validation failure, modal stays open
     */
    async handleSubmission(ctx, screen, stateValues) {
      const screenData = viewToScreenData(screen, stateValues);
      const response = await exchange(ctx, screen, screenData);

      if (response?.data?.error) {
        const blockId = (firstInputBlockId || {})[screen];
        return {
          response_action: 'errors',
          errors: { [blockId]: response.data.error.message },
        };
      }

      if (isTerminalScreen(response.screen)) {
        if (onFinish) await onFinish(response, ctx);
        return { response_action: 'clear' };
      }

      const metadata = encodeMetadata(kind, response.screen, ctx.flowToken);
      const nextView = screenToView(response.screen, response.data, { ...ctx, metadata });
      return { response_action: 'push', view: nextView };
    },

    /**
     * Called from a "Back" button click (a block_actions interaction on a
     * per-screen Back element, NOT Slack's native modal-stack pop — see the
     * file header on registration's country-dependent branching, which a
     * client-side pop cannot express).
     * @returns the previous screen's Slack view, for a `views.update` call.
     */
    async handleBack(ctx, screen) {
      if (!back) return null;
      const response = await back(ctx, screen);
      const metadata = encodeMetadata(kind, response.screen, ctx.flowToken);
      return screenToView(response.screen, response.data, { ...ctx, metadata });
    },
  };
}

module.exports = { buildEndpointModal, encodeMetadata, decodeMetadata, isTerminalScreen };
