/**
 * S1 — the AI's draft and the coach's edit.
 *
 * onAnalysisReady freezes the AI's first pass (v1) exactly once, moves the
 * observation to review, and sends the COACH the pre-filled ratings: as the
 * editable WhatsApp Flow on Meta when one is published, and otherwise as a
 * stepwise chat form — one domain per message, the coach replies "ok" or
 * "<indicator number> <new rating>". That chat form is the same on Matrix,
 * Slack, Discord and Baileys. When the last domain is done the edits are
 * merged into v2 (scores recomputed, the v1→v2 diff recorded) and the debrief
 * step is offered.
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
const ObserveDraft = require('../../bot/shared/services/observe/observe-draft.service');
const ObserveForm = require('../../bot/shared/services/observe/observe-form.service');
const { handleObserveText } = require('../../bot/shared/handlers/observe-command.handler');
const { handleObserveInteractive } = require('../../bot/shared/handlers/observe-interactive.handler');

const COACH = { id: 'coach-1', role: 'coach', preferred_language: 'en' };
const TO = 'mtx:15550100001';
const lastText = () => WhatsAppService.sendMessage.mock.calls[WhatsAppService.sendMessage.mock.calls.length - 1][1];
const row = (id) => mockDb.tables.coaching_sessions.find((s) => s.id === id);

function seed(id, over = {}) {
  mockDb.tables.coaching_sessions.push({
    id, user_id: 't-1', observer_user_id: 'coach-1', observation_type: 'leader_observation',
    status: 'analysis_complete', debrief_status: 'pending', analysis_data: teachAnalysis(3), autofill_analysis_data: null, ...over,
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

describe('onAnalysisReady', () => {
  test('freezes v1 once, moves to review, arms awaiting_form and sends the first domain to the COACH', async () => {
    seed('obs-1');
    await ObserveDraft.onAnalysisReady('obs-1', 'job-from-ignored');
    expect(row('obs-1').status).toBe('awaiting_observer_review');
    expect(row('obs-1').autofill_analysis_data.scores.overall_marks).toBe(30);
    const st = await ObserveState.getState('coach-1');
    expect(st).toMatchObject({ state: 'awaiting_form', sessionId: 'obs-1', domainIndex: 0 });
    const [to, text] = WhatsAppService.sendMessage.mock.calls[0];
    expect(to).toBe(TO);   // derived from the session row, never the job's `from`
    expect(text).toMatch(/Time on Task/);
    expect(text).toMatch(/1 of 4/);
    expect(text).toMatch(/what do you notice/);
    expect(text).toMatch(/Reply \*ok\*/);
    expect(WhatsAppService.sendFlow).not.toHaveBeenCalled();
  });

  test('a plan picked after the analysis read it is reconciled before the form is sent (Section B graded against it)', async () => {
    const Plan = require('../../bot/shared/services/observe/observe-plan.service');
    const spy = jest.spyOn(Plan, 'reconcileLatePick').mockResolvedValue(false);
    seed('obs-r');
    await ObserveDraft.onAnalysisReady('obs-r', TO);
    expect(spy).toHaveBeenCalledWith('obs-r', { from: TO, lang: 'en' });
    expect(spy.mock.invocationCallOrder[0]).toBeLessThan(WhatsAppService.sendMessage.mock.invocationCallOrder[0]);
    spy.mockRestore();
  });

  test('a v1 already frozen is never overwritten', async () => {
    seed('obs-2', { autofill_analysis_data: { frozen: true } });
    await ObserveDraft.onAnalysisReady('obs-2', TO);
    expect(row('obs-2').autofill_analysis_data).toEqual({ frozen: true });
  });

  test('an observation cancelled while the analysis ran is not re-armed', async () => {
    seed('obs-3', { status: 'cancelled' });
    await ObserveDraft.onAnalysisReady('obs-3', TO);
    expect(row('obs-3').status).toBe('cancelled');
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  test('a coach mid-debrief keeps that state; the form still arrives', async () => {
    seed('obs-4');
    await ObserveState.setState('coach-1', 'awaiting_debrief_audio', { sessionId: 'other' });
    await ObserveDraft.onAnalysisReady('obs-4', TO);
    expect((await ObserveState.getState('coach-1')).state).toBe('awaiting_debrief_audio');
  });

  test('on Meta with a published Flow, the Flow is sent; if it fails, the chat form is the fallback', async () => {
    process.env.OBSERVE_FORM_FLOW_ID = '123';
    process.env.CHANNEL_DRIVER = 'meta';
    mockDb.tables.users[0].phone_number = '15550100001';
    seed('obs-5');
    await ObserveDraft.onAnalysisReady('obs-5', '15550100001');
    expect(WhatsAppService.sendFlow).toHaveBeenCalledWith('15550100001', expect.objectContaining({ flowId: '123', flowToken: 'coach-1:obs-5' }));
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();

    WhatsAppService.sendFlow.mockResolvedValueOnce(false);
    seed('obs-6');
    await ObserveDraft.onAnalysisReady('obs-6', '15550100001');
    expect(lastText()).toMatch(/Time on Task/);
    mockDb.tables.users[0].phone_number = TO;
    delete process.env.CHANNEL_DRIVER;
  });

  test('a Flow id never reaches a non-Meta identity (Matrix gets the chat form)', async () => {
    process.env.OBSERVE_FORM_FLOW_ID = '123';
    process.env.CHANNEL_DRIVER = 'meta';
    seed('obs-7');
    await ObserveDraft.onAnalysisReady('obs-7', TO);
    expect(WhatsAppService.sendFlow).not.toHaveBeenCalled();
    expect(lastText()).toMatch(/Time on Task/);
    delete process.env.CHANNEL_DRIVER;
  });
});

