/**
 * ContentService.downloadPDF writes inside the directory it is given.
 *
 * Callers pass a private temp directory and a display name built from what a
 * teacher typed (a topic, a grade). A name carrying '/' or '..' used to be joined
 * as is: it wrote outside the private directory, or failed with ENOENT.
 * Only the network (axios) is faked.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const axios = require('axios'); // mapped stub — the network boundary
const ContentService = require('../../bot/shared/services/content.service');

let root;
let dir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-pdf-'));
  dir = fs.mkdtempSync(path.join(root, 'private-'));
  axios.get.mockReset();
  axios.get.mockResolvedValue({ status: 200, data: Buffer.from('%PDF-1.4 plan') });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('ContentService.downloadPDF', () => {
  it('writes the PDF under its name in the given directory', async () => {
    const p = await ContentService.downloadPDF('https://cdn.example/plan.pdf', 'lesson_plan_Plants.pdf', dir);
    expect(p).toBe(path.join(dir, 'lesson_plan_Plants.pdf'));
    expect(fs.readFileSync(p, 'utf-8')).toBe('%PDF-1.4 plan');
  });

  it('keeps a name with ../ inside the directory', async () => {
    const p = await ContentService.downloadPDF('https://cdn.example/plan.pdf', '../escaped.pdf', dir);
    expect(p).toBe(path.join(dir, 'escaped.pdf'));
    expect(fs.readdirSync(root).sort()).toEqual([path.basename(dir)]);
  });

  it('keeps a name with a / inside the directory, rather than failing on a missing sub-directory', async () => {
    const p = await ContentService.downloadPDF('https://cdn.example/plan.pdf', 'Grade5/6_Plants.pdf', dir);
    expect(path.dirname(p)).toBe(dir);
    expect(fs.existsSync(p)).toBe(true);
  });
});
