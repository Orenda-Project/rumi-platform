/**
 * The coach's edit form, as a conversation — the channel-neutral stand-in for
 * the Meta Flow.
 *
 * One message per domain of the observation framework: each indicator with the
 * AI's rating and the moment it was based on. The coach replies "ok" to keep
 * the domain, or "<indicator number> <new rating>" (several at once:
 * "1 2, 4 4"). After the last domain the edits are merged into v2 exactly as a
 * Flow submission would be (observe-draft.applyObserverEdits) and the debrief
 * step is offered.
 *
 * Why not text-flow.js: that engine is advanced only by the Baileys and Matrix
 * inbound adapters, so a form built on it would silently not exist on Slack or
 * Discord; and its steps are pick-one-option, while a domain review is "keep
 * all, or change any of these". So the form is a small step machine in the
 * coach's observe state, fed from the text-handler hook that every channel
 * reaches. Its replies are plain text on purpose: a numbered button menu would
 * make a typed "1" ambiguous with "indicator 1".
 *
 * Section B — did the lesson follow its plan? — follows the last domain when
 * the analysis measured it (analysis_data.lp_fidelity): the plan's moves a page
 * at a time, each with its verdict and the quoted moment; "ok" keeps a page,
 * "<move> <verdict>" changes one (moves are numbered across the whole plan, so
 * any page can name any move). The ratings and the verdicts are merged in ONE
 * write. When nothing could be measured the coach is told why instead; an
 * observation with no Section B record finishes exactly as before.
 *
 * State: observe:state:<coachId> = { state:'awaiting_form', sessionId,
 * domainIndex, edits: { r_<id>: rating, fid_<n>: verdict }, section?: 'b',
 * page?, afterFlow? }. Edits live in the state until the end — losing the
 * state costs the coach their unsaved changes, never the observation (the
 * pending list reopens it from the start).
 *
 * afterFlow: on Meta the published Flow has no Section B screen, so after a
 * Flow submission the chat opens Section B alone (startSectionB); the ratings
 * are already saved and only the verdicts are merged (applySectionBEdits).
 */

const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const ObserveState = require('./observe-state.service');
const { t, observeLang } = require('./observe-strings');
const { getObservePack, scaleBounds } = require('./observe-framework');
const { isTerminalStatus } = require('./observe-terminal');
const { isSchoolLeader } = require('./observe-gate');
const ObserveEdits = require('./observe-edits.service');
const SectionB = require('./observe-section-b');
const { logToFile } = require('../../utils/logger');

const EVIDENCE_CAP = 160;
const OK_RX = /^(ok|okay|k|yes|y|next|keep|done|good|fine|👍|✅)[.!]*$/i;
const EDIT_PART_RX = /^(\d{1,2})\s*(?:[ :=>\-→]|to)\s*(\d{1,2})$/i;

async function loadSession(sessionId) {
  const { data } = await supabase
    .from('coaching_sessions')
    .select('id, user_id, observer_user_id, status, analysis_data, observation_type')
    .eq('id', sessionId)
    .maybeSingle();
  return data || null;
}

async function teacherName(session) {
  if (!session || !session.user_id || session.user_id === session.observer_user_id) return null;
  const { data } = await supabase.from('users').select('name, first_name').eq('id', session.user_id).maybeSingle();
  return (data && (data.name || data.first_name)) || null;
}

function scaleLabel(pack, score) {
  const opt = pack.scaleOptions.find((o) => Number(o.id) === Number(score));
  return opt ? opt.title : String(score);
}

