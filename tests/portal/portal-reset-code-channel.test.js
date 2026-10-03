/**
 * The portal's password reset code reaches the person on the channel they use.
 *
 * The portal backend asks the bot (POST /api/internal/send-password-reset)
 * with the phone number the teacher typed. Sending to that bare number only
 * works where WhatsApp runs: on a messenger-only deployment
 * (CHANNEL_DRIVER=none) a bare number has nowhere to go, so a teacher who uses
 * only Rumi Messenger never got a code and could never reset a password. The
 * bot now sends to the user's own channel identity (user_channels, the
 * channel they last used), and a WhatsApp-only user still gets it on their
 * number, exactly as before.
 *
 * The messaging router is real; only the drivers' network sends are mocked.
 */

const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const VARS = ['CHANNEL_DRIVER', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID', 'WEBHOOK_VERIFY_TOKEN', 'WABA_ID',
  'MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN', 'INTERNAL_API_KEY'];

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function load({ env, users, userChannels }) {
  jest.resetModules();
  VARS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  const db = createFakeSupabase({ users, user_channels: userChannels || [] });
  jest.doMock('../../bot/shared/config/supabase', () => db.client);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const matrixSend = jest.fn(async () => true);
  const metaSend = jest.fn(async () => true);
  jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({ sendMessage: matrixSend }));
  jest.doMock('../../bot/shared/services/messaging/meta-channel.service', () => ({ sendMessage: metaSend }));
  const { sendPasswordReset } = require('../../bot/shared/routes/portal-internal-endpoint');
  return { sendPasswordReset, matrixSend, metaSend };
}

const MATRIX_ONLY = {
  CHANNEL_DRIVER: 'none',
  MATRIX_HOMESERVER_URL: 'https://matrix.example.org',
  MATRIX_ACCESS_TOKEN: 'test-token',
  INTERNAL_API_KEY: 'k-internal',
};
const META = {
  CHANNEL_DRIVER: 'meta',
  WHATSAPP_TOKEN: 'x', PHONE_NUMBER_ID: '1', WEBHOOK_VERIFY_TOKEN: 'v', WABA_ID: '2',
  INTERNAL_API_KEY: 'k-internal',
};

const request = (body, key = 'k-internal') => ({ headers: { 'x-api-key': key }, body, ip: '127.0.0.1' });

afterEach(() => { jest.resetModules(); VARS.forEach((k) => delete process.env[k]); });

describe('POST /api/internal/send-password-reset', () => {
  test('a messenger-only teacher gets the code in their Matrix DM, not at a bare number', async () => {
    const { sendPasswordReset, matrixSend } = load({
      env: MATRIX_ONLY,
      users: [{ id: 'u-mx', phone_number: '15551000001', first_name: 'Sam' }],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    const res = fakeRes();
    await sendPasswordReset(request({ phoneNumber: '15551000001', userId: 'u-mx', code: '123456', firstName: 'Sam' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(matrixSend).toHaveBeenCalledTimes(1);
    expect(matrixSend.mock.calls[0][0]).toBe('mtx:15551000001');
    expect(matrixSend.mock.calls[0][1]).toMatch(/123456/);
  });

  test('an older portal backend that sends only the number still reaches the Matrix DM', async () => {
    const { sendPasswordReset, matrixSend } = load({
      env: MATRIX_ONLY,
      users: [{ id: 'u-mx', phone_number: '15551000001', first_name: 'Sam' }],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    const res = fakeRes();
    await sendPasswordReset(request({ phoneNumber: '15551000001', code: '654321', firstName: 'Sam' }), res);
    expect(res.body).toMatchObject({ success: true });
    expect(matrixSend.mock.calls[0][0]).toBe('mtx:15551000001');
  });

  test('a person whose Matrix username is not a number is reached on that account', async () => {
    // The operator recorded a phone number for them by hand (docs/channels/matrix.md).
    const { sendPasswordReset, matrixSend } = load({
      env: MATRIX_ONLY,
      users: [{ id: 'u-name', phone_number: '15551000002', first_name: 'Robin' }],
      userChannels: [{ user_id: 'u-name', channel: 'matrix', channel_user_id: '@robin:example.org', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    const res = fakeRes();
    await sendPasswordReset(request({ phoneNumber: '15551000002', userId: 'u-name', code: '111222', firstName: 'Robin' }), res);
    expect(res.body).toMatchObject({ success: true });
    expect(matrixSend.mock.calls[0][0]).toBe('matrix:@robin:example.org');
  });

  test('Meta deployments are unchanged: a WhatsApp teacher gets the same message at their number', async () => {
    const { sendPasswordReset, metaSend } = load({
      env: META,
      users: [{ id: 'u-wa', phone_number: '15551000003', first_name: 'Alex' }],
    });
    const res = fakeRes();
    await sendPasswordReset(request({ phoneNumber: '15551000003', userId: 'u-wa', code: '333444', firstName: 'Alex', language: 'es' }), res);
    expect(res.body).toMatchObject({ success: true });
    expect(metaSend).toHaveBeenCalledWith('15551000003', expect.stringMatching(/333444[\s\S]*10 minutos/));
  });

  test('someone Rumi does not know by name yet still gets the code (found running the Matrix rig)', async () => {
    // Registration on the messenger is conversational: a teacher can sign in to
    // the portal before Rumi has learned their name, so first_name is null.
    const { sendPasswordReset, matrixSend } = load({
      env: MATRIX_ONLY,
      users: [{ id: 'u-mx', phone_number: '15551000001', first_name: null }],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    const res = fakeRes();
    await sendPasswordReset(request({ phoneNumber: '15551000001', userId: 'u-mx', code: '777888', firstName: null }), res);
    expect(res.body).toMatchObject({ success: true });
    expect(matrixSend.mock.calls[0][1]).toMatch(/^Hi! 👋[\s\S]*777888/);
    expect(matrixSend.mock.calls[0][1]).not.toMatch(/null|undefined/);
  });

  test('a failed send is reported, not claimed', async () => {
    const { sendPasswordReset } = load({
      env: MATRIX_ONLY,
      users: [{ id: 'u-none', phone_number: '15551000004', first_name: 'Kai' }],
    });
    // No channel row and no WhatsApp: there is nowhere to send it.
    const res = fakeRes();
    await sendPasswordReset(request({ phoneNumber: '15551000004', userId: 'u-none', code: '555666', firstName: 'Kai' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('refuses every call when INTERNAL_API_KEY is not set on the bot', async () => {
    const { sendPasswordReset, matrixSend } = load({
      env: { ...MATRIX_ONLY, INTERNAL_API_KEY: '' },
      users: [{ id: 'u-mx', phone_number: '15551000001', first_name: 'Sam' }],
      userChannels: [{ user_id: 'u-mx', channel: 'matrix', channel_user_id: '15551000001', last_message_at: '2026-10-03T09:00:00Z' }],
    });
    for (const key of [undefined, '']) {
      const res = fakeRes();
      await sendPasswordReset(request({ phoneNumber: '15551000001', userId: 'u-mx', code: '123456', firstName: 'Sam' }, key), res);
      expect(res.statusCode).toBe(401);
    }
    expect(matrixSend).not.toHaveBeenCalled();
  });
});
