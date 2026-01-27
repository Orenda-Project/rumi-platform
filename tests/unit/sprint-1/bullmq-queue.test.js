/**
 * Sprint 1 TDD: BullMQ Queue Service Tests (bd-231)
 *
 * RED phase: Tests define the API contract for the queue service
 * that replaces sqs-queue.service.js with BullMQ (Redis-based).
 *
 * The queue service must support:
 * - enqueue() with job type and payload
 * - Job deduplication via jobId
 * - getJobCounts() for monitoring
 * - All 7 existing job types
 */

const path = require('path');

const queueServicePath = path.resolve(
  __dirname,
  '../../../bot/shared/services/queue/bullmq-queue.service.js'
);

// Mock ioredis and bullmq since we can't connect to Redis in unit tests
jest.mock('bullmq', () => {
  const jobs = new Map();
  let jobCounter = 0;

  const mockQueue = {
    add: jest.fn(async (name, data, opts = {}) => {
      const id = opts.jobId || `job-${++jobCounter}`;
      if (opts.jobId && jobs.has(opts.jobId)) {
        // Deduplicate - return existing job
        return jobs.get(opts.jobId);
      }
      const job = { id, name, data, opts };
      jobs.set(id, job);
      return job;
    }),
    getJobCounts: jest.fn(async () => ({
      waiting: 2,
      active: 1,
      completed: 10,
      failed: 0,
      delayed: 0,
    })),
    close: jest.fn(async () => {}),
    obliterate: jest.fn(async () => {}),
    _jobs: jobs,
    _reset: () => { jobs.clear(); jobCounter = 0; },
  };

  return {
    Queue: jest.fn(() => mockQueue),
    Worker: jest.fn(() => ({
      on: jest.fn(),
      close: jest.fn(async () => {}),
    })),
    _mockQueue: mockQueue,
  };
});

jest.mock('ioredis', () => {
  return jest.fn(() => ({
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    quit: jest.fn(async () => {}),
    status: 'ready',
  }));
});

describe('BullMQ Queue Service', () => {
  let QueueService;
  let bullmq;

  beforeEach(() => {
    jest.resetModules();
    // Re-require after module reset to get fresh mocks
    jest.mock('bullmq', () => {
      const jobs = new Map();
      let jobCounter = 0;
      const mockQueue = {
        add: jest.fn(async (name, data, opts = {}) => {
          const id = opts.jobId || `job-${++jobCounter}`;
          if (opts.jobId && jobs.has(opts.jobId)) {
            return jobs.get(opts.jobId);
          }
          const job = { id, name, data, opts };
          jobs.set(id, job);
          return job;
        }),
        getJobCounts: jest.fn(async () => ({
          waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0,
        })),
        close: jest.fn(async () => {}),
        _jobs: jobs,
        _reset: () => { jobs.clear(); jobCounter = 0; },
      };
      return {
        Queue: jest.fn(() => mockQueue),
        Worker: jest.fn(() => ({ on: jest.fn(), close: jest.fn(async () => {}) })),
        _mockQueue: mockQueue,
      };
    });
    jest.mock('ioredis', () => jest.fn(() => ({
      get: jest.fn(async () => null),
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 1),
      quit: jest.fn(async () => {}),
      status: 'ready',
    })));

    QueueService = require(queueServicePath);
    bullmq = require('bullmq');
  });

  describe('enqueue()', () => {
    test('adds a job to the queue and returns job info', async () => {
      const service = new QueueService();
      const result = await service.enqueue('coaching_analysis', {
        sessionId: 'test-123',
        userId: 'user-456',
      });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    test('passes correct job name and data', async () => {
      const service = new QueueService();
      await service.enqueue('lesson_plan_generation', {
        requestId: 'req-1',
        topic: 'Math',
      });
      const mockQueue = bullmq._mockQueue;
      expect(mockQueue.add).toHaveBeenCalledWith(
        'lesson_plan_generation',
        expect.objectContaining({
          requestId: 'req-1',
          topic: 'Math',
        }),
        expect.any(Object)
      );
    });

    test('supports all 7 job types', async () => {
      const service = new QueueService();
      const jobTypes = [
        'transcription',
        'analysis',
        'report_generation',
        'lesson_plan_extraction',
        'lesson_plan_generation',
        'video_generation',
        'exam_grading',
      ];
      for (const jobType of jobTypes) {
        const result = await service.enqueue(jobType, { sessionId: `test-${jobType}` });
        expect(result.id).toBeDefined();
      }
    });

    test('deduplicates by jobId when provided', async () => {
      const service = new QueueService();
      const result1 = await service.enqueue('transcription', { sessionId: 's1' }, { jobId: 'dedup-123' });
      const result2 = await service.enqueue('transcription', { sessionId: 's1' }, { jobId: 'dedup-123' });
      expect(result1.id).toBe(result2.id);
    });

    test('includes correlationId in job data when provided', async () => {
      const service = new QueueService();
      await service.enqueue('analysis', { sessionId: 's1' }, { correlationId: 'corr-abc' });
      const mockQueue = bullmq._mockQueue;
      expect(mockQueue.add).toHaveBeenCalledWith(
        'analysis',
        expect.objectContaining({ correlationId: 'corr-abc' }),
        expect.any(Object)
      );
    });
  });

  describe('getJobCounts()', () => {
    test('returns queue metrics', async () => {
      const service = new QueueService();
      const counts = await service.getJobCounts();
      expect(counts).toHaveProperty('waiting');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('completed');
      expect(counts).toHaveProperty('failed');
    });
  });

  describe('close()', () => {
    test('closes the queue connection', async () => {
      const service = new QueueService();
      await service.close();
      const mockQueue = bullmq._mockQueue;
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });

  describe('convenience methods', () => {
    test('queueCoachingJob() wraps enqueue with sessionId-based jobId', async () => {
      const service = new QueueService();
      const result = await service.queueCoachingJob('session-1', 'transcription', { duration: 120 });
      expect(result.id).toBeDefined();
    });

    test('queueVideoJob() wraps enqueue for video jobs', async () => {
      const service = new QueueService();
      const result = await service.queueVideoJob('video-req-1', 'video_generation', { topic: 'Math' });
      expect(result.id).toBeDefined();
    });
  });
});
