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

/**
 * A teacher's market region for language/localisation purposes.
 *
 * `users.region` stores a fine-grained state/province that does not map 1:1 to a
 * market. For language gating we want the country-level market so all of a
 * country's states share one language set: a teacher whose country is India
 * resolves to the 'india' region_features row (which lists the Indian languages)
 * regardless of their state. Everyone else falls back to the normal per-user
 * region. The India tag is data in region_features, not hardcoded behaviour here.
 */
function getUserLanguageRegion(user) {
  const country = user && typeof user.country === 'string' ? user.country.toLowerCase().trim() : '';
  if (country === 'in' || country === 'india') return 'india';
  return getUserRegion(user);
}

module.exports = { detectRegion, getUserRegion, getUserLanguageRegion, DEFAULT_REGION };
