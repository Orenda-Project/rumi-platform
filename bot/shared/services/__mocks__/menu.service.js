/**
 * Mock MenuService for Testing
 *
 * Matches actual interface from shared/services/menu.service.js
 * Updated: 2026-01-13 to match real method signatures
 */

const MenuService = {
  // Main menu send method - static async sendMenu(from, userId, sessionId, language = 'en')
  sendMenu: jest.fn().mockResolvedValue(undefined),

  // Handle carousel/list button response
  handleMenuButtonResponse: jest.fn().mockResolvedValue(undefined),

  // Handle text-based menu choice
  handleMenuChoice: jest.fn().mockResolvedValue({ handled: true }),

  // Private methods exposed for testing
  _handleLessonPlanningChoice: jest.fn().mockResolvedValue(undefined),
  _handleMediaLibraryChoice: jest.fn().mockResolvedValue(undefined),
  _handleClassroomCoachingChoice: jest.fn().mockResolvedValue(undefined),
  _sendTextMenuFallback: jest.fn().mockResolvedValue(undefined),
  _updateConversationState: jest.fn().mockResolvedValue(undefined),

  // Lesson plan topic state management
  checkAwaitingLessonPlanTopic: jest.fn().mockResolvedValue(null),
  clearAwaitingLessonPlanTopic: jest.fn().mockResolvedValue(undefined),
  setAwaitingLessonPlanTopic: jest.fn().mockResolvedValue(undefined),

  // Reset helper
  _resetAllMocks: function () {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    // Re-setup defaults
    this.sendMenu.mockResolvedValue(undefined);
    this.handleMenuChoice.mockResolvedValue({ handled: true });
    this.checkAwaitingLessonPlanTopic.mockResolvedValue(null);
  }
};

module.exports = MenuService;
