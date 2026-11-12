/**
 * live-state — is a saved setting also in the running bot?
 *
 * A key saved while the bot runs lands in `.env` but not in the process, so it
 * only takes effect after a restart. The console compares the file with the
 * running process to say "on after restart" instead of a misleading "on".
 *
 * @module console/live-state
 */

const { isSet } = require('../shared/config/feature-availability');

/**
 * @param {string[]} keys
 * @param {object|null} liveEnv the running process's env, or null when there is
 *   no running bot to compare with (the wizard's standalone console)
 * @param {{anyOf?: boolean}} [opts] anyOf: one key is enough
 * @returns {boolean}
 */
function isLive(keys, liveEnv, { anyOf = false } = {}) {
  if (liveEnv === null || liveEnv === undefined) return true;
  const set = (k) => isSet(liveEnv[k]);
  return anyOf ? keys.some(set) : keys.every(set);
}

module.exports = { isLive };
