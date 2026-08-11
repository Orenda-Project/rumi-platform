/**
 * Multi-step TEXT flows — the sandbox stand-in for a Meta WhatsApp Flow form.
 *
 * Why this exists: several features are only reachable through a Meta-hosted
 * Flow (a multi-screen form tied to a WABA). On the Baileys sandbox driver
 * `sendFlow()` cannot work at all, and the callers do not degrade gracefully —
 * e.g. text-message.handler.js's /reading test branch does
 * `if (flowSent) {...} else { throw new Error('Failed to send WhatsApp Flow') }`
 * and the catch replies "Sorry, something went wrong". So on sandbox the
 * feature is not merely unavailable, it looks broken. Same story for /settings
 * ("not available yet") and for the imported content library, whose picker is
 * gated behind STUDENT_VIDEOS_FLOW_ID.
 *
 * This engine replaces a form with a conversation: one question per message,
 * answered by number OR name (see pending-options.js#resolveSelection, which
 * this reuses so "2" and "Grade 2" both work). Steps can be dynamic, so a later
 * step's options can depend on earlier answers — which is what a
 * grade → subject → topic picker needs.
 *
 * State lives in Redis (with an in-memory fallback) keyed by phone number, so a
 * flow survives the process restart a PaaS redeploy causes mid-conversation.
 *
 * Deliberately channel-agnostic: nothing here knows about Baileys. The Baileys
 * driver starts flows; Meta keeps using real Flows and never does.
 *
 * @module text-flow
 */

const { logToFile } = require('../../utils/logger');
const pendingOptions = require('./pending-options');

/** Lazy — railway-redis.service.js connects on require. Same reasoning as pending-options.js. */
function redis() {
  // eslint-disable-next-line global-require -- deliberate: avoid dialing Redis on module load
  return require('../cache/railway-redis.service');
}

const KEY_PREFIX = 'text-flow:';
/** Long enough for a multi-step picker; short enough that an abandoned flow expires. */
const TTL_SECONDS = 30 * 60;

/** In-memory fallback. Map<phone, {expiresAt, state}> */
const memory = new Map();

/**
 * Registered flow definitions, keyed by kind (e.g. 'student-videos').
 *
 * A definition is:
 *   {
 *     kind: string,
 *     steps: [{
 *       id: string,
 *       // Either a menu step…
 *       options?: (answers, context) => Promise<Array<{id,title,description?}>
 *                                              | {options, context}>,
 *       prompt?: (answers, context) => Promise<{header?,body?,footer?}>,
 *       // …or a free-text step:
 *       freeText?: boolean,
 *     }],
 *     onComplete: (phone, answers, context) => Promise<{text?, metaMessage?}|void>,
 *   }
 *
 * `context` is definition-owned scratch state, persisted alongside the answers.
 * A step's options() may return `{options, context}` to update it. This exists
 * so a definition can carry something forward that is NOT a user answer —
 * endpoint-text-flow.js uses it to remember the Flow endpoint's last response,
 * so rendering step N doesn't have to replay every earlier data_exchange call
 * (which would be both wasteful and unsafe if any of them had side effects).
 */
const definitions = new Map();

function register(definition) {
  if (!definition?.kind || !Array.isArray(definition.steps)) {
    throw new Error('text-flow: a definition needs { kind, steps[] }');
  }
  definitions.set(definition.kind, definition);
}

function getDefinition(kind) {
  return definitions.get(kind) || null;
}

/**
 * Index of the next step that actually applies, skipping any whose `when(answers)`
 * is false — the text equivalent of a Flow screen that is conditionally routed
 * past (e.g. the reading assessment's level picker, which is meaningless once
 * the teacher chose automatic levelling). Returns steps.length when none remain.
 */
function nextApplicableIndex(definition, answers, fromIndex) {
  for (let i = fromIndex; i < definition.steps.length; i += 1) {
    const step = definition.steps[i];
    if (typeof step.when !== 'function' || step.when(answers)) return i;
  }
  return definition.steps.length;
}

function keyFor(phone) {
  return `${KEY_PREFIX}${phone}`;
}

