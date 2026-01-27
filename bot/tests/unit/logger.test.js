// Jest globals are automatically available in Jest 30+

describe('logToFile with correlation', () => {
  let mockGetCurrentCorrelationId;
  let mockConsoleLog;
  let originalConsoleLog;

  beforeEach(() => {
    // Reset modules to allow re-mocking
    jest.resetModules();

    // Mock structured-logger module
    jest.doMock('../../shared/utils/structured-logger', () => ({
      getCurrentCorrelationId: jest.fn()
    }));
    mockGetCurrentCorrelationId = require('../../shared/utils/structured-logger').getCurrentCorrelationId;

    // Capture console.log
    originalConsoleLog = console.log;
    mockConsoleLog = jest.fn();
    console.log = mockConsoleLog;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    jest.resetModules();
  });

  it('should include correlationId when data is provided', () => {
    mockGetCurrentCorrelationId.mockReturnValue('corr-test-123');
    const { logToFile } = require('../../shared/utils/logger');

    logToFile('Test message', { userId: 'user-1' });

    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Test message',
      expect.objectContaining({
        correlationId: 'corr-test-123',
        userId: 'user-1'
      })
    );
  });

  it('should include correlationId even when data is null', () => {
    mockGetCurrentCorrelationId.mockReturnValue('corr-test-123');
    const { logToFile } = require('../../shared/utils/logger');

    logToFile('Test message');  // data defaults to null

    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Test message',
      { correlationId: 'corr-test-123' }
    );
  });

  it('should handle missing correlationId gracefully with data', () => {
    mockGetCurrentCorrelationId.mockReturnValue(undefined);
    const { logToFile } = require('../../shared/utils/logger');

    logToFile('Test message', { userId: 'user-1' });

    // Should not include correlationId key when undefined
    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Test message',
      { userId: 'user-1' }  // Original data unchanged
    );
  });

  it('should call console.log without data when both correlationId and data are missing', () => {
    mockGetCurrentCorrelationId.mockReturnValue(undefined);
    const { logToFile } = require('../../shared/utils/logger');

    logToFile('Test message');  // data defaults to null, no correlationId

    expect(mockConsoleLog).toHaveBeenCalledWith('Test message');  // Single argument
  });

  it('should not overwrite explicitly passed correlationId', () => {
    mockGetCurrentCorrelationId.mockReturnValue('corr-context-123');
    const { logToFile } = require('../../shared/utils/logger');

    logToFile('Test message', { correlationId: 'corr-explicit-456' });

    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Test message',
      expect.objectContaining({
        correlationId: 'corr-explicit-456'  // Explicit takes precedence
      })
    );
  });
});
