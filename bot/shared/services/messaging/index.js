/**
 * messaging/index.js — channel driver selector.
 *
 *   CHANNEL_DRIVER=meta     → Meta WhatsApp Cloud API (needs WHATSAPP_TOKEN + PHONE_NUMBER_ID + ...)
 *   CHANNEL_DRIVER=baileys  → (default) sandbox WhatsApp Web driver, no Meta account needed
 *
 * Every driver exposes the identical method surface the rest of the bot
 * already depends on (see bot/shared/services/whatsapp.service.js, now a thin
 * facade over this file) — mirrors the shared/services/queue/index.js
 * driver-selector pattern. Unknown/unset CHANNEL_DRIVER resolution (including
 * backward-compat inference for pre-existing Meta deployments) lives in
 * feature-availability.js's resolveChannelDriver so the config file stays the
 * single source of truth for that decision; this file just requires the
 * result and logs when the raw env value didn't name a real driver.
 */

const { DRIVERS, DEFAULT_DRIVER } = require('./channel-registry');
const { resolveChannelDriver } = require('../../config/feature-availability');
const { logToFile } = require('../../utils/logger');

const rawDriver = (process.env.CHANNEL_DRIVER || '').trim().toLowerCase();
const driverName = resolveChannelDriver(process.env);

if (rawDriver && !Object.prototype.hasOwnProperty.call(DRIVERS, rawDriver)) {
  logToFile(
    `⚠️  Unknown CHANNEL_DRIVER="${rawDriver}" — falling back to ${driverName}. Valid values: ${Object.keys(DRIVERS).join(' | ')}.`,
    { level: 'warn' }
  );
}

module.exports = require(DRIVERS[driverName]);
