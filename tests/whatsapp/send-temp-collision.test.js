/**
 * Meta driver media sends must not share a temp file between two calls.
 *
 * Every media send writes its bytes to disk and hands the PATH to the upload,
 * which appends fs.createReadStream(path) to the multipart body. The stream is
 * read only when the HTTP body goes out — after an await. A path named by the
 * clock alone (`audio_${Date.now()}.mp3`) or by a display name is shared by two
 * sends in the same millisecond: the second write overwrites the first (person
 * A is sent person B's voice note, with no error anywhere), or the first send's
 * cleanup unlinks the file the second is still uploading.
 *
 * These tests pin Date.now() so two concurrent sends share a millisecond, make
 * the upload read the stream only after a delay (as a real HTTP body would),
 * and check each recipient receives exactly their own bytes. They also check
 * that the temp file is removed whether the send succeeds or fails.
 */

process.env.CHANNEL_DRIVER = 'meta';

jest.mock('../../bot/shared/utils/constants', () => ({
  ...jest.requireActual('../../bot/shared/utils/constants'),
  WHATSAPP_TOKEN: 'test-token',
  PHONE_NUMBER_ID: 'test-phone-id',
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  downloadFromR2: jest.fn(),
  extractKeyFromUrl: jest.fn((url) => url),
}));
// Records what the driver appends, so the upload mock can read the file stream
// the way the real multipart body would: later, when the request is sent.
jest.mock('form-data', () => {
  class RecordingFormData {
    constructor() { this.parts = []; }
    append(name, value, options) { this.parts.push({ name, value, options }); }
    getHeaders() { return { 'content-type': 'multipart/form-data' }; }
  }
  return RecordingFormData;
});

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { downloadFromR2 } = require('../../bot/shared/storage/r2');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');

const A = '15550100101';
const B = '15550100102';
const BYTES = {
  [A]: Buffer.from('media bytes that belong to the first recipient only'),
  [B]: Buffer.from('a different payload that belongs to the second recipient'),
};
const SOURCE = {
  [A]: 'https://acct.r2.cloudflarestorage.com/bucket/first-recipient.bin',
  [B]: 'https://acct.r2.cloudflarestorage.com/bucket/second-recipient.bin',
};
const BUTTONS = [{ id: 'opt_1', title: 'One' }, { id: 'opt_2', title: 'Two' }];
// Where the URL-based sends put their temp files (the driver's default).
const DRIVER_TEMP = path.join(__dirname, '../../bot/temp');

const sha12 = (buf) => crypto.createHash('sha256').update(buf || Buffer.alloc(0)).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function listing(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

let baseDir;
let uploads;
let sends;
let failUploads;

beforeAll(() => {
  jest.spyOn(Date, 'now').mockReturnValue(1790000000000);
});

afterAll(() => {
  delete process.env.CHANNEL_DRIVER;
  jest.restoreAllMocks();
});

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-temp-collision-'));
  uploads = new Map();
  sends = [];
  failUploads = false;
  let nextMediaId = 1;

  downloadFromR2.mockImplementation(async (key) => (key === SOURCE[A] ? BYTES[A] : BYTES[B]));

  axios.post.mockImplementation(async (url, body) => {
    if (url.endsWith('/media')) {
      // A real upload streams the body after the request starts; give the
      // other concurrent send time to write (and clean up) first.
      await sleep(200);
      if (failUploads) throw new Error('upload rejected');
      const filePart = body.parts.find((p) => p.name === 'file');
      const bytes = await readStream(filePart.value);
      const id = `media-${nextMediaId++}`;
      uploads.set(id, bytes);
      return { data: { id } };
    }
    if (url.endsWith('/messages')) {
      const media = body.audio || body.video || body.image || body.document
        || (body.interactive && body.interactive.header && body.interactive.header.image);
      sends.push({ to: body.to, mediaId: media && media.id });
      return { data: { messages: [{ id: `wamid.${sends.length}` }] } };
    }
    return { data: {} };
  });
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

const SITES = [
  ['sendAudio (audio_${Date.now()}.mp3)', (to) => WhatsAppService.sendAudio(to, BYTES[to], baseDir), () => baseDir],
  ['sendAudioFromUrl -> sendAudio', (to) => WhatsAppService.sendAudioFromUrl(to, SOURCE[to]), () => DRIVER_TEMP],
  ['sendDocumentFromUrl (temp_${Date.now()}_${filename})', (to) => WhatsAppService.sendDocumentFromUrl(to, SOURCE[to], 'Report.pdf', 'cap'), () => DRIVER_TEMP],
  ['sendImageFromUrl (img_${Date.now()}.png)', (to) => WhatsAppService.sendImageFromUrl(to, SOURCE[to], 'cap'), () => DRIVER_TEMP],
  ['sendVideo (video_${Date.now()}.mp4)', (to) => WhatsAppService.sendVideo(to, BYTES[to], baseDir, 'cap'), () => baseDir],
  ['sendVideoFromUrl -> sendVideo', (to) => WhatsAppService.sendVideoFromUrl(to, SOURCE[to], 'cap'), () => DRIVER_TEMP],
  ['sendImageWithButtons (vocab_${Date.now()}.png)', (to) => WhatsAppService.sendImageWithButtons(to, SOURCE[to], 'Pick one', BUTTONS), () => DRIVER_TEMP],
];

describe.each(SITES)('%s', (_name, send, tempRoot) => {
  it('two concurrent sends in one millisecond each deliver their own bytes', async () => {
    const results = await Promise.all([send(A), send(B)]);

    expect(results).toEqual([true, true]);
    expect(sends).toHaveLength(2);
    const received = Object.fromEntries(sends.map((s) => [s.to, uploads.get(s.mediaId)]));
    expect(sha12(received[A])).toBe(sha12(BYTES[A]));
    expect(sha12(received[B])).toBe(sha12(BYTES[B]));
  });

  it('leaves nothing behind after a successful send', async () => {
    const before = listing(tempRoot());
    expect(await send(A)).toBe(true);
    expect(listing(tempRoot())).toEqual(before);
  });

  it('removes what it wrote when the upload fails', async () => {
    const before = listing(tempRoot());
    failUploads = true;
    expect(await send(A)).toBe(false);
    expect(listing(tempRoot())).toEqual(before);
  });
});
