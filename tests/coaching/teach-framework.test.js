/**
 * Teach Framework Module Tests (TDD)
 *
 * Validates bd-594: Create teach-framework.js
 *
 * World Bank Teach observation tool.
 * 3 Areas, 9 Elements, 28 Behaviors + Time on Task.
 * Element scoring: holistic 1-5. Max 50 (9 elements + 1 time_on_task × 5).
 */

const teachFramework = require('../../bot/shared/services/coaching/frameworks/teach-framework');

describe('Teach Framework Module (bd-594)', () => {

  // ─── Module interface compliance ──────────────────────────────────

  describe('Module interface', () => {

    test('SCENARIO: Framework module exports all required interface methods', () => {
      expect(teachFramework.name).toBe('teach');
      expect(teachFramework.version).toBeDefined();
      expect(teachFramework.displayName).toBe('Teach Framework');
      expect(typeof teachFramework.maxMarks).toBe('number');
      expect(typeof teachFramework.hasDebrief).toBe('boolean');
      expect(typeof teachFramework.hasLPBonus).toBe('boolean');

      expect(typeof teachFramework.getSystemPrompt).toBe('function');
      expect(typeof teachFramework.buildAnalysisPrompt).toBe('function');
      expect(typeof teachFramework.computeScores).toBe('function');
      expect(typeof teachFramework.getPerformanceBand).toBe('function');
      expect(typeof teachFramework.getScoringConstants).toBe('function');
    });

    test('SCENARIO: Teach max marks is 50 (9 elements + time_on_task × 5)', () => {
      expect(teachFramework.maxMarks).toBe(50);
    });

    test('SCENARIO: Teach has NO debrief section', () => {
      expect(teachFramework.hasDebrief).toBe(false);
    });

    test('SCENARIO: Teach has NO LP bonus marks', () => {
      expect(teachFramework.hasLPBonus).toBe(false);
    });
  });

  // ─── System prompt ────────────────────────────────────────────────

  describe('getSystemPrompt()', () => {

    test('SCENARIO: System prompt contains Teach rubric for all 3 areas', () => {
      const prompt = teachFramework.getSystemPrompt();

      expect(prompt).toContain('Teach');
      expect(prompt).toContain('CLASSROOM CULTURE');
      expect(prompt).toContain('INSTRUCTION');
      expect(prompt).toContain('SOCIOEMOTIONAL');
    });

    test('SCENARIO: System prompt mentions holistic 1-5 scoring', () => {
      const prompt = teachFramework.getSystemPrompt();
      expect(prompt).toContain('1-5');
      expect(prompt).toContain('holistic');
    });

    test('SCENARIO: System prompt mentions L/M/H behavior ratings', () => {
      const prompt = teachFramework.getSystemPrompt();
      expect(prompt).toMatch(/\bL\b.*\bM\b.*\bH\b/s);
    });

    test('SCENARIO: System prompt mentions Time on Task', () => {
      const prompt = teachFramework.getSystemPrompt();
      expect(prompt).toContain('Time on Task');
    });

    test('SCENARIO: System prompt is cacheable', () => {
      expect(teachFramework.getSystemPrompt()).toBe(teachFramework.getSystemPrompt());
    });
  });

  // ─── Analysis prompt ──────────────────────────────────────────────

  describe('buildAnalysisPrompt()', () => {

    test('SCENARIO: Prompt includes teacher name and lesson context', () => {
      const prompt = teachFramework.buildAnalysisPrompt(
        'Teacher discussed fractions.',
        { grade: '5', subject: 'Mathematics', teacherFirstName: 'Amina' },
        null
      );

      expect(prompt).toContain('Amina');
      expect(prompt).toContain('Grade: 5');
    });

    test('SCENARIO: Prompt requests JSON with 3 areas and element scores', () => {
      const prompt = teachFramework.buildAnalysisPrompt(
        'Transcript',
        { teacherFirstName: 'Bilal' },
        null
      );

      expect(prompt).toContain('classroom_culture');
      expect(prompt).toContain('instruction');
      expect(prompt).toContain('socioemotional');
      expect(prompt).toContain('time_on_task');
    });
  });

  // ─── Score computation ────────────────────────────────────────────

  describe('computeScores()', () => {

    const mockAnalysis = {
      time_on_task: { score: 4 },
      areas: {
        classroom_culture: {
          elements: [
            { id: 1, name: 'Supportive Learning Environment', holistic_score: 4, behaviors: [] },
            { id: 2, name: 'Positive Behavioral Expectations', holistic_score: 3, behaviors: [] }
          ]
        },
        instruction: {
          elements: [
            { id: 3, name: 'Lesson Facilitation', holistic_score: 4, behaviors: [] },
            { id: 4, name: 'Checks for Understanding', holistic_score: 3, behaviors: [] },
            { id: 5, name: 'Feedback', holistic_score: 3, behaviors: [] },
            { id: 6, name: 'Critical Thinking', holistic_score: 2, behaviors: [] }
          ]
        },
        socioemotional: {
          elements: [
            { id: 7, name: 'Autonomy', holistic_score: 2, behaviors: [] },
            { id: 8, name: 'Perseverance', holistic_score: 3, behaviors: [] },
            { id: 9, name: 'Social & Collaborative', holistic_score: 3, behaviors: [] }
          ]
        }
      }
    };

    test('SCENARIO: Computes overall marks as sum of element scores + time_on_task', () => {
      const scored = teachFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      // 4+3 + 4+3+3+2 + 2+3+3 + 4(ToT) = 31
      expect(scored.scores.overall_marks).toBe(31);
      expect(scored.scores.overall_max_marks).toBe(50);
      expect(scored.scores.overall_percentage).toBeCloseTo(62.0, 0);
    });

    test('SCENARIO: Each area gets area_score and area_max computed', () => {
      const scored = teachFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      // classroom_culture: 2 elements × max 5 = 10, scored 4+3=7
      expect(scored.areas.classroom_culture.area_score).toBe(7);
      expect(scored.areas.classroom_culture.area_max).toBe(10);

      // instruction: 4 elements × max 5 = 20, scored 4+3+3+2=12
      expect(scored.areas.instruction.area_score).toBe(12);
      expect(scored.areas.instruction.area_max).toBe(20);
    });

    test('SCENARIO: Missing areas do not crash', () => {
      const partial = {
        time_on_task: { score: 3 },
        areas: {
          classroom_culture: {
            elements: [
              { id: 1, name: 'Test', holistic_score: 4 }
            ]
          }
        }
      };

      const scored = teachFramework.computeScores(partial);
      expect(scored.scores.overall_marks).toBe(7); // 4 + 3(ToT)
    });

    test('SCENARIO: Missing time_on_task defaults to 0', () => {
      const noToT = {
        areas: {
          classroom_culture: {
            elements: [
              { id: 1, name: 'Test', holistic_score: 4 }
            ]
          }
        }
      };

      const scored = teachFramework.computeScores(noToT);
      expect(scored.scores.overall_marks).toBe(4);
    });
  });

  // ─── Performance bands ────────────────────────────────────────────

  describe('getPerformanceBand()', () => {

    test('SCENARIO: Low score maps to emerging', () => {
      expect(teachFramework.getPerformanceBand(25)).toBe('emerging');
    });

    test('SCENARIO: Mid score maps to developing', () => {
      expect(teachFramework.getPerformanceBand(50)).toBe('developing');
    });

    test('SCENARIO: Good score maps to proficient', () => {
      expect(teachFramework.getPerformanceBand(70)).toBe('proficient');
    });

    test('SCENARIO: High score maps to excellent', () => {
      expect(teachFramework.getPerformanceBand(90)).toBe('excellent');
    });
  });

  // ─── Scoring constants ────────────────────────────────────────────

  describe('getScoringConstants()', () => {

    test('SCENARIO: Returns 3 areas with correct element counts', () => {
      const constants = teachFramework.getScoringConstants();

      expect(constants.areas.classroom_culture.elementCount).toBe(2);
      expect(constants.areas.instruction.elementCount).toBe(4);
      expect(constants.areas.socioemotional.elementCount).toBe(3);
    });

    test('SCENARIO: Total elements is 9', () => {
      const constants = teachFramework.getScoringConstants();

      let total = 0;
      for (const area of Object.values(constants.areas)) {
        total += area.elementCount;
      }
      expect(total).toBe(9);
    });

    test('SCENARIO: Max marks is 50', () => {
      expect(teachFramework.getScoringConstants().maxMarks).toBe(50);
    });
  });
});
