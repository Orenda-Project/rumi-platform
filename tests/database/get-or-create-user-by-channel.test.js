/**
 * getOrCreateUserByChannel / getSendTargetsForUser — the multi-homed identity
 * layer added alongside the concurrent-channel messaging architecture.
 *
 * Contract under test:
 *   - channel === 'whatsapp' delegates to the untouched getOrCreateUser(),
 *     then lazily backfills a user_channels row for it.
 *   - A known (channel, channel_user_id) pair resolves the linked user and
 *     stamps user_channels.last_message_at.
 *   - An unknown (channel, channel_user_id) pair creates a NEW users row
 *     (no phone_number) plus its first user_channels row, is_primary=true.
 *   - getSendTargetsForUser returns every channel identity linked to a user,
 *     for async fan-out — not a single assumed phone_number.
 */

// Mutable state the mock factory reads (must be `mock`-prefixed for jest).
const mockState = {
  existingWhatsappUser: null,
  existingChannelLink: null, // { user_id }
  usersById: {},
  calls: { userInserts: [], channelInserts: [], channelUpdates: [] },
};

jest.mock('../../bot/shared/config/supabase', () => {
  function usersTable() {
    const api = {
      select() { return api; },
      eq(_col, val) { api._eqVal = val; return api; },
      single() {
        if (api._mode === 'insert') {
          const row = api._lastInsert;
          api._mode = null;
          const created = { id: 'new-user-uuid', ...row };
          mockState.usersById[created.id] = created;
          return Promise.resolve({ data: created, error: null });
        }
        // Lookup by id (getOrCreateUserByChannel's post-link-resolution fetch)
        if (mockState.usersById[api._eqVal]) {
          return Promise.resolve({ data: mockState.usersById[api._eqVal], error: null });
        }
        return mockState.existingWhatsappUser
          ? Promise.resolve({ data: mockState.existingWhatsappUser, error: null })
          : Promise.resolve({ data: null, error: { code: 'PGRST116' } });
      },
      insert(row) {
        api._mode = 'insert';
        api._lastInsert = row;
        mockState.calls.userInserts.push(row);
        return api;
      },
      update(row) {
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    };
    return api;
  }

  function userChannelsTable() {
    const api = {
      select(cols) { api._selectCols = cols; return api; },
      eq() { return api; },
      single() {
        if (api._mode === 'insert') {
          api._mode = null;
          return Promise.resolve({ data: null, error: null });
        }
        if (api._selectCols === 'user_id') {
          return Promise.resolve({ data: mockState.existingChannelLink, error: null });
        }
        // ensureUserChannelRow's "does a row already exist" probe (select('id'))
        return Promise.resolve({ data: mockState.existingChannelLink ? { id: 'link-1' } : null, error: null });
      },
      insert(row) {
        api._mode = 'insert';
        mockState.calls.channelInserts.push(row);
        return api;
      },
      update(row) {
        mockState.calls.channelUpdates.push(row);
        return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
      },
    };
    return api;
  }

  return {
    from(table) {
      if (table === 'users') return usersTable();
      if (table === 'user_channels') return userChannelsTable();
      throw new Error(`Unexpected table in test mock: ${table}`);
    },
  };
});

const {
  getOrCreateUser,
  getOrCreateUserByChannel,
  getSendTargetsForUser,
} = require('../../bot/shared/database/bot-helpers');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getOrCreateUserByChannel', () => {
  beforeEach(() => {
    mockState.existingWhatsappUser = null;
    mockState.existingChannelLink = null;
    mockState.usersById = {};
    mockState.calls = { userInserts: [], channelInserts: [], channelUpdates: [] };
  });

  it("channel === 'whatsapp' delegates to getOrCreateUser and backfills a user_channels row", async () => {
    mockState.existingWhatsappUser = { id: 'u-wa', phone_number: '923001234567' };

    const user = await getOrCreateUserByChannel('whatsapp', '923001234567');

    expect(user.id).toBe('u-wa');
    const backfillRow = mockState.calls.channelInserts.find((r) => r.channel === 'whatsapp');
    expect(backfillRow).toBeDefined();
    expect(backfillRow.channel_user_id).toBe('923001234567');
    expect(backfillRow.is_primary).toBe(true);
  });

  it('resolves an existing non-WhatsApp channel link to its linked user, without creating a new one', async () => {
    mockState.existingChannelLink = { user_id: 'u-existing' };
    mockState.usersById['u-existing'] = { id: 'u-existing', phone_number: null };

    const user = await getOrCreateUserByChannel('slack', 'U0123ABC');

    expect(user.id).toBe('u-existing');
    expect(mockState.calls.userInserts).toHaveLength(0);
    // Stamps last_message_at on the existing link rather than inserting a new one.
    expect(mockState.calls.channelUpdates.length).toBeGreaterThan(0);
  });

  it('creates a brand-new user (no phone_number) plus its first user_channels row for an unknown Slack identity', async () => {
    mockState.existingChannelLink = null;

    const user = await getOrCreateUserByChannel('slack', 'U9999NEW');

    expect(user.id).toBe('new-user-uuid');
    expect(user.phone_number).toBeUndefined(); // never set for a non-WhatsApp-only identity
    const insertedUserRow = mockState.calls.userInserts[0];
    expect(insertedUserRow.phone_number).toBeUndefined();

    const insertedLink = mockState.calls.channelInserts.find((r) => r.channel === 'slack');
    expect(insertedLink).toBeDefined();
    expect(insertedLink.channel_user_id).toBe('U9999NEW');
    expect(insertedLink.user_id).toBe('new-user-uuid');
    expect(insertedLink.is_primary).toBe(true);
  });
});

describe('getSendTargetsForUser', () => {
  it('returns every channel identity row for the given user id', async () => {
    const supabase = require('../../bot/shared/config/supabase');
    const rows = [
      { channel: 'whatsapp', channel_user_id: '923001234567' },
      { channel: 'slack', channel_user_id: 'U0123ABC' },
    ];
    jest.spyOn(supabase, 'from').mockReturnValueOnce({
      select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
    });

    const targets = await getSendTargetsForUser('u-multi');

    expect(targets).toEqual(rows);
  });

  it('returns an empty array (not a throw) on a query error', async () => {
    const supabase = require('../../bot/shared/config/supabase');
    jest.spyOn(supabase, 'from').mockReturnValueOnce({
      select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
    });

    const targets = await getSendTargetsForUser('u-error');

    expect(targets).toEqual([]);
  });
});
