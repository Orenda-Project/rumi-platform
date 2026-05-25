/**
 * Region Configuration
 *
 * Maps regions to their default observation framework + holds the framework
 * display labels used by the settings flow and confirmation messages.
 *
 * Region-agnostic by design: there are NO hardcoded region names here. The
 * default framework is env-driven (DEFAULT_OBSERVATION_FRAMEWORK), and a
 * deployment that wants per-region defaults supplies a JSON map via
 * REGION_FRAMEWORK_MAP (e.g. {"punjab":"hots","coast":"teach"}). Unknown or
 * unset regions fall back to the global default. Services must NEVER hardcode
 * region→framework routing — they read it from here.
 */

// Observation framework display names (settings dropdown + confirmations).
const FRAMEWORK_LABELS = {
  oecd: 'OECD 5D Framework',
  hots: 'HOTS Framework',
  teach: 'Teach (World Bank)',
  fico: 'FICO Unified Tool',
};

// Global default framework for regions without an explicit override.
const DEFAULT_FRAMEWORK = process.env.DEFAULT_OBSERVATION_FRAMEWORK || 'oecd';

// Optional per-region overrides, supplied as a JSON object string in the env.
// Keys are lowercased region names; values are framework keys from FRAMEWORK_LABELS.
function parseRegionFrameworkMap() {
  try {
    const parsed = JSON.parse(process.env.REGION_FRAMEWORK_MAP || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const REGION_FRAMEWORK_MAP = parseRegionFrameworkMap();

/**
 * Resolve the default observation framework for a region.
 * @param {string} region - Region name (any case), or empty/undefined.
 * @returns {string} A framework key present in FRAMEWORK_LABELS.
 */
function defaultFrameworkForRegion(region) {
  const key = (region || '').toLowerCase();
  const mapped = REGION_FRAMEWORK_MAP[key];
  if (mapped && FRAMEWORK_LABELS[mapped]) return mapped;
  return DEFAULT_FRAMEWORK;
}

module.exports = {
  FRAMEWORK_LABELS,
  DEFAULT_FRAMEWORK,
  REGION_FRAMEWORK_MAP,
  defaultFrameworkForRegion,
};
