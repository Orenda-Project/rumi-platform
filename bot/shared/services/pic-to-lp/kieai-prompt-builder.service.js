/**
 * Kie.ai Prompt Builder
 *
 * Pure functions: build the page-1 + page-2 v7-grade lesson-plan prompts
 * from the form data the teacher submitted via PIC_LP_FLOW.
 *
 * V7-pattern principles encoded here:
 *   - Style preamble: 8-line block with palette, fonts, paper format,
 *     reference-image roles. NO dimension annotations in prose (they bleed
 *     into rendered text). Hardcore Nastaliq rule for non-English LPs.
 *   - Reference images at the top: IMAGE 1 = white smile logo (native
 *     render in header), IMAGE 2 = teacher's textbook page (visual style anchor).
 *   - Big Idea callout on page 1 — concept distinction + common misconception
 *     + 1-sentence demo move. The pedagogical heart.
 *   - Hook with verbatim character speech bubbles.
 *   - I-Do / We-Do / You-Do gradual release per structured pedagogy.
 *   - Board work with FULL answer keys (never "leave blank for students").
 *   - Exit ticket MCQ with correct answer green-highlighted.
 *   - Coaching corner with a lesson-specific reflection (and an optional
 *     WhatsApp contact line when a coaching number is configured).
 *   - Title Case for English headings (avoids a GPT-Image-2 glitch where
 *     all-caps headings render garbled).
 *   - Per-card REPEAT of the Nastaliq rule for non-English (defends against
 *     Naskh/Devanagari fallback).
 *
 * The PROMPT BODY for non-English is itself written in Nastaliq Urdu —
 * English-prose-with-Urdu-phrases lets the model default Urdu to Naskh.
 */

const SUBJECT_COLOR = {
  'Math':                      '#059669', // green
  'Maths':                     '#059669',
  'English':                   '#7c3aed', // purple
  'Urdu':                      '#7c3aed',
  'Sindhi':                    '#7c3aed',
  'Science':                   '#dc2626', // red
  'Social Studies':            '#ea580c', // orange
  'Islamiat':                  '#0891b2', // teal
  'General Knowledge':         '#0891b2',
  'Mathematics':               '#059669', // green — math family
  'Kiswahili':                 '#b91c1c', // red-700
  'Civics & Moral Education':  '#d97706', // amber-600
  'Religious Education':       '#7c3aed', // purple
  'Vocational Skills':         '#0e7490', // cyan-700
  'Languages':                 '#7c3aed', // purple — language family
  'Other':                     '#059669', // fallback green
};

function colorFor(subject) {
  return SUBJECT_COLOR[subject] || '#059669';
}

function isLatinScript(language) {
  // 'sw' (Kiswahili) uses Latin script too — treat as English-like for layout
  // purposes. Arabic ('ar') is RTL like Urdu but uses NASKH natively (not
  // Nastaliq), so it gets its own branch below.
  return language === 'en' || language === 'sw';
}

function isArabicScript(language) {
  return language === 'ar';
}

