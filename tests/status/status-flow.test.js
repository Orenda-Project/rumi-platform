/**
 * Status flow — teacher-state.service (active-resource listing + cancel +
 * id parsing) and the status-flow-endpoint INIT / data_exchange / BACK
 * handlers. Bot-only deps (supabase, redis, logger, quiz-orchestrator) mocked
 * for the root-before-bot-ci test ordering.
 */

const fs = require('fs');
const path = require('path');

// A supabase chain whose terminal/await resolves to `result`.
function chainResolving(result) {
  const chain = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'not', 'gte', 'order', 'limit']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.single = jest.fn().mockResolvedValue(result);
  chain.then = (resolve) => resolve(result);
  return chain;
}

// ── teacher-state.service ─────────────────────────────────────────────────────
describe('teacher-state.service', () => {
  function load({ tableResults = {}, redisAvailable = true, redisStore = {}, cancelQuiz } = {}) {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

    const supabaseFrom = jest.fn((t) => chainResolving(tableResults[t] || { data: [], error: null }));
    const updateSpy = jest.fn(() => chainResolving({ data: null, error: null }));
    jest.doMock('../../bot/shared/config/supabase', () => ({
      from: jest.fn((t) => {
        const chain = chainResolving(tableResults[t] || { data: [], error: null });
        chain.update = updateSpy;
        return chain;
      }),
    }));

    const delSpy = jest.fn().mockResolvedValue(1);
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
      isAvailable: () => redisAvailable,
      redis: {
        get: jest.fn((k) => Promise.resolve(redisStore[k] || null)),
        del: delSpy,
      },
    }));

    const cancelQuizSpy = cancelQuiz || jest.fn().mockResolvedValue(true);
    jest.doMock('../../bot/shared/services/quiz/quiz-orchestrator.service', () => ({ cancelQuiz: cancelQuizSpy }));

    const svc = require('../../bot/shared/services/teacher-state.service');
    return { svc, supabaseFrom, updateSpy, delSpy, cancelQuizSpy };
  }

  describe('parseResourceId', () => {
    it('parses done / quiz-with-uuid / bare-kind / unknown', () => {
      const { svc } = load();
      expect(svc.parseResourceId('done')).toEqual({ kind: 'done' });
      expect(svc.parseResourceId('cancel_quiz_abc-123')).toEqual({ kind: 'quiz', refId: 'abc-123' });
      expect(svc.parseResourceId('cancel_lp_xyz')).toEqual({ kind: 'lesson_plan', refId: 'xyz' });
      expect(svc.parseResourceId('cancel_video')).toEqual({ kind: 'video', refId: null });
      expect(svc.parseResourceId('garbage')).toEqual({ kind: 'unknown' });
      expect(svc.parseResourceId('')).toEqual({ kind: 'unknown' });
    });
  });

  describe('listActiveResources', () => {
    it('returns [] for a falsy userId', async () => {
      const { svc } = load();
      expect(await svc.listActiveResources(null)).toEqual([]);
    });

    it('lists an active quiz (skipping all-terminal ones), coaching, LP, and redis flows', async () => {
      const { svc } = load({
        tableResults: {
          quizzes: { data: [{ id: 'q1', topic: 'Fractions', list_id: 'l1', student_lists: { class_name: '5', section: 'A' } }] },
          quiz_sessions: { data: [{ status: 'sent' }] }, // not all terminal → keep
          coaching_sessions: { data: [{ id: 'c1', status: 'analyzing', created_at: new Date().toISOString() }] },
          lesson_plan_requests: { data: [{ id: 'lp1', topic: 'Atoms', status: 'processing', created_at: new Date().toISOString() }] },
        },
        redisStore: { 'user:u1:awaiting_video_topic': '1', 'reading:user:u1:current_assessment': '1' },
      });
      const items = await svc.listActiveResources('u1');
      const kinds = items.map(i => i.kind);
      expect(kinds).toEqual(expect.arrayContaining(['quiz', 'coaching', 'lesson_plan', 'video', 'reading']));
      const quiz = items.find(i => i.kind === 'quiz');
      expect(quiz.id).toBe('cancel_quiz_q1');
      expect(quiz.title).toContain('5-A');
    });

    it('skips a quiz whose every session is terminal', async () => {
      const { svc } = load({
        tableResults: {
          quizzes: { data: [{ id: 'q1', topic: 'X', student_lists: null }] },
          quiz_sessions: { data: [{ status: 'completed' }, { status: 'expired' }] },
        },
      });
      const items = await svc.listActiveResources('u1');
      expect(items.find(i => i.kind === 'quiz')).toBeUndefined();
    });
  });

  describe('cancelResource', () => {
    it('cancels a quiz via the orchestrator', async () => {
      const { svc, cancelQuizSpy } = load();
      const res = await svc.cancelResource({ kind: 'quiz', refId: 'q1' }, 'u1');
      expect(res.ok).toBe(true);
      expect(cancelQuizSpy).toHaveBeenCalledWith('q1', 'u1');
    });

    it('cancels coaching + LP via supabase update', async () => {
      const { svc, updateSpy } = load();
      const c = await svc.cancelResource({ kind: 'coaching', refId: 'c1' }, 'u1');
      const lp = await svc.cancelResource({ kind: 'lesson_plan', refId: 'lp1' }, 'u1');
      expect(c.ok).toBe(true);
      expect(lp.ok).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({ status: 'cancelled' });
    });

    it('cancels redis-backed flows via del', async () => {
      const { svc, delSpy } = load();
      expect((await svc.cancelResource({ kind: 'video' }, 'u1')).ok).toBe(true);
      expect((await svc.cancelResource({ kind: 'reading' }, 'u1')).ok).toBe(true);
      expect((await svc.cancelResource({ kind: 'attendance' }, 'u1')).ok).toBe(true);
      expect(delSpy).toHaveBeenCalled();
    });

    it('rejects an invalid resource', async () => {
      const { svc } = load();
      expect((await svc.cancelResource(null, 'u1')).ok).toBe(false);
      expect((await svc.cancelResource({ kind: 'bogus' }, 'u1')).ok).toBe(false);
    });
  });
});

