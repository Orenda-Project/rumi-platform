/**
 * upload-digest: the sha of the bytes a driver actually sent from a path.
 *
 * The Meta upload reads its file lazily, so the hash must be taken as the stream is
 * read — not when the wrapper is made — or a file replaced in between would be
 * logged as the bytes that went out.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { digestingStream, noteUploadedBytes, takeUploadedSha256, shortSha256 } = require('../../bot/shared/utils/upload-digest');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-digest-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

describe('digestingStream', () => {
  it('passes the bytes through and records their sha once the stream has been read', async () => {
    const f = path.join(dir, 'a.xlsx');
    const bytes = crypto.randomBytes(200 * 1024); // several chunks
    fs.writeFileSync(f, bytes);
    const out = await readAll(digestingStream(fs.createReadStream(f), f));
    expect(Buffer.compare(out, bytes)).toBe(0);
    expect(takeUploadedSha256(f)).toBe(shortSha256(bytes));
    expect(takeUploadedSha256(f)).toBeNull();
  });

  it('reads nothing until it is read, so a file replaced before the upload reads it is what gets hashed', async () => {
    const f = path.join(dir, 'b.xlsx');
    fs.writeFileSync(f, 'the register handed over');
    const stream = digestingStream(fs.createReadStream(f), f);
    await sleep(20); // the file is opened by now; nothing may have been read yet
    fs.writeFileSync(f, 'a different register');
    expect(String(await readAll(stream))).toBe('a different register');
    expect(takeUploadedSha256(f)).toBe(shortSha256(Buffer.from('a different register')));
  });

  it('passes a read error on', async () => {
    const f = path.join(dir, 'missing.xlsx');
    await expect(readAll(digestingStream(fs.createReadStream(f), f))).rejects.toThrow(/ENOENT/);
    expect(takeUploadedSha256(f)).toBeNull();
  });
});

describe('noteUploadedBytes', () => {
  it('records the sha of a buffer a driver read whole', () => {
    noteUploadedBytes('/x/one.pdf', Buffer.from('one'));
    expect(takeUploadedSha256('/x/one.pdf')).toBe(shortSha256(Buffer.from('one')));
  });

  it('keeps a bounded number of untaken entries', () => {
    for (let i = 0; i < 500; i += 1) noteUploadedBytes(`/x/${i}.pdf`, Buffer.from(String(i)));
    expect(takeUploadedSha256('/x/0.pdf')).toBeNull();
    expect(takeUploadedSha256('/x/499.pdf')).toBe(shortSha256(Buffer.from('499')));
  });
});
