/**
 * The debrief guide — the pure layer.
 *
 * Built from the coach's OWN edited analysis (v2), the guide is the six-step
 * conversation the coach reads, and keeps visible, while talking with the
 * teacher:
 *   intent → evidence-praise → one question (then silence) → ONE improvement
 *   → the teacher's own if-then commitment → agree the return.
 * Gates enforced in code: exactly six steps, each with something to say; no
 * score anywhere; never the "what could you have done better" form; a length
 * budget a phone screen can hold. The deterministic fallback always passes
 * the same gates, so a coach standing next to a teacher is never guideless.
 */

const {
  GUIDE_STEPS,
  buildGuidePrompt,
  validateGuide,
  renderGuideMessage,
  buildFallbackGuide,
  guideBudget,
} = require('../../bot/shared/services/observe/observe-debrief-guide');
const { observeStrings } = require('../../bot/shared/services/observe/observe-strings');

const S = observeStrings('en');

const V2 = {
  framework: 'teach',
  scores: { overall: 41, max: 60 },
  performance_band: 'Developing',
  observer_edit_summary: { changed: 3 },
  observer_debrief: { transcript: 'old' },
  teacher_delivery: { teacher_phone: '15550100009' },
  domains: {
    classroom_culture: { domain_score: 7, domain_max: 12, indicators: [{ id: '1.1', score: 3, evidence: 'Calm routines.' }] },
  },
  strengths: [{ title: 'Clear routines', evidence: 'The children moved into groups in under a minute when the bell rang.' }],
  focus_area: { title: 'Checking for understanding', why: 'Few children answered.', try: 'Ask three children to explain the answer in their own words.' },
};

const goodGuide = () => ({
  intro: 'Your guide for the conversation — about fifteen minutes.',
  steps: [
    { n: 1, title: 'Open with intent', body: 'Thank them for having you.', say_this: 'Thank you for having me — I am here to help us both grow, for the children.' },
    { n: 2, title: 'Praise with evidence', body: 'Name one real moment.', say_this: 'I loved how the groups formed in under a minute when the bell rang.' },
    { n: 3, title: 'One question, then wait', body: 'Ask, then stay silent.', say_this: 'In your own view, how did the lesson go?' },
    { n: 4, title: 'One thing to improve', body: 'Offer it as an invitation.', say_this: 'How about asking three children to explain the answer tomorrow?' },
    { n: 5, title: 'Their own if-then', body: 'Let them say the plan.', say_this: 'When exactly will you try it? Say it in your own words.' },
    { n: 6, title: 'Agree the return', body: 'Pick a day together.', say_this: 'When shall we look at it together again?' },
  ],
  outro: 'No number to hand over — one true strength and one move.',
});

describe('the six steps', () => {
  test('GUIDE_STEPS names the six moves in order', () => {
    expect(GUIDE_STEPS).toEqual(['intent', 'evidence_praise', 'one_question', 'one_improvement', 'if_then', 'agree_return']);
  });
});

describe('buildGuidePrompt', () => {
  const p = buildGuidePrompt(V2, { language: 'en' });

  test('never shows the model a score, a band, edit counts, debrief machinery or contact details', () => {
    expect(p).not.toMatch(/"overall"|"domain_score"|"domain_max"|"score"/);
    expect(p).not.toContain('Developing');
    expect(p).not.toContain('observer_edit_summary');
    expect(p).not.toContain('observer_debrief');
    expect(p).not.toContain('15550100009');
    expect(p).toContain('The children moved into groups');   // the real evidence is there
  });

  test('Section B reaches the guide as the reviewed moves only — never its percentage, band or run spread', () => {
    const withB = {
      ...V2,
      lp_fidelity: {
        status: 'ok', fidelity_pct: 72.5, band: 'partial', executed_credit: 4.5, prescribed_count: 6, spread: 4.1,
        runs: [{ pct: 72.5 }], narrative: 'Scored 72.5 against the plan.', observer_edited: true,
        moves: [
          { move_id: 'm1', phase: 'warm_up', text: 'Recall halves with the class', verdict: 'executed', evidence: '[01:10] "Who remembers halves?"', credit: 1, counted: true },
          { move_id: 'm2', phase: 'exit', text: 'Exit question on the board', verdict: 'not_done', evidence: '', credit: 0, counted: true },
        ],
      },
      section_b: { status: 'assessed', reason: null },
    };
    const prompt = buildGuidePrompt(withB, { language: 'en' });
    expect(prompt).toContain('Exit question on the board');
    expect(prompt).toContain('not_done');
    expect(prompt).not.toMatch(/72\.5|"band"|"spread"|"runs"|"credit"|"executed_credit"|"fidelity_pct"|"prescribed_count"|"section_b"/);
  });

  test('asks for exactly six steps in the research order', () => {
    expect(p).toMatch(/OPEN WITH INTENT/);
    expect(p).toMatch(/PRAISE WITH EVIDENCE/);
    expect(p).toMatch(/ONE QUESTION, THEN SILENCE/);
    expect(p).toMatch(/ONE THING TO IMPROVE/);
    expect(p).toMatch(/THEIR OWN IF–THEN COMMITMENT/);
    expect(p).toMatch(/AGREE THE RETURN/);
    expect(p).toMatch(/exactly 6 steps/);
  });

  test('carries the gates: open questions, the moves not the person, ONE improvement, no numbers, never invented', () => {
    expect(p).toMatch(/never yes\/no/i);
    expect(p).toMatch(/the MOVES, never the person/);
    expect(p).toMatch(/what could you have done better/);
    expect(p).toMatch(/NO score, mark, percentage or number/);
    expect(p).toMatch(/never invent/i);
    expect(p).toMatch(new RegExp(`under ${guideBudget('en')} characters`));
  });

  test('is gender-neutral, partner-free, and names the output language', () => {
    expect(p).toMatch(/they\/them/);
    expect(p).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
    expect(p).not.toMatch(/\bofficer\b/i);
    expect(p).toMatch(/Write ALL text in English/);
  });
});

