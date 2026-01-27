/**
 * Mock VideoOrchestrator for Testing
 *
 * Matches actual interface from shared/services/video/video-orchestrator.service.js
 * Updated: 2026-01-13 to match real method signatures
 */

const VideoOrchestrator = {
  // Main entry point - static async initiateVideoRequest(user, from, sessionId, language, topic = null)
  initiateVideoRequest: jest.fn().mockResolvedValue(undefined),

  // Ask for topic - static async askForTopic(from, userId, sessionId, language)
  askForTopic: jest.fn().mockResolvedValue(undefined),

  // Check if awaiting topic - returns { sessionId, language } or null
  checkAwaitingTopic: jest.fn().mockResolvedValue(null),

  // Clear awaiting topic state
  clearAwaitingTopic: jest.fn().mockResolvedValue(undefined),

  // Ask for language selection - static async askForLanguage(from, userId, sessionId, topic)
  askForLanguage: jest.fn().mockResolvedValue(undefined),

  // Handle language selection response
  handleLanguageSelection: jest.fn().mockResolvedValue(undefined),

  // Handle customization response
  handleCustomizationResponse: jest.fn().mockResolvedValue(undefined),

  // Reset helper
  _resetAllMocks: function () {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    // Re-setup defaults
    this.initiateVideoRequest.mockResolvedValue(undefined);
    this.checkAwaitingTopic.mockResolvedValue(null);
  }
};

module.exports = VideoOrchestrator;
