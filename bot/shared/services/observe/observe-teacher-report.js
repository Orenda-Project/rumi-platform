/**
 * The teacher's report — content and the TRUST FIREWALL (pure layer).
 *
 * The teacher receives the hero report rendered from the coach's edited
 * analysis, plus ONE companion note: what the two of them discussed in the
 * debrief and the commitment the teacher spoke in their own words.
 *
 * Everything this module produces is TEACHER-facing, so it owns the rules the
 * whole feature's trust rests on:
 *   - never the coach's raw critique (their private notes, their edit notes);
 *   - never any coach-the-coach material (the wins / try / concern the coach
 *     was given about their own debrief — that is for the coach alone);
 *   - never a score or a number that reads like one ("34/50", "62%", "3 of 5").
 * The prompt asks the model for all of this, and the code below then checks
 * it anyway: a rule that is only requested of a model is a rule that will
 * eventually be broken in front of a teacher.
 *
 * No I/O here. The send service calls these before anything leaves the bot.
 */

const { observeStrings } = require('./observe-strings');

// ── Scores ──────────────────────────────────────────────────────────────

/**
 * Shapes that read as a score. Deliberately NOT "any digit": a date, a time,
 * "Grade 4" or "three chances" is not a verdict, and refusing them would drop
 * honest content. A ratio, a percentage, "N of M", or a number attached to a
 * scoring word is.
 */
const SCORE_PATTERNS = [
  { name: 'ratio', rx: /\d+(?:[.,]\d+)?\s*\/\s*\d+/ },
  { name: 'percentage', rx: /\d+(?:[.,]\d+)?\s*(?:%|per\s?cent\b)/i },
  { name: 'n_of_m', rx: /\b\d+\s+(?:of|out\s+of)\s+\d+\b/i },
  { name: 'scored_number', rx: /\b(?:score[sd]?|marks?|rating|rated)\s*(?:of|:|=|is|was)?\s*\d/i },
  { name: 'number_points', rx: /\b\d+(?:[.,]\d+)?\s*(?:marks?|points?|pts)\b/i },
];

/** @returns {string|null} the name of the first score shape found, or null */
function findScoreLeak(text) {
  const s = String(text || '');
  for (const { name, rx } of SCORE_PATTERNS) {
    if (rx.test(s)) return name;
  }
  return null;
}

// ── Verdicts on the person ──────────────────────────────────────────────

// Phrasing that judges the teacher rather than a teaching move. Mirrors the
// harm-gate vocabulary of the coach feedback. A deployment translating the
// report should extend this list for its language.
const ACCUSATORY_PATTERNS = [
  /\bdon'?t\s+know\s+how\s+to\s+teach\b/i,
  /\b(?:bad|lazy|useless|incompetent|terrible|hopeless)\s+teacher\b/i,
  /\byou\s+(?:are|were)\s+(?:bad|lazy|useless|incompetent|terrible|hopeless)\b/i,
  /\byour\s+class(?:room)?\s+(?:is|was)\s+(?:a\s+mess|dirty|filthy|chaos|out\s+of\s+control)\b/i,
];

function findAccusation(text) {
  const s = String(text || '');
  const hit = ACCUSATORY_PATTERNS.find((rx) => rx.test(s));
  return hit ? String(hit) : null;
}

// ── Coach-only material ─────────────────────────────────────────────────

// Keys of analysis_data that belong to the coach alone. teacherSafeAnalysis
// removes them before ANY teacher artefact is built from the analysis, and
// coachOnlyMaterial collects their text for the verbatim check.
const COACH_ONLY_KEYS = ['observer_debrief', 'observer_edit_summary', 'observer_notes', 'teacher_delivery'];

function collectStrings(value, out) {
  if (value == null) return out;
  if (typeof value === 'string') { if (value.trim()) out.push(value); return out; }
  if (Array.isArray(value)) { value.forEach((v) => collectStrings(v, out)); return out; }
  if (typeof value === 'object') { Object.values(value).forEach((v) => collectStrings(v, out)); }
  return out;
}

/**
 * Every piece of text the teacher must never be shown verbatim: the
 * coach-the-coach feedback and guide, and the coach's own notes and edit
 * summary. The debrief TRANSCRIPT is deliberately not in the pool — the
 * teacher's commitment is quoted from it, in the teacher's own words.
 */
function coachOnlyMaterial(analysis) {
  const a = analysis || {};
  const od = a.observer_debrief || {};
  const pool = [];
  collectStrings(od.feedback, pool);
  collectStrings(od.guide, pool);
  collectStrings(od.coach_notes, pool);
  collectStrings(a.observer_edit_summary, pool);
  collectStrings(a.observer_notes, pool);
  return pool.filter((s) => words(s).length >= MIN_SHORT_MATCH_WORDS);
}

