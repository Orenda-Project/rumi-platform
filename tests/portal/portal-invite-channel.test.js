/**
 * Portal invites for people who use only Rumi Messenger.
 *
 * The portal signs people in by phone number + a password they set from a
 * setup link. On a messenger-only deployment (CHANNEL_DRIVER=none):
 *   - the link must reach the person's own channel (their Matrix DM), never a
 *     bare number, which has nowhere to go;
 *   - a coach put on the observe roster has never written to the bot, so their
 *     phone number (their Matrix username, @+<digits>) is not on file yet; it
 *     is recorded before the link is sent, or they could not sign in;
 *   - a person whose Matrix username is a name has no phone number at all, so
 *     a link would set a password they can never use: they are told so, and
 *     no link is minted.
 * Meta deployments send the same message as before.
 *
 * The messaging router is real; only the drivers' network sends are mocked.
 */

const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const VARS = ['CHANNEL_DRIVER', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID',
  'MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN', 'PORTAL_URL', 'OBSERVE_ENABLED', 'OBSERVE_LEADER_ROLES'];

const MATRIX_ONLY = {
  CHANNEL_DRIVER: 'none',
  MATRIX_HOMESERVER_URL: 'https://matrix.example.org',
  MATRIX_ACCESS_TOKEN: 'test-token',
  PORTAL_URL: 'https://portal.example.org',
};
const META = {
  CHANNEL_DRIVER: 'meta',
  WHATSAPP_TOKEN: 'x', PHONE_NUMBER_ID: '1', WEBHOOK_VERIFY_TOKEN: 'v', WABA_ID: '2',
  PORTAL_URL: 'https://portal.example.org',
};

function load({ env, users, userChannels, matrixResult = true }) {
  jest.resetModules();
  VARS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  const db = createFakeSupabase({ users, user_channels: userChannels || [] });
  jest.doMock('../../bot/shared/config/supabase', () => db.client);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const matrixSend = jest.fn(async () => matrixResult);
  const metaSend = jest.fn(async () => true);
  jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({ sendMessage: matrixSend }));
  jest.doMock('../../bot/shared/services/messaging/meta-channel.service', () => ({ sendMessage: metaSend }));
  const PortalInviteService = require('../../bot/shared/services/portal-invite.service');
  const { handlePortalCommand } = require('../../bot/shared/handlers/portal-command.handler');
  return { db, PortalInviteService, handlePortalCommand, matrixSend, metaSend };
}

afterEach(() => { jest.resetModules(); VARS.forEach((k) => delete process.env[k]); });

describe('/portal on the messenger', () => {
  test('a messenger-only teacher gets the setup link in their Matrix DM, with the number they sign in with', async () => {
    const user = { id: 'u-mx', phone_number: '15551000001', preferred_language: 'en', portal_activated: false };
    const { db, handlePortalCommand, matrixSend } = load({
      env: MATRIX_ONLY,
      users: [user],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    expect(await handlePortalCommand(user, 'mtx:15551000001')).toBe('');
    const token = db.tables.users[0].portal_invite_token;
    expect(token).toBeTruthy();
    expect(matrixSend).toHaveBeenCalledWith('mtx:15551000001', expect.stringContaining(`https://portal.example.org/portal/setup/${token}`));
    expect(matrixSend.mock.calls[0][1]).toContain('+15551000001');
  });

  test('a Matrix username that is not a number: told how the portal signs in, and no link is minted', async () => {
    const user = { id: 'u-name', phone_number: null, preferred_language: 'en', portal_activated: false };
    const { db, handlePortalCommand, matrixSend } = load({
      env: MATRIX_ONLY,
      users: [user],
      userChannels: [{ user_id: 'u-name', channel: 'matrix', channel_user_id: '@robin:example.org', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    const reply = await handlePortalCommand(user, 'matrix:@robin:example.org');
    expect(reply).toMatch(/phone number/i);
    expect(reply).not.toMatch(/try again in a few minutes/i);
    expect(db.tables.users[0].portal_invite_token).toBeFalsy();
    expect(matrixSend).not.toHaveBeenCalled();
  });

  test('a failed send is not reported as sent', async () => {
    const user = { id: 'u-mx', phone_number: '15551000001', preferred_language: 'en', portal_activated: false };
    const { PortalInviteService } = load({
      env: MATRIX_ONLY,
      users: [user],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001', last_message_at: '2026-10-03T09:00:00Z' }],
      matrixResult: false,
    });
    const result = await PortalInviteService.sendPortalInvite('u-mx', 'mtx:15551000001', 'en');
    expect(result.success).toBe(false);
  });

  test('Meta deployments are unchanged: the same message, at the number', async () => {
    const user = { id: 'u-wa', phone_number: '15551000003', preferred_language: 'en', portal_activated: false };
    const { db, handlePortalCommand, metaSend } = load({ env: META, users: [user] });
    expect(await handlePortalCommand(user, '15551000003')).toBe('');
    const token = db.tables.users[0].portal_invite_token;
    expect(metaSend).toHaveBeenCalledWith('15551000003', `Great! I've created your personal Rumi portal where you can access all your lesson plans, presentations, and coaching reports.

🔗 *Set up your portal:*
https://portal.example.org/portal/setup/${token}

This link expires in 7 days. Click it to create your password and log in.`);
  });
});

describe('a coach on the observe roster who uses only the messenger', () => {
  const coach = { id: 'c-1', phone_number: null, role: 'coach', preferred_language: 'en', portal_activated: false };
  const link = { user_id: 'c-1', channel: 'matrix', channel_user_id: '15551000011', is_primary: true };

  test('gets the invite in their Matrix DM, their number is recorded, and the copy names the observe view', async () => {
    const { db, PortalInviteService, matrixSend } = load({
      env: { ...MATRIX_ONLY, OBSERVE_ENABLED: 'true' },
      users: [{ ...coach }],
      userChannels: [link],
    });
    // No recipient given: the roster has the person, not an inbound message.
    const result = await PortalInviteService.sendPortalInvite('c-1', null, 'en');
    expect(result.success).toBe(true);
    expect(db.tables.users[0].phone_number).toBe('15551000011');
    expect(matrixSend).toHaveBeenCalledWith('mtx:15551000011', expect.stringContaining('/portal/setup/'));
    expect(matrixSend.mock.calls[0][1]).toMatch(/Observations/);
  });

  test('a number already held by another user is not taken over', async () => {
    const { db, PortalInviteService, matrixSend } = load({
      env: { ...MATRIX_ONLY, OBSERVE_ENABLED: 'true' },
      users: [{ ...coach }, { id: 'other', phone_number: '15551000011' }],
      userChannels: [link],
    });
    const result = await PortalInviteService.sendPortalInvite('c-1', null, 'en');
    expect(result).toMatchObject({ success: false, reason: 'no_sign_in_number' });
    expect(db.tables.users[0].phone_number).toBeNull();
    expect(matrixSend).not.toHaveBeenCalled();
  });

  test('a teacher (not in the coach family) gets no observe line', async () => {
    const { PortalInviteService, matrixSend } = load({
      env: { ...MATRIX_ONLY, OBSERVE_ENABLED: 'true' },
      users: [{ ...coach, role: null }],
      userChannels: [link],
    });
    await PortalInviteService.sendPortalInvite('c-1', null, 'en');
    expect(matrixSend.mock.calls[0][1]).not.toMatch(/Observations/);
  });
});
