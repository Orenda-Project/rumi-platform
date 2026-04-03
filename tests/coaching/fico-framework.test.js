/**
 * FICO Framework Module Tests (TDD)
 *
 * Validates bd-595: Create fico-framework.js
 *
 * FICO Unified Observation Tool.
 * 5 Domains, 17 Indicators, Scale 1-4, Max 68 marks.
 * Photo-aware indicators: 3.2 (Routines & Transitions), 4.4 (Use of Materials).
 */

const ficoFramework = require('../../bot/shared/services/coaching/frameworks/fico-framework');

describe('FICO Framework Module (bd-595)', () => {

  // ─── Module interface compliance ──────────────────────────────────

  describe('Module interface', () => {

    test('SCENARIO: Framework module exports all required interface methods', () => {
      expect(ficoFramework.name).toBe('fico');
      expect(ficoFramework.version).toBeDefined();
      expect(ficoFramework.displayName).toBe('FICO Framework');
      expect(typeof ficoFramework.maxMarks).toBe('number');
      expect(typeof ficoFramework.hasDebrief).toBe('boolean');
      expect(typeof ficoFramework.hasLPBonus).toBe('boolean');

      expect(typeof ficoFramework.getSystemPrompt).toBe('function');
      expect(typeof ficoFramework.buildAnalysisPrompt).toBe('function');
      expect(typeof ficoFramework.computeScores).toBe('function');
      expect(typeof ficoFramework.getPerformanceBand).toBe('function');
      expect(typeof ficoFramework.getScoringConstants).toBe('function');
    });

    test('SCENARIO: FICO max marks matches indicator count × scale', () => {
      // Plan header says 17 × 4 = 68, but the detailed FICO table
      // shows 21 indicators (4+5+4+4+4). Using full table: 21 × 4 = 84.
      expect(ficoFramework.maxMarks).toBe(ficoFramework.getScoringConstants().totalIndicators * 4);
    });

    test('SCENARIO: FICO has NO debrief section', () => {
      expect(ficoFramework.hasDebrief).toBe(false);
    });

    test('SCENARIO: FICO has NO LP bonus marks', () => {
      expect(ficoFramework.hasLPBonus).toBe(false);
    });
  });

  // ─── System prompt ────────────────────────────────────────────────

  describe('getSystemPrompt()', () => {

    test('SCENARIO: System prompt contains FICO rubric for all 5 domains', () => {
      const prompt = ficoFramework.getSystemPrompt();

      expect(prompt).toContain('FICO');
      expect(prompt).toContain('LESSON STRUCTURE');
      expect(prompt).toContain('INSTRUCTIONAL QUALITY');
      expect(prompt).toContain('CLASSROOM CLIMATE');
      expect(prompt).toContain('STUDENT ENGAGEMENT');
      expect(prompt).toContain('ASSESSMENT');
    });

    test('SCENARIO: System prompt mentions 1-4 scale', () => {
      const prompt = ficoFramework.getSystemPrompt();
      expect(prompt).toContain('1-4');
    });

    test('SCENARIO: System prompt mentions photo-aware indicators', () => {
      const prompt = ficoFramework.getSystemPrompt();
      expect(prompt).toMatch(/photo|visual/i);
    });

    test('SCENARIO: System prompt is cacheable', () => {
      expect(ficoFramework.getSystemPrompt()).toBe(ficoFramework.getSystemPrompt());
    });
  });

  // ─── Analysis prompt ──────────────────────────────────────────────

  describe('buildAnalysisPrompt()', () => {

    test('SCENARIO: Prompt includes teacher name and context', () => {
      const prompt = ficoFramework.buildAnalysisPrompt(
        'Teacher explained photosynthesis.',
        { grade: '4', subject: 'Science', teacherFirstName: 'Nadia' },
        null
      );

      expect(prompt).toContain('Nadia');
      expect(prompt).toContain('Grade: 4');
    });

    test('SCENARIO: Prompt requests JSON with 5 domains', () => {
      const prompt = ficoFramework.buildAnalysisPrompt(
        'Transcript',
        { teacherFirstName: 'Hassan' },
        null
      );

      expect(prompt).toContain('lesson_structure');
      expect(prompt).toContain('instructional_quality');
      expect(prompt).toContain('classroom_climate');
      expect(prompt).toContain('student_engagement');
      expect(prompt).toContain('assessment_feedback');
    });

    test('SCENARIO: LP fidelity instruction included when LP provided', () => {
      const prompt = ficoFramework.buildAnalysisPrompt(
        'Transcript',
        { teacherFirstName: 'Ayesha' },
        { title: 'Fractions', objectives: ['Learn fractions'] }
      );

      expect(prompt).toContain('Fidelity');
    });
  });

  // ─── Score computation ────────────────────────────────────────────

  describe('computeScores()', () => {

    const mockAnalysis = {
      domains: {
        lesson_structure: {
          indicators: [
            { id: '1.1', name: 'Lesson Goal Clarity', score: 3 },
            { id: '1.2', name: 'Fidelity to LP Steps', score: 2 },
            { id: '1.3', name: 'Materials Use', score: 3 },
            { id: '1.4', name: 'Time Management', score: 3 }
          ]
        },
        instructional_quality: {
          indicators: [
            { id: '2.1', name: 'Explanation & Modeling', score: 3 },
            { id: '2.2', name: 'Questioning Technique', score: 2 },
            { id: '2.3', name: 'Guided Practice', score: 3 },
            { id: '2.4', name: 'Differentiation', score: 2 },
            { id: '2.5', name: 'Monitoring Understanding', score: 3 }
          ]
        },
        classroom_climate: {
          indicators: [
            { id: '3.1', name: 'Behavioral Climate', score: 3 },
            { id: '3.2', name: 'Routines & Transitions', score: 3 },
            { id: '3.3', name: 'Respectful Interactions', score: 4 },
            { id: '3.4', name: 'Safety & Inclusiveness', score: 3 }
          ]
        },
        student_engagement: {
          indicators: [
            { id: '4.1', name: 'Cognitive Engagement', score: 2 },
            { id: '4.2', name: 'Participation', score: 3 },
            { id: '4.3', name: 'Collaboration', score: 2 },
            { id: '4.4', name: 'Use of Materials', score: 3 }
          ]
        },
        assessment_feedback: {
          indicators: [
            // Note: FICO has 4 assessment indicators, not the 2 from plan header
            // The plan table (lines 346-349) shows 5.1, 5.2, 5.3, 5.4
            // but the 17-indicator count implies the full set is used
          ]
        }
      }
    };

    test('SCENARIO: Computes domain scores and overall marks', () => {
      // Only testing with domains that have data
      const partial = {
        domains: {
          lesson_structure: {
            indicators: [
              { id: '1.1', score: 3 },
              { id: '1.2', score: 2 },
              { id: '1.3', score: 3 },
              { id: '1.4', score: 3 }
            ]
          },
          instructional_quality: {
            indicators: [
              { id: '2.1', score: 3 },
              { id: '2.2', score: 2 },
              { id: '2.3', score: 3 },
              { id: '2.4', score: 2 },
              { id: '2.5', score: 3 }
            ]
          }
        }
      };

      const scored = ficoFramework.computeScores(partial);
      expect(scored.scores).toBeDefined();
      // lesson_structure: 3+2+3+3=11, instructional_quality: 3+2+3+2+3=13
      expect(scored.scores.overall_marks).toBe(24);
      expect(scored.scores.overall_max_marks).toBe(84);
    });

    test('SCENARIO: FICO formula is simple sum of indicator scores', () => {
      const simple = {
        domains: {
          lesson_structure: {
            indicators: [
              { id: '1.1', score: 4 },
              { id: '1.2', score: 4 }
            ]
          }
        }
      };

      const scored = ficoFramework.computeScores(simple);
      expect(scored.scores.overall_marks).toBe(8);
    });

    test('SCENARIO: Each domain gets domain_score and domain_max', () => {
      const data = {
        domains: {
          lesson_structure: {
            indicators: [
              { id: '1.1', score: 3 },
              { id: '1.2', score: 2 },
              { id: '1.3', score: 3 },
              { id: '1.4', score: 3 }
            ]
          }
        }
      };

      const scored = ficoFramework.computeScores(data);
      expect(scored.domains.lesson_structure.domain_score).toBe(11);
      expect(scored.domains.lesson_structure.domain_max).toBe(16); // 4 indicators × 4
    });

    test('SCENARIO: Missing domains do not crash', () => {
      const scored = ficoFramework.computeScores({ domains: {} });
      expect(scored.scores.overall_marks).toBe(0);
    });
  });

  // ─── Performance bands ────────────────────────────────────────────

  describe('getPerformanceBand()', () => {

    test('SCENARIO: Low score maps to emerging', () => {
      expect(ficoFramework.getPerformanceBand(25)).toBe('emerging');
    });

    test('SCENARIO: Mid score maps to developing', () => {
      expect(ficoFramework.getPerformanceBand(50)).toBe('developing');
    });

    test('SCENARIO: Good score maps to proficient', () => {
      expect(ficoFramework.getPerformanceBand(70)).toBe('proficient');
    });

    test('SCENARIO: High score maps to excellent', () => {
      expect(ficoFramework.getPerformanceBand(90)).toBe('excellent');
    });
  });

  // ─── Scoring constants ────────────────────────────────────────────

  describe('getScoringConstants()', () => {

    test('SCENARIO: Returns 5 domains', () => {
      const constants = ficoFramework.getScoringConstants();
      expect(Object.keys(constants.domains)).toHaveLength(5);
    });

    test('SCENARIO: Total indicators across all domains is 21', () => {
      // Full FICO table: 4+5+4+4+4 = 21 indicators
      const constants = ficoFramework.getScoringConstants();

      let totalIndicators = 0;
      for (const domain of Object.values(constants.domains)) {
        totalIndicators += domain.indicatorCount;
      }
      expect(totalIndicators).toBe(21);
    });

    test('SCENARIO: Max marks is 84 (21 × 4)', () => {
      expect(ficoFramework.getScoringConstants().maxMarks).toBe(84);
    });

    test('SCENARIO: Scale max is 4', () => {
      expect(ficoFramework.getScoringConstants().scaleMax).toBe(4);
    });
  });
});
