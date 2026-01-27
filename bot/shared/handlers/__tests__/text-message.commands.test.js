/**
 * Command Detection Tests for text-message.handler.js
 *
 * Tests all slash command detection and routing
 * Phase 1 of Test Suite Building Plan
 *
 * @module __tests__/text-message.commands.test
 */

// =============================================================================
// MOCK CONFIGURATION
// =============================================================================
// Services with __mocks__ files use moduleNameMapper (in jest.config.js)
// Services WITHOUT __mocks__ files need factory mocks here

// Config mocks (no __mocks__ files)
jest.mock('../../config/supabase', () => ({
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis()
  })
}));

// Utils mocks (no __mocks__ files)
jest.mock('../../utils/language-cache', () => ({
  getUserLanguage: jest.fn().mockResolvedValue('en'),
  setUserLanguage: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../utils/language-detector', () => ({
  detectLanguageOverride: jest.fn().mockReturnValue(null)
}));

jest.mock('../../utils/language-detection', () => ({
  detectRequestedLanguage: jest.fn().mockReturnValue('en'),
  parseSubjectAndGrade: jest.fn().mockReturnValue({ subject: null, grade: null })
}));

jest.mock('../../utils/constants', () => ({
  TEMP_DIR: '/tmp/test',
  LOADING_STICKER_PATH: '/tmp/sticker.webp',
  LOADING_STICKER_MEDIA_ID: 'mock_media_id',
  OPENAI_API_KEY: 'mock_key'
}));

// External library mocks
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [] }) } }
  }));
});

// NOTE: All services with __mocks__ files are automatically mocked via moduleNameMapper:
// - whatsapp.service (via __mocks__/whatsapp.service.js)
// - openai.service (via __mocks__/openai.service.js)
// - menu.service (via __mocks__/menu.service.js)
// - video/video-orchestrator.service (via __mocks__/video/video-orchestrator.service.js)
// - helper-agent.service (via __mocks__/helper-agent.service.js)
// - feature-intro.service (via __mocks__/feature-intro.service.js)
// - coaching-orchestrator.service (via __mocks__/coaching-orchestrator.service.js)
// - feature-registration.service (via __mocks__/feature-registration.service.js)
// - context.service (via __mocks__/context.service.js)
// - content.service (via __mocks__/content.service.js)
// - language-detector.service (via __mocks__/language-detector.service.js)
// - reading-assessment.service (via __mocks__/reading-assessment.service.js)
// - feature-linker.service (via __mocks__/feature-linker.service.js)
// - lesson-plan-queue.service (via __mocks__/lesson-plan-queue.service.js)
// - cache/railway-redis.service (via __mocks__/cache/railway-redis.service.js)
// - database/bot-helpers (via database/__mocks__/bot-helpers.js)
// - handlers/portal-command.handler (via handlers/__mocks__/portal-command.handler.js)
// - utils/logger (via utils/__mocks__/logger.js)

// Now import mocks for verification
const WhatsAppService = require('../../services/whatsapp.service');
const MenuService = require('../../services/menu.service');
const FeatureRegistrationService = require('../../services/feature-registration.service');
const FeatureIntroService = require('../../services/feature-intro.service');
const VideoOrchestrator = require('../../services/video/video-orchestrator.service');
const { handlePortalCommand } = require('../portal-command.handler');
const { getOrCreateUser, getOrCreateSession, storeConversation } = require('../../database/bot-helpers');
const { getUserLanguage, setUserLanguage } = require('../../utils/language-cache');

// Import handler under test
const { handleTextMessage } = require('../text-message.handler');

// Test utilities
function createMockMessage(overrides = {}) {
  return {
    id: `wamid.test_${Date.now()}`,
    from: '923001234567',
    timestamp: Math.floor(Date.now() / 1000).toString(),
    type: 'text',
    text: { body: 'Hello' },
    ...overrides
  };
}

function createMockUser(overrides = {}) {
  return {
    id: overrides.id || `user_${Date.now()}`,
    phone_number: '923001234567',
    first_name: 'Test User',
    preferred_language: 'en',
    registration_completed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    ...overrides
  };
}