describe('the stepwise chat form', () => {
  async function openForm(id) {
    seed(id);
    await ObserveDraft.onAnalysisReady(id, TO);
  }

  test('ok walks the domains; edits are applied; the last ok merges v2 and offers the debrief', async () => {
    await openForm('obs-10');
    expect(await handleObserveText(COACH, TO, 'ok')).toBe(true);           // time on task kept
    expect(lastText()).toMatch(/Classroom Culture/);
    expect(lastText()).toMatch(/2 of 4/);
    expect(await handleObserveText(COACH, TO, '2 5')).toBe(true);           // indicator 2 → 5
    expect(lastText()).toMatch(/Positive Behavioral Expectations.*5/s);
    await handleObserveText(COACH, TO, 'OK');
    expect(lastText()).toMatch(/Instruction/);
    await handleObserveText(COACH, TO, '1 2, 4 4');                         // two edits in one reply
    await handleObserveText(COACH, TO, 'ok');
    expect(lastText()).toMatch(/Socioemotional/);
    await handleObserveText(COACH, TO, 'ok');

    const s = row('obs-10');
    expect(s.status).toBe('observer_review_complete');
    expect(s.autofill_analysis_data.scores.overall_marks).toBe(30);        // v1 untouched
    expect(s.analysis_data.scores.overall_marks).toBe(30 + 2 - 1 + 1);     // v2 recomputed
    expect(s.analysis_data.observer_edit_summary).toMatchObject({ indicators_rescored: 3 });
    expect(s.analysis_data.areas.instruction.elements[0].holistic_score).toBe(2);
    expect(await ObserveState.getState('coach-1')).toBeNull();
    expect(WhatsAppService.sendMessage.mock.calls.map((c) => c[1]).join('\n')).toMatch(/saved, with your edits/);
    expect(mockDebrief.offerDebriefChoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'coach-1' }), TO, 'obs-10');
  });

  test('an invalid rating or indicator is explained and changes nothing', async () => {
    await openForm('obs-11');
    await handleObserveText(COACH, TO, 'ok');
    await handleObserveText(COACH, TO, '2 9');
    expect(lastText()).toMatch(/1 to 5/);
    await handleObserveText(COACH, TO, '7 3');
    expect(lastText()).toMatch(/1 to 2/);
    expect((await ObserveState.getState('coach-1')).edits).toEqual({});
  });

  test('chat that is not an answer, and slash commands, are left to normal handling', async () => {
    await openForm('obs-12');
    expect(await handleObserveText(COACH, TO, '/menu')).toBe(false);
    expect(await handleObserveText(COACH, TO, 'what time is it in the staffroom?')).toBe(false);
    expect((await ObserveState.getState('coach-1')).state).toBe('awaiting_form');
  });

  test('a teacher who types "ok" is never routed into anyone\'s form', async () => {
    await openForm('obs-13');
    expect(await handleObserveText({ id: 't-1', role: null }, 'mtx:15550100002', 'ok')).toBe(false);
  });

  test('observe_form_<id> reopens the form for its owner (the pending-list resume)', async () => {
    seed('obs-14', { status: 'awaiting_observer_review', autofill_analysis_data: teachAnalysis(3) });
    expect(await handleObserveInteractive(COACH, TO, 'observe_form_obs-14')).toBe(true);
    expect(lastText()).toMatch(/Time on Task/);
    expect((await ObserveState.getState('coach-1')).sessionId).toBe('obs-14');
    expect(await handleObserveInteractive({ id: 'coach-9', role: 'coach' }, 'mtx:15550100009', 'observe_form_obs-14')).toBe(true);
    expect(lastText()).toMatch(/isn't yours/);
  });

  test('a chat form finished after the ratings were already saved elsewhere changes nothing', async () => {
    await openForm('obs-16');
    row('obs-16').status = 'observer_review_complete';   // e.g. the Meta form submitted meanwhile
    const before = JSON.stringify(row('obs-16').analysis_data);
    await handleObserveText(COACH, TO, '1 1');
    for (let i = 0; i < 4; i += 1) await handleObserveText(COACH, TO, 'ok');
    expect(JSON.stringify(row('obs-16').analysis_data)).toBe(before);
    expect(lastText()).toMatch(/already saved/);
    expect(mockDebrief.offerDebriefChoice).not.toHaveBeenCalled();
  });

  test('a form submitted after the observation was cancelled is refused', async () => {
    await openForm('obs-15');
    row('obs-15').status = 'cancelled';
    for (let i = 0; i < 4; i += 1) await handleObserveText(COACH, TO, 'ok');
    expect(row('obs-15').status).toBe('cancelled');
    expect(lastText()).toMatch(/cancelled/);
    expect(mockDebrief.offerDebriefChoice).not.toHaveBeenCalled();
  });
});

