/**
 * channel-registry — pure data, no env/process logic. Confirms the shape the
 * rest of the messaging module (and feature-availability.js) builds on: a
 * default-sandbox rule with an explicit production allowlist, not a per-driver
 * tag someone has to remember to set.
 */

const registry = require('../../bot/shared/services/messaging/channel-registry');

describe('channel-registry', () => {
  it('lists meta and baileys as the v1 drivers, defaulting to baileys', () => {
    expect(Object.keys(registry.DRIVERS).sort()).toEqual(['baileys', 'meta']);
    expect(registry.DEFAULT_DRIVER).toBe('baileys');
  });

  it('meta is the only production-tier driver — everything else is sandbox by default', () => {
    expect(registry.PRODUCTION_TIER_DRIVERS).toEqual(['meta']);
    expect(registry.isProductionTier('meta')).toBe(true);
    expect(registry.isProductionTier('baileys')).toBe(false);
    // A hypothetical future driver not yet on the allowlist is sandbox by default.
    expect(registry.isProductionTier('slack')).toBe(false);
  });

  it('isKnownDriver reflects exactly the DRIVERS map', () => {
    expect(registry.isKnownDriver('meta')).toBe(true);
    expect(registry.isKnownDriver('baileys')).toBe(true);
    expect(registry.isKnownDriver('telegram')).toBe(false);
  });
});
