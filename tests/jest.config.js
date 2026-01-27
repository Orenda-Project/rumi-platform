/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
  ],
  // Note: Tests must run BEFORE `cd bot && npm ci`. When bot/node_modules
  // exists, Node resolves bullmq/ioredis from bot/node_modules instead of
  // using Jest's mocks. CI workflow handles this ordering correctly.
  setupFiles: ['<rootDir>/tests/setup.js'],
  testEnvironment: 'node',
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  verbose: true,
  collectCoverageFrom: [
    'bot/shared/**/*.js',
    'dashboard/services/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  testTimeout: 30000,
};