// Explicit content-language instruction for every NON-URDU language that uses
// the structural-English body template (sw/ar/sd/pa). Without this, the model
// defaults to writing English content (matching the structural labels) inside
// the language's font — e.g. English text in Naskh Sindhi glyphs. Urdu is the
// ONLY language that gets its own hardcoded body template.
function contentLanguageInstruction(language) {
  switch (language) {
    case 'sw':
      // Render EVERYTHING in Kiswahili, including the structural section
      // labels/headings — not just the body. The label translations are
      // already substituted into the template via structuralLabelsFor('sw');
      // this directive reinforces it for the model.
      return 'CONTENT LANGUAGE: EVERYTHING on this page — all teacher-facing content (warm-up body, hook speech bubbles, Big Idea paragraphs, board work, exit ticket question + answers, coaching corner) AND every structural section label/heading (e.g. Lengo la Leo, Wazo Kuu, Maandalizi, Mwalimu Anafanya, Tunafanya Pamoja, Wewe Fanya, Kona ya Kocha) — MUST be written in NATURAL Kiswahili. The ONLY non-Kiswahili text allowed is Hindu-Arabic numerals (0-9) for math and the brand name "Rumi". Do NOT render any English headings or labels. The teacher reading this is in East Africa (Kenya / Tanzania / Uganda) and expects native Kiswahili educational vocabulary.';
    case 'ar':
      // Render EVERYTHING in MSA Arabic, including the structural section
      // labels/headings (RTL Naskh) — not just the body.
      return 'CONTENT LANGUAGE: EVERYTHING on this page — all teacher-facing content (warm-up body, hook speech bubbles, Big Idea paragraphs, board work, exit ticket question + answers, coaching corner) AND every structural section label/heading (e.g. هدف اليوم, الفكرة الكبرى, التهيئة, المعلّم يؤدّي, نعمل معًا, دورك أنت, ركن التدريب) — MUST be written in NATURAL Modern Standard Arabic (MSA / فصحى), right-to-left. The ONLY non-Arabic text allowed is Hindu-Arabic numerals (0-9) for math and the brand name "Rumi". Do NOT render any English headings or labels. The teacher reading this is in the MENA region and expects native Arabic educational vocabulary.';
    case 'sd':
      return 'CONTENT LANGUAGE: All teacher-facing content (warm-up body, hook speech bubbles, Big Idea paragraphs, board work, exit ticket question + answers, coaching corner) MUST be written in NATURAL Pakistani Sindhi using the Perso-Arabic Sindhi script (Naskh Sindhi / Lateef tradition, with Sindhi-specific letters ڄ ڃ ڳ ڱ ڙ ڪ). Use English ONLY for structural section labels (Today\'s Goal, Big Idea, I Do, We Do, You Do, etc.) and Hindu-Arabic numerals for math. The teacher is in Sindh (Pakistan) and expects native Sindhi educational vocabulary, NOT translated Urdu and NOT Urdu Nastaliq style.';
    case 'pa':
      return 'CONTENT LANGUAGE: All teacher-facing content (warm-up body, hook speech bubbles, Big Idea paragraphs, board work, exit ticket question + answers, coaching corner) MUST be written in NATURAL Pakistani Punjabi using Shahmukhi script (Perso-Arabic, same letters as Urdu Nastaliq). Use English ONLY for structural section labels and Hindu-Arabic numerals for math. The teacher is in Pakistani Punjab and expects native Punjabi educational vocabulary, NOT translated Urdu.';
    default:
      return null; // en handled by structural template alone; ur has its own dedicated body
  }
}

// characterCastFor + classroomContextFor are sourced from the shared
// lp-localization service so the pic-LP path and the Gamma text-LP path read
// ONE cultural-context table and can never drift.
const { characterCastFor, classroomContextFor } = require('../pedagogy/lp-localization.service');

// Educational-context preamble. Signals to GPT-Image-2's output moderator that
// this is a sanctioned K-12 classroom resource, not edgy content. Reduces (does
// not eliminate) stochastic content-policy false positives on benign
// educational topics. The retry loop in kieai-client.service.js is the actual
// mitigation; this preamble is risk reduction.
function educationalContextPreamble({ subject, grade }) {
  return [
    'EDUCATIONAL CONTEXT (for content moderation): This is a printable K-12 school',
    `lesson-plan handout for a teacher of Grade ${grade} ${subject}, intended to be`,
    'used as a classroom resource. The illustration is a clean instructional diagram',
    'in the style of a school textbook. All depicted humans are fully clothed children',
    'or teachers shown waist-up or in school-uniform full-body, in a learning context.',
    'There is no graphic medical, anatomical, violent, or otherwise sensitive content;',
    'biological topics (e.g. cells, plants, body systems) are rendered at age-appropriate',
    'textbook level — labeled diagrams, not anatomical detail.',
    '',
  ].join('\n');
}