function pruneMemory(now = Date.now()) {
  for (const [phone, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(phone);
  }
}

async function saveState(phone, state) {
  memory.set(phone, { expiresAt: Date.now() + TTL_SECONDS * 1000, state });
  pruneMemory();
  try {
    const stored = await redis().set(keyFor(phone), JSON.stringify(state), TTL_SECONDS);
    // set() returns false (does not throw) when Redis isn't ready — surface it,
    // or a flow silently becomes memory-only and dies on the next restart.
    if (stored === false) {
      logToFile('⚠️ text-flow: Redis unavailable — flow state is memory-only', { phone });
    }
  } catch (error) {
    logToFile('⚠️ text-flow: Redis write failed', { error: error.message });
  }
}

/** @returns {Promise<{kind: string, stepIndex: number, answers: object}|null>} */
async function getState(phone) {
  if (!phone) return null;
  try {
    const raw = await redis().get(keyFor(phone));
    if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    logToFile('⚠️ text-flow: Redis read failed, using memory', { error: error.message });
  }
  pruneMemory();
  return memory.get(phone)?.state || null;
}

async function clear(phone) {
  if (!phone) return;
  memory.delete(phone);
  try {
    await redis().delete(keyFor(phone));
  } catch (error) {
    logToFile('⚠️ text-flow: Redis delete failed', { error: error.message });
  }
}

/**
 * Counts consecutive replies that did not answer the current step.
 *
 * Why it matters: a text flow swallows the replies it consumes, so a pending
 * flow that keeps re-asking can trap the user. Not every command starts with
 * "/" — "add class", "attendance" and "register" are all plain-text triggers,
 * and mid-flow they look exactly like a wrong answer. Rather than teach this
 * module the whole command vocabulary, the caller is given a strike count and
 * can give up on the flow, letting the message be handled normally.
 *
 * @returns {Promise<number>} strikes so far, including this one
 */
async function recordStrike(phone, state) {
  const strikes = (state.strikes || 0) + 1;
  await saveState(phone, { ...state, strikes });
  return strikes;
}

/** True when the user is mid-flow. */
async function isActive(phone) {
  return Boolean(await getState(phone));
}

/**
 * Renders the step at `stepIndex`, recording its menu so a numbered/named reply
 * resolves. Returns what should be sent to the user, or null when the flow has
 * run past its last step.
 */
async function renderStep(phone, definition, stepIndex, answers, context = {}) {
  const step = definition.steps[stepIndex];
  if (!step) return null;

  if (step.freeText) {
    const prompt = step.prompt ? await step.prompt(answers, context) : {};
    return { kind: 'text', prompt, options: null, context };
  }

  // options() runs BEFORE prompt() so a prompt can describe what options()
  // just fetched (an endpoint-backed step learns its header from the same
  // response that produced its rows).
  const produced = await step.options(answers, context);
  const isWrapped = produced && !Array.isArray(produced);
  const options = isWrapped ? produced.options : produced;
  const nextContext = isWrapped && produced.context ? produced.context : context;

  const prompt = step.prompt ? await step.prompt(answers, nextContext) : {};

  if (!options?.length) return { kind: 'empty', prompt, options: [], context: nextContext };

  // Reuse the menu store so resolveSelection() handles number-or-name for us.
  await pendingOptions.remember(phone, {
    replyType: 'list_reply',
    options: options.map((o) => ({ id: o.id, title: o.title })),
  });

  return { kind: 'menu', prompt, options, context: nextContext };
}

/**
 * Starts a flow. Returns the first step to render, or null if the kind is
 * unregistered (caller should then fall back to whatever it did before).
 */
async function start(phone, kind, seedAnswers = {}, seedContext = {}) {
  const definition = getDefinition(kind);
  if (!definition) return null;

  const answers = { ...seedAnswers };
  const firstIndex = nextApplicableIndex(definition, answers, 0);
  const state = { kind, stepIndex: firstIndex, answers, context: { ...seedContext } };
  await saveState(phone, state);
  logToFile('▶️ text-flow started', { phone, kind });

  const rendered = await renderStep(phone, definition, firstIndex, state.answers, state.context);
  if (!rendered) {
    await clear(phone);
    return null;
  }

  // Nothing to choose from (an endpoint returned no rows, or errored). Don't
  // leave the user parked in a flow whose first question is unanswerable.
  if (rendered.kind === 'empty') {
    await clear(phone);
    return rendered;
  }

  await saveState(phone, { ...state, context: rendered.context || state.context });
  return rendered;
}

/**
 * Feeds the user's raw text into the active flow.
 *
 * @returns {Promise<null | {status:'unmatched'} | {status:'step', render} | {status:'complete', answers}>}
 *   null when no flow is active. 'unmatched' means the text was not a valid
 *   answer — the caller should leave it to normal message handling rather than
 *   swallowing it, since a pending flow does not mean every message answers it.
 */
async function advance(phone, text) {
  const state = await getState(phone);
  if (!state) return null;

  const definition = getDefinition(state.kind);
  if (!definition) {
    await clear(phone);
    return null;
  }

  const step = definition.steps[state.stepIndex];
  if (!step) {
    await clear(phone);
    return null;
  }

  // Universal escape hatch — a user must always be able to get out.
  if (/^(cancel|stop|exit|quit|nevermind|never mind)$/i.test(String(text || '').trim())) {
    await clear(phone);
    await pendingOptions.clear(phone);
    logToFile('⏹️ text-flow cancelled by user', { phone, kind: state.kind });
    return { status: 'cancelled' };
  }

  let answer;
  if (step.freeText) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { status: 'unmatched', strikes: await recordStrike(phone, state) };
    answer = { id: trimmed, title: trimmed };
  } else {
    const menu = await pendingOptions.get(phone);
    const selected = pendingOptions.resolveSelection(menu, text);
    if (!selected) return { status: 'unmatched', strikes: await recordStrike(phone, state) };
    await pendingOptions.clear(phone);
    answer = selected;
  }

  const answers = { ...state.answers, [step.id]: answer };
  const context = state.context || {};
  const nextIndex = nextApplicableIndex(definition, answers, state.stepIndex + 1);

  if (nextIndex >= definition.steps.length) {
    await clear(phone);
    logToFile('✅ text-flow complete', { phone, kind: state.kind });
    return { status: 'complete', kind: state.kind, answers, context, definition };
  }

  // strikes deliberately not carried over — the user just answered correctly.
  await saveState(phone, { kind: state.kind, stepIndex: nextIndex, answers, context });
  const render = await renderStep(phone, definition, nextIndex, answers, context);

  // A later step with nothing to offer ends the flow rather than dead-ending
  // the user on a question with no answers.
  if (render?.kind === 'empty') {
    await clear(phone);
    return { status: 'aborted', render, answers };
  }

  await saveState(phone, {
    kind: state.kind, stepIndex: nextIndex, answers, context: render?.context || context,
  });
  return { status: 'step', render, answers };
}

/** Test-only: forget all registrations and state. */
function _resetForTests() {
  definitions.clear();
  memory.clear();
}

module.exports = {
  register,
  getDefinition,
  start,
  advance,
  isActive,
  getState,
  clear,
  renderStep,
  TTL_SECONDS,
  _resetForTests,
};
