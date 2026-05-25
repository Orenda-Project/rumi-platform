/**
 * Universal Grade Calibration Framework
 *
 * Drives how LP content density, vocabulary load, pacing, and differentiation
 * adapt across grades — without changing the LP's visual sections (Hook, Big
 * Idea, I-Do, We-Do, You-Do, Board Work, Exit Ticket, Coaching).
 *
 * Universal: works for any market on a K-10-style scale. No country-specific
 * assumptions.
 *
 * 15-axis per-band rubric injected as a prompt block.
 *
 * Pedagogical grounding:
 *   - Anderson & Krathwohl 2001 — Bloom's Revised Taxonomy
 *   - Webb 1997 — Depth of Knowledge (DOK 1-4)
 *   - Piaget cognitive stages — concrete operational → formal operational
 *   - Tomlinson differentiation — content × process × product × environment
 */

const REQUIRED_AXES = [
  'label',
  'grades',
  'pacingMin',
  'vocabLoad',
  'sentenceLength',
  'hookRegister',
  'bigIdeaShape',
  'iDoExamples',
  'iDoStyle',
  'weDoFormat',
  'youDoCount',
  'youDoDOK',
  'boardWork',
  'exitTicket',
  'diffLow',
  'diffHigh',
  'cfuCadence',
  'eslSupport',
  'coachingTipFocus',
  'bloomCeiling',
  'dokRange',
];

const CALIBRATION_BANDS = {
  foundation: {
    label: 'Foundation',
    grades: [1, 2],
    bloomCeiling: 'Understand',
    dokRange: '1-2',
    pacingMin: { hook: 5, goal: 1, bigIdea: 3, iDo: 5, weDo: 8, youDo: 6, exit: 2, wrap: 5 },
    vocabLoad: '2-3 new words per lesson, mostly Tier 1 (everyday)',
    sentenceLength: '4-6 words, simple subject-verb-object',
    hookRegister: 'Curiosity question in 1 short clause, concrete object referent (no abstractions)',
    bigIdeaShape: '1-2 sentences each, picture-anchored, no abstract concepts',
    iDoExamples: 5,
    iDoStyle: 'Explicit, fully-scaffolded examples. Teacher reads each aloud and demonstrates.',
    weDoFormat: 'Choral response with manipulatives in hand, call-and-response chants',
    youDoCount: 3,
    youDoDOK: 'DOK 1 only (recall, identify) with picture cues attached',
    boardWork: '3 fully worked examples (no blanks), pictures next to each',
    exitTicket: '1 factual question with picture cue, answer in 3 words or fewer',
    diffLow: 'Visual + verbal cue, partner support, manipulative in hand',
    diffHigh: '1 extension problem with slightly harder context (bigger numbers, more objects)',
    cfuCadence: 'Every 2-3 min: choral response, thumbs up/down, point-to-answer',
    eslSupport: 'Heavy L1 (mother tongue) scaffolding. Bilingual labels. Picture-text matching. Code-switching to L1 is encouraged.',
    coachingTipFocus: 'Phonics, concept of print, read-aloud techniques',
  },

  building: {
    label: 'Building',
    grades: [3, 4, 5],
    bloomCeiling: 'Apply',
    dokRange: '1-3',
    pacingMin: { hook: 4, goal: 1, bigIdea: 3, iDo: 6, weDo: 8, youDo: 7, exit: 1, wrap: 5 },
    vocabLoad: '4-6 new words per lesson, Tier 1 + early Tier 2 academic',
    sentenceLength: '8-12 words, one subordinate clause OK',
    hookRegister: 'Curiosity question linked to a familiar real-world situation',
    bigIdeaShape: '2-3 sentences each, one abstract concept introduced',
    iDoExamples: 3,
    iDoStyle: 'Explicit examples with teacher narrating the reasoning out loud',
    weDoFormat: 'Partner-talk + mini-whiteboard responses, anchor-chart reference',
    youDoCount: 5,
    youDoDOK: 'Mix of DOK 1-2 (apply a familiar procedure, identify, classify)',
    boardWork: '3 worked examples — last one has a "your turn" prompt',
    exitTicket: '1 factual + 1 simple-reasoning question, full-sentence answers',
    diffLow: 'Sentence frames + word bank, anchor-chart reference, partner pairing',
    diffHigh: '1 multi-step problem requiring synthesis of two skills',
    cfuCadence: 'Every 4 min: think-pair-share, mini-whiteboard, exit poll',
    eslSupport: 'Sentence frames in L2 with L1 support available. Code-switching OK for clarification. Vocabulary preview at lesson start.',
    coachingTipFocus: 'Vocabulary instruction routines, comprehension monitoring',
  },

  deepening: {
    label: 'Deepening',
    grades: [6, 7, 8],
    bloomCeiling: 'Evaluate',
    dokRange: '2-3',
    pacingMin: { hook: 3, goal: 1, bigIdea: 4, iDo: 7, weDo: 8, youDo: 6, exit: 1, wrap: 5 },
    vocabLoad: '6-8 new words per lesson, Tier 2 + content-specific Tier 3',
    sentenceLength: '12-15 words, multiple clauses, transition words',
    hookRegister: 'Provocative question that surfaces a common misconception',
    bigIdeaShape: '3-4 sentences each, names the cognitive obstacle (what kids get wrong, why)',
    iDoExamples: 2,
    iDoStyle: 'Examples with guided questioning ("What do we do next? Why?")',
    weDoFormat: 'Think-pair-share + cold call + written responses on small boards',
    youDoCount: 6,
    youDoDOK: 'Mix of DOK 2-3 (multi-step problems + reasoning + comparison)',
    boardWork: '3 examples graded by complexity: 1 worked, 1 guided, 1 challenge',
    exitTicket: '1 application + 1 analysis question, short-paragraph answers',
    diffLow: 'Worked-example reference card, vocabulary preview list',
    diffHigh: '1 problem requiring justification beyond procedure (defend your answer)',
    cfuCadence: 'Every 5 min: cold call, written response, peer check',
    eslSupport: 'Academic vocabulary made explicit. L1 used only for clarification of content-specific terms. Note-taking modeled.',
    coachingTipFocus: 'Discourse-based learning, academic language scaffolds',
  },

  application: {
    label: 'Application',
    grades: [9, 10],
    bloomCeiling: 'Create',
    dokRange: '2-4',
    pacingMin: { hook: 3, goal: 1, bigIdea: 4, iDo: 6, weDo: 8, youDo: 7, exit: 1, wrap: 5 },
    vocabLoad: '8-10 new words per lesson, Tier 3 academic register dominant',
    sentenceLength: '15+ words, complex sentences, conditional and hypothetical structures',
    hookRegister: 'Open-ended question demanding a hypothesis, evaluation, or original take',
    bigIdeaShape: '4-5 sentences each, framed within a broader principle or domain context',
    iDoExamples: 1,
    iDoStyle: '1-2 examples, focus on reasoning not procedure ("Why this approach over the alternative?")',
    weDoFormat: 'Socratic dialogue + written justification + peer feedback',
    youDoCount: 7,
    youDoDOK: 'Mix of DOK 2-4 (multi-step + justification + open-ended + synthesis)',
    boardWork: '3 examples graded by difficulty, 1 marked "stretch" (open-ended)',
    exitTicket: '1 evaluation + 1 justification question, paragraph answer with cited evidence',
    diffLow: 'Step-by-step problem-solving template, scaffolded reasoning prompts',
    diffHigh: '1 open-ended problem with multiple valid approaches, asked to compare',
    cfuCadence: 'Every 5-7 min: cold call with justification, written paragraph, peer feedback',
    eslSupport: 'L2 dominant. Academic register expected. L1 used only for highly content-specific Tier-3 terms.',
    coachingTipFocus: 'Inquiry-based facilitation, debate moderation, real-world application',
  },
};

