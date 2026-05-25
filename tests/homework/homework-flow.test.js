/**
 * Homework flow — lookup service, request endpoint (browse + enqueue), bundle
 * worker (pdf-lib merge + deliver), and the pure trigger helper. Bot-only deps
 * (supabase, pdf-lib, r2, whatsapp, sqs-queue, loggers) mocked for the
 * root-before-bot-ci test ordering.
 */

const fs = require('fs');
const path = require('path');

// Filtering supabase mock (honours .eq/.order, insert→{id}, update, await).
function makeSupabase(datasets) {
  const store = JSON.parse(JSON.stringify(datasets));
  function builder(table) {
    let rows = (store[table] || []).slice();
    const api = {
      select() { return api; },
      eq(k, v) { rows = rows.filter(r => String(r[k]) === String(v)); return api; },
      in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); return api; },
      order() { return api; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: 'no rows' } }); },
      insert(payload) {
        const row = { id: `gen-${(store[table] || []).length + 1}`, ...payload };
        store[table] = store[table] || [];
        store[table].push(row);
        return { select() { return { single: () => Promise.resolve({ data: { id: row.id }, error: null }) }; } };
      },
      update(patch) {
        return { eq(k, v) { (store[table] || []).forEach(r => { if (String(r[k]) === String(v)) Object.assign(r, patch); }); return Promise.resolve({ data: null, error: null }); } };
      },
      then(resolve) { return resolve({ data: rows, error: null }); },
    };
    return api;
  }
  return { from: jest.fn((t) => builder(t)), __store: store };
}

const CHAPTERS = [
  { id: 'h1', grade: 3, subject: 'maths', chapter_number: 1, chapter_title: 'Place Value', lang: 'en', r2_key: 'hw/g3/m/1.pdf', version: 'v7' },
  { id: 'h2', grade: 3, subject: 'maths', chapter_number: 2, chapter_title: 'Addition', lang: 'en', r2_key: 'hw/g3/m/2.pdf', version: 'v7' },
  { id: 'h3', grade: 3, subject: 'maths', chapter_number: 3, chapter_title: 'Subtraction', lang: 'en', r2_key: 'hw/g3/m/3.pdf', version: 'v7' },
];

// ── lookup service ────────────────────────────────────────────────────────
describe('homework-lookup.service', () => {
  function load(chapters = CHAPTERS) {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/config/supabase', () => makeSupabase({ homework_chapters: chapters }));
    return require('../../bot/shared/services/homework-lookup.service');
  }

  it('findHomeworkChapters returns the grade/subject/version rows', async () => {
    const svc = load();
    const rows = await svc.findHomeworkChapters({ grade: 3, subject: 'maths' });
    expect(rows.map(r => r.chapter_number)).toEqual([1, 2, 3]);
  });

  it('resolveSelection dedups + orders chapters and drops unknown ones', async () => {
    const svc = load();
    const resolved = await svc.resolveSelection([{ grade: 3, subject: 'maths', chapters: [3, 1, 1, 99] }]);
    expect(resolved.map(r => r.chapter)).toEqual([1, 3]); // 99 dropped, dedup, ascending
    expect(resolved[0].r2_key).toBe('hw/g3/m/1.pdf');
  });

  it('resolveSelection returns [] for empty input', async () => {
    const svc = load();
    expect(await svc.resolveSelection([])).toEqual([]);
  });
});

