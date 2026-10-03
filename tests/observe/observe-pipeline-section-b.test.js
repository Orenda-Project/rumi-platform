/**
 * Section B in the analysis step of a leader observation: with lesson-plan
 * fidelity on, the analysis waits (bounded) for the coach's plan answer,
 * re-reads the plan from the row, grades it with the same engine a teacher's
 * own session uses, and persists lp_fidelity plus section_b — the status the
 * coach's form and the report read. Fidelity off: nothing changes.
 *
 * Faked: the database, Redis, messaging, the pedagogy model and the model
 * client the fidelity engine calls (the network). The fidelity engine, the
 * linker and the Section B record run for real.
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
  sendMessage: jest.fn(async () => true), sendSticker: jest.fn(async () => true), sendInteractiveMessage: jest.fn(async () => true),
}));
const mockGpt = {
  analyzePedagogy: jest.fn(async () => ({ analysis: { domains: {}, summary: 'ok' }, usage: { input_tokens: 1, output_tokens: 1, cached_tokens: 0, cost: 0.01 } })),
  extractReflectiveCorpus: jest.fn(async () => ({ corpus: { c: 1 }, model_used: 'm' })),
};
jest.mock('../../bot/shared/services/gpt5-mini.service', () => mockGpt);
jest.mock('../../bot/shared/services/coaching/report-generator.service', () => ({
  fetchAndCompressPriorFeedback: jest.fn(async () => ({ exists: false })),
}));
const mockDraft = { onAnalysisReady: jest.fn(async () => true) };
jest.mock('../../bot/shared/services/observe/observe-draft.service', () => mockDraft);
// The network boundary of the fidelity engine.
const mockLlmCalls = [];
let mockExtractorFails = false;
jest.mock('../../bot/shared/services/llm-client', () => ({
  getClient: () => ({
    chat: { completions: { create: async (p) => {
      mockLlmCalls.push(p);
      const sys = p.messages[0].content;
      if (sys.startsWith('LESSON PLAN EXTRACTOR')) {
        if (mockExtractorFails) throw new Error('provider outage');
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

const AnalysisProcessor = require('../../bot/shared/services/coaching/analysis-processor.service');
const Plan = require('../../bot/shared/services/observe/observe-plan.service');

const COACH = { id: 'coach-1', role: 'coach', preferred_language: 'en' };
const FROM = 'mtx:15550100001';
const obs = () => mockDb.tables.coaching_sessions.find((s) => s.id === 'obs-1');

function seed(sessionOver = {}) {
  const tables = {
    users: [
      { id: 'coach-1', role: 'coach', phone_number: FROM, first_name: 'Robin', last_name: 'Coach' },
      { id: 't-1', phone_number: 'mtx:15550100002', first_name: 'Sam', last_name: 'Taylor', preferred_language: 'en' },
    ],
    lesson_plans: [
      { id: 'lp-1', user_id: 't-1', type: 'lesson_plan', topic: 'Adding fractions', grade: '4', subject: 'Maths', content: { plan_text: PLAN }, pdf_url: null, created_at: '2026-09-30T08:00:00Z' },
    ],
    coaching_sessions: [{
      id: 'obs-1', user_id: 't-1', observer_user_id: 'coach-1', observation_type: 'leader_observation', status: 'transcription_complete',
      transcript_text: STAMPED, transcript_language: 'en', audio_duration_seconds: 240,
      linked_lesson_plan_id: null, lesson_plan_link_method: null, lesson_plan_text: null,
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
  mockExtractorFails = false;
  process.env.LP_FIDELITY_ENABLED = 'true';
  seed();
});
afterAll(() => { process.env = savedEnv; });

describe('Section B in the analysis of an observation', () => {
  test('a linked plan is graded and persisted as lp_fidelity + section_b; still no reflective corpus', async () => {
    seed({ linked_lesson_plan_id: 'lp-1', lesson_plan_link_method: 'selected_recent' });
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    const data = obs().analysis_data;
    expect(data.lp_fidelity).toMatchObject({ status: 'ok', source: 'linked', lesson_plan_id: 'lp-1' });
    expect(data.section_b).toEqual({ status: 'assessed', reason: null, mismatch: false });
    expect(obs().status).toBe('analysis_complete');
    expect(mockGpt.extractReflectiveCorpus).not.toHaveBeenCalled();
    expect(mockDraft.onAnalysisReady).toHaveBeenCalledWith('obs-1', FROM);
  });

  test('the open plan question is waited on, and the plan picked meanwhile is the one graded', async () => {
    await Plan.maybeAskForPlan(COACH, FROM, 'obs-1');
    setTimeout(() => { Plan.handlePlanPick(COACH, FROM, 'observe_lp_obs-1_0'); }, 50);
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    expect(obs().analysis_data.lp_fidelity).toMatchObject({ status: 'ok', lesson_plan_id: 'lp-1' });
    expect(obs().analysis_data.section_b.status).toBe('assessed');
  });

  test('a stampless transcript: no model call, Section B not assessed for no_timings', async () => {
    seed({ linked_lesson_plan_id: 'lp-1', lesson_plan_link_method: 'selected_recent', transcript_text: 'Teacher: fold the strip into five. One question each before you go.' });
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    expect(mockLlmCalls).toHaveLength(0);
    expect(obs().analysis_data.section_b).toEqual({ status: 'not_assessed', reason: 'no_timings' });
  });

  test('the coach said there was no plan: not assessed, and why', async () => {
    seed({ lesson_plan_link_method: 'none' });
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    expect(obs().analysis_data.section_b).toEqual({ status: 'not_assessed', reason: 'no_plan', detail: 'coach_said_no_plan' });
    expect(mockLlmCalls).toHaveLength(0);
  });

  test('the teacher is not known: not assessed, teacher_unknown', async () => {
    seed({ user_id: 'coach-1' });
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    expect(obs().analysis_data.section_b).toEqual({ status: 'not_assessed', reason: 'no_plan', detail: 'teacher_unknown' });
  });

  test('a fidelity failure never fails the job: the grader state is kept', async () => {
    mockExtractorFails = true;
    seed({ linked_lesson_plan_id: 'lp-1', lesson_plan_link_method: 'selected_recent' });
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    expect(obs().status).toBe('analysis_complete');
    expect(obs().analysis_data.section_b).toEqual({ status: 'not_assessed', reason: 'grader_failed' });
    expect(mockDraft.onAnalysisReady).toHaveBeenCalled();
  });

  test('fidelity off: an observation behaves exactly as before (no section_b, no plan graded)', async () => {
    delete process.env.LP_FIDELITY_ENABLED;
    seed({ linked_lesson_plan_id: 'lp-1', lesson_plan_link_method: 'selected_recent' });
    await AnalysisProcessor.processAnalysis('obs-1', { from: FROM });
    expect(obs().analysis_data).toEqual({ domains: {}, summary: 'ok' });
    expect(mockLlmCalls).toHaveLength(0);
  });
});
