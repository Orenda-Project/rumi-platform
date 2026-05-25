/**
 * Metadata Extractor
 *
 * Single vision call over all collected pages + the original caption. Returns
 * best-effort {grade, subject, topic, ocr_text}. Any field may be null —
 * the WhatsApp Flow form lets the teacher fill the gaps and edit the rest.
 */

const OpenAI = require('openai');
const axios = require('axios');
const { logToFile } = require('../../utils/logger');
const { OPENAI_API_KEY } = require('../../utils/constants');
// Presign R2 URLs before passing to OpenAI vision. The R2 bucket is private —
// raw URLs return 400 from OpenAI's image download. Without the presign the
// metadata extractor silently fails (the form just opens with blank pre-fills
// and the teacher fills them in manually).
const { getPresignedUrl } = require('../../storage/r2');

const { extractFromCaption, mergeWithCaption } = require('./caption-prefill');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const MODEL = process.env.PIC_LP_EXTRACTOR_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 45000;

// Broad subject superset across common primary curricula. The vision pass
// validates `subject` against this list. The Flow dropdown picks the
// deployment-appropriate sub-list at form-open time via
// flow-options.buildSubjects(region).
const VALID_SUBJECTS = [
  'Math', 'Mathematics', 'English', 'Urdu', 'Science', 'Social Studies',
  'Sindhi', 'Islamiat', 'General Knowledge', 'Kiswahili',
  'Civics & Moral Education', 'Religious Education', 'Languages',
  'Vocational Skills', 'Other',
];

/**
 * Parse "Grade N" / "Grade N-M" / "Class N" → integer (1..12). Returns null if unparseable.
 * Used by the user-context fallback chain when the vision pass returned grade=null.
 * Range like "Grade 4-5" → 4 (lower bound is the safer default — won't make the LP harder
 * than the teacher actually teaches).
 */
function parseRegisteredGrade(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/(?:grade|class)\s*(\d{1,2})/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return n;
}

/**
 * @param {Array<{url: string, mime: string}>} pages
 * @param {string} caption
 * @param {object} [userContext] - { registeredGrade: string, preferredLanguage: string }
 *   When the vision pass returns null for grade/language, fall back to the teacher's
 *   registered values so the WhatsApp Flow form doesn't open with empty required fields.
 *   Fallback precedence: caption pre-fill > LLM extraction > userContext fallback.
 * @returns {Promise<{grade: number|null, subject: string|null, topic: string|null,
 *                    language: string|null, ocr_text: string}>}
 */
async function extract(pages, caption = '', userContext = null) {
  // Regex pre-pass over the caption — caption-derived fields flow into the
  // final result even if the LLM extractor fails or returns nulls. Without it,
  // an LLM timeout loses the caption hint and the form opens with empty
  // dropdowns. The caption pre-fill now survives that case.
  const captionPrefill = extractFromCaption(caption);

  // User-context fallback for grade/language when vision misses them. If a clean
  // OCR returns grade=null + language=null, the form would otherwise open with
  // empty required fields and the teacher may abandon. With this fallback the
  // form opens with the teacher's registered grade + preferred language.
  const applyUserContextFallbacks = (result) => {
    if (!userContext) return result;
    const out = { ...result };
    if (out.grade == null) {
      const fallbackGrade = parseRegisteredGrade(userContext.registeredGrade);
      if (fallbackGrade != null) out.grade = fallbackGrade;
    }
    if (out.language == null && userContext.preferredLanguage) {
      out.language = userContext.preferredLanguage;
    }
    return out;
  };

  if (!pages || pages.length === 0) {
    const merged = mergeWithCaption({ grade: null, subject: null, topic: null, ocr_text: '' }, captionPrefill);
    return applyUserContextFallbacks(merged);
  }

  try {
    // Presign each R2 URL (1-hour TTL is plenty — the vision call resolves in
    // <45s typical). Without the presign, OpenAI returns 400.
    const presignedPages = await Promise.all(
      pages.slice(0, 5).map(async (p) => ({
        ...p,
        url: await getPresignedUrl(p.url, 3600),
      }))
    );
    const imageContent = presignedPages.map((p) => ({
      type: 'image_url',
      image_url: { url: p.url, detail: 'high' },
    }));

    const systemPrompt = [
      'You read photographed primary-school textbook pages and extract structured metadata.',
      '',
      'Return STRICT JSON ONLY with this exact shape:',
      '{',
      '  "grade": integer 1..12 or null,',
      '  "subject": one of [' + VALID_SUBJECTS.map(s => `"${s}"`).join(', ') + '] or null,',
      '  "topic": short topic title (under 80 chars) or null,',
      '  "ocr_text": full readable text of all pages, joined with \\n\\n between pages',
      '}',
      '',
      'Rules:',
      '- "grade" is the class/grade the textbook is for. Look for "Class 5", "Grade 3", page headers, etc. If unclear, null.',
      '- "subject" is the school subject. Use only one of the listed subjects. If unclear, null.',
      '- "topic" is the chapter or lesson title. Keep it natural — use the exact wording printed on the page if possible. Translate to English if printed in another script.',
      '- "ocr_text" preserves the original script (e.g. Urdu, Sindhi, English). Include exercise text, examples, instructions. Skip page numbers and footers.',
      '',
      'Use the caption as a hint but do not over-trust it.',
      'No prose, no markdown — JSON only.',
    ].join('\n');

    const userText = [
      caption ? `Sender caption: "${caption.substring(0, 500)}"` : '(No caption)',
      `Number of pages: ${pages.length}`,
    ].join('\n');

    const completion = await openai.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [{ type: 'text', text: userText }, ...imageContent],
          },
        ],
        max_tokens: 4000,
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
      logToFile('⚠️ Pic-LP extractor returned non-JSON', { raw: raw.substring(0, 200) });
      return applyUserContextFallbacks(mergeWithCaption({ grade: null, subject: null, topic: null, ocr_text: '' }, captionPrefill));
    }

    const grade = parsed.grade && Number.isInteger(parsed.grade) && parsed.grade >= 1 && parsed.grade <= 12
      ? parsed.grade
      : null;
    const subject = VALID_SUBJECTS.includes(parsed.subject) ? parsed.subject : null;
    const topic = typeof parsed.topic === 'string' && parsed.topic.trim().length > 0
      ? parsed.topic.trim().substring(0, 120)
      : null;
    const ocr_text = typeof parsed.ocr_text === 'string' ? parsed.ocr_text : '';

    // Caption-derived values WIN over the LLM where both produced a value
    // (the teacher's explicit ask outranks our inference from the page).
    let merged = mergeWithCaption({ grade, subject, topic, ocr_text }, captionPrefill);

    // User-context fallback fires after caption+LLM. Only fills NULL slots.
    merged = applyUserContextFallbacks(merged);

    logToFile('📚 Pic-LP metadata extracted', {
      grade: merged.grade, subject: merged.subject, topic: merged.topic,
      language: merged.language,
      ocrTextLength: merged.ocr_text.length,
      pageCount: pages.length,
      captionContributed: !!(captionPrefill.grade || captionPrefill.subject || captionPrefill.topic || captionPrefill.language),
      userContextApplied: !!userContext,
    });

    return merged;
  } catch (error) {
    logToFile('❌ Pic-LP metadata extraction failed (caption pre-fill still applies)', { error: error.message });
    return applyUserContextFallbacks(mergeWithCaption({ grade: null, subject: null, topic: null, ocr_text: '' }, captionPrefill));
  }
}

module.exports = { extract, VALID_SUBJECTS };
