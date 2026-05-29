/**
 * WhatsAppService.sendTemplate — bd-1881.
 *
 * The quiz-delivery "cold parent, no 24h window" path called
 * WhatsAppService.sendTemplate(...) but the method did not exist, so every
 * out-of-window quiz invite threw a TypeError (swallowed by the per-student
 * try/catch) and was never delivered. These tests lock the real method:
 * a faithful WhatsApp `type:'template'` send that returns true on success and
 * false (logged) on a Meta error — so the caller degrades gracefully.
 */

// axios + form-data resolve to tests/__mocks__ stubs via jest.config
// moduleNameMapper (they live in bot/node_modules, absent during the root job).
jest.mock('../../bot/shared/utils/constants', () => ({
  WHATSAPP_TOKEN: 'test-token',
  PHONE_NUMBER_ID: 'test-phone-id',
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  downloadFromR2: jest.fn(),
  extractKeyFromUrl: jest.fn(),
}));

const axios = require('axios'); // the mapped stub — axios.post is a jest.fn
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');

describe('WhatsAppService.sendTemplate', () => {
  beforeEach(() => {
    axios.post.mockReset();
    axios.post.mockResolvedValue({ data: {}, status: 200 });
  });

  it('is a real static method (not undefined)', () => {
    expect(typeof WhatsAppService.sendTemplate).toBe('function');
  });

  it('POSTs a type:template payload to the messages endpoint and returns true', async () => {
    axios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.X' }] } });

    const components = [
      { type: 'body', parameters: [{ type: 'text', text: 'Ali' }, { type: 'text', text: 'Fractions' }] },
    ];
    const result = await WhatsAppService.sendTemplate('923001234567', 'quiz_invitation_en', 'en', components);

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, payload, opts] = axios.post.mock.calls[0];
    expect(url).toContain('/test-phone-id/messages');
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '923001234567',
      type: 'template',
      template: {
        name: 'quiz_invitation_en',
        language: { code: 'en' },
        components,
      },
    });
    expect(opts.headers.Authorization).toBe('Bearer test-token');
  });

  it('passes the language code through verbatim (ur)', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await WhatsAppService.sendTemplate('923001234567', 'quiz_invitation_ur', 'ur', []);
    expect(axios.post.mock.calls[0][1].template.language.code).toBe('ur');
  });

  it('omits the components key when none are given', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await WhatsAppService.sendTemplate('923001234567', 'plain_template', 'en');
    expect(axios.post.mock.calls[0][1].template).not.toHaveProperty('components');
  });

  it('returns false (does not throw) when Meta rejects the template', async () => {
    axios.post.mockRejectedValue({
      message: 'Request failed with status code 400',
      response: { data: { error: { message: 'Template name does not exist' } } },
    });
    const result = await WhatsAppService.sendTemplate('923001234567', 'missing_template', 'en', []);
    expect(result).toBe(false);
  });
});
