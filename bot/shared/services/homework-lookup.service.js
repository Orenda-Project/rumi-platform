/**
 * Homework Chapter Lookup Service
 *
 * Supabase read with soft-fail. Resolves a teacher's homework selection
 * (grade × subject × chapters) to the R2 keys the bundle worker will
 * pdf-lib-merge. Source table: homework_chapters.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

const DEFAULT_VERSION = 'v7';

class HomeworkLookupService {
  /**
   * Find all available homework chapters for a grade/subject, ordered by
   * chapter_number. Soft-fails to [] on any error.
   *
   * @param {Object} input
   * @param {number} input.grade
   * @param {string} input.subject
   * @param {string} [input.version='v7']
   * @returns {Promise<Array>} rows: {grade, subject, chapter_number, chapter_title, lang, r2_key, version}
   */
  static async findHomeworkChapters({ grade, subject, version = DEFAULT_VERSION }) {
    try {
      const { data, error } = await supabase
        .from('homework_chapters')
        .select('grade, subject, chapter_number, chapter_title, lang, r2_key, version')
        .eq('grade', grade)
        .eq('subject', subject)
        .eq('version', version)
        .order('chapter_number');

      if (error || !data) {
        logToFile('Homework lookup: no rows / error', {
          grade, subject, version, error: error?.message || null,
        });
        return [];
      }
      return data;
    } catch (err) {
      logToFile('Homework lookup error', { error: err.message, grade, subject });
      return [];
    }
  }

  /**
   * Resolve a multi-select submission to a flat, ordered, deduped list of
   * deliverable chapters with their R2 keys.
   *
   * @param {Array} selections - [{ grade, subject, chapters:[chNum,...] }]
   * @param {string} [version='v7']
   * @returns {Promise<Array>} [{ grade, subject, chapter, chapter_title, r2_key }]
   *          Order: selection group order, then chapter ascending. Unknown
   *          chapters (no matching r2 row) are dropped.
   */
  static async resolveSelection(selections, version = DEFAULT_VERSION) {
    if (!Array.isArray(selections) || selections.length === 0) return [];

    const resolved = [];
    for (const group of selections) {
      if (!group || group.grade == null || !group.subject) continue;

      const available = await this.findHomeworkChapters({
        grade: group.grade,
        subject: group.subject,
        version,
      });
      if (!available.length) continue;

      const byChapter = new Map();
      for (const row of available) byChapter.set(Number(row.chapter_number), row);

      // Dedup requested chapters, preserve ascending order for stable bundles.
      const wanted = Array.from(new Set((group.chapters || []).map(Number)))
        .sort((a, b) => a - b);

      for (const ch of wanted) {
        const row = byChapter.get(ch);
        if (!row || !row.r2_key) continue; // unknown / missing key → drop
        resolved.push({
          grade: Number(row.grade),
          subject: row.subject,
          chapter: Number(row.chapter_number),
          chapter_title: row.chapter_title,
          r2_key: row.r2_key,
        });
      }
    }
    return resolved;
  }
}

module.exports = HomeworkLookupService;
