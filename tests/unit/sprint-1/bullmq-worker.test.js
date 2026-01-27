/**
 * Sprint 1 TDD: BullMQ Worker Tests (bd-230)
 *
 * RED phase: Tests define the API contract for the BullMQ worker
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

// Mock bullmq Worker
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
    Worker: jest.fn(() => mockWorker),
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

  beforeEach(() => {
    jest.resetModules();
    // Re-apply mocks after reset
    jest.mock('bullmq', () => {
      const eventHandlers = {};
      const mockWorker = {
        on: jest.fn((event, handler) => { eventHandlers[event] = handler; }),
        close: jest.fn(async () => {}),
        isRunning: jest.fn(() => true),
        _eventHandlers: eventHandlers,
      };
      return {
        Worker: jest.fn(() => mockWorker),
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
    workerModule = require(workerModulePath);
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
      const bullmq = require('bullmq');
      const worker = workerModule.createWorker();
      expect(bullmq.Worker).toHaveBeenCalled();
      expect(worker).toBeDefined();
    });

    test('configures concurrency (default 3)', () => {
      const bullmq = require('bullmq');
      workerModule.createWorker();
      const workerConfig = bullmq.Worker.mock.calls[0];
      // Second arg is processor, third is options
      expect(workerConfig[2]).toHaveProperty('concurrency', 3);
    });

    test('allows concurrency override via WORKER_CONCURRENCY env var', () => {
      process.env.WORKER_CONCURRENCY = '5';
      jest.resetModules();
      jest.mock('bullmq', () => {
        const eventHandlers = {};
        const mockWorker = {
          on: jest.fn((event, handler) => { eventHandlers[event] = handler; }),
          close: jest.fn(async () => {}),
          isRunning: jest.fn(() => true),
        };
        return {
          Worker: jest.fn(() => mockWorker),
          Queue: jest.fn(() => ({
            add: jest.fn(async () => ({ id: 'test-job' })),
            getJobCounts: jest.fn(async () => ({ waiting: 0, active: 0, completed: 0, failed: 0 })),
            close: jest.fn(async () => {}),
          })),
        };
      });
      jest.mock('ioredis', () => jest.fn(() => ({
        get: jest.fn(async () => null),
        set: jest.fn(async () => 'OK'),
        del: jest.fn(async () => 1),
        quit: jest.fn(async () => {}),
        status: 'ready',
      })));
      const mod = require(workerModulePath);
      const bullmq = require('bullmq');
      mod.createWorker();
      const config = bullmq.Worker.mock.calls[0][2];
      expect(config.concurrency).toBe(5);
      delete process.env.WORKER_CONCURRENCY;
    });
  });

  describe('job processor (processJob)', () => {
    test('processJob is exported for testing', () => {
      expect(typeof workerModule.processJob).toBe('function');
    });

    test('routes coaching_analysis jobs correctly', async () => {
      const job = { name: 'analysis', data: { sessionId: 'test-123', userId: 'user-456' } };
      // Should not throw (handler exists even if mocked)
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
      // Should have .listen method (express app)
      expect(typeof app.listen === 'function' || typeof app.get === 'function').toBe(true);
    });
  });
});
