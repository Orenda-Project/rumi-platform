/**
 * sqs-worker.js#recoverStaleVideoRequests — a video job stuck in
 * 'processing' past the stale threshold must be re-queued WITHOUT dropping
 * its originating channel identifier (`from`), and the max-retries apology
 * must deliver to session.recipient_identifier, never a users.phone_number
 * re-derivation (WhatsApp-only, would misdeliver a Slack-originated request).
 *
 * This was a real bug: the re-queue rebuilt the job payload from scratch and
 * silently dropped `from`, so a video job that survived a restart could
 * never deliver its completion message at all.
 */

function makeSupabase({ staleRequests }) {
  function builder(resolveValue) {
    const b = {
      select: () => b,
      eq: () => b,
      lt: () => b,
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      then: (resolve) => resolve(resolveValue),
    };
    return b;
  }
  return {
    from(table) {
      if (table === 'video_requests') return builder({ data: staleRequests, error: null });
      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

function load({ staleRequests = [] } = {}) {
  jest.resetModules();
  jest.doMock('../../bot/shared/config/supabase', () => makeSupabase({ staleRequests }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({
    runWithCorrelation: (id, fn) => fn(),
    generateCorrelationId: () => 'corr-1',
  }));
  const whatsapp = { sendMessage: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/whatsapp.service', () => whatsapp);
  const sqsQueue = {
    queueVideoJob: jest.fn().mockResolvedValue('msg-id'),
    queueJob: jest.fn().mockResolvedValue('msg-id'),
  };
  jest.doMock('../../bot/shared/services/queue', () => sqsQueue);
  jest.doMock('../../bot/shared/services/coaching-orchestrator.service', () => ({}));
  jest.doMock('../../bot/workers/lesson-plan-extraction.worker', () => ({}));
  jest.doMock('../../bot/workers/lesson-plan-generation.worker', () => ({}));
  jest.doMock('../../bot/workers/video-generation.worker', () => ({}));
  jest.doMock('../../bot/workers/exam-grading.worker', () => ({}));

  const worker = require('../../bot/workers/sqs-worker');
  return { worker, whatsapp, sqsQueue };
}

afterEach(() => jest.resetModules());

describe('recoverStaleVideoRequests — recipient_identifier preservation', () => {
  it('re-queues a stale video job WITH `from` preserved from recipient_identifier, not dropped', async () => {
    const staleRequest = {
      id: 'video-1', user_id: 'user-1', topic: 'fractions', language: 'en',
      customization: null, style: 'infographic', retry_count: 0, session_id: 'sess-1',
      recipient_identifier: 'slack:U0123ABC',
    };
    const { worker, sqsQueue } = load({ staleRequests: [staleRequest] });

    await worker.recoverStaleVideoRequests();

    expect(sqsQueue.queueVideoJob).toHaveBeenCalledWith(
      'video-1',
      'video_generation',
      expect.objectContaining({ from: 'slack:U0123ABC', videoRequestId: 'video-1' })
    );
  });

  it('sends the max-retries apology to recipient_identifier, never a users.phone_number re-derivation', async () => {
    const staleRequest = {
      id: 'video-2', user_id: 'user-2', topic: 'algebra', language: 'en',
      customization: null, style: 'infographic', retry_count: 3, session_id: 'sess-2',
      recipient_identifier: 'slack:U0999XYZ',
    };
    const { worker, whatsapp, sqsQueue } = load({ staleRequests: [staleRequest] });

    await worker.recoverStaleVideoRequests();

    expect(whatsapp.sendMessage).toHaveBeenCalledWith('slack:U0999XYZ', expect.stringContaining('algebra'));
    expect(sqsQueue.queueVideoJob).not.toHaveBeenCalled(); // exceeded retries — marked failed, not re-queued
  });

  it('does not send an apology when recipient_identifier is missing (never guesses a channel)', async () => {
    const staleRequest = {
      id: 'video-3', user_id: 'user-3', topic: 'geometry', language: 'en',
      customization: null, style: 'infographic', retry_count: 3, session_id: 'sess-3',
      recipient_identifier: null,
    };
    const { worker, whatsapp } = load({ staleRequests: [staleRequest] });

    await worker.recoverStaleVideoRequests();

    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });
});
