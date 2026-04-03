/**
 * Framework Registry
 *
 * Single source of truth for all observation framework modules.
 * Lazy-loads framework modules on first access and caches them.
 *
 * Bead: bd-596 (Phase 1C)
 */

const { logToFile } = require('../../../utils/logger');

// ─── Lazy loaders ────────────────────────────────────────────────────

const registry = {
  oecd:  () => require('./oecd-framework'),
  hots:  () => require('./hots-framework'),
  teach: () => require('./teach-framework'),
  fico:  () => require('./fico-framework'),
};

// ─── Cache ───────────────────────────────────────────────────────────

const cache = {};

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get a framework module by key. Throws if key is unknown.
 * @param {string} key - Framework key (oecd, hots, teach, fico)
 * @returns {object} Framework module
 */
function getFramework(key) {
  if (!registry[key]) {
    throw new Error(`Unknown framework: ${key}`);
  }

  if (!cache[key]) {
    cache[key] = registry[key]();
    logToFile(`[framework-registry] Loaded framework: ${key}`);
  }

  return cache[key];
}

/**
 * List all registered framework keys.
 * @returns {string[]}
 */
function listFrameworks() {
  return Object.keys(registry);
}

module.exports = { getFramework, listFrameworks };