// Structural section labels per language. en/sd/pa/ur return the English label
// set (those template branches must not change). sw → Kiswahili, ar → MSA
// Arabic. The template substitutes these values for the previously-hardcoded
// English strings. Hindu-Arabic numerals + "Rumi" stay non-target text everywhere.
function structuralLabelsFor(language) {
  // English label set. en/sd/pa/ur use this unchanged. (The Urdu body template
  // embeds these English labels inline by design — see buildPage1Prompt — so it
  // also reads from the English set.)
  const EN = {
    todaysGoal: "Today's Goal",
    bigIdea: 'The Big Idea',
    warmUp: 'WARM-UP',
    hook: 'HOOK',
    keyWords: 'Key Words',
    iDo: 'I Do',
    weDo: 'We Do',
    youDo: 'You Do',
    writeOnBoard: 'Write on the Board',
    exitTicket: 'Exit Ticket',
    coachingCorner: 'Coaching Corner',
    cfu: 'CFU',
    howItWorks: 'How It Works',
    minutes: 'min',
    basic: 'Basic',
    guided: 'Guided',
    challenge: 'Challenge',
    // Page-2 phrase headings (kept as full phrases to preserve byte-identical
    // English; sw/ar override with the in-language equivalent).
    practiceTogether: 'Practice Together',
    yourTurn: 'Your Turn',
    beforeYouGo: 'Before You Go',
    needHelp: 'Need Help?',
    challengeBang: 'Challenge!',
  };

  switch (language) {
    case 'sw':
      return {
        todaysGoal: 'Lengo la Leo',
        bigIdea: 'Wazo Kuu',
        warmUp: 'Maandalizi',
        hook: 'Kichocheo',
        keyWords: 'Maneno Muhimu',
        iDo: 'Mwalimu Anafanya',
        weDo: 'Tunafanya Pamoja',
        youDo: 'Wewe Fanya',
        writeOnBoard: 'Andika Ubaoni',
        exitTicket: 'Tiketi ya Kutoka',
        coachingCorner: 'Kona ya Kocha',
        cfu: 'Kupima Uelewa',
        howItWorks: 'Jinsi Inavyofanya Kazi',
        minutes: 'Dakika',
        basic: 'Msingi',
        guided: 'Kwa Mwongozo',
        challenge: 'Changamoto',
        practiceTogether: 'Tufanye Mazoezi Pamoja',
        yourTurn: 'Zamu Yako',
        beforeYouGo: 'Kabla ya Kuondoka',
        needHelp: 'Unahitaji Msaada?',
        challengeBang: 'Changamoto!',
      };
    case 'ar':
      return {
        todaysGoal: 'هدف اليوم',
        bigIdea: 'الفكرة الكبرى',
        warmUp: 'التهيئة',
        hook: 'التشويق',
        keyWords: 'الكلمات المفتاحية',
        iDo: 'المعلّم يؤدّي',
        weDo: 'نعمل معًا',
        youDo: 'دورك أنت',
        writeOnBoard: 'اكتب على السبورة',
        exitTicket: 'تذكرة الخروج',
        coachingCorner: 'ركن التدريب',
        cfu: 'التحقق من الفهم',
        howItWorks: 'كيف يعمل',
        minutes: 'دقيقة',
        basic: 'أساسي',
        guided: 'موجَّه',
        challenge: 'تحدٍّ',
        practiceTogether: 'نتدرّب معًا',
        yourTurn: 'دورك',
        beforeYouGo: 'قبل أن تغادر',
        needHelp: 'تحتاج مساعدة؟',
        challengeBang: 'تحدٍّ!',
      };
    default:
      // en, sd, pa, ur — unchanged English labels.
      return EN;
  }
}

// Coaching Corner WhatsApp contact number. Open-source deployments configure a
// single teacher-facing number via the COACHING_WHATSAPP_NUMBER env var; when
// it is unset the Coaching Corner simply omits the contact line. The `region`
// parameter is ignored (kept for caller compatibility).
function coachingNumberFor(region) {
  return process.env.COACHING_WHATSAPP_NUMBER || '';
}

