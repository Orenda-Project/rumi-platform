/**
 * A plan picked after the analysis stopped waiting for it, but before the
 * analysis finished (from the independent review). The coach is told "Section B
 * will check the lesson against …", so when the form opens Section B must be
 * graded against that plan — not reported as "no plan was picked".
 *
 * "Which lesson plan was this lesson taught from?" — asked once the observed
 * teacher is known, never blocking the capture. The coach's pick goes through
 * the SAME linker a teacher's own session uses, owned by the TEACHER, so a coach
 * can only link that teacher's own plan. A pick after the analysis re-grades
 * Section B while the form is still open; after the form is saved it is too late.
 *
 * Faked: the database, Redis, the chat send and the model client (the network).
 * The linker, the fidelity engine and the Section B record run for real.
 */

const { createFakeSupabase } = require('./_helpers/fake-supabase');

const STAMPED = '[00:10] Teacher (EN): fold the strip into five\n\n[03:00] Teacher (EN): one question each before you go';
const PLAN = 'Explain adding fractions with paper fraction strips folded into fifths, then an exit ticket with one question each.';

const mockDb = createFakeSupabase({});
jest.mock('../../bot/shared/config/supabase', () => mockDb.client);
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logWarn: jest.fn() }));
const mockRedis = new Map();
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  setexWithCeiling: jest.fn(async (k, ttl, v) => { mockRedis.set(k, v); return true; }),
  get: jest.fn(async (k) => (mockRedis.has(k) ? JSON.parse(mockRedis.get(k)) : null)),
  delete: jest.fn(async (k) => mockRedis.delete(k)),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true),
  sendInteractiveMessage: jest.fn(async () => true),
}));
// The network boundary: the model client. Answers the extractor and the grader by their system prompts.
const mockLlmCalls = [];
jest.mock('../../bot/shared/services/llm-client', () => ({
  getClient: () => ({
    chat: { completions: { create: async (p) => {
      mockLlmCalls.push(p);
      const sys = p.messages[0].content;
      if (sys.startsWith('LESSON PLAN EXTRACTOR')) {
        return { choices: [{ message: { content: JSON.stringify({ goal: 'add fractions', moves: [
          { move_id: 'm1', phase: 'explain', type: 'modelling', text: 'Explain with fraction strips' },
          { move_id: 'm2', phase: 'exit', type: 'check', text: 'Exit ticket' },
        ] }) }, finish_reason: 'stop' }], usage: {} };
      }
      if (sys.startsWith('FIDELITY GRADER')) {
        return { choices: [{ message: { content: JSON.stringify({ verdicts: [
          { move_id: 'm1', verdict: 'executed', evidence: '[00:10] fold the strip' },
          { move_id: 'm2', verdict: 'executed', evidence: '[03:00] one question each' },
        ], narrative: 'Both planned moves happened.' }) }, finish_reason: 'stop' }], usage: {} };
      }
      throw new Error(`unexpected LLM call: ${sys.slice(0, 40)}`);
    } } },
  }),
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const Plan = require('../../bot/shared/services/observe/observe-plan.service');

const COACH = { id: 'coach-1', role: 'coach', preferred_language: 'en' };
const FROM = 'mtx:15550100001';
const sent = () => WhatsAppService.sendMessage.mock.calls.map((c) => c[1]);
const row = (id) => mockDb.tables.coaching_sessions.find((s) => s.id === id);

function seed(sessionOver = {}) {
  const tables = {
    users: [
      { id: 'coach-1', role: 'coach', phone_number: FROM },
      { id: 't-1', phone_number: 'mtx:15550100002', first_name: 'Sam' },
      { id: 't-2', phone_number: 'mtx:15550100003', first_name: 'Alex' },
    ],
    lesson_plans: [
      { id: 'lp-1', user_id: 't-1', type: 'lesson_plan', topic: 'Adding fractions with strips', grade: '4', subject: 'Maths', content: { plan_text: PLAN }, pdf_url: null, created_at: '2026-09-30T08:00:00Z' },
      { id: 'lp-2', user_id: 't-1', type: 'lesson_plan', topic: 'Telling the time', grade: '3', subject: 'Maths', content: { plan_text: PLAN }, pdf_url: null, created_at: '2026-09-20T08:00:00Z' },
      { id: 'lp-9', user_id: 't-2', type: 'lesson_plan', topic: 'Someone else\'s plan', grade: '5', content: { plan_text: PLAN }, pdf_url: null, created_at: '2026-09-29T08:00:00Z' },
    ],
    coaching_sessions: [{
      id: 'obs-1', user_id: 't-1', observer_user_id: 'coach-1', observation_type: 'leader_observation', status: 'analyzing',
      transcript_text: STAMPED, audio_duration_seconds: 240, linked_lesson_plan_id: null, lesson_plan_link_method: null, lesson_plan_text: null,
      ...sessionOver,
    }],
  };
  for (const k of Object.keys(mockDb.tables)) delete mockDb.tables[k];
  for (const [k, rows] of Object.entries(tables)) mockDb.tables[k] = rows.map((r) => ({ ...r }));
}

const savedEnv = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.clear();
  mockLlmCalls.length = 0;
  process.env.LP_FIDELITY_ENABLED = 'true';
  seed();
});
afterAll(() => { process.env = savedEnv; });


describe('v1 review: a pick after the analysis stopped waiting, before it finished', () => {
  test('the coach is told Section B will use the plan, so Section B must end up graded against it', async () => {
    process.env.LP_FIDELITY_PLAN_WAIT_SECONDS = '0';           // the analysis's wait has run out
    expect(await Plan.maybeAskForPlan(COACH, FROM, 'obs-1')).toBe(true);
    // analysis-processor: _observationPlanRow → awaitPlanAnswer gives up, re-reads the row (no plan yet)
    const waited = await Plan.awaitPlanAnswer('obs-1', { pollMs: 1 });
    expect(waited).toEqual({ asked: true, answered: false });
    const observedRow = { ...row('obs-1') };

    // The analysis is still running (status 'analyzing'): the coach picks the first plan.
    const rows = WhatsAppService.sendInteractiveMessage.mock.calls[0][1].action.sections[0].rows;
    expect(await Plan.handlePlanPick(COACH, FROM, rows[0].id, { awaitRegrade: true })).toBe(true);
    expect(sent().join('\n')).toMatch(/Section B will check the lesson against "Adding fractions with strips"/);
    expect(row('obs-1').linked_lesson_plan_id).toBe('lp-1');

    // The analysis finishes with the row it re-read before the pick (analysis-processor.service.js:226-233).
    const { sectionBRecord } = require('../../bot/shared/services/observe/observe-section-b');
    const sectionB = sectionBRecord(null, { detail: await Plan.planDetail(observedRow) });
    Object.assign(row('obs-1'), { status: 'awaiting_observer_review', analysis_data: { section_b: sectionB } });

    // The form opens (observe-draft.onAnalysisReady → reconcileLatePick): Section B is graded against the pick.
    expect(await Plan.reconcileLatePick('obs-1', { from: FROM, lang: 'en' })).toBe(true);
    expect(row('obs-1').analysis_data.section_b).toEqual({ status: 'assessed', reason: null, mismatch: false });
    expect(row('obs-1').analysis_data.lp_fidelity).toMatchObject({ status: 'ok', lesson_plan_id: 'lp-1' });
    expect(row('obs-1').autofill_analysis_data.lp_fidelity).toMatchObject({ status: 'ok', lesson_plan_id: 'lp-1' });
    expect(sent().join('\n')).toMatch(/I checked the lesson against "Adding fractions with strips"/);
  });

  test('a late "No plan" turns "no plan was picked" into "you said there was none", with no model call', async () => {
    process.env.LP_FIDELITY_PLAN_WAIT_SECONDS = '0';
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.awaitPlanAnswer('obs-1', { pollMs: 1 });
    const observedRow = { ...row('obs-1') };
    const rows = WhatsAppService.sendInteractiveMessage.mock.calls[0][1].action.sections[0].rows;
    await Plan.handlePlanPick(COACH, FROM, rows[rows.length - 1].id, { awaitRegrade: true });
    const { sectionBRecord } = require('../../bot/shared/services/observe/observe-section-b');
    const sectionB = sectionBRecord({ status: 'lp_absent' }, { detail: await Plan.planDetail(observedRow) });
    Object.assign(row('obs-1'), { status: 'awaiting_observer_review', analysis_data: { lp_fidelity: { status: 'lp_absent' }, section_b: sectionB } });
    expect(await Plan.reconcileLatePick('obs-1', { from: FROM, lang: 'en' })).toBe(true);
    expect(row('obs-1').analysis_data.section_b).toMatchObject({ status: 'not_assessed', reason: 'no_plan', detail: 'coach_said_no_plan' });
    expect(mockLlmCalls).toHaveLength(0);
  });

  test('nothing to reconcile: the graded plan is the linked one → no re-grade, no message', async () => {
    Object.assign(row('obs-1'), {
      status: 'awaiting_observer_review', linked_lesson_plan_id: 'lp-1', lesson_plan_link_method: 'selected_recent',
      analysis_data: { lp_fidelity: { status: 'ok', lesson_plan_id: 'lp-1', fidelity_pct: 100, moves: [] }, section_b: { status: 'assessed', reason: null } },
    });
    expect(await Plan.reconcileLatePick('obs-1', { from: FROM, lang: 'en' })).toBe(false);
    expect(mockLlmCalls).toHaveLength(0);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  test('fidelity off, or an observation with no Section B record → untouched', async () => {
    Object.assign(row('obs-1'), { status: 'awaiting_observer_review', linked_lesson_plan_id: 'lp-1', analysis_data: {} });
    expect(await Plan.reconcileLatePick('obs-1', { from: FROM, lang: 'en' })).toBe(false);
    process.env.LP_FIDELITY_ENABLED = 'false';
    Object.assign(row('obs-1'), { analysis_data: { section_b: { status: 'not_assessed', reason: 'no_plan' } } });
    expect(await Plan.reconcileLatePick('obs-1', { from: FROM, lang: 'en' })).toBe(false);
    expect(mockLlmCalls).toHaveLength(0);
  });
});