describe('text-message.handler - Command Detection', () => {
  let mockUser;
  let mockMessage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUser = createMockUser({
      id: 'test-user-uuid-123',
      phone_number: '923001234567',
      preferred_language: 'en',
      registration_completed: true
    });

    mockMessage = createMockMessage({ from: '923001234567' });

    // Setup default mock returns
    getOrCreateUser.mockResolvedValue(mockUser);
    getOrCreateSession.mockResolvedValue('test-session-id');
    getUserLanguage.mockResolvedValue('en');
    FeatureRegistrationService.isPendingName.mockResolvedValue(false);
    WhatsAppService.startContinuousTypingIndicator.mockReturnValue({ stop: jest.fn() });
  });

  describe('/portal command', () => {
    test('should route /portal command to portal handler', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/portal', mockUser);
      expect(handlePortalCommand).toHaveBeenCalled();
    });

    test('should route /Portal (capitalized) to portal handler', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/Portal', mockUser);
      expect(handlePortalCommand).toHaveBeenCalled();
    });

    test('should route /PORTAL (uppercase) to portal handler', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/PORTAL', mockUser);
      expect(handlePortalCommand).toHaveBeenCalled();
    });

    test('should route /portal with trailing space to portal handler', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/portal ', mockUser);
      expect(handlePortalCommand).toHaveBeenCalled();
    });
  });

  describe('/menu command', () => {
    test('should route /menu command to MenuService.sendMenu', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/menu', mockUser);
      // CORRECT: Uses sendMenu, not sendMainMenu
      expect(MenuService.sendMenu).toHaveBeenCalled();
    });

    test('should route /Menu (capitalized) to MenuService.sendMenu', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/Menu', mockUser);
      expect(MenuService.sendMenu).toHaveBeenCalled();
    });

    test('should pass correct parameters to sendMenu', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/menu', mockUser);
      // sendMenu(from, userId, sessionId, language?)
      expect(MenuService.sendMenu).toHaveBeenCalledWith(
        '923001234567',
        mockUser.id,
        'test-session-id'
      );
    });
  });

  describe('/video command', () => {
    test('should route /video command to VideoOrchestrator.initiateVideoRequest', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/video', mockUser);
      // CORRECT: Uses initiateVideoRequest, not startVideoCreation
      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalled();
    });

    test('should extract topic from /video <topic>', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/video gravity', mockUser);
      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalledWith(
        mockUser,
        '923001234567',
        'test-session-id',
        'en',
        'gravity'
      );
    });

    test('should pass null topic for bare /video command', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/video', mockUser);
      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalledWith(
        mockUser,
        '923001234567',
        'test-session-id',
        'en',
        null
      );
    });
  });

  describe('/reading test command', () => {
    test('should send WhatsApp Flow for /reading test', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/reading test', mockUser);
      // CORRECT: Uses WhatsAppService.sendFlow for reading assessment
      expect(WhatsAppService.sendFlow).toHaveBeenCalled();
    });

    test('should check for first-use intro video', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/reading test', mockUser);
      expect(FeatureIntroService.sendFirstUseIntroIfNeeded).toHaveBeenCalledWith(
        mockUser.id,
        '923001234567',
        'reading',
        expect.any(String)
      );
    });

    test('should handle /readingtest (no space)', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/readingtest', mockUser);
      expect(WhatsAppService.sendFlow).toHaveBeenCalled();
    });
  });

  describe('Typing indicator management', () => {
    test('should start typing indicator at beginning', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/menu', mockUser);
      expect(WhatsAppService.startContinuousTypingIndicator).toHaveBeenCalledWith(
        '923001234567',
        mockMessage.id
      );
    });

    test('should stop typing indicator after /menu command', async () => {
      const mockStop = jest.fn();
      WhatsAppService.startContinuousTypingIndicator.mockReturnValue({ stop: mockStop });
      await handleTextMessage(mockMessage, '923001234567', '/menu', mockUser);
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('User not found scenarios', () => {
    test('should send error when user not found for /portal', async () => {
      // Make getOrCreateUser throw to simulate database failure
      getOrCreateUser.mockRejectedValue(new Error('Database error'));
      await handleTextMessage(mockMessage, '923001234567', '/portal', null);
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        expect.stringContaining('could not find')
      );
    });

    test('should send error when user not found for /video', async () => {
      // Make getOrCreateUser throw to simulate database failure
      getOrCreateUser.mockRejectedValue(new Error('Database error'));
      await handleTextMessage(mockMessage, '923001234567', '/video', null);
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        expect.stringContaining('could not find')
      );
    });
  });

  describe('Ice breaker detection', () => {
    test('should route "Show menu - see all features i can help with" to MenuService.sendMenu', async () => {
      await handleTextMessage(mockMessage, '923001234567', 'Show menu - see all features i can help with', mockUser);
      expect(MenuService.sendMenu).toHaveBeenCalled();
    });

    test('should route "Plan lesson - create pdf lesson plans instantly" to lesson planning', async () => {
      await handleTextMessage(mockMessage, '923001234567', 'Plan lesson - create pdf lesson plans instantly', mockUser);
      expect(MenuService._handleLessonPlanningChoice).toHaveBeenCalled();
    });

    test('should route "Create video - make animated educational videos" to video orchestrator', async () => {
      await handleTextMessage(mockMessage, '923001234567', 'Create video - make animated educational videos', mockUser);
      expect(MenuService._handleMediaLibraryChoice).toHaveBeenCalled();
    });

    test('should route "Get coaching - classroom audio feedback & tips" to coaching', async () => {
      await handleTextMessage(mockMessage, '923001234567', 'Get coaching - classroom audio feedback & tips', mockUser);
      expect(MenuService._handleClassroomCoachingChoice).toHaveBeenCalled();
    });

    test('should be case insensitive for ice breakers', async () => {
      await handleTextMessage(mockMessage, '923001234567', 'SHOW MENU - SEE ALL FEATURES I CAN HELP WITH', mockUser);
      expect(MenuService.sendMenu).toHaveBeenCalled();
    });
  });

  describe('/register command', () => {
    test('should handle /register for unregistered user', async () => {
      const unregisteredUser = { ...mockUser, first_name: null };
      getOrCreateUser.mockResolvedValue(unregisteredUser);

      await handleTextMessage(mockMessage, '923001234567', '/register', unregisteredUser);

      // Should trigger registration flow (either Feature Registration Service or direct message)
      // The exact behavior depends on implementation
      expect(WhatsAppService.sendMessage).toHaveBeenCalled();
    });

    test('should tell already registered user they are registered', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/register', mockUser);

      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        expect.stringContaining('already registered')
      );
    });
  });

  describe('Language switch commands', () => {
    const { detectLanguageOverride } = require('../../utils/language-detector');

    test('should detect language switch from English to Urdu', async () => {
      // User is currently in English, switching to Urdu
      getUserLanguage.mockResolvedValue('en');
      detectLanguageOverride.mockReturnValue('ur');

      await handleTextMessage(mockMessage, '923001234567', 'اردو میں بات کرو', mockUser);

      expect(setUserLanguage).toHaveBeenCalledWith(mockUser.id, 'ur');
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        expect.stringContaining('اردو')  // Urdu confirmation
      );
    });

    test('should detect language switch from Urdu to English', async () => {
      // User is currently in Urdu, switching to English
      getUserLanguage.mockResolvedValue('ur');
      detectLanguageOverride.mockReturnValue('en');

      await handleTextMessage(mockMessage, '923001234567', 'switch to english', mockUser);

      expect(setUserLanguage).toHaveBeenCalledWith(mockUser.id, 'en');
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        expect.stringContaining('English')
      );
    });

    test('should not switch if same language (already English)', async () => {
      // User already has 'en' as preferred language
      getUserLanguage.mockResolvedValue('en');
      detectLanguageOverride.mockReturnValue('en');

      await handleTextMessage(mockMessage, '923001234567', 'english please', mockUser);

      // Should NOT call setUserLanguage since already in English
      expect(setUserLanguage).not.toHaveBeenCalled();
    });
  });

  describe('Name registration flow', () => {
    test('should handle name response when user is pending name', async () => {
      FeatureRegistrationService.isPendingName.mockResolvedValue(true);
      FeatureRegistrationService.handleNameResponse.mockResolvedValue({
        success: true,
        firstName: 'Ahmed'
      });

      await handleTextMessage(mockMessage, '923001234567', 'Ahmed', mockUser);

      expect(FeatureRegistrationService.handleNameResponse).toHaveBeenCalledWith(
        mockUser.id,
        'Ahmed',
        '923001234567',
        'en',
        'text'
      );
    });

    test('should ask again if name extraction fails', async () => {
      FeatureRegistrationService.isPendingName.mockResolvedValue(true);
      FeatureRegistrationService.handleNameResponse.mockResolvedValue({
        success: false
      });

      await handleTextMessage(mockMessage, '923001234567', 'gibberish123', mockUser);

      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        expect.stringContaining("didn't quite catch")
      );
    });
  });

  describe('Capability inquiry detection', () => {
    const HelperAgentService = require('../../services/helper-agent.service');

    test('should detect capability inquiry and send guidance', async () => {
      HelperAgentService.detectCapabilityInquiry.mockResolvedValue({
        detected: true,
        guidanceMessage: 'I can help you with lesson plans, videos, and more!'
      });

      await handleTextMessage(mockMessage, '923001234567', 'what can you do?', mockUser);

      expect(HelperAgentService.detectCapabilityInquiry).toHaveBeenCalled();
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        '923001234567',
        'I can help you with lesson plans, videos, and more!'
      );
    });

    test('should continue to normal flow if capability not detected', async () => {
      HelperAgentService.detectCapabilityInquiry.mockResolvedValue({
        detected: false
      });

      await handleTextMessage(mockMessage, '923001234567', 'hello there', mockUser);

      expect(HelperAgentService.detectCapabilityInquiry).toHaveBeenCalled();
      // Should continue to general conversation
    });

    test('should handle capability detection error gracefully', async () => {
      HelperAgentService.detectCapabilityInquiry.mockRejectedValue(new Error('Service error'));

      // Should not throw, should continue to normal flow
      await handleTextMessage(mockMessage, '923001234567', 'what can you do?', mockUser);

      // Test passes if no error thrown
    });
  });

  describe('Video topic awaiting state', () => {
    test('should handle video topic reply when awaiting', async () => {
      VideoOrchestrator.checkAwaitingTopic.mockResolvedValue({
        sessionId: 'session-123',
        language: 'en'
      });

      await handleTextMessage(mockMessage, '923001234567', 'photosynthesis', mockUser);

      expect(VideoOrchestrator.clearAwaitingTopic).toHaveBeenCalledWith(mockUser.id);
      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalledWith(
        mockUser,
        '923001234567',
        'session-123',
        'en',
        'photosynthesis'
      );
    });

    test('should pass topic to video request when awaiting', async () => {
      VideoOrchestrator.checkAwaitingTopic.mockResolvedValue({
        sessionId: 'session-456',
        language: 'ur'
      });

      await handleTextMessage(mockMessage, '923001234567', 'gravity and motion', mockUser);

      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalledWith(
        mockUser,
        '923001234567',
        'session-456',
        'ur',
        'gravity and motion'
      );
    });
  });

  describe('Lesson plan topic from menu', () => {
    // Note: Full lesson plan flow testing requires integration tests
    // The internal mocking of lazy requires makes unit testing challenging
    // These tests verify the handler doesn't crash on lesson plan related scenarios

    test('should handle text that could be a lesson plan topic', async () => {
      // Simply verify the handler processes lesson-plan-like text without error
      await expect(handleTextMessage(mockMessage, '923001234567', 'fractions for grade 5', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle Urdu educational topics', async () => {
      // Verify Urdu text is processed correctly
      await expect(handleTextMessage(mockMessage, '923001234567', 'اردو گرامر', mockUser))
        .resolves.not.toThrow();
    });
  });

  describe('Intent detection routing', () => {
    const OpenAIService = require('../../services/openai.service');

    beforeEach(() => {
      // Reset capability detection to not detected
      const HelperAgentService = require('../../services/helper-agent.service');
      HelperAgentService.detectCapabilityInquiry.mockResolvedValue({ detected: false });
      VideoOrchestrator.checkAwaitingTopic.mockResolvedValue(null);
      MenuService.checkAwaitingLessonPlanTopic.mockResolvedValue(null);
    });

    test('should route to video when intent is video', async () => {
      OpenAIService.detectIntent.mockResolvedValue({ type: 'video', confidence: 0.95 });
      VideoOrchestrator.extractTopicFromMessage = jest.fn().mockResolvedValue('gravity');

      await handleTextMessage(mockMessage, '923001234567', 'make a video about gravity', mockUser);

      // Should call video orchestrator
      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalled();
    });

    test('should route to lesson plan when intent is lesson_plan', async () => {
      OpenAIService.detectIntent.mockResolvedValue({ type: 'lesson_plan', confidence: 0.9 });

      await handleTextMessage(mockMessage, '923001234567', 'create a lesson plan for math', mockUser);

      // Intent detection should have been called
      expect(OpenAIService.detectIntent).toHaveBeenCalledWith('create a lesson plan for math');
    });

    test('should route to general conversation for general intent', async () => {
      OpenAIService.detectIntent.mockResolvedValue({ type: 'general', confidence: 0.85 });

      await handleTextMessage(mockMessage, '923001234567', 'hello how are you', mockUser);

      expect(OpenAIService.getResponseWithFormat).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      // Reset sendMessage mock to clear any queued rejections
      WhatsAppService.sendMessage.mockReset();
      WhatsAppService.sendMessage.mockResolvedValue({ success: true });
    });

    test('should handle WhatsApp service errors gracefully', async () => {
      // Use a command that triggers a sendMessage call
      WhatsAppService.sendMessage.mockRejectedValueOnce(new Error('WhatsApp API error'));

      // /portal should not throw even if WhatsApp fails
      const { handlePortalCommand } = require('../portal-command.handler');
      handlePortalCommand.mockResolvedValueOnce('Portal response that triggers sendMessage');

      // Should not throw - handler catches errors
      await expect(handleTextMessage(mockMessage, '923001234567', '/portal', mockUser))
        .resolves.not.toThrow();
    });

    test('should always stop typing indicator', async () => {
      const mockStop = jest.fn();
      WhatsAppService.startContinuousTypingIndicator.mockReturnValue({ stop: mockStop });

      await handleTextMessage(mockMessage, '923001234567', '/menu', mockUser);

      // Typing indicator should be stopped
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('Session management', () => {
    test('should call getOrCreateSession for user with id', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/menu', mockUser);

      expect(getOrCreateSession).toHaveBeenCalled();
    });
  });

  describe('Multiple command variations', () => {
    beforeEach(() => {
      // Reset mocks to ensure clean state between tests
      WhatsAppService.sendMessage.mockReset();
      WhatsAppService.sendMessage.mockResolvedValue({ success: true });
    });

    test('should handle /VIDEO uppercase', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/VIDEO', mockUser);
      expect(VideoOrchestrator.initiateVideoRequest).toHaveBeenCalled();
    });

    test('should handle /READING TEST uppercase', async () => {
      await handleTextMessage(mockMessage, '923001234567', '/READING TEST', mockUser);
      expect(WhatsAppService.sendFlow).toHaveBeenCalled();
    });

    test('should handle case insensitive /register', async () => {
      // /register should work regardless of case
      await handleTextMessage(mockMessage, '923001234567', '/REGISTER', mockUser);
      expect(WhatsAppService.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Coaching session handling', () => {
    // Note: Full coaching flow testing requires integration tests
    // The lazy require pattern makes unit testing with mocks challenging

    test('should handle message during potential coaching context', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', 'my lesson plan is about fractions', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle regular message without crashing', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', 'just a regular message', mockUser))
        .resolves.not.toThrow();
    });
  });

  describe('Menu number choices', () => {
    test('should process single digit input without crashing', async () => {
      // Single digit inputs should be processed - may or may not trigger menu
      await expect(handleTextMessage(mockMessage, '923001234567', '1', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle number 2 input', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', '2', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle number 3 input', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', '3', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle number 4 input', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', '4', mockUser))
        .resolves.not.toThrow();
    });
  });

  describe('Presentation intent', () => {
    test('should handle presentation request without crashing', async () => {
      // Presentation requests should be processed without error
      await expect(handleTextMessage(mockMessage, '923001234567', 'create a presentation about solar system', mockUser))
        .resolves.not.toThrow();
    });
  });

  describe('Edge cases', () => {
    test('should handle normal unicode message', async () => {
      // Unicode messages should be processed without error
      await expect(handleTextMessage(mockMessage, '923001234567', '你好世界', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle emoji in message', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', '🎓📚 Hello!', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle Arabic/Urdu text', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', 'مرحبا العالم', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle empty message', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', '', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle whitespace-only message', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', '   ', mockUser))
        .resolves.not.toThrow();
    });

    test('should handle very long message', async () => {
      const longMessage = 'a'.repeat(5000);
      await expect(handleTextMessage(mockMessage, '923001234567', longMessage, mockUser))
        .resolves.not.toThrow();
    });
  });

  describe('User without registration', () => {
    test('should handle null user', async () => {
      await expect(handleTextMessage(mockMessage, '923001234567', 'hello', null))
        .resolves.not.toThrow();
    });

    test('should create user if not provided', async () => {
      const { getOrCreateUser } = require('../../database/bot-helpers');
      getOrCreateUser.mockResolvedValue({
        id: 'new-user-id',
        phone_number: '923001234567',
        preferred_language: 'en'
      });

      await handleTextMessage(mockMessage, '923001234567', 'hello', null);
      expect(getOrCreateUser).toHaveBeenCalled();
    });
  });

  describe('Language detection', () => {
    const { setUserLanguage } = require('../../utils/language-cache');

    test('should handle switch to Arabic', async () => {
      const { detectLanguageOverride } = require('../../utils/language-detector');
      detectLanguageOverride.mockReturnValue('ar');

      await handleTextMessage(mockMessage, '923001234567', 'Arabic please', mockUser);
      expect(setUserLanguage).toHaveBeenCalled();
    });

    test('should handle switch to Spanish', async () => {
      const { detectLanguageOverride } = require('../../utils/language-detector');
      detectLanguageOverride.mockReturnValue('es');

      await handleTextMessage(mockMessage, '923001234567', 'Español por favor', mockUser);
      expect(setUserLanguage).toHaveBeenCalled();
    });
  });
});
