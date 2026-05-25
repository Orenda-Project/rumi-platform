'use strict';
/**
 * Pure, dependency-free decision helper for the homework hot-trigger.
 * Kept separate from text-message.handler so it is unit-testable without the
 * handler's full dependency graph.
 */

// Whole message "homework" / "home work" / "hw" / "/homework" (any case), or
// the Urdu equivalents. Anchored so it never collides with the LP trigger
// (e.g. "lesson plan for homework" must NOT fire).
const HOMEWORK_TRIGGER_RX = /^\s*\/?\s*(home\s?work|hw|ہوم\s*ورک|گھر\s*کا\s*کام)\s*$/i;

/**
 * Region-agnostic / presence-gated: the flow is offered iff HOMEWORK_FLOW_ID
 * is configured and we have a user. Side-effect-free.
 * @returns {{match:false}} | {{match:true, action:'send_flow'|'guard'}}
 */
function evaluateHomeworkTrigger({ messageBody, user, homeworkFlowId }) {
  if (!HOMEWORK_TRIGGER_RX.test(messageBody || '')) return { match: false };
  if (homeworkFlowId && user) {
    return { match: true, action: 'send_flow' };
  }
  return { match: true, action: 'guard' };
}

module.exports = { HOMEWORK_TRIGGER_RX, evaluateHomeworkTrigger };