/** The text of one domain, with any pending edits applied. */
function renderDomain({ lang, pack, analysis, domainIndex, edits = {}, teacher }) {
  const { fid, evidenceOf, clipWords } = ObserveEdits;
  const key = pack.domainOrder[domainIndex];
  const spec = pack.domains[key];
  const stored = ((analysis || {}).domains || {})[key] || {};
  const byId = {};
  (stored.indicators || []).forEach((ind) => { byId[String(ind.id)] = ind; });
  const { min, max } = scaleBounds(pack);

  const lines = [
    t(lang, 'form_domain_header', { domain: spec.title, n: domainIndex + 1, total: pack.domainOrder.length }),
  ];
  if (teacher && domainIndex === 0) lines.push(t(lang, 'form_teacher_line', { name: teacher }));
  lines.push('');
  spec.indicators.forEach((specInd, i) => {
    const ind = byId[String(specInd.id)] || {};
    const edited = edits[`r_${fid(specInd.id)}`];
    const score = edited !== undefined ? Number(edited) : Number(ind.score);
    const shown = Number.isFinite(score) ? scaleLabel(pack, score) : '–';
    lines.push(`${i + 1}. ${specInd.name} — *${shown}*${edited !== undefined ? ` ${t(lang, 'form_changed_mark')}` : ''}`);
    const ev = evidenceOf(ind).trim();
    if (ev) lines.push(`   _${clipWords(ev, EVIDENCE_CAP)}_`);
  });
  lines.push('');
  lines.push(t(lang, 'form_reply_hint', { min, max, example: `1 ${max}` }));
  return lines.join('\n');
}

async function sendDomain(to, lang, session, state) {
  const pack = getObservePack();
  const text = renderDomain({
    lang, pack, analysis: session.analysis_data, domainIndex: state.domainIndex, edits: state.edits || {},
    teacher: await teacherName(session),
  });
  await WhatsAppService.sendMessage(to, text);
}

/**
 * Open the form at a domain (0 = the start). The coach may be mid-debrief for
 * another observation; that state is never clobbered — they are told the
 * ratings are waiting instead.
 */
async function start(coach, to, sessionId, { lang, domainIndex = 0 } = {}) {
  const session = await loadSession(sessionId);
  if (!session) return false;
  const language = lang || observeLang(coach);
  const current = await ObserveState.getState(coach.id);
  if (current && current.state === 'awaiting_debrief_audio' && current.sessionId !== sessionId) {
    await WhatsAppService.sendMessage(to, t(language, 'form_ready_later'));
    logToFile('🔭 observe: form held — coach is mid-debrief on another observation', { sessionId });
    return true;
  }
  const state = { sessionId, domainIndex, edits: {} };
  await ObserveState.setState(coach.id, 'awaiting_form', state);
  await sendDomain(to, language, session, state);
  logToFile('📝 observe: chat form opened', { sessionId, observerId: coach.id, domainIndex });
  return true;
}

async function sendSectionBPage(to, lang, session, state) {
  const lp = (session.analysis_data || {}).lp_fidelity;
  await WhatsAppService.sendMessage(to, SectionB.renderCoachPage({ lang, lp, page: state.page || 0, edits: state.edits || {} }));
}

/**
 * Open Section B on its own, after a Flow submission saved the ratings. Same
 * rule as start(): a debrief being recorded for another observation is never
 * clobbered.
 * @returns {Promise<boolean>} false when there is nothing to review (or the
 *   coach is mid-debrief elsewhere) — the caller goes on without it
 */
async function startSectionB(coach, to, sessionId, { lang, afterFlow = false } = {}) {
  const session = await loadSession(sessionId);
  if (!session || !SectionB.isReviewable((session.analysis_data || {}).lp_fidelity)) return false;
  const current = await ObserveState.getState(coach.id);
  if (current && current.state === 'awaiting_debrief_audio' && current.sessionId !== sessionId) {
    logToFile('🔭 observe: Section B skipped — coach is mid-debrief on another observation', { sessionId });
    return false;
  }
  const state = { sessionId, domainIndex: 0, edits: {}, section: 'b', page: 0, ...(afterFlow ? { afterFlow: true } : {}) };
  await ObserveState.setState(coach.id, 'awaiting_form', state);
  await sendSectionBPage(to, lang || observeLang(coach), session, state);
  logToFile('📋 observe: Section B opened', { sessionId, observerId: coach.id, afterFlow });
  return true;
}

