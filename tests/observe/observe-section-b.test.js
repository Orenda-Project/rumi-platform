/**
 * Section B of an observation — did the lesson follow its plan? (pure layer)
 *
 * The measurement is main's lesson-plan fidelity engine, run on the
 * observation's recording. This module turns that blob into what the coach
 * reviews (one page of moves at a time, each verdict changeable), re-scores the
 * coach's verdicts through the SAME scorer, names the state when nothing was
 * measured (not_assessed — never zero), and writes the kind version the teacher
 * reads (no number, ever).
 */

const SB = require('../../bot/shared/services/observe/observe-section-b');
const { findScoreLeak } = require('../../bot/shared/services/observe/observe-teacher-report');

const move = (n, phase, text, verdict, extra = {}) => ({
  move_id: `m${n}`, phase, bucket: 'must_happen', selection: 'none', text, verdict,
  evidence: verdict === 'not_done' ? '' : `[0${n}:10] "quote ${n}"`, evidence_translation: '', rationale: `why ${n}`,
  counted: verdict !== 'not_adjudicable', credit: null, ...extra,
});

// A measured blob, as computeLpFidelity persists it (fields the readers use).
function measured() {
  return {
    status: 'ok', source: 'linked', lesson_plan_id: 'lp-1', plan_hash: 'h', fidelity_pct: 70, band: 'partial',
    prescribed_count: 5, moderators: null, unusable_guard: null,
    strengths: [{ move_id: 'm3', text: 'Students compare fractions with strips', evidence: '[03:10] "x"' }],
    not_assessed: ['m6'],
    moves: [
      move(1, 'warm_up', 'Greet the class and recall halves', 'executed'),
      move(2, 'announce', 'Share the lesson objective', 'substituted_equivalent'),
      move(3, 'guided', 'Students compare fractions with strips', 'substituted_better'),
      move(4, 'independent', 'Pairs solve the worksheet', 'partial'),
      move(5, 'exit', 'Exit question on the board', 'not_done'),
      move(6, 'homework', 'Set the homework page', 'not_adjudicable'),
    ],
  };
}

describe('sectionBRecord — the persisted status', () => {
  test('a measured blob is assessed', () => {
    expect(SB.sectionBRecord(measured())).toMatchObject({ status: 'assessed', reason: null });
  });

  test.each([
    [{ status: 'lp_absent' }, 'no_plan'],
    [{ status: 'ok', unusable_guard: 'no_timestamps', fidelity_pct: null, moves: [] }, 'no_timings'],
    [{ status: 'ok', fidelity_pct: null, moves: [] }, 'recording_unusable'],
    [{ status: 'lp_unparseable' }, 'plan_unreadable'],
    [{ status: 'fidelity_unavailable', error: 'x' }, 'grader_failed'],
  ])('%j → not_assessed (%s), never a zero', (lp, reason) => {
    const rec = SB.sectionBRecord(lp);
    expect(rec).toMatchObject({ status: 'not_assessed', reason });
    expect(rec).not.toHaveProperty('score');
  });

  test('no blob at all is not_assessed with no_plan', () => {
    expect(SB.sectionBRecord(null)).toMatchObject({ status: 'not_assessed', reason: 'no_plan' });
  });

  test('the cause of a missing plan is kept when the caller knows it', () => {
    expect(SB.sectionBRecord({ status: 'lp_absent' }, { detail: 'teacher_has_no_plans' }))
      .toMatchObject({ status: 'not_assessed', reason: 'no_plan', detail: 'teacher_has_no_plans' });
  });

  test('a lesson that does not match its plan is assessed but flagged', () => {
    const lp = { ...measured(), fidelity_pct: 0, moderators: { note: 'lesson_mismatch' } };
    expect(SB.sectionBRecord(lp)).toMatchObject({ status: 'assessed', mismatch: true });
  });
});

