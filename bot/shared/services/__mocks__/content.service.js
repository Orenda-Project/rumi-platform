/**
 * Mock ContentService for Testing
 */

const ContentService = {
  generateContent: jest.fn().mockResolvedValue({ content: 'Mock content' }),
  getContent: jest.fn().mockResolvedValue('Mock content'),
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
  }
};

module.exports = ContentService;
