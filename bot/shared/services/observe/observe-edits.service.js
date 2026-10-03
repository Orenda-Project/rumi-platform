/**
 * Merge a coach's rating edits into the observation (v2) — the one write both
 * edit surfaces share: the stepwise chat form (observe-form.service) and the
 * Meta form Flow's endpoint. v1 (autofill_analysis_data) is never touched.
 *
 * Section B (did the lesson follow its plan?) rides along: the coach's
 * per-move verdicts (fid_<n>) are merged in the same write and re-scored by
 * the scorer the measurement came from (observe-section-b). The Flow has no
 * Section B screen, so after a Flow submission they arrive on their own —
 * applySectionBEdits.
 *
 * Also the field helpers both surfaces need to address an indicator and show
 * its evidence the same way.
 */

const supabase = require('../../config/supabase');
const { getObservePack, scaleBounds } = require('./observe-framework');
const { isTerminalStatus } = require('./observe-terminal');
const { logToFile } = require('../../utils/logger');

// The full text stays in analysis_data regardless of what a form shows. 600 is
// the Flow TextArea's own allowance — the evidence is the whole point of the
// review step, and a coach can't judge a rating from a truncated quote.
const PREFILL_TEXT_CAP = 600;

// The only status in which the coach's edits are accepted. Before it there is
// no draft to edit; after it the ratings are saved — and may already be in a
// report the teacher holds, so a stale form must never re-score them or flip a
// completed observation back.
const IN_REVIEW_STATUS = 'awaiting_observer_review';

// Indicator ids are numbers in some rubrics (7) and dotted strings in others
// ("A1.2"); form field names need neither dots nor a number type.
const fid = (id) => String(id).replace(/\./g, '_');

