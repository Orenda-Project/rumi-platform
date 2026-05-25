'use strict';
// Insight builder for quiz reports.
//
// Replaces the generic GPT-4o-mini paragraph in quiz-report.service.js with
// a structured, score-band-driven insight that:
//   - classifies the quiz into Strong / Mixed / Weak
// - reads the most-missed question's distractor cluster ( column)
//   - names the misconception when there's a cluster
//   - composes both a one-line caption (for the WhatsApp PDF caption) and a
//     deeper body (for the PDF Teaching Insight panel + a follow-up message)
//   - emits band-specific buttons routing to the follow-up LP system
// ( will wire those buttons; this service just emits the IDs)
//
// Pure-function, no LLM in the hot path. The legacy LLM path remains as
// a fallback only when topMissed is empty (every student got everything
// right — Strong band only).

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');

const BANDS = { STRONG: 'strong', MIXED: 'mixed', WEAK: 'weak' };

/**
 * Score band per the plan §6.4 / WS-C:
 *   Strong: avg ≥ 80% AND ≥ 70% mastered
 *   Weak:   avg < 60% OR  < 30% mastered
 *   Mixed:  everything else
 */
function classifyBand({ avgScore, masteredCount, totalCompleted }) {
  if (totalCompleted === 0) return BANDS.MIXED;
  const masteredPct = masteredCount / totalCompleted;
  if (avgScore >= 80 && masteredPct >= 0.7) return BANDS.STRONG;
  if (avgScore < 60 || masteredPct < 0.3) return BANDS.WEAK;
  return BANDS.MIXED;
}

/**
 * Friendly relative-time formatter for chat captions.
 * "yesterday 4:15 PM" / "2 hours ago" / "30 minutes ago"
 */
function formatRelativeTime(iso) {
  if (!iso) return 'recently';
  const sentMs = new Date(iso).getTime();
  const nowMs = Date.now();
  const diffMin = Math.floor((nowMs - sentMs) / 60000);
  if (diffMin < 60) return `${Math.max(1, diffMin)} minutes ago`;
  if (diffMin < 24 * 60) {
    const hrs = Math.floor(diffMin / 60);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  }
  // ≥ 24h ago — give the date
  const d = new Date(iso);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) +
         ' ' + d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Build the structured insight for a quiz report.
 *
 * @param {Object}  args
 * @param {Object}  args.quiz             { id, topic, grade, created_at }
 * @param {string}  args.classDisplay     "5-A"
 * @param {number}  args.totalSent        derived from session count, NOT total_students_sent
 * @param {number}  args.totalCompleted
 * @param {Object}  args.stats            { avgScore, masteredCount, developingCount, needsPracticeCount }
 * @param {Array} args.topMissed from _buildTopMissedQuestions ( cluster surfacing)
 * @param {Array}   args.stragglerNames   completed sessions with mastery_percentage < 60
 * @returns {{ band, contextLine, caption, body, buttons }}
 */
function buildInsight({ quiz, classDisplay, totalSent, totalCompleted, stats, topMissed, stragglerNames = [] }) {
  const safeStats = stats || {};
  const band = classifyBand({
    avgScore: safeStats.avgScore || 0,
    masteredCount: safeStats.masteredCount || 0,
    totalCompleted: totalCompleted || 0
  });

  const sentRel = formatRelativeTime(quiz?.created_at);
  const contextLine = `${classDisplay || '?'} · ${quiz?.topic || '?'} · sent ${sentRel}`;

  const caption = buildCaption({ band, contextLine, totalSent, totalCompleted, avgScore: safeStats.avgScore });
  const body    = buildBody({ band, quiz, topMissed: topMissed || [], stragglerNames, totalCompleted });
  const buttons = buildButtons({ band, quizId: quiz?.id });

  return { band, contextLine, caption, body, buttons };
}

function buildCaption({ band, contextLine, totalSent, totalCompleted, avgScore }) {
  const completion = `${totalCompleted}/${totalSent}`;
  const avg = avgScore != null ? `avg ${avgScore}%` : '';
  if (band === BANDS.STRONG) {
    return `🌟 ${contextLine}. ${completion} done · ${avg} · class mastered this.`.trim();
  }
  if (band === BANDS.WEAK) {
    return `📚 ${contextLine}. ${completion} done · ${avg} · time for a different angle.`.trim();
  }
  return `📈 ${contextLine}. ${completion} done · ${avg} · productive struggle zone.`.trim();
}