// Section B (did the lesson follow its plan?) is not coach-only — the teacher
// gets a kind note built from it — but the blob itself carries the measurement
// (a percentage and a band), so no report renderer may ever see it. The note
// is built by observe-section-b, through this firewall, on its own.
const MEASUREMENT_KEYS = ['lp_fidelity', 'section_b'];

/** A copy of the analysis with every coach-only key and measurement removed (input untouched). */
function teacherSafeAnalysis(analysis) {
  const out = { ...(analysis || {}) };
  for (const k of [...COACH_ONLY_KEYS, ...MEASUREMENT_KEYS]) delete out[k];
  return out;
}

function words(text) {
  return String(text || '').toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
}

// A shared run this long is a quotation, not a coincidence.
const RUN_WORDS = 6;
// Material shorter than a run is only matched whole, and only from this length.
const MIN_SHORT_MATCH_WORDS = 4;

function sharesCoachMaterial(text, material) {
  const tw = words(text);
  if (!tw.length || !material || !material.length) return null;
  const joined = ` ${tw.join(' ')} `;
  for (const m of material) {
    const mw = words(m);
    if (mw.length < RUN_WORDS) {
      if (mw.length >= MIN_SHORT_MATCH_WORDS && joined.includes(` ${mw.join(' ')} `)) return m;
      continue;
    }
    for (let i = 0; i + RUN_WORDS <= mw.length; i += 1) {
      if (joined.includes(` ${mw.slice(i, i + RUN_WORDS).join(' ')} `)) return m;
    }
  }
  return null;
}

// ── The firewall ────────────────────────────────────────────────────────

class TrustFirewallError extends Error {
  constructor(violations) {
    super(`teacher report blocked by the trust firewall: ${violations.map((v) => v.rule).join(', ')}`);
    this.name = 'TrustFirewallError';
    this.violations = violations;
  }
}

/**
 * @param {string} text  one piece of teacher-facing text
 * @param {{material?: string[]}} ctx  coachOnlyMaterial(analysis)
 * @returns {Array<{rule:'score'|'accusatory'|'coach_material', detail:string}>}
 */
function firewallViolations(text, ctx = {}) {
  const out = [];
  const score = findScoreLeak(text);
  if (score) out.push({ rule: 'score', detail: score });
  const accusation = findAccusation(text);
  if (accusation) out.push({ rule: 'accusatory', detail: accusation });
  const quoted = sharesCoachMaterial(text, ctx.material);
  // The detail never carries the material itself — it ends up in logs.
  if (quoted) out.push({ rule: 'coach_material', detail: `${words(quoted).length}-word source` });
  return out;
}

/** Throws TrustFirewallError when any text breaks a rule. */
function assertTeacherSafe(texts, ctx = {}) {
  const violations = [];
  for (const t of [].concat(texts || [])) {
    if (t == null || t === '') continue;
    violations.push(...firewallViolations(t, ctx));
  }
  if (violations.length) throw new TrustFirewallError(violations);
  return true;
}

// Narrative fields the hero report can render as text.
const NARRATIVE_TEXT_KEYS = [
  'topic', 'affirmation', 'identity', 'strength_name', 'strength_note',
  'horizon_title', 'horizon_note', 'journey_note', 'score_framing',
];

/**
 * The hero report's narrative is model output. Rather than refuse the whole
 * report over one bad sentence, drop the sentence: a field (or a moment) that
 * breaks a rule is removed and the rest renders.
 * @returns {{narrative: object, dropped: string[]}}
 */
function scrubNarrative(narrative, ctx = {}) {
  const n = { ...(narrative || {}) };
  const dropped = [];
  for (const k of NARRATIVE_TEXT_KEYS) {
    if (n[k] && firewallViolations(n[k], ctx).length) { delete n[k]; dropped.push(k); }
  }
  if (Array.isArray(n.moments)) {
    n.moments = n.moments.filter((m, i) => {
      const bad = [m && m.title, m && m.quote, m && m.why].some((s) => s && firewallViolations(s, ctx).length);
      if (bad) dropped.push(`moments[${i}]`);
      return !bad;
    });
  }
  return { narrative: n, dropped };
}

/** Every string a hero-report view model will render. */
function viewModelTexts(vm) {
  const v = vm || {};
  const n = v.narrative || {};
  const out = [v.teacherName, v.topic, v.tryNext];
  for (const k of NARRATIVE_TEXT_KEYS) out.push(n[k]);
  (n.moments || []).forEach((m) => out.push(m && m.title, m && m.quote, m && m.why));
  (v.groups || []).forEach((g) => out.push(g && g.name));
  return out.filter((s) => typeof s === 'string' && s);
}

