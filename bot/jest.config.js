/**
 * Jest Configuration
 * For running unit and integration tests
 */

module.exports = {
  // Test environment - use custom options to avoid localStorage issues in Node.js 25+
  testEnvironment: 'node',
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
    // Disable Web Storage APIs to avoid Node.js 25 SecurityError
    experimentalVmModules: false,
  },

  // Disable localStorage/sessionStorage to avoid Node.js 25 SecurityError
  globals: {
    localStorage: undefined,
    sessionStorage: undefined
  },

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '!**/node_modules/**',
    '!**/e2e/**'  // Exclude E2E tests (separate test runner)
  ],

  // Setup files
  setupFilesAfterEnv: [],

  // Coverage settings
  collectCoverageFrom: [
    'shared/**/*.js',
    '!shared/config/**',
    '!**/node_modules/**'
  ],

  // Timeout for async tests (5 minutes for E2E)
  testTimeout: 300000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Force exit after tests complete
  forceExit: true
};
