/**
 * Section B of an observation — did the lesson follow its plan? (pure layer)
 *
 * Section A is the observation framework's ratings. Section B is lesson-plan
 * fidelity: main's engine (coaching/fidelity) run on the observation's own
 * recording against the plan the coach linked, stored as
 * analysis_data.lp_fidelity like any coaching session's. This module owns what
 * observe does with that blob:
 *
 *   sectionBRecord     the persisted status (analysis_data.section_b):
 *                      assessed, or not_assessed with the reason — never a
 *                      zero for a lesson nobody could measure
 *   renderCoachPage    one page of moves for the coach's chat form: the plan's
 *                      move, the verdict, the quoted moment
 *   applyVerdictEdits  the coach's verdicts → the SAME scorer the teacher path
 *                      uses, so the coach's version is the measurement
 *   notAssessedText    the coach is told which state it actually is
 *   buildPlanNote      the kind version the teacher reads: what went as
 *                      planned, the substitutions that kept the purpose named
 *                      as strengths, one thing to try — and no number
 *
 * No I/O. The form, the analysis step and the send service call these.
 */

const { observeStrings, fill } = require('./observe-strings');
const { fidelityState } = require('../coaching/fidelity/fidelity-report');
const { phaseLabel } = require('../coaching/fidelity/fidelity-phases');
const { firewallViolations, assertTeacherSafe } = require('./observe-teacher-report');

const PAGE_SIZE = 6;
const MOVE_TEXT_CAP = 160;
const EVIDENCE_CAP = 140;

// The coach replies with the verdict's number. The order is the order of
// credit, best first, so "1" is always "as planned".
const VERDICTS = [
  { id: 'executed', key: 'secb_v_executed', glyph: '✓' },
  { id: 'substituted_equivalent', key: 'secb_v_equivalent', glyph: '↔' },
  { id: 'substituted_better', key: 'secb_v_better', glyph: '⭐' },
  { id: 'partial', key: 'secb_v_partial', glyph: '◐' },
  { id: 'not_done', key: 'secb_v_not_done', glyph: '✗' },
  { id: 'not_adjudicable', key: 'secb_v_cant_tell', glyph: '–' },
];
const VERDICT_BY_ID = Object.fromEntries(VERDICTS.map((v) => [v.id, v]));
const AS_PLANNED = new Set(['executed']);
const OWN_WAY = new Set(['substituted_equivalent', 'substituted_better']);
const EDIT_PART_RX = /^(\d{1,2})\s*(?:[ :=>\-→]|to)\s*(\d{1,2})$/i;

const S = (lang) => observeStrings(lang);
const fid = (n) => `fid_${n}`;

