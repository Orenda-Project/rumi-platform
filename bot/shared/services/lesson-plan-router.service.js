/**
 * Lesson Plan Router — decides which LP path a text-based LP request takes.
 *
 * Two tracks (the photo path, pic-to-LP, is handled separately by the image
 * handler, not here):
 *   - gamma_enriched   : curriculum/textbook-aligned LP. Used only when the
 *                        teacher's region enables curriculum LPs (region_features),
 *                        has textbooks for the subject, and a page anchor is given.
 *                        The handler then serves a pre-generated LP if one exists,
 *                        else generates an enriched one from textbook content.
 *   - gamma_standard   : the default — generate a generic Gamma LP from the topic.
 *
 * Gating is DB-driven via region_features (no hardcoded regions). There is no
 * external on-demand service (the old UG_LP path is intentionally gone).
 */

const { logToFile } = require('../utils/logger');
const { getRegionFeatures } = require('./region-features.service');

class LessonPlanRouterService {
  /**
   * @param {object} params
   * @param {string} [params.userId]
   * @param {string} params.region
   * @param {number} [params.grade]
   * @param {string} [params.subject]
   * @param {number|string|null} [params.pageNumber]
   * @returns {Promise<{ track: 'gamma_enriched'|'gamma_standard', reason: string }>}
   */
  static async route({ userId, region, grade, subject, pageNumber }) {
    const subjectLower = (subject || '').toLowerCase().trim();
    const gradeNum = Number(grade);
    const hasPage = pageNumber != null && pageNumber !== '';

    const features = await getRegionFeatures(region);
    const subjectSupported =
      !Array.isArray(features.supported_subjects) ||
      features.supported_subjects.length === 0 ||
      features.supported_subjects.map((s) => String(s).toLowerCase()).includes(subjectLower);

    if (features.curriculum_lp_enabled && features.has_textbooks && hasPage && subjectSupported) {
      const reason = `region "${features.region}" curriculum LP enabled — ${subjectLower || 'subject'} grade ${gradeNum} page ${pageNumber}`;
      logToFile('LP Router: gamma_enriched (curriculum path)', { userId, region: features.region, reason });
      return { track: 'gamma_enriched', reason };
    }

    const reason = features.curriculum_lp_enabled
      ? `region "${features.region}" curriculum enabled but conditions unmet (need page + supported subject) — default Gamma`
      : `region "${features.region}" curriculum LP not enabled — default Gamma`;
    logToFile('LP Router: gamma_standard', { userId, region: features.region, reason });
    return { track: 'gamma_standard', reason };
  }
}

module.exports = LessonPlanRouterService;
