/**
 * Section B in the coach's review — did the lesson follow its plan?
 *
 * After the last Section A domain the chat form moves on to the plan's moves,
 * one page at a time: the coach replies "ok" to keep a page or
 * "<move> <verdict>" to change one. Every edit — the ratings (r_*) and the
 * verdicts (fid_*) — is merged in ONE write, and the verdicts go back through
 * the same scorer the measurement came from. When nothing could be measured
 * the coach is told why, and the observation goes on without Section B.
 *
 * On Meta the published Flow has no Section B screen, so after a Flow
 * submission the chat opens Section B and the debrief waits for its last page.
 */

const { createFakeSupabase } = require('./_helpers/fake-supabase');
const { getObservePack } = require('../../bot/shared/services/observe/observe-framework');

function teachAnalysis(score = 3) {
  const pack = getObservePack();
  const analysis = { domains: {}, summary: 'A warm lesson.' };
  for (const d of pack.domainOrder) {
    analysis.domains[d] = {
      indicators: pack.domains[d].indicators.map((i) => ({
        id: i.id, score, evidence: `The teacher asked "what do you notice?" (${i.name})`, improvement: `Try more wait time (${i.name})`,
      })),
    };
  }
  return pack.computeScores(analysis);
}

const move = (n, phase, text, verdict, extra = {}) => ({
  move_id: `m${n}`, phase, bucket: 'must_happen', selection: 'none', text, verdict,
  evidence: verdict === 'not_done' ? '' : `[0${n}:10] "quote ${n}"`, evidence_translation: '', rationale: `why ${n}`,
  counted: verdict !== 'not_adjudicable', credit: null, ...extra,
});

// A measured blob, as the analysis step persists it (lp_fidelity).
function measured(extraMoves = 0) {
  const moves = [
    move(1, 'warm_up', 'Greet the class and recall halves', 'executed'),
    move(2, 'announce', 'Share the lesson objective', 'substituted_equivalent'),
    move(3, 'guided', 'Students compare fractions with strips', 'substituted_better'),
    move(4, 'independent', 'Pairs solve the worksheet', 'partial'),
    move(5, 'exit', 'Exit question on the board', 'not_done'),
    move(6, 'homework', 'Set the homework page', 'not_adjudicable'),
  ];
  for (let i = 0; i < extraMoves; i += 1) moves.push(move(7 + i, 'guided', `Extra practice round ${i + 1}`, 'executed'));
  return {
    status: 'ok', source: 'linked', lesson_plan_id: 'lp-1', plan_hash: 'h', fidelity_pct: 70, band: 'partial',
    prescribed_count: 5, moderators: null, unusable_guard: null, not_assessed: ['m6'], moves,
  };
}

const ASSESSED = { status: 'assessed', reason: null, mismatch: false };

const mockDb = createFakeSupabase({
  users: [
    { id: 'coach-1', role: 'coach', name: 'Robin Coach', phone_number: 'mtx:15550100001', preferred_language: 'en' },
    { id: 't-1', name: 'Sam Taylor', phone_number: 'mtx:15550100002', preferred_language: 'en' },
  ],
  coaching_sessions: [],
});
jest.mock('../../bot/shared/config/supabase', () => mockDb.client);
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
const mockRedis = new Map();
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  setexWithCeiling: jest.fn(async (k, ttl, v) => { mockRedis.set(k, v); return true; }),
  get: jest.fn(async (k) => (mockRedis.has(k) ? JSON.parse(mockRedis.get(k)) : null)),
  delete: jest.fn(async (k) => mockRedis.delete(k)),
  setNX: jest.fn(async (k, v) => { if (mockRedis.has(k)) return false; mockRedis.set(k, JSON.stringify(v)); return true; }),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true),
  sendFlow: jest.fn(async () => true),
  sendInteractiveButtons: jest.fn(async () => true),
}));
const mockDebrief = { offerDebriefChoice: jest.fn(async () => true) };
jest.mock('../../bot/shared/services/observe/observe-debrief.service', () => mockDebrief);

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const ObserveState = require('../../bot/shared/services/observe/observe-state.service');
const ObserveEdits = require('../../bot/shared/services/observe/observe-edits.service');
const ObserveForm = require('../../bot/shared/services/observe/observe-form.service');
const ObserveDraft = require('../../bot/shared/services/observe/observe-draft.service');
const { handleObserveText } = require('../../bot/shared/handlers/observe-command.handler');

