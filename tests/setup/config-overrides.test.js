/**
 * Tests for environment-variable overrides of configuration constants.
 *
 * bd-332: Voice IDs should be env-var overridable
 * bd-338: Rate limit threshold should be env-configurable
 *
 * TDD: This test file was written BEFORE the implementation changes.
 */

// Mock dotenv since it may not be installed at root level
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Voice-related env var names */
const VOICE_ENV_VARS = [
  'ELEVENLABS_VOICE_ID',
  'ELEVENLABS_VOICE_ID_ES',
  'ELEVENLABS_VOICE_ID_AR',
  'UPLIFT_VOICE_ID_UR',
  'UPLIFT_VOICE_ID_SD',
  'UPLIFT_VOICE_ID_BAL',
];

/** Rate-limit env var names */
const RATE_LIMIT_ENV_VARS = [
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_SECONDS',
];

/** All env vars touched by this test suite */
const ALL_ENV_VARS = [...VOICE_ENV_VARS, ...RATE_LIMIT_ENV_VARS];

// ---------------------------------------------------------------------------
// bd-332: Voice IDs should be env-var overridable
// ---------------------------------------------------------------------------

describe('Voice IDs should be env-var overridable (bd-332)', () => {
  let savedEnv;

  beforeEach(() => {
    // Snapshot env vars we care about
    savedEnv = {};
    for (const key of ALL_ENV_VARS) {
      savedEnv[key] = process.env[key];
    }
    // Clear module cache so constants.js re-evaluates
    jest.resetModules();
  });

  afterEach(() => {
    // Restore env vars
    for (const key of ALL_ENV_VARS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    jest.resetModules();
  });

  // -----------------------------------------------------------------------
  // ElevenLabs voice IDs
  // -----------------------------------------------------------------------

  test('ElevenLabs Spanish voice ID reads from ELEVENLABS_VOICE_ID_ES', () => {
    process.env.ELEVENLABS_VOICE_ID_ES = 'custom-spanish-id';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.ELEVENLABS_SPANISH_VOICE_ID).toBe('custom-spanish-id');
  });

  test('ElevenLabs Arabic voice ID reads from ELEVENLABS_VOICE_ID_AR', () => {
    process.env.ELEVENLABS_VOICE_ID_AR = 'custom-arabic-id';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.ELEVENLABS_ARABIC_VOICE_ID).toBe('custom-arabic-id');
  });

  // -----------------------------------------------------------------------
  // Uplift voice IDs
  // -----------------------------------------------------------------------

  test('Uplift Urdu voice ID reads from UPLIFT_VOICE_ID_UR', () => {
    process.env.UPLIFT_VOICE_ID_UR = 'custom-urdu-id';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.UPLIFT_VOICE_ID).toBe('custom-urdu-id');
  });

  test('Uplift Sindhi voice ID reads from UPLIFT_VOICE_ID_SD', () => {
    process.env.UPLIFT_VOICE_ID_SD = 'custom-sindhi-id';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.UPLIFT_SINDHI_VOICE_ID).toBe('custom-sindhi-id');
  });

  test('Uplift Balochi voice ID reads from UPLIFT_VOICE_ID_BAL', () => {
    process.env.UPLIFT_VOICE_ID_BAL = 'custom-balochi-id';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.UPLIFT_BALOCHI_VOICE_ID).toBe('custom-balochi-id');
  });

  // -----------------------------------------------------------------------
  // Defaults (no env vars set)
  // -----------------------------------------------------------------------

  test('Voice IDs fall back to defaults when env vars not set', () => {
    // Ensure the override env vars are NOT set
    delete process.env.ELEVENLABS_VOICE_ID_ES;
    delete process.env.ELEVENLABS_VOICE_ID_AR;
    delete process.env.UPLIFT_VOICE_ID_UR;
    delete process.env.UPLIFT_VOICE_ID_SD;
    delete process.env.UPLIFT_VOICE_ID_BAL;

    const constants = require('../../bot/shared/utils/constants');

    // Each voice ID should have a non-empty default (the current hardcoded values)
    expect(constants.ELEVENLABS_SPANISH_VOICE_ID).toBeTruthy();
    expect(constants.ELEVENLABS_SPANISH_VOICE_ID).toBe('vYui54mlc1I9tFZBBz4i');

    expect(constants.ELEVENLABS_ARABIC_VOICE_ID).toBeTruthy();
    expect(constants.ELEVENLABS_ARABIC_VOICE_ID).toBe('4wf10lgibMnboGJGCLrP');

    expect(constants.UPLIFT_VOICE_ID).toBeTruthy();
    expect(constants.UPLIFT_VOICE_ID).toBe('v_8eelc901');

    expect(constants.UPLIFT_SINDHI_VOICE_ID).toBeTruthy();
    expect(constants.UPLIFT_SINDHI_VOICE_ID).toBe('v_sd0kl3m9');

    expect(constants.UPLIFT_BALOCHI_VOICE_ID).toBeTruthy();
    expect(constants.UPLIFT_BALOCHI_VOICE_ID).toBe('v_bl1de2f7');
  });

  // -----------------------------------------------------------------------
  // VOICE_MODELS picks up overridden voice IDs
  // -----------------------------------------------------------------------

  test('VOICE_MODELS uses overridden voice IDs', () => {
    process.env.ELEVENLABS_VOICE_ID_ES = 'custom-es';
    process.env.ELEVENLABS_VOICE_ID_AR = 'custom-ar';
    process.env.UPLIFT_VOICE_ID_UR = 'custom-ur';
    process.env.UPLIFT_VOICE_ID_SD = 'custom-sd';
    process.env.UPLIFT_VOICE_ID_BAL = 'custom-bal';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.VOICE_MODELS.es.voiceId).toBe('custom-es');
    expect(constants.VOICE_MODELS.ar.voiceId).toBe('custom-ar');
    expect(constants.VOICE_MODELS.ur.voiceId).toBe('custom-ur');
    expect(constants.VOICE_MODELS['sd-PK'].voiceId).toBe('custom-sd');
    expect(constants.VOICE_MODELS['bal-PK'].voiceId).toBe('custom-bal');
  });
});

// ---------------------------------------------------------------------------
// bd-338: Rate limit should be env-configurable
// ---------------------------------------------------------------------------

describe('Rate limit should be env-configurable (bd-338)', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ALL_ENV_VARS) {
      savedEnv[key] = process.env[key];
    }
    jest.resetModules();
  });

  afterEach(() => {
    for (const key of ALL_ENV_VARS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    jest.resetModules();
  });

  test('Rate limit max reads from RATE_LIMIT_MAX env var', () => {
    process.env.RATE_LIMIT_MAX = '50';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.RATE_LIMIT_MAX).toBe(50);
  });

  test('Rate limit window reads from RATE_LIMIT_WINDOW_SECONDS env var', () => {
    process.env.RATE_LIMIT_WINDOW_SECONDS = '120';

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.RATE_LIMIT_WINDOW_SECONDS).toBe(120);
  });

  test('Rate limit falls back to defaults (30/60s) when env vars not set', () => {
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;

    const constants = require('../../bot/shared/utils/constants');

    expect(constants.RATE_LIMIT_MAX).toBe(30);
    expect(constants.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });
});
