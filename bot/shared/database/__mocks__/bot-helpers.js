/**
 * Mock Database Helpers for Testing
 */

const getOrCreateUser = jest.fn().mockResolvedValue({
  id: 'mock-user-uuid',
  phone_number: '923001234567',
  first_name: 'Test User',
  preferred_language: 'en',
  registration_completed: true,
  created_at: new Date().toISOString()
});

const getOrCreateSession = jest.fn().mockResolvedValue('mock-session-id');

const updateSessionType = jest.fn().mockResolvedValue({ success: true });

const storeConversation = jest.fn().mockResolvedValue({ success: true });

const storeLessonPlan = jest.fn().mockResolvedValue({ success: true });

module.exports = {
  getOrCreateUser,
  getOrCreateSession,
  updateSessionType,
  storeConversation,
  storeLessonPlan
};
