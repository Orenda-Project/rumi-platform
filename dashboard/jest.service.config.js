/**
 * Jest Configuration for Service Tests
 * Simplified config without localStorage setup (causes issues in Node v25+)
 */

module.exports = {
  testEnvironment: 'node',
  testRegex: '.*\\.service\\.test\\.js$',
  testTimeout: 30000, // Increased for database operations
  verbose: true,
  // Don't use setup.js - it has localStorage which causes issues in Node v25
  // Service tests don't need browser APIs
};
