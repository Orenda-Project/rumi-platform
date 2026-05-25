/**
 * region — generic, global region resolution.
 *
 * Rumi is deployed worldwide, so region handling is config-driven, not
 * hardcoded to any country. The deployment's region comes from the
 * DEFAULT_REGION env var; a teacher's region (if known) comes from
 * `users.region`. Per-region feature behaviour lives in the region_features
 * table — see region-features.service.js.
 */

const DEFAULT_REGION = 'default';

/** The deployment's region (set DEFAULT_REGION in .env; falls back to 'default'). */
function detectRegion() {
  const r = (process.env.DEFAULT_REGION || '').toLowerCase().trim();
  return r || DEFAULT_REGION;
}

/** A teacher's region: their stored region if present, else the deployment default. */
function getUserRegion(user) {
  const r = user && typeof user.region === 'string' ? user.region.toLowerCase().trim() : '';
  return r || detectRegion();
}

module.exports = { detectRegion, getUserRegion, DEFAULT_REGION };
