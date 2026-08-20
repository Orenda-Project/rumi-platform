/**
 * Slack modal interaction handling — the counterpart to
 * flow-endpoint.routes.js's registration/settings blocks, but for Slack's
 * Interactivity payload shapes instead of Meta's encrypted Flow envelope.
 *
 * Handles the modal-specific interaction shapes Slack sends, none of
 * which are ordinary chat button/select clicks (those stay
 * slack-events.adapter.js's job):
 *   - block_actions with an `open_modal:<kind>` action_id — opens the FIRST
 *     modal view for that Flow-equivalent kind.
 *   - view_submission — the modal's Next/Save/Finish button; advances or
 *     completes the flow.
 *   - block_actions with a `<kind>_back` action_id — the modal's own Back
 *     button (not Slack's native stack pop — see slack-modal-flow.js's file
 *     header for why registration needs real server-side back navigation).
 *   - block_actions with an `attendance_finish` action_id — the "I'm Done"
 *     button living inside attendance's ADD_STUDENT modal view (a plain
 *     button click, NOT a view_submission — see slack-views/attendance.view.js's
 *     own header comment for why this can't just be the modal's native
 *     submit). Calls attendance-setup-endpoint.js's handleDoneAction directly.
 *   - block_actions with a `country_bucket_select` action_id — registration's
 *     PERSONAL_INFO screen's region-bucket picker (see
 *     slack-views/registration.view.js's own header comment: Slack's
 *     static_select caps at 100 options, so the 164-country field is split
 *     into a region-bucket picker + a country picker filtered to that
 *     bucket). Picking a region live-updates the SAME open modal via
 *     views.update, re-rendering the country field's options — a real bug
 *     fix (registration on Slack failed 100% of the time before this), not
 *     a pre-emptive design choice.
 */

const { logToFile } = require('../utils/logger');
const flowRegistry = require('./slack-flow-registry');
const slackWebClient = require('./../services/messaging/slack-web-client');
const { decodeMetadata } = require('../services/messaging/slack-modal-flow');
const { getOrCreateUserByChannel } = require('../database/bot-helpers');
const registrationView = require('./slack-views/registration.view');
const { COUNTRIES_DROPDOWN } = require('../config/registration-data');

const OPEN_MODAL_PREFIX = 'open_modal:';
const BACK_ACTION_SUFFIX = '_back';
const ATTENDANCE_FINISH_ACTION = 'attendance_finish';

function isOpenModalAction(actionId) {
  return typeof actionId === 'string' && actionId.startsWith(OPEN_MODAL_PREFIX);
}

function isBackAction(actionId) {
  return typeof actionId === 'string' && actionId.endsWith(BACK_ACTION_SUFFIX);
}

function isAttendanceFinishAction(actionId) {
  return actionId === ATTENDANCE_FINISH_ACTION;
}

function isCountryBucketAction(actionId) {
  return actionId === registrationView.COUNTRY_BUCKET_ACTION_ID;
}

function kindFromBackAction(actionId) {
  return actionId.slice(0, -BACK_ACTION_SUFFIX.length);
}

/**
 * Splits an `open_modal:<kind>` action_id into its parts. The optional
 * sessionId segment ("open_modal:exam_confirm:<sessionId>") exists ONLY for
 * exam_confirm, whose flowToken must be the exam session's own session.id
 * (embedded here by whoever sent this button — see exam-checker.handler.js's
 * trySendExamConfirmModalTrigger) rather than a freshly-minted
 * "userId:kind:timestamp" token. Splitting on the FIRST colon after the
 * prefix (not slicing the whole remainder as the kind) is what lets this
 * 3rd segment coexist with every other kind's plain "open_modal:<kind>"
 * action_id, which has no embedded session id at all — mirrors
 * discord-modal-interactions.handler.js's parseStartFlowAction() exactly.
 */
