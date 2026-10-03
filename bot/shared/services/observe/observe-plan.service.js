/**
 * "Which lesson plan was this lesson taught from?" — the plan behind Section B.
 *
 * Section B checks an observed lesson against its plan, move by move, with the
 * same fidelity engine a teacher's own session uses. An observation has no
 * plan step of its own, so once the observed teacher is known (bound by the
 * visit picker, or named afterwards through observe-who) the coach is offered
 * that teacher's recent plans. The same constraints as observe-who:
 *
 *   1. It must NEVER block or restart the capture. The question is
 *      fire-and-forget; the analysis waits for the answer a bounded time
 *      (awaitPlanAnswer, LP_FIDELITY_PLAN_WAIT_SECONDS) and goes on without it.
 *   2. No new linking path. A pick goes through the SHARED linker
 *      (lp-coaching-linker) owned by the TEACHER, so a coach can only link that
 *      teacher's own plan, and the analysis reads the plan from the row exactly
 *      as it does for a teacher's own session.
 *
 * A pick can land at any point of the observation's life, so it is
 * status-aware: before the analysis finished it only links (the analysis
 * picks it up); while the coach's form is open it re-grades Section B into the
 * draft; once the form is saved it is too late and nothing is linked.
 *
 * The offered plans, and whether a question is open, are kept in Redis under
 * a key of this service's own (observe:plan:<sessionId>) — never in observe
 * state. The same key remembers a teacher with no plans at all, so Section B
 * can say so rather than "no answer".
 */

// Requires are LAZY on purpose: config/supabase.js exits when its env is
// absent, so a top-level require would make the pure helpers below untestable.
const { t, observeLang } = require('./observe-strings');
const { isTerminalStatus } = require('./observe-terminal');
const { logToFile } = require('../../utils/logger');

const LP_PREFIX = 'observe_lp_';
const TTL_SECONDS = 2 * 24 * 3600;   // outlives a form left open overnight
const MAX_PLAN_ROWS = 9;             // +1 "No plan" = a 10-row list, the tightest channel cap
const TITLE_CAP = 24;
const DESC_CAP = 72;
const DEFAULT_POLL_MS = 1000;
// Same env and default as fidelity-session.js#planWaitMs: one knob for how
// long an analysis waits on a plan.
const DEFAULT_PLAN_WAIT_SECONDS = 90;

// Before the analysis finished: a pick only links, the analysis reads it.
// ('failed' too — a retry re-runs the analysis, which reads it then.)
const BEFORE_ANALYSIS = new Set(['confirmed', 'transcribing', 'transcription_complete', 'analyzing', 'failed']);
// The analysis ran and the coach's form is (or is about to be) open: a pick
// re-grades. analysis_complete is the moment between the analysis write and the
// draft arming review; the re-grade's write is guarded on review either way.
const FORM_OPEN = new Set(['analysis_complete', 'awaiting_observer_review']);
const IN_REVIEW_STATUS = 'awaiting_observer_review';

const key = (sessionId) => `observe:plan:${sessionId}`;
const clip = (s, n) => (s == null ? '' : String(s)).slice(0, n);

function planWaitMs() {
  const n = Number(process.env.LP_FIDELITY_PLAN_WAIT_SECONDS);
  return (Number.isFinite(n) && n >= 0 ? n : DEFAULT_PLAN_WAIT_SECONDS) * 1000;
}

async function readMarker(sessionId) {
  try {
    const raw = await require('../cache/railway-redis.service').get(key(sessionId));
    return raw && typeof raw === 'object' ? raw : (raw ? JSON.parse(raw) : null);
  } catch (_) {
    return null;
  }
}

async function writeMarker(sessionId, marker) {
  await require('../cache/railway-redis.service').setexWithCeiling(key(sessionId), TTL_SECONDS, JSON.stringify(marker));
}

