/**
 * Pic-to-LP Classifier Service
 *
 * Single-shot vision call that decides whether an incoming WhatsApp image
 * is a textbook page worth offering "Generate Lesson Plan" buttons for, or
 * something else (classroom photo, student work, exam, screenshot, sticker).
 *
 * Returns one of:
 *   BOOK_PAGE     — printed textbook / workbook page
 *   CLASSROOM     — wide shot of a classroom scene
 *   STUDENT_WORK  — handwritten work, notebook, worksheet filled by student
 *   EXAM          — printed exam paper / question paper
 *   OTHER         — sticker, screenshot, selfie, anything else
 *
 * Plus a confidence score (0..1). Callers should treat anything < 0.6 as OTHER
 * to avoid annoying false-positive "Generate LP" prompts.
 */

const OpenAI = require('openai');
const { logToFile } = require('../../utils/logger');
const { OPENAI_API_KEY } = require('../../utils/constants');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const VALID_TYPES = ['BOOK_PAGE', 'CLASSROOM', 'STUDENT_WORK', 'EXAM', 'OTHER'];
const MODEL = process.env.PIC_LP_CLASSIFIER_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 15000;

/**
 * Classify an incoming image.
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {string} caption  optional WhatsApp caption text
 * @returns {Promise<{type: string, confidence: number}>}
 */
async function classifyImageType(imageBuffer, mimeType, caption = '') {
  try {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    const systemPrompt = [
      'You classify WhatsApp images sent to a teacher-support bot.',
      'Return ONE of: BOOK_PAGE, CLASSROOM, STUDENT_WORK, EXAM, OTHER.',
      '',
      'Definitions:',
      '- BOOK_PAGE: printed textbook or workbook page (typeset, includes exercises, headings, page number).',
      '- CLASSROOM: wide-angle photo of a classroom, students, blackboard, classroom setup.',
      '- STUDENT_WORK: handwritten work in a notebook, filled-in worksheet, student answers.',
      '- EXAM: printed exam paper, formal question paper with marks/instructions.',
      '- OTHER: screenshot, selfie, sticker, meme, document not in the above buckets.',
      '',
      'Reply ONLY with strict JSON: {"type": "...", "confidence": 0.0-1.0}.',
      'No prose, no markdown.',
    ].join('\n');

    const userText = caption
      ? `Caption from sender: "${caption.substring(0, 200)}"`
      : '(No caption)';

    const completion = await openai.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
        max_tokens: 60,
        temperature: 0,
        response_format: { type: 'json_object' },
      },
      { timeout: TIMEOUT_MS }
    );

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logToFile('⚠️ Pic-LP classifier returned non-JSON, defaulting OTHER', { raw });
      return { type: 'OTHER', confidence: 0 };
    }

    let type = String(parsed.type || '').toUpperCase();
    if (!VALID_TYPES.includes(type)) type = 'OTHER';
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    return { type, confidence };
  } catch (error) {
    logToFile('❌ Pic-LP classifier failed', { error: error.message });
    return { type: 'OTHER', confidence: 0 };
  }
}

module.exports = { classifyImageType, VALID_TYPES };