function parseOpenModalAction(actionId) {
  const rest = actionId.slice(OPEN_MODAL_PREFIX.length);
  const idx = rest.indexOf(':');
  if (idx === -1) return { kind: rest, sessionId: null };
  return { kind: rest.slice(0, idx), sessionId: rest.slice(idx + 1) };
}

function buildCtx(slackUserId, flowToken) {
  return { userId: flowToken.split(':')[0] || null, slackUserId, flowToken };
}

/**
 * A `block_actions` payload whose first action opens a modal
 * (`open_modal:<kind>` or `open_modal:exam_confirm:<sessionId>`). Returns
 * true if this payload was handled here.
 */
async function handleOpenModal(payload) {
  const action = payload?.actions?.[0];
  if (!action || !isOpenModalAction(action.action_id)) return false;

  flowRegistry.ensureRegistered();
  const { kind, sessionId } = parseOpenModalAction(action.action_id);
  const renderer = flowRegistry.get(kind);
  if (!renderer) {
    logToFile('⚠️ Slack modal: no renderer registered for kind', { kind });
    return true;
  }

  const slackUserId = payload.user?.id;

  let ctx;
  if (sessionId) {
    // exam_confirm: flowToken IS the exam session's own session.id, unchanged
    // — never buildFlowToken()'s minted token. userId isn't resolvable from
    // slackUserId alone for this kind (and buildCtx's flowToken.split(':')[0]
    // convention doesn't apply to a bare session id either) — the renderer's
    // endpoint calls key everything off flowToken directly; onFinish looks
    // the session's own user_id back up. Mirrors
    // discord-modal-interactions.handler.js's tryHandleStartFlow() exactly.
    ctx = { userId: null, slackUserId, flowToken: sessionId };
  } else {
    // registration/settings/attendance endpoints key everything off the DB
    // user's UUID (flow_token = "userId:kind:timestamp", parsed as
    // flow_token.split(':')[0] by the same convention flow-endpoint.routes.js
    // uses for Meta) — never the Slack user id itself. Resolves/creates the
    // multi-homed user row the same way whatsapp-bot.js's ordinary dispatch
    // already does for messages.
    const user = await getOrCreateUserByChannel('slack', slackUserId);
    const flowToken = flowRegistry.buildFlowToken(user.id, kind);
    ctx = buildCtx(slackUserId, flowToken);
  }

  try {
    const view = await renderer.buildInitialView(ctx);
    await slackWebClient.openView(payload.trigger_id, view);
  } catch (error) {
    logToFile('❌ Slack modal: failed to open initial view', { kind, error: error.message, stack: error.stack });
  }
  return true;
}

/**
 * A `block_actions` payload whose action is attendance's "I'm Done" button
 * (`attendance_finish`), living inside the ADD_STUDENT modal view rather than
 * being that modal's native Submit — see slack-views/attendance.view.js's
 * header comment. {list_id, class_display} are recovered from
 * private_metadata's `carry` field (see slack-modal-flow.js's encodeMetadata
 * `carry` param and slack-flow-registry.js's attendance registration, which
 * supplies `metadataCarry` for exactly this) rather than from state.values —
 * Slack's block_actions payload for an interaction inside an open modal does
 * include payload.view.private_metadata (unchanged from what the view was
 * opened/pushed with), which is what makes this recoverable at all.
 * Calls attendance-setup-endpoint.js's handleDoneAction directly — bypassing
 * exchange()'s screenData._action indirection entirely, since there is no
 * view_submission state to read an _action field from for a plain button
 * click. Returns true if this payload was handled here.
 */