// ── request endpoint ──────────────────────────────────────────────────────
describe('homework-request-endpoint', () => {
  let ep, supa, queueSpy;

  function load(chapters = CHAPTERS) {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
    supa = makeSupabase({
      homework_chapters: chapters,
      users: [{ id: 'u1', phone_number: '15551230000' }],
      lesson_plan_requests: [],
    });
    jest.doMock('../../bot/shared/config/supabase', () => supa);
    queueSpy = jest.fn().mockResolvedValue(true);
    jest.doMock('../../bot/shared/services/queue/sqs-queue.service', () => ({ queueJob: queueSpy }));
    ep = require('../../bot/shared/routes/homework-request-endpoint');
  }

  it('INIT returns grade + subject options', async () => {
    load();
    const res = await ep.handleHomeworkInit('u1:homework:1');
    expect(res.screen).toBe('SELECT_GRADE');
    expect(res.data.grades.length).toBeGreaterThan(0);
    expect(res.data.subjects.map(s => s.id)).toContain('maths');
  });

  it('SELECT_GRADE returns the chapter checklist', async () => {
    load();
    const res = await ep.handleHomeworkDataExchange('u1:homework:1', 'SELECT_GRADE', { grade: '3', subject: 'maths' });
    expect(res.screen).toBe('SELECT_CHAPTERS');
    expect(res.data.chapters.map(c => c.id)).toEqual(['1', '2', '3']);
  });

  it('SELECT_GRADE with no chapters returns an error', async () => {
    load();
    const res = await ep.handleHomeworkDataExchange('u1:homework:1', 'SELECT_GRADE', { grade: '9', subject: 'maths' });
    expect(res.data.error).toBeDefined();
  });

  it('SELECT_CHAPTERS enqueues a bundle job per group + returns SUCCESS', async () => {
    load();
    const res = await ep.handleHomeworkDataExchange('u1:homework:1', 'SELECT_CHAPTERS', { grade: '3', subject: 'maths', chapters: [1, 2] });
    expect(res.screen).toBe('SUCCESS');
    expect(queueSpy).toHaveBeenCalledTimes(1);
    const [groupId, jobType, payload] = queueSpy.mock.calls[0];
    expect(groupId).toBe('u1');
    expect(jobType).toBe('homework_bundle_generation');
    expect(payload.chapters.map(c => c.chapter)).toEqual([1, 2]);
    expect(payload.isLastGroup).toBe(true);
  });

  it('SELECT_CHAPTERS with no selection errors', async () => {
    load();
    const res = await ep.handleHomeworkDataExchange('u1:homework:1', 'SELECT_CHAPTERS', { grade: '3', subject: 'maths', chapters: [] });
    expect(res.data.error).toBeDefined();
    expect(queueSpy).not.toHaveBeenCalled();
  });
});

// ── bundle worker ─────────────────────────────────────────────────────────
describe('homework-bundle.worker', () => {
  let worker, supa, sendDocSpy, downloadSpy;

  function load({ chapters, downloadImpl } = {}) {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
    // pdf-lib is a bot-only dep — mock it (CI runs root tests before bot npm ci).
    let pageCounter = 0;
    jest.doMock('pdf-lib', () => ({
      PDFDocument: {
        create: async () => ({
          copyPages: async (src, idxs) => idxs.map(() => ({})),
          addPage: () => { pageCounter += 1; },
          save: async () => new Uint8Array([1, 2, 3]),
        }),
        load: async () => ({ getPageIndices: () => [0] }),
      },
    }), { virtual: true });
    downloadSpy = jest.fn(downloadImpl || (() => Promise.resolve(Buffer.from('pdf'))));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: downloadSpy }));
    supa = makeSupabase({
      users: [{ id: 'u1', phone_number: '15551230000', preferred_language: 'en' }],
      lesson_plans: [],
      lesson_plan_requests: [{ id: 'req1', status: 'pending' }],
    });
    jest.doMock('../../bot/shared/config/supabase', () => supa);
    sendDocSpy = jest.fn().mockResolvedValue(true);
    jest.doMock('../../bot/shared/services/whatsapp.service', () => ({ sendDocument: sendDocSpy }));
    worker = require('../../bot/workers/homework-bundle.worker');
  }

  it('makeFilename + caption are readable and filesystem-safe', () => {
    load();
    expect(worker.makeFilename({ grade: 3, subject: 'maths', chapterNumbers: [1, 2] }))
      .toBe('Homework - Grade 3 Maths (Ch 1, 2).pdf');
    expect(worker.localizedDeliveryCaption({ grade: 3, subject: 'maths', chapterNumbers: [1], language: 'en' }))
      .toContain('Homework');
  });

  it('process merges, delivers, inserts a lesson_plans row, marks request completed', async () => {
    load();
    const res = await worker.process({
      userId: 'u1', phone: '15551230000', requestId: 'req1', grade: 3, subject: 'maths',
      chapters: [{ chapter: 1, chapter_title: 'Place Value', r2_key: 'k1' }, { chapter: 2, chapter_title: 'Addition', r2_key: 'k2' }],
      isLastGroup: true,
    });
    expect(res.success).toBe(true);
    expect(sendDocSpy).toHaveBeenCalled();
    expect(supa.__store.lesson_plans.length).toBe(1);
    expect(supa.__store.lesson_plan_requests[0].status).toBe('completed');
  });

  it('process soft-fails when every chapter download fails', async () => {
    load({ downloadImpl: () => Promise.reject(new Error('404')) });
    const res = await worker.process({
      userId: 'u1', phone: '15551230000', requestId: 'req1', grade: 3, subject: 'maths',
      chapters: [{ chapter: 1, r2_key: 'k1' }], isLastGroup: true,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('all_chapters_missing');
    expect(supa.__store.lesson_plan_requests[0].status).toBe('failed');
    expect(sendDocSpy).not.toHaveBeenCalled();
  });

  it('process returns no_phone when phone is missing', async () => {
    load();
    const res = await worker.process({ userId: 'u1', grade: 3, subject: 'maths', chapters: [] });
    expect(res.success).toBe(false);
    expect(res.error).toBe('no_phone');
  });
});

