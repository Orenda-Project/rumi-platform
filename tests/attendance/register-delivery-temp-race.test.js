/**
 * Two schools, one file name, one upload each — and each teacher gets THEIR register.
 *
 * The register's file name carries no school: "Grade 5 A, September 2026" is
 * `Attendance_Grade_5_A_September_2026.xlsx` everywhere. Delivery used to write the
 * buffer to TEMP_DIR/<fileName> and hand that path to the channel's sendDocument, and
 * the Meta driver opens a read stream that is only consumed when the HTTP upload body
 * goes out. A second delivery with the same name that wrote in between overwrote the
 * file, and the first teacher was sent the other school's register — the names and
 * attendance of another school's children — while both deliveries reported success.
 *
 * Exercised through the REAL processAndDeliver → deliverRegisterFile → messaging
 * facade → Meta sendDocument (so the real fs.createReadStream runs); only the network
 * is faked: the Graph API media upload waits 200 ms (DNS/TLS) before it reads the
 * stream it was given.
 */

// The real Meta driver, chosen explicitly (see tests/whatsapp/send-image-from-url.test.js).
process.env.CHANNEL_DRIVER = 'meta';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createAttendanceDb } = require('./_helpers/attendance-db');

let mockDb;
const mockUpload = jest.fn();

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t) => mockDb.client.from(t) }) }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  uploadBuffer: (...a) => mockUpload(...a),
  isR2Configured: () => true,
  getSignedUrl: jest.fn(),
  downloadFromR2: jest.fn(),
  extractKeyFromUrl: jest.fn(),
}));
jest.mock('../../bot/shared/services/attendance-conversation.service', () => ({
  clearSessionState: jest.fn().mockResolvedValue(true),
}));
// A temp dir of this test's own, so parallel jest workers never see each other's files.
jest.mock('../../bot/shared/utils/constants', () => {
  const real = jest.requireActual('../../bot/shared/utils/constants');
  const os = require('os');
  const p = require('path');
  const f = require('fs');
  return {
    ...real,
    WHATSAPP_TOKEN: 'test-token',
    PHONE_NUMBER_ID: 'test-phone-id',
    TEMP_DIR: f.mkdtempSync(p.join(os.tmpdir(), 'register-race-')),
  };
});
// The multipart body: keep what was appended so the faked upload can read the stream
// the way the real form-data does — when the request body is written, not before.
jest.mock('form-data', () => class RecordingFormData {
  constructor() { this.parts = []; }
  append(name, value, options) { this.parts.push({ name, value, options }); }
  getHeaders() { return { 'content-type': 'multipart/form-data; boundary=x' }; }
});

const axios = require('axios'); // mapped stub — the network boundary
const { logToFile } = require('../../bot/shared/utils/logger');
const { TEMP_DIR } = require('../../bot/shared/utils/constants');
const AttendanceDeliveryService = require('../../bot/shared/services/attendance-delivery.service');

const sha12 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Two teachers at two schools, each with a "Grade 5 A" — so their registers share a file name.
const TEACHERS = {
  t1: { phone: '15550100001', list: { id: 'L1', class_name: 'Grade 5', section: 'A' },
    kids: [['k1', 'Dana Lee'], ['k2', 'Eli Moss']] },
  t2: { phone: '15550100002', list: { id: 'L2', class_name: 'Grade 5', section: 'A' },
    kids: [['m1', 'Noor Vale'], ['m2', 'Omar Pike'], ['m3', 'Pia Quinn']] },
};

function seed() {
  const lists = [];
  const students = [];
  for (const [userId, t] of Object.entries(TEACHERS)) {
    lists.push({ ...t.list, user_id: userId, is_active: true });
    t.kids.forEach(([id, name], i) => students.push({
      id, list_id: t.list.id, roll_number: i + 1, student_name: name, is_active: true,
    }));
  }
  mockDb = createAttendanceDb({ student_lists: lists, students });
}

const markFor = (userId) => {
  const t = TEACHERS[userId];
  return AttendanceDeliveryService.processAndDeliver(userId, t.phone, {
    selectedClass: t.list,
    selectedListId: t.list.id,
    markingMethod: 'tap',
    sessionDate: '2026-09-14',
    records: t.kids.map(([studentId, studentName]) => ({ studentId, studentName, status: 'present' })),
  });
};

/** What each recipient was actually sent: bytes read off the upload stream, joined to `to` by media id. */
let uploads;
let sends;