async function handleAttendanceFinish(payload) {
  const action = payload?.actions?.[0];
  if (!action || !isAttendanceFinishAction(action.action_id)) return false;

  flowRegistry.ensureRegistered();
  const { flowToken, carry } = decodeMetadata(payload.view?.private_metadata);
  const ctx = buildCtx(payload.user?.id, flowToken);

  try {
    const attendance = require('./attendance-setup-endpoint');
    const response = await attendance.handleDoneAction(carry?.list_id, carry?.class_display);
    if (response?.data?.success_message) {
      await slackWebClient.postMessage(ctx.slackUserId, response.data.success_message);
    } else if (response?.data?.error && response.screen) {
      // Still needs at least one student — reopen ADD_STUDENT with the error,
      // via the SAME screenToView() the ordinary submission path uses (its
      // {screen, data} input shape is exactly what handleDoneAction's own
      // error response already provides).
      const attendanceView = require('./slack-views/attendance.view');
      const metadata = JSON.stringify({ kind: 'attendance', screen: response.screen, flowToken, carry });
      const view = attendanceView.screenToView(response.screen, response.data, { ...ctx, metadata });
      await slackWebClient.updateView(payload.view.id, view);
    }
  } catch (error) {
    logToFile('❌ Slack modal: attendance "I\'m Done" handling failed', { error: error.message, stack: error.stack });
  }
  return true;
}

/**
 * A `block_actions` payload whose action is registration's PERSONAL_INFO
 * region-bucket picker (`country_bucket_select`). Live-updates the SAME open
 * modal so the country field's options refresh to the newly-picked region —
 * Slack's standard "dependent select menus" pattern. The countries list
 * itself is a static, region-agnostic dropdown (registration-endpoint.js
 * always returns COUNTRIES_DROPDOWN verbatim, never filtered per-user), so
 * reading it directly here instead of re-calling init() is safe and matches
 * what screenToView() would receive either way. The already-typed full_name
 * value is preserved via payload.view.state.values, since Slack's
 * views.update fully replaces the view — without this, picking a region
 * would silently wipe out anything the teacher had already typed.
 * Returns true if this payload was handled here.
 */
async function handleCountryBucketChange(payload) {
  const action = payload?.actions?.[0];
  if (!action || !isCountryBucketAction(action.action_id)) return false;

  const { kind, screen, flowToken } = decodeMetadata(payload.view?.private_metadata);
  if (kind !== 'registration' || screen !== 'PERSONAL_INFO') return true;

  const ctx = buildCtx(payload.user?.id, flowToken);
  const selectedCountryBucket = action.selected_option?.value || null;
  const fullNameValue = payload.view?.state?.values?.full_name_block?.full_name?.value || '';

  try {
    const metadata = payload.view.private_metadata;
    const view = registrationView.screenToView('PERSONAL_INFO', { countries: COUNTRIES_DROPDOWN }, {
      ...ctx, metadata, selectedCountryBucket, fullNameValue,
    });
    await slackWebClient.updateView(payload.view.id, view);
  } catch (error) {
    logToFile('❌ Slack modal: country bucket change handling failed', { error: error.message, stack: error.stack });
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
  const { kind, screen, flowToken, carry } = decodeMetadata(payload.view?.private_metadata);
  const renderer = flowRegistry.get(kind);
  if (!renderer) {
    logToFile('⚠️ Slack modal: no renderer registered for view_submission kind', { kind });
    return null;
  }

  const ctx = buildCtx(payload.user?.id, flowToken);
  const stateValues = payload.view?.state?.values || {};

  try {
    return await renderer.handleSubmission(ctx, screen, stateValues, carry);
  } catch (error) {
    logToFile('❌ Slack modal: view_submission handling failed', { kind, screen, error: error.message, stack: error.stack });
    return { response_action: 'errors', errors: {} };
  }
}

module.exports = {
  handleOpenModal,
  handleBackButton,
  handleAttendanceFinish,
  handleCountryBucketChange,
  handleViewSubmission,
  isOpenModalAction,
  isBackAction,
  isAttendanceFinishAction,
  isCountryBucketAction,
  parseOpenModalAction,
  OPEN_MODAL_PREFIX,
  ATTENDANCE_FINISH_ACTION,
};
