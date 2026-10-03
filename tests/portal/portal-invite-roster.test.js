/**
 * observe-roster.js portal-invite <coach-phone> — a partner who sets up
 * coaches from the roster can send each one the portal invite, on the channel
 * the coach uses. A coach who uses only Rumi Messenger has never written to
 * the bot, so there is no inbound message to answer: the invite goes to the
 * channel on their roster entry (their Matrix DM).
 *
 * The CLI, the invite service and the messaging router are real; only the
 * drivers' network sends are mocked.
 */

const { createFakeSupabase } = require('../observe/_helpers/fake-supabase');

const VARS = ['CHANNEL_DRIVER', 'MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN', 'PORTAL_URL', 'OBSERVE_ENABLED'];

function load(env) {
  jest.resetModules();
  VARS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, {
    CHANNEL_DRIVER: 'none',
    MATRIX_HOMESERVER_URL: 'https://matrix.example.org',
    MATRIX_ACCESS_TOKEN: 'test-token',
    PORTAL_URL: 'https://portal.example.org',
    OBSERVE_ENABLED: 'true',
    ...env,
  });
  const db = createFakeSupabase({ users: [], user_channels: [], schools: [], leader_schools: [] });
  jest.doMock('../../bot/shared/config/supabase', () => db.client);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const matrixSend = jest.fn(async () => true);
  jest.doMock('../../bot/shared/services/messaging/matrix-channel.service', () => ({ sendMessage: matrixSend }));
  const Cli = require('../../bot/scripts/observe-roster');
  return { db, Cli, matrixSend };
}

const out = () => {
  const lines = [];
  return { log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(`ERR ${a.join(' ')}`), lines };
};

afterEach(() => { jest.resetModules(); VARS.forEach((k) => delete process.env[k]); });

describe('observe-roster portal-invite', () => {
  test('a messenger-only coach on the roster gets the invite in their Matrix DM', async () => {
    const { db, Cli, matrixSend } = load();
    expect(await Cli.main(['grant-coach', 'mtx:15551000011'], out())).toBe(0);
    const o = out();
    expect(await Cli.main(['portal-invite', 'mtx:15551000011'], o)).toBe(0);
    expect(o.lines.join('\n')).toMatch(/portal invite sent to mtx:15551000011/);
    expect(matrixSend).toHaveBeenCalledWith('mtx:15551000011', expect.stringMatching(/\/portal\/setup\/[\s\S]*Observations/));
    const coach = db.tables.users[0];
    expect(coach).toMatchObject({ role: 'coach', phone_number: '15551000011' });
    expect(coach.portal_invite_token).toBeTruthy();
  });

  test('says why when there is nothing to sign in with, and when the portal is already set up', async () => {
    const { db, Cli, matrixSend } = load();
    expect(await Cli.main(['grant-coach', 'matrix:@robin:example.org'], out())).toBe(0);
    let o = out();
    expect(await Cli.main(['portal-invite', 'matrix:@robin:example.org'], o)).toBe(1);
    expect(o.lines.join('\n')).toMatch(/no phone number/i);

    db.tables.users.push({ id: 'done', phone_number: '15551000012', role: 'coach', portal_activated: true });
    o = out();
    expect(await Cli.main(['portal-invite', '15551000012'], o)).toBe(1);
    expect(o.lines.join('\n')).toMatch(/already/i);

    o = out();
    expect(await Cli.main(['portal-invite', 'mtx:15551000099'], o)).toBe(1);
    expect(o.lines.join('\n')).toMatch(/no user/i);
    expect(matrixSend).not.toHaveBeenCalled();
  });
});
