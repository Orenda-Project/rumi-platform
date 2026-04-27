/**
 * Rawalpindi v7 slide prompt builders — ported verbatim from
 * 06_Logs & Misc/Reports/Active/Rawalpindi_Modifications/plans/phases/lesson-plan-moonshot/pilot-lps/generate-lps-v3.backup.js
 *
 * Six builders, each returning a Kie.AI NBPro prompt string:
 *   1. navigationPrompt        — Day X of N + journey + today + coming up + TO PREPARE
 *   2. hookBoardworkPrompt     — warm-up + hook (rotating type) + today's goal + key words + board work
 *   3. howItWorksPrompt        — 3-step IKEA-style procedure + teacher says + key fact + worked example
 *   4. guidedPracticePrompt    — teacher model + partner A/B dialogue + circulate + CFU
 *   5. independentPracticePrompt — problems + word problem + weak-learner/challenge differentiation
 *   6. beforeYouGoPrompt       — key facts + exit ticket (4 choices) + homework + tomorrow + coaching CTA
 *
 * Sindh MVP change: baseStyle applies Urdu-primary overlay per Q4 decision —
 * even English/Maths slides get Urdu teacher-dialogue overlay, English preserved
 * for technical terms + textbook student-facing content.
 */

const SUBJECT_META = {
  english: { label: 'English',     color: '#2563eb', strip: '#dbeafe' },
  maths:   { label: 'Maths',       color: '#059669', strip: '#d1fae5' },
  urdu:    { label: 'اردو',        color: '#7c3aed', strip: '#f3e8ff' },
};

const SKILL_LABELS = {
  phonics: 'PHONICS', pre_reading: 'PRE-READING', reading_comprehension: 'READING',
  oral_communication: 'ORAL', vocabulary_grammar: 'VOCAB & GRAMMAR', writing: 'WRITING',
  concrete: 'CONCRETE', pictorial_abstract: 'PICTORIAL', word_problem: 'WORD PROBLEMS',
  retrieval: 'RETRIEVAL', arkaan_saazi: 'ارکان سازی', buland_khwani: 'بلند خوانی',
  tafheem: 'تفہیم', alfaaz_maani: 'الفاظ و معانی', qawaid: 'قواعد',
  takhleeqi_likhai: 'تخلیقی لکھائی', duhrai: 'دہرائی', jumla_saazi: 'جملہ سازی',
};

const CPA_LABELS = {
  concrete: 'CONCRETE — Hands-on with real objects',
  pictorial_abstract: 'PICTORIAL — Diagrams and drawings',
  abstract: 'ABSTRACT — Numbers and symbols',
};

const HOOK_TYPES = ['story', 'mystery', 'challenge', 'real_world', 'game'];
const HOOK_INSTRUCTIONS = {
  story: 'Culturally relevant Pakistani scenario with characters and speech bubbles.',
  mystery: '"Can you guess...?" mystery opener. Present a puzzle or riddle related to today\'s topic.',
  challenge: '"I bet you can\'t..." challenge. Dare students to figure out something related to today\'s content.',
  real_world: '"Have you ever seen..." opener. Connect today\'s topic to something in students\' daily lives.',
  game: '"Let\'s play a quick game..." opener. A 1-minute warm-up game related to today\'s topic.',
};

function getHookType(segmentIndex, chapterNumber) {
  return HOOK_TYPES[(segmentIndex + chapterNumber) % HOOK_TYPES.length];
}

/**
 * Base style — Sindh variant.
 *  - Urdu books: 100% Urdu script, Nastaliq, no diacritics
 *  - English/Maths books: Urdu-primary teacher dialogue overlay (per Q4),
 *    English preserved for student-facing textbook content + technical terms.
 *  - Honorific variant for Sindh: صلی اللہ علیہ وآلہ وسلم (with واله)
 */
