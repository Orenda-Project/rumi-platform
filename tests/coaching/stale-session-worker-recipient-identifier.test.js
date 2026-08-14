/**
 * stale-session.worker.js — coaching reminders and auto-complete
 * notifications must deliver to session.recipient_identifier, never a
 * users.phone_number join (which is WhatsApp-only and would misdeliver a
 * Slack-originated session's reminder).
 */

function makeSupabase({ staleSessions }) {
  // A generic, thenable query builder. Every chain method returns the same
  // builder so any call order works; the builder is also a real thenable
  // (via .then()) so `await builder` resolves without a trailing .single()/
  // .limit() call — needed because the MAIN "find stale sessions" query
  // (.select().eq().order()) has no terminal call at all, while
  // checkUserActivity's three "is the user busy elsewhere" probes chain
  // further (.limit().single()) and want "nothing found" so the user is
  // treated as idle and the reminder/auto-complete path is reached.
  function builder(resolveValue) {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      in: () => b,
      limit: () => b,
      single: () => Promise.resolve(resolveValue.single ?? { data: null, error: { message: 'no rows' } }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      then: (resolve) => resolve(resolveValue.list ?? { data: [], error: null }),
    };
    return b;
  }

  return {
    from(table) {
      if (table === 'coaching_sessions') {
        // Shared by both the main list query (resolves via .then, no
        // .single()) and checkUserActivity's "another active coaching
        // session?" probe (resolves via .single(), "not found").
        return builder({ list: { data: staleSessions, error: null } });
      }
      // conversations / reading_assessments — checkUserActivity's other two
      // probes; "not found" keeps the user idle.
      return builder({});
    },
  };
}

function load({ staleSessions = [] } = {}) {
  jest.resetModules();
  jest.doMock('../../bot/shared/config/supabase', () => makeSupabase({ staleSessions }));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const whatsapp = {
    sendInteractiveButtons: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue(true),
  };
  jest.doMock('../../bot/shared/services/whatsapp.service', () => whatsapp);
  const coachingJobQueue = { queueReport: jest.fn().mockResolvedValue(undefined) };
  jest.doMock('../../bot/shared/services/coaching/coaching-job-queue.service', () => coachingJobQueue);

  const worker = require('../../bot/workers/stale-session.worker');
  return { worker, whatsapp, coachingJobQueue };
}

afterEach(() => jest.resetModules());

const now = Date.parse('2026-08-14T12:00:00Z');

describe('stale-session.worker — recipient_identifier delivery', () => {
  it('sends the reminder to session.recipient_identifier (Slack) instead of a re-derived phone number', async () => {
    const session = {
      id: 'session-1',
      user_id: 'user-1',
      status: 'conducting_conversation',
      recipient_identifier: 'slack:U0123ABC',
      conversation_state: {
        last_interaction: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3h idle -> past the 2h reminder threshold
        questions_answered: 1,
      },
      created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      users: { first_name: 'Ayesha' },
    };
    const { worker, whatsapp } = load({ staleSessions: [session] });

    await worker.processStaleCoachingSessions();

    expect(whatsapp.sendInteractiveButtons).toHaveBeenCalledWith(
      'slack:U0123ABC',
      expect.objectContaining({ body: expect.any(String) })
    );
  });

  it('auto-completes and queues the report notification to session.recipient_identifier past the 12h threshold', async () => {
    const session = {
      id: 'session-2',
      user_id: 'user-2',
      status: 'conducting_conversation',
      recipient_identifier: 'slack:U0999XYZ',
      conversation_state: {
        last_interaction: new Date(now - 13 * 60 * 60 * 1000).toISOString(), // 13h idle -> past auto-complete
        questions_answered: 2,
      },
      created_at: new Date(now - 13 * 60 * 60 * 1000).toISOString(),
      users: { first_name: 'Bilal' },
    };
    const { worker, whatsapp, coachingJobQueue } = load({ staleSessions: [session] });

    await worker.processStaleCoachingSessions();

    expect(coachingJobQueue.queueReport).toHaveBeenCalledWith(
      'session-2',
      expect.objectContaining({ from: 'slack:U0999XYZ' })
    );
    expect(whatsapp.sendMessage).toHaveBeenCalledWith('slack:U0999XYZ', expect.any(String));
  });
});
