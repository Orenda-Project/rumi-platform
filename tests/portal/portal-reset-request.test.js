/**
 * The portal backend's half of the reset code: it finds the account by the
 * number the teacher typed, stores a code, and asks the bot to send it. It now
 * tells the bot WHICH user (the userId it just found), so the bot can send to
 * that person's own channel (their Matrix DM on a messenger-only deployment)
 * instead of to a bare number. An unknown number gets nothing sent at all.
 *
 * axios (the HTTP call to the bot) is the mocked boundary.
 */

const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const mockDb = createFakeSupabase({ users: [] });
jest.mock('../../dashboard/config/supabase', () => mockDb.client);
const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...a) => mockPost(...a) }));

const PasswordResetService = require('../../dashboard/services/password-reset.service');

beforeEach(() => {
  mockDb.tables.users.length = 0;
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { success: true } });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('PasswordResetService.sendResetCode', () => {
  test('asks the bot to send the code to this user, by id', async () => {
    mockDb.tables.users.push({ id: 'u-mx', phone_number: '15551000001', first_name: 'Sam', portal_activated: true });
    const result = await PasswordResetService.sendResetCode('15551000001');
    expect(result).toEqual({ success: true });
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toMatch(/\/api\/internal\/send-password-reset$/);
    expect(body).toMatchObject({ userId: 'u-mx', phoneNumber: '15551000001', firstName: 'Sam' });
    expect(body.code).toBe(mockDb.tables.users[0].password_reset_code);
  });

  test('a code the bot could not send is not kept, so the teacher can ask again at once', async () => {
    // Otherwise the stored expiry rate-limits the next request for 10 minutes
    // although no code ever arrived.
    mockDb.tables.users.push({ id: 'u-mx', phone_number: '15551000001', first_name: null, portal_activated: true });
    mockPost.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 500'), { response: { data: { success: false } } }));
    const result = await PasswordResetService.sendResetCode('15551000001');
    expect(result.success).toBe(false);
    expect(mockDb.tables.users[0]).toMatchObject({ password_reset_code: null, password_reset_expires_at: null });
    expect(await PasswordResetService.checkRateLimit('15551000001')).toEqual({ allowed: true });
  });

  test('an unknown number: nothing is stored and nothing is sent', async () => {
    const result = await PasswordResetService.sendResetCode('15559999999');
    expect(result.success).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
