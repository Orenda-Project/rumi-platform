/**
 * Mock FeatureIntroService for Testing
 *
 * Matches actual interface from shared/services/feature-intro.service.js
 * Updated: 2026-01-13 to match real method signatures
 */

const FeatureIntroService = {
  // Send intro video if this is user's first time using feature
  // Returns boolean indicating if video was sent
  sendFirstUseIntroIfNeeded: jest.fn().mockResolvedValue(false),

  // Mark feature as used (after intro video shown)
  markFeatureUsed: jest.fn().mockResolvedValue(undefined),

  // Check if user has seen intro for feature
  hasSeenIntro: jest.fn().mockResolvedValue(true),

  // Legacy method names (for backwards compatibility)
  showIntro: jest.fn().mockResolvedValue({ success: true }),
  markIntroSeen: jest.fn().mockResolvedValue({ success: true }),

  // Reset helper
  _resetAllMocks: function () {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.sendFirstUseIntroIfNeeded.mockResolvedValue(false);
    this.hasSeenIntro.mockResolvedValue(true);
  }
};

module.exports = FeatureIntroService;
