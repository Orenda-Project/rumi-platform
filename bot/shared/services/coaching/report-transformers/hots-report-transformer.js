/**
 * HOTS Report Data Transformer
 *
 * Transforms HOTS framework analysis into the generic reportData shape
 * consumed by pdf-report.service.js.
 *
 * 5 areas → 5 goals, indicators → criteria, scale 1-3, no debrief, no LP bonus.
 *
 * Bead: bd-605 (Phase 1C-A2)
 */

const { formatDate, extractFidelity, buildPartialNote } = require('./_shared');

const AREA_CONFIG = [
  { key: 'classroom_environment', title: 'Area 1: Classroom Environment' },
  { key: 'lesson_planning', title: 'Area 2: Lesson Planning' },
  { key: 'instructional_strategies', title: 'Area 3: Instructional Strategies' },
  { key: 'student_engagement', title: 'Area 4: Student Engagement' },
  { key: 'assessment_feedback', title: 'Area 5: Assessment & Feedback' },
];

const SCALE_MAX = 3;
const MAX_MARKS = 48;

/**
 * Transform HOTS analysis into generic report data.
 * @param {object} session - Coaching session record
 * @param {string} teacherName - Teacher's full name
 * @param {object} analysis - HOTS analysis from GPT
 * @returns {object} Report data in the generic shape for PDF rendering
 */
function transformHOTSToReportData(session, teacherName, analysis) {
  const goals = [];

  for (const { key, title } of AREA_CONFIG) {
    const area = analysis.areas?.[key];
    if (!area) continue;

    goals.push({
      title,
      score: area.area_score || 0,
      maxScore: area.area_max || 0,
      criteria: (area.indicators || []).map(ind => ({
        name: ind.name,
        score: ind.score || 0,
        max: SCALE_MAX,
        evidence: ind.evidence || 'No evidence provided',
        timestamp: ind.timestamp || null,
      })),
    });
  }

  const totalScore = goals.reduce((sum, g) => sum + g.score, 0);

  return {
    teacherName,
    observationDate: formatDate(session.created_at),
    subject: session.lesson_plan_structured?.subject || analysis.subject || 'N/A',
    topic: session.lesson_plan_structured?.topic || analysis.topic || 'N/A',
    observerName: 'Rumi Digital Coach',
    frameworkDisplayName: 'HOTS Framework',
    hasLessonPlan: !!(session.lesson_plan_structured || analysis.has_lesson_plan),
    totalScore,
    maxScore: MAX_MARKS,
    priorFeedback: null,
    goals,
    debriefReflection: null,
    fidelitySection: extractFidelity(analysis),
    feedback: analysis.executive_summary || 'Analysis complete.',
    isPartialReport: session._isPartialReport || false,
    partialReportNote: buildPartialNote(session),
  };
}

module.exports = { transformHOTSToReportData };
