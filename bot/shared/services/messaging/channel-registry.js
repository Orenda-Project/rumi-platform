/**
 * channel-registry — static map of known messaging channel drivers.
 *
 * Adding a channel (e.g. Slack) is a two-line change: a DRIVERS entry pointing
 * at its service module, and — only if it requires a formal business
 * registration process the way Meta does — an addition to
 * PRODUCTION_TIER_DRIVERS. Every driver not listed there is sandbox-tier by
 * default; no per-driver tagging to remember.
 *
 * This file holds data only, no env/process logic, so it has zero
 * dependencies and can be required from anywhere (feature-availability.js,
 * messaging/index.js, doctor.js) without risk of a require cycle.
 */

const DRIVERS = {
  meta: './meta-channel.service',
  baileys: './baileys-channel.service',
};

const DEFAULT_DRIVER = 'baileys';

// Drivers that require a formal business registration / app-review process —
// the thing that actually makes a channel "production-grade" here. Every
// driver NOT in this list is sandbox-tier by default.
const PRODUCTION_TIER_DRIVERS = ['meta'];

function isKnownDriver(name) {
  return Object.prototype.hasOwnProperty.call(DRIVERS, name);
}

function isProductionTier(name) {
  return PRODUCTION_TIER_DRIVERS.includes(name);
}

module.exports = { DRIVERS, DEFAULT_DRIVER, PRODUCTION_TIER_DRIVERS, isKnownDriver, isProductionTier };
