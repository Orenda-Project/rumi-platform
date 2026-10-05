/**
 * The passage image is removed from disk however the send ends.
 *
 * generateAndSendPassage writes the rendered passage to a private temp file and
 * sends it by path. The file was removed only after a successful send, so a
 * database error or a refused upload left `passage-*` directories in TEMP_DIR,
 * which nothing sweeps.
 *
 * The real service runs; only the boundaries are faked: the model client, the
 * image renderer, object storage, the database and the channel.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let TEMP;
let service;
let WhatsAppService;
let dbUpdate;

function load() {
  jest.resetModules();
  TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-passage-'));
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/constants', () => ({
    ...jest.requireActual('../../bot/shared/utils/constants'),
    TEMP_DIR: TEMP,
  }));
  jest.doMock('../../bot/shared/services/llm-client', () => ({
    getClient: () => ({ chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Please read this aloud.' } }] }) } } }),
  }));
  dbUpdate = jest.fn(async () => ({ data: null, error: null }));
  jest.doMock('../../bot/shared/config/supabase', () => ({
    from: () => ({ update: () => ({ eq: dbUpdate }) }),
  }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({
    sendImage: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue(true),
  }));
  WhatsAppService = require('../../bot/shared/services/whatsapp.service');
  service = require('../../bot/shared/services/reading/passage-generation.service');
  jest.spyOn(service, 'generatePassageText').mockResolvedValue({ text: 'The kite flew over the hill.', title: null });
  jest.spyOn(service, 'createPassageImage').mockResolvedValue(Buffer.from('PNG passage image'));
  jest.spyOn(service, 'uploadPassageImage').mockResolvedValue(null);
}

const send = () => service.generateAndSendPassage(
  'assessment-1', 'user-1', '15550100401', 'en', { type: 'sentences', wordCount: 6, grade: 2 }, 'en',
);

beforeEach(load);
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(TEMP, { recursive: true, force: true });
});

describe('passage image temp file', () => {
  it('is sent by its own path and removed after a send', async () => {
    await send();
    const [, imagePath] = WhatsAppService.sendImage.mock.calls[0];
    expect(path.dirname(path.dirname(imagePath))).toBe(TEMP);
    expect(fs.readdirSync(TEMP)).toEqual([]);
  });

  it('is removed when the send throws', async () => {
    WhatsAppService.sendImage.mockRejectedValue(new Error('upload refused'));
    await expect(send()).rejects.toThrow('upload refused');
    expect(fs.readdirSync(TEMP)).toEqual([]);
  });

  it('is removed when the database update throws', async () => {
    dbUpdate.mockRejectedValueOnce(new Error('connection reset'));
    await expect(send()).rejects.toThrow('connection reset');
    expect(WhatsAppService.sendImage).not.toHaveBeenCalled();
    expect(fs.readdirSync(TEMP)).toEqual([]);
  });
});
