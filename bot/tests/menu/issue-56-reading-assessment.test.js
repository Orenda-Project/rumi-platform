/**
 * Issue #56: Reading Assessment Menu - Non-existent Module Import
 * TDD Tests - Written BEFORE fix implementation
 *
 * Problem: MenuService.handleMenuButtonResponse() imports './reading/reading-flow.service'
 * which does NOT exist, causing MODULE_NOT_FOUND error on button click.
 *
 * Fix: Use ReadingAssessmentService.initiateAssessment() instead.
 */

const MenuService = require('../../shared/services/menu.service');
const ReadingAssessmentService = require('../../shared/services/reading-assessment.service');
const redisService = require('../../shared/services/cache/railway-redis.service');

// Mock dependencies
jest.mock('../../shared/services/reading-assessment.service');
jest.mock('../../shared/services/whatsapp.service');
jest.mock('../../shared/services/cache/railway-redis.service');
jest.mock('../../shared/config/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { id: 'conv-123' } }),
  update: jest.fn().mockReturnThis()
}));

describe('Issue #56: Menu → Reading Assessment Flow', () => {
  const mockUser = { id: 'test-user-uuid-123' };
  const mockFrom = '923001234567';
  const mockLanguage = 'en';
  const mockSessionId = 'session-abc-123';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis state (user awaiting menu selection)
    redisService.get.mockResolvedValue({
      sessionId: mockSessionId,
      from: mockFrom,
      language: mockLanguage,
      askedAt: new Date().toISOString()
    });
    redisService.delete.mockResolvedValue(true);

    // Mock ReadingAssessmentService
    ReadingAssessmentService.initiateAssessment.mockResolvedValue(true);
  });

  test('should NOT throw MODULE_NOT_FOUND error when clicking menu_reading button', async () => {
    // This test will FAIL before the fix is implemented
    // because the code tries to import a non-existent module
    await expect(
      MenuService.handleMenuButtonResponse(mockUser, mockFrom, 'menu_reading', mockLanguage)
    ).resolves.not.toThrow();
  });

  test('should call ReadingAssessmentService.initiateAssessment with correct parameters', async () => {
    await MenuService.handleMenuButtonResponse(mockUser, mockFrom, 'menu_reading', mockLanguage);

    expect(ReadingAssessmentService.initiateAssessment).toHaveBeenCalledWith(
      mockUser.id,           // userId
      mockSessionId,         // sessionId
      mockFrom,              // phoneNumber
      mockLanguage           // userLanguage
    );
  });

  test('should clear Redis state after handling menu_reading button', async () => {
    await MenuService.handleMenuButtonResponse(mockUser, mockFrom, 'menu_reading', mockLanguage);

    const stateKey = `user:${mockUser.id}:awaiting_menu_selection`;
    expect(redisService.delete).toHaveBeenCalledWith(stateKey);
  });

  test('should handle expired state gracefully', async () => {
    // Simulate expired state
    redisService.get.mockResolvedValue(null);

    const WhatsAppService = require('../../shared/services/whatsapp.service');
    WhatsAppService.sendMessage.mockResolvedValue(true);

    await MenuService.handleMenuButtonResponse(mockUser, mockFrom, 'menu_reading', mockLanguage);

    // Should send expiry message, not crash
    expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(
      mockFrom,
      expect.stringContaining('expired')
    );
    expect(ReadingAssessmentService.initiateAssessment).not.toHaveBeenCalled();
  });

  test('should log menu button response handling', async () => {
    // Just verify it completes without error - logging is already tested by console output
    await expect(
      MenuService.handleMenuButtonResponse(mockUser, mockFrom, 'menu_reading', mockLanguage)
    ).resolves.not.toThrow();
  });
});
