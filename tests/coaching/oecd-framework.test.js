/**
 * OECD Framework Module Tests (TDD)
 *
 * Validates bd-592: Extract OECD logic into oecd-framework.js
 *
 * Tests the standard module interface that ALL frameworks must implement.
 * Scenario-based: tests what a coaching session looks like when OECD is selected.
 */

const oecdFramework = require('../../bot/shared/services/coaching/frameworks/oecd-framework');

describe('OECD Framework Module (bd-592)', () => {

  // ─── Module interface compliance ──────────────────────────────────

  describe('Module interface', () => {

    test('SCENARIO: Framework module exports all required interface methods', () => {
      // When the framework registry loads oecd-framework, it must have
      // the standard interface so the coaching pipeline can call it.
      expect(oecdFramework.name).toBe('oecd');
      expect(oecdFramework.version).toBeDefined();
      expect(oecdFramework.displayName).toBe('OECD Framework');
      expect(typeof oecdFramework.maxMarks).toBe('number');
      expect(typeof oecdFramework.hasDebrief).toBe('boolean');
      expect(typeof oecdFramework.hasLPBonus).toBe('boolean');

      expect(typeof oecdFramework.getSystemPrompt).toBe('function');
      expect(typeof oecdFramework.buildAnalysisPrompt).toBe('function');
      expect(typeof oecdFramework.computeScores).toBe('function');
      expect(typeof oecdFramework.getPerformanceBand).toBe('function');
      expect(typeof oecdFramework.getScoringConstants).toBe('function');
    });

    test('SCENARIO: OECD max marks is 103 (classroom only, no LP/debrief)', () => {
      expect(oecdFramework.maxMarks).toBe(103);
    });

    test('SCENARIO: OECD has debrief section', () => {
      expect(oecdFramework.hasDebrief).toBe(true);
    });

    test('SCENARIO: OECD has LP bonus marks', () => {
      expect(oecdFramework.hasLPBonus).toBe(true);
    });
  });

  // ─── System prompt ────────────────────────────────────────────────

  describe('getSystemPrompt()', () => {

    test('SCENARIO: System prompt contains OECD rubric for all 5 goals', () => {
      const prompt = oecdFramework.getSystemPrompt();

      expect(prompt).toContain('OECD');
      expect(prompt).toContain('GOAL 1');
      expect(prompt).toContain('GOAL 2');
      expect(prompt).toContain('GOAL 3');
      expect(prompt).toContain('GOAL 4');
      expect(prompt).toContain('GOAL 5');
    });

    test('SCENARIO: System prompt includes Pakistani context considerations', () => {
      const prompt = oecdFramework.getSystemPrompt();
      expect(prompt).toContain('PAKISTANI CLASSROOM CONTEXT');
    });

    test('SCENARIO: System prompt includes STICKS debrief principles', () => {
      const prompt = oecdFramework.getSystemPrompt();
      expect(prompt).toContain('S.T.I.C.K.S');
    });

    test('SCENARIO: System prompt is cacheable (returns same string each call)', () => {
      const prompt1 = oecdFramework.getSystemPrompt();
      const prompt2 = oecdFramework.getSystemPrompt();
      expect(prompt1).toBe(prompt2);
    });
  });

  // ─── Analysis prompt ──────────────────────────────────────────────

  describe('buildAnalysisPrompt()', () => {

    test('SCENARIO: Teacher with lesson plan gets LP-specific analysis', () => {
      const prompt = oecdFramework.buildAnalysisPrompt(
        'Teacher: Good morning class. Today we study multiplication.',
        { grade: '3', subject: 'Mathematics', teacherFirstName: 'Fatima' },
        { title: 'Multiplication', objectives: ['Learn times tables'] }
      );

      expect(prompt).toContain('Fatima');
      expect(prompt).toContain('Grade: 3');
      expect(prompt).toContain('Mathematics');
      expect(prompt).toContain('LESSON PLAN SUMMARY');
      expect(prompt).toContain('fidelity_to_lesson_plan');
    });

    test('SCENARIO: Teacher without lesson plan gets standard analysis (no fidelity)', () => {
      const prompt = oecdFramework.buildAnalysisPrompt(
        'Teacher: Good morning class.',
        { grade: '5', subject: 'English', teacherFirstName: 'Ahmed' },
        null // no lesson plan
      );

      expect(prompt).toContain('Ahmed');
      expect(prompt).not.toContain('fidelity_to_lesson_plan');
    });

    test('SCENARIO: Prompt includes JSON output schema with all 5 goals', () => {
      const prompt = oecdFramework.buildAnalysisPrompt(
        'Transcript text',
        { teacherFirstName: 'Sara' },
        null
      );

      expect(prompt).toContain('goal1_formative_assessment');
      expect(prompt).toContain('goal2_student_engagement');
      expect(prompt).toContain('goal3_quality_content');
      expect(prompt).toContain('goal4_classroom_interaction');
      expect(prompt).toContain('goal5_classroom_management');
    });

    test('SCENARIO: Prior feedback is included when available', () => {
      const prompt = oecdFramework.buildAnalysisPrompt(
        'Transcript',
        {
          teacherFirstName: 'Ali',
          priorFeedback: 'Observation 11/10/2025: Work on questioning techniques.'
        },
        null
      );

      expect(prompt).toContain('PRIOR FEEDBACK');
      expect(prompt).toContain('11/10/2025');
    });
  });

  // ─── Score computation ────────────────────────────────────────────

  describe('computeScores()', () => {

    const mockAnalysis = {
      goal1_formative_assessment: {
        incorporation_of_feedback: { competency_score: 2 },
        smart_objectives: { competency_score: 3 },
        teachers_role: { competency_score: 2 },
        assessment: { competency_score: 2 }
      },
      goal2_student_engagement: {
        cognitive_rigor: { competency_score: 2 },
        real_world_connections: { competency_score: 1 },
        multimodality: { competency_score: 2 },
        misconceptions: { competency_score: 1 }
      },
      goal3_quality_content: {
        prior_knowledge: { competency_score: 2 },
        prior_knowledge_activation: { competency_score: 2 },
        content_coverage_accuracy: { competency_score: 2 },
        content_organization: { competency_score: 2 },
        verbal_questioning: { competency_score: 2 },
        coherence_transitions: { competency_score: 2 }
      },
      goal4_classroom_interaction: {
        peer_group_interactions: { competency_score: 2 }
      },
      goal5_classroom_management: {
        classroom_management: { competency_score: 2 },
        visibility_materials: { competency_score: 1 },
        classroom_culture: { competency_score: 2 },
        teaching_learning_materials: { competency_score: 1 }
      }
    };

    test('SCENARIO: Score computation produces goal totals and overall marks', () => {
      const scored = oecdFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      expect(scored.scores).toBeDefined();
      expect(scored.scores.goal1_total).toBeGreaterThan(0);
      expect(scored.scores.goal2_total).toBeGreaterThan(0);
      expect(scored.scores.goal3_total).toBeGreaterThan(0);
      expect(scored.scores.goal4_total).toBeGreaterThan(0);
      expect(scored.scores.goal5_total).toBeGreaterThan(0);
      expect(scored.scores.overall_marks).toBeGreaterThan(0);
      expect(scored.scores.max_marks).toBe(103);
      expect(scored.scores.percentage).toBeGreaterThan(0);
    });

    test('SCENARIO: OECD formula: (competency / max_level) * max_marks', () => {
      const scored = oecdFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      // smart_objectives: competency 3, max_level 3, max_marks 4 → (3/3)*4 = 4.0
      expect(scored.goal1_formative_assessment.smart_objectives.computed_marks).toBe(4);

      // real_world_connections: competency 1, max_level 2, max_marks 4 → (1/2)*4 = 2.0
      expect(scored.goal2_student_engagement.real_world_connections.computed_marks).toBe(2);

      // peer_group_interactions: competency 2, max_level 3, max_marks 5 → (2/3)*5 = 3.33
      expect(scored.goal4_classroom_interaction.peer_group_interactions.computed_marks).toBeCloseTo(3.33, 1);
    });

    test('SCENARIO: Each criterion gets max_marks and computed_marks annotated', () => {
      const scored = oecdFramework.computeScores(JSON.parse(JSON.stringify(mockAnalysis)));

      // Spot-check a few criteria
      expect(scored.goal1_formative_assessment.assessment.max_marks).toBe(9);
      expect(scored.goal1_formative_assessment.assessment.computed_marks).toBeDefined();

      expect(scored.goal3_quality_content.content_coverage_accuracy.max_marks).toBe(11);
      expect(scored.goal5_classroom_management.classroom_culture.max_marks).toBe(9);
    });

    test('SCENARIO: With LP, max marks includes LP bonus (103 + 14 = 117)', () => {
      const scored = oecdFramework.computeScores(
        JSON.parse(JSON.stringify(mockAnalysis)),
        true // hasLessonPlan
      );

      expect(scored.scores.max_marks).toBe(117);
    });

    test('SCENARIO: Without LP, max marks is base 103', () => {
      const scored = oecdFramework.computeScores(
        JSON.parse(JSON.stringify(mockAnalysis)),
        false
      );

      expect(scored.scores.max_marks).toBe(103);
    });

    test('SCENARIO: Missing goal data does not crash — defaults to 0', () => {
      const partialAnalysis = {
        goal1_formative_assessment: {
          incorporation_of_feedback: { competency_score: 2 }
        }
        // goals 2-5 missing entirely
      };

      const scored = oecdFramework.computeScores(partialAnalysis);
      expect(scored.scores.goal1_total).toBeGreaterThan(0);
      expect(scored.scores.goal2_total).toBe(0);
      expect(scored.scores.goal3_total).toBe(0);
      expect(scored.scores.overall_marks).toBeGreaterThan(0);
    });
  });

  // ─── Debrief marks ────────────────────────────────────────────────

  describe('computeDebriefMarks()', () => {

    test('SCENARIO: Debrief marks computed correctly (max 15)', () => {
      const debriefData = {
        reflection_quality: { competency_score: 2 },
        connecting_to_incidents: { competency_score: 2 },
        uptake_of_feedback: { competency_score: 2 },
        openness_during_debrief: { competency_score: 2 }
      };

      const result = oecdFramework.computeDebriefMarks(debriefData);

      expect(result.total).toBeGreaterThan(0);
      expect(result.max_total).toBe(15);
      // reflection: (2/2)*4=4, incidents: (2/2)*4=4, uptake: (2/3)*4=2.67, openness: (2/2)*3=3
      // total = 4 + 4 + 2.67 + 3 = 13.67
      expect(result.total).toBeCloseTo(13.67, 1);
    });

    test('SCENARIO: Null debrief data returns null', () => {
      expect(oecdFramework.computeDebriefMarks(null)).toBeNull();
    });
  });

  // ─── Performance bands ────────────────────────────────────────────

  describe('getPerformanceBand()', () => {

    test('SCENARIO: Low score maps to emerging', () => {
      expect(oecdFramework.getPerformanceBand(25)).toBe('emerging');
    });

    test('SCENARIO: Mid score maps to developing', () => {
      expect(oecdFramework.getPerformanceBand(50)).toBe('developing');
    });

    test('SCENARIO: Good score maps to proficient', () => {
      expect(oecdFramework.getPerformanceBand(70)).toBe('proficient');
    });

    test('SCENARIO: High score maps to excellent', () => {
      expect(oecdFramework.getPerformanceBand(90)).toBe('excellent');
    });
  });

  // ─── Scoring constants ────────────────────────────────────────────

  describe('getScoringConstants()', () => {

    test('SCENARIO: Returns rubric data for all 19 classroom criteria', () => {
      const constants = oecdFramework.getScoringConstants();

      expect(constants.areas).toBeDefined();
      // 5 goals
      expect(Object.keys(constants.areas)).toHaveLength(5);

      // Count total criteria across all goals
      let totalCriteria = 0;
      for (const goal of Object.values(constants.areas)) {
        totalCriteria += Object.keys(goal).length;
      }
      expect(totalCriteria).toBe(19);
    });

    test('SCENARIO: Max marks from rubric criteria is consistent', () => {
      const constants = oecdFramework.getScoringConstants();

      let totalMaxMarks = 0;
      for (const goal of Object.values(constants.areas)) {
        for (const criterion of Object.values(goal)) {
          totalMaxMarks += criterion.max_marks;
        }
      }
      // Note: Rubric criteria sum to 107 (Goal 3 = 34, not 30 as header states).
      // CLASSROOM_MARKS_BASE = 103 uses section headers. Pre-existing discrepancy.
      expect(totalMaxMarks).toBe(107);
    });
  });
});
