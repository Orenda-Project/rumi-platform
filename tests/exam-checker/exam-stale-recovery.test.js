/**
 * exam-grading.worker.js — recoverStaleExamSessions() runs at every worker
 * boot and every five minutes. It must query exam_check_sessions through the
 * shared Supabase client, requeue or fail stale rows, and when something goes
 * wrong log the error's name, message and code rather than a bare line.
 */

function load({ queryResult, queryThrows } = {}) {
  jest.resetModules();

  // One chain object serves both queries: the stale-session select
  // (.select().in().lt()) and the retry bump (.update().eq()).
  const chain = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    lt: jest.fn(async () => {
      if (queryThrows) throw queryThrows;
      return queryResult || { data: [], error: null };
    }),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ error: null }),
  };
  const supabase = { from: jest.fn(() => chain) };

  const ExamSessionService = { updateStatus: jest.fn().mockResolvedValue(undefined) };
  const SQSQueueService = { queueJob: jest.fn().mockResolvedValue(undefined) };
  const logToFile = jest.fn();

  jest.doMock('../../bot/shared/config/supabase', () => supabase);
  jest.doMock('../../bot/shared/services/queue', () => SQSQueueService);
  jest.doMock('../../bot/shared/services/exam-checker', () => ({
    ExamCheckerOrchestrator: {},
    ExamSessionService,
    OCRService: {},
    QuestionDetectorService: {},
    GradingService: {},
    AnnotationService: {},
    DeliveryService: {},
  }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({
    runWithCorrelation: (id, fn) => fn(),
    generateCorrelationId: () => 'corr-1',
  }));

  const worker = require('../../bot/workers/exam-grading.worker');
  return { worker, supabase, chain, ExamSessionService, SQSQueueService, logToFile };
}

const messages = (logToFile) => logToFile.mock.calls.map(([msg]) => msg);
const callFor = (logToFile, msg) => logToFile.mock.calls.find(([m]) => m === msg) || [msg, undefined];

afterEach(() => jest.resetModules());

describe('exam-grading.worker — recoverStaleExamSessions', () => {
  it('logs "No stale exam sessions found" on an empty table, not the recovery error', async () => {
    const { worker, supabase, chain, logToFile } = load({ queryResult: { data: [], error: null } });

    await worker.recoverStaleExamSessions();

    expect(messages(logToFile)).not.toContain('Error recovering stale exam sessions');
    expect(messages(logToFile)).toContain('No stale exam sessions found');
    expect(supabase.from).toHaveBeenCalledWith('exam_check_sessions');
    expect(chain.in).toHaveBeenCalledWith('status', ['processing_ocr', 'grading']);
    expect(chain.lt).toHaveBeenCalledWith('processing_started_at', expect.any(String));
  });

  it('requeues a stale session under the retry limit and fails one that has used its retries', async () => {
    const { worker, chain, ExamSessionService, SQSQueueService, logToFile } = load({
      queryResult: {
        data: [
          { id: 'exam-1', user_id: 'user-1', status: 'grading', retry_count: 1 },
          { id: 'exam-2', user_id: 'user-2', status: 'processing_ocr', retry_count: 3 },
        ],
        error: null,
      },
    });

    await worker.recoverStaleExamSessions();

    expect(messages(logToFile)).not.toContain('Error recovering stale exam sessions');
    expect(chain.update).toHaveBeenCalledWith({ retry_count: 2 });
    expect(chain.eq).toHaveBeenCalledWith('id', 'exam-1');
    expect(SQSQueueService.queueJob).toHaveBeenCalledWith(
      'exam-1',
      'exam_grading',
      expect.objectContaining({ sessionId: 'exam-1', userId: 'user-1', phase: 'ocr' }),
    );
    expect(ExamSessionService.updateStatus).toHaveBeenCalledWith('exam-2', 'error', { error_message: 'Exceeded max retries' });
    expect(SQSQueueService.queueJob).toHaveBeenCalledTimes(1);
  });

  it('logs the message and code when the stale-session query returns an error', async () => {
    const { worker, logToFile } = load({
      queryResult: { data: null, error: { message: 'column "retry_count" does not exist', code: '42703' } },
    });

    await worker.recoverStaleExamSessions();

    const [, data] = callFor(logToFile, 'Error querying stale exam sessions');
    expect(data).toEqual(expect.objectContaining({ error: 'column "retry_count" does not exist', errorCode: '42703' }));
  });

  it('logs the name, message and code when the recovery throws', async () => {
    const thrown = Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
    const { worker, logToFile } = load({ queryThrows: thrown });

    await worker.recoverStaleExamSessions();

    const [, data] = callFor(logToFile, 'Error recovering stale exam sessions');
    expect(data).toEqual(expect.objectContaining({ error: 'fetch failed', errorCode: 'ECONNREFUSED', errorName: 'Error' }));
  });
});
