'use strict';
/**
 * Status Flow Endpoint Handler
 *
 * /status opens this Flow. The teacher sees every active resource
 * (quizzes / coaching / LPs / video / reading / attendance) with one-line
 * descriptions and can pick one to cancel.
 *
 * Routing (forward-only):
 *   MAIN → CONFIRM_CANCEL | SUCCESS
 *   CONFIRM_CANCEL → SUCCESS
 *
 * 10-second timeout consideration: listActiveResources is a few cheap
 * supabase reads + a Redis MGET. Fast.
 */

const { logToFile } = require('../utils/logger');
const TeacherStateService = require('../services/teacher-state.service');

async function handleStatusFlowInit(userId /*, flowToken */) {
  logToFile('📋 Status Flow INIT', { userId });
  return await buildMainScreen(userId);
}

async function handleStatusFlowDataExchange(userId, screen, screenData /*, flowToken */) {
  logToFile('📋 Status Flow data_exchange', { userId, screen, screenData });

  if (screen === 'MAIN') {
    const action = screenData._action;
    if (!action) return createErrorResponse('No action selected');
    if (action === 'done') {
      return buildSuccessScreen('Done — your /status is up to date.', { statusAction: 'done' });
    }
    // action is a row id like 'cancel_quiz_<uuid>' / 'cancel_video' etc.
    const parsed = TeacherStateService.parseResourceId(action);
    if (parsed.kind === 'unknown') return createErrorResponse('Unknown action');

    // Re-derive the label so CONFIRM_CANCEL shows it without trusting client state
    const items = await TeacherStateService.listActiveResources(userId);
    const matched = items.find(it => it.id === action);
    const label = matched?.title || 'this resource';
    return {
      screen: 'CONFIRM_CANCEL',
      data: {
        resource_id: action,
        resource_label: label
      }
    };
  }

  if (screen === 'CONFIRM_CANCEL') {
    const rowId = screenData.resource_id;
    if (!rowId) return createErrorResponse('Missing resource id');
    const items = await TeacherStateService.listActiveResources(userId);
    const matched = items.find(it => it.id === rowId);
    if (!matched) {
      return buildSuccessScreen(
        'That resource is no longer active — nothing to stop.',
        { statusAction: 'noop', resourceLabel: 'unknown' }
      );
    }
    const result = await TeacherStateService.cancelResource(matched, userId);
    if (result.ok) {
      return buildSuccessScreen(result.message, {
        statusAction: 'cancelled',
        resourceKind: matched.kind,
        resourceLabel: matched.title
      });
    }
    return createErrorResponse(`Couldn't stop that — ${result.reason || 'unknown error'}`);
  }

  logToFile('⚠️ Unknown screen in status flow', { screen });
  return createErrorResponse('Unknown screen');
}

async function handleStatusFlowBack(userId, screen /*, flowToken */) {
  logToFile('📋 Status Flow BACK', { userId, screen });
  return await buildMainScreen(userId);
}

// ─── Builders ──────────────────────────────────────────────────────────────

async function buildMainScreen(userId) {
  try {
    const items = await TeacherStateService.listActiveResources(userId);

    if (items.length === 0) {
      // Nothing active — go straight to a polite SUCCESS screen.
      return buildSuccessScreen(
        'Nothing\'s running right now. Type /quiz, /reading test, or describe a lesson topic to start something.',
        { statusAction: 'idle' }
      );
    }

    const summaryHeading = items.length === 1
      ? 'You have 1 thing running right now.'
      : `You have ${items.length} things running right now.`;

    const summaryBody = items.map(it => `• ${it.title}`).join('\n');

    const resources = items.map(it => ({
      id: it.id,
      title: it.title.length > 30 ? it.title.slice(0, 27) + '...' : it.title
    }));
    resources.push({ id: 'done', title: 'Done — close' });

    return {
      screen: 'MAIN',
      data: {
        summary_heading: summaryHeading,
        summary_body: summaryBody,
        resources
      }
    };
  } catch (err) {
    logToFile('❌ buildMainScreen error', { error: err.message });
    return createErrorResponse('Could not load /status menu');
  }
}

/**
 * SUCCESS screen with extension_message_response params so the chat-side
 * nfm_reply branch can dispatch a contextual ack instead of the generic
 * unknown-flow fallback.
 */
function buildSuccessScreen(message, { statusAction = 'done', resourceKind = '', resourceLabel = '' } = {}) {
  return {
    screen: 'SUCCESS',
    data: {
      success_message: message,
      extension_message_response: {
        params: {
          status_action: statusAction,
          ...(resourceKind ? { resource_kind: resourceKind } : {}),
          ...(resourceLabel ? { resource_label: resourceLabel } : {})
        }
      }
    }
  };
}

function createErrorResponse(message) {
  return { data: { error: { message } } };
}

module.exports = {
  handleStatusFlowInit,
  handleStatusFlowDataExchange,
  handleStatusFlowBack
};
