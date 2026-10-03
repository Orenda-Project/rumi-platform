/**
 * The debrief-guide builder (pure layer).
 *
 * Turns the coach's OWN edited analysis (v2) into a six-step conversation
 * guide the coach reads — and keeps visible — while talking with the teacher
 * and recording the debrief. One text message, no form.
 *
 * The structure and every gate come from the research pass behind the
 * feature:
 *   · 6 steps: intent → evidence-praise → one question, then silence → ONE
 *     improvement → the teacher's own if-then commitment → agree the return
 *   · no leading questions, no closed yes/no, judge the MOVES never the
 *     teacher, short questions
 *   · never the "what could you have done better?" form — teachers hear it as
 *     blame, not help
 *   · score-free: a mark in a growth conversation is noise, never a verdict
 */

const { botName } = require('../../config/branding');

const GUIDE_STEPS = ['intent', 'evidence_praise', 'one_question', 'one_improvement', 'if_then', 'agree_return'];
const STEP_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

// The whole rendered guide must fit a phone screen or two. Longer than this
// and coaches stop reading it mid-conversation.
const GUIDE_CHAR_BUDGET = 2200;
const guideBudget = () => GUIDE_CHAR_BUDGET;

// Only high-confidence subject-accuracy flags reach the guide — precision
// over recall; a false "the teacher got the content wrong" poisons trust.
const SUBJECT_FLAG_MIN_CONFIDENCE = 0.7;

function _highConfidenceSubjectFlags(analysis) {
  const flags = (analysis && analysis.subject_accuracy) || [];
  if (!Array.isArray(flags)) return [];
  return flags.filter((f) => f && f.quote && f.correct_idea && Number(f.confidence) >= SUBJECT_FLAG_MIN_CONFIDENCE);
}

function _languageName(lang) {
  if (!lang || lang === 'en') return 'English';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) || 'English';
  } catch (_) {
    return 'English';
  }
}

// ── Score redaction ────────────────────────────────────────────────────
// The guide builder must never even SEE the marks: remove them from the data
// block so no prompt-following failure can leak one.
function _redactScores(analysis) {
  if (!analysis || typeof analysis !== 'object') return {};
  const clone = JSON.parse(JSON.stringify(analysis));
  delete clone.scores;
  // performance_band is a score-derived verdict (no digit regex would catch
  // it); observer_edit_summary carries edit counts; observer_debrief and
  // teacher_delivery are pipeline machinery (the latter holds contact
  // details) — none belong in a guide prompt.
  delete clone.performance_band;
  delete clone.overall_score;
  delete clone.observer_edit_summary;
  delete clone.observer_debrief;
  delete clone.teacher_delivery;
  // Subject flags enter ONLY via the confidence-filtered block below.
  delete clone.subject_accuracy;
  // Section B: the coach's reviewed verdicts are coaching material (a planned
  // move not done is a natural "one thing to improve"), but the blob also
  // carries the measurement — percentage, band, credit, every run's spread.
  // Only the moves go in.
  delete clone.section_b;
  if (clone.lp_fidelity) {
    const moves = Array.isArray(clone.lp_fidelity.moves) ? clone.lp_fidelity.moves : [];
    if (moves.length) {
      clone.lesson_plan_moves = moves.map((m) => ({ phase: m.phase, text: m.text, verdict: m.verdict, evidence: m.evidence || '' }));
    }
    delete clone.lp_fidelity;
  }
  for (const container of [clone.domains, clone.areas]) {
    if (!container || typeof container !== 'object') continue;
    for (const dom of Object.values(container)) {
      if (!dom || typeof dom !== 'object') continue;
      for (const k of ['domain_score', 'domain_max', 'area_score', 'area_max', 'score', 'max']) delete dom[k];
      if (Array.isArray(dom.indicators)) {
        for (const ind of dom.indicators) if (ind && typeof ind === 'object') delete ind.score;
      }
    }
  }
  return clone;
}

// ── Prompt ─────────────────────────────────────────────────────────────

/**
 * @param {object} v2Analysis  analysis_data after the coach's edits
 * @param {object} [options]
 * @param {string} [options.language]  ISO code the guide is written in (default 'en')
 */
