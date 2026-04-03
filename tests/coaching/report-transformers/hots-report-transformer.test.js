/**
 * HOTS Report Transformer Tests (TDD)
 *
 * Validates bd-605: Transform HOTS analysis into generic reportData shape.
 * 5 areas → 5 goals, indicators → criteria, scale 1-3, no debrief, no LP bonus.
 */

jest.mock('../../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn(),
}));

const { transformHOTSToReportData } = require(
  '../../../bot/shared/services/coaching/report-transformers/hots-report-transformer'
);

// ─── Shared mock data ────────────────────────────────────────────────

const mockSession = {
  id: 'session-uuid-hots',
  user_id: 'user-uuid-hots',
  created_at: '2026-03-04T10:00:00Z',
  lesson_plan_structured: null,
  _isPartialReport: false,
};

const mockHOTSAnalysis = {
  areas: {
    classroom_environment: {
      area_score: 7, area_max: 9,
      indicators: [
        { id: 1, name: 'Positive Learning Environment', score: 2, evidence: 'Teacher was respectful', timestamp: '1:00' },
        { id: 2, name: 'Organized Classroom Setup', score: 2, evidence: 'Clean and organized', timestamp: '0:30' },
        { id: 3, name: 'High Expectations for All', score: 3, evidence: 'Pushed all students', timestamp: '2:00' },
      ],
    },
    lesson_planning: {
      area_score: 6, area_max: 9,
      indicators: [
        { id: 4, name: 'Clear HOTS-Aligned Objectives', score: 2, evidence: 'Objectives written', timestamp: '0:15' },
        { id: 5, name: 'Structured Lesson Flow', score: 3, evidence: 'Good flow', timestamp: '3:00' },
        { id: 6, name: 'Use of Relevant Resources', score: 1, evidence: 'Limited resources', timestamp: '5:00' },
      ],
    },
    instructional_strategies: {
      area_score: 7, area_max: 12,
      indicators: [
        { id: 7, name: 'Open-ended Questioning', score: 2, evidence: 'Some open questions', timestamp: '6:00' },
        { id: 8, name: 'Scaffolding', score: 2, evidence: 'Scaffolded concepts', timestamp: '8:00' },
        { id: 9, name: 'Peer Discussion', score: 1, evidence: 'Minimal peer work', timestamp: '10:00' },
        { id: 10, name: 'Modeling Reasoning', score: 2, evidence: 'Modeled once', timestamp: '12:00' },
      ],
    },
    student_engagement: {
      area_score: 4, area_max: 9,
      indicators: [
        { id: 11, name: 'Active Participation', score: 2, evidence: 'Most participated', timestamp: '7:00' },
        { id: 12, name: 'Student-Led Inquiry', score: 1, evidence: 'Teacher-directed', timestamp: '9:00' },
        { id: 13, name: 'Differentiated Engagement', score: 1, evidence: 'No differentiation', timestamp: '11:00' },
      ],
    },
    assessment_feedback: {
      area_score: 4, area_max: 6,
      indicators: [
        { id: 14, name: 'Formative Assessment', score: 2, evidence: 'Oral checks', timestamp: '13:00' },
        { id: 15, name: 'Constructive Feedback', score: 2, evidence: 'Gave feedback', timestamp: '14:00' },
      ],
    },
  },
  scores: { overall_marks: 28, overall_max_marks: 45, overall_percentage: 62.2 },
  executive_summary: 'Zara showed developing HOTS practices with strong classroom environment.',
  framework: 'hots',
  framework_version: '1.0',
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('HOTS Report Transformer (bd-605)', () => {

  test('SCENARIO: Produces 5 goals from 5 HOTS areas', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.goals).toHaveLength(5);
  });

  test('SCENARIO: Goal titles use "Area N:" prefix', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.goals[0].title).toContain('Area 1');
    expect(reportData.goals[0].title).toContain('Classroom Environment');
    expect(reportData.goals[4].title).toContain('Area 5');
    expect(reportData.goals[4].title).toContain('Assessment');
  });

  test('SCENARIO: Indicators become criteria with score (1-3) and max 3', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    const criteria = reportData.goals[0].criteria;
    expect(criteria).toHaveLength(3);
    criteria.forEach(c => {
      expect(c.max).toBe(3);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(3);
    });
  });

  test('SCENARIO: Criteria have name, score, max, evidence, timestamp', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    const c = reportData.goals[0].criteria[0];
    expect(c.name).toBe('Positive Learning Environment');
    expect(c.score).toBe(2);
    expect(c.max).toBe(3);
    expect(c.evidence).toBe('Teacher was respectful');
    expect(c.timestamp).toBe('1:00');
  });

  test('SCENARIO: maxScore is 48 (HOTS max)', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.maxScore).toBe(48);
  });

  test('SCENARIO: debriefReflection is null (HOTS has no debrief)', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.debriefReflection).toBeNull();
  });

  test('SCENARIO: priorFeedback is null (HOTS has no prior feedback section)', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.priorFeedback).toBeNull();
  });

  test('SCENARIO: frameworkDisplayName is "HOTS Framework"', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.frameworkDisplayName).toBe('HOTS Framework');
  });

  test('SCENARIO: totalScore matches sum of area scores', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    const goalSum = reportData.goals.reduce((sum, g) => sum + g.score, 0);
    expect(reportData.totalScore).toBe(goalSum);
    expect(reportData.totalScore).toBe(28); // 7+6+7+4+4
  });

  test('SCENARIO: Missing areas produce empty goals array', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', { scores: {}, areas: {} });
    expect(reportData.goals).toEqual([]);
    expect(reportData.totalScore).toBe(0);
  });

  test('SCENARIO: Fidelity section included when present', () => {
    const analysisWithFidelity = {
      ...mockHOTSAnalysis,
      fidelity_analysis: {
        score: 80, max_score: 100,
        overall_commentary: 'Good LP adherence',
        evidence: ['Followed plan'], strengths: ['Pacing'], gaps: [],
      },
    };
    const sessionWithLP = { ...mockSession, lesson_plan_structured: { topic: 'Fractions' } };
    const reportData = transformHOTSToReportData(sessionWithLP, 'Zara', analysisWithFidelity);
    expect(reportData.fidelitySection).not.toBeNull();
    expect(reportData.fidelitySection.score).toBe(80);
  });

  test('SCENARIO: Correct metadata fields', () => {
    const reportData = transformHOTSToReportData(mockSession, 'Zara', mockHOTSAnalysis);
    expect(reportData.teacherName).toBe('Zara');
    expect(reportData.observerName).toBe('Rumi Digital Coach');
    expect(reportData.observationDate).toBeDefined();
    expect(reportData.feedback).toContain('Zara showed');
  });
});
