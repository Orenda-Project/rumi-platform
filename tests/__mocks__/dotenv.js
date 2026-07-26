/**
 * dotenv mock for the OSS test suite.
 * dotenv is a runtime dependency in bot/node_modules but not the root, and the
 * root test job runs before `bot/ npm ci`. Tests set env via tests/setup.js, so
 * `config()`/`parse()` are no-ops here.
 */

module.exports = {
  config: jest.fn(() => ({ parsed: {} })),
  parse: jest.fn(() => ({})),
};
