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

const ObserveEdits = require('../../bot/shared/services/observe/observe-edits.service');

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
