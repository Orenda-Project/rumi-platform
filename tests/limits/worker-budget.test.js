/**
 * The worker side of the model budget breaker: a job whose model call is
 * refused for budget sends its teacher "busy" once instead of its own failure
 * message (sqs-worker.js processJob → limits/model-budget.js guard).
 *
 * Real: sqs-worker.js processJob, model-budget.js, the messaging facade (its
 * mute). Mocked at the boundary: the channel driver, the queue, the database,
 * the logger, and the job handler (a stand-in that calls a guarded model
 * client whose provider answers 402, then apologises as handlers do).
 */

function load() {
  jest.resetModules();
  process.env.CHANNEL_DRIVER = 'meta';
  delete process.env.REDIS_URL;
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn(() => ({ update: () => ({ eq: async () => ({ error: null }) }) })) }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ isAvailable: () => false }));
  const WA = { sendMessage: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/messaging/meta-channel.service', () => WA);
  const queue = { extendJobTimeout: jest.fn().mockResolvedValue(), queueJob: jest.fn(), completeJob: jest.fn().mockResolvedValue() };
  jest.doMock('../../bot/shared/services/queue', () => queue);
  jest.doMock('../../bot/shared/services/coaching-orchestrator.service', () => ({}));
  jest.doMock('../../bot/workers/lesson-plan-extraction.worker', () => ({}));
  jest.doMock('../../bot/workers/lesson-plan-generation.worker', () => ({}));
  jest.doMock('../../bot/workers/video-generation.worker', () => ({}));
  jest.doMock('../../bot/workers/exam-grading.worker', () => ({}));
  const provider = jest.fn().mockRejectedValue(Object.assign(new Error('Key limit exceeded (daily limit)'), { status: 403 }));
  const testpaper = {
    process: jest.fn(async (payload) => {
      const ModelBudget = require('../../bot/shared/services/limits/model-budget');
      const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
      try {
        await ModelBudget.guardCreate(provider)({ model: 'm' });
      } catch (e) {
        await WhatsAppService.sendMessage(payload.to, 'Sorry, I could not make your test paper.');
        throw e;
      }
    }),
  };
  jest.doMock('../../bot/workers/testpaper.worker', () => testpaper);
  const { SQSCoachingWorker } = require('../../bot/workers/sqs-worker');
  return { worker: new SQSCoachingWorker('w-test'), WA, provider };
}

afterEach(() => { delete process.env.CHANNEL_DRIVER; jest.resetModules(); });

it('a job refused for budget: one "busy" to its teacher, no apology; its retry makes no provider call and says nothing more', async () => {
  const { worker, WA, provider } = load();
  const job = (n) => ({ receiptHandle: `rh-${n}`, messageId: `m-${n}`, sourceQueue: 'main', body: { sessionId: 'p1', jobType: 'testpaper_generate', payload: { paperId: 'p1', to: '15550100005' } } });

  worker.processJob(job(1));
  await worker.activeJobs.get('rh-1');
  expect(WA.sendMessage.mock.calls.map((c) => c[1])).toEqual(['Rumi is very busy right now. Please try again a little later.']);

  worker.processJob(job(2));   // the queue's redelivery
  await worker.activeJobs.get('rh-2');
  expect(provider).toHaveBeenCalledTimes(1);
  expect(WA.sendMessage).toHaveBeenCalledTimes(1);
});