function baseStyle(subject, grade, provinceConfig = null) {
  const meta = SUBJECT_META[subject] || SUBJECT_META.english;
  const isUrdu = subject === 'urdu';
  const lpLang = provinceConfig?.rendering?.lp_language || 'urdu';
  const honorific = provinceConfig?.rendering?.honorifics?.prophet || 'صلی اللہ علیہ وآلہ وسلم';

  const fontNote = isUrdu
    ? 'Noto Nastaliq Urdu font for all Urdu text, right-to-left. No diacritics (no zer, zabar, pesh). Clean sans-serif (Nunito/Inter) for English labels. RTL layout for Urdu sections.'
    : 'Clean sans-serif font (Nunito or Inter). LTR layout for English/numerals. Noto Nastaliq Urdu (RTL) for Urdu teacher-dialogue overlays. Both scripts coexist cleanly.';

  const sindhOverlay = !isUrdu && lpLang === 'urdu'
    ? `\nSINDH OVERLAY: Teacher-facing dialogue, warm-up, hook narrative, CFU prompts, and coaching reflection are in URDU (Nastaliq). Student-facing textbook content (numerals, English words being taught, worked-example math) stays in its original language. When referencing the Prophet: use the honorific "${honorific}" exactly (with واله).`
    : (isUrdu ? `\nHonorifics: use "${honorific}" exactly (with واله) for the Prophet.` : '');

  return `Clean flat vector illustration, educational infographic style.
Pakistani Grade ${grade} classroom. White background. Minimal clutter.
Bold simple shapes. High contrast colors.
Dark navy #1e293b header bar. Amber #fbbf24 highlights.
Subject color: ${meta.color}.
${fontNote}${sindhOverlay}
No photography. Crisp digital illustration. Print-ready A4 portrait 3:4 format.`;
}