function styleBlock({ subject, language, grade }) {
  const color = colorFor(subject);
  const isLatin = isLatinScript(language);
  const region = classroomContextFor(language);

  const baseLines = [
    'Clean flat vector illustration, educational infographic style.',
    `${region} Grade ${grade} classroom. White background. Minimal clutter.`,
    'Bold simple shapes. High contrast colors.',
    'Dark navy #1e293b header bar. Amber #fbbf24 highlights.',
    `Subject color: ${color}.`,
  ];

  if (isLatin) {
    baseLines.push('Clean sans-serif font (Nunito or Inter). LTR layout.');
  } else if (isArabicScript(language)) {
    // Arabic uses Naskh natively — that's the right script. NO "NOT Devanagari
    // NOT Hindi" rule (those anti-rules are Urdu-specific). Font: Noto Naskh Arabic.
    baseLines.push(
      'Noto Naskh Arabic font for ALL Arabic text, right-to-left. Clean sans-serif (Nunito/Inter) for English labels. RTL layout for Arabic sections.'
    );
  } else if (language === 'sd') {
    // Sindhi (Pakistan) uses Perso-Arabic / Naskh Sindhi script, NOT Urdu
    // Nastaliq. Lateef + Noto Naskh Sindhi are the standard fonts in Pakistani
    // Sindhi school textbooks. The "NOT Devanagari" rule still applies (Sindhi
    // has Indian-Devanagari variants we want to exclude).
    baseLines.push(
      'Noto Naskh Sindhi or Lateef font for ALL Sindhi text, right-to-left. Sindhi-specific letters (ڄ ڃ ڳ ڱ ڙ ڪ) must render correctly. No diacritics. NOT Devanagari, NOT Hindi, NOT Urdu Nastaliq style. Clean sans-serif (Nunito/Inter) for English labels. RTL layout for Sindhi sections.'
    );
  } else {
    // Urdu / Punjabi (Shahmukhi) — hardcore Nastaliq rule. Punjabi-Shahmukhi
    // shares Urdu's Nastaliq tradition.
    baseLines.push(
      'Noto Nastaliq Urdu font for ALL Urdu text, right-to-left. No diacritics (no zer, zabar, pesh). Clean sans-serif (Nunito/Inter) for English labels. RTL layout for Urdu sections.'
    );
  }

  baseLines.push('No photography. Crisp digital illustration. Print-ready A4 portrait 3:4 format.');
  baseLines.push('');
  baseLines.push('REFERENCE IMAGES (in order):');
  baseLines.push('  IMAGE 1 = the EXACT Rumi brand mark — a clean white smile-only mark (curved line + two small cheek dots). Render this image pixel-for-pixel at small size (about 8% of page width, vertically centered in the dark-navy header bar, anchored 3% from the left edge). DO NOT redesign. DO NOT add a circle around it. DO NOT change its color.');
  baseLines.push("  IMAGE 2 = the teacher's textbook page — for visual style reference only. Do NOT copy any text from this image. Use only for visual style cues.");

  return baseLines.join('\n');
}

function nastaliqPerCardLine() {
  // Repeated per card for non-English LPs. Anchors the model so it doesn't
  // drift to Naskh on individual sections. NEVER add "NOT Naskh" — only
  // "NOT Devanagari, NOT Hindi".
  return 'All Urdu text in this card must use Noto Nastaliq Urdu font, right-to-left. No diacritics. NOT Devanagari, NOT Hindi.';
}

// Build the Coaching Corner contact suffix. When a coaching number is
// configured we append the "WhatsApp Rumi · <number>" line; otherwise we omit
// the contact line entirely (keeping the rest of the coaching corner).
function coachingContactSuffixEn(coachingNumber) {
  return coachingNumber ? ` WhatsApp Rumi · ${coachingNumber}` : '';
}
function coachingContactSuffixUr(coachingNumber) {
  return coachingNumber ? ` WhatsApp Rumi · ${coachingNumber}` : '';
}

/**
 * Build page 1 prompt (Hook, Today's Goal, Big Idea, I-Do, Board Work).
 *
 * @param {Object} args
 * @param {number|string} args.grade
 * @param {string} args.subject
 * @param {string} args.topic
 * @param {string} args.language - 'en' | 'ur' | 'sd' | 'pa'
 * @param {string} [args.ocrText] - Optional OCR text from the textbook page (for content grounding)
 * @returns {string}
 */
