/**
 * messaging/index.js — channel driver router.
 *
 *   CHANNEL_DRIVER=meta     → Meta WhatsApp Cloud API (needs WHATSAPP_TOKEN + PHONE_NUMBER_ID + ...)
 *   CHANNEL_DRIVER=baileys  → (default) sandbox WhatsApp Web driver, no Meta account needed
 *
 * Plus any additive channels (Slack, Discord, ...) whose own env vars are
 * present (see feature-availability.js#resolveActiveChannels) — these run
 * CONCURRENTLY alongside the one resolved WhatsApp-family driver, not instead
 * of it. A deployment with none configured loads exactly one driver, exactly
 * as before this router existed.
 *
 * Every driver exposes the identical method surface the rest of the bot
 * already depends on (see bot/shared/services/whatsapp.service.js, now a thin
 * facade over this file) — mirrors the shared/services/queue/index.js
 * driver-selector pattern. Unknown/unset CHANNEL_DRIVER resolution (including
 * backward-compat inference for pre-existing Meta deployments) lives in
 * feature-availability.js's resolveChannelDriver so the config file stays the
 * single source of truth for that decision; this file just requires the
 * result and logs when the raw env value didn't name a real driver.
 *
 * Dispatch: every exported method takes the same first argument every
 * existing call site already passes (`to`/`from` — a bare WhatsApp phone
 * number, or, for an additive channel, a "<prefix>:<id>" identifier minted
 * once by that channel's inbound adapter — see channel-registry.js). A bare
 * phone number has no prefix and routes to the resolved WhatsApp driver,
 * unchanged; ~500 existing call sites need zero changes because of this.
 */

const { DRIVERS, DEFAULT_DRIVER, driverForIdentifier } = require('./channel-registry');
const { resolveChannelDriver, resolveActiveChannels } = require('../../config/feature-availability');
const { logToFile } = require('../../utils/logger');

const rawDriver = (process.env.CHANNEL_DRIVER || '').trim().toLowerCase();
const whatsappDriverName = resolveChannelDriver(process.env);

if (rawDriver && !Object.prototype.hasOwnProperty.call(DRIVERS, rawDriver)) {
  logToFile(
    `⚠️  Unknown CHANNEL_DRIVER="${rawDriver}" — falling back to ${whatsappDriverName}. Valid values: ${Object.keys(DRIVERS).join(' | ')}.`,
    { level: 'warn' }
  );
}

const activeChannelNames = resolveActiveChannels(process.env);
const whatsappDriver = require(DRIVERS[whatsappDriverName]);

const additiveDrivers = {};
for (const name of activeChannelNames) {
  additiveDrivers[name] = require(DRIVERS[name]);
}

/**
 * The export IS the WhatsApp-family driver object itself (via a Proxy), not
 * a fresh plain object copying its methods over — this matters beyond style:
 * meta-channel.service.js has ~13 internal cross-method calls
 * (sendImageFromUrl calling this.sendImage, etc.), and existing tests
 * jest.spyOn() the facade to intercept exactly those calls
 * (tests/whatsapp/send-image-from-url.test.js). A copied-methods router
 * object is a DIFFERENT object than the driver class, so `this` inside the
 * driver's own methods would still correctly resolve to the driver (runtime
 * behavior is fine either way), but spying on the copy would no longer
 * intercept the driver's internal calls (a real regression, verified while
 * building this). Proxying the driver directly preserves identity for the
 * common (no additive channel involved) case, so every existing call site,
 * spy, and `instanceof`-adjacent assumption keeps working unchanged.
 *
 * The trap only special-cases actual send methods, and only when `to` (the
 * proxied call's first argument) carries an additive-channel prefix — every
 * other property access (extra static properties, non-send methods) falls
 * straight through to the real WhatsApp driver via Reflect.get, untouched.
 */
module.exports = new Proxy(whatsappDriver, {
  get(target, prop, receiver) {
    const original = Reflect.get(target, prop, receiver);
    if (typeof original !== 'function' || Object.keys(additiveDrivers).length === 0) {
      return original;
    }
    return function routed(to, ...args) {
      const driverName = driverForIdentifier(to);
      if (!driverName) return original.apply(this === receiver ? target : this, [to, ...args]);

      const driver = additiveDrivers[driverName];
      if (!driver || typeof driver[prop] !== 'function') {
        throw new Error(`Channel driver "${driverName}" has no method "${String(prop)}" (identifier: ${to})`);
      }
      return driver[prop](to, ...args);
    };
  },
});
