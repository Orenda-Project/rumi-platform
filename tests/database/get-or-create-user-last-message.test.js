/**
 * getOrCreateUser populates users.last_message_at on EVERY inbound (bd-1877).
 *
 * last_message_at feeds the WhatsApp 24-hour service-window check used by
 * dashboard broadcasts. It must be stamped on every inbound message — both for
 * a returning user (an UPDATE) and a brand-new user (set at INSERT). The
 * stamp must NOT throw into the create path (a transient failure should be
 * logged, not treated as "user not found" → duplicate insert).
 */

// Mutable state the mock factory reads (must be `mock`-prefixed for jest).
const mockState = { existingUser: null, calls: { updates: [], inserts: [] } };

jest.mock('../../bot/shared/config/supabase', () => {
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    single() {
      if (api._mode === 'insert') {
        const row = api._lastInsert;
        api._mode = null;
        return Promise.resolve({ data: { id: 'new-uuid', ...row }, error: null });
      }
      return mockState.existingUser
        ? Promise.resolve({ data: mockState.existingUser, error: null })
        : Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    },
    insert(row) { api._mode = 'insert'; api._lastInsert = row; mockState.calls.inserts.push(row); return api; },
    update(row) {
      mockState.calls.updates.push(row);
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    },
  };
  return api;
});

const { getOrCreateUser } = require('../../bot/shared/database/bot-helpers');

describe('getOrCreateUser — last_message_at stamping (bd-1877)', () => {
  beforeEach(() => {
    mockState.existingUser = null;
    mockState.calls = { updates: [], inserts: [] };
  });

  it('UPDATEs last_message_at for a returning user', async () => {
    mockState.existingUser = { id: 'u1', phone_number: '92300', registration_completed: true };

    const user = await getOrCreateUser('92300');

    const stamped = mockState.calls.updates.find(u => 'last_message_at' in u);
    expect(stamped).toBeDefined();
    expect(typeof stamped.last_message_at).toBe('string');
    expect(user.last_message_at).toBe(stamped.last_message_at); // returned object reflects the stamp
  });

  it('sets last_message_at at INSERT for a brand-new user', async () => {
    mockState.existingUser = null;

    await getOrCreateUser('92301');

    const insertedRow = mockState.calls.inserts.find(r => r.phone_number === '92301');
    expect(insertedRow).toBeDefined();
    expect(typeof insertedRow.last_message_at).toBe('string');
  });
});
