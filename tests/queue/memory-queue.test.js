/**
 * Memory queue driver behaviour — in-memory implementation of the SQS/BullMQ contract.
 */

const memoryQueue = require('../../bot/shared/services/queue/memory-queue.service');

beforeEach(() => {
  memoryQueue.clear();
});

describe('Memory queue driver — producers', () => {
  it('queueCoachingJob enqueues a v1.0 envelope on the main queue with a stable jobId', async () => {
    const id = await memoryQueue.queueCoachingJob('session-1', 'transcription', { audioUrl: 'http://example.com' });
    expect(id).toBe('session-1-transcription');
    expect(memoryQueue.size('main')).toBe(1);

    const jobs = await memoryQueue.receiveJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].body.version).toBe('1.0');
    expect(jobs[0].body.sessionId).toBe('session-1');
    expect(jobs[0].body.jobType).toBe('transcription');
  });

  it('queueVideoJob enqueues on the video queue', async () => {
    const id = await memoryQueue.queueVideoJob('vid-1', 'video_generation', { prompt: 'test' });
    expect(id).toBe('vid-1-video_generation');
    expect(memoryQueue.size('video')).toBe(1);

    const jobs = await memoryQueue.receiveVideoJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].body.videoRequestId).toBe('vid-1');
  });

  it('queueJob routes quiz_* to the quiz queue, and non-quiz to main', async () => {
    await memoryQueue.queueJob('quiz-1', 'quiz_report', { score: 10 });
    await memoryQueue.queueJob('group-1', 'inbound_message', { text: 'hello' });

    expect(memoryQueue.size('quiz')).toBe(1);
    expect(memoryQueue.size('main')).toBe(1);

    const quizJobs = await memoryQueue.receiveQuizJobs();
    expect(quizJobs).toHaveLength(1);
    expect(quizJobs[0].body.jobType).toBe('quiz_report');

    const mainJobs = await memoryQueue.receiveJobs();
    expect(mainJobs).toHaveLength(1);
    expect(mainJobs[0].body.jobType).toBe('inbound_message');
  });

  it('queueJob deduplicates when deduplicationId is provided', async () => {
    const id1 = await memoryQueue.queueJob('user-1', 'inbound_message', { msg: 1 }, { deduplicationId: 'dedup-123' });
    const id2 = await memoryQueue.queueJob('user-1', 'inbound_message', { msg: 2 }, { deduplicationId: 'dedup-123' });

    expect(id1).toBe('dedup-123');
    expect(id2).toBe('dedup-123');
    expect(memoryQueue.size('main')).toBe(1);
  });

  it('queueJob respects delaySeconds and does not make job visible prematurely', async () => {
    await memoryQueue.queueJob('group-1', 'quiz_expire', {}, { delaySeconds: 60 });
    const immediate = await memoryQueue.receiveQuizJobs();
    expect(immediate).toHaveLength(0);

    const metrics = await memoryQueue.getVideoQueueMetrics();
    expect(metrics).toBeDefined();
  });
});

describe('Memory queue driver — consumers', () => {
  it('receiveJobs pulls and completeJob deletes the message', async () => {
    await memoryQueue.queueJob('g-1', 'inbound_message', { payload: 'ok' });
    const jobs = await memoryQueue.receiveJobs();
    expect(jobs).toHaveLength(1);

    const rh = jobs[0].receiptHandle;
    await memoryQueue.completeJob(rh);

    expect(memoryQueue.size('main')).toBe(0);
    const empty = await memoryQueue.receiveJobs();
    expect(empty).toHaveLength(0);
  });

  it('requeueJob returns job to waiting queue', async () => {
    await memoryQueue.queueJob('g-1', 'inbound_message', { payload: 'retry' });
    const jobs = await memoryQueue.receiveJobs();
    expect(jobs).toHaveLength(1);

    await memoryQueue.requeueJob(jobs[0].receiptHandle);
    const retried = await memoryQueue.receiveJobs();
    expect(retried).toHaveLength(1);
    expect(retried[0].body.payload.payload).toBe('retry');
  });

  it('extendJobTimeout updates in-flight visibility deadline', async () => {
    await memoryQueue.queueJob('g-1', 'inbound_message', { payload: 'ext' });
    const jobs = await memoryQueue.receiveJobs();
    expect(jobs).toHaveLength(1);

    await expect(memoryQueue.extendJobTimeout(jobs[0].receiptHandle, 300)).resolves.not.toThrow();
  });

  it('getQueueMetrics returns accurate available, inFlight, and total depth counts', async () => {
    await memoryQueue.queueJob('g-1', 'inbound_message', { a: 1 });
    await memoryQueue.queueJob('g-2', 'inbound_message', { a: 2 });

    let metrics = await memoryQueue.getQueueMetrics();
    expect(metrics.messagesAvailable).toBe(2);
    expect(metrics.messagesInFlight).toBe(0);
    expect(metrics.totalDepth).toBe(2);

    const jobs = await memoryQueue.receiveJobs(1);
    expect(jobs).toHaveLength(1);

    metrics = await memoryQueue.getQueueMetrics();
    expect(metrics.messagesAvailable).toBe(1);
    expect(metrics.messagesInFlight).toBe(1);
    expect(metrics.totalDepth).toBe(2);
  });

  it('cancelByGroupId registers cancellation', async () => {
    await memoryQueue.cancelByGroupId('quiz-abc', ['quiz_report', 'quiz_expire']);
    expect(memoryQueue.cancelledFlags.has('sqs:cancel:quiz_report:quiz-abc')).toBe(true);
    expect(memoryQueue.cancelledFlags.has('sqs:cancel:quiz_expire:quiz-abc')).toBe(true);
  });
});
