/**
 * HOTS Framework Module Tests (TDD)
 *
 * Validates bd-593: Create hots-framework.js
 *
 * HOTS: Higher-Order Thinking Skills — PESRP/PECTAA Punjab observation tool.
 * 5 Areas, 16 Indicators, Scale 1-3, Max 48 marks.
 */

const hotsFramework = require('../../bot/shared/services/coaching/frameworks/hots-framework');

describe('HOTS Framework Module (bd-593)', () => {

  // ─── Module interface compliance ──────────────────────────────────

  describe('Module interface', () => {

    test('SCENARIO: Framework module exports all required interface methods', () => {
      expect(hotsFramework.name).toBe('hots');
      expect(hotsFramework.version).toBeDefined();
      expect(hotsFramework.displayName).toBe('HOTS Framework');
      expect(typeof hotsFramework.maxMarks).toBe('number');
      expect(typeof hotsFramework.hasDebrief).toBe('boolean');
      expect(typeof hotsFramework.hasLPBonus).toBe('boolean');

      expect(typeof hotsFramework.getSystemPrompt).toBe('function');
      expect(typeof hotsFramework.buildAnalysisPrompt).toBe('function');
      expect(typeof hotsFramework.computeScores).toBe('function');
      expect(typeof hotsFramework.getPerformanceBand).toBe('function');
      expect(typeof hotsFramework.getScoringConstants).toBe('function');
    });

    test('SCENARIO: HOTS max marks is 48', () => {
      expect(hotsFramework.maxMarks).toBe(48);
    });

    test('SCENARIO: HOTS has NO debrief section', () => {
      expect(hotsFramework.hasDebrief).toBe(false);
    });

    test('SCENARIO: HOTS has NO LP bonus marks', () => {
      expect(hotsFramework.hasLPBonus).toBe(false);
    });
  });

  // ─── System prompt ────────────────────────────────────────────────

  describe('getSystemPrompt()', () => {

    test('SCENARIO: System prompt contains HOTS rubric for all 5 areas', () => {
      const prompt = hotsFramework.getSystemPrompt();

      expect(prompt).toContain('HOTS');
      expect(prompt).toContain('CLASSROOM ENVIRONMENT');
      expect(prompt).toContain('LESSON PLANNING');
      expect(prompt).toContain('INSTRUCTIONAL STRATEGIES');
      expect(prompt).toContain('STUDENT ENGAGEMENT');
      expect(prompt).toContain('ASSESSMENT');
    });

    test('SCENARIO: System prompt mentions all 16 indicators', () => {
      const prompt = hotsFramework.getSystemPrompt();

      expect(prompt).toContain('The classroom fosters open discussions and critical thinking');
      expect(prompt).toContain('The teacher poses open-ended and thought-provoking questions');
      expect(prompt).toContain('Scaffolding is used effectively');
      expect(prompt).toContain('The teacher encourages students to explore multiple perspectives');
      expect(prompt).toContain('Students engage in self-assessment or peer-assessment');
      expect(prompt).toContain('The teacher provides feedback that guides students');
      expect(prompt).toContain('Assessment tasks require students to analyse, evaluate, or create');
    });

    test('SCENARIO: System prompt mentions Pakistani/Punjab context', () => {
      const prompt = hotsFramework.getSystemPrompt();
      expect(prompt).toContain('Pakistan');
    });

    test('SCENARIO: System prompt is cacheable', () => {
      expect(hotsFramework.getSystemPrompt()).toBe(hotsFramework.getSystemPrompt());
    });
  });

  // ─── Analysis prompt ──────────────────────────────────────────────

  describe('buildAnalysisPrompt()', () => {

    test('SCENARIO: Prompt includes teacher name and context', () => {
      const prompt = hotsFramework.buildAnalysisPrompt(
        'Teacher discussed multiplication.',
        { grade: '4', subject: 'Mathematics', teacherFirstName: 'Zara' },
        null
      );

      expect(prompt).toContain('Zara');
      expect(prompt).toContain('Grade: 4');
      expect(prompt).toContain('Mathematics');
    });

    test('SCENARIO: Prompt requests JSON with 5 areas and indicator scores', () => {
      const prompt = hotsFramework.buildAnalysisPrompt(
        'Transcript text',
        { teacherFirstName: 'Ali' },
        null
      );

      expect(prompt).toContain('classroom_environment');
      expect(prompt).toContain('lesson_planning');
      expect(prompt).toContain('instructional_strategies');
      expect(prompt).toContain('student_engagement');
      expect(prompt).toContain('assessment_feedback');
    });

    test('SCENARIO: HOTS prompt uses 1-3 scale (not 1-2)', () => {
      const prompt = hotsFramework.buildAnalysisPrompt(
        'Transcript',
        { teacherFirstName: 'Sara' },
        null
      );

      expect(prompt).toContain('1-3');
    });
  });

  // ─── Score computation ────────────────────────────────────────────

  describe('computeScores()', () => {

    const mockAnalysis = {
      areas: {
        classroom_environment: {
          indicators: [
            { id: 1, name: 'The classroom fosters open discussions and critical thinking', score: 2 },
            { id: 2, name: 'Resources and space are organized to support collaboration and problem-solving', score: 2 },
            { id: 3, name: 'Students are actively encouraged to participate in complex tasks with clear expectations', score: 3 }
          ]
        },
        lesson_planning: {
          indicators: [
            { id: 4, name: 'Lesson objectives explicitly link to critical thinking, problem-solving, or creative skills', score: 2 },
            { id: 5, name: 'Lesson plans include strategies for promoting analysis, evaluation, and synthesis', score: 3 },
            { id: 6, name: 'The lesson integrates interdisciplinary or real-world applications', score: 1 }
          ]
        },
        instructional_strategies: {
          indicators: [
            { id: 7, name: 'The teacher poses open-ended and thought-provoking questions', score: 2 },
            { id: 8, name: 'Instruction actively involves students in analyzing, interpreting, and critiquing content', score: 2 },
            { id: 9, name: 'The teacher demonstrates problem-solving and creativity in real-time scenarios', score: 1 },
            { id: 10, name: 'Scaffolding is used effectively to help students explore complex ideas', score: 2 }
          ]
        },
        student_engagement: {
          indicators: [
            { id: 11, name: 'Students collaborate on tasks requiring synthesis, evaluation, or innovative problem-solving', score: 2 },
            { id: 12, name: 'The teacher encourages students to explore multiple perspectives or create novel solutions', score: 1 },
            { id: 13, name: 'Students actively engage in discussions and debates on complex topics', score: 1 }
          ]
        },
        assessment_feedback: {
          indicators: [
            { id: 14, name: 'Students engage in self-assessment or peer-assessment to evaluate reasoning and solutions', score: 2 },
            { id: 15, name: 'The teacher provides feedback that guides students in refining reasoning or solutions', score: 2 },
            { id: 16, name: 'Assessment tasks require students to analyse, evaluate, or create based on the lesson content', score: 1 }
          ]
        }
      }
    };

    test('SCENARIO: Computes area scores and overall marks', () => {
      const scored = hotsFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      expect(scored.scores).toBeDefined();
      expect(scored.scores.overall_marks).toBeGreaterThan(0);
      expect(scored.scores.overall_max_marks).toBe(48);
      expect(scored.scores.overall_percentage).toBeGreaterThan(0);
    });

    test('SCENARIO: HOTS formula is simple sum of indicator scores', () => {
      const scored = hotsFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      // Sum: 2+2+3 + 2+3+1 + 2+2+1+2 + 2+1+1 + 2+2+1 = 29
      expect(scored.scores.overall_marks).toBe(29);
      // 29/48 * 100 = 60.4%
      expect(scored.scores.overall_percentage).toBeCloseTo(60.4, 0);
    });

    test('SCENARIO: Each area gets area_score and area_max computed', () => {
      const scored = hotsFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      // classroom_environment: 3 indicators × max 3 = max 9, scored 2+2+3=7
      expect(scored.areas.classroom_environment.area_score).toBe(7);
      expect(scored.areas.classroom_environment.area_max).toBe(9);

      // instructional_strategies: 4 indicators × max 3 = max 12, scored 2+2+1+2=7
      expect(scored.areas.instructional_strategies.area_score).toBe(7);
      expect(scored.areas.instructional_strategies.area_max).toBe(12);
    });

    test('SCENARIO: Missing areas do not crash', () => {
      const partial = {
        areas: {
          classroom_environment: {
            indicators: [
              { id: 1, name: 'Test', score: 3 }
            ]
          }
        }
      };

      const scored = hotsFramework.computeScores(partial);
      expect(scored.scores.overall_marks).toBe(3);
    });
  });

  // ─── Performance bands ────────────────────────────────────────────

  describe('getPerformanceBand()', () => {

    test('SCENARIO: Low score maps to emerging', () => {
      expect(hotsFramework.getPerformanceBand(25)).toBe('emerging');
    });

    test('SCENARIO: Mid score maps to developing', () => {
      expect(hotsFramework.getPerformanceBand(50)).toBe('developing');
    });

    test('SCENARIO: Good score maps to proficient', () => {
      expect(hotsFramework.getPerformanceBand(75)).toBe('proficient');
    });

    test('SCENARIO: High score maps to excellent', () => {
      expect(hotsFramework.getPerformanceBand(90)).toBe('excellent');
    });
  });

  // ─── Scoring constants ────────────────────────────────────────────

  describe('getScoringConstants()', () => {

    test('SCENARIO: Returns 5 areas with correct indicator counts', () => {
      const constants = hotsFramework.getScoringConstants();

      expect(constants.areas).toBeDefined();
      expect(constants.areas.classroom_environment.indicatorCount).toBe(3);
      expect(constants.areas.lesson_planning.indicatorCount).toBe(3);
      expect(constants.areas.instructional_strategies.indicatorCount).toBe(4);
      expect(constants.areas.student_engagement.indicatorCount).toBe(3);
      expect(constants.areas.assessment_feedback.indicatorCount).toBe(3);
    });

    test('SCENARIO: Total indicators across all areas is 16', () => {
      const constants = hotsFramework.getScoringConstants();

      let totalIndicators = 0;
      for (const area of Object.values(constants.areas)) {
        totalIndicators += area.indicatorCount;
      }
      expect(totalIndicators).toBe(16);
    });

    test('SCENARIO: Max marks is 48 (16 indicators × 3)', () => {
      expect(hotsFramework.getScoringConstants().maxMarks).toBe(48);
    });
  });

  // ─── BUG-009 fixes: evidence format + subject/topic inference ─────

  describe('BUG-009 fixes', () => {

    test('Analysis prompt instructs GPT to NOT include Urdu text in evidence', () => {
      const prompt = hotsFramework.buildAnalysisPrompt(
        'Sample transcript text',
        { duration: 600, language: 'ur', teacherFirstName: 'Ayesha' },
        null
      );

      expect(prompt).toContain('DO NOT include Urdu text');
      expect(prompt).toContain('ONLY the English translation');
    });

    test('Analysis prompt requires two-part evidence format (description + English quote)', () => {
      const prompt = hotsFramework.buildAnalysisPrompt(
        'Sample transcript text',
        { duration: 600, language: 'ur', teacherFirstName: 'Ayesha' },
        null
      );

      expect(prompt).toContain('Part 1');
      expect(prompt).toContain('Part 2');
      expect(prompt).toContain('English Translation of Dialogue');
    });

    test('Analysis prompt asks GPT to infer subject and topic from transcript', () => {
      const prompt = hotsFramework.buildAnalysisPrompt(
        'Sample transcript text',
        { duration: 600, language: 'ur', teacherFirstName: 'Ayesha' },
        null
      );

      expect(prompt).toContain('"subject"');
      expect(prompt).toContain('"topic"');
      expect(prompt).toContain('Inferred subject');
      expect(prompt).toContain('Inferred specific topic');
    });

    test('HOTS report transformer picks up subject/topic from analysis when no lesson plan', () => {
      const { transformHOTSToReportData } = require('../../bot/shared/services/coaching/report-transformers/hots-report-transformer');

      const mockSession = {
        created_at: '2026-03-21T00:00:00Z',
        lesson_plan_structured: null
      };

      const mockAnalysis = {
        subject: 'Mathematics',
        topic: 'Two-digit subtraction with borrowing',
        executive_summary: 'Test summary',
        areas: {
          classroom_environment: { indicators: [{ id: 1, name: 'Test', score: 2, evidence: 'Test evidence' }], area_score: 2, area_max: 9 },
          lesson_planning: { indicators: [], area_score: 0, area_max: 9 },
          instructional_strategies: { indicators: [], area_score: 0, area_max: 12 },
          student_engagement: { indicators: [], area_score: 0, area_max: 9 },
          assessment_feedback: { indicators: [], area_score: 0, area_max: 9 }
        }
      };

      const reportData = transformHOTSToReportData(mockSession, 'Test Teacher', mockAnalysis);

      expect(reportData.subject).toBe('Mathematics');
      expect(reportData.topic).toBe('Two-digit subtraction with borrowing');
      expect(reportData.subject).not.toBe('N/A');
    });
  });
});