/** Parse "2 5" / "2=5" / "1 2, 4 4" → [{n, rating}] or null when it isn't an edit at all. */
function parseEdits(text) {
  const parts = String(text || '').split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = [];
  for (const p of parts) {
    const m = p.match(EDIT_PART_RX);
    if (!m) return null;
    out.push({ n: parseInt(m[1], 10), rating: parseInt(m[2], 10) });
  }
  return out;
}

async function finish(user, to, lang, state) {
  const applied = state.afterFlow
    ? await ObserveEdits.applySectionBEdits(state.sessionId, state.edits || {})
    : await ObserveEdits.applyObserverEdits(state.sessionId, state.edits || {});
  await ObserveState.clearState(user.id);
  if (applied && applied.refused) {
    await WhatsAppService.sendMessage(to, t(lang, applied.refused === 'terminal' ? 'flow_terminal_refused' : 'form_already_saved'));
    return true;
  }
  const changed = applied.indicators_rescored || 0;
  const verdicts = applied.fidelity_verdicts_changed || 0;
  // After a Flow the ratings were acknowledged already; only the verdicts are news.
  const lines = state.afterFlow ? [] : [t(lang, 'submitted_ack')];
  if (changed) lines.push(t(lang, 'form_changes_count', { count: changed }));
  if (verdicts) lines.push(t(lang, 'secb_changes_count', { count: verdicts }));
  if (lines.length) await WhatsAppService.sendMessage(to, lines.join('\n'));
  const ObserveDebrief = require('./observe-debrief.service');
  await ObserveDebrief.offerDebriefChoice(user, to, state.sessionId);
  return true;
}

/**
 * The last Section A domain is done: Section B when there is a measurement to
 * review, the reason when there is a record but no measurement, otherwise
 * finish as before. Section B opens only while the ratings are still in
 * review — saved elsewhere meanwhile, finish() says so.
 */
async function afterSectionA(user, to, lang, state, session) {
  const analysis = session.analysis_data || {};
  const inReview = session.status === ObserveEdits.IN_REVIEW_STATUS;
  if (inReview && SectionB.isReviewable(analysis.lp_fidelity)) {
    Object.assign(state, { section: 'b', page: 0 });
    await ObserveState.setState(user.id, 'awaiting_form', state);
    await sendSectionBPage(to, lang, session, state);
    return true;
  }
  if (inReview && analysis.section_b) {
    // An assessed record with no moves to show cannot be reviewed either; the
    // coach is told the check could not run rather than shown an empty page.
    const record = analysis.section_b.status === 'not_assessed'
      ? analysis.section_b : { ...analysis.section_b, reason: 'grader_failed' };
    await WhatsAppService.sendMessage(to, SectionB.notAssessedText(lang, record, { teacherName: await teacherName(session) }));
  }
  return finish(user, to, lang, state);
}

/** A reply while Section B is open: "ok" turns the page, "<move> <verdict>" changes one. */
async function handleSectionB(user, from, lang, state, trimmed) {
  if (OK_RX.test(trimmed)) {
    const session = await loadSession(state.sessionId);
    if (!session || isTerminalStatus(session.status)) {
      await ObserveState.clearState(user.id);
      await WhatsAppService.sendMessage(from, t(lang, 'flow_terminal_refused'));
      return true;
    }
    const pages = SectionB.pageCount((session.analysis_data || {}).lp_fidelity);
    if (state.page + 1 >= pages) return finish(user, from, lang, state);
    state.page += 1;
    await ObserveState.setState(user.id, 'awaiting_form', state);
    await sendSectionBPage(from, lang, session, state);
    return true;
  }

  const edits = SectionB.parseVerdictEdits(trimmed);
  if (!edits) return false;   // not an answer — leave it to normal chat
  const session = await loadSession(state.sessionId);
  if (!session) return false;
  const lp = (session.analysis_data || {}).lp_fidelity;
  const count = (lp && Array.isArray(lp.moves) ? lp.moves : []).length;
  for (const e of edits) {
    if (e.n < 1 || e.n > count) {
      await WhatsAppService.sendMessage(from, t(lang, 'secb_bad_move', { count }));
      return true;
    }
    if (!e.verdict) {
      await WhatsAppService.sendMessage(from, t(lang, 'secb_bad_verdict'));
      return true;
    }
  }
  for (const e of edits) state.edits[`fid_${e.n}`] = e.verdict;
  await ObserveState.setState(user.id, 'awaiting_form', state);
  await sendSectionBPage(from, lang, session, state);
  return true;
}

