/**
 * FICO Report Data Transformer
 *
 * Transforms FICO Unified Observation Tool analysis into the generic
 * reportData shape consumed by pdf-report.service.js.
 *
 * 5 domains → 5 goals, indicators → criteria, scale 1-4, no debrief, no LP bonus.
 * Photo-aware indicators (3.2 Routines & Transitions, 4.4 Use of Materials)
 * include photo evidence in the evidence text when available.
 *
 * Bead: bd-607 (Phase 1C-A2)
 */

const { formatDate, extractFidelity, buildPartialNote } = require('./_shared');

const DOMAIN_CONFIG = [
  { key: 'lesson_structure', title: 'Domain 1: Lesson Structure' },
  { key: 'instructional_quality', title: 'Domain 2: Instructional Quality' },
  { key: 'classroom_climate', title: 'Domain 3: Classroom Climate' },
  { key: 'student_engagement', title: 'Domain 4: Student Engagement' },
  { key: 'assessment_feedback', title: 'Domain 5: Assessment & Feedback' },
];

const SCALE_MAX = 4;
const MAX_MARKS = 84;

// Indicators that should reference photo evidence when available
const PHOTO_AWARE_INDICATORS = ['3.2', '4.4'];

/**
 * Transform FICO analysis into generic report data.
 * @param {object} session - Coaching session record
 * @param {string} teacherName - Teacher's full name
 * @param {object} analysis - FICO analysis from GPT
 * @returns {object} Report data in the generic shape for PDF rendering
 */
function transformFICOToReportData(session, teacherName, analysis) {
  const goals = [];
  const hasPhotoAnalysis = !!analysis.photo_analysis;

  for (const { key, title } of DOMAIN_CONFIG) {
    const domain = analysis.domains?.[key];
    if (!domain) continue;

    goals.push({
      title,
      score: domain.domain_score || 0,
      maxScore: domain.domain_max || 0,
      criteria: (domain.indicators || []).map(ind => {
        let evidence = ind.evidence || 'No evidence provided';

        // Append photo evidence for photo-aware indicators
        if (hasPhotoAnalysis && PHOTO_AWARE_INDICATORS.includes(ind.id)) {
          evidence = `${evidence} | Photo evidence: ${analysis.photo_analysis}`;
        }

        return {
          name: ind.name,
          score: ind.score || 0,
          max: SCALE_MAX,
          evidence,
          timestamp: ind.timestamp || null,
        };
      }),
    });
  }

  const totalScore = goals.reduce((sum, g) => sum + g.score, 0);

  return {
    teacherName,
    observationDate: formatDate(session.created_at),
    subject: session.lesson_plan_structured?.subject || analysis.subject || 'N/A',
    topic: session.lesson_plan_structured?.topic || analysis.topic || 'N/A',
    observerName: 'Rumi Digital Coach',
    frameworkDisplayName: 'FICO Framework',
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

module.exports = { transformFICOToReportData };
