/**
 * The dashboard (which serves the teacher portal) must boot on a fresh clone
 * with no email provider configured. Its email service built the Resend
 * client at startup, and the Resend SDK throws on a missing key, so the whole
 * dashboard (portal sign-in included) died at boot without RESEND_API_KEY.
 * The client is now built on first send; with no key a send reports an error.
 *
 * The SDK is the mocked boundary, with the real SDK's missing-key throw.
 */

jest.mock('resend', () => ({
  Resend: class {
    constructor(key) {
      if (!key) throw new Error('Missing API key. Pass it to the constructor `new Resend("re_123")`');
      this.emails = { send: jest.fn(async () => ({ data: { id: 'email-1' }, error: null })) };
    }
  },
}), { virtual: true });

afterEach(() => { jest.resetModules(); delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; });

describe('dashboard email service without an email provider', () => {
  test('loads and is created without RESEND_API_KEY (the dashboard boots)', () => {
    delete process.env.RESEND_API_KEY;
    const getResendEmailService = require('../../dashboard/services/resend-email.service');
    expect(() => getResendEmailService()).not.toThrow();
  });

  test('a send without a key reports an error instead of throwing', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'rumi@example.org';
    const service = require('../../dashboard/services/resend-email.service')();
    const result = await service.sendInvitation('admin@example.org', 't-1', 'Sam', 'admin');
    expect(result.success).toBe(false);
  });

  test('with a key, the client is built and used', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'rumi@example.org';
    const service = require('../../dashboard/services/resend-email.service')();
    const result = await service.sendInvitation('admin@example.org', 't-1', 'Sam', 'admin');
    expect(result.success).toBe(true);
  });
});