function buildPage1Prompt({ grade, subject, topic, language, ocrText, region, coachingNumber }) {
  // Only Urdu (ur) uses the Urdu-hardcoded body template. Every other language
  // uses the structural-English body (English labels) + contentLanguageInstruction
  // telling the model what language to write CONTENT in.
  const useUrduBodyTemplate = (language === 'ur');
  const color = colorFor(subject);
  const eduPreamble = educationalContextPreamble({ subject, grade });
  const style = `${eduPreamble}${styleBlock({ subject, language, grade })}`;
  const nastaliqLine = useUrduBodyTemplate ? `\n${nastaliqPerCardLine()}\n` : '';
  // Explicit content-language instruction for every non-Urdu RTL/non-Latin
  // language (sw/ar/sd/pa) — anchors content language before any English
  // structural labels are read.
  const contentLangLine = contentLanguageInstruction(language);
  const contentLangBlock = contentLangLine ? `\n${contentLangLine}\n` : '';
  const cast = characterCastFor(language);
  // Structural labels per language. en/sd/pa/ur → English (unchanged). sw →
  // Kiswahili, ar → MSA Arabic. Substituted into the template below in place of
  // the previously-hardcoded English strings.
  const L = structuralLabelsFor(language);

  const titleEn = `Grade ${grade} ${subject} — ${topic}`;
  const ocrSnippet = (ocrText || '').slice(0, 1500); // cap for prompt budget

  // Universal grade calibration block — drives age-appropriate vocab, sentence
  // length, worked-example count, CFU cadence, differentiation, etc. The LP's
  // VISUAL sections never change; only the content density inside them adapts.
  const { renderCalibrationBlock } = require('../pedagogy/grade-calibration.service');
  const calibrationBlock = renderCalibrationBlock(grade);

  // Structural-English LP body (en + sw + ar + sd + pa) — Title Case headings,
  // Big Idea callout, full answer keys. Cast/region parameterized per language.
  if (!useUrduBodyTemplate) {
    return `${style}${contentLangBlock}
${calibrationBlock}

Hook, Today's Goal, Big Idea, I-Do (How It Works), and Board Work card. Portrait 3:4.

HEADER BAR (dark navy #1e293b, full width):
  Left edge: render IMAGE 1 (the white smile brand mark) small, vertically centered, 3% from left.
  Center: "${titleEn}" in white bold.
  Right: small ${color} pill containing "Grade ${grade} · 35 min" in white.

WARM-UP REVIEW (light gray #f3f4f6 background, full width strip):
  Label "${L.warmUp} · 4 min" in dark navy bold.
  Body: a 1-2 sentence quick recall connecting yesterday's lesson to today's. Reference the textbook page where appropriate.
  Small ${L.cfu} pill on right (teal #059669): "${L.cfu} · Thumbs up if you remember!"

HOOK (white background, with bordered amber #fbbf24 frame):
  Heading "${L.hook} · 4 min" in amber bold.
  Two ${cast.region} Grade ${grade} students illustrated facing each other.
  Character "${cast.boy}" (boy, left, school uniform): speech bubble with a verbatim curiosity question about ${topic}.
  Character "${cast.girl}" (girl, right, ${cast.girlDress}): speech bubble with the verbatim correct insight.
  Each character has a distinct speech bubble with their own text clearly visible.

BIG IDEA (prominent white card with thick ${color} border, lightbulb icon, ~22% page height):
  Heading "${L.bigIdea}" in ${color} bold.
  Three short paragraphs in dark navy:
    1. The concept distinction the textbook doesn't make explicit (what students often confuse).
    2. The common student misconception (what kids will get wrong, and why).
    3. A 1-sentence demo move (how to teach the distinction in class).

TODAY'S GOAL + KEY WORDS (two boxes side by side, full width):
  Left box (${color} background, white text): heading "${L.todaysGoal}", body: a single learning objective sentence about ${topic}.
  Right box (amber #fbbf24, navy text): heading "${L.keyWords}", body: 4 vertical key words from ${topic}.

I DO · HOW IT WORKS (white background, blue #2563eb section header):
  Heading "${L.iDo} · ${L.howItWorks} · 6 min" in blue bold.
  Generate EXACTLY 3 numbered step panels stacked vertically. Do not add additional panels.
    Step 1, Step 2, Step 3 — each with verbatim teacher script (what the teacher SAYS or WRITES on the board) about ${topic}, drawing from the textbook page content.
  Small downward arrows between panels.

BOARD WORK (dark navy #1e293b chalkboard-style box at bottom, full width, white chalk-style text):
  Header in amber: "${L.writeOnBoard}"
  3 worked examples with FULL answer keys visible (never "leave blank for students").
  Below the table: a 1-line note connecting the board work back to the Big Idea.

CRITICAL: This page MUST be about ${topic} (Class ${grade} ${subject}). Do not render content about any other topic.

IMPORTANT: Render IMAGE 1 pixel-for-pixel as the brand mark in top-left header. Bottom 4% of page must be empty (footer overlaid). Use Title Case for headings.${ocrSnippet ? `\n\nTextbook page content (for grounding, do NOT copy verbatim):\n${ocrSnippet}` : ''}`;
  }

  // Urdu / Sindhi / Punjabi LP body — written IN Nastaliq throughout, with
  // English structural labels in Title Case. The model renders Nastaliq when it
  // SEES Nastaliq in the prompt. The calibration block applies to the Urdu path
  // too — grade-appropriate vocab/pacing/differentiation are universal.
  return `${style}${contentLangBlock}
${calibrationBlock}
${nastaliqLine}
HEADER BAR (dark navy #1e293b, full width):
  Left edge: render IMAGE 1 (the white smile brand mark) small, vertically centered, 3% from left.
  Center: title in white bold — "Grade ${grade} ${subject} — ${topic}" (English label first, dot separator, then Urdu Nastaliq content).
  Right: small ${color} pill containing "Grade ${grade} · 35 min" in white.

WARM-UP REVIEW (light gray #f3f4f6 background, full width strip):
  Label "WARM-UP · 4 min" in dark navy bold.
  Body in Nastaliq: "استاد بورڈ پر لکھیں — کل کے سبق کا ایک مختصر دہراؤ۔ پھر آج کا موضوع متعارف کرائیں — ${topic}۔"
  CFU pill on right (teal #059669): "CFU · Thumbs up if you remember!"

HOOK (white background, with bordered amber #fbbf24 frame):
  Heading "HOOK · 4 min" in amber bold.
  Two Pakistani Grade ${grade} students illustrated facing each other.
  Character "احمد" (طالب علم، لڑکا) positioned بائیں: speech bubble in Nastaliq — ایک تجسس بھرا سوال ${topic} کے بارے میں۔
  Character "زینب" (طالبہ، لڑکی) positioned دائیں: speech bubble in Nastaliq — صحیح جواب جو ${topic} کا بنیادی تصور بیان کرے۔
  Each character has a distinct speech bubble in clean Nastaliq.

BIG IDEA (prominent white card with thick ${color} border, lightbulb icon, ~22% page height):
  Heading "The Big Idea · بنیادی تصور" in ${color} bold.
  Three short Nastaliq paragraphs:
    ۱۔ ${topic} کا بنیادی تصور — وہ فرق جو کتاب میں واضح نہیں ہے۔
    ۲۔ بچوں کی عام غلطی — وہ کیا غلط سمجھتے ہیں اور کیوں۔
    ۳۔ Quick demo: ایک فوری board move جو استاد آج کلاس میں استعمال کر سکتی ہے۔

TODAY'S GOAL + KEY WORDS (two boxes side by side):
  Left box (${color} background, white text): heading "Today's Goal", body in Nastaliq: ${topic} کا ایک واضح learning objective۔
  Right box (amber #fbbf24, navy text): heading "Key Words", body: 4 vertical key terms from ${topic} (Nastaliq with English in brackets where useful).

I DO · HOW IT WORKS (white background, blue #2563eb section header):
  Heading "I Do · How It Works · 6 min" in blue bold.
  Generate EXACTLY 3 numbered step panels stacked vertically. Do not add additional panels.
  Each step in Nastaliq with embedded English content words (numbers, formulas, English vocabulary).

BOARD WORK (dark navy #1e293b chalkboard-style box at bottom, full width, white chalk-style text):
  Header in amber: "Write on the Board"
  3 examples in Nastaliq with FULL answer keys (never "leave blank for students"). Use Hindu-Arabic numerals (0-9) for math.

CRITICAL: This page MUST be about ${topic} (Class ${grade} ${subject}). Do not render content about any other topic.

IMPORTANT: Render IMAGE 1 pixel-for-pixel as the brand mark in top-left header. Bottom 4% of page must be empty (footer overlaid). Use Hindu-Arabic numerals (0-9) for math equations. Use Title Case for English headings.${ocrSnippet ? `\n\nTextbook page content (for grounding, do NOT copy verbatim):\n${ocrSnippet}` : ''}`;
}

