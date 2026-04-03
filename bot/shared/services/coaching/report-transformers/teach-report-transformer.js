/**
 * Teach Report Data Transformer
 *
 * Transforms World Bank Teach analysis into the generic reportData shape
 * consumed by pdf-report.service.js.
 *
 * 3 areas + Time on Task → 4 goals, elements → criteria, holistic 1-5,
 * behavior L/M/H ratings in evidence text. No debrief, no LP bonus.
 *
 * Bead: bd-606 (Phase 1C-A2)
 */

const { formatDate, extractFidelity, buildPartialNote } = require('./_shared');

const AREA_CONFIG = [
  { key: 'classroom_culture', title: 'Area 1: Classroom Culture' },
  { key: 'instruction', title: 'Area 2: Instruction' },
  { key: 'socioemotional', title: 'Area 3: Socioemotional Skills' },
];

const ELEMENT_MAX = 5;
const MAX_MARKS = 50;

/**
 * Build a summary of behavior ratings for a Teach element.
 * @param {Array} behaviors - Array of { name, rating, evidence }
 * @returns {string} Summary like "Treats all respectfully: H, Positive language: M"
 */
function buildBehaviorSummary(behaviors) {
  if (!behaviors || !behaviors.length) return '';
  return behaviors
    .map(b => `${b.name}: ${b.rating}`)
    .join(', ');
}

/**
 * Transform Teach analysis into generic report data.
 * @param {object} session - Coaching session record
 * @param {string} teacherName - Teacher's full name
 * @param {object} analysis - Teach analysis from GPT
 * @returns {object} Report data in the generic shape for PDF rendering
 */
function transformTeachToReportData(session, teacherName, analysis) {
  const goals = [];

  // Time on Task as its own goal
  const totScore = analysis.time_on_task?.score || 0;
  goals.push({
    title: 'Time on Task',
    score: totScore,
    maxScore: ELEMENT_MAX,
    criteria: [{
      name: 'Time on Task',
      score: totScore,
      max: ELEMENT_MAX,
      evidence: analysis.time_on_task?.evidence || 'No evidence provided',
      timestamp: null,
    }],
  });

  // 3 areas with elements → criteria
  for (const { key, title } of AREA_CONFIG) {
    const area = analysis.areas?.[key];
    if (!area) continue;

    goals.push({
      title,
      score: area.area_score || 0,
      maxScore: area.area_max || 0,
      criteria: (area.elements || []).map(el => {
        const behaviorSummary = buildBehaviorSummary(el.behaviors);
        const evidenceWithBehaviors = behaviorSummary
          ? `Behaviors: ${behaviorSummary}`
          : 'No evidence provided';

        return {
          name: el.name,
          score: el.holistic_score || 0,
          max: ELEMENT_MAX,
          evidence: evidenceWithBehaviors,
          timestamp: null,
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
    frameworkDisplayName: 'Teach Framework',
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

module.exports = { transformTeachToReportData };
