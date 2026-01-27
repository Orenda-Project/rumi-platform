/**
 * Issue #57: Lesson Plan Menu - No State Tracking for Topic Reply
 * TDD Tests - Written BEFORE fix implementation
 *
 * Problem: When user clicks "Lesson Planning" from /menu and replies with topic,
 * intent detection returns 'general' because there's no explicit "create lesson plan" phrase.
 * The menu_choice: 'lesson_planning' state is stored in DB but never checked.
 *
 * Fix: Add Redis state tracking (like video flow) and check before intent detection.
 */

const MenuService = require('../../shared/services/menu.service');
const redisService = require('../../shared/services/cache/railway-redis.service');

// Mock dependencies
jest.mock('../../shared/services/whatsapp.service');
jest.mock('../../shared/services/cache/railway-redis.service', () => ({
  redis: {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1)
  },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  delete: jest.fn().mockResolvedValue(1)
}));
jest.mock('../../shared/config/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { id: 'conv-123' } }),
  update: jest.fn().mockReturnThis()
}));

describe('Issue #57: Menu → Lesson Plan State Tracking', () => {
  const mockUserId = 'test-user-uuid-456';
  const mockSessionId = 'session-def-456';
  const mockFrom = '923001234567';
  const mockLanguage = 'en';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MenuService._handleLessonPlanningChoice', () => {
    test('should store lesson plan state in Redis when lesson planning is selected', async () => {
      const WhatsAppService = require('../../shared/services/whatsapp.service');
      WhatsAppService.sendMessage.mockResolvedValue(true);

      await MenuService._handleLessonPlanningChoice(mockUserId, mockSessionId, mockFrom, mockLanguage);

      // The fix should store state in Redis with awaiting_lesson_plan_topic key
      const expectedStateKey = `user:${mockUserId}:awaiting_lesson_plan_topic`;
      expect(redisService.redis.setex).toHaveBeenCalledWith(
        expectedStateKey,
        300, // 5 minute TTL
        expect.stringContaining(mockSessionId)
      );
    });

    test('should send lesson planning prompt message to user', async () => {
      const WhatsAppService = require('../../shared/services/whatsapp.service');
      WhatsAppService.sendMessage.mockResolvedValue(true);

      await MenuService._handleLessonPlanningChoice(mockUserId, mockSessionId, mockFrom, 'en');

      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        mockFrom,
        expect.stringContaining('topic')
      );
    });

    test('should send Urdu message when language is ur', async () => {
      const WhatsAppService = require('../../shared/services/whatsapp.service');
      WhatsAppService.sendMessage.mockResolvedValue(true);

      await MenuService._handleLessonPlanningChoice(mockUserId, mockSessionId, mockFrom, 'ur');

      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
        mockFrom,
        expect.stringContaining('موضوع') // Urdu for "topic"
      );
    });
  });

  describe('Lesson Plan State Check in Handler', () => {
    // These tests verify the handler checks Redis state before intent detection
    // The actual handler tests would be in text-message.handler.test.js

    test('should have checkAwaitingLessonPlanTopic method available', () => {
      // MenuService should expose a method to check lesson plan state
      expect(typeof MenuService.checkAwaitingLessonPlanTopic).toBe('function');
    });

    test('checkAwaitingLessonPlanTopic should return state when user is awaiting topic', async () => {
      const mockState = {
        sessionId: mockSessionId,
        language: mockLanguage,
        from: mockFrom,
        askedAt: new Date().toISOString()
      };

      redisService.redis.get.mockResolvedValue(JSON.stringify(mockState));

      const state = await MenuService.checkAwaitingLessonPlanTopic(mockUserId);

      expect(state).toEqual(mockState);
    });

    test('checkAwaitingLessonPlanTopic should return null when no state exists', async () => {
      redisService.redis.get.mockResolvedValue(null);

      const state = await MenuService.checkAwaitingLessonPlanTopic(mockUserId);

      expect(state).toBeNull();
    });

    test('should have clearAwaitingLessonPlanTopic method available', () => {
      expect(typeof MenuService.clearAwaitingLessonPlanTopic).toBe('function');
    });

    test('clearAwaitingLessonPlanTopic should delete Redis state', async () => {
      await MenuService.clearAwaitingLessonPlanTopic(mockUserId);

      const expectedStateKey = `user:${mockUserId}:awaiting_lesson_plan_topic`;
      expect(redisService.redis.del).toHaveBeenCalledWith(expectedStateKey);
    });
  });

  describe('Integration: Topic Reply Processing', () => {
    test('should route topic to lesson plan generation when state exists', async () => {
      // This simulates the flow:
      // 1. User clicks Lesson Planning button
      // 2. State stored in Redis
      // 3. User replies with "photosynthesis"
      // 4. Handler finds Redis state → routes to lesson plan, not general AI

      const mockState = {
        sessionId: mockSessionId,
        language: mockLanguage,
        from: mockFrom,
        askedAt: new Date().toISOString()
      };

      // State exists
      redisService.redis.get.mockResolvedValue(JSON.stringify(mockState));

      const state = await MenuService.checkAwaitingLessonPlanTopic(mockUserId);

      // Verify state was found
      expect(state).not.toBeNull();
      expect(state.sessionId).toBe(mockSessionId);

      // The handler would then use this state to:
      // 1. Clear the state
      // 2. Call handleLessonPlanRequest with the topic
      // (This behavior is tested in text-message.handler.test.js)
    });

    test('should fall through to intent detection when no state exists', async () => {
      redisService.redis.get.mockResolvedValue(null);

      const state = await MenuService.checkAwaitingLessonPlanTopic(mockUserId);

      // No state = proceed with normal intent detection
      expect(state).toBeNull();
    });
  });
});
