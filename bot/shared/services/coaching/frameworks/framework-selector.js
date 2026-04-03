/**
 * Framework Selector
 *
 * Reads user preferences and region to determine which observation
 * framework module to use for coaching analysis.
 *
 * Priority:
 *   1. Explicit user preference (preferences.observation_framework)
 *   2. Region default (Punjab/Sindh → HOTS, others → OECD)
 *   3. Global default → OECD
 *
 * Bead: bd-596 (Phase 1C)
 */

const supabase = require('../../../config/supabase');
const { logToFile } = require('../../../utils/logger');
const { getFramework } = require('./framework-registry');

const HOTS_DEFAULT_REGIONS = ['punjab', 'sindh'];
const DEFAULT_FRAMEWORK = 'oecd';

/**
 * Select the appropriate framework module for a user.
 * @param {string} userId - User UUID
 * @returns {Promise<object>} Framework module
 */
async function selectFramework(userId) {
  try {
    const { data } = await supabase
      .from('users')
      .select('region, preferences')
      .eq('id', userId)
      .single();

    if (!data) {
      logToFile(`[framework-selector] No user found for ${userId}, using default: ${DEFAULT_FRAMEWORK}`);
      return getFramework(DEFAULT_FRAMEWORK);
    }

    // 1. Explicit preference takes priority
    const explicit = data.preferences?.observation_framework;
    if (explicit) {
      logToFile(`[framework-selector] User ${userId} has explicit preference: ${explicit}`);
      return getFramework(explicit);
    }

    // 2. Region-based default
    const region = (data.region || '').toLowerCase();
    if (HOTS_DEFAULT_REGIONS.includes(region)) {
      logToFile(`[framework-selector] User ${userId} region ${region} → hots`);
      return getFramework('hots');
    }

    // 3. Global default
    logToFile(`[framework-selector] User ${userId} region ${region} → default: ${DEFAULT_FRAMEWORK}`);
    return getFramework(DEFAULT_FRAMEWORK);

  } catch (err) {
    logToFile(`[framework-selector] Error selecting framework for ${userId}: ${err.message}, using default`);
    return getFramework(DEFAULT_FRAMEWORK);
  }
}

module.exports = { selectFramework };