function buildBody({ band, quiz, topMissed, stragglerNames, totalCompleted }) {
  const cluster = topMissed[0] || null;          // most-missed question
  const haveCluster = !!(cluster && cluster.top_wrong_option && cluster.misconception_feedback);

  const stragglerLine = stragglerNames.length > 0
    ? `\n\nNames to check on during seatwork: ${stragglerNames.join(', ')}.`
    : '';

  if (band === BANDS.STRONG) {
    // Strong: don't re-anchor — extension territory.
    const lead = totalCompleted >= 3
      ? `Most of your class mastered ${quiz.topic}. Don't re-cover this — extend.`
      : `Looks strong so far on ${quiz.topic}.`;
    const body = `${lead} Pick an extension activity that pushes deeper, or use this as a bridge into the next topic.${stragglerLine}`;
    return body;
  }

  if (band === BANDS.WEAK) {
    if (haveCluster) {
      // Weak + cluster: name the misconception, recommend a different angle.
      const phrasing = cluster.misconception_source === 'distractor'
        ? `Most who got it wrong picked **${cluster.top_wrong_option}** (${cluster.top_wrong_text}) — that suggests ${cluster.misconception_feedback.toLowerCase()}.`
        : `Most who got it wrong picked **${cluster.top_wrong_option}** — review the explanation in the next lesson.`;
      return `Class scored low on ${quiz.topic}. The most-missed question was: "${cluster.question_text}" ${phrasing} Time to re-introduce this concept using a different model — concrete-pictorial-abstract or a hands-on hook.${stragglerLine}`;
    }
    return `Class scored low on ${quiz.topic}. The wrong answers spread across options, so the gap isn't one specific misconception — they need the concept reset using a different model from the original lesson.${stragglerLine}`;
  }

  // Mixed
  if (haveCluster) {
    const phrasing = cluster.misconception_source === 'distractor'
      ? `Most who got it wrong picked **${cluster.top_wrong_option}** (${cluster.top_wrong_text}) — that suggests ${cluster.misconception_feedback.toLowerCase()}.`
      : `Most who got it wrong picked **${cluster.top_wrong_option}** — review the explanation in the next lesson.`;
    return `Productive struggle zone on ${quiz.topic}. The most-missed question: "${cluster.question_text}" ${phrasing} A 5-minute revision before tomorrow's lesson should lock it in.${stragglerLine}`;
  }
  return `Productive struggle zone on ${quiz.topic}. Wrong answers were spread across options, so no one shared misconception jumps out. A short revision of the most-missed question before tomorrow's lesson is still worth doing.${stragglerLine}`;
}

function buildButtons({ band, quizId }) {
  // Button IDs match the wiring in whatsapp-bot.js. Keeping them
  // deterministic here so frontend (portal modal) can use the same IDs.
  if (band === BANDS.STRONG) {
    return [
      { id: `quiz_extend_${quizId}`,   title: 'Extension lesson' },
      { id: `quiz_bridge_${quizId}`,   title: 'Bridge to next topic' },
      { id: 'quiz_skip_followup',      title: 'Skip' }
    ];
  }
  // Mixed / Weak both offer the dual revision flow
  return [
    { id: `quiz_revise_next_${quizId}`, title: 'Revise + next topic' },
    { id: `quiz_revise_only_${quizId}`, title: 'Just the revision' },
    { id: 'quiz_skip_followup',         title: 'Skip' }
  ];
}

/**
 * helper — load prior LP context for follow-up LP generation.
 * Returns null when the quiz wasn't sourced from an LP (free-typed topic).
 */
async function loadPriorLPContext(quizId) {
  if (!quizId) return null;
  try {
    const { data: row } = await supabase
      .from('quizzes')
      .select(`
        lesson_plan_id,
        lesson_plans (
          id, topic, type, content, textbook_metadata, lesson_plan_structured
        )
      `)
      .eq('id', quizId)
      .single();
    if (!row?.lesson_plans) return null;
    const lp = row.lesson_plans;
    const activities = lp.textbook_metadata?.activities
                    || lp.lesson_plan_structured?.activities
                    || lp.content?.activities
                    || [];
    return {
      id: lp.id,
      topic: lp.topic,
      type: lp.type,
      activities,
      comingUp: lp.textbook_metadata?.comingUp || [],
      source: lp.type
    };
  } catch (err) {
    logToFile('⚠️ loadPriorLPContext failed', { quizId, error: err.message });
    return null;
  }
}

/**
 * helper — names of students who scored below 60% on this quiz.
 * Phrased as "students to check on during seatwork", never deficit framing.
 */
async function loadStragglerNames(quizId) {
  if (!quizId) return [];
  try {
    const { data: rows } = await supabase
      .from('quiz_sessions')
      .select('mastery_percentage, students(student_name)')
      .eq('quiz_id', quizId)
      .eq('status', 'completed')
      .lt('mastery_percentage', 60);
    return (rows || []).map(r => r.students?.student_name).filter(Boolean);
  } catch (err) {
    logToFile('⚠️ loadStragglerNames failed', { quizId, error: err.message });
    return [];
  }
}

module.exports = {
  BANDS,
  classifyBand,
  formatRelativeTime,
  buildInsight,
  buildCaption,
  buildBody,
  buildButtons,
  loadPriorLPContext,
  loadStragglerNames
};