function fakeGraphApi({ uploadDelayMs = 200, refuseSend = false, beforeRead = null } = {}) {
  uploads = new Map();
  sends = [];
  let n = 0;
  axios.post.mockReset();
  axios.post.mockImplementation(async (url, body) => {
    if (/\/media$/.test(url)) {
      const id = `media-${++n}`;
      await sleep(uploadDelayMs); // connect to graph.facebook.com before the body is streamed
      if (beforeRead) beforeRead();
      const file = body.parts.find((p) => p.name === 'file').value;
      const chunks = [];
      for await (const chunk of file) chunks.push(chunk);
      uploads.set(id, Buffer.concat(chunks));
      return { status: 200, data: { id } };
    }
    if (/\/messages$/.test(url)) {
      if (refuseSend) throw new Error('Request failed with status code 400');
      sends.push({ to: body.to, mediaId: body.document && body.document.id, filename: body.document && body.document.filename });
      return { status: 200, data: { messages: [{ id: `wamid.${sends.length}` }] } };
    }
    return { status: 200, data: {} };
  });
}

/** The buffer generated for each teacher, as archived to R2 (the key carries the user id). */
function generatedFor(userId) {
  const call = mockUpload.mock.calls.find((c) => c[1].startsWith(`attendance/${userId}/`));
  return call && call[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  mockUpload.mockResolvedValue('https://storage.example/register.xlsx');
  fakeGraphApi();
});

afterAll(() => {
  delete process.env.CHANNEL_DRIVER;
  try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('two deliveries with the same file name at the same time', () => {
  it('sends each teacher the register generated for their own class', async () => {
    const [a, b] = await Promise.all([markFor('t1'), markFor('t2')]);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    // Precondition of the race: one name for both files, different contents.
    expect(a.fileName).toBe('Attendance_Grade_5_A_September_2026.xlsx');
    expect(b.fileName).toBe(a.fileName);
    const bufA = generatedFor('t1');
    const bufB = generatedFor('t2');
    expect(Buffer.compare(bufA, bufB)).not.toBe(0);

    expect(sends).toHaveLength(2);
    const received = Object.fromEntries(sends.map((s) => [s.to, uploads.get(s.mediaId)]));
    // The display name the teacher sees is unchanged.
    expect(sends.map((s) => s.filename)).toEqual([a.fileName, a.fileName]);
    expect(sha12(received['15550100001'])).toBe(sha12(bufA));
    expect(sha12(received['15550100002'])).toBe(sha12(bufB));
    expect(received['15550100001'].toString()).toContain('Dana Lee');
    expect(received['15550100002'].toString()).toContain('Noor Vale');
  });

  it('leaves nothing behind in the temp directory', async () => {
    await Promise.all([markFor('t1'), markFor('t2')]);
    expect(fs.readdirSync(TEMP_DIR)).toEqual([]);
  });
});

describe('the delivery log says which bytes went out', () => {
  const line = (msg) => logToFile.mock.calls.find((c) => c[0] === msg);

  it('logs a short sha256 of the generated buffer and of the uploaded file — and no phone number', async () => {
    fakeGraphApi({ uploadDelayMs: 0 });
    const result = await markFor('t1');
    expect(result.success).toBe(true);

    const delivered = line('✅ Register delivered');
    expect(delivered).toBeDefined();
    const expected = sha12(generatedFor('t1'));
    expect(delivered[1]).toMatchObject({ delivered: true, bufferSha256: expected, fileSha256: expected });
    expect(delivered[1].bufferSha256).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(delivered[1])).not.toContain('15550100001');
  });

  it('logs the sha of the bytes the upload actually read, so a file swapped under the driver shows as a mismatch', async () => {
    // Whatever replaces the file between the hand-off and the lazy read is what the
    // teacher receives; the log must say so, not repeat the buffer's sha.
    const swapped = Buffer.from('another register entirely');
    fakeGraphApi({
      uploadDelayMs: 0,
      beforeRead: () => {
        const [dir] = fs.readdirSync(TEMP_DIR);
        const [file] = fs.readdirSync(path.join(TEMP_DIR, dir));
        fs.writeFileSync(path.join(TEMP_DIR, dir, file), swapped);
      },
    });
    const result = await markFor('t1');
    expect(result.success).toBe(true);

    const [received] = [...uploads.values()];
    expect(sha12(received)).toBe(sha12(swapped));
    const delivered = line('✅ Register delivered');
    expect(delivered[1]).toMatchObject({ bufferSha256: sha12(generatedFor('t1')), fileSha256: sha12(swapped) });
  });

  it('says delivered:false — never ✅ — when the channel refuses the document', async () => {
    fakeGraphApi({ uploadDelayMs: 0, refuseSend: true });
    const result = await markFor('t1');
    expect(result.success).toBe(false);
    expect(result.saved).toBe(true);

    expect(line('✅ Register delivered')).toBeUndefined();
    const refused = line('⚠️ Register not delivered');
    expect(refused).toBeDefined();
    expect(refused[1]).toMatchObject({ delivered: false, bufferSha256: sha12(generatedFor('t1')) });
    expect(fs.readdirSync(TEMP_DIR)).toEqual([]);
  });
});
