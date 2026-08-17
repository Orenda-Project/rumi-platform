/**
 * reading-assessment-endpoint.js — extracted from flow-response.handler.js's
 * former inline levelMapping/wordCountMap object literals (see that file's
 * git history), plus a genuine {init, exchange} contract for Discord's
 * modal-workaround renderer. The source Meta Flow
 * (docs/flows/reading-assessment-flow-v2.json) is purely NAVIGATE-style —
 * exchange() here does NOT create the assessment record or generate a
 * passage; that stays flow-response.handler.js's job (see this endpoint's
 * own header comment).
 */

const {
  handleReadingAssessmentInit,
  handleReadingAssessmentDataExchange,
  mapLevelToPassage,
  wordCountFor,
} = require('../../bot/shared/routes/reading-assessment-endpoint');

describe('mapLevelToPassage', () => {
  it('auto mode always starts at story level (4), regardless of levelIndex', () => {
    expect(mapLevelToPassage('0', true)).toEqual({ passageType: 'story', gradeNumeric: 4 });
    expect(mapLevelToPassage('3', true)).toEqual({ passageType: 'story', gradeNumeric: 4 });
    expect(mapLevelToPassage(undefined, true)).toEqual({ passageType: 'story', gradeNumeric: 4 });
  });

  it('manual mode maps each level index to its passage type — matching the original inline levelMapping exactly', () => {
    expect(mapLevelToPassage('0', false)).toEqual({ passageType: 'letters', gradeNumeric: 0 });
    expect(mapLevelToPassage('1', false)).toEqual({ passageType: 'words', gradeNumeric: 1 });
    expect(mapLevelToPassage('2', false)).toEqual({ passageType: 'sentences', gradeNumeric: 2 });
    expect(mapLevelToPassage('3', false)).toEqual({ passageType: 'paragraph', gradeNumeric: 3 });
  });

  it('accepts a numeric levelIndex, not just a string (parsed off "2_Sentences_..." elsewhere)', () => {
    expect(mapLevelToPassage(2, false)).toEqual({ passageType: 'sentences', gradeNumeric: 2 });
  });

  it('falls back to paragraph/grade 2 for an unrecognized manual-mode level index — matching the original fallback', () => {
    expect(mapLevelToPassage('99', false)).toEqual({ passageType: 'paragraph', gradeNumeric: 2 });
    expect(mapLevelToPassage('', false)).toEqual({ passageType: 'paragraph', gradeNumeric: 2 });
  });
});

describe('wordCountFor', () => {
  it('maps each passage type to its word count — matching the original inline wordCountMap exactly', () => {
    expect(wordCountFor('letters')).toBe(14);
    expect(wordCountFor('words')).toBe(14);
    expect(wordCountFor('sentences')).toBe(40);
    expect(wordCountFor('paragraph')).toBe(60);
    expect(wordCountFor('story')).toBe(100);
  });

  it('falls back to 50 for an unrecognized passage type', () => {
    expect(wordCountFor('unknown')).toBe(50);
  });
});

describe('handleReadingAssessmentInit', () => {
  it('returns the BASIC_INFO screen with language and assessment-mode options', async () => {
    const response = await handleReadingAssessmentInit();
    expect(response.screen).toBe('BASIC_INFO');
    expect(response.data.languages).toEqual([
      { id: '0_English', title: 'English' },
      { id: '1_Urdu', title: 'Urdu / اردو' },
    ]);
    expect(response.data.assessment_modes).toHaveLength(2);
  });
});

describe('handleReadingAssessmentDataExchange', () => {
  it('BASIC_INFO -> OPTIONS for manual mode, carrying the level/scope option lists', async () => {
    const response = await handleReadingAssessmentDataExchange('u1', 'BASIC_INFO', {
      student_full_name: 'Zara Abdul', assessment_mode: '1_Manual',
    });
    expect(response.screen).toBe('OPTIONS');
    expect(response.data.levels).toHaveLength(4);
    expect(response.data.scopes).toHaveLength(2);
    expect(response.data.student_full_name).toBe('Zara Abdul');
  });

  it('BASIC_INFO -> SUCCESS directly for auto mode — OPTIONS has nothing left to ask', async () => {
    const response = await handleReadingAssessmentDataExchange('u1', 'BASIC_INFO', {
      student_full_name: 'Zara Abdul', assessment_mode: '0_Auto',
    });
    expect(response.screen).toBe('SUCCESS');
  });

  it('BASIC_INFO rejects a missing student name', async () => {
    const response = await handleReadingAssessmentDataExchange('u1', 'BASIC_INFO', { assessment_mode: '0_Auto' });
    expect(response.data.error.message).toMatch(/name is required/i);
  });

  it('OPTIONS -> SUCCESS, carrying the submitted level/scope through', async () => {
    const response = await handleReadingAssessmentDataExchange('u1', 'OPTIONS', {
      student_full_name: 'Zara Abdul', select_the_reading_level: '2_Sentences_(Grade_1-2)',
    });
    expect(response.screen).toBe('SUCCESS');
    expect(response.data.select_the_reading_level).toBe('2_Sentences_(Grade_1-2)');
  });

  it('returns an error for an unknown screen', async () => {
    const response = await handleReadingAssessmentDataExchange('u1', 'NOT_A_SCREEN', {});
    expect(response.data.error.message).toMatch(/unknown screen/i);
  });
});