/**
 * @param {number|string} grade
 * @returns {'foundation' | 'building' | 'deepening' | 'application'}
 */
function gradeBandFor(grade) {
  const g = typeof grade === 'string' ? parseInt(grade, 10) : grade;
  if (!Number.isFinite(g) || g < 3) return 'foundation';
  if (g <= 5) return 'building';
  if (g <= 8) return 'deepening';
  return 'application'; // 9+ including grades above 10 (defensive)
}

/**
 * @param {number|string} grade
 * @returns {object} The full calibration block for the band that contains this grade.
 */
function gradeCalibration(grade) {
  return CALIBRATION_BANDS[gradeBandFor(grade)];
}

/**
 * Render the calibration block as a string for direct injection into LP prompts.
 * Used by both the pic-LP image-gen prompt and the text-LP (Gamma) prompt.
 *
 * Token budget: <= ~350 tokens (~1500 chars).
 *
 * @param {number|string} grade
 * @returns {string}
 */
function renderCalibrationBlock(grade) {
  const c = gradeCalibration(grade);
  const p = c.pacingMin;
  const pacingLine = `Hook ${p.hook} / Goal ${p.goal} / Big Idea ${p.bigIdea} / I-Do ${p.iDo} / We-Do ${p.weDo} / You-Do ${p.youDo} / Exit ${p.exit} / Wrap ${p.wrap} (35 min total)`;

  return [
    `GRADE CALIBRATION (${c.label} band, Grade ${grade}):`,
    `Cognitive: Bloom's ceiling = ${c.bloomCeiling}. Webb's DOK ${c.dokRange}.`,
    `Pacing (minutes per section): ${pacingLine}.`,
    `Vocab load: ${c.vocabLoad}.`,
    `Sentence length in LP body: ${c.sentenceLength}.`,
    `Hook speech-bubble register: ${c.hookRegister}.`,
    `Big Idea paragraphs: ${c.bigIdeaShape}.`,
    `I-Do worked examples: ${c.iDoExamples}. ${c.iDoStyle}`,
    `We-Do format: ${c.weDoFormat}.`,
    `You-Do practice: ${c.youDoCount} problems. ${c.youDoDOK}.`,
    `Board Work: ${c.boardWork}.`,
    `Exit Ticket: ${c.exitTicket}.`,
    `Differentiation for struggling students: ${c.diffLow}.`,
    `Differentiation for advanced students: ${c.diffHigh}.`,
    `CFU cadence: ${c.cfuCadence}.`,
    `ESL/EAL language demand (where the lesson language is a second language for the class): ${c.eslSupport}.`,
    `Coaching Corner tip emphasis: ${c.coachingTipFocus}.`,
  ].join('\n');
}

module.exports = {
  gradeBandFor,
  gradeCalibration,
  renderCalibrationBlock,
  CALIBRATION_BANDS,
  REQUIRED_AXES,
};
