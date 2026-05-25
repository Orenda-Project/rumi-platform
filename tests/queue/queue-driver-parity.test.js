/**
 * Driver parity: the SQS and BullMQ singletons must expose the SAME method surface
 * the worker loop + every producer depend on. If a consumer starts calling a new
 * queue method, this test fails until BOTH drivers implement it — preventing a
 * "works on sqs, throws on bullmq" (or vice-versa) split. This is the one seam
 * between the two backends, so it is the highest-value test in the phase.
 */

// The contract every consumer relies on (grepped from bot/ call sites).
const REQUIRED_METHODS = [
  // producers
  'queueCoachingJob', 'queueVideoJob', 'queueJob',
  // consumers (pull)
  'receiveJobs', 'receiveVideoJobs', 'receiveQuizJobs',
  // consumers (ack)
  'completeJob', 'completeVideoJob', 'completeQuizJob',
  // consumers (heartbeat / visibility)
  'extendJobTimeout', 'extendVideoJobTimeout', 'extendQuizJobTimeout',
  // retry + metrics + cancel
  'requeueJob', 'getQueueMetrics', 'getVideoQueueMetrics', 'cancelByGroupId',
];

function loadBoth() {
  jest.resetModules();
  jest.doMock('aws-sdk', () => ({ config: { update: jest.fn() }, SQS: jest.fn(() => ({})) }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ set: jest.fn() }), { virtual: true });
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ getCurrentCorrelationId: () => 'c1', logEvent: jest.fn() }));
  return {
    sqs: require('../../bot/shared/services/queue/sqs-queue.service'),
    bullmq: require('../../bot/shared/services/queue/bullmq-queue.service'),
  };
}

afterEach(() => jest.resetModules());

describe('queue driver parity', () => {
  it.each(REQUIRED_METHODS)('SQS driver implements %s()', (m) => {
    const { sqs } = loadBoth();
    expect(typeof sqs[m]).toBe('function');
  });

  it.each(REQUIRED_METHODS)('BullMQ driver implements %s()', (m) => {
    const { bullmq } = loadBoth();
    expect(typeof bullmq[m]).toBe('function');
  });

  it('neither driver is missing a method the other has on the shared contract', () => {
    const { sqs, bullmq } = loadBoth();
    for (const m of REQUIRED_METHODS) {
      expect(typeof sqs[m]).toBe('function');
      expect(typeof bullmq[m]).toBe('function');
    }
  });
});
