/**
 * Two coach cards for one session in the same millisecond each send their OWN image.
 *
 * The card PNG was written to TEMP_DIR/observe_coach_card_<session>_<ms>.png and the
 * path handed to sendImage, whose upload reads the file later. A queue retry that
 * overlaps the first delivery shares that name: the second write overwrites the
 * first, and the first send's cleanup deletes the file the second is still reading.
 * Only the channel is faked — it reads the file it was given after 150 ms.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn() }));
jest.mock('../../bot/shared/utils/constants', () => {
  const real = jest.requireActual('../../bot/shared/utils/constants');
  const os = require('os');
  const p = require('path');
  const f = require('fs');
  return { ...real, TEMP_DIR: f.mkdtempSync(p.join(os.tmpdir(), 'observe-card-')) };
});
jest.mock('../../bot/shared/services/whatsapp.service', () => ({ sendImage: jest.fn(), sendMessage: jest.fn() }));

const fs = require('fs');
const { TEMP_DIR } = require('../../bot/shared/utils/constants');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const { _sendCardImage } = require('../../bot/shared/services/observe/observe-debrief.service');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

afterAll(() => { try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ } });

it('each send reads its own card, and nothing is left behind', async () => {
  const received = {};
  WhatsAppService.sendImage.mockImplementation(async (to, file) => {
    await sleep(150); // the upload connects before it reads the body
    received[to] = fs.readFileSync(file).toString();
    return true;
  });
  jest.spyOn(Date, 'now').mockReturnValue(1790000000000);

  const results = await Promise.all([
    _sendCardImage('session-1', '15550100401', Buffer.from('card for the first delivery'), 'cap'),
    _sendCardImage('session-1', '15550100402', Buffer.from('card for the retry'), 'cap'),
  ]);
  jest.restoreAllMocks();

  expect(results).toEqual([true, true]);
  expect(received).toEqual({
    15550100401: 'card for the first delivery',
    15550100402: 'card for the retry',
  });
  expect(fs.readdirSync(TEMP_DIR)).toEqual([]);
});
