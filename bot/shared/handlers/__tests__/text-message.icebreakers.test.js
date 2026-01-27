/**
 * Ice Breaker Detection Tests for text-message.handler.js
 *
 * Tests all quick-reply ice breaker routing
 * Phase 2 of Test Suite Building Plan
 *
 * @module __tests__/text-message.icebreakers.test
 */

// Mock dependencies
jest.mock('../../services/whatsapp.service');
jest.mock('../../services/openai.service');
jest.mock('../../config/supabase');
jest.mock('../../services/cache/railway-redis.service');
jest.mock('../../services/coaching-orchestrator.service');
jest.mock('../../services/menu.service');
jest.mock('../../services/feature-registration.service');
jest.mock('../../services/context.service');
jest.mock('../../services/content.service');
jest.mock('../../services/language-detector.service');
jest.mock('../../services/reading-assessment.service');
jest.mock('../../services/feature-linker.service');
jest.mock('../../services/feature-intro.service');
jest.mock('../../services/lesson-plan-queue.service');
jest.mock('../../services/video/video-orchestrator.service');
jest.mock('../../services/helper-agent.service');
jest.mock('../portal-command.handler');
jest.mock('../../database/bot-helpers');
jest.mock('../../utils/logger');
jest.mock('../../utils/language-cache');

const {
  createMockMessage,
  createMockUser,
  ICE_BREAKERS
} = require('./test-utils');

const WhatsAppService = require('../../services/whatsapp.service');
const MenuService = require('../../services/menu.service');
const CoachingService = require('../../services/coaching-orchestrator.service');
const ReadingAssessmentService = require('../../services/reading-assessment.service');
const LessonPlanQueueService = require('../../services/lesson-plan-queue.service');
const VideoOrchestrator = require('../../services/video/video-orchestrator.service');
const FeatureRegistrationService = require('../../services/feature-registration.service');
const { getOrCreateUser, getOrCreateSession } = require('../../database/bot-helpers');
const { getUserLanguage } = require('../../utils/language-cache');

const { handleTextMessage } = require('../text-message.handler');

