/**
 * Kie.ai prompt builder — page-1/page-2 prompt assembly + the OSS coaching-number
 * sanitization (env-driven, omitted when unset; no PK/TZ phone literals ever).
 */

let Builder;
function load() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  Builder = require('../../bot/shared/services/pic-to-lp/kieai-prompt-builder.service');
}

const base = { grade: 5, subject: 'Math', topic: 'Fractions', ocrText: '' };

const BANNED = ['+255', '677 095', '0329', '5012345', '92 329'];

afterEach(() => {
  delete process.env.COACHING_WHATSAPP_NUMBER;
  jest.resetModules();
});

describe('buildPage1Prompt', () => {
  it("English page 1 contains the topic + 'Big Idea'", () => {
    load();
    const out = Builder.buildPage1Prompt({ ...base, language: 'en' });
    expect(out).toContain('Fractions');
    expect(out).toContain('Big Idea');
  });

  it('Urdu page 1 contains the Nastaliq directive', () => {
    load();
    const out = Builder.buildPage1Prompt({ ...base, language: 'ur' });
    expect(out).toContain('Noto Nastaliq Urdu');
  });

  it('never emits a banned PK/TZ phone literal', () => {
    load();
    const out = Builder.buildPage1Prompt({ ...base, language: 'en' });
    BANNED.forEach((b) => expect(out).not.toContain(b));
  });
});

describe('buildPage2Prompt coaching corner — env-driven contact line', () => {
  it('omits the "WhatsApp Rumi ·" contact line when COACHING_WHATSAPP_NUMBER is unset', () => {
    delete process.env.COACHING_WHATSAPP_NUMBER;
    load();
    const en = Builder.buildPage2Prompt({ ...base, language: 'en' });
    const ur = Builder.buildPage2Prompt({ ...base, language: 'ur' });
    expect(en).toContain('Coaching Corner');           // corner itself kept
    expect(en).not.toContain('WhatsApp Rumi ·');        // contact line omitted
    expect(ur).not.toContain('WhatsApp Rumi ·');
  });

  it('includes the contact line with the configured number when set', () => {
    process.env.COACHING_WHATSAPP_NUMBER = '+1 555 0100';
    load();
    const en = Builder.buildPage2Prompt({ ...base, language: 'en' });
    const ur = Builder.buildPage2Prompt({ ...base, language: 'ur' });
    expect(en).toContain('WhatsApp Rumi · +1 555 0100');
    expect(ur).toContain('WhatsApp Rumi · +1 555 0100');
  });

  it('never emits a banned PK/TZ phone literal (set or unset)', () => {
    process.env.COACHING_WHATSAPP_NUMBER = '+1 555 0100';
    load();
    const out = Builder.buildPage2Prompt({ ...base, language: 'en' });
    BANNED.forEach((b) => expect(out).not.toContain(b));
  });
});

describe('coachingNumberFor', () => {
  it('returns the env value and ignores the region arg', () => {
    process.env.COACHING_WHATSAPP_NUMBER = '+1 555 0100';
    load();
    expect(Builder.coachingNumberFor('PK')).toBe('+1 555 0100');
    expect(Builder.coachingNumberFor('TZ')).toBe('+1 555 0100');
  });

  it("returns '' when unset", () => {
    delete process.env.COACHING_WHATSAPP_NUMBER;
    load();
    expect(Builder.coachingNumberFor('PK')).toBe('');
  });
});
