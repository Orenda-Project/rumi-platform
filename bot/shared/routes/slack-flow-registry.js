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

  // attendance-setup-endpoint.js's own exchange() drives ADD_STUDENT's "Add &
  // Continue" loop by returning {screen: 'ADD_STUDENT', data: {...}} again
  // (non-terminal) on every add — buildEndpointModal's generic handleSubmission
  // already pushes that as the next view with no special-casing needed here,
  // unlike Discord's modal-workaround (which needs onScreenLoop/loopScreens
  // because showModal() must directly ack a fresh interaction, never a
  // response_action push). The "I'm Done" action is NOT a view_submission at
  // all — see slack-views/attendance.view.js's own header comment — it's a
  // block_actions click on the `attendance_finish` button living inside the
  // ADD_STUDENT view, handled by slack-modal-interactions.handler.js calling
  // attendance.handleDoneAction(...) directly (bypassing exchange()'s
  // screenData._action indirection entirely, since there's no view_submission
  // state to read it from for a plain button click).
  const attendance = require('./attendance-setup-endpoint');
  const attendanceView = require('./slack-views/attendance.view');
  register('attendance', buildEndpointModal({
    kind: 'attendance',
    init: (ctx) => attendance.handleSetupInit(ctx.userId),
    exchange: (ctx, screen, screenData) => attendance.handleSetupDataExchange(ctx.userId, screen, screenData),
    screenToView: attendanceView.screenToView,
    viewToScreenData: attendanceView.viewToScreenData,
    firstInputBlockId: attendanceView.FIRST_INPUT_BLOCK_ID,
    metadataCarry: attendanceView.metadataCarry,
    onFinish: async (response, ctx) => {
      const { success_message: success } = response.data || {};
      if (success) await slackWebClient.postMessage(ctx.slackUserId, success);
    },
  }));

  // exam_confirm's flowToken IS the exam session's own session.id (embedded
  // in the triggering button's action_id — see
  // slack-modal-interactions.handler.js's parseOpenModalAction()), never
  // buildFlowToken()'s minted "userId:kind:timestamp" token, matching
  // discord-flow-registry.js's identical exception and how the Meta Flow
  // already passes flowToken: session.id at sendFlow() time.
  //
  // exam-confirm-endpoint.js's own exchange() does NOT drive the exam
  // workflow forward — it only returns the selected student ids in
  // extension_message_response, matching the Meta Flow's NFM_REPLY shape. On
  // Meta, flow-response.handler.js's EXAM_CONFIRM_FLOW_ID branch is what
  // actually feeds that payload into ExamCheckerOrchestrator.process(), which
  // drives confirm -> detect questions -> grade. onFinish here replicates
  // that exact hand-off for Slack (mirroring discord-flow-registry.js's own
  // exam_confirm onFinish verbatim), looking the session back up by id to
  // recover the userId/from ExamCheckerOrchestrator.process() needs (ctx only
  // carries the session id as flowToken).
  const examConfirm = require('./exam-confirm-endpoint');
  const examConfirmView = require('./slack-views/exam-confirm.view');
  register('exam_confirm', buildEndpointModal({
    kind: 'exam_confirm',
    init: (ctx) => examConfirm.handleExamConfirmInit(ctx.flowToken),
    exchange: (ctx, screen, screenData) => examConfirm.handleExamConfirmDataExchange(ctx.flowToken, screen, screenData),
    back: (ctx) => examConfirm.handleExamConfirmBack(ctx.flowToken),
    screenToView: examConfirmView.screenToView,
    viewToScreenData: examConfirmView.viewToScreenData,
    firstInputBlockId: examConfirmView.FIRST_INPUT_BLOCK_ID,
    onFinish: async (response, ctx) => {
      const confirmedStudents = response?.data?.extension_message_response?.params?.confirmed_students || [];
      const ExamSessionService = require('../services/exam-checker/exam-session.service');
      // exam-checker.orchestrator.js exports { ExamCheckerOrchestrator, SESSION_STATES }
      // (a named export, not the class/object directly) — destructure it, or
      // ExamCheckerOrchestrator.process below is undefined.
      const { ExamCheckerOrchestrator } = require('../services/exam-checker/exam-checker.orchestrator');
      const session = await ExamSessionService.getById(ctx.flowToken);
      if (!session) return;
      await ExamCheckerOrchestrator.process(
        { type: 'flow', flowResponse: { confirmed_students: confirmedStudents } },
        session.user_id,
        session.recipient_identifier,
      );
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
