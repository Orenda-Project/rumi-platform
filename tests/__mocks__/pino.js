/**
 * Pino logger mock for OSS test suite.
 * Pino is a runtime dependency in bot/node_modules but not the root.
 * All log calls are no-ops in tests.
 */

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockReturnThis(),
  level: 'info',
};

const pino = jest.fn(() => logger);
pino.destination = jest.fn(() => ({}));
pino.multistream = jest.fn(() => ({}));
pino.stdTimeFunctions = { isoTime: jest.fn() };

module.exports = pino;
