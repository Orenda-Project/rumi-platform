/**
 * The operator switch, and the promise that it cannot break a deployment.
 *
 * The invariant worth defending: an override may only ever SUBTRACT. A feature
 * with no key stays off whatever the switch says, and a deployment that sets no
 * switches must behave byte-identically to one from before the layer existed.
 */

const overrides = require('../../bot/shared/config/feature-overrides');
const fa = require('../../bot/shared/config/feature-availability');

const KEYED = {
  SONIOX_API_KEY: 'x'.repeat(30),
  ELEVENLABS_API_KEY: 'y'.repeat(30),
  GAMMA_API_KEY: 'z'.repeat(30),
};

afterEach(() => overrides.load({}));

describe('the module is safe to load anywhere', () => {
  it('imports nothing, so `rumi doctor` still runs with no database and no bot/node_modules', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../bot/shared/config/feature-overrides.js'), 'utf8',
    );
    expect(src).not.toMatch(/^\s*(?:const|let|var).*=\s*require\(/m);
  });
});

describe('a deployment with no switches is unchanged', () => {
  it('reports every keyed feature as available, exactly as before', () => {
    overrides.load({});
    expect(fa.availableFeatures(KEYED).sort()).toEqual(fa.configuredFeatures(KEYED).sort());
  });

  it('treats an unknown id as on — the switch only subtracts', () => {
    expect(overrides.isEnabled('a_feature_that_does_not_exist')).toBe(true);
  });
});

describe('switching a feature off', () => {
  it('removes it from what is available but not from what is configured', () => {
    overrides.load({ ...KEYED, RUMI_FEATURE_TTS_ELEVENLABS: 'off' });
    const tts = 'Spoken replies (text-to-speech, ElevenLabs)';
    expect(fa.availableFeatures(KEYED)).not.toContain(tts);
    expect(fa.configuredFeatures(KEYED)).toContain(tts);
  });

  it('cannot switch a feature ON when its key is missing', () => {
    // There is nothing to turn on: calling a service with no credentials is a
    // crash, not a feature.
    overrides.load({});
    expect(fa.isFeatureAvailable('Video generation (Kie.ai)', KEYED)).toBe(false);
  });

  it('only counts the literal value "off", so a stray value does not disable anything', () => {
    overrides.load({ RUMI_FEATURE_TTS_ELEVENLABS: 'false' });
    expect(overrides.isEnabled('tts_elevenlabs')).toBe(true);
    overrides.load({ RUMI_FEATURE_TTS_ELEVENLABS: 'OFF' });
    expect(overrides.isEnabled('tts_elevenlabs')).toBe(false);
  });

  it('applies immediately in-process when set, without waiting for a restart', () => {
    overrides.load({});
    expect(overrides.isEnabled('tts_elevenlabs')).toBe(true);
    overrides.setEnabled('tts_elevenlabs', false);
    expect(overrides.isEnabled('tts_elevenlabs')).toBe(false);
    expect(fa.availableFeatures(KEYED)).not.toContain('Spoken replies (text-to-speech, ElevenLabs)');
  });
});

describe('ids are explicit and stable', () => {
  it('gives every feature an id, so an override can be addressed at all', () => {
    for (const feature of fa.FEATURES) {
      expect(typeof feature.id).toBe('string');
      expect(feature.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('keeps them unique', () => {
    const ids = fa.FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('documents every id in .env.template, since the var name is computed and no guard would catch it', () => {
    const fs = require('fs');
    const path = require('path');
    const template = fs.readFileSync(path.join(__dirname, '../../.env.template'), 'utf8');
    for (const feature of fa.FEATURES) {
      expect(template).toContain(overrides.envVarFor(feature.id));
    }
  });

  it('derives the env var name predictably', () => {
    expect(overrides.envVarFor('tts_elevenlabs')).toBe('RUMI_FEATURE_TTS_ELEVENLABS');
  });
});

describe('required services and channels have no switch', () => {
  it('exposes no override for the database, the LLM or Redis', () => {
    // A "turn off Supabase" switch would be a self-destruct button.
    const ids = new Set(fa.FEATURES.map((f) => f.id));
    for (const required of ['supabase', 'openrouter', 'redis', 'database']) {
      expect(ids.has(required)).toBe(false);
    }
  });

  it('leaves channel resolution untouched by overrides', () => {
    // resolveChannelDriver and resolveActiveChannels are consulted at require
    // time by messaging/index.js; an override there would be misleading at best.
    const env = { ...KEYED, SLACK_BOT_TOKEN: 'x'.repeat(30), SLACK_SIGNING_SECRET: 'y'.repeat(30) };
    overrides.load({ ...env, RUMI_FEATURE_CHANNEL_SLACK: 'off' });
    expect(fa.resolveActiveChannels(env)).toContain('slack');
  });

  it('does not change missingRequired', () => {
    overrides.load({ RUMI_FEATURE_STT_SONIOX: 'off' });
    expect(fa.missingRequired({})).toEqual(
      expect.arrayContaining(['SUPABASE_URL', 'OPENROUTER_API_KEY']),
    );
  });
});

describe('the legacy call shapes still work', () => {
  it('accepts a bare keys array', () => {
    expect(fa.isFeatureAvailable(['SONIOX_API_KEY'], KEYED)).toBe(true);
    expect(fa.isFeatureAvailable(['KIE_API_KEY'], KEYED)).toBe(false);
  });

  it('accepts a feature name and an entry object identically', () => {
    const entry = fa.FEATURES.find((f) => f.id === 'stt_soniox');
    expect(fa.isFeatureAvailable(entry.name, KEYED)).toBe(fa.isFeatureAvailable(entry, KEYED));
  });

  it('ignoreOverrides asks the presence question alone', () => {
    overrides.load({ RUMI_FEATURE_STT_SONIOX: 'off' });
    const entry = fa.FEATURES.find((f) => f.id === 'stt_soniox');
    expect(fa.isFeatureAvailable(entry, KEYED)).toBe(false);
    expect(fa.isFeatureAvailable(entry, KEYED, { ignoreOverrides: true })).toBe(true);
  });
});
