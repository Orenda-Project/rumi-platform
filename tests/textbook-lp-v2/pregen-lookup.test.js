/**
 * Pre-Generated LP Lookup Service tests.
 * Returns the R2 keys only when a matching pre_generated_lps row exists AND
 * its generation_status is 'completed'; otherwise null (never throws).
 */

describe('PreGenLookupService.findPreGenLP', () => {
  let PreGenLookupService;
  let single;

  function mockWith(result) {
    single = jest.fn().mockResolvedValue(result);
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/config/supabase', () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
        }),
      }),
    }));
    PreGenLookupService = require('../../bot/shared/services/pregen-lookup.service');
  }

  beforeEach(() => jest.resetModules());
  afterEach(() => jest.resetModules());

  const input = { chapterNumber: 3, grade: 4, subject: 'maths', curriculum: 'demo_curriculum' };

  it('returns the row when a completed LP exists', async () => {
    mockWith({ data: { pdf_r2_key_en: 'pre_gen/en.pdf', pdf_r2_key_ur: 'pre_gen/ur.pdf', generation_status: 'completed' }, error: null });
    const r = await PreGenLookupService.findPreGenLP(input);
    expect(r).not.toBeNull();
    expect(r.pdf_r2_key_en).toBe('pre_gen/en.pdf');
  });

  it('returns null when the LP is not yet completed', async () => {
    mockWith({ data: { pdf_r2_key_en: 'x', generation_status: 'generating' }, error: null });
    expect(await PreGenLookupService.findPreGenLP(input)).toBeNull();
  });

  it('returns null (not throw) when there is no row / a query error', async () => {
    mockWith({ data: null, error: { message: 'no rows' } });
    expect(await PreGenLookupService.findPreGenLP(input)).toBeNull();
  });
});
