/**
 * Pic-LP Caption Pre-fill
 *
 * Regex-extract grade / subject / topic / language from the WhatsApp caption
 * a teacher attaches to their textbook photo. Runs BEFORE the LLM extractor —
 * the values it finds flow into the form pre-fill, so even when the LLM call
 * times out the form opens with what the teacher explicitly told us.
 *
 * Example captions (test fixtures live in tests/pic-to-lp/caption-prefill.test.js):
 *   - "Create lesson plan for Class Five, subject Math, topic Adad aur
 *      hisabi awamil, exercise 1.2"
 *   - "Class: Four / Subject: General Science / Topic: Requirement of
 *      energy for life / Medium: Sindhi"
 *   - "Class 6 chapter cellular organization ka lesson plan bnadain"
 *   - "جماعت: پنجم / مضمون: اردو / سبق کا عنوان: حمد"
 *
 * Design choices:
 *   - Conservative — return null when uncertain. The form's existing
 *     pre-fill flow handles missing fields gracefully (teacher fills
 *     them in). False-positive extractions are worse than misses.
 *   - No LLM call — runs locally in <1ms. Belt-and-braces with the LLM
 *     extractor.
 *   - Caption-derived values WIN over LLM when both produce a value:
 *     the teacher's explicit ask outranks our inference from the page.
 */

const SUBJECT_CANONICAL = {
  // English subject names → canonical form (matches the form's dropdown labels
  // in shared/services/pic-to-lp/flow-options.js).
  math: 'Math',
  maths: 'Math',
  mathematics: 'Math',
  english: 'English',
  urdu: 'Urdu',
  science: 'Science',
  'general science': 'Science',
  'social studies': 'Social Studies',
  sindhi: 'Sindhi',
  islamiat: 'Islamiat',
  'general knowledge': 'General Knowledge',
  gk: 'General Knowledge',
  // Urdu subject names
  ریاضی: 'Math',
  انگلش: 'English',
  انگریزی: 'English',
  اردو: 'Urdu',
  سائنس: 'Science',
  معاشرتی: 'Social Studies',
  سندھی: 'Sindhi',
  اسلامیات: 'Islamiat',
  اسلامی: 'Islamiat',
};

const SUBJECT_KEYS = Object.keys(SUBJECT_CANONICAL).sort((a, b) => b.length - a.length);

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
  // Urdu / Roman Urdu number words for class
  پہلی: 1, دوسری: 2, تیسری: 3, چوتھی: 4, پنجم: 5, پانچویں: 5, چھٹی: 6, ساتویں: 7,
  آٹھویں: 8, نہم: 9, نویں: 9, دہم: 10, دسویں: 10,
};

const LANGUAGE_HINTS = {
  english: 'en',
  inglish: 'en',
  انگریزی: 'en',
  urdu: 'ur',
  اردو: 'ur',
  sindhi: 'sd',
  sindhee: 'sd',
  سندھی: 'sd',
  swahili: 'sw',
  kiswahili: 'sw',
  سواحلی: 'sw',
};

function _toGrade(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw >= 1 && raw <= 12 ? raw : null;
  const s = String(raw).trim().toLowerCase();
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 12) return n;
  if (NUMBER_WORDS[s] != null) return NUMBER_WORDS[s];
  return null;
}

