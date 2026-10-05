/**
 * privateTempPath: a file path inside a directory no other call shares.
 *
 * The file name is a display name (a register's, a report's), sometimes built from
 * what a user typed. Whatever it is, the path must name a FILE inside the private
 * directory: a name that resolves to the directory itself ('', '.') or above it
 * ('..', 'a/..') made the write fail with EISDIR — or point at the base directory.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { privateTempPath, removePrivateTemp } = require('../../bot/shared/utils/private-temp');

let base;
beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'private-temp-')); });
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('privateTempPath', () => {
  it('keeps the display name, in a directory of its own per call', () => {
    const a = privateTempPath(base, 'Attendance_Grade_5_A.xlsx', 'reg-');
    const b = privateTempPath(base, 'Attendance_Grade_5_A.xlsx', 'reg-');
    expect(a.dir).not.toBe(b.dir);
    expect(path.dirname(a.dir)).toBe(base);
    expect(path.basename(a.dir)).toMatch(/^reg-/);
    expect(a.filePath).toBe(path.join(a.dir, 'Attendance_Grade_5_A.xlsx'));
  });

  it('keeps a traversing name inside the directory', () => {
    const t = privateTempPath(base, '../../etc/passwd');
    expect(t.filePath).toBe(path.join(t.dir, 'passwd'));
  });

  it.each(['', '.', '..', 'a/..', null, undefined])('falls back to "file" for %p, and the write lands inside', (name) => {
    const t = privateTempPath(base, name);
    expect(t.filePath).toBe(path.join(t.dir, 'file'));
    fs.writeFileSync(t.filePath, 'bytes');
    expect(fs.readdirSync(t.dir)).toEqual(['file']);
  });

  it('creates the base directory when it is missing', () => {
    const nested = path.join(base, 'not', 'yet');
    const t = privateTempPath(nested, 'x.pdf');
    expect(fs.existsSync(t.dir)).toBe(true);
  });
});

describe('removePrivateTemp', () => {
  it('removes the directory and what is in it, and never throws', () => {
    const t = privateTempPath(base, 'x.pdf');
    fs.writeFileSync(t.filePath, 'bytes');
    removePrivateTemp(t);
    expect(fs.existsSync(t.dir)).toBe(false);
    expect(() => removePrivateTemp(t)).not.toThrow();
    expect(() => removePrivateTemp(null)).not.toThrow();
  });
});