/** One row per plan, plus "No plan" so the coach is never trapped. */
function buildPlanPayload(plans, lang, sessionId) {
  const rows = (plans || []).slice(0, MAX_PLAN_ROWS).map((plan, i) => {
    const date = plan.created_at ? new Date(plan.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return {
      id: `${LP_PREFIX}${sessionId}_${i}`,
      title: clip(plan.topic || '—', TITLE_CAP),
      description: clip([plan.grade ? `Grade ${plan.grade}` : null, date].filter(Boolean).join(' • '), DESC_CAP),
    };
  });
  rows.push({
    id: `${LP_PREFIX}${sessionId}_none`,
    title: clip(t(lang, 'secb_plan_none'), TITLE_CAP),
    description: clip(t(lang, 'secb_plan_none_desc'), DESC_CAP),
  });
  return {
    type: 'list',
    header: '',
    body: t(lang, 'secb_plan_body'),
    action: {
      button: clip(t(lang, 'secb_plan_button'), 20),
      sections: [{ title: clip(t(lang, 'secb_plan_section'), 24), rows }],
    },
  };
}

/** `observe_lp_<sessionId>_<idx|none>` → parts, or null when not ours. */
function parsePlanId(listId) {
  if (!listId || typeof listId !== 'string' || !listId.startsWith(LP_PREFIX)) return null;
  const rest = listId.slice(LP_PREFIX.length);
  const cut = rest.lastIndexOf('_');
  if (cut <= 0) return null;
  const sessionId = rest.slice(0, cut);
  const tail = rest.slice(cut + 1);
  if (tail === 'none') return { sessionId, index: null, none: true };
  if (!/^\d+$/.test(tail)) return null;
  return { sessionId, index: parseInt(tail, 10), none: false };
}

async function loadSession(sessionId, cols) {
  const supabase = require('../../config/supabase');
  const { data } = await supabase.from('coaching_sessions').select(cols).eq('id', sessionId).maybeSingle();
  return data || null;
}

/**
 * Ask, if the teacher is known and has plans. Fire-and-forget: every failure
 * is swallowed — a missing Section B is a far smaller problem than disturbing
 * a capture. Asked once per observation (a re-answered "who" does not re-ask).
 */
async function maybeAskForPlan(coachUser, from, sessionId) {
  try {
    const { isFidelityEnabled } = require('../coaching/fidelity/fidelity-orchestrator');
    if (!coachUser || !sessionId || !isFidelityEnabled()) return false;
    const session = await loadSession(sessionId, 'id, user_id, observer_user_id, status');
    if (!session || session.observer_user_id !== coachUser.id || isTerminalStatus(session.status)) return false;
    // Still owned by the coach: nobody to offer plans for yet (observe-who asks again once named).
    if (!session.user_id || session.user_id === session.observer_user_id) return false;
    if (await readMarker(sessionId)) return false;

    const { recentLessonPlansFor } = require('../coaching/lp-coaching/lp-step.service');
    const plans = (await recentLessonPlansFor(session.user_id)).slice(0, MAX_PLAN_ROWS);
    if (!plans.length) {
      // Nothing to offer — stay silent, but remember why Section B will be empty.
      await writeMarker(sessionId, { sessionId, state: 'no_plans' });
      logToFile('🔭 observe-plan: the teacher has no plans — not asked', { sessionId });
      return false;
    }
    await writeMarker(sessionId, { sessionId, state: 'asked', plans: plans.map((p) => ({ id: p.id, topic: p.topic || null })) });
    const WhatsAppService = require('../whatsapp.service');
    await WhatsAppService.sendInteractiveMessage(from, buildPlanPayload(plans, observeLang(coachUser), sessionId));
    logToFile('🔭 observe-plan: asked which plan the lesson was taught from', { sessionId, offered: plans.length });
    return true;
  } catch (err) {
    logToFile('⚠️ observe-plan: ask failed (non-blocking)', { sessionId, error: err.message });
    return false;
  }
}

/** The analysis_data / autofill_analysis_data patch for a Section B result, both versions alike. */
function withSectionB(data, lpFidelity, sectionB) {
  return { ...(data || {}), lp_fidelity: lpFidelity, section_b: sectionB };
}

/** Write Section B into v2 and v1 — only while the coach's form is still open. */
async function writeSectionB(session, lpFidelity, sectionB) {
  const supabase = require('../../config/supabase');
  const { data, error } = await supabase.from('coaching_sessions')
    .update({
      analysis_data: withSectionB(session.analysis_data, lpFidelity, sectionB),
      // v1 is the AI's first pass; a plan the coach linked late is part of it.
      autofill_analysis_data: withSectionB(session.autofill_analysis_data || session.analysis_data, lpFidelity, sectionB),
    })
    .eq('id', session.id)
    .eq('status', IN_REVIEW_STATUS)
    .select('id');
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Grade Section B now, against the plan the row links, and write it into the
 * draft. One grading run (as the late-plan recompute does): the coach is
 * waiting. @returns {Promise<{written:boolean, lpFidelity:object|null, sectionB:object}>}
 */
async function regradeSectionB(sessionId) {
  const { computeFidelityForSession } = require('../coaching/fidelity/fidelity-session');
  const { sectionBRecord } = require('./observe-section-b');
  const session = await loadSession(sessionId, '*');
  if (!session || !FORM_OPEN.has(session.status)) {
    return { written: false, lpFidelity: null, sectionB: null };
  }
  const lpFidelity = await computeFidelityForSession(session, { runs: 1 });
  const sectionB = sectionBRecord(lpFidelity, { detail: await planDetail(session) });
  // Re-read: the grading took a while, and the write must carry what is there now.
  const fresh = (await loadSession(sessionId, 'id, status, analysis_data, autofill_analysis_data')) || session;
  const written = await writeSectionB(fresh, lpFidelity, sectionB);
  logToFile('🔭 observe-plan: Section B re-graded', { sessionId, written, state: sectionB.status, reason: sectionB.reason });
  return { written, lpFidelity, sectionB };
}

/** "No plan" after the analysis: Section B says the coach chose none. */
async function markNoPlan(sessionId) {
  const { sectionBRecord } = require('./observe-section-b');
  const session = await loadSession(sessionId, 'id, status, analysis_data, autofill_analysis_data');
  if (!session) return false;
  const lpFidelity = { status: 'lp_absent', graded_at: new Date().toISOString() };
  return writeSectionB(session, lpFidelity, sectionBRecord(lpFidelity, { detail: 'coach_said_no_plan' }));
}

/** The re-grade and its message, run after the tap was answered. */
async function regradeAndTell(sessionId, from, lang, topic, none) {
  const WhatsAppService = require('../whatsapp.service');
  try {
    const written = none ? await markNoPlan(sessionId) : (await regradeSectionB(sessionId)).written;
    if (!written) await WhatsAppService.sendMessage(from, t(lang, 'secb_plan_too_late'));
    else if (!none) await WhatsAppService.sendMessage(from, t(lang, 'secb_plan_regraded', { topic: topic || '' }));
  } catch (err) {
    logToFile('❌ observe-plan: Section B re-grade failed', { sessionId, error: err.message });
  }
}

/**
 * A tap on one of our rows. Returns true when consumed.
 * @param {{awaitRegrade?: boolean}} [opts] the tap is answered at once and a
 *   re-grade (a model call) runs after it, off the webhook; tests wait for it.
 */
async function handlePlanPick(user, from, listId, opts = {}) {
  const parsed = parsePlanId(listId);
  if (!parsed || !user) return false;
  const WhatsAppService = require('../whatsapp.service');
  const lang = observeLang(user);

  const session = await loadSession(parsed.sessionId, 'id, user_id, observer_user_id, status');
  if (!session || session.observer_user_id !== user.id) {
    await WhatsAppService.sendMessage(from, t(lang, 'debrief_not_yours'));
    return true;
  }
  if (isTerminalStatus(session.status)) {
    await WhatsAppService.sendMessage(from, t(lang, 'resume_cancelled'));
    return true;
  }
  const beforeAnalysis = BEFORE_ANALYSIS.has(session.status);
  if (!beforeAnalysis && !FORM_OPEN.has(session.status)) {
    // The form is saved: the coach's ratings stand as they were reviewed.
    await WhatsAppService.sendMessage(from, t(lang, 'secb_plan_too_late'));
    return true;
  }

  const marker = await readMarker(parsed.sessionId);
  const plans = marker && marker.sessionId === parsed.sessionId && Array.isArray(marker.plans) ? marker.plans : null;
  const plan = plans && !parsed.none ? plans[parsed.index] : null;
  if (!plans || (!parsed.none && !plan)) {
    await WhatsAppService.sendMessage(from, t(lang, 'secb_plan_stale'));
    return true;
  }

  const { handleLPSelection } = require('../coaching/lp-coaching/lp-coaching-linker.service');
  if (parsed.none) {
    await handleLPSelection(parsed.sessionId, `lp_none_${parsed.sessionId}`);
  } else {
    // Owned by the TEACHER: a row id arrives from a chat reply, and only the
    // observed teacher's own plan may be linked.
    const linked = await handleLPSelection(parsed.sessionId, `lp_select_${plan.id}_${parsed.sessionId}`, { ownerUserId: session.user_id });
    if (!linked || !linked.linked_lesson_plan_id) {
      await WhatsAppService.sendMessage(from, t(lang, 'secb_plan_stale'));
      return true;
    }
  }
  await writeMarker(parsed.sessionId, { ...marker, state: 'answered', answer: parsed.none ? 'none' : plan.id });
  await WhatsAppService.sendMessage(from, parsed.none ? t(lang, 'secb_plan_skipped') : t(lang, 'secb_plan_linked', { topic: plan.topic || '' }));
  logToFile('🔭 observe-plan: plan answered', { sessionId: parsed.sessionId, none: parsed.none, beforeAnalysis });

  if (!beforeAnalysis) {
    const job = regradeAndTell(parsed.sessionId, from, lang, plan && plan.topic, parsed.none);
    if (opts.awaitRegrade) await job;
  }
  return true;
}

/**
 * The analysis reads the plan ONCE, after its bounded wait. A pick that lands
 * after that read but before the analysis finishes is linked — and the coach
 * is told "Section B will check the lesson against …" — yet was never graded.
 * So when the form opens (observe-draft.onAnalysisReady), the row is
 * reconciled: a linked plan other than the one graded is graded now, and a
 * late "No plan" says so instead of "no plan was picked". Never throws.
 * @returns {Promise<boolean>} true when Section B was rewritten
 */
async function reconcileLatePick(sessionId, { from, lang = 'en' } = {}) {
  try {
    const { isFidelityEnabled } = require('../coaching/fidelity/fidelity-orchestrator');
    if (!isFidelityEnabled()) return false;
    const s = await loadSession(sessionId, 'id, status, linked_lesson_plan_id, lesson_plan_link_method, analysis_data');
    const ad = (s && s.analysis_data) || {};
    if (!s || s.status !== IN_REVIEW_STATUS || !ad.section_b) return false;
    const linked = s.linked_lesson_plan_id || null;
    const graded = (ad.lp_fidelity && ad.lp_fidelity.lesson_plan_id) || null;
    let written = false;
    let topic = null;
    if (linked && linked !== graded) {
      written = (await regradeSectionB(sessionId)).written;
      const marker = await readMarker(sessionId);
      const plan = marker && Array.isArray(marker.plans) ? marker.plans.find((p) => p.id === linked) : null;
      topic = plan && plan.topic;
    } else if (!linked && s.lesson_plan_link_method === 'none' && ad.section_b.detail !== 'coach_said_no_plan') {
      written = await markNoPlan(sessionId);
    }
    if (written && linked && from) {
      await require('../whatsapp.service').sendMessage(from, t(lang, 'secb_plan_regraded', { topic: topic || '' }));
    }
    if (written) logToFile('🔭 observe-plan: a late pick reconciled as the form opened', { sessionId, linked: !!linked });
    return written;
  } catch (err) {
    logToFile('⚠️ observe-plan: late-pick reconcile failed (Section B stands as graded)', { sessionId, error: err.message });
    return false;
  }
}

/**
 * The analysis waits here for an open plan question, bounded by
 * LP_FIDELITY_PLAN_WAIT_SECONDS. Returns at once when nothing was asked.
 * @returns {Promise<{asked:boolean, answered:boolean}>}
 */
async function awaitPlanAnswer(sessionId, { pollMs = DEFAULT_POLL_MS } = {}) {
  let marker = await readMarker(sessionId);
  if (!marker || (marker.state !== 'asked' && marker.state !== 'answered')) return { asked: false, answered: false };
  const deadline = Date.now() + planWaitMs();
  while (marker && marker.state === 'asked' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
    marker = await readMarker(sessionId);
  }
  const answered = !!marker && marker.state === 'answered';
  if (!answered) logToFile('🔭 observe-plan: no plan answer in time — the analysis goes on', { sessionId });
  return { asked: true, answered };
}

/**
 * Why an observation has no plan, for sectionBRecord's detail:
 * teacher_unknown | coach_said_no_plan | teacher_has_no_plans | no_answer.
 */
async function planDetail(session) {
  const s = session || {};
  if (!s.user_id || s.user_id === s.observer_user_id) return 'teacher_unknown';
  if (s.lesson_plan_link_method === 'none') return 'coach_said_no_plan';
  const marker = s.id ? await readMarker(s.id) : null;
  if (marker && marker.state === 'no_plans') return 'teacher_has_no_plans';
  return 'no_answer';
}

module.exports = {
  buildPlanPayload,
  parsePlanId,
  maybeAskForPlan,
  handlePlanPick,
  regradeSectionB,
  awaitPlanAnswer,
  planDetail,
  reconcileLatePick,
  LP_PREFIX,
};