function progressDotsStr(total, dayNum) {
  const dots = [];
  for (let i = 1; i <= total; i++) {
    if (i < dayNum) dots.push(`[${i}✓]`);
    else if (i === dayNum) dots.push(`[★${i}★]`);
    else dots.push(`[${i}]`);
  }
  return dots.join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 1 — Navigation & Prep
// ═══════════════════════════════════════════════════════════════════
function navigationPrompt(segment, content, nav, provinceConfig) {
  const { chapter_title, subject, grade, skill_type, cpa_phase, page_start } = segment;
  const { dayNum, totalDays, journeySoFar, comingUp } = nav;
  const slo = segment.slo_descriptions?.[0] || content.sloText || `Study ${segment.topic}`;
  const meta = SUBJECT_META[subject] || SUBJECT_META.english;

  let journeyText;
  if (journeySoFar.length === 0) journeyText = 'Starting fresh!';
  else if (journeySoFar.length <= 5) journeyText = journeySoFar.map(j => `Day ${j.dayNum}: ${j.topic} (${j.pages}) ✓`).join('\n  ');
  else {
    const first = journeySoFar.slice(0, 2).map(j => `Day ${j.dayNum}: ${j.topic} (${j.pages}) ✓`);
    const last = journeySoFar.slice(-3).map(j => `Day ${j.dayNum}: ${j.topic} (${j.pages}) ✓`);
    journeyText = [...first, `... (${journeySoFar.length - 5} more days completed)`, ...last].join('\n  ');
  }

  const comingText = comingUp.length > 0
    ? comingUp.map(c => `Day ${c.dayNum}: ${c.topic} (${c.pages})`).join('\n  ')
    : 'Chapter complete!';

  const materials = ['Textbook', 'Chalk and board'];
  if (subject === 'maths' && (skill_type === 'concrete' || cpa_phase === 'concrete'))
    materials.push('Bottle caps or small stones');
  if (subject === 'urdu') materials.push('Slate and chalk (takhti)');

  const skillBadge = SKILL_LABELS[skill_type] || skill_type;
  const cpaBadge = cpa_phase ? ` · ${CPA_LABELS[cpa_phase] || cpa_phase.toUpperCase()}` : '';
  const dots = progressDotsStr(totalDays, dayNum);

  return `${baseStyle(subject, grade, provinceConfig)}

Lesson plan navigation and preparation card. Portrait 3:4.

TOP STRIP (dark navy #1e293b background, upper strip):
  Left: "DAY ${dayNum} OF ${totalDays}" in large amber #fbbf24 text.
  Center: "Grade ${grade} ${meta.label} — ${chapter_title}" in white.
  Right: Progress dots: ${dots}
  Completed dots green with checkmarks. Today's dot filled solid amber/yellow. Future dots hollow.
  Time badge "1 min" as small teal pill in top-right corner of header.

JOURNEY SO FAR section (light green #d1fae5 background):
  Heading "JOURNEY SO FAR" in bold teal.
  List with green ✓ checkmarks:
  ${journeyText}

TODAY box (amber #fbbf24 background, centered):
  "TODAY: ${segment.topic}" in large bold dark navy text.
  Badge below: "${skillBadge}${cpaBadge}" as small navy pill.

COMING UP section (light grey #f3f4f6 background):
  Heading "COMING UP" in gray italic.
  List:
  ${comingText}

SLO strip (teal #059669 background, white text):
  "BY END OF TODAY: ${slo}"

TO PREPARE checklist (light amber #fef3c7 background):
  "TO PREPARE:" heading in bold navy.
  Checklist rows with checkbox icons:
  - Open textbook to page ${page_start}
  - ${materials.join('\n  - ')}

Clean modern dashboard style. Pakistani elementary classroom context.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 2 — Hook + Boardwork
// ═══════════════════════════════════════════════════════════════════
function hookBoardworkPrompt(segment, content, nav, provinceConfig) {
  const { topic, subject, grade, chapter_number, segment_index } = segment;
  const { dayNum } = nav;
  const isUrdu = subject === 'urdu';

  const hookType = getHookType(segment_index, chapter_number);
  const hookInstruction = HOOK_INSTRUCTIONS[hookType];

  const chars = content.hookCharacters || [];
  let charSpec;
  if (chars.length >= 2) {
    charSpec = chars.map(ch => `Character "${ch.name}" (${ch.role}) positioned ${ch.position}: speech bubble says exactly "${ch.speechBubble}"`).join('\n    ');
  } else {
    charSpec = `Scene illustration depicting: ${content.hookStory}`;
  }

  const bwRaw = content.boardWorkRaw;
  const bwInstruction = (bwRaw && bwRaw.instruction) ? bwRaw.instruction : content.boardWork;
  const bwLines = (bwRaw && Array.isArray(bwRaw.content)) ? bwRaw.content : [];
  const kw = (content.keyWords || []).slice(0, 5);
  const urduScriptNote = isUrdu ? '\nAll Urdu text: Noto Nastaliq Urdu font, right-to-left. No diacritics. NOT Devanagari, NOT Hindi.' : '';

  return `${baseStyle(subject, grade, provinceConfig)}

Hook and board work card. Portrait 3:4.${urduScriptNote}

TOP: Amber badge "DAY ${dayNum}" on left. Title "${topic}" in bold dark navy text, large. Time badge "3-5 min" teal pill in top-right corner of header.

TOP SECTION (upper two-thirds):
  WARM-UP REVIEW (2 min, light gray #f3f4f6 background):
    "${content.warmUp}"
    CFU: "Thumbs up if you remember!"

  HOOK (3 min, white background):
    Hook type: ${hookType.toUpperCase()}.
    ${hookInstruction}
    Flat illustration of Pakistani school children in the story scene with:
    ${charSpec}
    Each character has a distinct speech bubble with their text clearly visible.
    Simple flat illustration style — clear speech bubbles, Pakistani clothing, bright colors.

  TODAY'S GOAL + KEY WORDS (two boxes side by side):
    Left box (teal #059669, white text): "TODAY'S GOAL" heading, then: "${segment.slo_descriptions?.[0] || topic}"
    Right box (amber #fbbf24, navy text): "KEY WORDS" heading, then vertical list: ${kw.join(', ')}

BOTTOM SECTION (lower third):
  BOARD WORK (dark navy #1e293b chalkboard-style box, full width):
    "WRITE ON BOARD:" in white amber text header.
    ${bwInstruction}
    ${bwLines.slice(0, 4).join('\n    ')}

Warm encouraging tone. Clean flat illustration. No clutter.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 3 — How It Works (IKEA diagram, 3 steps)
// ═══════════════════════════════════════════════════════════════════
function howItWorksPrompt(segment, content, nav, provinceConfig) {
  const { topic, subject, grade, skill_type, cpa_phase } = segment;
  const isUrdu = subject === 'urdu';
  const isMaths = subject === 'maths';
  const urduScriptNote = isUrdu ? '\nAll Urdu text: Noto Nastaliq Urdu font, right-to-left. No diacritics. NOT Devanagari, NOT Hindi.' : '';

  const steps = (content.steps || []).slice(0, 3);
  const manipulatives = content.manipulatives || '';

  let visualModel;
  if (isMaths && (skill_type === 'concrete' || cpa_phase === 'concrete')) {
    const countMatch = content.workedExample && content.workedExample.match(/\b([1-9])\b/);
    const count = countMatch ? Math.min(parseInt(countMatch[1]), 9) : 3;
    const dots = Array(count).fill('●').join('');
    visualModel = `Visual in worked example: show exactly ${count} amber counting dots (use ASCII dots: ${dots}) as filled circles (#F59E0B, 24px, 4px white outline) in a single horizontal row. Count each dot. Total must equal ${count}. No more, no fewer.`;
  } else if (isMaths) {
    visualModel = `Visual: number line or bar model showing the maths concept from today's lesson.`;
  } else if (isUrdu) {
    visualModel = `Visual: Urdu Nastaliq text excerpt highlighted in amber box, arrows pointing to key letters or syllables.`;
  } else {
    visualModel = `Visual: key words or letters highlighted in amber box, arrows pointing to key features.`;
  }

  return `${baseStyle(subject, grade, provinceConfig)}

IKEA-style instructional diagram. Portrait 3:4. White background.${urduScriptNote}

HEADER BAR: Dark navy #1e293b strip, white text: "${topic} — How It Works". Time badge "8-12 min" teal pill in top-right corner of header.

Generate EXACTLY 3 step panels. Do not add additional panels.

THREE-STEP PROCEDURE (upper half), each step in its own bordered card stacked vertically:
  Step 1 (amber #fbbf24 circle "1" on left): ${steps[0] || ''}
  Step 2 (amber #fbbf24 circle "2" on left): ${steps[1] || ''}
  Step 3 (amber #fbbf24 circle "3" on left): ${steps[2] || ''}
  Downward arrows connecting cards 1 -> 2 -> 3 on the right edge.

TEACHER SAYS (blue #2563eb speech bubble, below steps):
  "${(content.teacherSays || '').substring(0, 200)}"

KEY FACT (amber #fbbf24 callout):
  "${content.keyFact || ''}"

WORKED EXAMPLE + CHECK (bottom area, two columns):
  Left column (teal #d1fae5 background): "WORKED EXAMPLE" label in teal bold.
  Content: "${(content.workedExample || '').substring(0, 200)}"
  ${visualModel}
  Right column (teal #059669 box): "CHECK:" label then: "${content.cfuExplain || ''}"
${manipulatives ? `\nManipulatives note (small amber strip at bottom): "${manipulatives}"` : ''}

Clean, no clutter. Educational. Unambiguous. IKEA-clarity numbered steps.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 4 — Guided Practice (partner activity)
// ═══════════════════════════════════════════════════════════════════
function guidedPracticePrompt(segment, content, nav, provinceConfig) {
  const { topic, subject, grade } = segment;
  const isUrdu = subject === 'urdu';
  const urduScriptNote = isUrdu ? '\nAll Urdu text: Noto Nastaliq Urdu font, right-to-left. No diacritics. NOT Devanagari, NOT Hindi.' : '';

  const paRaw = content.partnerActivityRaw;
  const paInstruction = (paRaw && paRaw.instruction) ? paRaw.instruction : content.partnerActivity;
  const paA = (paRaw && paRaw.dialogueFrameA) ? paRaw.dialogueFrameA : 'Partner A works on the problem.';
  const paB = (paRaw && paRaw.dialogueFrameB) ? paRaw.dialogueFrameB : 'Partner B checks the answer.';

  return `${baseStyle(subject, grade, provinceConfig)}

Guided practice card. Portrait 3:4.${urduScriptNote}

HEADER: "Let's Practice Together! · ${topic}" in teal #059669 bar with white text. Time badge "6-8 min" teal pill in top-right corner of header.

WORKED EXAMPLE (upper portion, light teal #d1fae5 background):
  Teacher models step by step:
  "${(content.workedExample || '').substring(0, 250)}"
  MODEL ANSWER in green #059669 callout box: "${content.modelAnswer || ''}"

PARTNER ACTIVITY (middle portion, white background):
  "WITH YOUR PARTNER:" in bold navy.
  Instruction: "${(paInstruction || '').substring(0, 150)}"
  Two-column dialogue frame below:
    Left column (amber #fbbf24 background): "Partner A:" then "${paA.substring(0, 120)}"
    Right column (teal #d1fae5 background): "Partner B:" then "${paB.substring(0, 120)}"

CIRCULATE (amber #fbbf24 strip, thin):
  "${content.circulateInstruction || 'Walk around: check students are working. Help those who are stuck.'}"

CFU (teal #059669 box at bottom):
  "BEFORE MOVING ON: ${(content.cfuPractice || '').substring(0, 150)}"

Color-coded sections. Pakistani children illustrated in margins.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 5 — Independent Practice
// ═══════════════════════════════════════════════════════════════════
function independentPracticePrompt(segment, content, nav, provinceConfig) {
  const { topic, subject, grade } = segment;
  const isUrdu = subject === 'urdu';
  const urduScriptNote = isUrdu ? '\nAll Urdu text: Noto Nastaliq Urdu font, right-to-left. No diacritics. NOT Devanagari, NOT Hindi.' : '';

  const probs = (content.problems || []).slice(0, 3);
  const wordP = content.wordProblem || '';

  return `${baseStyle(subject, grade, provinceConfig)}

Independent practice card. Portrait 3:4.${urduScriptNote}

HEADER: "Your Turn! · ${topic}" in amber #fbbf24 bar with dark navy text. Time badge "6-10 min" teal pill in top-right corner of header.

PROBLEMS (upper half):
  Bold heading "YOUR TURN" in amber.
  Problems stacked vertically, each in an amber-bordered box with a dotted answer space below:
  ${probs.map((p, i) => `${i + 1}. ${p}`).join('\n  ')}
  Answer boxes shown as dotted rectangles next to each problem.
${wordP ? `
WORD PROBLEM (light gray #f3f4f6 card):
  "${wordP}"
  Pakistani context with local names, Rs., bazaar, cricket references.
` : ''}
DIFFERENTIATION (bottom portion):
  LEFT (amber #f59e0b box with "Need help?" label):
    "${content.weakLearnerSupport || content.weakLearner || ''}"
  RIGHT (purple #7c3aed box with "Challenge!" label, white text):
    "${content.challengeExtension || content.challenge || ''}"

CIRCULATE strip (thin amber): "Support struggling learners. Check notebooks."

Color-coded differentiation. Print-ready.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 6 — Before You Go (exit ticket + coaching corner)
// ═══════════════════════════════════════════════════════════════════
function beforeYouGoPrompt(segment, content, nav, provinceConfig) {
  const { topic, subject, grade } = segment;
  const { comingUp } = nav;
  const isUrdu = subject === 'urdu';
  const urduScriptNote = isUrdu ? '\nAll Urdu text: Noto Nastaliq Urdu font, right-to-left. No diacritics. NOT Devanagari, NOT Hindi.' : '';

  const kf = (content.keyFacts || []).slice(0, 3);
  const choices = (content.exitTicketChoices || content.exitChoices || ['Option A', 'Option B', 'Option C', 'Option D']).slice(0, 4);
  const exitQuestion = content.exitTicketQuestion || content.exitTicket || '';

  const baseCoaching = content.coachingReflection || 'How well did students understand today\'s lesson?';
  const cleanedCoaching = baseCoaching.replace(/Record yourself.*?feedback!/gi, '').trim();
  const coachingCTA = `${cleanedCoaching}\nWhatsApp Rumi on 0XXX XXXXXXX for personalized coaching feedback!`;

  const nextTopicText = comingUp.length > 0
    ? `Tomorrow (${comingUp[0].pages}): ${comingUp[0].topic}`
    : content.nextTopicPreview || content.nextTopic || 'Chapter complete!';

  return `${baseStyle(subject, grade, provinceConfig)}

Exit ticket and lesson wrap-up card. Portrait 3:4.${urduScriptNote}

TOP AREA (two columns side by side):
  Left column (dark navy #1e293b background):
    Title "KEY FACTS TO REMEMBER" in amber #fbbf24 at top.
    List in white text:
    ${kf.map(f => `✓ ${f}`).join('\n    ')}
    Pakistani child character at bottom giving thumbs up.

  Right column (white background):
    Title "Before You Go!" in dark navy bold text.
    EXIT TICKET (amber #fbbf24 card): "${exitQuestion}"
    Four answer buttons as rounded rectangles:
    ${choices.map((c, i) => `${String.fromCharCode(65 + i)}: ${c}`).join(' | ')}
    Correct answer button highlighted in green #059669.

BOTTOM STRIP (full width, three sections stacked):
  Section 1 (light grey): "HOMEWORK:" bold, then "${(content.homework || '').substring(0, 200)}"
  Section 2 (teal #059669): "COMING UP TOMORROW: ${nextTopicText}" with arrow icon ->
  Section 3 (light amber #fef3c7): "COACHING CORNER:" then "${coachingCTA.substring(0, 400)}"
    Small Rumi logo watermark bottom-right of coaching corner.

Time badge "2-5 min" as teal pill in top-right corner of header.

Clean friendly quiz-card style. Encouraging and celebratory.`;
}

const V7_TEMPLATES = {
  navigation: navigationPrompt,
  hook_boardwork: hookBoardworkPrompt,
  how_it_works: howItWorksPrompt,
  guided_practice: guidedPracticePrompt,
  independent_practice: independentPracticePrompt,
  before_you_go: beforeYouGoPrompt,
};

module.exports = {
  V7_TEMPLATES,
  baseStyle,
  progressDotsStr,
  getHookType,
  SUBJECT_META,
  SKILL_LABELS,
  CPA_LABELS,
  HOOK_TYPES,
  HOOK_INSTRUCTIONS,
  navigationPrompt,
  hookBoardworkPrompt,
  howItWorksPrompt,
  guidedPracticePrompt,
  independentPracticePrompt,
  beforeYouGoPrompt,
};
