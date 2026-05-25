/**
 * sqs-queue.service.queueJob — quiz jobs route to the dedicated quiz Standard
 * queue with per-message DelaySeconds; non-quiz jobs go to the main queue.
 * aws-sdk is virtually mocked (bot-only dep, not installed at root test time).
 */

let sendMessageMock;
const MAIN = 'https://sqs/main';
const QUIZ = 'https://sqs/quiz';

function load() {
  jest.resetModules();
  sendMessageMock = jest.fn(() => ({ promise: () => Promise.resolve({ MessageId: 'm1' }) }));
  jest.doMock('aws-sdk', () => ({
    config: { update: jest.fn() },
    SQS: jest.fn(() => ({ sendMessage: sendMessageMock })),
  }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({}), { virtual: true });
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ getCurrentCorrelationId: () => 'c1', logEvent: jest.fn() }));

  process.env.SQS_QUEUE_URL = MAIN;
  process.env.SQS_QUIZ_QUEUE_URL = QUIZ;
  return require('../../bot/shared/services/queue/sqs-queue.service');
}

afterEach(() => {
  jest.resetModules();
  delete process.env.SQS_QUIZ_QUEUE_URL;
});

describe('queueJob routing', () => {
  it('routes a quiz_* job to the quiz queue with DelaySeconds', async () => {
    const q = load();
    await q.queueJob('quiz1', 'quiz_report', { foo: 1 }, { delaySeconds: 60 });
    const params = sendMessageMock.mock.calls[0][0];
    expect(params.QueueUrl).toBe(QUIZ);
    expect(params.DelaySeconds).toBe(60);
    expect(JSON.parse(params.MessageBody)).toMatchObject({ groupId: 'quiz1', jobType: 'quiz_report', version: '2.0' });
  });

  it('caps DelaySeconds at the SQS hard limit (900)', async () => {
    const q = load();
    await q.queueJob('quiz1', 'quiz_expire', {}, { delaySeconds: 5000 });
    expect(sendMessageMock.mock.calls[0][0].DelaySeconds).toBe(900);
  });

  it('routes a non-quiz job to the main queue', async () => {
    const q = load();
    await q.queueJob('lp1', 'some_other_job', {});
    expect(sendMessageMock.mock.calls[0][0].QueueUrl).toBe(MAIN);
  });

  it('receiveQuizJobs returns [] when no quiz queue is configured', async () => {
    delete process.env.SQS_QUIZ_QUEUE_URL;
    const q = load();
    delete process.env.SQS_QUIZ_QUEUE_URL; // ensure unset post-require too
    // re-require with quiz url unset
    jest.resetModules();
    jest.doMock('aws-sdk', () => ({ config: { update: jest.fn() }, SQS: jest.fn(() => ({ sendMessage: sendMessageMock })) }), { virtual: true });
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({}), { virtual: true });
    jest.doMock('../../bot/shared/utils/structured-logger', () => ({ getCurrentCorrelationId: () => 'c1', logEvent: jest.fn() }));
    process.env.SQS_QUEUE_URL = MAIN;
    const q2 = require('../../bot/shared/services/queue/sqs-queue.service');
    await expect(q2.receiveQuizJobs(1)).resolves.toEqual([]);
  });
});