const COACH = { id: 'coach-1', role: 'coach', preferred_language: 'en' };
const TO = 'mtx:15550100001';
const sent = () => WhatsAppService.sendMessage.mock.calls.map((c) => c[1]);
const lastText = () => sent()[sent().length - 1];

const row = (id) => mockDb.tables.coaching_sessions.find((s) => s.id === id);

function seed(id, over = {}, analysisOver = {}) {
  const analysis = { ...teachAnalysis(3), lp_fidelity: measured(), section_b: { ...ASSESSED }, ...analysisOver };
  mockDb.tables.coaching_sessions.push({
    id, user_id: 't-1', observer_user_id: 'coach-1', observation_type: 'leader_observation',
    status: 'awaiting_observer_review', debrief_status: 'pending',
    analysis_data: analysis, autofill_analysis_data: JSON.parse(JSON.stringify(analysis)), ...over,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.clear();
  mockDb.tables.coaching_sessions.length = 0;
  process.env.OBSERVE_ENABLED = 'true';
  delete process.env.OBSERVE_FORM_FLOW_ID;
  delete process.env.OBSERVE_FRAMEWORK;
});

describe('applyObserverEdits — the coach\'s plan verdicts in the same write as the ratings', () => {
  test('fid_* edits are re-scored through the same scorer; v1 is untouched', async () => {
    seed('obs-1');
    const summary = await ObserveEdits.applyObserverEdits('obs-1', { r_T: '5', fid_5: 'executed' });
    expect(summary).toMatchObject({ indicators_rescored: 1, fidelity_verdicts_changed: 1 });
    const v2 = row('obs-1').analysis_data;
    expect(v2.lp_fidelity.moves[4]).toMatchObject({ verdict: 'executed', coach_verdict: true });
    expect(v2.lp_fidelity.observer_edited).toBe(true);
    expect(v2.lp_fidelity.fidelity_pct).toBe(90);
    expect(v2.section_b).toMatchObject({ status: 'assessed' });
    expect(v2.observer_edit_summary.fidelity_verdicts_changed).toBe(1);
    expect(row('obs-1').autofill_analysis_data.lp_fidelity.moves[4].verdict).toBe('not_done');
    expect(row('obs-1').autofill_analysis_data.lp_fidelity.fidelity_pct).toBe(70);
  });

  test('the section_b record keeps what the analysis step knew', async () => {
    seed('obs-2', {}, { section_b: { ...ASSESSED, detail: 'kept' } });
    await ObserveEdits.applyObserverEdits('obs-2', { fid_5: 'executed' });
    expect(row('obs-2').analysis_data.section_b).toMatchObject({ status: 'assessed', detail: 'kept' });
  });

  test('without a Section B the merge is what it always was', async () => {
    seed('obs-3', {}, { lp_fidelity: undefined, section_b: undefined });
    const summary = await ObserveEdits.applyObserverEdits('obs-3', { fid_5: 'executed' });
    expect(summary.fidelity_verdicts_changed).toBe(0);
    expect(row('obs-3').analysis_data.lp_fidelity).toBeUndefined();
  });
});

describe('applySectionBEdits — the verdicts after a Flow submission', () => {
  test('merges the verdicts into a saved observation and keeps the Flow\'s edit summary', async () => {
    seed('obs-10', { status: 'observer_review_complete' });
    row('obs-10').analysis_data.observer_edit_summary = { indicators_rescored: 2, text_fields_changed: 0 };
    const summary = await ObserveEdits.applySectionBEdits('obs-10', { fid_5: 'executed' });
    expect(summary).toMatchObject({ fidelity_verdicts_changed: 1 });
    const v2 = row('obs-10').analysis_data;
    expect(v2.lp_fidelity.fidelity_pct).toBe(90);
    expect(v2.observer_edit_summary).toMatchObject({ indicators_rescored: 2, fidelity_verdicts_changed: 1 });
    expect(row('obs-10').status).toBe('observer_review_complete');
    expect(row('obs-10').autofill_analysis_data.lp_fidelity.fidelity_pct).toBe(70);
  });

  test('refused once the debrief or the report has followed, or before the ratings are saved', async () => {
    const cases = [
      ['obs-11', { status: 'awaiting_observer_review' }, 'not_in_review'],
      ['obs-12', { status: 'observer_review_complete', debrief_status: 'completed' }, 'not_in_review'],
      ['obs-13', { status: 'observer_review_complete' }, 'not_in_review', { teacher_delivery: { status: 'sent' } }],
      ['obs-14', { status: 'cancelled' }, 'terminal'],
    ];
    for (const [id, over, refused, analysisOver = {}] of cases) {
      seed(id, over, analysisOver);
      const before = JSON.stringify(row(id).analysis_data);
      expect(await ObserveEdits.applySectionBEdits(id, { fid_5: 'executed' })).toEqual({ refused });
      expect(JSON.stringify(row(id).analysis_data)).toBe(before);
    }
  });

  test('the write is guarded: a report that started after the read is never overwritten', async () => {
    seed('obs-15', { status: 'observer_review_complete' });
    const origFrom = mockDb.client.from;
    let reads = 0;
    mockDb.client.from = (name) => {
      const b = origFrom(name);
      if (name === 'coaching_sessions' && (reads += 1) === 1) {
        const origThen = b.then;
        b.then = (res, rej) => origThen.call(b, (v) => {
          row('obs-15').analysis_data = { ...row('obs-15').analysis_data, teacher_delivery: { status: 'previewing' } };
          return res(v);
        }, rej);
      }
      return b;
    };
    try {
      expect(await ObserveEdits.applySectionBEdits('obs-15', { fid_5: 'executed' })).toEqual({ refused: 'not_in_review' });
    } finally {
      mockDb.client.from = origFrom;
    }
    expect(row('obs-15').analysis_data.lp_fidelity.fidelity_pct).toBe(70);
    expect(row('obs-15').analysis_data.teacher_delivery).toEqual({ status: 'previewing' });
  });

  test('a debrief the worker merged meanwhile is kept', async () => {
    seed('obs-16', { status: 'observer_review_complete' });
    const origFrom = mockDb.client.from;
    let reads = 0;
    mockDb.client.from = (name) => {
      const b = origFrom(name);
      if (name === 'coaching_sessions' && (reads += 1) === 1) {
        const origThen = b.then;
        b.then = (res, rej) => origThen.call(b, (v) => {
          row('obs-16').analysis_data = { ...row('obs-16').analysis_data, observer_debrief: { feedback: 'kept' } };
          return res(v);
        }, rej);
      }
      return b;
    };
    try {
      await ObserveEdits.applySectionBEdits('obs-16', { fid_5: 'executed' });
    } finally {
      mockDb.client.from = origFrom;
    }
    expect(row('obs-16').analysis_data.observer_debrief).toEqual({ feedback: 'kept' });
    expect(row('obs-16').analysis_data.lp_fidelity.fidelity_pct).toBe(90);
  });
});

describe('the chat form — Section B after the last domain', () => {
  // Through the four Section A domains: the last "ok" leaves Section A.
  async function throughSectionA(id) {
    await ObserveForm.start(COACH, TO, id, { lang: 'en' });
    for (let i = 0; i < 4; i += 1) expect(await handleObserveText(COACH, TO, 'ok')).toBe(true);
  }

  test('ok through Section A → the plan\'s moves → "5 1" → ok: one write, the coach\'s verdict is the measurement', async () => {
    seed('obs-20');
    await ObserveForm.start(COACH, TO, 'obs-20', { lang: 'en' });
    await handleObserveText(COACH, TO, '1 1');                        // a Section A edit, kept for the same write
    for (let i = 0; i < 4; i += 1) await handleObserveText(COACH, TO, 'ok');

    expect(lastText()).toMatch(/Section B/);
    expect(lastText()).toMatch(/1 of 1/);
    expect(lastText()).toMatch(/Exit question on the board/);
    expect(mockDebrief.offerDebriefChoice).not.toHaveBeenCalled();
    expect(row('obs-20').status).toBe('awaiting_observer_review');   // nothing written yet
    expect(await ObserveState.getState('coach-1')).toMatchObject({ state: 'awaiting_form', section: 'b', page: 0 });

    expect(await handleObserveText(COACH, TO, '5 1')).toBe(true);
    const page = lastText();
    expect(page).toMatch(/Section B/);
    expect(page.slice(page.indexOf('5. '))).toMatch(/As planned.*\(changed\)/);
    expect(await handleObserveText(COACH, TO, 'ok')).toBe(true);

    const s = row('obs-20');
    expect(s.status).toBe('observer_review_complete');
    expect(s.analysis_data.lp_fidelity.moves[4]).toMatchObject({ verdict: 'executed', coach_verdict: true });
    expect(s.analysis_data.lp_fidelity.observer_edited).toBe(true);
    expect(s.analysis_data.lp_fidelity.fidelity_pct).toBeGreaterThan(70);
    expect(s.analysis_data.observer_edit_summary).toMatchObject({ indicators_rescored: 1, fidelity_verdicts_changed: 1 });
    expect(s.autofill_analysis_data).toEqual(JSON.parse(JSON.stringify({ ...teachAnalysis(3), lp_fidelity: measured(), section_b: ASSESSED })));
    const ack = lastText();
    expect(ack).toMatch(/saved, with your edits/);
    expect(ack).toMatch(/You changed 1 rating/);
    expect(ack).toMatch(/You changed 1 plan verdict/);
    expect(await ObserveState.getState('coach-1')).toBeNull();
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'coach-1' }), TO, 'obs-20');
  });

  test('in Section B a reply is a move and a verdict, never an indicator and a rating', async () => {
    seed('obs-21');
    await throughSectionA('obs-21');
    await handleObserveText(COACH, TO, '9 1');
    expect(lastText()).toMatch(/pick a move from 1 to 6/);
    await handleObserveText(COACH, TO, '2 9');
    expect(lastText()).toMatch(/Verdicts go from 1 to 6/);
    expect((await ObserveState.getState('coach-1')).edits).toEqual({});
    await handleObserveText(COACH, TO, '2 4');                         // a Section A "2 4" would be a rating
    expect((await ObserveState.getState('coach-1')).edits).toEqual({ fid_2: 'partial' });
    expect(await handleObserveText(COACH, TO, 'what time is it?')).toBe(false);
  });

  test('a long plan is paged; a move on another page can be named from any page', async () => {
    seed('obs-22', {}, { lp_fidelity: measured(8) });              // 14 moves → 3 pages
    await throughSectionA('obs-22');
    expect(lastText()).toMatch(/1 of 3/);
    await handleObserveText(COACH, TO, '12 5');
    await handleObserveText(COACH, TO, 'ok');
    expect(lastText()).toMatch(/2 of 3/);
    await handleObserveText(COACH, TO, 'ok');
    expect(lastText()).toMatch(/3 of 3/);
    expect(mockDebrief.offerDebriefChoice).not.toHaveBeenCalled();
    await handleObserveText(COACH, TO, 'ok');
    expect(row('obs-22').analysis_data.lp_fidelity.moves[11]).toMatchObject({ verdict: 'not_done', coach_verdict: true });
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
  });

  test('ok on every page with no change: saved, no plan-verdict line', async () => {
    seed('obs-23');
    await throughSectionA('obs-23');
    await handleObserveText(COACH, TO, 'ok');
    expect(row('obs-23').analysis_data.lp_fidelity.fidelity_pct).toBe(70);
    expect(row('obs-23').analysis_data.lp_fidelity.observer_edited).toBeUndefined();
    expect(lastText()).not.toMatch(/plan verdict/);
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
  });

  test('nothing measured: the coach is told why, then the form finishes', async () => {
    seed('obs-24', {}, {
      lp_fidelity: { status: 'ok', unusable_guard: 'no_timestamps', fidelity_pct: null, moves: [] },
      section_b: { status: 'not_assessed', reason: 'no_timings' },
    });
    await throughSectionA('obs-24');
    const text = sent().join('\n');
    expect(text).toMatch(/not assessed/);
    expect(text).toMatch(/no timings/);
    expect(row('obs-24').status).toBe('observer_review_complete');
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
  });

  test('no plan: the cause is named, with the teacher\'s name', async () => {
    seed('obs-25', {}, {
      lp_fidelity: { status: 'lp_absent' },
      section_b: { status: 'not_assessed', reason: 'no_plan', detail: 'teacher_has_no_plans' },
    });
    await throughSectionA('obs-25');
    expect(sent().join('\n')).toMatch(/Sam Taylor has no lesson plan made with Rumi/);
  });

  test('no Section B at all (an older observation): finishes exactly as before', async () => {
    seed('obs-26', {}, { lp_fidelity: undefined, section_b: undefined });
    await throughSectionA('obs-26');
    expect(sent().join('\n')).not.toMatch(/Section B/);
    expect(row('obs-26').status).toBe('observer_review_complete');
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
  });

  test('ratings saved elsewhere meanwhile: no Section B pages, the coach is told', async () => {
    seed('obs-27');
    await ObserveForm.start(COACH, TO, 'obs-27', { lang: 'en' });
    row('obs-27').status = 'observer_review_complete';
    for (let i = 0; i < 4; i += 1) await handleObserveText(COACH, TO, 'ok');
    expect(sent().join('\n')).not.toMatch(/Section B/);
    expect(lastText()).toMatch(/already saved/);
    expect(mockDebrief.offerDebriefChoice).not.toHaveBeenCalled();
  });

  test('resuming the form starts again at the first Section A domain', async () => {
    seed('obs-28');
    await throughSectionA('obs-28');
    await handleObserveText(COACH, TO, '5 1');
    await ObserveForm.resume(COACH, TO, 'obs-28');
    expect(lastText()).toMatch(/Time on Task/);
    const st = await ObserveState.getState('coach-1');
    expect(st).toMatchObject({ domainIndex: 0, edits: {} });
    expect(st.section).toBeUndefined();
  });
});

