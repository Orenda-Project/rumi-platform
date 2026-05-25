/**
 * Topic Matching Service
 *
 * Matches a teacher's topic request to a textbook chapter
 * using keyword lookup in textbook_toc.topic_keywords.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');

class TopicMatchingService {
  /**
   * Find a chapter by topic keyword match
   * @param {Object} input
   * @param {string} input.topic - Teacher's topic (e.g. 'fractions', 'kasoor')
   * @param {number} input.grade
   * @param {string} input.subject
   * @param {string} input.curriculum
   * @returns {Promise<Object|null>} Matched chapter or null
   */
  static async findChapterByTopic({ topic, grade, subject, curriculum }) {
    try {
      const normalizedTopic = topic.toLowerCase().trim();

      // Step 1: Exact keyword match via Postgres contains
      const { data, error } = await supabase
        .from('textbook_toc')
        .select('*')
        .eq('curriculum', curriculum)
        .contains('topic_keywords', [normalizedTopic])
        .limit(1);

      if (error) {
        logToFile('Topic matching query error', { error: error.message, topic, curriculum });
        return null;
      }

      if (data && data.length > 0) {
        logToFile('Topic matched via keyword', { topic, chapter: data[0].chapter_title });
        return data[0];
      }

      // Step 2: ILIKE fallback — partial match
      const { data: ilikeData, error: ilikeError } = await supabase
        .from('textbook_toc')
        .select('*')
        .eq('curriculum', curriculum)
        .ilike('chapter_title', `%${normalizedTopic}%`)
        .limit(1);

      if (ilikeError) {
        logToFile('Topic ILIKE query error', { error: ilikeError.message, topic });
        return null;
      }

      if (ilikeData && ilikeData.length > 0) {
        logToFile('Topic matched via ILIKE fallback', { topic, chapter: ilikeData[0].chapter_title });
        return ilikeData[0];
      }

      logToFile('No topic match found', { topic, grade, subject, curriculum });
      return null;
    } catch (error) {
      logToFile('Topic matching error', { error: error.message, topic });
      return null;
    }
  }
}

module.exports = TopicMatchingService;
