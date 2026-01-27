/**
 * Mock FeatureRegistrationService for Testing
 *
 * Updated: 2026-01-14 to match complete interface
 */

const FeatureRegistrationService = {
  isPendingName: jest.fn().mockResolvedValue(false),
  handleNameResponse: jest.fn().mockResolvedValue({ success: true, firstName: 'Test' }),
  startRegistration: jest.fn().mockResolvedValue({ success: true }),
  isRegistrationComplete: jest.fn().mockResolvedValue(true),
  getRegistrationStatus: jest.fn().mockResolvedValue({ status: 'complete' }),

  // Feature count for recovery registration (BUG-002)
  countUserFeatures: jest.fn().mockResolvedValue(0),

  // Start feature-based registration flow
  startFeatureBasedRegistration: jest.fn().mockResolvedValue({ success: true }),

  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.isPendingName.mockResolvedValue(false);
    this.startRegistration.mockResolvedValue({ success: true });
    this.countUserFeatures.mockResolvedValue(0);
  }
};

module.exports = FeatureRegistrationService;
