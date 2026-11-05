/**
 * Baileys + background jobs: the worker has to run INSIDE the bot.
 *
 * A linked WhatsApp session can be open in exactly one process
 * (baileys-connection.js#acquireInstanceLock). The bot holds it, so a separate
 * sqs-worker that tried to send a lesson plan / coaching report / exam result
 * was refused ("Another Rumi instance ... is already using ...") and the teacher
 * never got it, although the job was marked completed. With CHANNEL_DRIVER=baileys
 * the bot therefore starts the worker in-process, and a standalone worker stands
 * down instead of consuming jobs it cannot deliver.
 */

const path = require('path');

const inlineWorker = require('../../bot/shared/config/inline-worker');

describe('shouldRunWorkerInBot', () => {
  it('is on for the linked-device (baileys) channel', () => {
    expect(inlineWorker.shouldRunWorkerInBot({ CHANNEL_DRIVER: 'baileys' })).toBe(true);
  });

  it('is off for the Meta Cloud API, where any process can send', () => {
    expect(inlineWorker.shouldRunWorkerInBot({ CHANNEL_DRIVER: 'meta' })).toBe(false);
  });

  it('can be switched off with RUMI_INLINE_WORKER=off', () => {
    expect(inlineWorker.shouldRunWorkerInBot({ CHANNEL_DRIVER: 'baileys', RUMI_INLINE_WORKER: 'off' })).toBe(false);
  });
});

describe('sqs-worker required as a library (inside the bot)', () => {
  function loadWorker() {
    jest.resetModules();
    jest.doMock('../../bot/shared/config/supabase', () => ({}));
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/utils/structured-logger', () => ({
      runWithCorrelation: (id, fn) => fn(),
      generateCorrelationId: () => 'corr-1',
    }));
    jest.doMock('../../bot/shared/services/queue', () => ({}));
    jest.doMock('../../bot/shared/services/coaching-orchestrator.service', () => ({}));
    jest.doMock('../../bot/workers/lesson-plan-extraction.worker', () => ({}));
    jest.doMock('../../bot/workers/lesson-plan-generation.worker', () => ({}));
    jest.doMock('../../bot/workers/video-generation.worker', () => ({}));
    jest.doMock('../../bot/workers/exam-grading.worker', () => ({}));
    return require(path.join('..', '..', 'bot', 'workers', 'sqs-worker'));
  }

  afterEach(() => jest.resetModules());

  it('installs no process-level exit handlers (they would cut short the bot\'s WhatsApp flush)', () => {
    const before = ['SIGTERM', 'SIGINT', 'uncaughtException'].map((e) => process.listenerCount(e));
    const worker = loadWorker();
    const after = ['SIGTERM', 'SIGINT', 'uncaughtException'].map((e) => process.listenerCount(e));

    expect(after).toEqual(before);
    expect(typeof worker.startWorker).toBe('function');
    expect(typeof worker.installProcessHandlers).toBe('function');
  });
});
