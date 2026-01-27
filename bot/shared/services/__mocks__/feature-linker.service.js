/**
 * Mock FeatureLinkerService for Testing
 */

const FeatureLinkerService = {
  linkFeature: jest.fn().mockResolvedValue({ success: true }),
  getLinkedFeatures: jest.fn().mockResolvedValue([]),
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
  }
};

module.exports = FeatureLinkerService;
