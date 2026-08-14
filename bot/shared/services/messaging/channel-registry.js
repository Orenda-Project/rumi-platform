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
  // slack: './slack-channel.service' — added once the Slack driver ships.
};

const DEFAULT_DRIVER = 'baileys';

// Drivers that require a formal business registration / app-review process —
// the thing that actually makes a channel "production-grade" here. Every
// driver NOT in this list is sandbox-tier by default.
const PRODUCTION_TIER_DRIVERS = ['meta'];

// Additive-channel drivers (Slack, Discord, ...) are never selected via
// CHANNEL_DRIVER — they run alongside whichever WhatsApp-family driver
// (meta|baileys) is active, gated by their own env-var presence (see
// feature-availability.js#resolveActiveChannels). Each gets a wire prefix so
// messaging/index.js's router can tell "slack:U0123ABC" apart from a bare
// WhatsApp phone number without any DB/session lookup. WhatsApp itself is
// intentionally NOT in this map — a bare phone number has no prefix and
// falls through to the single resolved CHANNEL_DRIVER, unchanged.
const CHANNEL_PREFIXES = {
  // slack: 'slack' — added once the Slack driver ships.
};

function isKnownDriver(name) {
  return Object.prototype.hasOwnProperty.call(DRIVERS, name);
}

function isProductionTier(name) {
  return PRODUCTION_TIER_DRIVERS.includes(name);
}

/** The wire prefix an additive-channel driver's identifiers carry (e.g. "slack"), or null for WhatsApp. */
function prefixFor(driverName) {
  return CHANNEL_PREFIXES[driverName] || null;
}

/**
 * Which additive-channel driver owns this identifier, based on its
 * "<prefix>:<id>" shape — or null for a bare WhatsApp phone number (no
 * colon), which the router falls back to the resolved CHANNEL_DRIVER for.
 */
function driverForIdentifier(id) {
  const idx = String(id).indexOf(':');
  if (idx === -1) return null;
  const prefix = String(id).slice(0, idx);
  return Object.keys(CHANNEL_PREFIXES).find((name) => CHANNEL_PREFIXES[name] === prefix) || null;
}

module.exports = {
  DRIVERS,
  DEFAULT_DRIVER,
  PRODUCTION_TIER_DRIVERS,
  CHANNEL_PREFIXES,
  isKnownDriver,
  isProductionTier,
  prefixFor,
  driverForIdentifier,
};