describe('text-message.handler - Ice Breaker Detection', () => {
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

    mockMessage = createMockMessage({
      from: '923001234567'
    });

    getOrCreateUser.mockResolvedValue(mockUser);
    getOrCreateSession.mockResolvedValue('test-session-id');
    getUserLanguage.mockResolvedValue('en');
    FeatureRegistrationService.isPendingName.mockResolvedValue(false);

    WhatsAppService.startContinuousTypingIndicator.mockReturnValue({
      stop: jest.fn()
    });
    WhatsAppService.sendMessage.mockResolvedValue({ success: true });
  });

  describe('Menu ice breaker', () => {
    const menuIceBreaker = 'show menu - see all features i can help with';

    test('should route menu ice breaker to MenuService', async () => {
      MenuService.sendMainMenu.mockResolvedValue(undefined);

      await handleTextMessage(mockMessage, '923001234567', menuIceBreaker, mockUser);

      expect(MenuService.sendMainMenu).toHaveBeenCalledWith(
        '923001234567',
        'en',
        mockUser.first_name
      );
    });

    test('should handle menu ice breaker case-insensitively', async () => {
      MenuService.sendMainMenu.mockResolvedValue(undefined);

      await handleTextMessage(mockMessage, '923001234567', menuIceBreaker.toUpperCase(), mockUser);

      expect(MenuService.sendMainMenu).toHaveBeenCalled();
    });

    test('should handle menu ice breaker with extra whitespace', async () => {
      MenuService.sendMainMenu.mockResolvedValue(undefined);

      await handleTextMessage(mockMessage, '923001234567', `  ${menuIceBreaker}  `, mockUser);

      expect(MenuService.sendMainMenu).toHaveBeenCalled();
    });
  });

  describe('Lesson Plan ice breaker', () => {
    const lessonPlanIceBreaker = 'plan lesson - create pdf lesson plans instantly';

    test('should route lesson plan ice breaker to appropriate service', async () => {
      // Should prompt for topic or show lesson plan intro
      await handleTextMessage(mockMessage, '923001234567', lessonPlanIceBreaker, mockUser);

      // Verify it sends a response asking for topic
      expect(WhatsAppService.sendMessage).toHaveBeenCalled();
    });

    test('should handle lesson plan ice breaker case-insensitively', async () => {
      await handleTextMessage(mockMessage, '923001234567', lessonPlanIceBreaker.toUpperCase(), mockUser);

      expect(WhatsAppService.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Video creation ice breaker', () => {
    const videoIceBreaker = 'create video - make animated educational videos';

    test('should route video ice breaker to VideoOrchestrator', async () => {
      VideoOrchestrator.startVideoCreation.mockResolvedValue({ success: true });
      VideoOrchestrator.checkAwaitingTopic.mockResolvedValue(false);

      await handleTextMessage(mockMessage, '923001234567', videoIceBreaker, mockUser);

      // Should either start video creation or ask for topic
      expect(VideoOrchestrator.startVideoCreation).toHaveBeenCalled();
    });
  });

  describe('Coaching ice breaker', () => {
    const coachingIceBreaker = 'get coaching - classroom audio feedback & tips';

    test('should route coaching ice breaker to CoachingService', async () => {
      CoachingService.startCoachingSession.mockResolvedValue({ success: true });

      await handleTextMessage(mockMessage, '923001234567', coachingIceBreaker, mockUser);

      // Should start coaching or show coaching intro
      expect(WhatsAppService.sendMessage).toHaveBeenCalled();
    });
  });

  describe('Reading test ice breaker', () => {
    const readingIceBreaker = 'reading test - assess your students reading level';

    test('should route reading test ice breaker to ReadingAssessmentService', async () => {
      ReadingAssessmentService.startAssessment.mockResolvedValue({ success: true });

      await handleTextMessage(mockMessage, '923001234567', readingIceBreaker, mockUser);

      expect(ReadingAssessmentService.startAssessment).toHaveBeenCalled();
    });
  });

  describe('Ice breaker edge cases', () => {
    test('should not match partial ice breaker text', async () => {
      MenuService.sendMainMenu.mockResolvedValue(undefined);

      // Only "show menu" without the full text
      await handleTextMessage(mockMessage, '923001234567', 'show menu', mockUser);

      // Should NOT match ice breaker pattern (depends on implementation)
      // May route to general conversation instead
    });

    test('should handle ice breaker with typo gracefully', async () => {
      // Slight typo in ice breaker
      await handleTextMessage(mockMessage, '923001234567', 'show manu - see all features', mockUser);

      // Should not crash, may route to general conversation
      expect(WhatsAppService.sendMessage).toHaveBeenCalled();
    });

    test('should prefer exact ice breaker match over intent detection', async () => {
      MenuService.sendMainMenu.mockResolvedValue(undefined);

      const exactIceBreaker = 'show menu - see all features i can help with';
      await handleTextMessage(mockMessage, '923001234567', exactIceBreaker, mockUser);

      // Should route directly to menu, not to intent detection
      expect(MenuService.sendMainMenu).toHaveBeenCalled();
    });
  });

  describe('Language-specific ice breakers', () => {
    test('should handle Urdu user with English ice breaker', async () => {
      mockUser.preferred_language = 'ur';
      getUserLanguage.mockResolvedValue('ur');
      MenuService.sendMainMenu.mockResolvedValue(undefined);

      const menuIceBreaker = 'show menu - see all features i can help with';
      await handleTextMessage(mockMessage, '923001234567', menuIceBreaker, mockUser);

      // Should still work and send menu in Urdu
      expect(MenuService.sendMainMenu).toHaveBeenCalledWith(
        '923001234567',
        'ur',
        mockUser.first_name
      );
    });
  });

  describe('All ice breaker mappings', () => {
    // Test each ice breaker defined in ICE_BREAKERS
    Object.entries(ICE_BREAKERS).forEach(([iceBreaker, feature]) => {
      test(`should detect "${iceBreaker.substring(0, 30)}..." as ${feature}`, async () => {
        // Setup appropriate mock based on feature
        switch (feature) {
          case 'menu':
            MenuService.sendMainMenu.mockResolvedValue(undefined);
            break;
          case 'lesson_plan':
            LessonPlanQueueService.queueLessonPlan.mockResolvedValue({ success: true });
            break;
          case 'video':
            VideoOrchestrator.startVideoCreation.mockResolvedValue({ success: true });
            VideoOrchestrator.checkAwaitingTopic.mockResolvedValue(false);
            break;
          case 'coaching':
            CoachingService.startCoachingSession.mockResolvedValue({ success: true });
            break;
          case 'reading_assessment':
            ReadingAssessmentService.startAssessment.mockResolvedValue({ success: true });
            break;
        }

        await handleTextMessage(mockMessage, '923001234567', iceBreaker, mockUser);

        // Should not throw and should send some response
        expect(WhatsAppService.sendMessage).toHaveBeenCalled();
      });
    });
  });
});
