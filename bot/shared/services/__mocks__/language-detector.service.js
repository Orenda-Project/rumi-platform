/**
 * Mock LanguageDetectorService for Testing
 */

const LanguageDetectorService = {
  detectLanguage: jest.fn().mockResolvedValue('en'),
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.detectLanguage.mockResolvedValue('en');
  }
};

module.exports = LanguageDetectorService;