describe('the coach review pages', () => {
  test('six moves to a page, all moves shown in plan order', () => {
    const lp = measured();
    expect(SB.pageCount(lp)).toBe(1);
    const big = { ...lp, moves: [...lp.moves, ...lp.moves.map((m, i) => ({ ...m, move_id: `x${i}` }))] };
    expect(SB.pageCount(big)).toBe(2);
  });

  test('a page shows each move with its verdict, the quoted moment and how to change it', () => {
    const text = SB.renderCoachPage({ lang: 'en', lp: measured(), page: 0, edits: {} });
    expect(text).toMatch(/Section B/);
    expect(text).toMatch(/1\. .*Greet the class and recall halves/);
    expect(text).toMatch(/\[01:10\] "quote 1"/);
    expect(text).toMatch(/As planned/);
    expect(text).toMatch(/Better swap/);
    expect(text).toMatch(/Not done/);
    // the reply hint and the numbered verdict legend
    expect(text).toMatch(/ok/);
    expect(text).toMatch(/1 .*As planned.*2 .*Equal swap.*3 .*Better swap.*4 .*Partly.*5 .*Not done.*6 .*Can't tell/s);
  });

  test('a pending edit is shown as changed', () => {
    const text = SB.renderCoachPage({ lang: 'en', lp: measured(), page: 0, edits: { fid_5: 'executed' } });
    const line = text.split('\n').find((l) => l.startsWith('5.'));
    expect(text).toMatch(/\(changed\)/);
    expect(text.slice(text.indexOf(line))).toMatch(/As planned/);
  });

  test('parseVerdictEdits reads "<move> <verdict>" pairs and refuses anything else', () => {
    expect(SB.parseVerdictEdits('5 1')).toEqual([{ n: 5, verdict: 'executed' }]);
    expect(SB.parseVerdictEdits('4 2, 5 3')).toEqual([{ n: 4, verdict: 'substituted_equivalent' }, { n: 5, verdict: 'substituted_better' }]);
    expect(SB.parseVerdictEdits('hello')).toBeNull();
    expect(SB.parseVerdictEdits('5 9')).toEqual([{ n: 5, verdict: null }]);
  });
});

describe('applyVerdictEdits — the coach\'s verdicts go back through the same scorer', () => {
  test('changing not_done → executed raises the measurement and stamps observer_edited', () => {
    const lp = measured();
    const { lp: out, verdictsChanged } = SB.applyVerdictEdits(lp, { fid_5: 'executed' });
    expect(verdictsChanged).toBe(1);
    expect(out.observer_edited).toBe(true);
    expect(out.moves[4]).toMatchObject({ verdict: 'executed', coach_verdict: true, counted: true, credit: 1 });
    // 1 + 1 + 1 + 0.5 + 1 over 5 counted moves = 90
    expect(out.fidelity_pct).toBe(90);
    expect(out.band).toBe('high');
    expect(lp.moves[4].verdict).toBe('not_done');   // input untouched
  });

  test('a move the plan marked not assessable stays out unless the coach rules on it', () => {
    const lp = measured();
    lp.moves[5] = { ...lp.moves[5], verdict: 'not_done', counted: false };   // plan said: cannot be heard
    const untouched = SB.applyVerdictEdits(lp, { fid_5: 'executed' }).lp;
    expect(untouched.moves[5].counted).toBe(false);
    const ruled = SB.applyVerdictEdits(lp, { fid_6: 'executed' }).lp;
    expect(ruled.moves[5]).toMatchObject({ verdict: 'executed', counted: true });
  });

  test('no change → the blob comes back as it was', () => {
    const lp = measured();
    const { lp: out, verdictsChanged } = SB.applyVerdictEdits(lp, { fid_1: 'executed', r_1: '3' });
    expect(verdictsChanged).toBe(0);
    expect(out).toBe(lp);
  });

  test('unknown verdicts and out-of-range moves are ignored', () => {
    const { verdictsChanged } = SB.applyVerdictEdits(measured(), { fid_1: 'brilliant', fid_99: 'executed' });
    expect(verdictsChanged).toBe(0);
  });
});

describe('notAssessedText — the coach is told the actual state', () => {
  test.each([
    ['no_plan', /no lesson plan/i],
    ['no_timings', /timings|timestamps/i],
    ['recording_unusable', /recording/i],
    ['plan_unreadable', /could not read the plan|plan could not be read/i],
    ['grader_failed', /could not run/i],
  ])('%s has its own words', (reason, rx) => {
    const text = SB.notAssessedText('en', { status: 'not_assessed', reason });
    expect(text).toMatch(rx);
    expect(text).toMatch(/not assessed/i);
    expect(findScoreLeak(text)).toBeNull();
  });

  test('the copy differs per reason', () => {
    const all = ['no_plan', 'no_timings', 'recording_unusable', 'plan_unreadable', 'grader_failed']
      .map((reason) => SB.notAssessedText('en', { status: 'not_assessed', reason }));
    expect(new Set(all).size).toBe(all.length);
  });

  test('a teacher with no plans made with Rumi is named as the cause', () => {
    const text = SB.notAssessedText('en', { status: 'not_assessed', reason: 'no_plan', detail: 'teacher_has_no_plans' }, { teacherName: 'Sam' });
    expect(text).toMatch(/Sam/);
    expect(text).toMatch(/no lesson plan made with/i);
  });
});

describe('buildPlanNote — the kind version the teacher reads', () => {
  test('what went as planned, the good substitutions as strengths, one thing to try — no number', () => {
    const note = SB.buildPlanNote(measured(), { lang: 'en' });
    expect(note).toMatch(/Greet the class and recall halves/);
    expect(note).toMatch(/Students compare fractions with strips/);
    expect(note).toMatch(/Share the lesson objective/);
    // the one thing to try: the first move not done
    expect(note).toMatch(/Exit question on the board/);
    expect(note).not.toMatch(/Set the homework page/);
    expect(findScoreLeak(note)).toBeNull();
    expect(note).not.toMatch(/70|partial band|band/i);
  });

  test('a substitution that kept the purpose is named under the strengths', () => {
    const note = SB.buildPlanNote(measured(), { lang: 'en' });
    const strengthsAt = note.indexOf(SB._strings('en').secb_teacher_own_way);
    expect(strengthsAt).toBeGreaterThan(-1);
    const strengthsBlock = note.slice(strengthsAt, note.indexOf(SB._strings('en').secb_teacher_try));
    expect(strengthsBlock).toMatch(/Students compare fractions with strips/);
    expect(strengthsBlock).toMatch(/Share the lesson objective/);
  });

  test('the coach\'s edits are what the note uses', () => {
    const edited = SB.applyVerdictEdits(measured(), { fid_5: 'executed' }).lp;
    const note = SB.buildPlanNote(edited, { lang: 'en' });
    const plannedBlock = note.slice(0, note.indexOf(SB._strings('en').secb_teacher_own_way));
    expect(plannedBlock).toMatch(/Exit question on the board/);   // now under "as planned"
    // with nothing left undone, the thing to try is the move that was only partly done
    expect(note.slice(note.indexOf(SB._strings('en').secb_teacher_try))).toMatch(/Pairs solve the worksheet/);
  });

  test('a move whose text reads like a score is left out, never shown', () => {
    const lp = measured();
    lp.moves[0] = { ...lp.moves[0], text: 'Pupils answer 3 of 5 recall questions' };
    const note = SB.buildPlanNote(lp, { lang: 'en' });
    expect(note).not.toMatch(/3 of 5/);
    expect(findScoreLeak(note)).toBeNull();
  });

  test('nothing measured, or a lesson that did not match its plan → no note', () => {
    expect(SB.buildPlanNote({ status: 'lp_absent' }, { lang: 'en' })).toBeNull();
    expect(SB.buildPlanNote(null, { lang: 'en' })).toBeNull();
    expect(SB.buildPlanNote({ ...measured(), moderators: { note: 'lesson_mismatch' } }, { lang: 'en' })).toBeNull();
  });

  test('coach material quoted into a move is dropped (the firewall\'s verbatim rule)', () => {
    const lp = measured();
    lp.moves[0] = { ...lp.moves[0], text: 'too much teacher talk and the children were bored' };
    const note = SB.buildPlanNote(lp, { lang: 'en', material: ['Too much teacher talk and the children were bored most of the lesson'] });
    expect(note).not.toMatch(/children were bored/);
  });
});