// ── status-flow-endpoint ──────────────────────────────────────────────────────
describe('status-flow-endpoint', () => {
  function load({ items = [], cancelResult } = {}) {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const listMock = jest.fn().mockResolvedValue(items);
    const cancelMock = jest.fn().mockResolvedValue(cancelResult || { ok: true, message: '🛑 stopped' });
    const parseMock = jest.fn((id) => {
      if (id === 'done') return { kind: 'done' };
      const m = id.match(/^cancel_(quiz|coaching|lp|video|reading|attendance)/);
      return m ? { kind: 'quiz' } : { kind: 'unknown' };
    });
    jest.doMock('../../bot/shared/services/teacher-state.service', () => ({
      listActiveResources: listMock,
      cancelResource: cancelMock,
      parseResourceId: parseMock,
    }));
    const ep = require('../../bot/shared/routes/status-flow-endpoint');
    return { ep, listMock, cancelMock };
  }

  it('INIT with no active resources returns a polite SUCCESS', async () => {
    const { ep } = load({ items: [] });
    const res = await ep.handleStatusFlowInit('u1');
    expect(res.screen).toBe('SUCCESS');
    expect(res.data.extension_message_response.params.status_action).toBe('idle');
  });

  it('INIT with active resources returns MAIN with a Done row appended', async () => {
    const { ep } = load({ items: [{ id: 'cancel_video', title: 'Video generation', kind: 'video' }] });
    const res = await ep.handleStatusFlowInit('u1');
    expect(res.screen).toBe('MAIN');
    expect(res.data.resources.map(r => r.id)).toContain('done');
    expect(res.data.summary_heading).toContain('1 thing');
  });

  it('data_exchange MAIN with "done" returns SUCCESS', async () => {
    const { ep } = load({ items: [] });
    const res = await ep.handleStatusFlowDataExchange('u1', 'MAIN', { _action: 'done' });
    expect(res.screen).toBe('SUCCESS');
  });

  it('data_exchange MAIN with a resource id returns CONFIRM_CANCEL carrying the label', async () => {
    const { ep } = load({ items: [{ id: 'cancel_video', title: 'Video generation', kind: 'video' }] });
    const res = await ep.handleStatusFlowDataExchange('u1', 'MAIN', { _action: 'cancel_video' });
    expect(res.screen).toBe('CONFIRM_CANCEL');
    expect(res.data.resource_id).toBe('cancel_video');
    expect(res.data.resource_label).toBe('Video generation');
  });

  it('data_exchange MAIN with no action errors', async () => {
    const { ep } = load();
    const res = await ep.handleStatusFlowDataExchange('u1', 'MAIN', {});
    expect(res.data.error).toBeDefined();
  });

  it('data_exchange CONFIRM_CANCEL cancels the matched resource', async () => {
    const { ep, cancelMock } = load({
      items: [{ id: 'cancel_video', title: 'Video generation', kind: 'video' }],
      cancelResult: { ok: true, message: '🛑 Video flow stopped on our end.' },
    });
    const res = await ep.handleStatusFlowDataExchange('u1', 'CONFIRM_CANCEL', { resource_id: 'cancel_video' });
    expect(res.screen).toBe('SUCCESS');
    expect(res.data.extension_message_response.params.status_action).toBe('cancelled');
    expect(cancelMock).toHaveBeenCalled();
  });

  it('data_exchange CONFIRM_CANCEL on a vanished resource returns a noop SUCCESS', async () => {
    const { ep } = load({ items: [] });
    const res = await ep.handleStatusFlowDataExchange('u1', 'CONFIRM_CANCEL', { resource_id: 'cancel_video' });
    expect(res.screen).toBe('SUCCESS');
    expect(res.data.extension_message_response.params.status_action).toBe('noop');
  });

  it('BACK returns the MAIN init payload', async () => {
    const { ep } = load({ items: [{ id: 'cancel_video', title: 'Video generation', kind: 'video' }] });
    const res = await ep.handleStatusFlowBack('u1', 'SUCCESS');
    expect(res.screen).toBe('MAIN');
  });
});

