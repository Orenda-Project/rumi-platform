/**
 * feature-overrides — an operator's on/off switch, layered over presence gating.
 *
 * Rumi decides what is available by PRESENCE: a feature is on iff its keys are
 * set. That is a good default and it stays the default. What it cannot express
 * is "I want to pause this for a week without losing the key" — and deleting a
 * credential to switch a feature off, then pasting it back, is how credentials
 * get lost.
 *
 * So this adds exactly one thing: a switch that can turn a feature OFF. It can
 * never turn one ON. A feature whose key is missing stays off whatever the
 * switch says, because calling a service with no credentials is a crash, not a
 * feature.
 *
 * Two properties this module must keep:
 *
 *   - **It requires nothing.** `feature-availability.js` is loaded by
 *     `rumi doctor`, `validate-env.js` and `bin/rumi.js`, all of which must run
 *     on a machine with no database and, in CI, before `bot/ npm ci`. A
 *     top-level require here would break all three.
 *   - **Reads are synchronous.** `isFeatureAvailable()` is a pure synchronous
 *     function that a lot of code depends on. Making it async to consult a
 *     database would be a far larger change than the feature is worth.
 *
 * Storage is the `.env` file (`RUMI_FEATURE_<ID>=off`), which means no database
 * is required, the state survives a restart, and an operator can see and undo
 * it with a text editor. The in-memory cache is updated at the same time as the
 * file, so a toggle takes effect on the very next message rather than at the
 * next restart.
 *
 * @module shared/config/feature-overrides
 */

/** `.env` keys look like this. Kept here so nothing else has to build the name. */
const PREFIX = 'RUMI_FEATURE_';

/** id -> false. Absent means enabled; only "off" is ever stored. */
let cache = Object.create(null);

/** @param {string} id @returns {string} the env var that stores this override */
function envVarFor(id) {
  return PREFIX + String(id || '').toUpperCase();
}

/**
 * Load the switches from an environment. Called once at startup and again
 * after a save, so `process.env` and the cache never disagree.
 *
 * @param {object} [env]
 */
function load(env = process.env) {
  const next = Object.create(null);
  for (const [key, value] of Object.entries(env || {})) {
    if (!key.startsWith(PREFIX)) continue;
    if (String(value).trim().toLowerCase() === 'off') {
      next[key.slice(PREFIX.length).toLowerCase()] = false;
    }
  }
  cache = next;
  return cache;
}

/**
 * Is this feature switched on? Unknown ids are on — the switch only subtracts,
 * so anything we have never heard of behaves exactly as it did before.
 *
 * @param {string} id
 * @returns {boolean}
 */
function isEnabled(id) {
  return cache[String(id || '').toLowerCase()] !== false;
}

/** Update the cache immediately; the caller persists to `.env`. */
function setEnabled(id, enabled) {
  const key = String(id || '').toLowerCase();
  if (enabled) delete cache[key];
  else cache[key] = false;
  return isEnabled(key);
}

/** Everything currently switched off. */
function snapshot() {
  return { ...cache };
}

module.exports = { load, isEnabled, setEnabled, snapshot, envVarFor, PREFIX };
