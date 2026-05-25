/**
 * Topic Matching Service Tests (bd-632)
 *
 * Scenarios:
 *   1. "fractions" → matches Unit 3 (exact keyword)
 *   2. "like fractions" → matches Unit 3 (keyword containment)
 *   3. "kasoor" (Urdu) → matches Unit 3 (Urdu keyword in topic_keywords)
 *   4. "geometry" → matches Unit 7, NOT Unit 3
 *   5. "xyz nonsense" → returns null (no match)
 */

describe('TopicMatchingService', () => {
  let TopicMatchingService;
  let mockSupabase;

  const mockTocData = [
    {
      chapter_number: 1, chapter_title: 'Whole Numbers',
      topic_keywords: ['whole numbers', 'place value', 'addition', 'subtraction'],
      page_start: 1, page_end: 30
    },
    {
      chapter_number: 3, chapter_title: 'Fractions',
      topic_keywords: ['fractions', 'like fractions', 'unlike fractions', 'equivalent fractions', 'kasoor', 'کسر'],
      page_start: 50, page_end: 68
    },
    {
      chapter_number: 7, chapter_title: 'Geometry',
      topic_keywords: ['geometry', 'shapes', 'angles', 'triangle', 'rectangle'],
      page_start: 120, page_end: 145
    }
  ];

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('../../bot/shared/utils/logger', () => ({
      logToFile: jest.fn()
    }));

    // Mock supabase to return chapters based on keyword match
    mockSupabase = {
      from: jest.fn().mockImplementation((table) => {
        if (table === 'textbook_toc') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                contains: jest.fn().mockImplementation((col, keywords) => {
                  const keyword = keywords[0];
                  const match = mockTocData.find(c =>
                    c.topic_keywords.some(k => k === keyword || k.includes(keyword))
                  );
                  return {
                    limit: jest.fn().mockResolvedValue({
                      data: match ? [match] : [],
                      error: null
                    })
                  };
                })
              })
            })
          };
        }
        if (table === 'pre_generated_lps') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                      data: { pdf_r2_key_en: 'pre_gen_lps/test.pdf', pdf_r2_key_ur: 'pre_gen_lps/test_ur.pdf' },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
      })
    };
    jest.doMock('../../bot/shared/config/supabase', () => mockSupabase);

    TopicMatchingService = require('../../bot/shared/services/topic-matching.service');
  });

  afterEach(() => jest.resetModules());

  // --- Scenario 1: exact keyword match ---
  it('"fractions" matches Unit 3', async () => {
    const result = await TopicMatchingService.findChapterByTopic({
      topic: 'fractions',
      grade: 4,
      subject: 'maths',
      curriculum: 'punjab_snc_2020'
    });

    expect(result).not.toBeNull();
    expect(result.chapter_title).toBe('Fractions');
    expect(result.chapter_number).toBe(3);
  });

  // --- Scenario 2: keyword containment ---
  it('"like fractions" matches Unit 3', async () => {
    const result = await TopicMatchingService.findChapterByTopic({
      topic: 'like fractions',
      grade: 4,
      subject: 'maths',
      curriculum: 'punjab_snc_2020'
    });

    expect(result).not.toBeNull();
    expect(result.chapter_number).toBe(3);
  });

  // --- Scenario 3: Urdu keyword ---
  it('"kasoor" (Urdu) matches Unit 3', async () => {
    const result = await TopicMatchingService.findChapterByTopic({
      topic: 'kasoor',
      grade: 4,
      subject: 'maths',
      curriculum: 'punjab_snc_2020'
    });

    expect(result).not.toBeNull();
    expect(result.chapter_number).toBe(3);
  });

  // --- Scenario 4: different chapter ---
  it('"geometry" matches Unit 7, not Unit 3', async () => {
    const result = await TopicMatchingService.findChapterByTopic({
      topic: 'geometry',
      grade: 4,
      subject: 'maths',
      curriculum: 'punjab_snc_2020'
    });

    expect(result).not.toBeNull();
    expect(result.chapter_number).toBe(7);
    expect(result.chapter_title).toBe('Geometry');
  });

  // --- Scenario 5: no match ---
  it('"xyz nonsense" returns null', async () => {
    const result = await TopicMatchingService.findChapterByTopic({
      topic: 'xyz nonsense',
      grade: 4,
      subject: 'maths',
      curriculum: 'punjab_snc_2020'
    });

    expect(result).toBeNull();
  });
});