function _findSubject(text) {
  const lower = text.toLowerCase();
  for (const key of SUBJECT_KEYS) {
    // Check Urdu separately (case-insensitive matters less for Arabic script)
    if (/[؀-ۿ]/.test(key)) {
      if (text.includes(key)) return SUBJECT_CANONICAL[key];
    } else {
      // Word-boundary match — avoid "math" matching inside "maths" twice etc.
      const re = new RegExp(`\\b${key.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(lower)) return SUBJECT_CANONICAL[key];
    }
  }
  return null;
}

function _findGrade(text) {
  // Pattern A: "Class: 5", "Class 5", "Class Five", "grade 5", "grade2", "Grade Five"
  const numericMatch = text.match(/\b(?:class|grade|درجہ|جماعت)\s*[:\-]?\s*(\d{1,2})\b/i);
  if (numericMatch) {
    const g = _toGrade(numericMatch[1]);
    if (g != null) return g;
  }
  // Pattern B: word numbers — "Class Five", "Grade Two"
  const wordMatch = text.match(/\b(?:class|grade)\s*[:\-]?\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
  if (wordMatch) {
    const g = _toGrade(wordMatch[1]);
    if (g != null) return g;
  }
  // Pattern C: Urdu "جماعت: پنجم" — direct word match
  for (const word of Object.keys(NUMBER_WORDS)) {
    if (/[؀-ۿ]/.test(word) && text.includes(word)) {
      // Only accept if there's a class/grade prefix nearby, OR if the word
      // appears in a structured "جماعت: X" / "درجہ: X" pattern
      if (new RegExp(`(?:جماعت|درجہ)\\s*[:\\-]?\\s*${word}`).test(text)) {
        return NUMBER_WORDS[word];
      }
    }
  }
  return null;
}

// Generic placeholders the regex would otherwise capture as a "topic" — these
// mean "use the photo", not a literal topic name. Example: a caption like
// "Generate grade 7 lesson plan on this topic" would match `lesson plan on` and
// capture "this topic", clobbering an LLM-extracted real topic.
const GENERIC_TOPIC_PLACEHOLDERS = /^(this|that|the|it|attached|above|below|here|here's|here is|this\s+(?:topic|lesson|chapter|page|photo|image|book|sabaq|سبق)|the\s+(?:topic|lesson|chapter|page|photo|image|book|sabaq|سبق)|attached\s+(?:topic|lesson|chapter|page|photo|image)|اس|یہ|سبق|عنوان|باب)$/i;

function _isGenericPlaceholder(t) {
  if (!t) return true;
  return GENERIC_TOPIC_PLACEHOLDERS.test(t.trim());
}

// Strip trailing chunks that aren't part of the actual topic. Used after every
// topic-extraction regex (A1/A2/B) so a teacher's "topic Respiration in english"
// or "lesson plan on this in swahili" don't leak language tails into the topic.
const _LANG_NAME_ALT = Object.keys(LANGUAGE_HINTS).join('|');
const _LANG_TAIL_RE = new RegExp(`\\bin\\s+(?:${_LANG_NAME_ALT})(?:\\s+medium)?\\s*$`, 'i');
function _cleanTopic(raw) {
  if (!raw) return raw;
  return raw
    .replace(/\b(?:exercise|ex\.?)\s*[\d.]+.*$/i, '')
    .replace(/\bka\s+lesson\s+plan\b.*$/i, '')
    .replace(/\blesson\s+plan\b.*$/i, '')
    .replace(_LANG_TAIL_RE, '')
    .replace(/[.,;\s]+$/, '')
    .trim();
}

function _findTopic(text) {
  // Pattern A1: English explicit key — "Topic: <X>" / "Chapter: <X>"
  const enKeyMatch = text.match(/\b(?:topic|chapter)\s*[:\-]?\s*([^\n,/]+)/i);
  if (enKeyMatch) {
    const t = _cleanTopic(enKeyMatch[1]);
    if (t.length >= 2 && t.length <= 120 && !_isGenericPlaceholder(t)) return t;
  }
  // Pattern A2: Urdu explicit key — \b doesn't work for Arabic script in
  // JavaScript regex, so anchor on start-of-string or whitespace instead.
  const urKeyMatch = text.match(/(?:^|\s)(?:سبق(?:\s*کا\s*عنوان)?|عنوان|باب)\s*[:\-]?\s*([^\n,/]+)/);
  if (urKeyMatch) {
    const t = _cleanTopic(urKeyMatch[1]);
    if (t.length >= 2 && t.length <= 120 && !_isGenericPlaceholder(t)) return t;
  }
  // Pattern B: ", topic X exercise Y" / "lesson plan for X" / "X ka lesson plan"
  const ofMatch = text.match(/\b(?:topic|on|about|of|lesson plan for|lesson plan on)\s+([^\n,.]{3,80})/i);
  if (ofMatch) {
    const cleaned = _cleanTopic(ofMatch[1]);
    if (cleaned.length >= 3 && cleaned.length <= 120 && !_isGenericPlaceholder(cleaned)) return cleaned;
  }
  // Pattern C: Roman Urdu "<X> ka lesson plan" — pull "X" preceding "ka lesson plan"
  const romanMatch = text.match(/(?:chapter|sabaq)\s+([^\n,.]{3,80}?)\s+(?:ka|ke|ki)\s+lesson/i);
  if (romanMatch) {
    const t = romanMatch[1].trim();
    if (!_isGenericPlaceholder(t)) return t;
  }
  return null;
}

function _findLanguage(text) {
  // Pattern A: "in <lang>" — "lesson plan in Urdu"
  const inMatch = text.match(/\b(?:in|me(?:in)?|main|میں)\s+(english|inglish|urdu|sindhi|sindhee|swahili|kiswahili|اردو|انگریزی|سندھی|سواحلی)\b/i);
  if (inMatch) return LANGUAGE_HINTS[inMatch[1].toLowerCase()] || null;
  // Pattern A2: Roman Urdu "<lang> me/mein" — "sindhi me lesson plan"
  const langFirstMatch = text.match(/\b(english|inglish|urdu|sindhi|sindhee|swahili|kiswahili)\s+(?:me|mein|main)\b/i);
  if (langFirstMatch) return LANGUAGE_HINTS[langFirstMatch[1].toLowerCase()] || null;
  // Pattern B: "Medium: <lang>" / "Language: <lang>"
  const mediumMatch = text.match(/\b(?:medium|language|زبان)\s*[:\-]?\s*(english|inglish|urdu|sindhi|sindhee|swahili|kiswahili|اردو|انگریزی|سندھی|سواحلی)\b/i);
  if (mediumMatch) return LANGUAGE_HINTS[mediumMatch[1].toLowerCase()] || null;
  return null;
}

/**
 * Extract grade / subject / topic / language from a caption.
 * Returns shape: { grade, subject, topic, language } where any field may be null.
 *
 * Pure function. Returns null shape (no exceptions) for empty/null input.
 *
 * @param {string|null|undefined} caption
 * @returns {{grade: number|null, subject: string|null, topic: string|null, language: string|null}}
 */
function extractFromCaption(caption) {
  if (!caption || typeof caption !== 'string' || caption.trim().length === 0) {
    return { grade: null, subject: null, topic: null, language: null };
  }
  const text = caption.trim();

  // LP-intent gate: captions can include non-LP intents like "translate this
  // text into Urdu" — those would otherwise match _findSubject('English') and
  // pollute the form. Only proceed with the pre-fill when the caption looks
  // LP-shaped: explicit "lesson plan" / "sabaq" / "سبق" / "lp" intent, OR
  // structured "Class: N" / "Subject: X" / "جماعت: X" key-value markers, OR a
  // numeric Class/Grade/جماعت prefix nearby.
  const hasLPIntent =
    /\b(lesson\s*plan|sabaq|sabq|lp)\b/i.test(text) ||
    /(سبق|درس)/.test(text) ||
    /\b(?:class|grade|درجہ|جماعت)\s*[:\-]?\s*\d/i.test(text) ||
    /(?:Class|Subject|Topic|Medium|Language|جماعت|مضمون|عنوان)\s*:/.test(text);
  if (!hasLPIntent) {
    return { grade: null, subject: null, topic: null, language: null };
  }

  return {
    grade: _findGrade(text),
    subject: _findSubject(text),
    topic: _findTopic(text),
    language: _findLanguage(text),
  };
}

/**
 * Merge an LLM extraction result with a caption-derived prefill.
 * Caption values WIN where present — teacher's explicit ask outranks
 * our inference from the page. LLM fills gaps the caption left empty.
 *
 * @param {{grade,subject,topic,ocr_text}} llmResult
 * @param {{grade,subject,topic,language}} captionResult
 * @returns {{grade,subject,topic,ocr_text,language}}
 */
function mergeWithCaption(llmResult, captionResult) {
  const llm = llmResult || {};
  const cap = captionResult || {};
  return {
    grade: cap.grade != null ? cap.grade : (llm.grade != null ? llm.grade : null),
    subject: cap.subject || llm.subject || null,
    topic: cap.topic || llm.topic || null,
    language: cap.language || null, // language only ever from caption pre-fill
    ocr_text: llm.ocr_text || '',
  };
}

module.exports = { extractFromCaption, mergeWithCaption };