/**
 * Build page 2 prompt (We-Do, You-Do, Differentiation, Exit Ticket, Coaching).
 *
 * Same args as buildPage1Prompt.
 */
function buildPage2Prompt({ grade, subject, topic, language, ocrText, region, coachingNumber }) {
  // See buildPage1Prompt for the dispatch rationale. Only ur uses the
  // Urdu-hardcoded template; everything else uses structural-English.
  const useUrduBodyTemplate = (language === 'ur');
  const color = colorFor(subject);
  const eduPreamble = educationalContextPreamble({ subject, grade });
  const style = `${eduPreamble}${styleBlock({ subject, language, grade })}`;
  const nastaliqLine = useUrduBodyTemplate ? `\n${nastaliqPerCardLine()}\n` : '';
  const contentLangLine = contentLanguageInstruction(language);
  const contentLangBlock = contentLangLine ? `\n${contentLangLine}\n` : '';
  // In-language structural labels (en/sd/pa/ur unchanged).
  const L = structuralLabelsFor(language);
  // Coaching Corner contact number. Explicit coachingNumber wins; else the
  // env-driven value; else empty (which omits the contact line).
  const resolvedCoachingNumber = coachingNumber || coachingNumberFor(region);

  // Same calibration block as Page 1 — the model needs the grade-appropriate
  // guidance on We-Do/You-Do/Exit-Ticket complexity too.
  const { renderCalibrationBlock } = require('../pedagogy/grade-calibration.service');
  const calibrationBlock = renderCalibrationBlock(grade);

  if (!useUrduBodyTemplate) {
    return `${style}${contentLangBlock}
${calibrationBlock}

We-Do, You-Do, Differentiation, Exit Ticket, Coaching Corner card. Portrait 3:4.

HEADER BAR (dark navy #1e293b, full width):
  Left edge: render IMAGE 1 (the white smile brand mark) small, vertically centered, 3% from left.
  Center: "Grade ${grade} ${subject} — ${topic} · Page 2" in white bold.
  Right: small amber pill containing "Grade ${grade} · 35 min".

WE DO · GUIDED PRACTICE (top section, light tinted ${color} card with ${color} header bar):
  Heading "${L.weDo} · ${L.practiceTogether} · 10 min" in white on ${color}.
  A worked example with full step-by-step solution shown (so the teacher has the answer key on hand).
  Below the example, a partner-activity instruction strip with verbatim student dialogue lines.

YOU DO · YOUR TURN (middle section, white background, amber #fbbf24 header bar):
  Heading "${L.youDo} · ${L.yourTurn} · 12 min" in dark navy bold.
  Instruction in plain English: pick the activity that matches ${topic}.
  Three problems numbered 1-3, with model answers in light gray italic next to each (so the teacher has the key).

DIFFERENTIATION (two boxes side by side):
  LEFT (amber #fef3c7 fill, "${L.needHelp}" label in amber bold): 1-sentence scaffolding move for struggling students.
  RIGHT (purple #7c3aed fill, "${L.challengeBang}" label in white bold): 1-sentence stretch task for advanced students.

EXIT TICKET (light blue #dbeafe card, full width):
  Heading "${L.beforeYouGo} · ${L.exitTicket} · 4 min" in dark navy bold.
  A single MCQ question about ${topic} with 4 answer chips (A, B, C, D). The correct chip highlighted in green #059669 with a white check mark.

COACHING CORNER (light amber #fef3c7 strip at bottom, full width):
  Heading "${L.coachingCorner}" in dark navy bold.
  Body: a lesson-specific reflection — what to watch for, the most likely student mistake, and a 2-minute reteach move. Tied to ${topic} specifically.
  Right side: small green WhatsApp icon next to text "Send me a recording of today's lesson — I'll give you personalised feedback.${coachingContactSuffixEn(resolvedCoachingNumber)}"

CRITICAL: This page MUST be about ${topic}. Do not render content about any other topic.

IMPORTANT: Render IMAGE 1 pixel-for-pixel as the brand mark in top-left header. Bottom 4% must be empty. Use Title Case for English headings.${ocrText ? `\n\nTextbook page content (for grounding):\n${ocrText.slice(0, 1500)}` : ''}`;
  }

  // Urdu/Sindhi/Punjabi page 2 (the calibration block applies here too)
  return `${style}${contentLangBlock}
${calibrationBlock}
${nastaliqLine}
HEADER BAR (dark navy #1e293b, full width):
  Left edge: render IMAGE 1 (the white smile brand mark) small, vertically centered, 3% from left.
  Center: "Grade ${grade} ${subject} — ${topic} · Page 2" in white bold.
  Right: small amber pill containing "Grade ${grade} · 35 min".

WE DO · GUIDED PRACTICE (top section, light tinted ${color} card with ${color} header bar):
  Heading "We Do · Practice Together · 10 min" in white on ${color}.
  A worked example in Nastaliq with full step-by-step solution. The teacher gets the answer key on hand.
  Below the example, instruction strip in dark navy Nastaliq about how to call a student to the board.

YOU DO · YOUR TURN (middle section, white background, amber #fbbf24 header bar):
  Heading "You Do · Your Turn · 12 min" in dark navy bold.
  Instruction in Nastaliq: "اپنی copy میں ${topic} کے بارے میں ۳ مشقیں حل کریں۔"
  Three problems numbered ۱، ۲، ۳ in Nastaliq, with model answers in light gray italic.

DIFFERENTIATION (two boxes side by side):
  LEFT (amber #fef3c7 fill, "Need Help?" label in amber bold, body in Nastaliq): scaffolding move for struggling students.
  RIGHT (purple #7c3aed fill, "Challenge!" label in white bold, body in Nastaliq): stretch task for advanced students.

EXIT TICKET (light blue #dbeafe card, full width):
  Heading "Before You Go · Exit Ticket · 4 min" in dark navy bold.
  Single MCQ in Nastaliq about ${topic} with 4 answer chips. Correct chip highlighted green #059669 with white check.

COACHING CORNER (light amber #fef3c7 strip at bottom, full width):
  Heading "Coaching Corner" in dark navy bold.
  Body in Nastaliq: lesson-specific reflection tied to ${topic} — what to watch for, common mistake, 2-min reteach move.
  Right side: small green WhatsApp icon next to text in Nastaliq: "آج کا lesson record کر کے Rumi کو بھیجیں — personalised feedback ملے گا۔${coachingContactSuffixUr(resolvedCoachingNumber)}"

CRITICAL: This page MUST be about ${topic}. Do not render content about any other topic.

IMPORTANT: Render IMAGE 1 pixel-for-pixel as brand mark in top-left header. Bottom 4% must be empty. Hindu-Arabic numerals (0-9) for math. Title Case for English headings.${ocrText ? `\n\nTextbook page content (for grounding):\n${ocrText.slice(0, 1500)}` : ''}`;
}

module.exports = { buildPage1Prompt, buildPage2Prompt, colorFor, structuralLabelsFor, coachingNumberFor };
