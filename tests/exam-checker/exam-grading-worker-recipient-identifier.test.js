/**
 * exam-grading.worker.js — progress updates and error notifications must
 * deliver to session.recipient_identifier, never re-derive a destination
 * from users.phone_number (the removed getUser() helper).
 */

function load({ session, gradeBatchImpl } = {}) {
  jest.resetModules();

  const ExamSessionService = {
    getById: jest.fn().mockResolvedValue(session),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const DeliveryService = {
    sendErrorNotification: jest.fn().mockResolvedValue(true),
    sendProgressUpdate: jest.fn().mockResolvedValue(true),
    sendResults: jest.fn().mockResolvedValue(true),
  };
  const GradingService = {
    gradeBatch: jest.fn(gradeBatchImpl || (async () => ({
      successful: [], failed: [], summary: { averagePercentage: 0 },
    }))),
  };
  const OCRService = { extractBatch: jest.fn().mockResolvedValue({ provider: 'mistral', averageConfidence: 0.9 }) };
  const QuestionDetectorService = { analyze: jest.fn().mockResolvedValue({ students: [], questions: [] }) };
  const AnnotationService = { annotateAll: jest.fn().mockResolvedValue([]) };

  jest.doMock('../../bot/shared/services/exam-checker', () => ({
    ExamCheckerOrchestrator: {},
    ExamSessionService,
    OCRService,
    QuestionDetectorService,
    GradingService,
    AnnotationService,
    DeliveryService,
  }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({
    runWithCorrelation: (id, fn) => fn(),
    generateCorrelationId: () => 'corr-1',
  }));

  const worker = require('../../bot/workers/exam-grading.worker');
  return { worker, ExamSessionService, DeliveryService, GradingService };
}

afterEach(() => jest.resetModules());

describe('exam-grading.worker — recipient_identifier delivery', () => {
  it('sends grading-progress updates to session.recipient_identifier, not a users.phone_number lookup', async () => {
    const session = {
      id: 'exam-1',
      status: 'grading',
      user_id: 'user-1',
      recipient_identifier: 'slack:U0123ABC',
      confirmed_students: ['s1'],
      original_images: [],
    };
    const { worker, DeliveryService, GradingService } = load({
      session,
      gradeBatchImpl: async (sess, { onProgress }) => {
        await onProgress({ completed: 1, total: 4, percentage: 25 });
        return { successful: [], failed: [], summary: { averagePercentage: 0 } };
      },
    });

    await worker.process({ sessionId: 'exam-1', userId: 'user-1', phase: 'grading' });

    expect(GradingService.gradeBatch).toHaveBeenCalled();
    expect(DeliveryService.sendProgressUpdate).toHaveBeenCalledWith('slack:U0123ABC', expect.objectContaining({ percentage: 25 }));
  });

  it('delivers grading results via session.recipient_identifier through DeliveryService.sendResults', async () => {
    const session = {
      id: 'exam-1',
      status: 'grading',
      user_id: 'user-1',
      recipient_identifier: 'slack:U0123ABC',
      confirmed_students: ['s1'],
      original_images: [],
    };
    const { worker, DeliveryService } = load({ session });

    await worker.process({ sessionId: 'exam-1', userId: 'user-1', phase: 'grading' });

    expect(DeliveryService.sendResults).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_identifier: 'slack:U0123ABC' }),
      'user-1'
    );
  });

  it('sends an error notification to session.recipient_identifier when the job throws, not a re-derived phone number', async () => {
    const session = { id: 'exam-1', status: 'grading', user_id: 'user-1', recipient_identifier: 'slack:U0123ABC', confirmed_students: ['s1'] };
    const { worker, DeliveryService } = load({
      session,
      gradeBatchImpl: async () => { throw new Error('grading exploded'); },
    });

    await expect(worker.process({ sessionId: 'exam-1', userId: 'user-1', phase: 'grading' })).rejects.toThrow('grading exploded');

    expect(DeliveryService.sendErrorNotification).toHaveBeenCalledWith('slack:U0123ABC', 'exam-1', 'grading exploded');
  });

  it('does not notify at all when the session has no recipient_identifier (never guesses a channel)', async () => {
    const session = { id: 'exam-1', status: 'grading', user_id: 'user-1', recipient_identifier: null, confirmed_students: ['s1'] };
    const { worker, DeliveryService } = load({
      session,
      gradeBatchImpl: async () => { throw new Error('boom'); },
    });

    await expect(worker.process({ sessionId: 'exam-1', userId: 'user-1', phase: 'grading' })).rejects.toThrow('boom');

    expect(DeliveryService.sendErrorNotification).not.toHaveBeenCalled();
  });
});
