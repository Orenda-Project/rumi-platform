/**
 * MEWAKA Report Data Transformer
 *
 * Transforms MEWAKA framework analysis_data into the generic reportData
 * shape consumed by the PDF rendering path. Mirrors the shape produced by
 * hots-report-transformer.js where it makes sense, and ADDS three fields
 * that the previous transformer architecture dropped:
 *
 * 1. focusArea — the ONE focus indicator + try-this + lever question.
 * Operator-locked 2026-05-20 as the lead element of every coaching report.
 * 2. strengths — 3 entries surfaced at the TOP LEVEL, not buried in goal
 * criteria. Fix for the PROJ-025 finding that the analyser emits these
 * and the transformer was dropping them before they hit the PDF.
 * 3. growthOpportunities — 2 entries, also previously dropped.
 *
 * Plus `trend` which 's trend service populates (transformer just
 * propagates it through).
 *
 * Bead: (Tanzania Expansion Phase 8.C.1)
 */

const { formatDate } = require('./_shared');

// Domain order + Swahili display names, matched to MEWAKA framework module
const DOMAIN_CONFIG = [
 { key: 'A', name_sw: 'Utangulizi', analysisKey: 'introduction' },
 { key: 'B', name_sw: 'Uwasilishaji wa Maudhui', analysisKey: 'content_delivery' },
 { key: 'C', name_sw: 'Mbinu za Ufundishaji', analysisKey: 'teaching_methods' },
 { key: 'D', name_sw: 'Ushiriki wa Wanafunzi na Mawasiliano', analysisKey: 'learner_involvement' },
 { key: 'E', name_sw: 'Usimamizi wa Darasa', analysisKey: 'classroom_management' },
 { key: 'F', name_sw: 'Hitimisho', analysisKey: 'conclusion' },
];

const MAX_MARKS = 75;

/**
 * Transform MEWAKA analysis into generic report data.
 * @param {object} session - Coaching session record
 * @param {string} teacherName - Teacher's full name
 * @param {object} analysis - MEWAKA analysis from GPT
 * @returns {object} Report data for the new Swahili Playwright template
 */
function transformMEWAKAToReportData(session, teacherName, analysis) {
 const domains = DOMAIN_CONFIG.map(({ key, name_sw, analysisKey }) => {
 const dom = analysis.domains?.[analysisKey];
 const score = dom?.domain_score ?? dom?.area_score ?? 0;
 const max = dom?.domain_max ?? dom?.area_max ?? 0;
 const indicators = (dom?.indicators || []).map(ind => ({
 id: ind.id,
 score: ind.score ?? 0,
 evidenceSw: ind.evidence_sw || ind.evidence || '',
 improvementSw: ind.improvement_sw || ind.improvement || '',
 }));
 return {
 key,
 name_sw,
 score,
 max,
 percentage: max > 0 ? Math.round((score / max) * 100) : 0,
 indicators,
 };
 });

 const totalScore = analysis.scores?.overall_marks ?? domains.reduce((s, d) => s + d.score, 0);
 const overallPercentage = analysis.scores?.overall_percentage ?? Math.round((totalScore / MAX_MARKS) * 100);

 // Focus area — operator-locked as the lead element. Camel-case the snake_case
 // fields so the template can read consistent JS-idiomatic names.
 const focusAreaSrc = analysis.focus_area_sw || analysis.focus_area || null;
 const focusArea = focusAreaSrc ? {
 domain: focusAreaSrc.domain,
 indicator: focusAreaSrc.indicator,
 titleSw: focusAreaSrc.title_sw || focusAreaSrc.title,
 rationaleSw: focusAreaSrc.rationale_sw || focusAreaSrc.rationale,
 tryThisTomorrowSw: focusAreaSrc.try_this_tomorrow_sw || focusAreaSrc.try_this_tomorrow,
 leverQuestionSw: focusAreaSrc.lever_question_sw || focusAreaSrc.lever_question,
 } : null;

 // Strengths + growth — propagate the SW variants if present, fall back to
 // the EN variants if a non-Swahili lesson reaches this path.
 const strengths = (analysis.strengths_sw || analysis.strengths || []).map(s => ({
 titleSw: s.title_sw || s.title,
 evidenceSw: s.evidence_sw || s.evidence,
 anchorIndicator: s.anchor_indicator || s.anchorIndicator,
 }));

 const growthOpportunities = (analysis.growth_opportunities_sw || analysis.growth_opportunities || []).map(g => ({
 areaSw: g.area_sw || g.area,
 rationaleSw: g.rationale_sw || g.rationale,
 strategiesSw: g.strategies_sw || g.strategies || [],
 }));

 const notableMoments = (analysis.notable_moments_sw || analysis.notable_moments || []).map(m => ({
 timestamp: m.timestamp,
 quoteSw: m.quote_sw || m.quote,
 significanceSw: m.significance_sw || m.significance,
 }));

 return {
 framework: 'mewaka',
 language: analysis.language || session.users?.preferred_language || 'sw',
 teacherName,
 observationDate: formatDate(session.created_at),
 subject: session.lesson_plan_structured?.subject || analysis.subject || 'N/A',
 topic: session.lesson_plan_structured?.topic || analysis.topic || 'N/A',
 observerName: 'Rumi',
 frameworkDisplayName: 'MEWAKA — Mafunzo Endelevu ya Walimu Kazini',
 totalScore,
 maxScore: MAX_MARKS,
 overallPercentage,
 performanceBand: analysis.performance_band || null,
 domains,
 focusArea,
 strengths,
 growthOpportunities,
 notableMoments,
 executiveSummarySw: analysis.executive_summary_sw || analysis.executive_summary || '',
 trend: Array.isArray(analysis.trend) ? analysis.trend : [],
 // Photos ( surface-dropped-fields; included now so the template
 // can render them when classroom-photo upload arrives in TZ)
 photos: session.classroom_photos || [],
 };
}

module.exports = { transformMEWAKAToReportData, DOMAIN_CONFIG, MAX_MARKS };