// ── trigger helper ─────────────────────────────────────────────────────────
describe('evaluateHomeworkTrigger', () => {
  const { evaluateHomeworkTrigger } = require('../../bot/shared/handlers/homework-trigger');

  it('matches the homework keywords (anchored)', () => {
    for (const m of ['homework', 'home work', 'hw', '/homework', 'HOMEWORK']) {
      expect(evaluateHomeworkTrigger({ messageBody: m, user: { id: 'u' }, homeworkFlowId: 'F' }).match).toBe(true);
    }
  });

  it('does NOT match substrings (no collision with LP trigger)', () => {
    expect(evaluateHomeworkTrigger({ messageBody: 'lesson plan for homework', user: { id: 'u' }, homeworkFlowId: 'F' }).match).toBe(false);
  });

  it('send_flow only when flow id + user present, else guard', () => {
    expect(evaluateHomeworkTrigger({ messageBody: 'homework', user: { id: 'u' }, homeworkFlowId: 'F' }).action).toBe('send_flow');
    expect(evaluateHomeworkTrigger({ messageBody: 'homework', user: { id: 'u' }, homeworkFlowId: '' }).action).toBe('guard');
    expect(evaluateHomeworkTrigger({ messageBody: 'homework', user: null, homeworkFlowId: 'F' }).action).toBe('guard');
  });
});

// ── flow JSON + leak gate ─────────────────────────────────────────────────────
describe('homework-request-flow.json', () => {
  const flowPath = path.join(__dirname, '../../docs/flows/homework-request-flow.json');

  it('is valid JSON with grade → chapters → success routing', () => {
    const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    expect(flow.routing_model.SELECT_GRADE).toEqual(['SELECT_CHAPTERS']);
    expect(flow.routing_model.SELECT_CHAPTERS).toEqual(['SUCCESS']);
  });

  it('is leak-free (no internal phone/name/path/bead tokens)', () => {
    const files = [
      flowPath,
      path.join(__dirname, '../../bot/shared/routes/homework-request-endpoint.js'),
      path.join(__dirname, '../../bot/workers/homework-bundle.worker.js'),
      path.join(__dirname, '../../bot/shared/services/homework-lookup.service.js'),
    ];
    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf8');
      for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub', 'bd-', 'PROJ-', 'Silverleaf']) {
        expect(raw).not.toContain(banned);
      }
    }
  });
});