function buildGuidePrompt(v2Analysis, options = {}) {
  const language = options.language || 'en';
  const data = _redactScores(v2Analysis);
  const subjectFlags = _highConfidenceSubjectFlags(v2Analysis);
  const subjectBlock = subjectFlags.length
    ? `\nCONTENT ACCURACY (fold into step 4 as a short addition, offered as thinking it through TOGETHER — never a correction, never a test):\n${subjectFlags.map((f) => `- Said: "${f.quote}" → accurate idea: ${f.correct_idea}`).join('\n')}\n`
    : '';

  return `You are ${botName}, preparing a coach for their debrief conversation with a teacher they just observed. The coach will read this guide WHILE talking with the teacher, so every step must be short, true and anchored in evidence. Scores have been deliberately removed from the data — the guide must NEVER contain or imply one.

The six steps — follow them exactly, in this order:
  1. OPEN WITH INTENT — thank the teacher for having you; say the purpose: "for the children, let's help each other" — a partnership, not an inspection.
  2. PRAISE WITH EVIDENCE — ONE real thing that went well, anchored to a specific moment in the data. Quote the evidence word for word.
  3. ONE QUESTION, THEN SILENCE — ONE open, non-judging reflective question (never yes/no), starting from the teacher's own view ("In your own view, how…"). Then tell the coach to WAIT in silence for 30–60 seconds; the answer lives in the silence.
  4. ONE THING TO IMPROVE — exactly ONE area (from the focus area), with its evidence and ONE concrete move to try tomorrow, offered as an invitation ("How about trying…"), never an order.
  5. THEIR OWN IF–THEN COMMITMENT — the teacher states the plan IN THEIR OWN WORDS, as an if–then: "Tomorrow, when [cue], I will [visible action]".
  6. AGREE THE RETURN — agree when you will look at it together again — growth, not inspection.
${subjectBlock}
RULES (each one is mandatory):
- Questions are open, under about 35 words, and talk about the MOVES, never the person.
- Never use the form "what could you have done better?" — it reads as blame, not help.
- Exactly ONE improvement — never a list.
- NO score, mark, percentage or number about the lesson or the teacher anywhere.
- Quote evidence word for word from the data — never invent words the teacher did not say. If the data does not clearly support a step, keep that step generic rather than inventing a moment.
- Gender (mandatory): never assume the gender of the coach or the teacher; use "the teacher" or they/them. Every "say_this" line is spoken TO the teacher; every other line is TO the coach.
- Warm, respectful, a trusted senior colleague — feedback is a gift.
- Write ALL text in ${_languageName(language)}. The whole rendered guide must stay under ${guideBudget(language)} characters — tight lines, no filler.

Return JSON with exactly 6 steps, in EXACTLY this shape:
{ "intro": "<one opening line to the coach>", "steps": [ { "n": 1, "title": "<short heading>", "body": "<short instruction to the coach>", "say_this": "<word-for-word example to say>" }, ... 6 steps ... ], "outro": "<closing line: no number to hand over — one true strength and one move>" }

OBSERVATION DATA (the coach's own edited version; scores removed):
${JSON.stringify(data)}`;
}

// ── Validation (programmatic gates, not prompt hopes) ─────────────────

const SCORE_PATTERNS = [
  /\d+\s*\/\s*\d+/,                      // 40/75
  /\d+\s*%/,                             // 53%
  /\b\d+\s+out\s+of\s+\d+\b/i,           // 3 out of 4
  /\bscore[sd]?\s*(?:of|:|\s)\s*\d+/i,   // score: 3
  /\b(?:rated|rating|marks?)\s*(?:of|:|\s)\s*\d+/i,
];

// Teachers hear this as blame, whatever the intent.
const BLAME_FORM = /\b(?:what|how)\s+could\s+you\s+have\s+done\s+(?:it\s+)?better\b/i;

function _allGuideText(guide) {
  const parts = [guide.intro || '', guide.outro || ''];
  for (const s of guide.steps || []) parts.push(s.title || '', s.body || '', s.say_this || '');
  return parts.join('\n');
}

