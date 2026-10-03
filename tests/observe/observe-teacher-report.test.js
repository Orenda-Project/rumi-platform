/**
 * The teacher's report — the TRUST FIREWALL (pure layer).
 *
 * Everything this module produces is read by the TEACHER. The rules are the
 * feature's promise to them: never the coach's critique, never any of the
 * coach-the-coach material (that is for the coach alone), never a score or a
 * number that reads like one. They are enforced in code, not only asked of the
 * model, so these tests feed it an adversarial analysis that contains exactly
 * the material that must not leak.
 */

const TR = require('../../bot/shared/services/observe/observe-teacher-report');

// An analysis that carries everything the teacher must never see.
const ADVERSARIAL = {
  framework: 'teach',
  scores: { overall_percentage: 62 },
  strengths: [{ title: 'Warm, clear explanations' }, { title: 'Scored 34/50 on questioning' }],
  observer_edit_summary: { changed: 3, note: 'Too much teacher talk and the children were bored most of the lesson' },
  observer_notes: 'Honestly the pacing was poor and half the class was lost by minute ten',
  observer_debrief: {
    transcript: 'Coach: Thank you. Teacher: I will ask how they know after each answer.',
    feedback: {
      wins: ['You opened with specific praise about the counting sticks game'],
      try: 'Next time wait longer after asking your reflective question before speaking again',
      concern: null,
      rubric: { disparaged_teacher: false, moves_not_teacher: true },
    },
  },
  teacher_delivery: { status: 'previewing', teacher_name: 'Sam Taylor' },
};

describe('findScoreLeak — no score, no number that reads like one', () => {
  test.each([
    ['You scored 34/50 today'],
    ['53% of the class answered'],
    ['3 of 5 indicators met'],
    ['two out of 4 — no, 2 out of 4 areas'],
    ['Your score: 3'],
    ['That is 12 points higher'],
    ['rated 2 for questioning'],
  ])('flags "%s"', (text) => {
    expect(TR.findScoreLeak(text)).not.toBeNull();
  });

  test.each([
    ['You will ask how they know after each answer.'],
    ['Your Grade 4 class loved the counting game'],
    ['Lesson on 2026-10-02'],
    ['You gave the class three chances to explain'],
  ])('lets "%s" through (not a score)', (text) => {
    expect(TR.findScoreLeak(text)).toBeNull();
  });
});

describe('coach-only material', () => {
  test('collects coach-the-coach feedback, the coach\'s notes and edit summary — never the transcript', () => {
    const pool = TR.coachOnlyMaterial(ADVERSARIAL);
    const joined = pool.join(' | ');
    expect(joined).toMatch(/specific praise about the counting sticks/);
    expect(joined).toMatch(/wait longer after asking/);
    expect(joined).toMatch(/pacing was poor/);
    expect(joined).toMatch(/Too much teacher talk/);
    expect(joined).not.toMatch(/I will ask how they know/);
  });

  test('teacherSafeAnalysis strips every coach-only key before anything renders from it', () => {
    const safe = TR.teacherSafeAnalysis(ADVERSARIAL);
    expect(safe.observer_debrief).toBeUndefined();
    expect(safe.observer_edit_summary).toBeUndefined();
    expect(safe.observer_notes).toBeUndefined();
    expect(safe.teacher_delivery).toBeUndefined();
    expect(safe.strengths).toEqual(ADVERSARIAL.strengths);
    // the input is not mutated
    expect(ADVERSARIAL.observer_debrief).toBeDefined();
  });

  test('teacherSafeAnalysis also strips Section B (its measurement carries a percentage)', () => {
    const analysis = {
      ...ADVERSARIAL,
      lp_fidelity: { status: 'ok', fidelity_pct: 70, band: 'partial', moves: [] },
      section_b: { status: 'assessed', reason: null },
    };
    const safe = TR.teacherSafeAnalysis(analysis);
    expect(safe.lp_fidelity).toBeUndefined();
    expect(safe.section_b).toBeUndefined();
    expect(analysis.lp_fidelity).toBeDefined();
  });
});

const material = TR.coachOnlyMaterial(ADVERSARIAL);

describe('firewallViolations / assertTeacherSafe', () => {
  test('a verbatim run of coach-the-coach feedback is refused', () => {
    const v = TR.firewallViolations('Great lesson! Next time wait longer after asking your reflective question.', { material });
    expect(v.map((x) => x.rule)).toContain('coach_material');
  });

  test('the coach\'s raw critique is refused', () => {
    const v = TR.firewallViolations('Note: the pacing was poor and half the class was lost', { material });
    expect(v.map((x) => x.rule)).toContain('coach_material');
  });

  test('a verdict on the teacher as a person is refused', () => {
    const v = TR.firewallViolations("You don't know how to teach.", { material });
    expect(v.map((x) => x.rule)).toContain('accusatory');
  });

  test('assertTeacherSafe throws a TrustFirewallError naming every rule broken', () => {
    expect(() => TR.assertTeacherSafe(['You got 34/50', 'the pacing was poor and half the class was lost'], { material }))
      .toThrow(TR.TrustFirewallError);
    try {
      TR.assertTeacherSafe(['You got 34/50'], { material });
    } catch (err) {
      expect(err.violations[0].rule).toBe('score');
    }
  });

  test('warm, specific, number-free text passes', () => {
    expect(() => TR.assertTeacherSafe([
      'You and your coach talked about giving children more time to explain their thinking.',
      'I will ask how they know after each answer.',
    ], { material })).not.toThrow();
  });
});

