/**
 * quiz-job-handler — SQS-side quiz job handlers (cancel-flag, idempotency,
 * cascade re-queue, fire). All deps mocked; no network/DB.
 */

let redis, supabaseTables, sqsQueue, quizReport, whatsapp, handler;

function makeSupabase() {
  // Per-table terminal results, settable per test.
  return {
    from(table) {
      const t = table;
      const builder = {
        _t: t,
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        update() { return builder; },
        single() { return Promise.resolve(supabaseTables[t]?.single ?? { data: null }); },
        maybeSingle() { return Promise.resolve(supabaseTables[t]?.maybeSingle ?? { data: null }); },
        then(resolve) { return resolve(supabaseTables[t]?.list ?? { data: [] }); },
      };
      return builder;
    },
  };
}

function load() {
  jest.resetModules();
  redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
  supabaseTables = {};
  sqsQueue = { queueJob: jest.fn().mockResolvedValue('msg-id') };
  quizReport = { generateReport: jest.fn().mockResolvedValue() };
  whatsapp = { sendMessage: jest.fn().mockResolvedValue({}), sendInteractiveButtons: jest.fn().mockResolvedValue({}) };

  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => makeSupabase(), { virtual: true });
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redis);
  jest.doMock('../../bot/shared/services/queue/sqs-queue.service', () => sqsQueue);
  jest.doMock('../../bot/shared/services/quiz/quiz-report.service', () => quizReport, { virtual: true });
  jest.doMock('../../bot/shared/services/whatsapp.service', () => whatsapp, { virtual: true });
  handler = require('../../bot/workers/quiz-job-handler');
  return handler;
}

afterEach(() => jest.resetModules());

describe('handleQuizReport', () => {
  it('skips when the cancel flag is set', async () => {
    const h = load();
    redis.get.mockImplementation((k) => Promise.resolve(k.startsWith('sqs:cancel:') ? '1' : null));
    const r = await h.handleQuizReport({ groupId: 'q1', payload: {} });
    expect(r).toEqual({ skipped: true, reason: 'cancelled' });
    expect(quizReport.generateReport).not.toHaveBeenCalled();
  });

  it('skips when already fired (cascade dedup)', async () => {
    const h = load();
    redis.get.mockImplementation((k) => Promise.resolve(k === 'quiz_report_sent:q1' ? '1' : null));
    const r = await h.handleQuizReport({ groupId: 'q1', payload: {} });
    expect(r.reason).toBe('already_fired');
  });

  it('cascade re-queues when sessions not all final and < 12h old', async () => {
    const h = load();
    supabaseTables.quizzes = { single: { data: { id: 'q1', teacher_id: 't1', created_at: new Date().toISOString(), status: 'sent' } } };
    supabaseTables.quiz_sessions = { list: { data: [{ status: 'in_progress' }] } };
    const r = await h.handleQuizReport({ groupId: 'q1', payload: {} });
    expect(r.reason).toBe('requeued');
    expect(sqsQueue.queueJob).toHaveBeenCalledWith('q1', 'quiz_report', expect.anything(), expect.objectContaining({ delaySeconds: 900 }));
    expect(quizReport.generateReport).not.toHaveBeenCalled();
  });

  it('fires the report when all sessions terminal and payload.teacherPhone is present', async () => {
    const h = load();
    supabaseTables.quizzes = { single: { data: { id: 'q1', teacher_id: 't1', created_at: new Date().toISOString(), status: 'sent' } } };
    supabaseTables.quiz_sessions = { list: { data: [{ status: 'completed' }] } };
    const r = await h.handleQuizReport({ groupId: 'q1', payload: { teacherPhone: '12025550100' } });
    expect(r).toEqual({ ok: true });
    expect(quizReport.generateReport).toHaveBeenCalledTimes(1);
    expect(quizReport.generateReport).toHaveBeenCalledWith('q1', expect.objectContaining({ teacherPhone: '12025550100' }));
    expect(redis.set).toHaveBeenCalledWith('quiz_report_sent:q1', '1', 86400);
  });

  it('fires the report when payload.teacherPhone is a Slack identifier — delivers to the SAME channel the quiz was requested on, never a re-derived WhatsApp number', async () => {
    const h = load();
    supabaseTables.quizzes = { single: { data: { id: 'q1', teacher_id: 't1', created_at: new Date().toISOString(), status: 'sent' } } };
    supabaseTables.quiz_sessions = { list: { data: [{ status: 'completed' }] } };
    // Deliberately leave supabaseTables.users unset/absent — if any fallback
    // to a users.phone_number lookup still existed, this would either throw
    // or silently substitute a different (wrong) channel.
    const r = await h.handleQuizReport({ groupId: 'q1', payload: { teacherPhone: 'slack:U0123ABC' } });
    expect(r).toEqual({ ok: true });
    expect(quizReport.generateReport).toHaveBeenCalledWith('q1', expect.objectContaining({ teacherPhone: 'slack:U0123ABC' }));
  });

  it('does NOT set the sent flag when payload.teacherPhone is absent, and NEVER falls back to a users.phone_number lookup', async () => {
    const h = load();
    supabaseTables.quizzes = { single: { data: { id: 'q1', teacher_id: 't1', created_at: new Date().toISOString(), status: 'sent' } } };
    supabaseTables.quiz_sessions = { list: { data: [{ status: 'completed' }] } };
    // A users row IS present here — if the removed fallback ever regressed
    // back in, this test would start passing on the old (wrong) behavior
    // instead of skipping, which is exactly the bug this guards against.
    supabaseTables.users = { single: { data: { phone_number: '12025550100' } } };
    const r = await h.handleQuizReport({ groupId: 'q1', payload: {} });
    expect(r.reason).toBe('no_teacher_phone');
    expect(redis.set).not.toHaveBeenCalled();
    expect(quizReport.generateReport).not.toHaveBeenCalled();
  });
});

describe('handleQuizExpire', () => {
  it('re-queues while the session is still before expiry', async () => {
    const h = load();
    supabaseTables.quiz_sessions = { maybeSingle: { data: { id: 's1', status: 'in_progress', expires_at: new Date(Date.now() + 5 * 60000).toISOString() } } };
    const r = await h.handleQuizExpire({ groupId: 's1', payload: {} });
    expect(r.reason).toBe('requeued');
    expect(sqsQueue.queueJob).toHaveBeenCalled();
  });

  it('skips when the session is already terminal', async () => {
    const h = load();
    supabaseTables.quiz_sessions = { maybeSingle: { data: { id: 's1', status: 'completed' } } };
    const r = await h.handleQuizExpire({ groupId: 's1', payload: {} });
    expect(r.reason).toBe('already_terminal');
  });
});

describe('handleQuizNudge / handleQuizReminder', () => {
  it('nudge skips on missing payload fields', async () => {
    const h = load();
    const r = await h.handleQuizNudge({ groupId: 'lp1', payload: { topic: 'x' } });
    expect(r.reason).toBe('missing_payload_fields');
  });

  it('reminder sends when payload complete', async () => {
    const h = load();
    const r = await h.handleQuizReminder({ groupId: 's1', payload: { parentPhone: '12025550100', topic: 'Fractions' } });
    expect(r).toEqual({ ok: true });
    expect(whatsapp.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('handleQuizJob dispatcher', () => {
  it('throws on unknown job type', async () => {
    const h = load();
    await expect(h.handleQuizJob('quiz_bogus', { groupId: 'x' })).rejects.toThrow(/Unknown quiz job type/);
  });
});
