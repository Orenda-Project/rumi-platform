/**
 * CoachingSessionService.initiateSession — must store the exact channel
 * identifier the request originated on (recipient_identifier), so later
 * background delivery (LP-extraction notices, stale-session reminders,
 * report generation) never has to re-derive "who to notify" from
 * users.phone_number, which is WhatsApp-only and would misdeliver a
 * Slack-originated session's results.
 */

function makeSupabase({ user, insertedRowCapture }) {
  return {
    from(table) {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: user, error: user ? null : { message: 'not found' } }) }) }),
        };
      }
      if (table === 'coaching_sessions') {
        return {
          insert: (row) => {
            insertedRowCapture.row = row;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'session-1', ...row }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

function load({ user = { name: 'Ayesha', first_name: 'Ayesha', last_name: 'Khan' } } = {}) {
  jest.resetModules();
  const insertedRowCapture = {};
  const supabase = makeSupabase({ user, insertedRowCapture });

  jest.doMock('../../bot/shared/config/supabase', () => supabase);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
    sendInteractiveButtons: jest.fn().mockResolvedValue(true),
  }));
  jest.doMock('../../bot/shared/config/coaching-messages', () => ({
    getCoachingMessage: jest.fn(() => 'message'),
  }));

  const CoachingSessionService = require('../../bot/shared/services/coaching/coaching-session.service');
  return { CoachingSessionService, insertedRowCapture };
}

afterEach(() => jest.resetModules());

describe('CoachingSessionService.initiateSession — recipient_identifier', () => {
  it('stores the bare WhatsApp phone number as recipient_identifier', async () => {
    const { CoachingSessionService, insertedRowCapture } = load();
    await CoachingSessionService.initiateSession('user-1', 'session-1', 'audio-1', '923001234567', 120);
    expect(insertedRowCapture.row.recipient_identifier).toBe('923001234567');
  });

  it('stores a Slack-prefixed identifier verbatim, unmodified — no WhatsApp-specific formatting applied', async () => {
    const { CoachingSessionService, insertedRowCapture } = load();
    await CoachingSessionService.initiateSession('user-1', 'session-1', 'audio-1', 'slack:U0123ABC', 120);
    expect(insertedRowCapture.row.recipient_identifier).toBe('slack:U0123ABC');
  });
});
