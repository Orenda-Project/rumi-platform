/**
 * Leader-observation draft lifecycle — the AI does the first pass, the coach
 * owns the final judgement.
 *
 * onAnalysisReady   : freeze v1 (autofill_analysis_data) exactly once, move to
 *                     review, arm awaiting_form, send the COACH the pre-filled
 *                     ratings — the editable WhatsApp Flow on Meta when one is
 *                     published (OBSERVE_FORM_FLOW_ID), the stepwise chat form
 *                     everywhere else and whenever the Flow can't be sent.
 * buildScreenPrefill: analysis_data → one domain screen's ${data.*} bindings
 *                     (the Meta Flow).
 * completeFromFlow  : the Flow's nfm_reply after the last screen — clear the
 *                     form state, acknowledge, then Section B in the chat
 *                     (the Flow has no screen for it) or the debrief (Meta
 *                     only; the chat form does the same in observe-form.service).
 * applyObserverEdits: merge the coach's edits into analysis_data (v2),
 *                     re-run the pack's scorer, stamp observer_edit_summary
 *                     (the v1→v2 diff is the record of what the coach changed).
 *
 * Observe-ness is derived from the SESSION ROW (observation_type), never from
 * a queue payload — a lost payload field must not change what a row is.
 */

const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const ObserveState = require('./observe-state.service');
const redisService = require('../cache/railway-redis.service');
const { t } = require('./observe-strings');
const { languageFor } = require('./observe-language');
const { getObservePack, scaleBounds } = require('./observe-framework');
const { TERMINAL_IN_FILTER, isTerminalStatus } = require('./observe-terminal');
const { resolveChannelDriver } = require('../../config/feature-availability');
const { identityForUser } = require('./observe-identity');
const { logToFile } = require('../../utils/logger');

const {
  applyObserverEdits, clipWords, evidenceOf, improvementOf, fid, PREFILL_TEXT_CAP,
} = require('./observe-edits.service');

async function loadSession(sessionId) {
  const { data: session, error } = await supabase
    .from('coaching_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !session) {
    throw new Error(`observe: session ${sessionId} not found (${error && error.message})`);
  }
  return session;
}

/**
 * The coach's channel identity, from the SESSION ROW — never the job's `from`,
 * which can be whoever happened to trigger this pipeline stage (once, the
 * observed teacher, which put the coach's form in the teacher's chat).
 */
async function observerIdentity(session, fallback) {
  const observerId = session.observer_user_id || session.user_id;
  const identity = await identityForUser(observerId);
  if (identity) return identity;
  logToFile('⚠️ observe: observer identity not found — draft falls back to the job `from`', { sessionId: session.id, observerId });
  return fallback;
}

/**
 * A Meta Flow can only go to a bare WhatsApp number on the Meta driver. Any
 * prefixed identity ("slack:…", "mtx:…", "matrix:…") belongs to another
 * channel — checked by shape, not by the registry's prefix list, so a channel
 * this build has never heard of still gets the chat form, never a Flow.
 */
function canReceiveMetaFlow(identity) {
  return /^\+?\d{6,20}$/.test(String(identity || '')) && resolveChannelDriver(process.env) === 'meta';
}

/**
 * Analysis finished for a leader observation: freeze v1 once, move to review,
 * arm the coach's form state, send the form.
 */
