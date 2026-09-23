/**
 * lesson-plan-generation.worker.js failure path: the teacher is always told.
 *
 * Seen live on the Matrix channel (#104): Gamma answered 401 (no valid key),
 * the worker marked the request failed and re-threw for a queue retry that
 * BullMQ never performs (issue #108) -- so the teacher, who had already been
 * told "I'm preparing a detailed five-step lesson plan...", got nothing.
 * A client error from the generation API is not retryable, so the apology now
 * goes out on the FIRST such failure; transient errors keep the retry path.
 */

function loadWorker({ generateError, retryCount = 0 } = {}) {
  jest.resetModules();
  const sent = [];
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => ({}));
  jest.doMock('../../bot/shared/services/content.service', () => ({
    generateLessonPlan: jest.fn(async () => { throw generateError; }),
    generatePresentation: jest.fn(async () => { throw generateError; }),
    downloadPDF: jest.fn(),
  }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
    sendMessage: jest.fn(async (to, text) => { sent.push({ to, text }); return true; }),
    sendDocument: jest.fn(async () => true),
  }));
  const queue = {
    getRequest: jest.fn()
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValue({ retry_count: retryCount }),
    markProcessing: jest.fn(async () => {}),
    markFailed: jest.fn(async () => {}),
    markCompleted: jest.fn(async () => {}),
  };
  jest.doMock('../../bot/shared/services/lesson-plan-queue.service', () => queue);
  jest.doMock('../../bot/shared/services/feature-linker.service', () => ({ suggestNext: jest.fn() }));
  jest.doMock('../../bot/shared/services/feature-registration.service', () => ({ checkAndTriggerRegistration: jest.fn() }));
  jest.doMock('../../bot/shared/database/bot-helpers', () => ({ storeLessonPlan: jest.fn() }));
  // eslint-disable-next-line global-require
  const Worker = require('../../bot/workers/lesson-plan-generation.worker');
  return { Worker, sent, queue };
}

function httpError(status) {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data: {} };
  return error;
}

const JOB = {
  requestId: 'req-1', userId: 'u-1', phoneNumber: 'mtx:923001230081', topic: 'Water Cycle', fullMessage: 'water cycle', language: 'en',
};

afterEach(() => jest.resetModules());

describe('lesson-plan-generation worker -- failures always reach the teacher', () => {
  it('a 401 from Gamma (bad/missing key) sends the apology on the FIRST failure and does not re-throw', async () => {
    const { Worker, sent, queue } = loadWorker({ generateError: httpError(401) });
    await expect(Worker.process(JOB)).resolves.toBeUndefined();
    expect(queue.markFailed).toHaveBeenCalledWith('req-1', 'Request failed with status code 401');
    expect(sent).toEqual([{ to: 'mtx:923001230081', text: expect.stringContaining('problem creating your lesson plan') }]);
  });

  it('the apology is in the teacher\'s language', async () => {
    const { Worker, sent } = loadWorker({ generateError: httpError(403) });
    await Worker.process({ ...JOB, language: 'ur' });
    expect(sent[0].text).toContain('لیسن پلان');
  });

  it('a transient failure (5xx / network) keeps the retry path: re-throws, no message yet', async () => {
    const { Worker, sent } = loadWorker({ generateError: httpError(503) });
    await expect(Worker.process(JOB)).rejects.toThrow('503');
    expect(sent).toEqual([]);
    const { Worker: W2, sent: sent2 } = loadWorker({ generateError: new Error('socket hang up') });
    await expect(W2.process(JOB)).rejects.toThrow('socket hang up');
    expect(sent2).toEqual([]);
  });

  it('a transient failure on the last allowed attempt still apologises (existing behaviour kept)', async () => {
    const { Worker, sent } = loadWorker({ generateError: httpError(503), retryCount: 2 });
    await expect(Worker.process(JOB)).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it('isPermanentFailure: client errors yes, 408/429/5xx/no-status no', () => {
    const { Worker } = loadWorker({ generateError: httpError(401) });
    expect([400, 401, 403, 404, 422].every((s) => Worker.isPermanentFailure(httpError(s)))).toBe(true);
    expect([408, 429, 500, 502, 503].some((s) => Worker.isPermanentFailure(httpError(s)))).toBe(false);
    expect(Worker.isPermanentFailure(new Error('ECONNRESET'))).toBe(false);
  });
});
