/**
 * Lesson Plan Template Service
 *
 * SINGLE SOURCE OF TRUTH for the text/Gamma lesson-plan framework.
 *
 * Before this service existed, the framework was defined THREE times inside
 * content.service.js `_generateGammaContent`, and the three copies disagreed:
 *   1. a ~70-line inline section list (## 1 … ## 9) in `inputText`,
 *   2. `numCards: 7` (a Gamma card-count knob), and
 *   3. `additionalInstructions` that said "Include all 9 sections".
 *
 * Customizers ("use our school's 5E model instead of the 9-section structure")
 * had to find and reconcile all three. Now they edit ONE file: this one.
 *
 * ── The framework ──────────────────────────────────────────────────────────
 * The lesson plan follows an evidence-based 9-section structure whose middle
 * five sections (4–8) ARE the 5E instructional model (Engage, Explore, Explain,
 * Elaborate, Evaluate), wrapped by Objectives/Overview/Materials up front and a
 * Differentiation section at the end. Sections 4–8 carry the 5E labels inline.
 *
 * ── numCards vs. section count (the resolved 7-vs-9 confusion) ───────────────
 * SECTION_COUNT (9) is how many `## N` headings the prompt asks Gamma to render
 * and what `additionalInstructions` references — these two MUST agree.
 *
 * `numCards` (7) is a SEPARATE Gamma knob: a soft hint for how many slide-cards
 * Gamma lays the document out across. It is intentionally NOT the section count
 * — Gamma groups the 9 sections onto ~7 cards. It is preserved at 7 to keep the
 * generated Gamma output byte-equivalent to the pre-extraction behavior.
 */

// The 9-section framework body. Sections 4–8 are the 5E model.
// This is the EXACT text previously inlined in content.service.js, verbatim.
const SECTIONS_BLOCK = `## 1. LEARNING OBJECTIVES & SUCCESS CRITERIA
- 2-3 clear, measurable learning objectives aligned with curriculum standards
- Student-friendly success criteria ("I can..." statements)
- Connection to prior knowledge and real-world applications

## 2. LESSON OVERVIEW
- Grade level and subject
- Duration (typically 40-60 minutes)
- Key concepts and vocabulary
- Prerequisites

## 3. MATERIALS & PREPARATION
- Required materials (emphasize low-cost, locally available resources)
- Teacher preparation steps
- Student handouts or worksheets needed
- Technology/digital resources (if applicable)

## 4. INTRODUCTION (ENGAGE) [8-10 minutes]
- Hook/attention-grabber to activate prior knowledge
- Essential question for the lesson
- Learning objectives shared with students
- Connection to students' lives and experiences

## 5. EXPLORATION/INVESTIGATION [15-20 minutes]
- Hands-on activity or investigation for students to explore the concept
- Guiding questions for teachers to ask
- What students should observe/discover
- Group work or pair work structures
- Common misconceptions to address

## 6. EXPLANATION/DIRECT INSTRUCTION [10-15 minutes]
- Clear, step-by-step explanation of key concepts
- Visual aids, diagrams, or models to use
- Examples and non-examples
- Vocabulary definitions with context
- Teacher modeling and think-aloud strategies

## 7. ELABORATION/GUIDED PRACTICE [10-15 minutes]
- Structured practice activities progressing from simple to complex
- Scaffolding strategies for struggling learners
- Extension challenges for advanced students
- Real-world application tasks
- Collaborative learning opportunities

## 8. EVALUATION/FORMATIVE ASSESSMENT [5-10 minutes]
- Formative assessment strategy (exit ticket, quick quiz, demonstration, etc.)
- Questions to check for understanding throughout the lesson
- Success criteria checklist
- Homework assignment (if applicable)
- Preview of next lesson

## 9. DIFFERENTIATION STRATEGIES
- Support for struggling learners (scaffolds, sentence frames, visual aids)
- Extensions for advanced students (depth, complexity, independent research)
- Language support for multilingual learners
- Modifications for students with special needs
- Alternative assessment options`;

// How many `## N` sections the framework above defines. Single source for the
// number quoted in additionalInstructions — derived, not hardcoded a 2nd time.
const SECTION_COUNT = (SECTIONS_BLOCK.match(/^## \d+\./gm) || []).length;

// Gamma slide-card layout hint (NOT the section count). See header note.
const NUM_CARDS = 7;

// The trailing instructional block appended after the section list. Verbatim.
const FRAMEWORK_TRAILER = `Throughout the lesson plan, include:
- Specific dialogue examples for teachers
- Transition phrases between activities
- Time allocations for each section
- Questioning strategies (open-ended, probing, wait time)
- Classroom management tips for large/mixed-ability classes
- Formative assessment checkpoints

Make this practical, detailed, and immediately usable by teachers with varying experience levels.`;

/**
 * Build the lesson-plan prompt pieces from the single framework source.
 *
 * @param {object} [params]
 * @param {string} [params.language]  Language code (reserved for future
 *        per-language framework tweaks; the section framework is currently
 *        language-agnostic — the language-specific intro/suffix are owned by
 *        gamma-languages.config and applied by the caller).
 * @param {number|string} [params.grade]    Reserved; not yet woven into the
 *        framework body (grade calibration is a separate, pic-LP-only path).
 * @param {string} [params.subject]          Reserved; see grade.
 * @returns {{ inputText: string, numCards: number, additionalInstructions: string, sectionCount: number }}
 *   - inputText: the framework body to embed in the Gamma document prompt
 *     (the section list + the reinforcement trailer).
 *   - numCards: Gamma card-layout hint (7).
 *   - additionalInstructions: the "preserve structure, include all N sections"
 *     instruction, with N sourced from SECTION_COUNT (no hardcoded 2nd copy).
 *   - sectionCount: SECTION_COUNT (9), exposed for tests/consumers.
 */
function buildLessonPlanPrompt({ language, grade, subject } = {}) {
  const { classroomContextFor } = require('./pedagogy/lp-localization.service');
  const context = classroomContextFor(language); // e.g. 'Pakistani', 'Indian', 'local'
  const inputText = `This lesson plan should follow evidence-based pedagogical frameworks and be suitable for teachers in ${context} classrooms (mixed-ability, limited resources). Structure the plan with these sections:

${SECTIONS_BLOCK}

${FRAMEWORK_TRAILER}`;

  const additionalInstructions =
    `Maintain the exact structure and formatting provided in the prompt. ` +
    `Include all ${SECTION_COUNT} sections with clear headings. ` +
    `Preserve all bullet points, time allocations, and instructional details. ` +
    `Do not summarize or condense the content.`;

  return {
    inputText,
    numCards: NUM_CARDS,
    additionalInstructions,
    sectionCount: SECTION_COUNT,
  };
}

module.exports = {
  buildLessonPlanPrompt,
  SECTION_COUNT,
  NUM_CARDS,
};
