/**
 * Pre-Generated LP Lookup Service
 *
 * Checks if a pre-generated lesson plan exists for a given chapter.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

class PreGenLookupService {
  /**
   * Find a pre-generated LP for a chapter
   * @param {Object} input
   * @param {number} input.chapterNumber
   * @param {number} input.grade
   * @param {string} input.subject
   * @param {string} input.curriculum
   * @returns {Promise<Object|null>} LP record with pdf_r2_key_en/ur or null
   */
  static async findPreGenLP({ chapterNumber, grade, subject, curriculum }) {
    try {
      const { data, error } = await supabase
        .from('pre_generated_lps')
        .select('pdf_r2_key_en, pdf_r2_key_ur, gamma_url_en, gamma_url_ur, generation_status')
        .eq('curriculum', curriculum)
        .eq('grade', grade)
        .eq('chapter_number', chapterNumber)
        .single();

      if (error || !data) {
        logToFile('No pre-gen LP found', { chapterNumber, grade, subject, curriculum });
        return null;
      }

      if (data.generation_status !== 'completed') {
        logToFile('Pre-gen LP not yet completed', { chapterNumber, status: data.generation_status });
        return null;
      }

      logToFile('Pre-gen LP found', { chapterNumber, hasEn: !!data.pdf_r2_key_en, hasUr: !!data.pdf_r2_key_ur });
      return data;
    } catch (error) {
      logToFile('Pre-gen lookup error', { error: error.message, chapterNumber });
      return null;
    }
  }
}

module.exports = PreGenLookupService;