// ── flow JSON + leak gate ─────────────────────────────────────────────────────
describe('status-flow.json', () => {
  const flowPath = path.join(__dirname, '../../docs/flows/status-flow.json');

  it('is valid JSON with forward-only MAIN → CONFIRM_CANCEL → SUCCESS routing', () => {
    const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    expect(flow.routing_model.MAIN).toEqual(['CONFIRM_CANCEL', 'SUCCESS']);
    expect(flow.routing_model.CONFIRM_CANCEL).toEqual(['SUCCESS']);
    expect(flow.screens.map(s => s.id).sort()).toEqual(['CONFIRM_CANCEL', 'MAIN', 'SUCCESS']);
  });

  it('is leak-free (no internal phone/name/path/bead tokens)', () => {
    const raw = fs.readFileSync(flowPath, 'utf8');
    const svcSrc = fs.readFileSync(path.join(__dirname, '../../bot/shared/services/teacher-state.service.js'), 'utf8');
    const epSrc = fs.readFileSync(path.join(__dirname, '../../bot/shared/routes/status-flow-endpoint.js'), 'utf8');
    for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub', 'bd-', 'PROJ-', 'Silverleaf']) {
      expect(raw).not.toContain(banned);
      expect(svcSrc).not.toContain(banned);
      expect(epSrc).not.toContain(banned);
    }
  });
});
