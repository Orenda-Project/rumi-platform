/**
 * Section B of an observation — did the lesson follow its plan? — as the
 * coach's portal view shows it.
 *
 * The bot stores two things on coaching_sessions.analysis_data:
 *   section_b    the status: assessed, or not_assessed with the reason
 *   lp_fidelity  the fidelity engine's blob: the plan's moves, each with the
 *                verdict (the coach's, where they changed it in chat)
 * This module turns them into the portal's whitelist: the moves in plan
 * order, a verdict label each, whether the coach changed it, and a mismatch
 * flag — or the sentence saying why the lesson was not assessed. Never the
 * percentage, the band, the credit, the counts, or the evidence quotes.
 *
 * The dashboard cannot require the bot's modules at runtime, so the verdict
 * labels (observe-strings.js secb_v_*), the phase labels
 * (coaching/fidelity/fidelity-phases.js) and the not-assessed copy
 * (secb_na_*) are mirrored here, English only; a drift-guard test
 * (tests/observe/observe-portal-coach.service.test.js) requires both sides and
 * fails if they ever disagree.
 */

// Mirror of observe-section-b.js VERDICTS (order and labels; drift-guarded).
const VERDICTS = Object.freeze([
  { id: 'executed', label: 'As planned' },
  { id: 'substituted_equivalent', label: 'Equal swap' },
  { id: 'substituted_better', label: 'Better swap' },
  { id: 'partial', label: 'Partly' },
  { id: 'not_done', label: 'Not done' },
  { id: 'not_adjudicable', label: "Can't tell" },
]);
const VERDICT_BY_ID = Object.fromEntries(VERDICTS.map((v) => [v.id, v]));

// Mirror of fidelity-phases.js PHASE_LABEL and its aliases (drift-guarded).
const PHASE_LABEL = Object.freeze({
  warm_up: 'Warm-up',
  hook: 'Hook',
  recall: 'Recall',
  announce: 'Objective',
  explain: 'Explain',
  guided: 'Guided practice',
  independent: 'Independent work',
  peer_review: 'Peer review',
  exit: 'Exit check',
  homework: 'Homework',
});
const PHASE_ALIASES = Object.freeze({
  guided_practice: 'guided',
  independent_practice: 'independent',
  warmup: 'warm_up',
  exit_ticket: 'exit',
});

// Mirror of observe-strings.js secb_na_* (English; drift-guarded).
const NOT_ASSESSED = Object.freeze({
  no_plan: 'No lesson plan was linked to this observation, so there was nothing to check the lesson against.',
  no_plan_teacher_has_no_plans: '{name} has no lesson plan made with Rumi yet, so there was nothing to check the lesson against.',
  no_plan_coach_said_no_plan: 'You said this lesson had no plan, so there was nothing to check it against.',
  no_plan_no_answer: 'No plan was picked for this lesson, so there was nothing to check it against.',
  no_plan_teacher_unknown: 'I did not know whose lesson this was when it arrived, so I could not offer their plans.',
  no_timings: 'The plan was linked, but the transcript of this recording has no timings, so the moves could not be checked one by one.',
  recording_unusable: 'The plan was linked, but the recording did not let me tell which planned moves happened.',
  plan_unreadable: 'The plan was linked, but I could not read the plan itself (it has no text I can use).',
  grader_failed: 'The plan was linked, but the move-by-move check could not run this time.',
});
const THE_TEACHER = 'This teacher';
const REASONS = ['no_plan', 'no_timings', 'recording_unusable', 'plan_unreadable', 'grader_failed'];

function own(obj, key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
}

/** A known phase, an alias of one, or null (as fidelity-phases.js). */
function canonicalPhase(phase) {
  if (typeof phase !== 'string') return null;
  const p = phase.trim().toLowerCase();
  if (own(PHASE_LABEL, p)) return p;
  return own(PHASE_ALIASES, p) ? PHASE_ALIASES[p] : null;
}

function phaseLabel(phase) {
  const p = canonicalPhase(phase);
  return p ? PHASE_LABEL[p] : '';
}

/** An unknown verdict reads as "can't tell", as in the chat form. */
function verdictId(verdict) {
  return own(VERDICT_BY_ID, verdict) ? verdict : 'not_adjudicable';
}

function verdictLabel(verdict) {
  return VERDICT_BY_ID[verdictId(verdict)].label;
}

/** The coach-facing sentence for why Section B was not assessed (notAssessedText's middle line). */
function notAssessedMessage(record, teacherName) {
  const reason = (record && record.reason) || 'no_plan';
  let why = own(NOT_ASSESSED, reason) ? NOT_ASSESSED[reason] : NOT_ASSESSED.grader_failed;
  if (reason === 'no_plan' && record && record.detail) {
    const key = `no_plan_${record.detail}`;
    why = (own(NOT_ASSESSED, key) ? NOT_ASSESSED[key] : why).replace(/\{name\}/g, teacherName || THE_TEACHER);
  }
  return why;
}

/**
 * @param {object} analysis coaching_sessions.analysis_data
 * @param {{teacherName?: string|null}} [ctx]
 * @returns {null|object} null when the observation has no Section B record
 */
function shapeSectionB(analysis, ctx = {}) {
  const record = analysis && analysis.section_b;
  if (!record || typeof record !== 'object') return null;

  if (record.status !== 'assessed') {
    const reason = REASONS.includes(record.reason) ? record.reason : (record.reason ? 'grader_failed' : 'no_plan');
    return {
      status: 'not_assessed',
      reason,
      detail: reason === 'no_plan' && typeof record.detail === 'string' ? record.detail : null,
      message: notAssessedMessage({ ...record, reason }, ctx.teacherName),
    };
  }

  const lp = analysis.lp_fidelity || {};
  const rows = Array.isArray(lp.moves) ? lp.moves.filter((m) => m && typeof m === 'object') : [];
  const moves = rows.map((m, i) => ({
    n: i + 1,
    phase: canonicalPhase(m.phase),
    phaseLabel: phaseLabel(m.phase),
    text: typeof m.text === 'string' ? m.text : '',
    verdict: verdictId(m.verdict),
    verdictLabel: verdictLabel(m.verdict),
    coachChanged: m.coach_verdict === true,
  }));
  return {
    status: 'assessed',
    mismatch: record.mismatch === true || !!(lp.moderators && lp.moderators.note === 'lesson_mismatch'),
    editedByCoach: lp.observer_edited === true || moves.some((m) => m.coachChanged),
    moves,
  };
}

module.exports = {
  VERDICTS,
  canonicalPhase,
  phaseLabel,
  verdictLabel,
  notAssessedMessage,
  shapeSectionB,
};
