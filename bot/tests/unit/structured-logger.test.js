// Jest globals are automatically available in Jest 30+

describe('logEvent', () => {
  let logSpy;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (logSpy) {
      logSpy.mockRestore();
    }
  });

  it('should parse event name into feature/action/result', () => {
    const { logEvent, logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    logEvent('video.generation.started', { requestId: 'req-123' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.generation.started',
        feature: 'video',
        action: 'generation',
        result: 'started',
        requestId: 'req-123'
      }),
      'video.generation.started'
    );
  });

  it('should include correlationId from context', () => {
    const { logEvent, runWithCorrelation, logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    runWithCorrelation('corr-test-789', () => {
      logEvent('coaching.session.completed', { sessionId: 'sess-1' });
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-test-789'
      }),
      expect.any(String)
    );
  });

  it('should handle two-part event names', () => {
    const { logEvent, logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    logEvent('feature.completed', { id: 'test-1' });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'feature.completed',
        feature: 'feature',
        action: 'completed',
        result: undefined
      }),
      'feature.completed'
    );
  });

  it('should handle single-part event names', () => {
    const { logEvent, logger } = require('../../shared/utils/structured-logger');
    logSpy = jest.spyOn(logger, 'info');

    logEvent('initialized', {});

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'initialized',
        feature: 'initialized',
        action: undefined,
        result: undefined
      }),
      'initialized'
    );
  });
});
