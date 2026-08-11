/**
 * fields.js — the human copy for every value the CLI collects.
 *
 * The guard that matters here is coverage: `promptForTargetVars` and the wizard
 * both drive their prompts from this file, so a var added to
 * `CHANNEL_REQUIRED_VARS` without a matching entry would simply never be asked
 * for — and the only symptom would be a deployment that fails its own
 * validate:env after a setup that reported success.
 */

const fields = require('../../bot/scripts/setup/fields');
const validators = require('../../bot/scripts/setup/validators');
const { CHANNEL_REQUIRED_VARS } = require('../../bot/shared/config/feature-availability');

describe('Meta field coverage', () => {
  it('covers exactly the vars the meta channel requires — no more, no fewer', () => {
    const described = fields.META_FIELDS.map((f) => f.env).sort();
    expect(described).toEqual([...CHANNEL_REQUIRED_VARS.meta].sort());
  });

  it('gives every field a human label that is not its env var', () => {
    for (const field of fields.META_FIELDS) {
      expect(field.label).toBeTruthy();
      expect(field.label).not.toBe(field.env);
      expect(field.label).not.toMatch(/_/);
    }
  });

  it('tells you where to find each value, not just what it is called', () => {
    for (const field of fields.META_FIELDS) {
      // Every one of these lives on a specific page of Meta's console; a label
      // without a location is the thing that sends people to a search engine.
      expect(field.hint).toBeTruthy();
      expect(field.hint.length).toBeGreaterThan(40);
    }
  });

  it('shape-checks every field', () => {
    for (const field of fields.META_FIELDS) {
      expect(typeof field.validate).toBe('function');
      expect(field.validate('').ok).toBe(false);
    }
  });

  it('masks the access token and nothing that is merely an id', () => {
    const secrets = fields.META_FIELDS.filter((f) => f.secret).map((f) => f.env);
    expect(secrets).toEqual(['WHATSAPP_TOKEN']);
  });

  it('can generate the one value the user is supposed to invent', () => {
    const webhook = fields.META_FIELDS.find((f) => f.env === 'WEBHOOK_VERIFY_TOKEN');
    const generated = webhook.generate();
    expect(validators.webhookVerifyToken(generated).ok).toBe(true);
    expect(webhook.generate()).not.toBe(generated); // fresh each time
  });
});

describe('fieldsFor', () => {
  it('asks nothing for a sandbox channel — having nothing to register is the point', () => {
    expect(fields.fieldsFor('baileys')).toEqual([]);
  });

  it('has no credentials to collect for a driver it has never heard of', () => {
    expect(fields.fieldsFor('some-future-channel')).toEqual([]);
  });
});

describe('the remaining Meta steps', () => {
  it('names the webhook subscription, which is the silent failure of Meta setup', () => {
    // Meta accepts a callback URL without a field subscription and then never
    // sends anything, which is indistinguishable from a broken bot.
    const text = fields.META_REMAINING_STEPS.join(' ');
    expect(text).toMatch(/subscribe/i);
    expect(text).toMatch(/messages/);
    expect(text).toMatch(/webhook/i);
  });
});

describe('optional extras', () => {
  it('lists keys that the platform actually gates a feature on', () => {
    const { FEATURES } = require('../../bot/shared/config/feature-availability');
    const gatingKeys = new Set(FEATURES.flatMap((f) => [...(f.keys || []), ...(f.keysAny || [])]));
    for (const extra of fields.OPTIONAL_EXTRAS) {
      for (const key of extra.keys) expect(gatingKeys).toContain(key);
    }
  });

  it('says where to get each key', () => {
    for (const extra of fields.OPTIONAL_EXTRAS) expect(extra.where).toBeTruthy();
  });
});
