/**
 * ExamSessionService — must thread the originating channel identifier
 * through session creation, and getOrCreate must only use it on the
 * CREATE path (an existing session already has its own stored value from
 * whenever it was first created — a later request's `from` must never
 * silently overwrite it).
 */

function makeSupabase({ existingSession, insertedRowCapture }) {
  return {
    from(table) {
      if (table !== 'exam_check_sessions') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              order: () => ({
                limit: () => ({
                  single: () => Promise.resolve(
                    existingSession
                      ? { data: existingSession, error: null }
                      : { data: null, error: { message: 'no rows' } }
                  ),
                }),
              }),
            }),
          }),
        }),
        insert: (row) => {
          insertedRowCapture.row = row;
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'exam-session-1', ...row }, error: null }) }) };
        },
      };
    },
  };
}

function load({ existingSession = null } = {}) {
  jest.resetModules();
  const insertedRowCapture = {};
  jest.doMock('../../bot/shared/config/supabase', () => makeSupabase({ existingSession, insertedRowCapture }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  }));

  const ExamSessionService = require('../../bot/shared/services/exam-checker/exam-session.service');
  return { ExamSessionService, insertedRowCapture };
}

afterEach(() => jest.resetModules());

describe('ExamSessionService.getOrCreate / _createSession — recipient_identifier', () => {
  it('stores the WhatsApp phone number on a brand-new session', async () => {
    const { ExamSessionService, insertedRowCapture } = load();
    await ExamSessionService.getOrCreate('user-1', '923001234567');
    expect(insertedRowCapture.row.recipient_identifier).toBe('923001234567');
  });

  it('stores a Slack-prefixed identifier verbatim on a brand-new session', async () => {
    const { ExamSessionService, insertedRowCapture } = load();
    await ExamSessionService.getOrCreate('user-1', 'slack:U0123ABC');
    expect(insertedRowCapture.row.recipient_identifier).toBe('slack:U0123ABC');
  });

  it('does NOT touch recipient_identifier when an active session already exists — its original value is preserved', async () => {
    const existingSession = { id: 'existing-1', user_id: 'user-1', status: 'collecting_images', recipient_identifier: 'slack:U0123ABC' };
    const { ExamSessionService, insertedRowCapture } = load({ existingSession });

    // A second message arrives on a DIFFERENT channel mid-session (e.g. the
    // teacher also has a WhatsApp number) — getOrCreate must return the
    // EXISTING session unchanged, never overwrite its stored channel.
    const session = await ExamSessionService.getOrCreate('user-1', '923001234567');

    expect(session.recipient_identifier).toBe('slack:U0123ABC');
    expect(insertedRowCapture.row).toBeUndefined(); // no insert happened at all
  });
});
