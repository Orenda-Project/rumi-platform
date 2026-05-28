/**
 * Sprint 1 TDD: Branding Configuration Tests (bd-228)
 *
 * RED phase: These tests define the API contract for config/branding.js
 * The module must export bot name, org name, languages, and support contact,
 * all overridable via environment variables.
 */

const path = require('path');

// The module under test — does not exist yet (RED phase)
const brandingPath = path.resolve(__dirname, '../../../bot/shared/config/branding.js');

describe('Branding Configuration', () => {
  let branding;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache so env var changes take effect
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('default values', () => {
    beforeEach(() => {
      // Clear any override env vars
      delete process.env.BOT_NAME;
      delete process.env.ORG_NAME;
      delete process.env.SUPPORT_CONTACT;
      branding = require(brandingPath);
    });

    test('exports botName with default value "Rumi"', () => {
      expect(branding.botName).toBe('Rumi');
    });

    test('exports orgName with a non-empty default', () => {
      expect(branding.orgName).toBeDefined();
      expect(typeof branding.orgName).toBe('string');
      expect(branding.orgName.length).toBeGreaterThan(0);
    });

    test('exports supportedLanguages as a non-empty array', () => {
      expect(Array.isArray(branding.supportedLanguages)).toBe(true);
      expect(branding.supportedLanguages.length).toBeGreaterThan(0);
    });

    test('supportedLanguages includes English and Urdu by default', () => {
      const codes = branding.supportedLanguages.map(l => l.code);
      expect(codes).toContain('en');
      expect(codes).toContain('ur');
    });

    test('each language has code, name, and direction', () => {
      branding.supportedLanguages.forEach(lang => {
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('name');
        expect(lang).toHaveProperty('direction');
        expect(['ltr', 'rtl']).toContain(lang.direction);
      });
    });

    test('exports supportContact as null when SUPPORT_CONTACT is unset', () => {
      // Brand contacts have no safe default in the OSS: a missing env var
      // makes the contact info undefined for downstream consumers, who
      // omit the "contact support" line rather than ship a placeholder.
      expect(branding.supportContact).toBeNull();
    });

    test('exports defaultLanguage as "en"', () => {
      expect(branding.defaultLanguage).toBe('en');
    });
  });

  describe('environment variable overrides', () => {
    test('BOT_NAME env var overrides botName', () => {
      process.env.BOT_NAME = 'MyBot';
      branding = require(brandingPath);
      expect(branding.botName).toBe('MyBot');
    });

    test('ORG_NAME env var overrides orgName', () => {
      process.env.ORG_NAME = 'My Organization';
      branding = require(brandingPath);
      expect(branding.orgName).toBe('My Organization');
    });

    test('SUPPORT_CONTACT env var overrides supportContact', () => {
      process.env.SUPPORT_CONTACT = 'help@example.com';
      branding = require(brandingPath);
      expect(branding.supportContact).toBe('help@example.com');
    });
  });

  describe('branding helpers', () => {
    beforeEach(() => {
      delete process.env.BOT_NAME;
      branding = require(brandingPath);
    });

    test('getWelcomeMessage() returns string containing bot name', () => {
      const msg = branding.getWelcomeMessage('en');
      expect(typeof msg).toBe('string');
      expect(msg).toContain(branding.botName);
    });

    test('getWelcomeMessage() works for Urdu', () => {
      const msg = branding.getWelcomeMessage('ur');
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    });

    test('getWelcomeMessage() falls back to English for unknown language', () => {
      const msg = branding.getWelcomeMessage('zz');
      expect(typeof msg).toBe('string');
      expect(msg).toContain(branding.botName);
    });

    test('isLanguageSupported() returns true for supported languages', () => {
      expect(branding.isLanguageSupported('en')).toBe(true);
      expect(branding.isLanguageSupported('ur')).toBe(true);
    });

    test('isLanguageSupported() returns false for unsupported languages', () => {
      expect(branding.isLanguageSupported('zz')).toBe(false);
    });
  });
});
