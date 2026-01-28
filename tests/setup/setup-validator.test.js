/**
 * Tests for setup-validator — boot-time validator that checks
 * environment variables for flow configuration on startup.
 *
 * TDD: This test file was written BEFORE the implementation.
 */

const { validateBootRequirements } = require('../../bot/shared/utils/setup-validator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save and restore process.env around each test */
const FLOW_ENV_VARS = [
  'READING_ASSESSMENT_FLOW_ID',
  'ATTENDANCE_SETUP_FLOW_ID',
  'ATTENDANCE_MARKING_FLOW_ID',
  'FLOW_PRIVATE_KEY',
  'INTERNAL_API_KEY',
];

describe('validateBootRequirements', () => {
  let savedEnv;

  beforeEach(() => {
    // Snapshot the env vars we care about
    savedEnv = {};
    for (const key of FLOW_ENV_VARS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    // Suppress console output during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore env vars
    for (const key of FLOW_ENV_VARS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Return shape
  // -----------------------------------------------------------------------
  describe('return shape', () => {
    it('returns { ok, warnings, errors } structure', () => {
      const result = validateBootRequirements();

      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('errors');
      expect(typeof result.ok).toBe('boolean');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('is a synchronous function (no Promise returned)', () => {
      const result = validateBootRequirements();

      // Should NOT be a Promise
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.ok).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // All env vars set — happy path
  // -----------------------------------------------------------------------
  describe('all env vars set', () => {
    it('returns ok=true with no warnings and no errors', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      process.env.ATTENDANCE_MARKING_FLOW_ID = 'flow_am_3';
      process.env.FLOW_PRIVATE_KEY = 'private_key_data';
      process.env.INTERNAL_API_KEY = 'test-api-key';

      const result = validateBootRequirements();

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // READING_ASSESSMENT_FLOW_ID not set
  // -----------------------------------------------------------------------
  describe('READING_ASSESSMENT_FLOW_ID not set', () => {
    it('warns when READING_ASSESSMENT_FLOW_ID is not set', () => {
      // Leave READING_ASSESSMENT_FLOW_ID unset
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      process.env.ATTENDANCE_MARKING_FLOW_ID = 'flow_am_3';
      process.env.FLOW_PRIVATE_KEY = 'private_key_data';

      const result = validateBootRequirements();

      expect(result.ok).toBe(true); // Warnings don't block
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/READING_ASSESSMENT_FLOW_ID/),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // ATTENDANCE_SETUP_FLOW_ID not set
  // -----------------------------------------------------------------------
  describe('ATTENDANCE_SETUP_FLOW_ID not set', () => {
    it('warns when ATTENDANCE_SETUP_FLOW_ID is not set', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      // Leave ATTENDANCE_SETUP_FLOW_ID unset
      process.env.ATTENDANCE_MARKING_FLOW_ID = 'flow_am_3';
      process.env.FLOW_PRIVATE_KEY = 'private_key_data';

      const result = validateBootRequirements();

      expect(result.ok).toBe(true); // Warnings don't block
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/ATTENDANCE_SETUP_FLOW_ID/),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // ATTENDANCE_MARKING_FLOW_ID not set
  // -----------------------------------------------------------------------
  describe('ATTENDANCE_MARKING_FLOW_ID not set', () => {
    it('warns when ATTENDANCE_MARKING_FLOW_ID is not set', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      // Leave ATTENDANCE_MARKING_FLOW_ID unset
      process.env.FLOW_PRIVATE_KEY = 'private_key_data';

      const result = validateBootRequirements();

      expect(result.ok).toBe(true); // Warnings don't block
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/ATTENDANCE_MARKING_FLOW_ID/),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // FLOW_PRIVATE_KEY missing when attendance flows are set
  // -----------------------------------------------------------------------
  describe('FLOW_PRIVATE_KEY missing with attendance flows set', () => {
    it('errors when ATTENDANCE_SETUP_FLOW_ID is set but FLOW_PRIVATE_KEY is missing', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      // FLOW_PRIVATE_KEY not set, ATTENDANCE_MARKING_FLOW_ID not set

      const result = validateBootRequirements();

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/FLOW_PRIVATE_KEY/),
        ]),
      );
    });

    it('errors when ATTENDANCE_MARKING_FLOW_ID is set but FLOW_PRIVATE_KEY is missing', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      process.env.ATTENDANCE_MARKING_FLOW_ID = 'flow_am_3';
      // FLOW_PRIVATE_KEY not set, ATTENDANCE_SETUP_FLOW_ID not set

      const result = validateBootRequirements();

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/FLOW_PRIVATE_KEY/),
        ]),
      );
    });

    it('errors when both attendance flow IDs are set but FLOW_PRIVATE_KEY is missing', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      process.env.ATTENDANCE_MARKING_FLOW_ID = 'flow_am_3';
      // FLOW_PRIVATE_KEY not set

      const result = validateBootRequirements();

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/FLOW_PRIVATE_KEY/),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // FLOW_PRIVATE_KEY missing without attendance flows — no error
  // -----------------------------------------------------------------------
  describe('FLOW_PRIVATE_KEY missing without attendance flows', () => {
    it('does not error when FLOW_PRIVATE_KEY is missing and no attendance flows are set', () => {
      process.env.READING_ASSESSMENT_FLOW_ID = 'flow_ra_1';
      // No attendance flows set, no FLOW_PRIVATE_KEY set

      const result = validateBootRequirements();

      // Should not have errors — just warnings for missing attendance flows
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Console output
  // -----------------------------------------------------------------------
  describe('console output', () => {
    it('logs warnings with [setup-validator] prefix', () => {
      // Leave all flow IDs unset

      validateBootRequirements();

      expect(console.warn).toHaveBeenCalled();
      const warnCalls = console.warn.mock.calls.map((call) => call[0]);
      expect(warnCalls.some((msg) => msg.includes('[setup-validator]'))).toBe(true);
    });

    it('logs errors with [setup-validator] prefix', () => {
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      // FLOW_PRIVATE_KEY not set

      validateBootRequirements();

      expect(console.error).toHaveBeenCalled();
      const errorCalls = console.error.mock.calls.map((call) => call[0]);
      expect(errorCalls.some((msg) => msg.includes('[setup-validator]'))).toBe(true);
    });

    it('logs setup command hint when there are errors', () => {
      process.env.ATTENDANCE_SETUP_FLOW_ID = 'flow_as_2';
      // FLOW_PRIVATE_KEY not set

      validateBootRequirements();

      const logCalls = console.error.mock.calls.map((call) => call[0]);
      expect(
        logCalls.some((msg) => msg.includes('run-full-setup.js')),
      ).toBe(true);
    });

    it('does not log setup command hint when there are only warnings', () => {
      // Leave READING_ASSESSMENT_FLOW_ID unset — warning only

      validateBootRequirements();

      const errorCalls = console.error.mock.calls.map((call) => call[0]);
      expect(
        errorCalls.some((msg) => msg.includes('run-full-setup.js')),
      ).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // All env vars missing
  // -----------------------------------------------------------------------
  describe('all env vars missing', () => {
    it('returns ok=true with warnings but no errors (no attendance flows means no FLOW_PRIVATE_KEY error)', () => {
      // All env vars are already deleted in beforeEach

      const result = validateBootRequirements();

      expect(result.ok).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
