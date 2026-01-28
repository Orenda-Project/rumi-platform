/**
 * Security tests — bd-331 and bd-336
 *
 * bd-331: INTERNAL_API_KEY must not have a hardcoded default in whatsapp-bot.js
 * bd-336: MMS_SERVICE_URL localhost should warn in production
 *
 * TDD: These tests are written BEFORE the fixes.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// bd-331: INTERNAL_API_KEY hardcoded default
// ---------------------------------------------------------------------------

describe('bd-331: INTERNAL_API_KEY security', () => {
  // -------------------------------------------------------------------------
  // Test 1: whatsapp-bot.js should not have hardcoded INTERNAL_API_KEY default
  // -------------------------------------------------------------------------
  describe('whatsapp-bot.js source code', () => {
    it('should not have hardcoded INTERNAL_API_KEY default', () => {
      const botPath = path.resolve(__dirname, '../../bot/whatsapp-bot.js');
      const source = fs.readFileSync(botPath, 'utf8');

      // Must NOT contain the known insecure default
      expect(source).not.toContain("'rumi-internal-2025'");

      // Must NOT contain any fallback pattern like: process.env.INTERNAL_API_KEY || 'something'
      // This regex matches: process.env.INTERNAL_API_KEY || 'any-string'
      const fallbackPattern = /process\.env\.INTERNAL_API_KEY\s*\|\|\s*['"][^'"]+['"]/;
      expect(source).not.toMatch(fallbackPattern);
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: setup-validator should warn when INTERNAL_API_KEY is not set
  // -------------------------------------------------------------------------
  describe('setup-validator INTERNAL_API_KEY check', () => {
    let savedEnv;

    beforeEach(() => {
      savedEnv = {
        INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
        NODE_ENV: process.env.NODE_ENV,
      };
      delete process.env.INTERNAL_API_KEY;
      // Suppress console output during tests
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      // Restore env vars
      if (savedEnv.INTERNAL_API_KEY !== undefined) {
        process.env.INTERNAL_API_KEY = savedEnv.INTERNAL_API_KEY;
      } else {
        delete process.env.INTERNAL_API_KEY;
      }
      if (savedEnv.NODE_ENV !== undefined) {
        process.env.NODE_ENV = savedEnv.NODE_ENV;
      } else {
        delete process.env.NODE_ENV;
      }
      jest.restoreAllMocks();
    });

    it('should warn when INTERNAL_API_KEY is not set', () => {
      // INTERNAL_API_KEY is already deleted in beforeEach
      const { validateBootRequirements } = require('../../bot/shared/utils/setup-validator');
      const result = validateBootRequirements();

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/INTERNAL_API_KEY/),
        ]),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// bd-336: MMS_SERVICE_URL localhost warning in production
// ---------------------------------------------------------------------------

describe('bd-336: MMS_SERVICE_URL production warning', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      MMS_SERVICE_URL: process.env.MMS_SERVICE_URL,
    };
    // Suppress console output during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 3: should warn when MMS_SERVICE_URL is localhost in production
  // -------------------------------------------------------------------------
  it('should warn when MMS_SERVICE_URL is localhost in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.MMS_SERVICE_URL = 'http://localhost:8000';

    const { validateBootRequirements } = require('../../bot/shared/utils/setup-validator');
    const result = validateBootRequirements();

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/MMS_SERVICE_URL/),
      ]),
    );
  });

  it('should warn when MMS_SERVICE_URL is not set in production (defaults to localhost)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MMS_SERVICE_URL;

    const { validateBootRequirements } = require('../../bot/shared/utils/setup-validator');
    const result = validateBootRequirements();

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/MMS_SERVICE_URL/),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: should NOT warn about MMS_SERVICE_URL in development
  // -------------------------------------------------------------------------
  it('should NOT warn about MMS_SERVICE_URL in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.MMS_SERVICE_URL = 'http://localhost:8000';

    const { validateBootRequirements } = require('../../bot/shared/utils/setup-validator');
    const result = validateBootRequirements();

    // Should not contain any warning about MMS_SERVICE_URL
    const mmsWarnings = result.warnings.filter((w) => w.includes('MMS_SERVICE_URL'));
    expect(mmsWarnings).toHaveLength(0);
  });
});