function clip(s, n) {
  const a = [...String(s == null ? '' : s).trim()];
  if (a.length <= n) return a.join('');
  const cut = a.slice(0, n - 1).join('');
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:·]+$/, '')}…`;
}

function movesOf(lp) {
  return lp && Array.isArray(lp.moves) ? lp.moves : [];
}

// ── The persisted status ────────────────────────────────────────────────

const REASON_BY_STATE = {
  no_plan: 'no_plan',
  no_timings: 'no_timings',
  recording_unusable: 'recording_unusable',
  plan_unreadable: 'plan_unreadable',
  grader_failed: 'grader_failed',
};

/**
 * @param {object|null} lp  analysis_data.lp_fidelity (null: the engine never ran)
 * @param {{detail?: string}} [extra] why there was no plan, when the caller knows
 *   (teacher_has_no_plans, coach_said_no_plan, no_answer, teacher_unknown)
 * @returns {{status:'assessed'|'not_assessed', reason:string|null, detail?:string, mismatch?:boolean}}
 */
function sectionBRecord(lp, extra = {}) {
  const state = fidelityState(lp) || 'no_plan';
  if (state === 'measured' || state === 'lesson_mismatch') {
    return { status: 'assessed', reason: null, mismatch: state === 'lesson_mismatch' };
  }
  const rec = { status: 'not_assessed', reason: REASON_BY_STATE[state] || 'grader_failed' };
  if (rec.reason === 'no_plan' && extra.detail) rec.detail = extra.detail;
  return rec;
}

/** Is there a measurement the coach can review move by move? */
function isReviewable(lp) {
  return sectionBRecord(lp).status === 'assessed' && movesOf(lp).length > 0;
}

// ── The coach's pages ───────────────────────────────────────────────────

function pageCount(lp) {
  return Math.ceil(movesOf(lp).length / PAGE_SIZE);
}

function verdictLabel(lang, verdict) {
  const v = VERDICT_BY_ID[verdict] || VERDICT_BY_ID.not_adjudicable;
  return `${v.glyph} ${S(lang)[v.key]}`;
}

function legend(lang) {
  return VERDICTS.map((v, i) => `${i + 1} ${v.glyph} ${S(lang)[v.key]}`).join(' · ');
}

/**
 * One page of moves (PAGE_SIZE), numbered across the whole plan so a coach can
 * name any move. Pending edits show as changed.
 */
function renderCoachPage({ lang = 'en', lp, page = 0, edits = {} }) {
  const all = movesOf(lp);
  const pages = Math.max(1, pageCount(lp));
  const strings = S(lang);
  const lines = [fill(strings.secb_header, { n: page + 1, total: pages })];
  if (page === 0) {
    lines.push(strings.secb_intro);
    if (lp && lp.fidelity_pct != null) {
      lines.push(fill(strings.secb_measured, { pct: lp.fidelity_pct, band: strings[`secb_band_${lp.band}`] || lp.band || '' }));
    }
    if (lp && lp.moderators && lp.moderators.note === 'lesson_mismatch') lines.push(strings.secb_mismatch);
    if (lp && lp.moderators && lp.moderators.truncation_inconsistent) lines.push(strings.secb_truncation);
  }
  lines.push('');
  const start = page * PAGE_SIZE;
  all.slice(start, start + PAGE_SIZE).forEach((m, i) => {
    const n = start + i + 1;
    const edited = edits[fid(n)];
    const verdict = edited || m.verdict;
    const phase = phaseLabel(m.phase);
    lines.push(`${n}. ${phase ? `${phase} — ` : ''}${clip(m.text, MOVE_TEXT_CAP)}`);
    lines.push(`   *${verdictLabel(lang, verdict)}*${edited ? ` ${strings.form_changed_mark}` : ''}`);
    const ev = String(m.evidence || '').trim();
    if (ev) lines.push(`   _${clip(ev, EVIDENCE_CAP)}_`);
  });
  lines.push('');
  lines.push(fill(strings.secb_reply_hint, { count: all.length }));
  lines.push(legend(lang));
  return lines.join('\n');
}

/** "5 1" / "4 2, 5 3" → [{n, verdict}] (verdict null when the number is not 1-6), or null when not an edit at all. */
function parseVerdictEdits(text) {
  const parts = String(text || '').split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = [];
  for (const p of parts) {
    const m = p.match(EDIT_PART_RX);
    if (!m) return null;
    const choice = VERDICTS[parseInt(m[2], 10) - 1];
    out.push({ n: parseInt(m[1], 10), verdict: choice ? choice.id : null });
  }
  return out;
}

// ── The coach's verdicts, re-scored ─────────────────────────────────────

/**
 * Apply the coach's per-move verdicts (fid_<n> → verdict id) and re-run main's
 * scorer on the corrected rows, so Section B is always the scorer's reading of
 * the coach's verdicts. The persisted rows carry both halves of the scorer's
 * contract (the planned move and its verdict), so they feed back in as both.
 *
 * A move the PLAN marked not assessable from audio (silent board work) is in
 * not_assessed with a verdict other than not_adjudicable; it stays out of the
 * score unless the coach rules on it — the coach was in the room and saw it.
 *
 * @returns {{lp: object, verdictsChanged: number}} input never mutated
 */
function applyVerdictEdits(lp, edits = {}) {
  const out = { lp, verdictsChanged: 0 };
  if (!isReviewable(lp)) return out;
  const notAssessed = new Set(lp.not_assessed || []);
  const rows = movesOf(lp).map((m) => ({ ...m }));
  rows.forEach((row, i) => {
    const v = edits[fid(i + 1)];
    if (typeof v === 'string' && VERDICT_BY_ID[v] && v !== row.verdict) {
      row.verdict = v;
      row.coach_verdict = true;
      out.verdictsChanged += 1;
    }
  });
  if (!out.verdictsChanged) return out;

  const moves = rows.map((r) => ({
    ...r,
    adjudicable: r.coach_verdict ? true : !(notAssessed.has(r.move_id) && r.verdict !== 'not_adjudicable'),
  }));
  const { scoreFidelity } = require('../coaching/fidelity/fidelity-scorer');
  const { truncation_inconsistent: _t, ...moderators } = lp.moderators || {};
  const rescored = scoreFidelity(moves, rows, lp.moderators ? { moderators } : {});
  rescored.moves = rescored.moves.map((m, i) => (rows[i].coach_verdict ? { ...m, coach_verdict: true } : m));
  out.lp = { ...lp, ...rescored, time_on_task: lp.time_on_task || rescored.time_on_task, observer_edited: true };
  return out;
}

// ── Not assessed: name the state ────────────────────────────────────────

/**
 * @param {string} lang
 * @param {{reason:string, detail?:string}} record analysis_data.section_b
 * @param {{teacherName?: string}} [ctx]
 */
function notAssessedText(lang, record, ctx = {}) {
  const strings = S(lang);
  const reason = (record && record.reason) || 'no_plan';
  let why = strings[`secb_na_${reason}`] || strings.secb_na_grader_failed;
  if (reason === 'no_plan' && record && record.detail) {
    why = fill(strings[`secb_na_no_plan_${record.detail}`] || why, { name: ctx.teacherName || strings.secb_the_teacher });
  }
  return `${strings.secb_na_header}\n${why}\n${strings.secb_na_consequence}`;
}

// ── The teacher's kind version ──────────────────────────────────────────

/**
 * Built from the coach's verdicts (the edited blob), never the raw grading:
 * what went as planned, the substitutions that kept the purpose named as
 * strengths, and one thing to try. No percentage, band or count — the
 * observe trust firewall. Each line is checked on its own and a line that
 * fails is left out; the whole note is checked again.
 *
 * @returns {string|null} null when there is nothing kind and true to say
 *   (nothing measured, or a lesson that did not match its plan)
 */
function buildPlanNote(lp, { lang = 'en', material = [] } = {}) {
  const rec = sectionBRecord(lp);
  if (rec.status !== 'assessed' || rec.mismatch) return null;
  const strings = S(lang);
  const safe = (s) => s && !firewallViolations(s, { material }).length;
  const moves = movesOf(lp).filter((m) => m && m.text);
  const line = (m) => `• ${clip(m.text, MOVE_TEXT_CAP)}`;

  const planned = moves.filter((m) => AS_PLANNED.has(m.verdict)).map(line).filter(safe).slice(0, 3);
  const ownWay = moves.filter((m) => OWN_WAY.has(m.verdict))
    .map((m) => `${line(m)} — ${strings[m.verdict === 'substituted_better' ? 'secb_teacher_better' : 'secb_teacher_equivalent']}`)
    .filter(safe).slice(0, 2);
  const counted = moves.filter((m) => m.counted);
  const next = [
    ...counted.filter((m) => m.verdict === 'not_done' && m.bucket !== 'optional_extension'),
    ...counted.filter((m) => m.verdict === 'partial'),
  ].map(line).find(safe);

  if (!planned.length && !ownWay.length && !next) return null;
  const parts = [`📋 *${strings.secb_teacher_title}*`];
  if (planned.length) parts.push('', `✅ *${strings.secb_teacher_planned}*`, ...planned);
  if (ownWay.length) parts.push('', `⭐ *${strings.secb_teacher_own_way}*`, ...ownWay);
  if (next) parts.push('', `🌱 *${strings.secb_teacher_try}*`, next);
  const text = parts.join('\n');
  assertTeacherSafe([text], { material });
  return text;
}

module.exports = {
  sectionBRecord,
  isReviewable,
  pageCount,
  renderCoachPage,
  parseVerdictEdits,
  applyVerdictEdits,
  notAssessedText,
  buildPlanNote,
  verdictLabel,
  VERDICTS,
  PAGE_SIZE,
  _strings: S,
};