async function onAnalysisReady(sessionId, from) {
  const session = await loadSession(sessionId);
  const observerId = session.observer_user_id || session.user_id;
  // The form is read by the OBSERVER; the bound teacher's language is not the reader's.
  const lang = await languageFor('coach', session);

  // The analysis job outlives a cancel: it was queued before it and lands after.
  if (isTerminalStatus(session.status)) {
    logToFile('🚫 observe: analysis ready but the observation is over — not re-armed', { sessionId, status: session.status });
    return;
  }

  // The predicate closes the window the read above cannot: a cancel that lands
  // between the two must not be overwritten by a job that was already running.
  const { data: armed, error: upErr } = await supabase.from('coaching_sessions')
    .update({
      status: 'awaiting_observer_review',
      debrief_status: session.debrief_status || 'pending',
      // freeze v1 exactly once
      ...(session.autofill_analysis_data ? {} : { autofill_analysis_data: session.analysis_data }),
    })
    .eq('id', sessionId)
    .not('status', 'in', TERMINAL_IN_FILTER)
    .select('id');
  if (upErr) logToFile('⚠️ observe: failed to persist review status/freeze', { sessionId, error: upErr.message });
  // Refuse ONLY on an explicit "no rows matched"; an ambiguous write result
  // must not cost a coach their form.
  if (!upErr && Array.isArray(armed) && armed.length === 0) {
    logToFile('🚫 observe: observation went terminal while the analysis ran — not re-armed', { sessionId });
    return;
  }

  const recipient = await observerIdentity(session, from);

  // A plan the coach picked after the analysis had read the row was linked and
  // confirmed, but not graded: grade Section B now, before the form shows it.
  await require('./observe-plan.service').reconcileLatePick(sessionId, { from: recipient, lang });

  const flowId = process.env.OBSERVE_FORM_FLOW_ID || '';
  if (flowId && canReceiveMetaFlow(recipient)) {
    const sent = await WhatsAppService.sendFlow(recipient, {
      flowId,
      flowToken: `${observerId}:${sessionId}`,   // the endpoint derives identity from this
      header: t(lang, 'flow_header'),
      body: t(lang, 'flow_body'),
      buttonText: t(lang, 'flow_button'),
    });
    if (sent) {
      await armFormState(observerId, sessionId, { via: 'flow' });
      logToFile('🔭 observe: pre-filled form Flow sent', { sessionId, observerId });
      return;
    }
    logToFile('⚠️ observe: form Flow not sent — falling back to the chat form', { sessionId });
  }

  // Everywhere else (and as the Meta fallback): the stepwise chat form.
  const ObserveForm = require('./observe-form.service');
  await ObserveForm.start({ id: observerId }, recipient, sessionId, { lang });
}

/**
 * Never clobber a live debrief-recording state: the coach may be mid-debrief
 * for ANOTHER observation when this analysis lands. The form itself does not
 * depend on the state (a pending-list tap reopens it).
 */
async function armFormState(observerId, sessionId, extra = {}) {
  const current = await ObserveState.getState(observerId);
  if (current && current.state === 'awaiting_debrief_audio') {
    logToFile('🔭 observe: analysis ready but observer is mid-debrief — state left armed', {
      sessionId, debriefSessionId: current.sessionId,
    });
    return false;
  }
  await ObserveState.setState(observerId, 'awaiting_form', { sessionId, ...extra });
  return true;
}

/**
 * @param {object} analysis  domains-shaped analysis_data
 * @param {string} domainKey
 * @returns {object} ${data.*} bindings for that domain's Flow screen
 */
function buildScreenPrefill(analysis, domainKey) {
  const pack = getObservePack();
  const spec = pack.domains[domainKey];
  const stored = ((analysis || {}).domains || {})[domainKey] || {};
  const byId = {};
  (stored.indicators || []).forEach((ind) => { byId[String(ind.id)] = ind; });
  const { min, max } = scaleBounds(pack);

  // The published Flow binds its rating options to ${data.scale}, so the labels
  // follow the pack and can never disagree with the clamp.
  const data = { scale: pack.scaleOptions };
  spec.indicators.forEach((specInd) => {
    const f = fid(specInd.id);
    const ind = byId[String(specInd.id)] || {};
    const raw = Number(ind.score);
    const score = Number.isFinite(raw) && ind.score !== null && ind.score !== undefined ? Math.max(min, Math.min(max, raw)) : min;
    data[`s_${f}`] = String(score);
    data[`e_${f}`] = clipWords(evidenceOf(ind), PREFILL_TEXT_CAP);
    data[`i_${f}`] = clipWords(improvementOf(ind), PREFILL_TEXT_CAP);
  });
  return data;
}

