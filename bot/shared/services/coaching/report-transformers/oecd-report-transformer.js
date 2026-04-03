/**
 * OECD Report Data Transformer
 *
 * Extracted from report-generator.service.js (lines 456-991).
 * Transforms OECD framework analysis into the generic reportData shape
 * consumed by pdf-report.service.js.
 *
 * Bead: bd-604 (Phase 1C-A2)
 */

const { logToFile } = require('../../../utils/logger');
const {
  CLASSROOM_MARKS_BASE,
  CLASSROOM_MARKS_WITH_LP,
} = require('../../../constants/scoring.constants');

/**
 * Transform OECD analysis into generic report data.
 * @param {object} session - Coaching session record
 * @param {string} teacherName - Teacher's full name
 * @param {object} enhancedAnalysis - OECD analysis from GPT
 * @param {boolean} hasPriorSessions - Whether teacher has prior completed sessions
 * @returns {object} Report data in the generic shape for PDF rendering
 */
function transformOECDToReportData(session, teacherName, enhancedAnalysis, hasPriorSessions) {
  const observationDate = new Date(session.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const goals = [];

  // GOAL 1: FORMATIVE ASSESSMENT AND FEEDBACK (22 marks total)
  if (enhancedAnalysis.goal1_formative_assessment) {
    const goal1Data = enhancedAnalysis.goal1_formative_assessment;
    goals.push({
      title: 'Goal 1: Formative Assessment and Feedback',
      score: enhancedAnalysis.scores?.goal1_total || 0,
      maxScore: 22,
      criteria: [
        {
          name: 'SMART Objectives',
          score: goal1Data.smart_objectives?.computed_marks || 0,
          max: goal1Data.smart_objectives?.max_marks || 4,
          evidence: goal1Data.smart_objectives?.evidence || 'No evidence provided',
          timestamp: goal1Data.smart_objectives?.timestamp || null,
        },
        {
          name: "Teacher's Role",
          score: goal1Data.teachers_role?.computed_marks || 0,
          max: goal1Data.teachers_role?.max_marks || 4,
          evidence: goal1Data.teachers_role?.evidence || 'No evidence provided',
          timestamp: goal1Data.teachers_role?.timestamp || null,
        },
        {
          name: 'Assessment',
          score: goal1Data.assessment?.computed_marks || 0,
          max: goal1Data.assessment?.max_marks || 9,
          evidence: goal1Data.assessment?.evidence || 'No evidence provided',
          timestamp: goal1Data.assessment?.timestamp || null,
        },
      ],
    });
  }

  // GOAL 2: STUDENT ENGAGEMENT (22 marks total)
  if (enhancedAnalysis.goal2_student_engagement) {
    const goal2Data = enhancedAnalysis.goal2_student_engagement;
    goals.push({
      title: 'Goal 2: Student Engagement',
      score: enhancedAnalysis.scores?.goal2_total || 0,
      maxScore: 22,
      criteria: [
        {
          name: 'Cognitive Rigor',
          score: goal2Data.cognitive_rigor?.computed_marks || 0,
          max: goal2Data.cognitive_rigor?.max_marks || 9,
          evidence: goal2Data.cognitive_rigor?.evidence || 'No evidence provided',
          timestamp: goal2Data.cognitive_rigor?.timestamp || null,
        },
        {
          name: 'Real World Connections',
          score: goal2Data.real_world_connections?.computed_marks || 0,
          max: goal2Data.real_world_connections?.max_marks || 4,
          evidence: goal2Data.real_world_connections?.evidence || 'No evidence provided',
          timestamp: goal2Data.real_world_connections?.timestamp || null,
        },
        {
          name: 'Multimodality',
          score: goal2Data.multimodality?.computed_marks || 0,
          max: goal2Data.multimodality?.max_marks || 5,
          evidence: goal2Data.multimodality?.evidence || 'No evidence provided',
          timestamp: goal2Data.multimodality?.timestamp || null,
        },
        {
          name: 'Addressing Misconceptions',
          score: goal2Data.misconceptions?.computed_marks || 0,
          max: goal2Data.misconceptions?.max_marks || 4,
          evidence: goal2Data.misconceptions?.evidence || 'No evidence provided',
          timestamp: goal2Data.misconceptions?.timestamp || null,
        },
      ],
    });
  }

  // GOAL 3: QUALITY SUBJECT CONTENT (dynamic marks)
  if (enhancedAnalysis.goal3_quality_content) {
    const goal3Data = enhancedAnalysis.goal3_quality_content;
    const goal3Criteria = [
      {
        name: 'Prior Knowledge',
        score: goal3Data.prior_knowledge?.computed_marks || 0,
        max: goal3Data.prior_knowledge?.max_marks || 4,
        evidence: goal3Data.prior_knowledge?.evidence || 'No evidence provided',
        timestamp: goal3Data.prior_knowledge?.timestamp || null,
      },
      {
        name: 'Prior Knowledge Activation',
        score: goal3Data.prior_knowledge_activation?.computed_marks || 0,
        max: goal3Data.prior_knowledge_activation?.max_marks || 4,
        evidence: goal3Data.prior_knowledge_activation?.evidence || 'No evidence provided',
        timestamp: goal3Data.prior_knowledge_activation?.timestamp || null,
      },
      {
        name: 'Content Coverage',
        score: goal3Data.content_coverage_accuracy?.computed_marks || 0,
        max: goal3Data.content_coverage_accuracy?.max_marks || 11,
        evidence: goal3Data.content_coverage_accuracy?.evidence || 'No evidence provided',
        timestamp: goal3Data.content_coverage_accuracy?.timestamp || null,
      },
      {
        name: 'Organization',
        score: goal3Data.content_organization?.computed_marks || 0,
        max: goal3Data.content_organization?.max_marks || 7,
        evidence: goal3Data.content_organization?.evidence || 'No evidence provided',
        timestamp: goal3Data.content_organization?.timestamp || null,
      },
      {
        name: 'Verbal Questioning',
        score: goal3Data.verbal_questioning?.computed_marks || 0,
        max: goal3Data.verbal_questioning?.max_marks || 4,
        evidence: goal3Data.verbal_questioning?.evidence || 'No evidence provided',
        timestamp: goal3Data.verbal_questioning?.timestamp || null,
      },
      {
        name: 'Coherence and Transitions',
        score: goal3Data.coherence_transitions?.computed_marks || 0,
        max: goal3Data.coherence_transitions?.max_marks || 4,
        evidence: goal3Data.coherence_transitions?.evidence || 'No evidence provided',
        timestamp: goal3Data.coherence_transitions?.timestamp || null,
      },
    ];

    const goal3Max = goal3Criteria.reduce((sum, criterion) => sum + (criterion.max || 0), 0);

    goals.push({
      title: 'Goal 3: Quality Subject Content',
      score: enhancedAnalysis.scores?.goal3_total || 0,
      maxScore: goal3Max,
      criteria: goal3Criteria,
    });
  }

  // GOAL 4: CLASSROOM INTERACTION (5 marks total)
  if (enhancedAnalysis.goal4_classroom_interaction) {
    const goal4Data = enhancedAnalysis.goal4_classroom_interaction;
    goals.push({
      title: 'Goal 4: Classroom Interaction',
      score: enhancedAnalysis.scores?.goal4_total || 0,
      maxScore: 5,
      criteria: [
        {
          name: 'Peer and Group Interactions',
          score: goal4Data.peer_group_interactions?.computed_marks || 0,
          max: goal4Data.peer_group_interactions?.max_marks || 5,
          evidence: goal4Data.peer_group_interactions?.evidence || 'No evidence provided',
          timestamp: goal4Data.peer_group_interactions?.timestamp || null,
        },
      ],
    });
  }

  // GOAL 5: CLASSROOM MANAGEMENT (24 marks total)
  if (enhancedAnalysis.goal5_classroom_management) {
    const goal5Data = enhancedAnalysis.goal5_classroom_management;
    goals.push({
      title: 'Goal 5: Classroom Management',
      score: enhancedAnalysis.scores?.goal5_total || 0,
      maxScore: 24,
      criteria: [
        {
          name: 'Classroom Management',
          score: goal5Data.classroom_management?.computed_marks || 0,
          max: goal5Data.classroom_management?.max_marks || 9,
          evidence: goal5Data.classroom_management?.evidence || 'No evidence provided',
          timestamp: goal5Data.classroom_management?.timestamp || null,
        },
        {
          name: 'Visibility',
          score: goal5Data.visibility_materials?.computed_marks || 0,
          max: goal5Data.visibility_materials?.max_marks || 3,
          evidence: goal5Data.visibility_materials?.evidence || 'No evidence provided',
          timestamp: goal5Data.visibility_materials?.timestamp || null,
        },
        {
          name: 'Culture of Learning',
          score: goal5Data.classroom_culture?.computed_marks || 0,
          max: goal5Data.classroom_culture?.max_marks || 9,
          evidence: goal5Data.classroom_culture?.evidence || 'No evidence provided',
          timestamp: goal5Data.classroom_culture?.timestamp || null,
        },
        {
          name: 'Materials and Resources',
          score: goal5Data.teaching_learning_materials?.computed_marks || 0,
          max: goal5Data.teaching_learning_materials?.max_marks || 3,
          evidence: goal5Data.teaching_learning_materials?.evidence || 'No evidence provided',
          timestamp: goal5Data.teaching_learning_materials?.timestamp || null,
        },
      ],
    });
  }

  // PRIOR FEEDBACK (separate from 5 main goals, 5 marks total)
  let priorFeedback = null;
  if (enhancedAnalysis.goal1_formative_assessment?.incorporation_of_feedback) {
    const priorData = enhancedAnalysis.goal1_formative_assessment.incorporation_of_feedback;

    if (hasPriorSessions) {
      priorFeedback = {
        score: priorData.computed_marks || 0,
        maxScore: 5,
        evidence: priorData.evidence || '',
        timestamp: priorData.timestamp || 'N/A',
        isFirstObservation: false,
      };
    } else {
      priorFeedback = {
        score: 0,
        maxScore: 0,
        evidence: "This is the teacher's first classroom observation with Rumi. This section will be populated once the first observation is completed.",
        timestamp: 'N/A',
        isFirstObservation: true,
      };
    }
  }

  // DEBRIEF & REFLECTION SECTION (separate from 5 main goals, 15 marks total)
  let debriefReflection = null;
  if (enhancedAnalysis.debrief_reflection) {
    const debriefData = enhancedAnalysis.debrief_reflection;
    debriefReflection = {
      score: debriefData.total || 0,
      maxScore: debriefData.max_total || 15,
      criteria: [
        {
          name: 'Reflection Quality',
          score: debriefData.reflection_quality?.computed_marks || 0,
          max: debriefData.reflection_quality?.max_marks || 4,
          evidence: debriefData.reflection_quality?.evidence || 'Debrief conversation not yet completed',
          justification: debriefData.reflection_quality?.justification || '',
        },
        {
          name: 'Connecting to Specific Incidents',
          score: debriefData.connecting_to_incidents?.computed_marks || 0,
          max: debriefData.connecting_to_incidents?.max_marks || 4,
          evidence: debriefData.connecting_to_incidents?.evidence || 'Debrief conversation not yet completed',
          justification: debriefData.connecting_to_incidents?.justification || '',
        },
        {
          name: 'Uptake of Observer Feedback',
          score: debriefData.uptake_of_feedback?.computed_marks || 0,
          max: debriefData.uptake_of_feedback?.max_marks || 4,
          evidence: debriefData.uptake_of_feedback?.evidence || 'Debrief conversation not yet completed',
          justification: debriefData.uptake_of_feedback?.justification || '',
        },
        {
          name: 'Openness During Debrief',
          score: debriefData.openness_during_debrief?.computed_marks || 0,
          max: debriefData.openness_during_debrief?.max_marks || 3,
          evidence: debriefData.openness_during_debrief?.evidence || 'Debrief conversation not yet completed',
          justification: debriefData.openness_during_debrief?.justification || '',
        },
      ],
    };
  }

  const hasLessonPlanData = !!(session.lesson_plan_structured || enhancedAnalysis.has_lesson_plan);

  // Fidelity section
  let fidelitySection = enhancedAnalysis.fidelity_analysis ? {
    score: enhancedAnalysis.fidelity_analysis.score || 0,
    maxScore: enhancedAnalysis.fidelity_analysis.max_score || 100,
    note: enhancedAnalysis.fidelity_analysis.note || 'Informational only',
    commentary: enhancedAnalysis.fidelity_analysis.overall_commentary || enhancedAnalysis.fidelity_analysis.note || '',
    evidence: enhancedAnalysis.fidelity_analysis.evidence || [],
    strengths: enhancedAnalysis.fidelity_analysis.strengths || [],
    gaps: enhancedAnalysis.fidelity_analysis.gaps || [],
  } : null;

  if (hasLessonPlanData && !fidelitySection) {
    logToFile('⚠️ Fidelity analysis missing despite lesson plan', {
      coachingSessionId: session.id,
    });
    fidelitySection = {
      score: 0,
      maxScore: 100,
      note: 'Lesson plan submitted, fidelity analysis unavailable',
      commentary: 'Lesson plan was provided but fidelity insights were not generated. Please rerun analysis after resolving extraction issues.',
      evidence: [],
      strengths: [],
      gaps: [],
    };
  }

  // Score totals
  const classroomScore = enhancedAnalysis.scores?.overall_marks || 0;
  const debriefScore = debriefReflection?.score || 0;
  const priorScore = priorFeedback && !priorFeedback.isFirstObservation ? priorFeedback.score : 0;
  const totalScore = classroomScore + debriefScore + priorScore;

  const classroomMax = hasLessonPlanData ? CLASSROOM_MARKS_WITH_LP : CLASSROOM_MARKS_BASE;
  const debriefMax = debriefReflection?.maxScore || 0;
  const priorMax = hasPriorSessions ? 5 : 0;
  const maxPossibleMarks = classroomMax + debriefMax + priorMax;

  // LP evidence injection (OECD-specific)
  _applyLessonPlanEvidenceToCriteria(goals, session.lesson_plan_structured, teacherName);

  // Bug #9: Build partial report note if applicable
  let partialReportNote = null;
  if (session._isPartialReport) {
    const questionsCompleted = session._questionsAtCompletion || 0;
    if (session._isAutoCompleted) {
      partialReportNote = questionsCompleted > 0
        ? `Note: This report includes ${questionsCompleted}/3 reflective responses. The session was auto-completed after 12 hours of inactivity. Full insights require completing all reflection questions.`
        : `Note: This report is based on classroom audio analysis only. The reflective conversation was not completed (auto-completed after 12 hours of inactivity).`;
    } else if (session._isUserRequestedEarly) {
      partialReportNote = questionsCompleted > 0
        ? `Note: This report includes ${questionsCompleted}/3 reflective responses. You requested early completion. Full insights require completing all reflection questions.`
        : `Note: This report is based on classroom audio analysis only. The reflective conversation was skipped at your request.`;
    }

    logToFile('📝 Partial report note added', {
      coachingSessionId: session.id,
      questionsCompleted,
      isAutoCompleted: session._isAutoCompleted,
      isUserRequestedEarly: session._isUserRequestedEarly,
    });
  }

  return {
    teacherName,
    observationDate,
    subject: session.lesson_plan_structured?.subject || enhancedAnalysis.subject || 'N/A',
    topic: session.lesson_plan_structured?.topic || enhancedAnalysis.topic || 'N/A',
    observerName: 'Rumi Digital Coach',
    frameworkDisplayName: 'OECD Framework',
    hasLessonPlan: hasLessonPlanData,
    totalScore,
    maxScore: maxPossibleMarks,
    priorFeedback,
    goals,
    debriefReflection,
    fidelitySection,
    feedback: enhancedAnalysis.executive_summary || enhancedAnalysis.summary || 'Analysis complete.',
    isPartialReport: session._isPartialReport || false,
    partialReportNote,
  };
}

// ─── LP Evidence Helpers (OECD-specific) ─────────────────────────────

function _applyLessonPlanEvidenceToCriteria(goals, lessonPlanStructured, teacherName) {
  if (!lessonPlanStructured || !Array.isArray(goals)) {
    return;
  }

  const snippets = _buildLessonPlanSnippets(lessonPlanStructured, teacherName);

  const enhanceCriterion = (goalPredicate, criterionName, snippetKey) => {
    const snippet = snippets[snippetKey];
    if (!snippet) {
      return;
    }
    const goal = goals.find((g) => goalPredicate(g.title || ''));
    if (!goal || !Array.isArray(goal.criteria)) {
      return;
    }
    const criterion = goal.criteria.find((c) => c.name === criterionName);
    if (!criterion || !criterion.evidence) {
      return;
    }
    const timestampSuffix = criterion.timestamp
      ? ` (Timestamp: ${criterion.timestamp})`
      : '';
    const planLines = [];
    const baseLine = snippet.narrative
      ? `From Lesson Plan: ${snippet.narrative}`
      : 'From Lesson Plan:';
    planLines.push(baseLine.trim());
    if (snippet.quote) {
      planLines.push(`Quote: ${snippet.quote}`);
    }
    const classroomLine = `From Classroom: ${criterion.evidence}${timestampSuffix}`;
    criterion.evidence = `${planLines.join('\n')}\n${classroomLine}`;
  };

  const isGoal = {
    formative: (title = '') => title.toLowerCase().includes('formative assessment'),
    subject: (title = '') => title.toLowerCase().includes('quality subject content'),
    management: (title = '') => title.toLowerCase().includes('classroom management'),
  };

  enhanceCriterion(isGoal.formative, 'SMART Objectives', 'smartObjectives');
  enhanceCriterion(isGoal.subject, 'Prior Knowledge', 'priorKnowledge');
  enhanceCriterion(isGoal.formative, 'Assessment', 'assessment');
  enhanceCriterion(isGoal.management, 'Materials and Resources', 'materials');
}

function _buildLessonPlanSnippets(plan, teacherName) {
  const snippets = {};
  const teacherLabel = (teacherName || 'The teacher').trim();
  const teacherShort = teacherLabel.split(' ')[0] || teacherLabel;

  const formatExcerpt = (items = [], limit = 3) => {
    if (!Array.isArray(items) || !items.length) {
      return null;
    }
    const cleaned = items
      .map((item) => (typeof item === 'string' ? item.trim() : item))
      .filter(Boolean);
    if (!cleaned.length) {
      return null;
    }
    const selected = cleaned.slice(0, limit).map((value) => value.toString().trim());
    const remainder = cleaned.length - selected.length;
    return remainder > 0 ? `${selected.join('; ')} (+${remainder} more)` : selected.join('; ');
  };

  const buildListNarrative = (items = [], opts = {}) => {
    if (!Array.isArray(items) || !items.length) {
      return null;
    }
    const selected = items.slice(0, opts.limit || 2);
    if (!selected.length) {
      return null;
    }
    const summary = selected.join('; ');
    if (items.length > selected.length) {
      return `${summary} (+${items.length - selected.length} more)`;
    }
    return summary;
  };

  if (plan.objectives?.length) {
    const objectiveSummary = buildListNarrative(plan.objectives, { limit: 2 });
    snippets.smartObjectives = {
      narrative: objectiveSummary
        ? `${teacherShort} framed explicit outcomes such as ${objectiveSummary}, giving students a clear target for the lesson.`
        : `${teacherShort} framed explicit outcomes so students knew what success looked like before practice began.`,
      quote: formatExcerpt(plan.objectives, 2),
    };
  }

  if (plan.prior_knowledge?.length) {
    const priorSummary = buildListNarrative(plan.prior_knowledge, { limit: 3 });
    snippets.priorKnowledge = {
      narrative: priorSummary
        ? `${teacherShort} expected learners to already understand ${priorSummary}, so the lesson could build directly on that base.`
        : `${teacherShort} anticipated key prerequisite knowledge before introducing new material.`,
      quote: formatExcerpt(plan.prior_knowledge, 3),
    };
  }

  const assessmentPieces = [];
  if (plan.assessment_sequences?.length) {
    assessmentPieces.push(
      ...plan.assessment_sequences.map((sequence) => {
        const steps = sequence.steps?.length ? `Steps: ${sequence.steps.join(' › ')}` : '';
        return `${sequence.title || 'Assessment'}${steps ? ` (${steps})` : ''}`.trim();
      })
    );
  }
  if (plan.assessment_methods?.length) {
    assessmentPieces.push(...plan.assessment_methods);
  }
  if (plan.planned_questions?.length) {
    assessmentPieces.push(...plan.planned_questions.map((question) => question.question || '').filter(Boolean));
  }
  if (assessmentPieces.length) {
    snippets.assessment = {
      narrative: `${teacherShort} mapped formative checkpoints (group demonstrations, notebook work, and targeted oral questions) to gather evidence beyond whole-class recall.`,
      quote: formatExcerpt(assessmentPieces, 3),
    };
  }

  const materialEntries = [];
  if (plan.materials?.length) {
    materialEntries.push(...plan.materials);
  }
  if (plan.resources_detail?.length) {
    materialEntries.push(
      ...plan.resources_detail.map((resource) => {
        const reference = resource.reference ? ` (${resource.reference})` : '';
        return `${resource.name || 'Resource'}${reference}`;
      })
    );
  }
  if (plan.textbook_references?.length) {
    materialEntries.push(
      ...plan.textbook_references.map(
        (ref) => `${ref.title || 'Textbook'} p.${ref.page || '?'}${ref.usage ? ` – ${ref.usage}` : ''}`
      )
    );
  }
  if (plan.resource_pages?.length) {
    materialEntries.push(
      ...plan.resource_pages.map(
        (page) =>
          `${page.name || 'Resource'} (page ${page.page || '?'})${page.description ? ` – ${page.description}` : ''}`
      )
    );
  }
  if (materialEntries.length) {
    const materialSummary = buildListNarrative(materialEntries, { limit: 3 });
    snippets.materials = {
      narrative: materialSummary
        ? `${teacherShort} prepared resources such as ${materialSummary} so students could access the concept in multiple ways.`
        : `${teacherShort} stocked the required teaching materials in advance.`,
      quote: formatExcerpt(materialEntries, 3),
    };
  }

  return snippets;
}

module.exports = { transformOECDToReportData };