// Word-boundary clip: never cuts mid-word (a mid-word cut reads as a bug).
function clipWords(s, n) {
  const a = [...String(s == null ? '' : s)];
  if (a.length <= n) return a.join('');
  const cut = a.slice(0, n - 1).join('');
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:·]+$/, '')}…`;
}

/** Evidence / improvement text, whichever key the rubric's prompt filled. */
const evidenceOf = (ind) => String(ind.evidence_summary || ind.evidence || ind.evidence_sw || '');
const improvementOf = (ind) => String(ind.improvement || ind.improvement_sw || '');

/** Why edits are refused in this status, or null when they are accepted. */
function refusalFor(status) {
  if (isTerminalStatus(status)) return 'terminal';
  return status === IN_REVIEW_STATUS ? null : 'not_in_review';
}

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
 * The coach's Section B verdicts (fid_<n> → verdict id) into v2, in place.
 * Only the edited blob changes; section_b keeps what the analysis step
 * recorded (the cause of a missing plan) and takes the re-scored status.
 * @returns {number} how many verdicts the coach changed
 */
function mergeVerdicts(v2, edits) {
  if (!v2.lp_fidelity) return 0;
  const { applyVerdictEdits, sectionBRecord } = require('./observe-section-b');
  const { lp, verdictsChanged } = applyVerdictEdits(v2.lp_fidelity, edits || {});
  if (!verdictsChanged) return 0;
  v2.lp_fidelity = lp;
  v2.section_b = { ...(v2.section_b || {}), ...sectionBRecord(lp) };
  return verdictsChanged;
}

/**
 * Merge the coach's edits (r_<id> rating, ev_<id> evidence, imp_<id>
 * improvement) into a v2 analysis, recompute scores, stamp the summary,
 * persist. v1 (autofill_analysis_data) is never touched here.
 *
 * @returns {Promise<object>} the summary, or { refused: 'terminal' | 'not_in_review' }
 */
async function applyObserverEdits(sessionId, edits) {
  const session = await loadSession(sessionId);
  const refusal = refusalFor(session.status);
  if (refusal) {
    logToFile('🚫 observe: observer edits refused', { sessionId, status: session.status, refused: refusal });
    return { refused: refusal };
  }
  const v1 = session.autofill_analysis_data || session.analysis_data;
  const v2 = JSON.parse(JSON.stringify(session.analysis_data || {}));
  const pack = getObservePack();
  const { min, max } = scaleBounds(pack);

  let rescored = 0;
  let textChanged = 0;
  const v1ById = {};
  Object.values((v1 || {}).domains || {}).forEach((d) => (d.indicators || []).forEach((ind) => { v1ById[String(ind.id)] = ind; }));

  Object.values(v2.domains || {}).forEach((d) => {
    (d.indicators || []).forEach((ind) => {
      const f = fid(ind.id);
      const orig = v1ById[String(ind.id)] || {};
      const r = edits[`r_${f}`];
      if (r !== undefined && r !== null && r !== '') {
        const parsed = parseInt(r, 10);
        const newScore = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : min));
        if (newScore !== Number(orig.score)) rescored += 1;
        ind.score = newScore;
      }
      for (const [prefix, field, read] of [['ev_', 'evidence', evidenceOf], ['imp_', 'improvement', improvementOf]]) {
        const val = edits[`${prefix}${f}`];
        if (typeof val === 'string') {
          const origText = read(orig);
          if (val !== origText.slice(0, PREFILL_TEXT_CAP) && val !== origText) {
            textChanged += 1;
            ind[field] = val;
          }
        }
      }
    });
  });

  pack.computeScores(v2);
  const verdictsChanged = mergeVerdicts(v2, edits);

  const summary = {
    indicators_rescored: rescored, text_fields_changed: textChanged, fidelity_verdicts_changed: verdictsChanged,
    edited_at: new Date().toISOString(),
  };
  v2.observer_edit_summary = summary;

  // A wholesale analysis_data write from a read at entry — re-read the debrief
  // at write time so a resubmission can't drop what the worker merged meanwhile.
  const { data: freshRow } = await supabase.from('coaching_sessions').select('analysis_data').eq('id', sessionId).single();
  const freshDebrief = freshRow && freshRow.analysis_data && freshRow.analysis_data.observer_debrief;
  if (freshDebrief) v2.observer_debrief = freshDebrief;

  // Both guards are needed — the read stops the common case, the predicate the
  // race (a cancel, or the other form surface submitting first).
  const { data: written, error } = await supabase.from('coaching_sessions')
    .update({ analysis_data: v2, status: 'observer_review_complete' })
    .eq('id', sessionId)
    .eq('status', IN_REVIEW_STATUS)
    .select('id');
  if (error) throw new Error(`observe: failed to persist v2 edits: ${error.message}`);
  if (!written || !written.length) {
    // The row left review under us. Say so rather than reporting a successful
    // edit — a caller that believes this succeeded would go on to start the
    // debrief and report chain again.
    const { data: now } = await supabase.from('coaching_sessions').select('status').eq('id', sessionId).maybeSingle();
    const refused = refusalFor(now && now.status) || 'not_in_review';
    logToFile('🚫 observe: observer edits refused at write — observation left review', { sessionId, refused });
    return { refused };
  }

  logToFile('📝 observe: observer edits applied (v2)', { sessionId, ...summary });
  return summary;
}

/**
 * The coach's Section B verdicts after a Flow submission: the ratings are
 * already saved (observer_review_complete) and the chat has walked the coach
 * through the plan's moves. Accepted only until anything has followed — once
 * the debrief has started or a report is on its way, the measurement it was
 * built from must not change under it. The write repeats every condition.
 *
 * @returns {Promise<object>} { fidelity_verdicts_changed }, or { refused: 'terminal' | 'not_in_review' }
 */
async function applySectionBEdits(sessionId, edits) {
  const session = await loadSession(sessionId);
  const analysis = session.analysis_data || {};
  const followed = (session.debrief_status && session.debrief_status !== 'pending')
    || !!(analysis.teacher_delivery && analysis.teacher_delivery.status);
  if (isTerminalStatus(session.status) || session.status !== 'observer_review_complete' || followed) {
    const refused = isTerminalStatus(session.status) ? 'terminal' : 'not_in_review';
    logToFile('🚫 observe: Section B edits refused', { sessionId, status: session.status, refused });
    return { refused };
  }
  const v2 = JSON.parse(JSON.stringify(analysis));
  const verdictsChanged = mergeVerdicts(v2, edits);
  if (!verdictsChanged) return { fidelity_verdicts_changed: 0 };

  // Write only what this owns onto the row as it is now, so a debrief the
  // worker merged meanwhile is kept.
  const { data: freshRow } = await supabase.from('coaching_sessions').select('analysis_data').eq('id', sessionId).single();
  const fresh = (freshRow && freshRow.analysis_data) || analysis;
  const next = {
    ...fresh,
    lp_fidelity: v2.lp_fidelity,
    section_b: v2.section_b,
    observer_edit_summary: { ...(fresh.observer_edit_summary || {}), fidelity_verdicts_changed: verdictsChanged },
  };

  let q = supabase.from('coaching_sessions')
    .update({ analysis_data: next })
    .eq('id', sessionId)
    .eq('status', 'observer_review_complete')
    .is('analysis_data->teacher_delivery->>status', null);
  q = session.debrief_status ? q.eq('debrief_status', 'pending') : q.is('debrief_status', null);
  const { data: written, error } = await q.select('id');
  if (error) throw new Error(`observe: failed to persist Section B edits: ${error.message}`);
  if (!written || !written.length) {
    const { data: now } = await supabase.from('coaching_sessions').select('status').eq('id', sessionId).maybeSingle();
    const refused = isTerminalStatus(now && now.status) ? 'terminal' : 'not_in_review';
    logToFile('🚫 observe: Section B edits refused at write — the observation moved on', { sessionId, refused });
    return { refused };
  }
  logToFile('📋 observe: Section B verdicts applied', { sessionId, verdictsChanged });
  return { fidelity_verdicts_changed: verdictsChanged };
}

module.exports = {
  applyObserverEdits, applySectionBEdits, clipWords, evidenceOf, improvementOf, fid, PREFILL_TEXT_CAP, IN_REVIEW_STATUS,
};
