/**
 * Slack Flow-equivalent registry — maps a Slack view's `callback_id` (a
 * kind: 'registration', 'settings', ...) to the renderer built for that
 * endpoint. Mirrors flow-endpoint.routes.js's per-endpoint require block,
 * collapsed into a lookup instead of N Express routes — Slack posts every
 * interaction to the SAME Request URL (unlike Meta, which gives each Flow
 * its own registered endpoint URL), so fan-out has to happen in code
 * regardless of how many Flow-equivalents exist.
 *
 * Lazily registered (first use, not at require time) to avoid a require
 * cycle through supabase / whatsapp.service — same rationale as
 * text-flow-definitions.js's ensureRegistered().
 */

const { buildEndpointModal } = require('../services/messaging/slack-modal-flow');
const slackWebClient = require('../services/messaging/slack-web-client');

const registry = new Map();

function register(kind, renderer) {
  registry.set(kind, renderer);
}

function get(kind) {
  return registry.get(kind);
}

function registerAll() {
  const registration = require('./registration-endpoint');
  const registrationView = require('./slack-views/registration.view');
  register('registration', buildEndpointModal({
    kind: 'registration',
    init: (ctx) => registration.handleRegistrationInit(ctx.userId),
    exchange: (ctx, screen, screenData) =>
      registration.handleRegistrationDataExchange(ctx.userId, screen, screenData, ctx.flowToken),
    back: (ctx, screen) => registration.handleRegistrationBack(ctx.userId, screen, ctx.flowToken),
    screenToView: registrationView.screenToView,
    viewToScreenData: registrationView.viewToScreenData,
    firstInputBlockId: registrationView.FIRST_INPUT_BLOCK_ID,
    onFinish: async (response, ctx) => {
      const { welcome_message: welcome, portal_message: portal } = response.data || {};
      const text = [welcome, portal].filter(Boolean).join('\n\n');
      if (text) await slackWebClient.postMessage(ctx.slackUserId, text);
    },
  }));

  const settings = require('./settings-endpoint');
  const settingsView = require('./slack-views/settings.view');
  register('settings', buildEndpointModal({
    kind: 'settings',
    init: (ctx) => settings.handleSettingsInit(ctx.userId),
    exchange: (ctx, screen, screenData) =>
      settings.handleSettingsDataExchange(ctx.userId, screen, screenData, ctx.flowToken),
    back: (ctx, screen) => settings.handleSettingsBack(ctx.userId, screen, ctx.flowToken),
    screenToView: settingsView.screenToView,
    viewToScreenData: settingsView.viewToScreenData,
    firstInputBlockId: settingsView.FIRST_INPUT_BLOCK_ID,
    onFinish: async (response, ctx) => {
      const { confirmation_message: confirmation, details_message: details } = response.data || {};
      const text = [confirmation, details].filter(Boolean).join('\n');
      if (text) await slackWebClient.postMessage(ctx.slackUserId, text);
    },
  }));
}

let registered = false;
function ensureRegistered() {
  if (registered) return;
  registerAll();
  registered = true;
}

/** Builds a fresh flow-token in this codebase's existing "userId:kind:timestamp" convention. */
function buildFlowToken(userId, kind) {
  return `${userId}:${kind}:${Date.now()}`;
}

module.exports = { register, get, ensureRegistered, buildFlowToken };
