/**
 * ToC Loading Tests (bd-628)
 *
 * Scenarios:
 *   1. loadToc imports JSON and stores chapters in textbook_toc
 */

describe('ToC Loading Service', () => {
  let TocService;

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('../../bot/shared/utils/logger', () => ({
      logToFile: jest.fn()
    }));

    jest.doMock('../../bot/shared/config/supabase', () => ({
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockResolvedValue({ data: [{}], error: null })
      })
    }));

    TocService = require('../../bot/shared/services/toc-loading.service');
  });

  afterEach(() => jest.resetModules());

  it('loads ToC JSON and stores chapters in textbook_toc', async () => {
    const tocData = [
      { chapter: 1, title: 'Whole Numbers', page_start: 1, page_end: 30, days: 5 },
      { chapter: 2, title: 'Factors and Multiples', page_start: 31, page_end: 49, days: 5 },
      { chapter: 3, title: 'Fractions', page_start: 50, page_end: 68, days: 5 }
    ];

    const result = await TocService.loadToc('punjab_snc_2020', 4, 'maths', tocData);

    expect(result.chaptersLoaded).toBe(3);
    expect(result.errors).toHaveLength(0);
  });
});
