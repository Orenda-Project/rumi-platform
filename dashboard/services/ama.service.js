/**
 * AMA (Ask Me Anything) Service - Open Source Version
 *
 * The AMA feature allows admins to query data using natural language.
 * In the open-source version, this uses safe parameterized queries
 * instead of the exec_sql RPC function (removed for security).
 *
 * For the full AMA feature with natural language SQL, you would need
 * to create a secure exec_sql function with proper guardrails.
 * See docs/customization.md for details.
 *
 * @license Apache-2.0
 */

const FEATURE_DISABLED_MESSAGE = 'The AMA (Ask Me Anything) feature requires additional database configuration for the open-source version. See docs/customization.md for setup instructions.';

/**
 * Process an AMA query (disabled in open-source by default)
 */
async function processAMAQuery(query, userId) {
  return {
    success: false,
    message: FEATURE_DISABLED_MESSAGE,
    type: 'feature_disabled'
  };
}

/**
 * Get query suggestions (disabled in open-source by default)
 */
async function getQuerySuggestions() {
  return {
    success: false,
    message: FEATURE_DISABLED_MESSAGE,
    suggestions: []
  };
}

module.exports = {
  processAMAQuery,
  getQuerySuggestions,
};