function validateGuide(guide, S, language = 'en') {
  if (!guide || !Array.isArray(guide.steps) || guide.steps.length !== 6) {
    throw new Error('guide must have exactly 6 steps');
  }
  for (const s of guide.steps) {
    if (!s || !s.title || !s.say_this) throw new Error('guide steps need title + say_this');
  }
  const text = _allGuideText(guide);
  for (const rx of SCORE_PATTERNS) {
    if (rx.test(text)) throw new Error(`guide leaks a score (${rx})`);
  }
  if (BLAME_FORM.test(text)) throw new Error('guide uses the "could you have done better" form');
  const rendered = renderGuideMessage(guide, S);
  const budget = guideBudget(language);
  if (rendered.length > budget) {
    throw new Error(`guide over budget/length: ${rendered.length} > ${budget}`);
  }
  return true;
}

// ── Render ─────────────────────────────────────────────────────────────

function renderGuideMessage(guide, _S) {
  const lines = [`🌱 ${guide.intro || ''}`.trim(), ''];
  guide.steps.forEach((s, i) => {
    lines.push(`${STEP_EMOJI[i] || `${i + 1}.`} *${s.title}*`);
    if (s.body) lines.push(s.body);
    if (s.say_this) lines.push(`_"${s.say_this}"_`);
    lines.push('');
  });
  lines.push(`🔒 ${guide.outro || ''}`.trim());
  return lines.join('\n').trim();
}

// ── Deterministic fallback (no LLM) ────────────────────────────────────
// A coach standing next to a teacher must never be left guideless.

// Interpolated v2 fields are model-written text copied from a live classroom
// transcript — they can carry digits or score-shaped fragments. Sanitise so
// the fallback passes the same gates the LLM path is validated against.
function _cleanField(value, fallbackText, max = 220) {
  let s = String(value || '').trim();
  if (!s) return fallbackText;
  for (const rx of SCORE_PATTERNS) s = s.replace(new RegExp(rx.source, `${rx.flags}g`), '');
  s = s.replace(BLAME_FORM, '').replace(/\s{2,}/g, ' ').trim();
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s || fallbackText;
}

/** First non-empty of the keys, across the field spellings the frameworks use. */
function _pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) if (obj[k]) return obj[k];
  return '';
}

function buildFallbackGuide(v2Analysis, options = {}) {
  const { observeStrings, fill } = require('./observe-strings');
  const S = observeStrings(options.language || 'en');
  const a = v2Analysis || {};
  const strength = (Array.isArray(a.strengths) && a.strengths[0]) || {};
  const focus = a.focus_area || a.focus_area_sw || {};
  const growth = (Array.isArray(a.growth_opportunities) && a.growth_opportunities[0]) || {};

  const strengthEvidence = _cleanField(
    _pick(strength, ['evidence', 'evidence_sw', 'title', 'title_sw']), S.guide_fb_default_strength);
  const focusTitle = _cleanField(
    _pick(focus, ['title', 'title_sw']) || _pick(growth, ['area', 'area_sw']), S.guide_fb_default_focus, 120);
  const tryThis = _cleanField(
    _pick(focus, ['try', 'try_this_tomorrow', 'try_this_tomorrow_sw']), S.guide_fb_default_try);
  const lever = _cleanField(
    _pick(focus, ['lever_question', 'lever_question_sw']), S.guide_fb_step3_say, 160);

  const vars = { strength: strengthEvidence, focus: focusTitle, try: tryThis };
  const step = (n) => ({
    n,
    title: S[`guide_fb_step${n}_title`],
    body: fill(S[`guide_fb_step${n}_body`], vars),
    say_this: n === 3 ? lever : fill(S[`guide_fb_step${n}_say`], vars),
  });
  return {
    intro: S.guide_fb_intro,
    steps: [1, 2, 3, 4, 5, 6].map(step),
    outro: S.guide_fb_outro,
  };
}

module.exports = {
  GUIDE_STEPS,
  GUIDE_CHAR_BUDGET,
  SUBJECT_FLAG_MIN_CONFIDENCE,
  SCORE_PATTERNS,
  guideBudget,
  buildGuidePrompt,
  validateGuide,
  renderGuideMessage,
  buildFallbackGuide,
};
