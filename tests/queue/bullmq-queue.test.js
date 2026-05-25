/**
 * BullMQ driver behaviour — the SQS pull/ack model emulated on BullMQ manual mode.
 * bullmq + ioredis are virtually mocked (opt-in deps; not loaded on the default
 * sqs path). The mock keeps a per-queue-name job registry so a Worker(name) pulls
 * exactly what Queue(name).add() pushed, mirroring real BullMQ semantics.
 */

let registry;          // queueName → [{ id, name, data, opts }]
let moveToCompleted, extendLock, moveToFailed, getJobCounts, redisSet;

function load() {
  jest.resetModules();
  registry = new Map();
  moveToCompleted = jest.fn().mockResolvedValue();
  extendLock = jest.fn().mockResolvedValue();
  moveToFailed = jest.fn().mockResolvedValue();
  getJobCounts = jest.fn().mockResolvedValue({ waiting: 3, active: 1, delayed: 2 });
  redisSet = jest.fn().mockResolvedValue();

  let seq = 0;
  const jobsFor = (name) => { if (!registry.has(name)) registry.set(name, []); return registry.get(name); };

  class Queue {
    constructor(name) { this.name = name; }
    async add(jobName, data, opts = {}) {
      const id = opts.jobId || `auto-${++seq}`;
      jobsFor(this.name).push({ id, name: jobName, data, opts });
      return { id };
    }
    async getJobCounts(...args) { return getJobCounts(...args); }
  }
  class Worker {
    constructor(name) { this.name = name; }
    async getNextJob() {
      const q = jobsFor(this.name);
      if (q.length === 0) return undefined;
      const j = q.shift();
      return { id: j.id, data: j.data };
    }
  }
  const Job = {
    fromId: jest.fn(async (queue, id) => ({ id, moveToCompleted, extendLock, moveToFailed })),
  };

  jest.doMock('bullmq', () => ({ Queue, Worker, Job }), { virtual: true });
  jest.doMock('ioredis', () => function IORedis() { return {}; }, { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ set: redisSet }), { virtual: true });
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ getCurrentCorrelationId: () => 'c1', logEvent: jest.fn() }));

  process.env.REDIS_URL = 'redis://localhost:6379';
  return require('../../bot/shared/services/queue/bullmq-queue.service');
}

afterEach(() => { jest.resetModules(); delete process.env.REDIS_URL; });

describe('BullMQ driver — producers', () => {
  it('queueCoachingJob enqueues a v1.0 envelope on the main queue with a stable jobId', async () => {
    const q = load();
    const id = await q.queueCoachingJob('s1', 'transcription', { foo: 1 });
    expect(id).toBe('s1-transcription');
    const job = registry.get('rumi-main')[0];
    expect(job.data).toMatchObject({ sessionId: 's1', jobType: 'transcription', version: '1.0' });
  });

  it('queueVideoJob enqueues on the video queue', async () => {
    const q = load();
    await q.queueVideoJob('v1', 'video_generation', {});
    expect(registry.get('rumi-video')).toHaveLength(1);
    expect(registry.get('rumi-video')[0].data).toMatchObject({ videoRequestId: 'v1', version: '1.0' });
  });

  it('queueJob routes quiz_* to the quiz queue, applies delay (ms) and dedup id', async () => {
    const q = load();
    await q.queueJob('quiz1', 'quiz_report', { a: 1 }, { delaySeconds: 60, deduplicationId: 'dd1' });
    const job = registry.get('rumi-quiz')[0];
    expect(job.id).toBe('dd1');
    expect(job.opts.delay).toBe(60000);
    expect(job.data).toMatchObject({ groupId: 'quiz1', jobType: 'quiz_report', version: '2.0' });
  });

  it('queueJob caps delay at the 900s ceiling and routes non-quiz to main', async () => {
    const q = load();
    await q.queueJob('lp1', 'lesson_plan', {}, { delaySeconds: 5000 });
    const job = registry.get('rumi-main')[0];
    expect(job.opts.delay).toBe(900000);
  });
});

describe('BullMQ driver — pull/ack consumers', () => {
  it('receiveJobs wraps a pulled job into the SQS-shaped message (receiptHandle encodes queue:id:token)', async () => {
    const q = load();
    await q.queueCoachingJob('s2', 'analysis', {});
    const msgs = await q.receiveJobs(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('s2-analysis');
    expect(msgs[0].body).toMatchObject({ sessionId: 's2', jobType: 'analysis' });
    expect(msgs[0].receiptHandle).toMatch(/^main:s2-analysis:/);
  });

  it('receiveJobs returns [] on an empty queue', async () => {
    const q = load();
    await expect(q.receiveJobs(1)).resolves.toEqual([]);
  });

  it('completeJob acks via moveToCompleted using the token from the receiptHandle', async () => {
    const q = load();
    await q.queueCoachingJob('s3', 'report_generation', {});
    const [msg] = await q.receiveJobs(1);
    await q.completeJob(msg.receiptHandle);
    const token = msg.receiptHandle.split(':')[2];
    expect(moveToCompleted).toHaveBeenCalledWith(null, token, false);
  });

  it('extendJobTimeout renews the lock (extendLock) in ms', async () => {
    const q = load();
    await q.queueVideoJob('v2', 'video_generation', {});
    const [msg] = await q.receiveVideoJobs(1);
    await q.extendVideoJobTimeout(msg.receiptHandle, 600);
    const token = msg.receiptHandle.split(':')[2];
    expect(extendLock).toHaveBeenCalledWith(token, 600000);
  });
});

describe('BullMQ driver — metrics + cancel', () => {
  it('getQueueMetrics maps BullMQ job counts to the SQS metric shape', async () => {
    const q = load();
    const m = await q.getQueueMetrics();
    expect(m).toMatchObject({ messagesAvailable: 3, messagesInFlight: 1, messagesDelayed: 2, totalDepth: 6 });
  });

  it('cancelByGroupId writes a Redis cancel flag per jobType (driver-agnostic contract)', async () => {
    const q = load();
    await q.cancelByGroupId('quiz9', ['quiz_report', 'quiz_expire']);
    expect(redisSet).toHaveBeenCalledWith('sqs:cancel:quiz_report:quiz9', '1', 3600);
    expect(redisSet).toHaveBeenCalledWith('sqs:cancel:quiz_expire:quiz9', '1', 3600);
  });
});
