/**
 * sqs-queue.service.cancelByGroupId — regression guard for a latent bug:
 * quiz-orchestrator.service.js calls SQSQueueService.cancelByGroupId(...), but the
 * method did not exist on the class → "cancelByGroupId is not a function" on every
 * quiz cancel. It writes the Redis cancel flag the worker handler reads
 * (`sqs:cancel:<jobType>:<groupId>`, see quiz-job-handler isCancelled).
 */

let redisSet;

function load() {
  jest.resetModules();
  redisSet = jest.fn().mockResolvedValue();
  jest.doMock('aws-sdk', () => ({ config: { update: jest.fn() }, SQS: jest.fn(() => ({})) }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ set: redisSet }), { virtual: true });
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ getCurrentCorrelationId: () => 'c1', logEvent: jest.fn() }));
  process.env.SQS_QUEUE_URL = 'https://sqs/main';
  return require('../../bot/shared/services/queue/sqs-queue.service');
}

afterEach(() => { jest.resetModules(); delete process.env.SQS_QUEUE_URL; });

describe('SQS cancelByGroupId', () => {
  it('sets a Redis cancel flag (1h TTL) for each jobType', async () => {
    const q = load();
    await q.cancelByGroupId('quiz1', ['quiz_report', 'quiz_expire']);
    expect(redisSet).toHaveBeenCalledWith('sqs:cancel:quiz_report:quiz1', '1', 3600);
    expect(redisSet).toHaveBeenCalledWith('sqs:cancel:quiz_expire:quiz1', '1', 3600);
  });

  it('is resilient when a Redis write fails (does not throw)', async () => {
    const q = load();
    redisSet.mockRejectedValueOnce(new Error('redis down'));
    await expect(q.cancelByGroupId('quiz2', ['quiz_report'])).resolves.toBeUndefined();
  });

  it('no-ops on an empty jobTypes list', async () => {
    const q = load();
    await q.cancelByGroupId('quiz3', []);
    expect(redisSet).not.toHaveBeenCalled();
  });
});
