# Agent-First Customization Guide

This guide is designed for teams using **Cursor**, **Claude Code**, or similar AI-assisted IDEs. Each section maps a customization goal to the exact files, functions, and patterns you need to change.

**How to use this guide**: Tell your AI assistant "I want to [goal]" and point it at the relevant section. Every section includes the file map, the change pattern, and what to test afterward.

---

## Table of Contents

1. [Swap the Coaching Framework](#1-swap-the-coaching-framework)
2. [Change Reading Assessment Methodology](#2-change-reading-assessment-methodology)
3. [Modify Lesson Plan Templates](#3-modify-lesson-plan-templates)
4. [Add or Change Languages](#4-add-or-change-languages)
5. [Switch LLM Provider or Model](#5-switch-llm-provider-or-model)
6. [Customize the Scoring Rubric](#6-customize-the-scoring-rubric)
7. [Add a New Feature](#7-add-a-new-feature)
8. [Change Assessment Benchmarks](#8-change-assessment-benchmarks)
9. [Modify the Reflective Conversation](#9-modify-the-reflective-conversation)
10. [Customize Report Generation](#10-customize-report-generation)
11. [Rebrand the Bot](#11-rebrand-the-bot)
12. [Add a New Background Job Type](#12-add-a-new-background-job-type)

---

## 1. Swap the Coaching Framework

**Example prompt**: "I want to use the Teach framework instead of the OECD framework for classroom observations"

### Architecture Overview

The coaching pipeline has 5 stages. The framework is injected at stage 3 (analysis):

```
1. Audio Upload → 2. Transcription → 3. Analysis (FRAMEWORK HERE) → 4. Reflective Conversation → 5. Report
```

### File Map

| File | What It Does | What to Change |
|------|-------------|----------------|
| `bot/shared/services/gpt5-mini.service.js` | Contains the framework prompt in `getCachedFrameworkPrompt()` (~170 lines of rubric) | **Primary**: Replace the entire OECD rubric text with your framework |
| `bot/shared/constants/scoring.constants.js` | Defines max marks: `CLASSROOM_MARKS_BASE=103`, `DEBRIEF_MARKS=15` | Update totals to match your new rubric |
| `bot/shared/services/coaching/analysis-processor.service.js` | Orchestrates the analysis pipeline | Usually no changes needed |
| `bot/shared/services/coaching/reflective-conversation.service.js` | Generates reflective questions based on analysis | May need prompt adjustments if your framework uses different terminology |
| `bot/shared/services/coaching/report-generator.service.js` | Orchestrates report generation from analysis data | Update section headers, chart labels |
| `bot/shared/services/coaching/report-renderers/renderer-registry.js` | Maps framework → report renderer (the seam) | Register a renderer for a new framework |
| `bot/shared/services/pdf-report.service.js` | Default PDFKit layout (OECD/HOTS/TEACH/FICO) | Update report structure if your rubric has different goals |

### Step-by-Step

#### Step 1: Replace the Framework Prompt

Open `bot/shared/services/gpt5-mini.service.js` and find `getCachedFrameworkPrompt()` (around line 149). This is a single method that returns the entire framework as a string. Replace the content between the backticks:

```javascript
static getCachedFrameworkPrompt() {
  return `You are an expert [YOUR CONTEXT] teacher...

OBSERVATION FRAMEWORK: [YOUR FRAMEWORK NAME]

Reference: [YOUR REFERENCE]

**DOMAIN 1: [YOUR FIRST DOMAIN]** (X criteria, Y marks total)

1. **[Criterion Name]** (Z marks)
   - Level 1: [Description]
   - Level 2: [Description]
   - Level 3: [Description]

// ... continue for all domains ...

**TOTAL: [X] marks maximum**

[YOUR CONTEXT CONSIDERATIONS]

CONVERSATIONAL FRAMEWORK: [YOUR CONVERSATION APPROACH]
// Keep the S.T.I.C.K.S. principles or replace with your own
`;
}
```

**Key constraint**: The LLM expects the response in a specific JSON structure. Find `_buildAnalysisPrompt()` in the same file (~line 636) and update the JSON schema to match your framework's domains.

#### Step 2: Update Scoring Constants

Edit `bot/shared/constants/scoring.constants.js`:

```javascript
const CLASSROOM_MARKS_BASE = 100;  // Your framework's total marks
const LP_CRITERIA_MARKS = 0;       // Additional marks when lesson plan is available (0 if N/A)
const CLASSROOM_MARKS_WITH_LP = CLASSROOM_MARKS_BASE + LP_CRITERIA_MARKS;
const DEBRIEF_MARKS = 15;          // Keep or adjust for reflective section
```

#### Step 3: Update the Analysis JSON Schema

In `gpt5-mini.service.js`, find `_buildAnalysisPrompt()`. The JSON structure it requests from the LLM must match your framework. Update the `goals` array structure:

```javascript
"goals": [
  {
    "name": "Your Domain 1 Name",
    "criteria": [
      {
        "name": "Criterion Name",
        "score": <number>,
        "max_score": <number>,
        "level": <1-3>,
        "evidence": "Specific transcript evidence",
        "recommendation": "Actionable suggestion"
      }
    ]
  }
]
```

#### Step 4: Update Report Templates

In `bot/shared/services/pdf-report.service.js`, search for goal/domain headers (they reference "FORMATIVE ASSESSMENT", "STUDENT ENGAGEMENT", etc.) and replace with your framework's domain names.

### Testing

```bash
# Run the coaching-related tests
npm test -- --testPathPattern="coaching"

# Use the CLI simulator to test an end-to-end coaching flow
cd bot && npm run simulate
```

### Example: Teach Framework Swap

If using the World Bank's Teach framework, your domains would be:
- Time on Task
- Culture of Learning
- Instruction (with sub-domains: Autonomy, Feedback, Checks for Understanding)
- Socioemotional Skills

Replace each OECD goal with the corresponding Teach domain, update the rubric levels, and adjust the total marks.

---

## 2. Change Reading Assessment Methodology

**Example prompt**: "I want to use ASER methodology instead of DIBELS/EGRA for reading assessment"

### Architecture Overview

```
1. Passage Generation → 2. Student Reads Aloud → 3. Transcription → 4. Analysis (BENCHMARKS HERE) → 5. Report
```

### File Map

| File | What It Does | What to Change |
|------|-------------|----------------|
| `bot/shared/services/reading/passage-generation.service.js` | Generates grade-appropriate reading passages using GPT-4 | Change passage difficulty criteria, word counts, language level |
| `bot/shared/services/reading/analysis.service.js` | Orchestrates the full analysis pipeline; `compareToBenchmarks` reads benchmark status from the JS service below | Update the pipeline steps |
| `bot/shared/config/reading-benchmarks.js` | **Single source of truth for benchmark THRESHOLD NUMBERS** (WCPM percentiles + LCPM benchmarks, by grade × language × season) | **Change the threshold numbers here** — no SQL migration needed |
| `bot/shared/services/reading/benchmark.service.js` | `getBenchmarkStatus(...)` — config-driven benchmark comparison; mirrors the SQL RPC shape | Usually leave as-is; it just reads the config |
| `bot/shared/services/reading/fluency.service.js` | Calculates the raw WCPM/accuracy numbers from the transcript (it holds **no** benchmark thresholds) | Change how the metric is *computed*, not the benchmark targets |
| `bot/shared/services/reading/pronunciation.service.js` | Phoneme-level pronunciation scoring | Adjust scoring criteria |
| `bot/shared/services/reading/comprehension.service.js` | Comprehension question generation and scoring | Update question types |
| `bot/shared/services/reading/auto-level-orchestrator.service.js` | Auto-leveling algorithm (adjusts difficulty) | Update leveling logic for your methodology |
| `bot/shared/services/reading/report.service.js` | Generates reading assessment reports | Update report format and metrics displayed |

### Two depths of change: NUMBERS vs SHAPE

- **Threshold NUMBERS** (e.g. "Grade 2 on-track is 80 WCPM, not 68") — this is now a **config edit**. Open `bot/shared/config/reading-benchmarks.js`, change the number, done. `benchmark.service.js` reads the config and `analysis.service.js` `compareToBenchmarks` uses it as the source of truth. The SQL RPCs (`check_benchmark_status` / `check_lcpm_benchmark_status`) and their seed tables (`wcpm_percentiles`, `lcpm_benchmarks`) stay in the DB for integrity and remain available as a documented fallback (set `READING_BENCHMARKS_USE_RPC=1` to route through them) — but the JS config is authoritative for the in-app comparison.
- **The metric SHAPE** (e.g. WCPM/LCPM → ASER's 5 reading levels) — this is still a **deeper, schema-bound change**. The metric type, the report surface, and the RPC return shape all assume a per-minute fluency number. Moving to ASER levels means changing the computed metric in `fluency.service.js`, the report in `report.service.js`, and the benchmark return shape — not just a config number.

### Step-by-Step (ASER Example — a SHAPE change)

#### Step 1: Change the Assessment Levels

ASER uses 5 levels: Nothing → Letter → Word → Paragraph → Story. In `fluency.service.js` (where the raw metric is computed), replace WCPM-based scoring with level-based categorization:

```javascript
// Replace WCPM benchmarks with ASER levels
const ASER_LEVELS = {
  nothing: { id: 0, label: 'Beginner', description: 'Cannot read letters' },
  letter: { id: 1, label: 'Letter', description: 'Can recognize letters' },
  word: { id: 2, label: 'Word', description: 'Can read words' },
  paragraph: { id: 3, label: 'Paragraph', description: 'Can read paragraphs' },
  story: { id: 4, label: 'Story', description: 'Can read connected text fluently' },
};
```

#### Step 2: Update Passage Generation

In `passage-generation.service.js`, modify the GPT prompt that generates reading passages to match your assessment levels. Search for the passage generation prompt and update the difficulty criteria.

#### Step 3: Update the Report

In `report.service.js`, update the metrics displayed (e.g., show ASER level instead of WCPM score).

### Testing

```bash
npm test -- --testPathPattern="reading"
cd bot && npm run simulate
# Then type: /reading test
```

#### Step 4: Customize the Pic-to-LP Illustrated Template

The pic-to-LP feature renders a 2-page **illustrated** lesson plan via an image
model. Its layout and visual style live entirely in
`bot/shared/services/pic-to-lp/kieai-prompt-builder.service.js`. Three single
sources of truth control it:

| Surface | Where | What it controls |
|---------|-------|------------------|
| **Section structure** | `SECTION_REGISTRY` | The ordered list of LP sections (`Warm-Up → Hook → Big Idea → Today's Goal → Key Words → I Do → Board Work` on page 1; `We Do → You Do → Differentiation → Exit Ticket → Coaching Corner` on page 2), each tagged with its page, label key, and pedagogical `role`. This documents the canonical I-Do/We-Do/You-Do gradual-release order in **one** place. |
| **Section labels** | `structuralLabelsFor(language)` | The per-language heading text for each section. Both the English-body and Urdu-body prompt templates read labels from here via `sectionLabel(labelKey, language)`, so the two paths cannot drift. Add a language by adding a case (sw/ar already translate every label; en/sd/pa/ur use the English set). |
| **Visual style** | `THEME` | Palette hexes (`headerNavy`, `amber`), fonts (`latin` + per-script font-rule lines), paper format, and the reference-image role lines. **Rebranding the illustrated LP is editing this one object.** |

To rebrand colors/fonts: edit `THEME`. To rename or reorder sections: edit the
`SECTION_REGISTRY` order and the matching `structuralLabelsFor` label.

> **Output-contract warning.** The strings emitted by this builder are the
> literal image-model prompt — changing any value in `THEME`,
> `structuralLabelsFor`, or the inline template bodies **changes the rendered
> image**. The structure was deliberately refactored so section order/labels and
> style are *data* (registry + theme) rather than four hand-aligned copies, but
> some layout prose still lives inline in the four template literals
> (`buildPage1Prompt` / `buildPage2Prompt`, English-body + Urdu-body). After any
> edit, run the conformance guards:
>
> ```bash
> node tests/run.js tests/pic-to-lp/section-registry.test.js
> node tests/run.js tests/pic-to-lp/flow-options-sync.test.js
> ```
>
> The dropdown options the teacher confirms (grade / subject / language) live in
> `flow-options.js` and are mirrored into `docs/flows/pic-lp-confirm-flow.json`;
> the sync test keeps the two in lockstep.

---

## 3. Modify Lesson Plan Templates

**Example prompt**: "I want lesson plans to follow our school's 5E model instead of the 9-section structure"

There are **two independent** lesson-plan template surfaces: the **text LP** (the PDF/Gamma "9-section" document — customized by Steps 1-3 here) and the **pic-to-LP** illustrated 2-page plan (customized in [Step 4](#step-4-customize-the-pic-to-lp-illustrated-template) below). They do not share a template.

### File Map

| File | What It Does |
|------|-------------|
| `bot/shared/services/lesson-plan-template.service.js` | **Primary**. The single source of truth for the LP framework: `buildLessonPlanPrompt({ language, grade, subject })` returns `{ inputText, numCards, additionalInstructions, sectionCount }`. The section list, the Gamma card-count hint, and the reinforcement instruction all live here. |
| `bot/shared/services/content.service.js` | Calls `buildLessonPlanPrompt(...)` from `_generateGammaContent` and wraps it with the language-specific intro/suffix before sending to Gamma. |
| `bot/workers/lesson-plan-generation.worker.js` | Background job that calls `ContentService.generateLessonPlan(...)` to run the Gamma API. |
| `bot/shared/config/capabilities.config.js` | User-facing description of the lesson plan feature. |

> **Note on visual layout**: The text path produces a structured Markdown prompt; the **visual layout of the PDF (cards, fonts, images) is owned by Gamma**, not by any in-repo template. There is no local HTML/CSS/PDF template to edit for the text path. `numCards` is a soft Gamma hint for how many slide-cards to lay the document across — it is intentionally distinct from the section count. To control visual appearance, adjust `numCards`, `textOptions`, and `imageOptions` in `content.service.js`, or switch the path to a different renderer.

### Step-by-Step

#### Step 1: Edit the framework (one file)

Open `bot/shared/services/lesson-plan-template.service.js`. Replace the `SECTIONS_BLOCK` literal with your model — e.g. a pure 5E structure:

```javascript
const SECTIONS_BLOCK = `## 1. ENGAGE
- Hook activity to capture interest

## 2. EXPLORE
- Hands-on investigation

## 3. EXPLAIN
- Direct instruction and concept clarification

## 4. ELABORATE
- Extension activities

## 5. EVALUATE
- Assessment of learning`;
```

`SECTION_COUNT` is **derived** from the headings (it counts `## N.` lines), and `additionalInstructions` quotes that same count — so changing the section list automatically keeps the "include all N sections" instruction in sync. There is no second place to update.

#### Step 2: (Optional) Adjust the Gamma layout hint

If your new structure wants a different number of slide-cards, change `NUM_CARDS` in the same file. Leave it as-is to preserve current behavior.

#### Step 3: Update Capability Description

In `capabilities.config.js`, update the lesson plan description to reflect your new format:

```javascript
description: {
  en: 'Lesson plans using the 5E instructional model in PDF format',
  // ... other languages
}
```

> Path selection (which LP a text request gets) is handled by a synchronous intercept in `text-message.handler.js`, documented in [LP_PATHS.md](LP_PATHS.md) — there is no separate router service.

---

## 4. Add or Change Languages

**Example prompt**: "I want to add French language support"

### File Map (in order of priority)

| File | What to Change |
|------|---------------|
| `bot/shared/config/branding.js` | Add language to `supportedLanguages` array and `welcomeMessages` |
| `bot/shared/config/system-messages.js` | Add translations for ALL message keys (currently 10 keys x 9 languages) |
| `bot/shared/config/language-config.js` | Add language detection patterns and configuration |
| `bot/shared/config/language-prompts.js` | Add language-specific system prompts for the LLM |
| `bot/shared/config/tts-voices.js` | Map language to TTS voice (ElevenLabs voice ID) |
| `bot/shared/config/capabilities.config.js` | Add translations for ALL 7 capability descriptions |
| `bot/shared/services/audio.service.js` | Add language to ASR routing (which transcription service handles it) |

### Step-by-Step

#### Step 1: Add to Branding

```javascript
// In branding.js
const supportedLanguages = [
  // ... existing languages
  { code: 'fr', name: 'French', direction: 'ltr' },
];

const welcomeMessages = {
  // ... existing messages
  fr: `Bienvenue! Je suis ${botName}, votre assistant pédagogique IA.`,
};
```

#### Step 2: Add System Messages

In `system-messages.js`, add `fr` translations to every message key:

```javascript
freshStart: {
  // ... existing languages
  fr: "OK! On recommence. Comment puis-je vous aider aujourd'hui?",
},
```

#### Step 3: Configure TTS Voice

In `tts-voices.js`, add an ElevenLabs voice ID for French:

```javascript
fr: {
  voiceId: 'YOUR_ELEVENLABS_FRENCH_VOICE_ID',
  name: 'French Teacher',
}
```

### Testing

Send a message in the new language via the CLI simulator and verify the bot responds in that language.

---

## 5. Switch LLM Provider or Model

**Example prompt**: "I want to use Anthropic Claude instead of OpenRouter"

### File Map

| File | What It Does |
|------|-------------|
| `bot/shared/services/llm-client.js` | Provider abstraction factory |
| `bot/shared/services/openai.service.js` | Main chat completion service (1,700+ lines) |
| `bot/shared/services/gpt5-mini.service.js` | Coaching analysis (uses OpenAI SDK directly) |
| `.env.template` | API key configuration |

### Quick Switch (via Environment)

The easiest way is to use OpenRouter which supports 500+ models including Claude:

```env
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=anthropic/claude-sonnet-4
```

### Direct Provider Switch

To use Anthropic's API directly instead of OpenRouter:

1. Install the Anthropic SDK: `cd bot && npm install @anthropic-ai/sdk`
2. Create a new provider in `llm-client.js`
3. Update `openai.service.js` to use the new provider's API format

Note: The coaching analysis in `gpt5-mini.service.js` uses the OpenAI SDK directly. To switch this to Claude, you'd need to replace the `OpenAI` client with the Anthropic client and update the message format.

---

## 6. Customize the Scoring Rubric

**Example prompt**: "I want to change the marking scheme from 118 to a percentage-based system"

### File Map

| File | What to Change |
|------|---------------|
| `bot/shared/constants/scoring.constants.js` | Total marks constants |
| `bot/shared/services/gpt5-mini.service.js` | Framework prompt (rubric levels and marks per criterion) |
| `bot/shared/services/pdf-report.service.js` | Report display (score formatting, charts) |
| `bot/shared/services/coaching/report-generator.service.js` | Score calculations |

### To Switch to Percentages

1. Keep `scoring.constants.js` as raw totals (the system normalizes internally)
2. In `pdf-report.service.js`, find where scores are displayed and format as percentages:
   ```javascript
   const percentage = Math.round((score / maxScore) * 100);
   ```
3. Update chart labels in `report-generator.service.js`

---

## 7. Add a New Feature

**Example prompt**: "I want to add a homework checker feature"

### The Pattern (3 files minimum)

Every feature in the bot follows this pattern:

#### Step 1: Register the Capability

```javascript
// bot/shared/config/capabilities.config.js
{
  id: 'homework_checker',
  name: { en: 'Homework Checker', ur: '...' },
  description: { en: 'Check student homework from photos', ur: '...' },
  howToUse: { en: 'Send a photo of homework to check', ur: '...' },
  keywords: ['homework', 'check', 'grade', 'mark']
}
```

#### Step 2: Register its key (only if it needs one)

Gating is **presence-based** — there are no tiers. If your feature needs its own API key, add it to the
`FEATURES` map so `doctor` and the runtime gate know about it:

```javascript
// bot/shared/config/feature-availability.js — add to the FEATURES array:
{ name: 'Homework checker (Acme OCR)', keys: ['ACME_OCR_API_KEY'] },
```

If your feature only uses already-required services (e.g. the LLM), skip this step.

#### Step 3: Gate in Handler

```javascript
// bot/shared/handlers/text-message.handler.js (or image handler)
const { isFeatureAvailable } = require('../config/feature-availability');

if (isFeatureAvailable('Homework checker (Acme OCR)') && isHomeworkRequest(messageBody)) {
  await handleHomeworkCheck(userId, messageBody);
  return;
}
```

#### Step 4 (if async): Add Worker Job Type

```javascript
// bot/workers/sqs-worker.js
case 'HOMEWORK_CHECK':
  await HomeworkCheckerService.process(job.data);
  break;
```

---

## 8. Change Assessment Benchmarks

**Example prompt**: "I want to use UK benchmarks instead of DIBELS norms for reading fluency"

### File Map

| File | What to Change |
|------|---------------|
| `bot/shared/config/reading-benchmarks.js` | **The WCPM percentile + LCPM benchmark NUMBERS** (by grade × language × season). This is the single source of truth. |
| `bot/shared/services/reading/benchmark.service.js` | The comparison logic (percentile banding, on-track rule). Usually leave as-is. |
| `bot/shared/services/reading/auto-level-orchestrator.service.js` | Level progression thresholds |
| `bot/shared/services/reading/report.service.js` | Benchmark display in reports |

### What to Change

Open `bot/shared/config/reading-benchmarks.js` and replace the threshold numbers (`WCPM_PERCENTILES`, `LCPM_BENCHMARKS`, `WCPM_FALLBACK`) with your regional norms. No SQL migration is required — `analysis.service.js`'s `compareToBenchmarks` reads these via `benchmark.service.js`. The SQL RPCs/tables remain as a documented fallback (`READING_BENCHMARKS_USE_RPC=1`).

> Note: the file `fluency.service.js` does **not** hold benchmark tables — it computes the raw WCPM/accuracy from the transcript. Editing it will not change your benchmark targets.

---

## 9. Modify the Reflective Conversation

**Example prompt**: "I want 5 reflective questions instead of 3, and make them more Socratic"

### File Map

| File | What to Change |
|------|---------------|
| `bot/shared/services/coaching/reflective-conversation.service.js` | Number of questions (line ~272: `if (questionsAnswered < 3)`), conversation flow |
| `bot/shared/services/gpt5-mini.service.js` | `generateReflectiveQuestion()` method - prompt that generates questions |

### Step-by-Step

1. In `reflective-conversation.service.js`, change `3` to `5`:
   ```javascript
   if (questionsAnswered < 5) {  // was 3
   ```

2. In `gpt5-mini.service.js`, find `generateReflectiveQuestion()` and update the system prompt to use Socratic questioning:
   ```javascript
   "Generate a Socratic question that helps the teacher discover insights..."
   ```

---

## 10. Customize Report Generation

**Example prompt**: "I want coaching reports to include a radar chart and action items"

### File Map

| File | What It Does |
|------|-------------|
| `bot/shared/services/coaching/report-renderers/renderer-registry.js` | **The seam.** Maps framework key → report renderer (`getReportRenderer()`). Object map + lazy require. |
| `bot/shared/services/pdf-report.service.js` | Default (PDFKit) renderer — the shared OECD/HOTS/TEACH/FICO PDF layout |
| `bot/shared/services/coaching/templates/mewaka-report.template.js` | MEWAKA's HTML template, rendered to PDF via Playwright (`shared/utils/html-to-pdf.js`) |
| `bot/shared/services/coaching/report-generator.service.js` | Orchestrates report generation (transform analysis → `reportData`, call the renderer, upload + send the PDF) |

### How report design is pluggable

Report design is **per-framework via a renderer registry**, not a hardcoded
`if (framework === '…')`. `pdf-report.service.js` calls
`getReportRenderer(reportData.framework)` and renders through whatever that
returns. Each renderer is `{ render(reportData) -> Promise<Buffer> }`:

- **PDFKit renderer** (default) — the shared OECD/HOTS/TEACH/FICO layout in `pdf-report.service.js`.
- **HTML renderer** — MEWAKA's Playwright HTML→PDF path (`mewaka-report.template.js`).
- Unknown frameworks fall back to the default PDFKit renderer.

To give a new framework its own report design, write a renderer and **register one line** in `renderer-registry.js`:

```javascript
// renderer-registry.js
const myRenderer = {
  key: 'my-html',
  render(reportData) {
    const { renderMyReportHtml } = require('../templates/my-report.template');
    const { htmlToPdf } = require('../../../utils/html-to-pdf');
    return htmlToPdf(renderMyReportHtml(reportData), { format: 'A4' });
  },
};

const renderers = {
  oecd: pdfkitRenderer,
  // ...
  myframework: myRenderer,   // ← register here, no `if` to edit
};
```

### Adding charts (radar, bar, etc.)

Chart generation is **inlined into the report templates** (HTML
renderers can use Chart.js via a CDN tag; the PDFKit renderer draws bars
directly with `doc.rect()`). To add a new chart to a framework's report:

1. For an **HTML renderer** (e.g. MEWAKA, the hero report): edit the template
   file (`*-report.template.js`) and include the chart markup inline.
   Chart.js can be loaded from a CDN inside the HTML — the Playwright
   renderer at `shared/utils/html-to-pdf.js` waits for `networkidle` so
   the chart finishes drawing before the PDF is captured.
2. For the **PDFKit renderer** (`pdf-report.service.js`): add a draw helper
   that uses PDFKit's primitives (`doc.rect()`, `doc.path()`) to render the
   chart shapes directly. PDFKit doesn't support `<canvas>`, so a third-party
   library is not required.

---

## 11. Rebrand the Bot

**Example prompt**: "I want to rename the bot from Rumi to 'TeachBot' for our school district"

### Quick Rebrand (Environment Variables Only)

```env
BOT_NAME=TeachBot
ORG_NAME=Springfield School District
SUPPORT_CONTACT=help@springfield.edu
```

This changes: welcome messages, system prompts, error messages, and all user-facing text.

### Full Rebrand (File Changes)

| File | What to Change |
|------|---------------|
| `bot/shared/config/branding.js` | Default values, welcome messages |
| `bot/shared/config/system-messages.js` | All system messages (10 keys, 9 languages each) |
| `bot/shared/config/capabilities.config.js` | Feature descriptions |
| `README.md` | Project name and description |
| `package.json` (root + bot) | Package name |

---

## 12. Add a New Background Job Type

**Example prompt**: "I want to add async report generation for parent-teacher conferences"

### File Map

| File | What to Change |
|------|---------------|
| `bot/workers/sqs-worker.js` | Add `case` for your new job type |
| `bot/shared/services/queue/sqs-queue.service.js` | Queue job submission |
| `bot/shared/config/feature-availability.js` | Register the feature's API key (presence-based gating) |

### Pattern

```javascript
// 1. Define job type in your service
await BullMQQueueService.addJob('PARENT_REPORT', {
  userId: user.id,
  conferenceDate: date,
});

// 2. Handle in worker (sqs-worker.js)
case 'PARENT_REPORT':
  await ParentReportService.generate(job.data);
  break;
```

---

## Architecture Quick Reference

### Service Dependency Chain

```
WhatsApp Webhook
  → text-message.handler.js (routes by message type)
    → feature-keyword-detector.service.js (detects intent)
      → [Feature Service] (coaching, reading, lesson plans, etc.)
        → gpt5-mini.service.js / openai.service.js (LLM calls)
        → sqs-queue.service.js (async jobs)
          → sqs-worker.js (background processing)
            → [Report/Delivery Service]
              → whatsapp.service.js (sends response)
```

### Config File Quick Reference

| Want to change... | Edit this file |
|-------------------|---------------|
| Bot name/branding | `bot/shared/config/branding.js` |
| Which features are on/off | `.env` (presence of each feature's keys); the map is `bot/shared/config/feature-availability.js` |
| Feature descriptions (help text) | `bot/shared/config/capabilities.config.js` |
| System messages (all languages) | `bot/shared/config/system-messages.js` |
| Language list | `bot/shared/config/branding.js` + `language-config.js` |
| LLM model | `.env` → `LLM_MODEL` |
| TTS voices | `bot/shared/config/tts-voices.js` |
| Coaching framework | `bot/shared/services/gpt5-mini.service.js` → `getCachedFrameworkPrompt()` |
| Scoring rubric | `bot/shared/constants/scoring.constants.js` |
| Reading benchmarks | `bot/shared/services/reading/analysis.service.js` (`compareToBenchmarks` → `check_benchmark_status` RPC) |
| Database schema | `infrastructure/supabase/00_complete-schema.sql` |

### Database Tables by Feature

| Feature | Primary Table | Related Tables |
|---------|--------------|----------------|
| Registration | `users` | - |
| AI Chat | `conversations` | `chat_sessions` |
| Coaching | `coaching_sessions` | `coaching_jobs`, `coaching_quality_metrics` |
| Reading | `reading_assessments` | `wcpm_percentiles` (benchmarks) |
| Lesson Plans | `lesson_plan_requests` | `lesson_plans`, `pre_generated_lps`, `textbook_toc` |
| Pic-to-LP | `pic_lp_sessions` | `lesson_plans` |
| Quiz | `quiz_sessions` | `quizzes`, `quiz_questions`, `quiz_answers` |
| Homework | `homework_chapters` | `student_lists` |
| Video | `video_requests` | `video_tasks` |
| Attendance | `attendance_sessions` | `attendance_records`, `student_lists` |
| Exam Checker | `exam_check_sessions` | `exam_grades`, `image_analysis_requests` |

---

## Tips for AI-Assisted Development

1. **Start with the file map** - Point your AI at the specific files listed for your change
2. **Read before editing** - Always have the AI read the target file first to understand the current implementation
3. **Test after each change** - Run `npm test` after every file change
4. **Use the simulator** - `cd bot && npm run simulate` lets you test without WhatsApp
5. **Check feature availability** - Make sure your feature's API key is set (gating is presence-based; `npm run doctor` shows what's live)
6. **Follow the pattern** - Every feature follows: capability config → (optional) key in feature-availability → handler gate → service → worker (if async)
