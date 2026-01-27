/**
 * Mock ContextService for Testing
 */

const ContextService = {
  shouldInjectContext: jest.fn().mockReturnValue({
    shouldInject: false,
    featureType: null,
    mode: null
  }),
  getUserFeatureContext: jest.fn().mockResolvedValue(null),
  setUserContext: jest.fn().mockResolvedValue(true),
  clearUserContext: jest.fn().mockResolvedValue(true),
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.shouldInjectContext.mockReturnValue({ shouldInject: false, featureType: null, mode: null });
  }
};

module.exports = ContextService;
