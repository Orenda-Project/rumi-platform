/**
 * region-features — the standardized, DB-driven region gating mechanism.
 *
 * A deployment can run different LP behaviour per region WITHOUT code edits:
 * add/edit a row in the `region_features` table and that region's features
 * change. This replaces hardcoded region checks (no `=== 'punjab'`, no
 * phone-number-ID dictionaries).
 *
 *   curriculum_lp_enabled  -> serve pre-generated curriculum LPs for this region
 *   pic_lp_enabled         -> allow photo -> LP for this region
 *   gamma_lp_enabled       -> allow generic Gamma LP (the default path)
 *   default_framework      -> coaching framework default for this region
 *   supported_subjects     -> subjects with curriculum textbooks
 *
 * Fail-open: if the table is empty/unreachable or a region has no row, we
 * return DEFAULT_REGION_FEATURES (generic Gamma LP on, curriculum off) so LP
 * generation never breaks over a missing config row.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

const DEFAULT_REGION_FEATURES = {
  region: 'default',
  curriculum_key: null,
  supported_subjects: [],
  has_textbooks: false,
  curriculum_lp_enabled: false,
  pic_lp_enabled: true,
  gamma_lp_enabled: true,
  default_framework: 'oecd',
  supported_languages: ['en'],
  // Video quizzes ride on the bundled Pakistani-curriculum student video
  // library (English + Urdu). OFF by default; the seed data enables it for
  // region='pakistan'. See docs/features/video-quizzes.md.
  video_quizzes_enabled: false,
};

const _cache = new Map(); // region -> { row, ts }
const TTL_MS = 5 * 60 * 1000;

function _defaultFor(region) {
  return { ...DEFAULT_REGION_FEATURES, region };
}

/**
 * @param {string} region
 * @returns {Promise<object>} the region's features (DB row, or code default)
 */
async function getRegionFeatures(region) {
  const key = (region || 'default').toLowerCase().trim() || 'default';
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.row;

  let row;
  try {
    const { data, error } = await supabase
      .from('region_features')
      .select('*')
      .eq('region', key)
      .maybeSingle();
    row = !error && data ? data : _defaultFor(key);
  } catch (e) {
    logToFile('region-features lookup failed; using default', { region: key, error: e.message });
    row = _defaultFor(key);
  }
  _cache.set(key, { row, ts: Date.now() });
  return row;
}

async function isCurriculumLpEnabled(region) {
  return !!(await getRegionFeatures(region)).curriculum_lp_enabled;
}

async function isPicLpEnabled(region) {
  return (await getRegionFeatures(region)).pic_lp_enabled !== false;
}

/**
 * Region gate for the video-quiz feature (offer-after-video, share codes,
 * friend invites). The quiz corpus is built from the bundled student video
 * library — Pakistani national curriculum content — so it is enabled only for
 * region='pakistan' in the seed data. Other regions: flip the flag in your
 * region_features row once you have a corpus for your own library.
 */
async function isVideoQuizzesEnabled(region) {
  return !!(await getRegionFeatures(region)).video_quizzes_enabled;
}

function _clearCache() {
  _cache.clear();
}

module.exports = {
  getRegionFeatures,
  isCurriculumLpEnabled,
  isPicLpEnabled,
  isVideoQuizzesEnabled,
  DEFAULT_REGION_FEATURES,
  _clearCache,
};