describe('scrubNarrative — the hero report drops anything that breaks the firewall', () => {
  test('fields with a score or coach material are removed, clean ones kept', () => {
    const narrative = {
      affirmation: 'You made every child feel heard today.',
      score_framing: 'Your 62% is a stage, not a verdict.',
      journey_note: 'You peaked at 70% last month.',
      strength_note: 'Next time wait longer after asking your reflective question before speaking again',
      moments: [
        { title: 'Counting sticks', quote: 'Show me with your sticks', why: 'Every hand was busy.' },
        { title: 'Scores', quote: 'We got 3 of 5 right', why: 'Counting up.' },
      ],
    };
    const { narrative: out, dropped } = TR.scrubNarrative(narrative, { material });
    expect(out.affirmation).toBe(narrative.affirmation);
    expect(out.score_framing).toBeUndefined();
    expect(out.journey_note).toBeUndefined();
    expect(out.strength_note).toBeUndefined();
    expect(out.moments).toHaveLength(1);
    expect(dropped).toEqual(expect.arrayContaining(['score_framing', 'journey_note', 'strength_note', 'moments[1]']));
  });
});

describe('debrief notes for the teacher', () => {
  test('the prompt names the teacher as the reader and bans scores, critique and invented commitments', () => {
    const p = TR.buildDebriefNotesPrompt('Coach: hi. Teacher: I will try it.', { coachName: 'Robin' }, 'English');
    expect(p).toMatch(/THE TEACHER WILL READ/);
    expect(p).toMatch(/NEVER any number, score, percentage/);
    expect(p).toMatch(/null/);
    expect(p).toMatch(/they\/them|gender-neutral/i);
    expect(p).toContain('I will try it.');
  });

  test('validateDebriefNotes accepts warm notes with or without a commitment', () => {
    expect(TR.validateDebriefNotes({ discussed: 'You talked about wait time.', commitment: null }, { material })).toBe(true);
    expect(TR.validateDebriefNotes({ discussed: 'You talked about wait time.', commitment: 'I will wait.' }, { material })).toBe(true);
  });

  test('validateDebriefNotes rejects a score, a verdict, coach material and an empty note', () => {
    expect(() => TR.validateDebriefNotes({ discussed: 'You scored 40/75.' }, { material })).toThrow(/score/);
    expect(() => TR.validateDebriefNotes({ discussed: "You don't know how to teach." }, { material })).toThrow(/accusatory/);
    expect(() => TR.validateDebriefNotes({ discussed: 'The pacing was poor and half the class was lost by minute ten.' }, { material })).toThrow(/coach_material/);
    expect(() => TR.validateDebriefNotes({ discussed: '' }, { material })).toThrow();
    expect(() => TR.validateDebriefNotes(null, { material })).toThrow();
  });

  test('a harmful debrief (harm-gate rubric) yields no teacher notes at all', () => {
    expect(TR.isHarmfulDebrief({ disparaged_teacher: true })).toBe(true);
    expect(TR.isHarmfulDebrief({ moves_not_teacher: false })).toBe(true);
    expect(TR.isHarmfulDebrief({ disparaged_teacher: false, moves_not_teacher: true })).toBe(false);
    expect(TR.isHarmfulDebrief(null)).toBe(false);
  });
});

describe('buildCompanionText', () => {
  test('one message: who it is from, what was discussed, the teacher\'s own commitment', () => {
    const msg = TR.buildCompanionText(
      { discussed: 'You talked about giving children time to explain.', commitment: 'I will ask how they know.' },
      { coachName: 'Robin Coach', lang: 'en', material: [] },
    );
    expect(msg).toContain('Robin Coach');
    expect(msg).toContain('You talked about giving children time to explain.');
    expect(msg).toContain('I will ask how they know.');
  });

  test('no notes → no companion (the report still goes alone)', () => {
    expect(TR.buildCompanionText(null, { coachName: 'Robin', lang: 'en' })).toBeNull();
  });

  test('refuses to build a companion that leaks', () => {
    expect(() => TR.buildCompanionText({ discussed: 'You got 3 of 5 right.' }, { coachName: 'Robin', lang: 'en', material: [] }))
      .toThrow(TR.TrustFirewallError);
  });
});

describe('buildTextReport — the fallback when no image can be rendered', () => {
  test('lists strengths that pass the firewall, never the scored one or any coach material', () => {
    const text = TR.buildTextReport(ADVERSARIAL, { lang: 'en', material });
    expect(text).toContain('What went well');
    expect(text).toContain('Warm, clear explanations');
    expect(text).not.toMatch(/34\/50/);
    expect(text).not.toMatch(/pacing was poor|Too much teacher talk|wait longer/);
    expect(() => TR.assertTeacherSafe([text], { material })).not.toThrow();
  });

  test('no usable strengths → a warm generic line, still number-free', () => {
    const text = TR.buildTextReport({ strengths: [{ title: '3 of 5 met' }] }, { lang: 'en', material: [] });
    expect(text).toMatch(/Thank you for opening your classroom/);
    expect(TR.findScoreLeak(text)).toBeNull();
  });
});
