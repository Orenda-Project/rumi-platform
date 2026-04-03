/**
 * HOTS Framework PESRP/PECTAA Alignment Tests (TDD)
 *
 * Validates NOTION-327d-a9: Teacher Observation Reports must follow
 * the official HOTS Framework Domains & Indicators from PESRP/PECTAA spec.
 *
 * 5 Areas, 16 Indicators (not 15), Scale 1-3, Max 48 marks (not 45).
 */

const hotsFramework = require('../../bot/shared/services/coaching/frameworks/hots-framework');

describe('HOTS Framework PESRP/PECTAA Alignment (NOTION-327d-a9)', () => {

  // ─── Scenario 1: 16 indicators total ──────────────────────────────

  test('Scenario: HOTS framework defines exactly 16 indicators across 5 areas', () => {
    const constants = hotsFramework.getScoringConstants();
    expect(constants.totalIndicators).toBe(16);

    let totalIndicators = 0;
    for (const areaKey of Object.keys(constants.areas)) {
      totalIndicators += constants.areas[areaKey].indicators.length;
    }
    expect(totalIndicators).toBe(16);
  });

  // ─── Scenario 2: Max marks is 48 ─────────────────────────────────

  test('Scenario: HOTS max marks is 48 (16 indicators × 3 scale)', () => {
    expect(hotsFramework.maxMarks).toBe(48);
    expect(hotsFramework.getScoringConstants().maxMarks).toBe(48);
  });

  // ─── Scenario 3: Assessment & Feedback has 3 indicators ──────────

  test('Scenario: Assessment & Feedback domain has 3 indicators (not 2)', () => {
    const constants = hotsFramework.getScoringConstants();
    const area = constants.areas.assessment_feedback;
    expect(area.indicatorCount).toBe(3);
    expect(area.indicators).toHaveLength(3);
    expect(area.indicators[2].id).toBe(16);
  });

  // ─── Scenario 4: Indicator names match PESRP/PECTAA spec ────────

  test('Scenario: Indicator 1 name matches PESRP/PECTAA spec', () => {
    const constants = hotsFramework.getScoringConstants();
    const indicator1 = constants.areas.classroom_environment.indicators[0];
    expect(indicator1.name).toBe('The classroom fosters open discussions and critical thinking');
  });

  test('Scenario: All 16 indicator names match PESRP/PECTAA spec', () => {
    const constants = hotsFramework.getScoringConstants();
    const expectedNames = [
      'The classroom fosters open discussions and critical thinking',
      'Resources and space are organized to support collaboration and problem-solving',
      'Students are actively encouraged to participate in complex tasks with clear expectations',
      'Lesson objectives explicitly link to critical thinking, problem-solving, or creative skills',
      'Lesson plans include strategies for promoting analysis, evaluation, and synthesis',
      'The lesson integrates interdisciplinary or real-world applications',
      'The teacher poses open-ended and thought-provoking questions',
      'Instruction actively involves students in analyzing, interpreting, and critiquing content',
      'The teacher demonstrates problem-solving and creativity in real-time scenarios',
      'Scaffolding is used effectively to help students explore complex ideas',
      'Students collaborate on tasks requiring synthesis, evaluation, or innovative problem-solving',
      'The teacher encourages students to explore multiple perspectives or create novel solutions',
      'Students actively engage in discussions and debates on complex topics',
      'Students engage in self-assessment or peer-assessment to evaluate reasoning and solutions',
      'The teacher provides feedback that guides students in refining reasoning or solutions',
      'Assessment tasks require students to analyse, evaluate, or create based on the lesson content',
    ];

    const allIndicators = [];
    for (const areaKey of Object.keys(constants.areas)) {
      allIndicators.push(...constants.areas[areaKey].indicators);
    }
    expect(allIndicators).toHaveLength(16);
    allIndicators.forEach((ind, i) => {
      expect(ind.name).toBe(expectedNames[i]);
    });
  });

  // ─── Scenario 5: System prompt includes all 16 indicators ───────

  test('Scenario: System prompt contains all 16 indicator descriptions', () => {
    const prompt = hotsFramework.getSystemPrompt();
    expect(prompt).toContain('The classroom fosters open discussions and critical thinking');
    expect(prompt).toContain('Assessment tasks require students to analyse, evaluate, or create');
    // 16 indicator headers + 1 reference in SCORING RULES = 17 total (1-3) occurrences
    expect((prompt.match(/\*\* \(1-3\)/g) || []).length).toBe(16);
  });

  // ─── Scenario 6: System prompt includes concrete examples ───────

  test('Scenario: System prompt includes rubric examples at each level', () => {
    const prompt = hotsFramework.getSystemPrompt();
    expect(prompt).toContain('Example:');
    expect(prompt).toContain('Students answer only factual questions without follow-up');
    expect(prompt).toContain('Students discuss multiple solutions to a problem collaboratively');
  });

  // ─── Scenario 7: Analysis prompt requests 16 indicators ─────────

  test('Scenario: buildAnalysisPrompt requests 16 indicators in JSON template', () => {
    const prompt = hotsFramework.buildAnalysisPrompt('Transcript', { teacherFirstName: 'Ayesha' }, null);
    expect(prompt).toContain('Score all 16 HOTS indicators');
    expect(prompt).toContain('"id": 16');
    expect(prompt).toContain('"area_max": 9'); // Assessment & Feedback area_max should be 9 (3×3)
  });

  // ─── Scenario 8: computeScores handles 16 indicators ────────────

  test('Scenario: computeScores computes correct total for 16 indicators', () => {
    const analysis = {
      areas: {
        classroom_environment: { indicators: [{ score: 2 }, { score: 3 }, { score: 2 }] },
        lesson_planning: { indicators: [{ score: 2 }, { score: 2 }, { score: 3 }] },
        instructional_strategies: { indicators: [{ score: 3 }, { score: 2 }, { score: 2 }, { score: 3 }] },
        student_engagement: { indicators: [{ score: 2 }, { score: 3 }, { score: 2 }] },
        assessment_feedback: { indicators: [{ score: 3 }, { score: 2 }, { score: 2 }] }
      }
    };
    const result = hotsFramework.computeScores(analysis);
    expect(result.scores.overall_marks).toBe(38);
    expect(result.scores.overall_max_marks).toBe(48);
    expect(result.scores.overall_percentage).toBe(79.2);
  });

  // ─── Scenario 9: Report transformer uses MAX_MARKS=48 ──────────

  test('Scenario: HOTS report transformer uses 48 as max marks', () => {
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const { transformHOTSToReportData } = require(
      '../../bot/shared/services/coaching/report-transformers/hots-report-transformer'
    );
    const session = { created_at: '2026-03-19T10:00:00Z' };
    const analysis = {
      areas: {
        classroom_environment: { area_score: 7, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'ev' }, { name: 'T2', score: 3, evidence: 'ev' }, { name: 'T3', score: 2, evidence: 'ev' }] },
        lesson_planning: { area_score: 6, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        instructional_strategies: { area_score: 8, area_max: 12, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        student_engagement: { area_score: 6, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        assessment_feedback: { area_score: 7, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 3, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] }
      },
      executive_summary: 'Summary'
    };
    const result = transformHOTSToReportData(session, 'Ayesha Khan', analysis);
    expect(result.maxScore).toBe(48);
  });

  // ─── Scenario 10: Legacy 15-indicator analysis still renders ────

  test('Scenario: Legacy 15-indicator analysis renders without crashing', () => {
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const { transformHOTSToReportData } = require(
      '../../bot/shared/services/coaching/report-transformers/hots-report-transformer'
    );
    const session = { created_at: '2026-03-10T10:00:00Z' };
    const analysis = {
      areas: {
        classroom_environment: { area_score: 6, area_max: 9, indicators: [{ name: 'Old Name', score: 2, evidence: 'ev' }, { name: 'Old', score: 2, evidence: 'ev' }, { name: 'Old', score: 2, evidence: 'ev' }] },
        lesson_planning: { area_score: 5, area_max: 9, indicators: [{ name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 1, evidence: 'e' }] },
        instructional_strategies: { area_score: 7, area_max: 12, indicators: [{ name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 1, evidence: 'e' }] },
        student_engagement: { area_score: 5, area_max: 9, indicators: [{ name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 1, evidence: 'e' }] },
        assessment_feedback: { area_score: 4, area_max: 6, indicators: [{ name: 'Old', score: 2, evidence: 'e' }, { name: 'Old', score: 2, evidence: 'e' }] }
      },
      executive_summary: 'Legacy summary'
    };
    const result = transformHOTSToReportData(session, 'Farah Ahmed', analysis);
    expect(result.goals).toHaveLength(5);
    expect(result.goals[4].criteria).toHaveLength(2); // Old analysis only had 2 indicators
  });

  // ─── Scenario 11: Performance band shift ────────────────────────

  test('Scenario: Score of 36 drops from excellent (36/45=80%) to proficient (36/48=75%)', () => {
    const pct = parseFloat(((36 / 48) * 100).toFixed(1));
    expect(pct).toBe(75);
    expect(hotsFramework.getPerformanceBand(pct)).toBe('proficient');
  });

  // ─── Scenario 12: Assessment & Feedback renders 3 criteria ──────

  test('Scenario: Assessment & Feedback area renders 3 criteria in report data', () => {
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const { transformHOTSToReportData } = require(
      '../../bot/shared/services/coaching/report-transformers/hots-report-transformer'
    );
    const session = { created_at: '2026-03-19T10:00:00Z' };
    const analysis = {
      areas: {
        classroom_environment: { area_score: 6, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        lesson_planning: { area_score: 6, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        instructional_strategies: { area_score: 8, area_max: 12, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        student_engagement: { area_score: 6, area_max: 9, indicators: [{ name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }, { name: 'T', score: 2, evidence: 'e' }] },
        assessment_feedback: { area_score: 7, area_max: 9, indicators: [
          { name: 'Students engage in self-assessment...', score: 2, evidence: 'e' },
          { name: 'The teacher provides feedback...', score: 3, evidence: 'e' },
          { name: 'Assessment tasks require...', score: 2, evidence: 'e' }
        ] }
      },
      executive_summary: 'Summary'
    };
    const result = transformHOTSToReportData(session, 'Nadia Khan', analysis);
    const assessmentGoal = result.goals.find(g => g.title.includes('Assessment'));
    expect(assessmentGoal.criteria).toHaveLength(3);
  });

  // ─── Scenario 13: Long indicator names fit PDF box ──────────────

  test('Scenario: Longest indicator name is under 100 chars for PDF rendering', () => {
    const constants = hotsFramework.getScoringConstants();
    for (const areaKey of Object.keys(constants.areas)) {
      for (const ind of constants.areas[areaKey].indicators) {
        expect(ind.name.length).toBeLessThan(100);
      }
    }
  });
});
