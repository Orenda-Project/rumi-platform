/**
 * The setup link Rumi sends when a teacher finishes telling it their name.
 * Someone with no phone number to sign in with (a Matrix username that is a
 * name) would get a link that sets a password nobody can sign in with, so
 * they get the portal-free welcome instead and no link is minted. A teacher
 * whose Matrix username is their number gets the link in their DM.
 */

const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const VARS = ['CHANNEL_DRIVER', 'MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN', 'PORTAL_URL'];

function load({ users, userChannels }) {
  jest.resetModules();
  Object.assign(process.env, {
    CHANNEL_DRIVER: 'none',
    MATRIX_HOMESERVER_URL: 'https://matrix.example.org',
    MATRIX_ACCESS_TOKEN: 'test-token',
    PORTAL_URL: 'https://portal.example.org',
  });
  const db = createFakeSupabase({ users, user_channels: userChannels });
  jest.doMock('../../bot/shared/config/supabase', () => db.client);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    get: jest.fn(async () => null), setexWithCeiling: jest.fn(async () => true), delete: jest.fn(async () => true),
  }));
  const matrixSend = jest.fn(async () => true);
  jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({ sendMessage: matrixSend }));
  const FeatureRegistrationService = require('../../bot/shared/services/feature-registration.service');
  return { db, FeatureRegistrationService, matrixSend };
}

afterEach(() => { jest.resetModules(); VARS.forEach((k) => delete process.env[k]); });

describe('registration confirmation on the messenger', () => {
  test('a teacher named by their number gets the setup link in their Matrix DM', async () => {
    const { db, FeatureRegistrationService, matrixSend } = load({
      users: [{ id: 'u-mx', phone_number: '15551000001' }],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001' }],
    });
    const result = await FeatureRegistrationService.handleNameResponse('u-mx', 'My name is Sam Taylor', 'mtx:15551000001', 'en');
    expect(result.success).toBe(true);
    const token = db.tables.users[0].portal_invite_token;
    expect(token).toBeTruthy();
    expect(matrixSend).toHaveBeenCalledWith('mtx:15551000001', expect.stringContaining(`/portal/setup/${token}`));
  });

  test('a Matrix username that is a name: welcomed, but no link it could never use', async () => {
    const { db, FeatureRegistrationService, matrixSend } = load({
      users: [{ id: 'u-name', phone_number: null }],
      userChannels: [{ user_id: 'u-name', channel: 'matrix', channel_user_id: '@robin:example.org' }],
    });
    const result = await FeatureRegistrationService.handleNameResponse('u-name', 'My name is Robin Lee', 'matrix:@robin:example.org', 'en');
    expect(result.success).toBe(true);
    expect(db.tables.users[0]).toMatchObject({ first_name: 'Robin', registration_completed: true });
    expect(db.tables.users[0].portal_invite_token).toBeFalsy();
    expect(matrixSend).toHaveBeenCalledTimes(1);
    expect(matrixSend.mock.calls[0][1]).toMatch(/Robin/);
    expect(matrixSend.mock.calls[0][1]).not.toMatch(/portal\/setup/);
  });
});
