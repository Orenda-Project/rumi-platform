/**
 * OCR Service for Exam Checker
 *
 * A thin adapter over the exam-vision engine (exam-vision.service.js): it reads
 * each page with Call A and maps the result into the OCR shape the question
 * detector and the worker already use. Each question carries its answer box
 * (box_2d) and script, so grading can hand the box on to the annotator.
 *
 * Created: 2026-01-24
 * Updated: 2026-10-19 (reads with the exam-vision engine)
 */

const { readExamFile, isOwnBucketUrl } = require('./exam-storage');
const { logToFile } = require('../../utils/logger');
const { redactUrl } = require('../../utils/redact-url');
const examVision = require('./exam-vision.service');

/**
 * exam_check_sessions.ocr_provider is varchar(20), and a model id
 * ("google/gemini-3.5-flash" is 23 characters) overflows it. Store the model
 * without its vendor prefix, capped at 20; the full id is kept in
 * metadata.engine.
 */
function shortProvider(model) {
  return String(model || 'exam-vision').split('/').pop().slice(0, 20);
}

/**
 * Turn an image reference into something the vision model can read. The model
 * can open neither our private bucket nor a file on this machine (the photo is
 * kept on local disk when R2 is not configured), so for those read the bytes
 * and send them inline as a data URL. Any other URL passes through untouched.
 */
async function resolveImageForVision(imageUrl) {
  if (!imageUrl.startsWith('file://') && !isOwnBucketUrl(imageUrl)) return imageUrl;
  const buffer = await readExamFile(imageUrl);
  const ext = (imageUrl.split('?')[0].split('.').pop() || 'jpeg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return examVision.toDataUrl(buffer, mime);
}

class OCRService {
  /**
   * Extract text from a batch of images
   * @param {Array} images - Array of image objects with url property
   * @returns {object} { pages, provider, averageConfidence, successRate, totalPages, successfulPages }
   */
  static async extractBatch(images) {
    if (!images || images.length === 0) {
      throw new Error('No images provided for OCR');
    }

    logToFile('🔍 Starting batch OCR (exam-vision)', { imageCount: images.length });

    const results = [];
    let provider = null;
    let totalConfidence = 0;
    let successCount = 0;

    for (const image of images) {
      const pageNumber = image.pageNumber || results.length + 1;
      try {
        const result = await this.extractSingle(image.url);
        results.push({ pageNumber, ...result, success: true });
        totalConfidence += result.confidence || 0.8;
        successCount++;
        provider = result.provider || provider;
      } catch (error) {
        logToFile('⚠️ OCR failed for image', { pageNumber, error: error.message });
        results.push({ pageNumber, success: false, error: error.message });
      }
    }

    return {
      pages: results,
      provider: provider || shortProvider(null),
      averageConfidence: successCount > 0 ? totalConfidence / successCount : 0,
      successRate: successCount / images.length,
      totalPages: images.length,
      successfulPages: successCount,
    };
  }

  /**
   * Read a single page with the exam-vision engine and map it into the OCR
   * result shape.
   * @param {string} imageUrl - URL of the image
   * @returns {object} { studentName, rollNumber, grade, subject, questions[], rawText, metadata, provider, confidence }
   */
  static async extractSingle(imageUrl) {
    logToFile('🔍 Reading exam page', { imageUrl: redactUrl(imageUrl) });
    const visionUrl = await resolveImageForVision(imageUrl);
    const page = await examVision.readPageWithEscalation(visionUrl);
    const meta = page.page_meta || {};
    // Call A tags the name / class / date header as items with ids like
    // `student_name_ur` or `student_meta_en`. They are not questions and must
    // not be graded (graded against themselves, they come back "correct").
    const items = (page.items || []).filter(it => !OCRService._isHeaderItem(it));

    const questions = items.map((it, i) => ({
      number: it.question_id || String(i + 1),
      questionText: it.question_text || '',
      studentAnswer: it.answer_text_verbatim || '',
      box_2d: Array.isArray(it.box_2d) ? it.box_2d : null,
      script: it.script || 'en',
      confidence: it.confidence ?? 0.8,
    }));

    const rawText = questions.map(q => `${q.number}. ${q.studentAnswer}`).join('\n');
    const avgConf = questions.length
      ? questions.reduce((s, q) => s + (q.confidence || 0), 0) / questions.length
      : 0.5;

    return {
      studentName: meta.student_name || null,
      rollNumber: meta.roll_number || null,
      grade: meta.grade || null,
      subject: meta.subject || null,
      questions,
      rawText,
      metadata: { language: questions[0]?.script || 'en', engine: page._model },
      provider: shortProvider(page._model),
      confidence: avgConf,
    };
  }

  /**
   * Is this Call A item the name / class / date header rather than a question?
   * Call A tags those with ids like `student_name_ur`; a bare "Name / Class /
   * Date" question text is caught too.
   */
  static _isHeaderItem(it) {
    const id = String(it?.question_id || '').toLowerCase();
    if (/^student[_-]?(name|meta|info|header)/.test(id)) return true;
    const text = String(it?.question_text || '').trim().toLowerCase();
    if (/^name\b/.test(text) && /(class|date|subject|roll)/.test(text)) return true;
    return false;
  }
}

module.exports = OCRService;