describe('applyObserverEdits', () => {
  test('clamps to the pack scale and keeps a debrief the worker merged meanwhile', async () => {
    seed('obs-20', { status: 'awaiting_observer_review', autofill_analysis_data: teachAnalysis(3) });
    row('obs-20').analysis_data.observer_debrief = { feedback: 'kept' };
    const summary = await ObserveDraft.applyObserverEdits('obs-20', { r_T: '9' });
    expect(summary.indicators_rescored).toBe(1);
    expect(row('obs-20').analysis_data.domains.time_on_task.indicators[0].score).toBe(5);
    expect(row('obs-20').analysis_data.observer_debrief).toEqual({ feedback: 'kept' });
  });

  test('edits are accepted only while the observation is in review', async () => {
    for (const [id, status] of [['obs-22', 'observer_review_complete'], ['obs-23', 'completed'], ['obs-24', 'analyzing']]) {
      seed(id, { status, autofill_analysis_data: teachAnalysis(3) });
      const before = JSON.stringify(row(id).analysis_data);
      expect(await ObserveDraft.applyObserverEdits(id, { r_T: '1' })).toEqual({ refused: 'not_in_review' });
      expect(row(id).status).toBe(status);
      expect(JSON.stringify(row(id).analysis_data)).toBe(before);
    }
    seed('obs-25', { status: 'cancelled', autofill_analysis_data: teachAnalysis(3) });
    expect(await ObserveDraft.applyObserverEdits('obs-25', { r_T: '1' })).toEqual({ refused: 'terminal' });
  });

  test('the write itself is conditional: a row finished after the read is never rewritten', async () => {
    seed('obs-26', { status: 'awaiting_observer_review', autofill_analysis_data: teachAnalysis(3) });
    const before = JSON.stringify(row('obs-26').analysis_data);
    // The coach's other submit lands between this call's read and its write.
    const origFrom = mockDb.client.from;
    let reads = 0;
    mockDb.client.from = (name) => {
      const b = origFrom(name);
      if (name === 'coaching_sessions' && (reads += 1) === 1) {
        const origThen = b.then;
        b.then = (res, rej) => origThen.call(b, (v) => { row('obs-26').status = 'completed'; return res(v); }, rej);
      }
      return b;
    };
    try {
      expect(await ObserveDraft.applyObserverEdits('obs-26', { r_T: '1' })).toEqual({ refused: 'not_in_review' });
    } finally {
      mockDb.client.from = origFrom;
    }
    expect(row('obs-26').status).toBe('completed');
    expect(JSON.stringify(row('obs-26').analysis_data)).toBe(before);
  });

  test('MEWAKA ids with dots are addressed by their underscore form', async () => {
    process.env.OBSERVE_FRAMEWORK = 'mewaka';
    const pack = getObservePack();
    const analysis = { domains: {} };
    for (const d of pack.domainOrder) analysis.domains[d] = { indicators: pack.domains[d].indicators.map((i) => ({ id: i.id, score: 2 })) };
    pack.computeScores(analysis);
    seed('obs-21', { status: 'awaiting_observer_review', analysis_data: analysis, autofill_analysis_data: JSON.parse(JSON.stringify(analysis)) });
    await ObserveDraft.applyObserverEdits('obs-21', { r_A1_1: '3' });
    expect(row('obs-21').analysis_data.domains.introduction.indicators[0].score).toBe(3);
  });
});
