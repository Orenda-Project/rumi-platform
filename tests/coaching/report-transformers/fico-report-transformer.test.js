/**
 * FICO Report Transformer Tests (TDD)
 *
 * Validates bd-607: Transform FICO analysis into generic reportData shape.
 * 5 domains → 5 goals, indicators → criteria, scale 1-4, no debrief, no LP bonus.
 * Photo-aware indicators (3.2, 4.4) include photo evidence when available.
 */

jest.mock('../../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn(),
}));

const { transformFICOToReportData } = require(
  '../../../bot/shared/services/coaching/report-transformers/fico-report-transformer'
);

// ─── Shared mock data ────────────────────────────────────────────────

const mockSession = {
  id: 'session-uuid-fico',
  user_id: 'user-uuid-fico',
  created_at: '2026-03-04T12:00:00Z',
  lesson_plan_structured: null,
  _isPartialReport: false,
};

const mockFICOAnalysis = {
  domains: {
    lesson_structure: {
      domain_score: 11, domain_max: 16,
      indicators: [
        { id: '1.1', name: 'Lesson Goal Clarity', score: 3, evidence: 'Clear goals stated', timestamp: '0:30' },
        { id: '1.2', name: 'Fidelity to LP Steps', score: 2, evidence: 'Partially followed LP', timestamp: '3:00' },
        { id: '1.3', name: 'Materials Use', score: 3, evidence: 'Used some materials', timestamp: '5:00' },
        { id: '1.4', name: 'Time Management', score: 3, evidence: 'Well-paced', timestamp: '10:00' },
      ],
    },
    instructional_quality: {
      domain_score: 13, domain_max: 20,
      indicators: [
        { id: '2.1', name: 'Explanation & Modeling', score: 3, evidence: 'Clear explanations', timestamp: '2:00' },
        { id: '2.2', name: 'Questioning Technique', score: 2, evidence: 'Basic questions', timestamp: '6:00' },
        { id: '2.3', name: 'Guided Practice', score: 3, evidence: 'Guided well', timestamp: '8:00' },
        { id: '2.4', name: 'Differentiation', score: 2, evidence: 'Some awareness', timestamp: '12:00' },
        { id: '2.5', name: 'Monitoring Understanding', score: 3, evidence: 'Checked on groups', timestamp: '14:00' },
      ],
    },
    classroom_climate: {
      domain_score: 13, domain_max: 16,
      indicators: [
        { id: '3.1', name: 'Behavioral Climate', score: 4, evidence: 'Calm and orderly', timestamp: '0:15' },
        { id: '3.2', name: 'Routines & Transitions', score: 3, evidence: 'Smooth transitions', timestamp: '4:00' },
        { id: '3.3', name: 'Respectful Interactions', score: 3, evidence: 'Warm interactions', timestamp: '7:00' },
        { id: '3.4', name: 'Safety & Inclusiveness', score: 3, evidence: 'All students included', timestamp: '9:00' },
      ],
    },
    student_engagement: {
      domain_score: 10, domain_max: 16,
      indicators: [
        { id: '4.1', name: 'Cognitive Engagement', score: 3, evidence: 'Students thinking', timestamp: '5:00' },
        { id: '4.2', name: 'Participation', score: 3, evidence: 'Most participated', timestamp: '8:00' },
        { id: '4.3', name: 'Collaboration', score: 2, evidence: 'Some group work', timestamp: '11:00' },
        { id: '4.4', name: 'Use of Materials', score: 2, evidence: 'Basic use of materials', timestamp: '13:00' },
      ],
    },
    assessment_feedback: {
      domain_score: 10, domain_max: 16,
      indicators: [
        { id: '5.1', name: 'Formative Checks', score: 3, evidence: 'Regular checks', timestamp: '6:00' },
        { id: '5.2', name: 'Quality of Feedback', score: 2, evidence: 'General feedback', timestamp: '10:00' },
        { id: '5.3', name: 'Accuracy of Marking', score: 3, evidence: 'Mostly accurate', timestamp: '12:00' },
        { id: '5.4', name: 'Responsive Instruction', score: 2, evidence: 'Some adjustments', timestamp: '14:00' },
      ],
    },
  },
  scores: { overall_marks: 57, overall_max_marks: 84, overall_percentage: 67.9 },
  executive_summary: 'Hassan demonstrated developing practices with strong classroom climate.',
  framework: 'fico',
  framework_version: '1.0',
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('FICO Report Transformer (bd-607)', () => {

  test('SCENARIO: Produces 5 goals from 5 FICO domains', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.goals).toHaveLength(5);
  });

  test('SCENARIO: Domain titles use "Domain N:" prefix', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.goals[0].title).toContain('Domain 1');
    expect(reportData.goals[0].title).toContain('Lesson Structure');
    expect(reportData.goals[4].title).toContain('Domain 5');
    expect(reportData.goals[4].title).toContain('Assessment');
  });

  test('SCENARIO: Indicators have max 4 (FICO 1-4 scale)', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    reportData.goals.forEach(goal => {
      goal.criteria.forEach(c => {
        expect(c.max).toBe(4);
      });
    });
  });

  test('SCENARIO: Criteria have name, score, max, evidence, timestamp', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    const c = reportData.goals[0].criteria[0];
    expect(c.name).toBe('Lesson Goal Clarity');
    expect(c.score).toBe(3);
    expect(c.max).toBe(4);
    expect(c.evidence).toBe('Clear goals stated');
    expect(c.timestamp).toBe('0:30');
  });

  test('SCENARIO: maxScore is 84 (21 indicators x 4)', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.maxScore).toBe(84);
  });

  test('SCENARIO: Photo-aware indicator evidence includes photo notes when present', () => {
    const analysisWithPhoto = {
      ...mockFICOAnalysis,
      photo_analysis: 'Classroom well-organized with charts visible on walls',
    };
    const reportData = transformFICOToReportData(mockSession, 'Hassan', analysisWithPhoto);
    // Indicator 3.2 (Routines & Transitions) — photo-aware
    const domain3 = reportData.goals[2];
    const ind32 = domain3.criteria.find(c => c.name === 'Routines & Transitions');
    expect(ind32.evidence).toContain('Photo');
    // Indicator 4.4 (Use of Materials) — photo-aware
    const domain4 = reportData.goals[3];
    const ind44 = domain4.criteria.find(c => c.name === 'Use of Materials');
    expect(ind44.evidence).toContain('Photo');
  });

  test('SCENARIO: Without photo_analysis, no photo note in evidence', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    const domain3 = reportData.goals[2];
    const ind32 = domain3.criteria.find(c => c.name === 'Routines & Transitions');
    expect(ind32.evidence).not.toContain('Photo');
  });

  test('SCENARIO: debriefReflection is null', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.debriefReflection).toBeNull();
  });

  test('SCENARIO: priorFeedback is null', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.priorFeedback).toBeNull();
  });

  test('SCENARIO: frameworkDisplayName is "FICO Framework"', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.frameworkDisplayName).toBe('FICO Framework');
  });

  test('SCENARIO: totalScore matches sum of domain scores', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    const goalSum = reportData.goals.reduce((sum, g) => sum + g.score, 0);
    expect(reportData.totalScore).toBe(goalSum);
    expect(reportData.totalScore).toBe(57); // 11+13+13+10+10
  });

  test('SCENARIO: Missing domains produce empty goals array', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', { scores: {}, domains: {} });
    expect(reportData.goals).toEqual([]);
    expect(reportData.totalScore).toBe(0);
  });

  test('SCENARIO: Correct metadata fields', () => {
    const reportData = transformFICOToReportData(mockSession, 'Hassan', mockFICOAnalysis);
    expect(reportData.teacherName).toBe('Hassan');
    expect(reportData.observerName).toBe('Rumi Digital Coach');
    expect(reportData.feedback).toContain('Hassan demonstrated');
  });
});
