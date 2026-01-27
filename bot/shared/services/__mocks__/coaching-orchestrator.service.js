/**
 * Mock CoachingService for Testing
 */

const CoachingService = {
  hasActiveSession: jest.fn().mockResolvedValue(false),
  getActiveSession: jest.fn().mockResolvedValue(null),
  startCoachingSession: jest.fn().mockResolvedValue({ success: true }),
  handleCoachingResponse: jest.fn().mockResolvedValue({ success: true }),
  endCoachingSession: jest.fn().mockResolvedValue({ success: true }),
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.hasActiveSession.mockResolvedValue(false);
  }
};

module.exports = CoachingService;
