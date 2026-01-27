/**
 * Mock HelperAgentService for Testing
 *
 * Updated: 2026-01-14 to match complete interface
 */

const HelperAgentService = {
  // Main query handling
  handleQuery: jest.fn().mockResolvedValue({ response: 'Mock response' }),

  // Check if message is a helper query
  isHelperQuery: jest.fn().mockReturnValue(false),

  // Capability inquiry detection
  detectCapabilityInquiry: jest.fn().mockResolvedValue({
    detected: false,
    registrationRequested: false,
    guidanceMessage: null
  }),

  // Get escape path message for current state
  getEscapePathMessage: jest.fn().mockReturnValue('Type /menu to see options'),

  // Reset helper
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.isHelperQuery.mockReturnValue(false);
    this.detectCapabilityInquiry.mockResolvedValue({ detected: false });
    this.getEscapePathMessage.mockReturnValue('Type /menu to see options');
  }
};

module.exports = HelperAgentService;
