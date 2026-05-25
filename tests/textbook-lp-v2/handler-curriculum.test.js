/**
 * Curriculum LP handler — serves a pre-generated LP PDF when topic→chapter→
 * pre_generated_lps resolves, else returns page_prompt (caller falls through
 * to Gamma). Guards: never throws; sends a file PATH not a Buffer (bd-1349).
 */

let sendDocument, downloadFromR2, findChapterByTopic, findPreGenLP;

function load() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/topic-matching.service', () => ({ findChapterByTopic }));
  jest.doMock('../../bot/shared/services/pregen-lookup.service', () => ({ findPreGenLP }));
  jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2 }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({ sendDocument }));
  return require('../../bot/shared/handlers/lesson-plan-v2.handler');
}

const base = { userId: '15551230000', topic: 'fractions', grade: 4, subject: 'maths', curriculum: 'demo_curriculum', language: 'en' };

beforeEach(() => {
  sendDocument = jest.fn().mockResolvedValue({});
  downloadFromR2 = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
  findChapterByTopic = jest.fn().mockResolvedValue({ chapter_number: 3, chapter_title: 'Fractions' });
  findPreGenLP = jest.fn().mockResolvedValue({ pdf_r2_key_en: 'pre_gen/en.pdf', pdf_r2_key_ur: 'pre_gen/ur.pdf' });
});
afterEach(() => jest.resetModules());

describe('handleCurriculumLessonPlan', () => {
  it('returns page_prompt when no topic or no curriculum', async () => {
    const h = load();
    expect((await h({ ...base, topic: '' })).source).toBe('page_prompt');
    expect((await h({ ...base, curriculum: '' })).source).toBe('page_prompt');
  });

  it('returns page_prompt when no chapter matches', async () => {
    findChapterByTopic = jest.fn().mockResolvedValue(null);
    const h = load();
    expect((await h(base)).source).toBe('page_prompt');
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it('returns page_prompt when no pre-generated LP exists for the language', async () => {
    findPreGenLP = jest.fn().mockResolvedValue(null);
    const h = load();
    expect((await h(base)).source).toBe('page_prompt');
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it('serves the pre-generated LP and sends a file PATH (not a Buffer)', async () => {
    const h = load();
    const r = await h(base);
    expect(r.source).toBe('pre_generated');
    expect(downloadFromR2).toHaveBeenCalledWith('pre_gen/en.pdf');
    expect(sendDocument).toHaveBeenCalledTimes(1);
    const [, filePath, filename] = sendDocument.mock.calls[0];
    expect(typeof filePath).toBe('string');
    expect(Buffer.isBuffer(filePath)).toBe(false);
    expect(filePath).toMatch(/\.pdf$/);
    expect(filename).toMatch(/Fractions/);
  });

  it('picks the Urdu PDF when language is ur', async () => {
    const h = load();
    await h({ ...base, language: 'ur' });
    expect(downloadFromR2).toHaveBeenCalledWith('pre_gen/ur.pdf');
  });

  it('falls through to page_prompt (never throws) when R2 download fails', async () => {
    downloadFromR2 = jest.fn().mockRejectedValue(new Error('R2 down'));
    const h = load();
    const r = await h(base);
    expect(r.source).toBe('page_prompt');
  });
});
