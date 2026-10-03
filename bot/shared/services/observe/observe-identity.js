/**
 * Where a person can be reached — moved to messaging/user-identity.js, since
 * the portal's setup link and reset code need the same answer as observe.
 * Kept so observe's callers (and their tests' mocks) keep this path.
 */
module.exports = require('../messaging/user-identity');
