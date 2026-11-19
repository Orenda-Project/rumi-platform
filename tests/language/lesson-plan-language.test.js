/**
 * Lesson-plan / presentation language selection — regression contract.
 *
 * detectRequestedLanguage decides which language a Gamma lesson plan is
 * generated in. It used to know only Urdu/Arabic/Spanish, so "in Hindi" (and
 * every other Indian language) silently produced an English plan even though
 * gamma-languages.config.js supported it.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const { detectRequestedLanguage } = require('../../bot/shared/utils/language-detection');
const { getSupportedLanguages } = require('../../bot/shared/config/gamma-languages.config');

describe('detectRequestedLanguage', () => {
  describe('explicit requests', () => {
    it.each([
      ['Make a lesson plan on fractions in Hindi', 'hi'],
      ['lesson plan on plants hindi mein', 'hi'],
      ['भिन्न पर lesson plan हिंदी में बनाओ', 'hi'],
      ['photosynthesis lesson plan in Marathi', 'mr'],
      ['lesson plan in Bengali on rivers', 'bn'],
      ['lesson plan banglay', 'bn'],
      ['lesson plan in Telugu', 'te'],
      ['lesson plan telugu lo', 'te'],
      ['lesson plan in Tamil for class 3', 'ta-IN'],
      ['lesson plan in Kannada', 'kn'],
      ['lesson plan kannada dalli', 'kn'],
      ['lesson plan on the water cycle in French', 'fr'],
      ['lesson plan in urdu', 'ur'],
      ['lesson plan in arabic', 'ar'],
      ['lesson plan in spanish', 'es'],
    ])('"%s" → %s', (message, expected) => {
      expect(detectRequestedLanguage(message)).toBe(expected);
    });

    it('an explicit request wins over the saved language', () => {
      expect(detectRequestedLanguage('lesson plan in tamil', { preferredLanguage: 'hi' }))
        .toBe('ta-IN');
      expect(detectRequestedLanguage('lesson plan in urdu', { preferredLanguage: 'hi' })).toBe('ur');
    });

    it('does not fire on a longer word that merely starts with a trigger', () => {
      expect(detectRequestedLanguage('lesson plan on hindi meanings of words in english')).toBe('en');
      expect(detectRequestedLanguage('lesson plan on tamil language history')).toBe('en');
    });
  });

  describe('message written in an Indian script', () => {
    it.each([
      ['कक्षा 4 के लिए भिन्न पर पाठ योजना', 'hi'],
      ['নদী নিয়ে একটি পাঠ পরিকল্পনা', 'bn'],
      ['నదుల గురించి పాఠ ప్రణాళిక', 'te'],
      ['ஆறுகள் பற்றிய பாடத் திட்டம்', 'ta-IN'],
      ['ನದಿಗಳ ಬಗ್ಗೆ ಪಾಠ ಯೋಜನೆ', 'kn'],
    ])('"%s" → %s', (message, expected) => {
      expect(detectRequestedLanguage(message)).toBe(expected);
    });

    it('Devanagari from a Marathi teacher → Marathi', () => {
      expect(detectRequestedLanguage('नद्यांवर पाठ योजना', { preferredLanguage: 'mr' })).toBe('mr');
    });

    it('a single Indic word in an English message stays English', () => {
      expect(detectRequestedLanguage('lesson plan on the festival of दिवाली for grade 4 students')).toBe('en');
    });
  });

  describe('saved-language fallback', () => {
    it.each(['hi', 'bn', 'mr', 'te', 'ta-IN', 'kn'])('Indian-language teacher (%s) gets their language by default', (code) => {
      expect(detectRequestedLanguage('lesson plan on fractions class 4', { preferredLanguage: code })).toBe(code);
    });

    it.each(['ur', 'ar', 'es', 'fr', 'pa-PK', 'ta-LK'])('non-Indian saved language (%s) keeps the English default', (code) => {
      expect(detectRequestedLanguage('lesson plan on fractions class 4', { preferredLanguage: code })).toBe('en');
    });

    it('defaults to English with no message or saved language', () => {
      expect(detectRequestedLanguage('lesson plan on fractions')).toBe('en');
      expect(detectRequestedLanguage(null)).toBe('en');
      expect(detectRequestedLanguage(undefined, { preferredLanguage: 'hi' })).toBe('hi');
    });
  });

  // Drift guard: the "plan is ready" message must exist in every Gamma language.
  it('the worker has status messages for every Gamma lesson-plan language', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../bot/workers/lesson-plan-generation.worker.js'), 'utf8');
    getSupportedLanguages().forEach((code) => {
      expect(src).toMatch(new RegExp(`^\\s+'?${code}'?: \\{`, 'm'));
    });
  });

  // Drift guard: every language Gamma can generate in must be reachable.
  it('every Gamma lesson-plan language can be requested explicitly', () => {
    const { REQUEST_TRIGGERS } = require('../../bot/shared/utils/language-detection');
    const reachable = REQUEST_TRIGGERS.map((t) => t.code).concat('en');
    getSupportedLanguages().forEach((code) => expect(reachable).toContain(code));
  });
});
