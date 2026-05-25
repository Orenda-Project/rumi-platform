/**
 * queue/index.js — driver selector.
 * Default (unset / "sqs") returns the SQS singleton; "bullmq" returns the BullMQ
 * singleton; an unknown value falls back to sqs. aws-sdk is mocked (bot-only dep,
 * not installed at root test time); bullmq is NOT required unless selected.
 */

function mockCommon() {
  jest.doMock('aws-sdk', () => ({
    config: { update: jest.fn() },
    SQS: jest.fn(() => ({})),
  }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ set: jest.fn() }), { virtual: true });
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ getCurrentCorrelationId: () => 'c1', logEvent: jest.fn() }));
}

afterEach(() => {
  jest.resetModules();
  delete process.env.QUEUE_DRIVER;
});

describe('queue driver selector', () => {
  it('defaults to the SQS singleton when QUEUE_DRIVER is unset', () => {
    jest.resetModules();
    mockCommon();
    const idx = require('../../bot/shared/services/queue');
    const sqs = require('../../bot/shared/services/queue/sqs-queue.service');
    expect(idx).toBe(sqs);
  });

  it('returns the BullMQ singleton when QUEUE_DRIVER=bullmq', () => {
    jest.resetModules();
    mockCommon();
    process.env.QUEUE_DRIVER = 'bullmq';
    const idx = require('../../bot/shared/services/queue');
    const bullmq = require('../../bot/shared/services/queue/bullmq-queue.service');
    expect(idx).toBe(bullmq);
  });

  it('falls back to SQS for an unknown QUEUE_DRIVER value', () => {
    jest.resetModules();
    mockCommon();
    process.env.QUEUE_DRIVER = 'kafka';
    const idx = require('../../bot/shared/services/queue');
    const sqs = require('../../bot/shared/services/queue/sqs-queue.service');
    expect(idx).toBe(sqs);
  });

  it('does NOT load the bullmq package on the default (sqs) path', () => {
    jest.resetModules();
    mockCommon();
    // If index.js eagerly required bullmq, this virtual mock would be hit; we
    // assert the module simply loads without bullmq being installed/needed.
    let bullmqRequired = false;
    jest.doMock('bullmq', () => { bullmqRequired = true; return {}; }, { virtual: true });
    require('../../bot/shared/services/queue');
    expect(bullmqRequired).toBe(false);
  });
});
