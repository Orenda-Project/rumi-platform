/**
 * Table of Contents Loading Service
 *
 * Loads manually-curated ToC JSON into the textbook_toc table.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

class TocLoadingService {
  /**
   * Load ToC data into textbook_toc table
   * @param {string} curriculum - e.g. 'punjab_snc_2020'
   * @param {number} grade
   * @param {string} subject
   * @param {Array<Object>} tocData - Array of chapter objects
   * @returns {Promise<{chaptersLoaded: number, errors: Array}>}
   */
  static async loadToc(curriculum, grade, subject, tocData) {
    const errors = [];
    let chaptersLoaded = 0;

    try {
      for (const chapter of tocData) {
        const row = {
          curriculum,
          grade,
          subject,
          chapter_number: chapter.chapter,
          chapter_title: chapter.title,
          page_start: chapter.page_start,
          page_end: chapter.page_end,
          estimated_days: chapter.days || 5,
          topic_keywords: chapter.topic_keywords || []
        };

        const { error } = await supabase
          .from('textbook_toc')
          .insert(row);

        if (error) {
          errors.push({ chapter: chapter.chapter, error: error.message });
          logToFile('ToC insert error', { chapter: chapter.chapter, error: error.message });
        } else {
          chaptersLoaded++;
        }
      }

      logToFile('ToC loading complete', { curriculum, grade, subject, chaptersLoaded, errorCount: errors.length });
      return { chaptersLoaded, errors };
    } catch (error) {
      logToFile('ToC loading failed', { error: error.message });
      return { chaptersLoaded, errors: [...errors, { error: error.message }] };
    }
  }
}

module.exports = TocLoadingService;
