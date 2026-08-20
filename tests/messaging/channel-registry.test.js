/**
 * channel-registry — pure data, no env/process logic. Confirms the shape the
 * rest of the messaging module (and feature-availability.js) builds on: a
 * default-sandbox rule with an explicit production allowlist, not a per-driver
 * tag someone has to remember to set. Also confirms the additive-channel
 * concept (Slack, Discord, ...) — drivers that run ALONGSIDE the one
 * WhatsApp-family driver (meta|baileys) via their own env-var presence,
 * never selected through CHANNEL_DRIVER, each carrying a wire prefix so
 * messaging/index.js's router can dispatch to them by identifier shape.
 */

const registry = require('../../bot/shared/services/messaging/channel-registry');

describe('channel-registry', () => {
  it('lists meta and baileys as the WhatsApp-family drivers, defaulting to baileys', () => {
    expect(Object.keys(registry.DRIVERS)).toEqual(expect.arrayContaining(['baileys', 'meta']));
    expect(registry.DEFAULT_DRIVER).toBe('baileys');
  });

  it('lists slack and discord as additive channel drivers, alongside the WhatsApp-family ones', () => {
    expect(registry.DRIVERS.slack).toBe('./slack-channel.service');
    expect(registry.DRIVERS.discord).toBe('./discord-channel.service');
  });

  it('meta, slack, and discord are the production-tier drivers — baileys is sandbox only', () => {
    expect(registry.PRODUCTION_TIER_DRIVERS.sort()).toEqual(['discord', 'meta', 'slack']);
    expect(registry.isProductionTier('meta')).toBe(true);
    expect(registry.isProductionTier('slack')).toBe(true);
    expect(registry.isProductionTier('discord')).toBe(true);
    expect(registry.isProductionTier('baileys')).toBe(false);
    // A hypothetical future driver not yet on the allowlist is sandbox by default.
    expect(registry.isProductionTier('telegram')).toBe(false);
  });

  it('isKnownDriver reflects exactly the DRIVERS map', () => {
    expect(registry.isKnownDriver('meta')).toBe(true);
    expect(registry.isKnownDriver('baileys')).toBe(true);
    expect(registry.isKnownDriver('slack')).toBe(true);
    expect(registry.isKnownDriver('discord')).toBe(true);
    expect(registry.isKnownDriver('telegram')).toBe(false);
  });

  it('slack/discord carry their own wire prefix; WhatsApp-family drivers carry none', () => {
    expect(registry.prefixFor('slack')).toBe('slack');
    expect(registry.prefixFor('discord')).toBe('discord');
    expect(registry.prefixFor('meta')).toBeNull();
    expect(registry.prefixFor('baileys')).toBeNull();
  });

  it('driverForIdentifier resolves a prefixed identifier to its driver, and a bare phone number to null', () => {
    expect(registry.driverForIdentifier('slack:U0123ABC')).toBe('slack');
    expect(registry.driverForIdentifier('discord:918273645')).toBe('discord');
    expect(registry.driverForIdentifier('923001234567')).toBeNull();
  });
});
