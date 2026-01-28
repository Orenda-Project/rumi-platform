/**
 * Sprint 1 TDD: BullMQ Worker Tests (bd-230)
 *
 * Tests define the API contract for the BullMQ worker
 * that replaces sqs-worker.js.
 *
 * The worker must:
 * - Process all 7 job types
 * - Respect concurrency limit
 * - Provide health endpoints
 * - Support graceful shutdown
 */

const path = require('path');

const workerModulePath = path.resolve(
  __dirname,
  '../../../bot/workers/bullmq-worker.js'
);

// Track Worker constructor calls via a shared array (survives jest.resetModules)
const workerConstructorCalls = [];

// Mock bullmq at top level (Jest hoists this)
jest.mock('bullmq', () => {
  const eventHandlers = {};
  const mockWorker = {
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
    }),
    close: jest.fn(async () => {}),
    isRunning: jest.fn(() => true),
    _eventHandlers: eventHandlers,
  };
  return {
    Worker: jest.fn((...args) => {
      workerConstructorCalls.push(args);
      return mockWorker;
    }),
    Queue: jest.fn(() => ({
      add: jest.fn(async () => ({ id: 'test-job' })),
      getJobCounts: jest.fn(async () => ({ waiting: 0, active: 0, completed: 0, failed: 0 })),
      close: jest.fn(async () => {}),
    })),
    _mockWorker: mockWorker,
  };
});

jest.mock('ioredis', () => jest.fn(() => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => 'OK'),
  del: jest.fn(async () => 1),
  quit: jest.fn(async () => {}),
  status: 'ready',
})));

describe('BullMQ Worker', () => {
  let workerModule;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    workerConstructorCalls.length = 0;
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    jest.resetModules();
    workerModule = require(workerModulePath);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('module exports', () => {
    test('exports createWorker function', () => {
      expect(typeof workerModule.createWorker).toBe('function');
    });

    test('exports createHealthApp function for health endpoints', () => {
      expect(typeof workerModule.createHealthApp).toBe('function');
    });

    test('exports JOB_TYPES constant with all 7 job types', () => {
      expect(workerModule.JOB_TYPES).toBeDefined();
      const types = Object.values(workerModule.JOB_TYPES);
      expect(types).toContain('transcription');
      expect(types).toContain('analysis');
      expect(types).toContain('report_generation');
      expect(types).toContain('lesson_plan_extraction');
      expect(types).toContain('lesson_plan_generation');
      expect(types).toContain('video_generation');
      expect(types).toContain('exam_grading');
    });
  });

  describe('createWorker()', () => {
    test('creates a BullMQ Worker instance', () => {
      const worker = workerModule.createWorker();
      expect(worker).toBeDefined();
      expect(worker.on).toBeDefined();
      expect(workerConstructorCalls.length).toBeGreaterThan(0);
    });

    test('configures concurrency (default 3)', () => {
      workerModule.createWorker();
      const lastCall = workerConstructorCalls[workerConstructorCalls.length - 1];
      // Third arg is options object
      expect(lastCall[2]).toHaveProperty('concurrency', 3);
    });

    test('allows concurrency override via WORKER_CONCURRENCY env var', () => {
      process.env.WORKER_CONCURRENCY = '5';
      jest.resetModules();
      workerConstructorCalls.length = 0;
      const mod = require(workerModulePath);
      mod.createWorker();
      const lastCall = workerConstructorCalls[workerConstructorCalls.length - 1];
      expect(lastCall[2].concurrency).toBe(5);
      delete process.env.WORKER_CONCURRENCY;
    });
  });

  describe('job processor (processJob)', () => {
    test('processJob is exported for testing', () => {
      expect(typeof workerModule.processJob).toBe('function');
    });

    test('routes coaching_analysis jobs correctly', async () => {
      const job = { name: 'analysis', data: { sessionId: 'test-123', userId: 'user-456' } };
      const result = await workerModule.processJob(job);
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
    });

    test('routes transcription jobs correctly', async () => {
      const job = { name: 'transcription', data: { sessionId: 'test-123', duration: 120 } };
      const result = await workerModule.processJob(job);
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
    });

    test('routes lesson_plan_generation jobs correctly', async () => {
      const job = {
        name: 'lesson_plan_generation',
        data: { requestId: 'req-1', topic: 'Math', userId: 'user-1', language: 'en' },
      };
      const result = await workerModule.processJob(job);
      expect(result.status).toBe('completed');
    });

    test('routes video_generation jobs correctly', async () => {
      const job = {
        name: 'video_generation',
        data: { videoRequestId: 'vid-1', topic: 'Science', userId: 'user-1' },
      };
      const result = await workerModule.processJob(job);
      expect(result.status).toBe('completed');
    });

    test('returns error status for unknown job types', async () => {
      const job = { name: 'unknown_job', data: {} };
      const result = await workerModule.processJob(job);
      expect(result.status).toBe('error');
      expect(result.message).toContain('unknown');
    });
  });

  describe('health endpoints', () => {
    test('createHealthApp returns an express-like app', () => {
      const app = workerModule.createHealthApp();
      expect(app).toBeDefined();
      expect(typeof app.listen === 'function' || typeof app.get === 'function').toBe(true);
    });
  });
});