describe('after a Meta Flow submission — the Flow has no Section B screen', () => {
  const FROM = '15550100001';
  const reply = (id) => ({ observe_action: 'submitted', session_id: id, flow_token: `coach-1:${id}` });
  // As the form endpoint leaves the row: ratings merged, review complete.
  function seedSubmitted(id, analysisOver = {}) {
    seed(id, { status: 'observer_review_complete' }, analysisOver);
    row(id).analysis_data.observer_edit_summary = { indicators_rescored: 2, text_fields_changed: 0 };
  }

  test('the chat opens Section B; the debrief waits for its last page', async () => {
    seedSubmitted('obs-40');
    await ObserveState.setState('coach-1', 'awaiting_form', { sessionId: 'obs-40', via: 'flow' });
    expect(await ObserveDraft.completeFromFlow(COACH, FROM, reply('obs-40'))).toBe(true);
    expect(sent()[0]).toMatch(/saved, with your edits/);
    expect(lastText()).toMatch(/Section B/);
    expect(mockDebrief.offerDebriefChoice).not.toHaveBeenCalled();
    const st = await ObserveState.getState('coach-1');
    expect(st).toMatchObject({ state: 'awaiting_form', sessionId: 'obs-40', section: 'b', page: 0, afterFlow: true });
    expect(st.via).toBeUndefined();

    await handleObserveText(COACH, FROM, '5 1');
    await handleObserveText(COACH, FROM, 'ok');
    const v2 = row('obs-40').analysis_data;
    expect(v2.lp_fidelity.moves[4]).toMatchObject({ verdict: 'executed', coach_verdict: true });
    expect(v2.lp_fidelity.fidelity_pct).toBe(90);
    expect(v2.observer_edit_summary).toMatchObject({ indicators_rescored: 2, fidelity_verdicts_changed: 1 });
    expect(row('obs-40').autofill_analysis_data.lp_fidelity.fidelity_pct).toBe(70);
    expect(lastText()).toMatch(/You changed 1 plan verdict/);
    expect(sent().filter((m) => /saved, with your edits/.test(m))).toHaveLength(1);   // the ratings were acknowledged once
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'coach-1' }), FROM, 'obs-40');
  });

  test('pages kept as they are: the debrief is offered, nothing is rewritten', async () => {
    seedSubmitted('obs-41');
    await ObserveDraft.completeFromFlow(COACH, FROM, reply('obs-41'));
    const before = JSON.stringify(row('obs-41').analysis_data);
    await handleObserveText(COACH, FROM, 'ok');
    expect(JSON.stringify(row('obs-41').analysis_data)).toBe(before);
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
    expect(await ObserveState.getState('coach-1')).toBeNull();
  });

  test('nothing measured: the reason, then the debrief as today', async () => {
    seedSubmitted('obs-42', {
      lp_fidelity: { status: 'lp_unparseable' },
      section_b: { status: 'not_assessed', reason: 'plan_unreadable' },
    });
    await ObserveDraft.completeFromFlow(COACH, FROM, reply('obs-42'));
    expect(sent().join('\n')).toMatch(/not assessed[\s\S]*could not read the plan/);
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
    expect(await ObserveState.getState('coach-1')).toBeNull();
  });

  test('no Section B record: unchanged', async () => {
    seedSubmitted('obs-43', { lp_fidelity: undefined, section_b: undefined });
    await ObserveDraft.completeFromFlow(COACH, FROM, reply('obs-43'));
    expect(sent()).toHaveLength(1);
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalled();
  });
});
