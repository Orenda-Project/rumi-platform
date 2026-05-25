/**
 * Curriculum Lesson Plan handler — the curriculum/pre-gen serve path.
 *
 * Given a topic, tries to match it to a textbook chapter and serve a
 * pre-generated lesson-plan PDF from R2 instantly. If there's no chapter match
 * or no pre-generated LP, it returns { source: 'page_prompt' } so the caller
 * falls through to the normal Gamma generation flow.
 *
 * Only invoked for regions whose region_features enable curriculum LPs.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const TopicMatchingService = require('../services/topic-matching.service');
const PreGenLookupService = require('../services/pregen-lookup.service');
const { downloadFromR2 } = require('../storage/r2');
const WhatsAppService = require('../services/whatsapp.service');
const { logToFile } = require('../utils/logger');

/**
 * @param {object} input
 * @param {string} input.userId        WhatsApp id to send the document to
 * @param {string} [input.topic]
 * @param {number} [input.grade]
 * @param {string} [input.subject]
 * @param {string} input.curriculum    region_features.curriculum_key
 * @param {string} [input.language]    'ur' selects the Urdu PDF, else English
 * @returns {Promise<{ source: 'pre_generated'|'page_prompt', promptedForPage: boolean }>}
 */
async function handleCurriculumLessonPlan({ userId, topic, grade, subject, curriculum, language }) {
  try {
    if (!topic || !curriculum) return { source: 'page_prompt', promptedForPage: true };

    const chapter = await TopicMatchingService.findChapterByTopic({ topic, grade, subject, curriculum });
    if (!chapter) {
      logToFile('Curriculum LP: no chapter match, falling through to Gamma', { topic, curriculum });
      return { source: 'page_prompt', promptedForPage: true };
    }

    const preGen = await PreGenLookupService.findPreGenLP({
      chapterNumber: chapter.chapter_number, grade, subject, curriculum,
    });
    const langCol = language === 'ur' ? 'pdf_r2_key_ur' : 'pdf_r2_key_en';
    const r2Key = preGen && preGen[langCol];
    if (!r2Key) {
      logToFile('Curriculum LP: no pre-generated LP, falling through to Gamma', { chapter: chapter.chapter_number });
      return { source: 'page_prompt', promptedForPage: true };
    }

    // OSS sendDocument reads a file path (createReadStream), so write the R2
    // buffer to a temp file first, then clean it up (guards the bd-1349 trap
    // where passing a Buffer to a path-expecting sender silently fails).
    let tmpPath;
    try {
      const pdfBuffer = await downloadFromR2(r2Key);
      tmpPath = path.join(os.tmpdir(), `curriculum_lp_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpPath, pdfBuffer);
      await WhatsAppService.sendDocument(userId, tmpPath, `${chapter.chapter_title} - Lesson Plan.pdf`);
      logToFile('Curriculum LP: pre-generated LP served', { chapter: chapter.chapter_number, r2Key });
      return { source: 'pre_generated', promptedForPage: false };
    } finally {
      if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort cleanup */ } }
    }
  } catch (error) {
    logToFile('Curriculum LP handler error, falling through to Gamma', { error: error.message, userId, topic });
    return { source: 'page_prompt', promptedForPage: true };
  }
}

module.exports = handleCurriculumLessonPlan;
