/**
 * Mock WhatsAppService for Testing
 *
 * Replicates the interface of the real WhatsAppService
 * All methods are Jest mock functions for verification
 *
 * @module __mocks__/whatsapp.service
 */

const mockTypingController = {
  stop: jest.fn()
};

const WhatsAppService = {
  // Core messaging methods
  sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'mock_msg_id' }),
  sendVoiceMessage: jest.fn().mockResolvedValue({ success: true }),
  sendImage: jest.fn().mockResolvedValue({ success: true }),
  sendImageFromUrl: jest.fn().mockResolvedValue(true),
  sendDocument: jest.fn().mockResolvedValue({ success: true }),
  sendVideo: jest.fn().mockResolvedValue({ success: true }),
  sendSticker: jest.fn().mockResolvedValue({ success: true }),

  // Typing indicator
  startContinuousTypingIndicator: jest.fn().mockReturnValue(mockTypingController),
  stopTypingIndicator: jest.fn().mockResolvedValue(undefined),

  // Template messages
  sendTemplate: jest.fn().mockResolvedValue({ success: true }),
  sendInteractiveMessage: jest.fn().mockResolvedValue({ success: true }),
  sendListMessage: jest.fn().mockResolvedValue({ success: true }),
  sendButtonMessage: jest.fn().mockResolvedValue({ success: true }),

  // WhatsApp Flows (for reading assessment, etc.)
  sendFlow: jest.fn().mockResolvedValue(true),

  // Feature menu carousel
  sendFeatureMenuCarousel: jest.fn().mockResolvedValue(true),

  // Media handling
  downloadMedia: jest.fn().mockResolvedValue(Buffer.from('mock audio data')),
  uploadMedia: jest.fn().mockResolvedValue({ id: 'mock_media_id' }),

  // Message marking
  markAsRead: jest.fn().mockResolvedValue({ success: true }),

  // Reaction
  sendReaction: jest.fn().mockResolvedValue({ success: true }),

  // Internal helper (exposed for testing)
  _removeEmotionTags: jest.fn().mockImplementation((text) => {
    return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
  }),

  // Reset all mocks (utility for beforeEach)
  _resetAllMocks: function () {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    // Re-setup default implementations
    this.sendMessage.mockResolvedValue({ success: true, messageId: 'mock_msg_id' });
    this.startContinuousTypingIndicator.mockReturnValue(mockTypingController);
    this.downloadMedia.mockResolvedValue(Buffer.from('mock audio data'));
    this._removeEmotionTags.mockImplementation((text) => {
      return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
    });
  }
};

module.exports = WhatsAppService;