// ── Debrief notes (the companion) ───────────────────────────────────────

/**
 * Same rubric as the coach-feedback harm gate: a coach who disparaged the
 * teacher, or judged the person instead of the moves, had a conversation that
 * must not be summarised into warm fiction for the teacher. No notes then.
 */
function isHarmfulDebrief(rubric) {
  if (!rubric) return false;
  return rubric.disparaged_teacher === true || rubric.moves_not_teacher === false;
}

/** One model pass over the debrief transcript → the note the TEACHER reads. */
function buildDebriefNotesPrompt(transcript, { coachName } = {}, languageName = 'English') {
  return `A coach (${coachName || 'the coach'}) had a coaching conversation (a debrief) with a teacher after observing their lesson. From the transcript below, write a SHORT warm note THE TEACHER WILL READ, in ${languageName}.

HARD RULES (the teacher's trust depends on these):
- NEVER any number, score, percentage, rating or grade ("40/75", "53%", "3 of 5", "score: 2") — leave the thought out entirely.
- NEVER anything accusatory, and never a verdict about the teacher as a person. Do not repeat the coach's criticism; describe the conversation respectfully.
- NEVER mention feedback the coach received about their own coaching.
- "discussed": 1–2 warm sentences on what the two of them actually discussed (teaching moves, not judgements).
- "commitment": the commitment THE TEACHER THEMSELVES SPOKE, in their own words — IF AND ONLY IF they clearly made one. If no commitment was spoken, commitment = null. NEVER invent one: putting words in a teacher's mouth breaks the trust this tool runs on.
- We do not know the teacher's gender: refer to them with they/them, or address them directly as "you".

Return JSON EXACTLY: { "discussed": "...", "commitment": "..." | null }

DEBRIEF TRANSCRIPT:
${transcript}`;
}

/** Throws (TrustFirewallError or Error) unless the notes are safe to show a teacher. */
function validateDebriefNotes(notes, ctx = {}) {
  // The commitment is OPTIONAL on purpose — a mandatory field forces the model
  // to invent one when the teacher never spoke it.
  if (!notes || typeof notes.discussed !== 'string' || !notes.discussed.trim()) {
    throw new Error('debrief notes need "discussed"');
  }
  assertTeacherSafe([notes.discussed, notes.commitment], ctx);
  return true;
}

/**
 * The ONE companion message that follows the report. Returns null when there
 * are no notes (no debrief, too thin, or harmful) — the report still goes on
 * its own; an empty shell would read as broken.
 */
function buildCompanionText(notes, { coachName = '', lang = 'en', material = [] } = {}) {
  if (!notes) return null;
  validateDebriefNotes(notes, { material });
  const S = observeStrings(lang);
  const parts = [`📝 *${S.companion_from_label} ${coachName}*`.replace(/\s+\*$/, '*'), '', notes.discussed.trim()];
  if (notes.commitment) {
    parts.push('', `🌱 *${S.companion_commitment_label}*`, `_"${String(notes.commitment).trim()}"_`);
  }
  parts.push('', S.companion_closing);
  const text = parts.join('\n').slice(0, 4096);
  assertTeacherSafe([text], { material });   // the assembled message, chrome included
  return text;
}

/**
 * The text report, for when no image can be rendered (no headless browser on
 * this host, say). Built only from the analysis' strengths — the warm half —
 * each one through the firewall; a strength that fails is left out, and with
 * none left a warm generic line stands in.
 */
function buildTextReport(analysis, { lang = 'en', material = [] } = {}) {
  const S = observeStrings(lang);
  const strengths = ((analysis && analysis.strengths) || [])
    .map((s) => (typeof s === 'string' ? s : (s && (s.title || s.name)) || ''))
    .map((s) => String(s).trim())
    .filter((s) => s && !firewallViolations(s, { material }).length)
    .slice(0, 3);
  const text = strengths.length
    ? [`🌱 *${S.report_text_strengths_label}*`, ...strengths.map((s) => `• ${s}`)].join('\n')
    : S.report_text_fallback;
  assertTeacherSafe([text], { material });
  return text;
}

module.exports = {
  SCORE_PATTERNS,
  buildTextReport,
  findScoreLeak,
  findAccusation,
  coachOnlyMaterial,
  teacherSafeAnalysis,
  firewallViolations,
  assertTeacherSafe,
  TrustFirewallError,
  scrubNarrative,
  viewModelTexts,
  isHarmfulDebrief,
  buildDebriefNotesPrompt,
  validateDebriefNotes,
  buildCompanionText,
};
