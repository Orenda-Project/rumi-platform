/**
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

describe('asking for the plan', () => {
  test('fidelity off: nothing is asked', async () => {
    delete process.env.LP_FIDELITY_ENABLED;
    expect(await Plan.maybeAskForPlan(COACH, FROM, 'obs-1')).toBe(false);
    expect(WhatsAppService.sendInteractiveMessage).not.toHaveBeenCalled();
    expect(mockRedis.size).toBe(0);
  });

  test('the teacher is not known yet: nothing is asked', async () => {
    seed({ user_id: 'coach-1' });
    expect(await Plan.maybeAskForPlan(COACH, FROM, 'obs-1')).toBe(false);
    expect(WhatsAppService.sendInteractiveMessage).not.toHaveBeenCalled();
  });

  test('a teacher with no plans: nothing is sent, and that is remembered for Section B', async () => {
    mockDb.tables.lesson_plans = [];
    expect(await Plan.maybeAskForPlan(COACH, FROM, 'obs-1')).toBe(false);
    expect(WhatsAppService.sendInteractiveMessage).not.toHaveBeenCalled();
    expect(await Plan.planDetail(row('obs-1'))).toBe('teacher_has_no_plans');
  });

  test('one row per plan of the TEACHER plus "No plan"', async () => {
    expect(await Plan.maybeAskForPlan(COACH, FROM, 'obs-1')).toBe(true);
    const [to, payload] = WhatsAppService.sendInteractiveMessage.mock.calls[0];
    expect(to).toBe(FROM);
    expect(payload.body).toMatch(/Which lesson plan/);
    const rows = payload.action.sections[0].rows;
    expect(rows.map((r) => r.id)).toEqual(['observe_lp_obs-1_0', 'observe_lp_obs-1_1', 'observe_lp_obs-1_none']);
    expect(rows[0].title).toBe('Adding fractions with st');   // clipped to 24
    expect(rows[0].description).toMatch(/4/);
    expect(rows[2].title).toBe('No plan');
  });

  test('never throws — a failed send is swallowed', async () => {
    WhatsAppService.sendInteractiveMessage.mockRejectedValueOnce(new Error('down'));
    await expect(Plan.maybeAskForPlan(COACH, FROM, 'obs-1')).resolves.toBe(false);
  });
});

describe('the coach picks', () => {
  test('before the analysis finished: the plan is linked through the shared linker and acked', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    expect(await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0')).toBe(true);
    expect(row('obs-1')).toMatchObject({ linked_lesson_plan_id: 'lp-1', lesson_plan_link_method: 'selected_recent' });
    expect(sent().pop()).toBe('📋 Got it — Section B will check the lesson against "Adding fractions with strips".');
    expect(mockLlmCalls).toHaveLength(0);   // the analysis picks it up — nothing graded here
    expect(await Plan.awaitPlanAnswer('obs-1', { pollMs: 5 })).toMatchObject({ asked: true, answered: true });
  });

  test('"No plan" before the analysis: recorded as the coach\'s answer', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_none');
    expect(row('obs-1').lesson_plan_link_method).toBe('none');
    expect(sent().pop()).toMatch(/no plan for this lesson/);
    expect(await Plan.planDetail(row('obs-1'))).toBe('coach_said_no_plan');
  });

  test('only that teacher\'s own plan can be linked (the linker is owned by the teacher)', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    const stash = JSON.parse(mockRedis.get('observe:plan:obs-1'));
    stash.plans[0] = { id: 'lp-9', topic: 'Someone else\'s plan' };
    mockRedis.set('observe:plan:obs-1', JSON.stringify(stash));
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0');
    expect(row('obs-1').linked_lesson_plan_id).toBeNull();
    expect(sent().pop()).toMatch(/out of date/);
  });

  test('another coach cannot link a plan to this observation', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.handlePlanPick({ id: 'coach-2', preferred_language: 'en' }, 'mtx:15550100009', 'observe_lp_obs-1_0');
    expect(row('obs-1').linked_lesson_plan_id).toBeNull();
  });

  test('a cancelled observation links nothing', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    row('obs-1').status = 'cancelled';
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0');
    expect(row('obs-1').linked_lesson_plan_id).toBeNull();
  });

  test('an expired list says so', async () => {
    expect(await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0')).toBe(true);
    expect(row('obs-1').linked_lesson_plan_id).toBeNull();
    expect(sent().pop()).toBe('That plan list is out of date. The observation goes on without it.');
  });

  test('after the analysis, while the form is open: Section B is re-graded into v1 and v2', async () => {
    seed({
      status: 'awaiting_observer_review',
      analysis_data: { summary: 'ok', section_b: { status: 'not_assessed', reason: 'no_plan', detail: 'no_answer' } },
      autofill_analysis_data: { summary: 'ok', section_b: { status: 'not_assessed', reason: 'no_plan', detail: 'no_answer' } },
    });
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0', { awaitRegrade: true });
    const s = row('obs-1');
    expect(s.linked_lesson_plan_id).toBe('lp-1');
    expect(s.analysis_data).toMatchObject({ summary: 'ok', lp_fidelity: { status: 'ok', source: 'linked' }, section_b: { status: 'assessed' } });
    expect(s.autofill_analysis_data).toMatchObject({ lp_fidelity: { status: 'ok' }, section_b: { status: 'assessed' } });
    // One grading run: a re-grade is a single call, not LP_FIDELITY_RUNS.
    expect(mockLlmCalls.filter((p) => p.messages[0].content.startsWith('FIDELITY GRADER'))).toHaveLength(1);
    expect(sent().pop()).toBe('📋 I checked the lesson against "Adding fractions with strips" — Section B is ready in the form.');
  });

  test('"No plan" after the analysis: Section B says the coach chose none, in v1 and v2', async () => {
    seed({
      status: 'awaiting_observer_review',
      analysis_data: { summary: 'ok', lp_fidelity: { status: 'lp_absent' }, section_b: { status: 'not_assessed', reason: 'no_plan', detail: 'no_answer' } },
      autofill_analysis_data: { summary: 'ok', lp_fidelity: { status: 'lp_absent' }, section_b: { status: 'not_assessed', reason: 'no_plan', detail: 'no_answer' } },
    });
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_none', { awaitRegrade: true });
    const s = row('obs-1');
    expect(s.analysis_data.section_b).toEqual({ status: 'not_assessed', reason: 'no_plan', detail: 'coach_said_no_plan' });
    expect(s.autofill_analysis_data.section_b).toEqual({ status: 'not_assessed', reason: 'no_plan', detail: 'coach_said_no_plan' });
    expect(mockLlmCalls).toHaveLength(0);
  });

  test('the form is already saved: too late, nothing is linked', async () => {
    seed({ status: 'observer_review_complete', analysis_data: { summary: 'ok' } });
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0', { awaitRegrade: true });
    expect(row('obs-1').linked_lesson_plan_id).toBeNull();
    expect(sent().pop()).toMatch(/already saved/);
    expect(mockLlmCalls).toHaveLength(0);
  });

  test('a re-grade never writes over a form saved while it was grading', async () => {
    seed({ status: 'awaiting_observer_review', analysis_data: { summary: 'ok' }, autofill_analysis_data: { summary: 'ok' } });
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    await Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0');
    row('obs-1').status = 'observer_review_complete';
    // let the background grading finish
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
    expect(row('obs-1').analysis_data).toEqual({ summary: 'ok' });
    expect(sent().pop()).toMatch(/already saved/);
  });
});

describe('waiting for the answer, and why there is no plan', () => {
  test('nothing asked: returns at once', async () => {
    const t0 = Date.now();
    expect(await Plan.awaitPlanAnswer('obs-1', { pollMs: 1000 })).toMatchObject({ asked: false });
    expect(Date.now() - t0).toBeLessThan(200);
  });

  test('an open question is waited on until it is answered', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    setTimeout(() => { Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_1'); }, 30);
    const out = await Plan.awaitPlanAnswer('obs-1', { pollMs: 10 });
    expect(out).toMatchObject({ asked: true, answered: true });
  });

  test('an unanswered question is waited on no longer than LP_FIDELITY_PLAN_WAIT_SECONDS', async () => {
    process.env.LP_FIDELITY_PLAN_WAIT_SECONDS = '0';
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    const out = await Plan.awaitPlanAnswer('obs-1', { pollMs: 10 });
    delete process.env.LP_FIDELITY_PLAN_WAIT_SECONDS;
    expect(out).toMatchObject({ asked: true, answered: false });
  });

  test('planDetail: teacher unknown, then no answer', async () => {
    expect(await Plan.planDetail({ id: 'obs-1', user_id: 'coach-1', observer_user_id: 'coach-1' })).toBe('teacher_unknown');
    expect(await Plan.planDetail({ id: 'obs-1', user_id: 't-1', observer_user_id: 'coach-1' })).toBe('no_answer');
  });
});
