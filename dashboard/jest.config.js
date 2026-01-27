module.exports = {
  testEnvironment: 'node',
  testRegex: '(github-api|redis-cache|rls-policies|middleware|services|.*\\.service|ui\\.e2e)\\.test\\.js$',
  testTimeout: 30000, // Increased for database operations
  verbose: true,
  setupFiles: ['<rootDir>/tests/setup.js']
};
