/**
 * Mock PortalInviteService for Testing
 *
 * Prevents transitive dependencies from calling real WhatsApp API
 * Updated: 2026-01-13
 */

const PortalInviteService = {
  // Main method - send portal invitation
  sendPortalInvite: jest.fn().mockResolvedValue({
    success: true,
    invitationId: 'mock-invitation-id',
    inviteCode: 'TEST123'
  }),

  // Check if user has active invitation
  hasActiveInvitation: jest.fn().mockResolvedValue(false),

  // Get invitation status
  getInvitationStatus: jest.fn().mockResolvedValue(null),

  // Create invitation record
  createInvitation: jest.fn().mockResolvedValue({
    id: 'mock-invitation-uuid',
    invite_code: 'TEST123',
    created_at: new Date().toISOString()
  }),

  // Validate invitation code
  validateInviteCode: jest.fn().mockResolvedValue(true),

  // Reset helper
  _resetAllMocks: function () {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.sendPortalInvite.mockResolvedValue({
      success: true,
      invitationId: 'mock-invitation-id',
      inviteCode: 'TEST123'
    });
    this.hasActiveInvitation.mockResolvedValue(false);
  }
};

module.exports = PortalInviteService;