describe('validateGuide', () => {
  test('a good six-step guide passes', () => {
    expect(validateGuide(goodGuide(), S, 'en')).toBe(true);
  });

  test('five or seven steps are rejected', () => {
    const five = goodGuide();
    five.steps.pop();
    expect(() => validateGuide(five, S, 'en')).toThrow(/exactly 6 steps/);
    const seven = goodGuide();
    seven.steps.push({ n: 7, title: 'x', say_this: 'y' });
    expect(() => validateGuide(seven, S, 'en')).toThrow(/exactly 6 steps/);
    expect(() => validateGuide(null, S, 'en')).toThrow(/exactly 6 steps/);
  });

  test('every step needs a title and something to say', () => {
    const g = goodGuide();
    g.steps[2].say_this = '';
    expect(() => validateGuide(g, S, 'en')).toThrow(/title \+ say_this/);
  });

  test.each([
    ['40/75', 'You scored 40/75 overall.'],
    ['53%', 'About 53% of the lesson was teacher talk.'],
    ['out of', 'That is 3 out of 4 on routines.'],
    ['score', 'score: 3'],
  ])('a leaked score (%s) is rejected', (_l, text) => {
    const g = goodGuide();
    g.steps[1].body = text;
    expect(() => validateGuide(g, S, 'en')).toThrow(/leaks a score/);
  });

  test('the "could you have done better" form is rejected — it reads as blame', () => {
    const g = goodGuide();
    g.steps[2].say_this = 'What could you have done better?';
    expect(() => validateGuide(g, S, 'en')).toThrow(/done better/);
  });

  test('over the length budget is rejected', () => {
    const g = goodGuide();
    g.steps[0].body = 'x'.repeat(guideBudget('en'));
    expect(() => validateGuide(g, S, 'en')).toThrow(/over budget/);
  });
});

describe('renderGuideMessage', () => {
  test('one message: intro, six numbered steps with the words to say, outro', () => {
    const msg = renderGuideMessage(goodGuide(), S);
    for (const e of ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣']) expect(msg).toContain(e);
    expect(msg).toContain('_"I loved how the groups formed in under a minute when the bell rang."_');
    expect(msg.startsWith('🌱 Your guide')).toBe(true);
    expect(msg).toMatch(/🔒 No number to hand over/);
  });
});

describe('buildFallbackGuide — the no-LLM scaffold', () => {
  test('uses the coach\'s own strength and focus, and passes the gates', () => {
    const g = buildFallbackGuide(V2, { language: 'en' });
    expect(g.steps).toHaveLength(6);
    const msg = renderGuideMessage(g, S);
    expect(msg).toContain('The children moved into groups');
    expect(msg).toContain('Checking for understanding');
    expect(msg).toContain('Ask three children to explain');
    expect(validateGuide(g, S, 'en')).toBe(true);
  });

  test('scrubs score-shaped fragments out of interpolated analysis text', () => {
    const dirty = { ...V2, strengths: [{ evidence: 'Got 9/10 children answering — 90% of the class.' }] };
    const g = buildFallbackGuide(dirty, { language: 'en' });
    expect(() => validateGuide(g, S, 'en')).not.toThrow();
    expect(renderGuideMessage(g, S)).not.toMatch(/9\/10|90%/);
  });

  test('an empty analysis still gives a complete, valid guide', () => {
    const g = buildFallbackGuide({}, { language: 'en' });
    expect(validateGuide(g, S, 'en')).toBe(true);
  });

  test('its copy comes from the strings pack (translatable) and is gender-neutral', () => {
    const g = buildFallbackGuide({}, { language: 'en' });
    expect(g.intro).toBe(S.guide_fb_intro);
    expect(renderGuideMessage(g, S)).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
  });
});

describe('debrief copy guards', () => {
  test('every debrief / coach-card / guide string is gender-neutral and channel-neutral', () => {
    const offenders = Object.entries(S)
      .filter(([k]) => /^(debrief_|coach_|guide_|btn_debrief)/.test(k))
      .filter(([, v]) => /\b(she|her|hers|herself|he|him|his|himself)\b/i.test(v) || /whatsapp/i.test(v))
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });
});
