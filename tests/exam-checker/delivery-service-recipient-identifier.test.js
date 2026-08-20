/**
 * DeliveryService.sendResults — must deliver to session.recipient_identifier,
 * never re-derive a destination from users.phone_number (the removed
 * _getUserPhone helper). A Slack-originated exam session must have its
 * grading results delivered back to that exact Slack identifier.
 */

function load() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const whatsapp = {
    sendMessage: jest.fn().mockResolvedValue(true),
    sendImage: jest.fn().mockResolvedValue(true),
  };
  jest.doMock('../../bot/shared/services/whatsapp.service', () => whatsapp);
  jest.doMock('../../bot/shared/config/branding', () => ({ portalUrl: () => null }), { virtual: true });

  const DeliveryService = require('../../bot/shared/services/exam-checker/delivery.service');
  return { DeliveryService, whatsapp };
}

afterEach(() => jest.resetModules());

describe('DeliveryService.sendResults — recipient_identifier', () => {
  it('delivers the summary message to session.recipient_identifier when it is a Slack identifier', async () => {
    const { DeliveryService, whatsapp } = load();
    const session = {
      id: 'exam-1',
      recipient_identifier: 'slack:U0123ABC',
      grading_results: { successful: [], failed: [], summary: {} },
      annotated_images: [],
    };

    await DeliveryService.sendResults(session, 'user-1');

    expect(whatsapp.sendMessage).toHaveBeenCalledWith('slack:U0123ABC', expect.stringContaining('Exam Grading Complete'));
  });

  it('delivers to a bare WhatsApp phone number unchanged', async () => {
    const { DeliveryService, whatsapp } = load();
    const session = {
      id: 'exam-1',
      recipient_identifier: '923001234567',
      grading_results: { successful: [], failed: [], summary: {} },
      annotated_images: [],
    };

    await DeliveryService.sendResults(session, 'user-1');

    expect(whatsapp.sendMessage).toHaveBeenCalledWith('923001234567', expect.any(String));
  });

  it('throws (does not silently fall back to a users.phone_number lookup) when recipient_identifier is missing', async () => {
    const { DeliveryService, whatsapp } = load();
    const session = { id: 'exam-1', recipient_identifier: null, grading_results: {}, annotated_images: [] };

    await expect(DeliveryService.sendResults(session, 'user-1')).rejects.toThrow(/recipient_identifier/);
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });

  it('no longer exposes _getUserPhone — the re-derivation point has been removed entirely, not just bypassed', () => {
    const { DeliveryService } = load();
    expect(DeliveryService._getUserPhone).toBeUndefined();
  });
});