// A redelivered webhook must not acknowledge twice or offer the debrief twice.
const FLOW_DONE_TTL_S = 24 * 3600;
const flowDoneKey = (sessionId) => `observe:flow_done:${sessionId}`;

/**
 * The coach submitted the form Flow. By the time this nfm_reply arrives the
 * endpoint has already merged the edits (status observer_review_complete);
 * this only closes the loop in the chat. Ownership is re-checked against the
 * row: the reply's sender and its flow token must both be the observation's
 * coach.
 *
 * @param {object} user          the sender (users row)
 * @param {string} from          the sender's channel identity
 * @param {object} responseJson  { observe_action, session_id, flow_token }
 * @returns {Promise<boolean>} true when the reply was an observe submission (handled or refused)
 */
async function completeFromFlow(user, from, responseJson = {}) {
  const [tokenUser, tokenSession] = String(responseJson.flow_token || '').split(':');
  const sessionId = responseJson.session_id || tokenSession;
  const userId = user && user.id;
  if (!sessionId || !userId || (tokenUser && tokenUser !== userId)) {
    logToFile('🚫 observe: form Flow reply refused — not the coach\'s token', { sessionId, userId });
    return true;
  }
  const { data: session } = await supabase.from('coaching_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (!session || session.observation_type !== 'leader_observation'
    || (session.observer_user_id || session.user_id) !== userId) {
    logToFile('🚫 observe: form Flow reply refused — not this coach\'s observation', { sessionId, userId });
    return true;
  }
  // Only a merged form is acknowledged: a terminal or still-in-review row
  // means the endpoint refused or never wrote, and the debrief must not start.
  if (session.status !== 'observer_review_complete') {
    logToFile('🚫 observe: form Flow reply ignored — edits not applied', { sessionId, status: session.status });
    return true;
  }
  // A reply for a form whose loop already closed — the debrief happened or the
  // report went — is a late redelivery (past the 24 h guard below): never
  // acknowledge it again or re-offer a debrief that is done.
  const delivery = (session.analysis_data || {}).teacher_delivery;
  if ((session.debrief_status && session.debrief_status !== 'pending') || (delivery && delivery.status)) {
    logToFile('🔁 observe: form Flow reply ignored — the debrief or report already followed', { sessionId });
    return true;
  }
  const claimed = await redisService.setNX(flowDoneKey(sessionId), '1', FLOW_DONE_TTL_S);
  if (!claimed) {
    logToFile('🔁 observe: form Flow reply already handled', { sessionId });
    return true;
  }

  const current = await ObserveState.getState(userId);
  if (current && current.state === 'awaiting_form' && current.sessionId === sessionId) {
    await ObserveState.clearState(userId);
  }

  const lang = await languageFor('coach', session);
  const changed = ((session.analysis_data || {}).observer_edit_summary || {}).indicators_rescored || 0;
  await WhatsAppService.sendMessage(from, `${t(lang, 'submitted_ack')}${changed ? `\n${t(lang, 'form_changes_count', { count: changed })}` : ''}`);

  // Section B: the published Flow has no screen for it, so the chat walks the
  // coach through the plan's moves and offers the debrief after the last page.
  // With nothing to review the coach is told why, then the debrief as before.
  const ObserveForm = require('./observe-form.service');
  if (await ObserveForm.startSectionB(user, from, sessionId, { lang, afterFlow: true })) {
    logToFile('🔭 observe: form Flow submission acknowledged — Section B opened in the chat', { sessionId, changed });
    return true;
  }
  const notice = await ObserveForm.sectionBNotice(session, lang);
  if (notice) await WhatsAppService.sendMessage(from, notice);
  const ObserveDebrief = require('./observe-debrief.service');
  await ObserveDebrief.offerDebriefChoice(user, from, sessionId);
  logToFile('🔭 observe: form Flow submission acknowledged', { sessionId, changed });
  return true;
}

module.exports = {
  onAnalysisReady, buildScreenPrefill, completeFromFlow, applyObserverEdits, armFormState, clipWords, evidenceOf, improvementOf, fid,
  PREFILL_TEXT_CAP,
};
