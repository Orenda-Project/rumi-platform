// Jest globals are automatically available in Jest 30+

describe('withSpan', () => {
  let logSpy;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (logSpy) {
      logSpy.mockRestore();
    }
  });

  it('should track duration of successful operations', async () => {
    const { withSpan } = require('../../shared/utils/tracing');
    const { logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    await withSpan('test.operation', async (span) => {
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      return 'result';
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        span: 'test.operation',
        status: 'ok',
        durationMs: expect.any(Number)
      }),
      'span.test.operation.ok'
    );

    // Duration should be >= 100ms
    const callArg = logSpy.mock.calls[0][0];
    expect(callArg.durationMs).toBeGreaterThanOrEqual(100);
  });

  it('should log error status when function throws', async () => {
    const { withSpan } = require('../../shared/utils/tracing');
    const { logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    await expect(
      withSpan('failing.operation', async () => {
        throw new Error('Test failure');
      })
    ).rejects.toThrow('Test failure');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        span: 'failing.operation',
        status: 'error',
        'error.type': 'Error',
        'error.message': 'Test failure'
      }),
      'span.failing.operation.error'
    );
  });

  it('should link parent and child spans', async () => {
    const { withSpan } = require('../../shared/utils/tracing');
    const { logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    await withSpan('parent.operation', async (parentSpan) => {
      await withSpan('child.operation', async () => {
        return 'child result';
      }, parentSpan.spanId);
      return 'parent result';
    });

    // Find child span log
    const childLog = logSpy.mock.calls.find(call => call[0].span === 'child.operation');
    const parentLog = logSpy.mock.calls.find(call => call[0].span === 'parent.operation');

    expect(childLog[0].parentSpanId).toBe(parentLog[0].spanId);
  });

  it('should return the result of the wrapped function', async () => {
    const { withSpan } = require('../../shared/utils/tracing');
    const { logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    const result = await withSpan('return.operation', async () => {
      return { value: 42 };
    });

    expect(result).toEqual({ value: 42 });
  });

  it('should allow setting span attributes', async () => {
    const { withSpan } = require('../../shared/utils/tracing');
    const { logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    await withSpan('attributed.operation', async (span) => {
      span.setAttribute('userId', 'user-123');
      span.setAttribute('feature', 'video');
      return 'done';
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        span: 'attributed.operation',
        userId: 'user-123',
        feature: 'video'
      }),
      expect.any(String)
    );
  });
});