/**
 * The coach's reply while the form is open.
 * @returns {Promise<boolean>} true when the text answered the form
 */
async function handleText(user, from, text) {
  if (!isSchoolLeader(user)) return false;
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.startsWith('/')) return false;   // commands always win
  const st = await ObserveState.getState(user.id);
  if (!st || st.state !== 'awaiting_form' || st.via === 'flow') return false;

  const lang = observeLang(user);
  const pack = getObservePack();
  const state = { sessionId: st.sessionId, domainIndex: st.domainIndex || 0, edits: st.edits || {} };
  if (st.section === 'b') {
    Object.assign(state, { section: 'b', page: st.page || 0, ...(st.afterFlow ? { afterFlow: true } : {}) });
    return handleSectionB(user, from, lang, state, trimmed);
  }

  if (OK_RX.test(trimmed)) {
    const session = await loadSession(state.sessionId);
    if (!session || isTerminalStatus(session.status)) {
      await ObserveState.clearState(user.id);
      await WhatsAppService.sendMessage(from, t(lang, 'flow_terminal_refused'));
      return true;
    }
    if (state.domainIndex + 1 >= pack.domainOrder.length) return afterSectionA(user, from, lang, state, session);
    state.domainIndex += 1;
    await ObserveState.setState(user.id, 'awaiting_form', state);
    await sendDomain(from, lang, session, state);
    return true;
  }

  const edits = parseEdits(trimmed);
  if (!edits) return false;   // not an answer — leave it to normal chat

  const { fid } = ObserveEdits;
  const spec = pack.domains[pack.domainOrder[state.domainIndex]];
  const { min, max } = scaleBounds(pack);
  for (const e of edits) {
    if (e.n < 1 || e.n > spec.indicators.length) {
      await WhatsAppService.sendMessage(from, t(lang, 'form_bad_indicator', { count: spec.indicators.length }));
      return true;
    }
    if (e.rating < min || e.rating > max) {
      await WhatsAppService.sendMessage(from, t(lang, 'form_bad_rating', { min, max }));
      return true;
    }
  }
  for (const e of edits) state.edits[`r_${fid(spec.indicators[e.n - 1].id)}`] = String(e.rating);
  await ObserveState.setState(user.id, 'awaiting_form', state);
  const session = await loadSession(state.sessionId);
  if (session) await sendDomain(from, lang, session, state);
  return true;
}

/**
 * Reopen the form from the pending list (observe_form_<sessionId>). Only the
 * observation's own coach; never a closed observation.
 */
async function resume(user, from, sessionId) {
  const lang = observeLang(user);
  const session = await loadSession(sessionId);
  if (!session || session.observer_user_id !== user.id) {
    await WhatsAppService.sendMessage(from, t(lang, 'debrief_not_yours'));
    return true;
  }
  if (isTerminalStatus(session.status)) {
    await WhatsAppService.sendMessage(from, t(lang, 'flow_terminal_refused'));
    return true;
  }
  if (session.status === 'observer_review_complete') {
    await WhatsAppService.sendMessage(from, t(lang, 'form_already_saved'));
    return true;
  }
  if (session.status !== 'awaiting_observer_review') {
    await WhatsAppService.sendMessage(from, t(lang, 'resume_wait_ack'));
    return true;
  }
  return start(user, from, sessionId, { lang });
}

module.exports = { start, startSectionB, handleText, resume, renderDomain, parseEdits };
