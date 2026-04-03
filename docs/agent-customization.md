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
| `bot/shared/services/coaching/report-generator.service.js` | Generates PDF reports from analysis data | Update section headers, chart labels |
| `bot/shared/services/pdf-report.service.js` | PDF layout and formatting | Update report structure if your rubric has different goals |
| `bot/shared/services/pdf-report-pdfmake.service.js` | Alternative PDF generator | Same as above |

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

**Key constraint**: The LLM expects the response in a specific JSON structure. Find `_buildAnalysisPrompt()` in the same file (~line 680) and update the JSON schema to match your framework's domains.

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
| `bot/shared/services/reading/analysis.service.js` | Orchestrates the full analysis pipeline | Update the pipeline steps |
| `bot/shared/services/reading/fluency.service.js` | Calculates WCPM (Words Correct Per Minute), accuracy | Change metrics (e.g., ASER uses word/paragraph/story levels instead of WCPM) |
| `bot/shared/services/reading/pronunciation.service.js` | Phoneme-level pronunciation scoring | Adjust scoring criteria |
| `bot/shared/services/reading/comprehension.service.js` | Comprehension question generation and scoring | Update question types |
| `bot/shared/services/reading/auto-level-orchestrator.service.js` | Auto-leveling algorithm (adjusts difficulty) | Update leveling logic for your methodology |
| `bot/shared/services/reading/report.service.js` | Generates reading assessment reports | Update report format and metrics displayed |

### Step-by-Step (ASER Example)

#### Step 1: Change the Assessment Levels

ASER uses 5 levels: Nothing → Letter → Word → Paragraph → Story. In `fluency.service.js`, replace WCPM-based benchmarks with level-based categorization:

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

---

## 3. Modify Lesson Plan Templates

**Example prompt**: "I want lesson plans to follow our school's 5E model instead of the 9-section structure"

### File Map

| File | What It Does |
|------|-------------|
| `bot/shared/services/content.service.js` | Contains the lesson plan generation prompt |
| `bot/shared/services/gpt5-mini.service.js` | Contains `_formatLessonPlanNarrative()` for structured lesson plan parsing |
| `bot/workers/lesson-plan-generation.worker.js` | Background job that generates lesson plans via Gamma API |
| `bot/shared/config/capabilities.config.js` | User-facing description of the lesson plan feature |

### Step-by-Step

#### Step 1: Update the Generation Prompt

In `content.service.js`, find the lesson plan system prompt. Replace the 9-section structure with your model:

```javascript
// Example: 5E Model
const LESSON_PLAN_PROMPT = `Generate a lesson plan using the 5E instructional model:
1. Engage - Hook activity to capture interest
2. Explore - Hands-on investigation
3. Explain - Direct instruction and concept clarification
4. Elaborate - Extension activities
5. Evaluate - Assessment of learning

Format as a structured document with clear timing for each phase.`;
```

#### Step 2: Update the Structured Parser

In `gpt5-mini.service.js`, update `_formatLessonPlanNarrative()` to handle your new structure's JSON keys.

#### Step 3: Update Capability Description

In `capabilities.config.js`, update the lesson plan description to reflect your new format:

```javascript
description: {
  en: 'Lesson plans using the 5E instructional model in PDF format',
  // ... other languages
}
```

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

#### Step 2: Add Feature Flag

```javascript
// bot/shared/config/feature-tiers.js
// Add to each tier's features object:
features: {
  // ... existing
  homeworkChecker: true,  // or false for lower tiers
}
```

#### Step 3: Gate in Handler

```javascript
// bot/shared/handlers/text-message.handler.js (or image handler)
const { isFeatureEnabled } = require('../config/feature-tiers');

if (isFeatureEnabled('homeworkChecker') && isHomeworkRequest(messageBody)) {
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
| `bot/shared/services/reading/fluency.service.js` | WCPM benchmark tables |
| `bot/shared/services/reading/auto-level-orchestrator.service.js` | Level progression thresholds |
| `bot/shared/services/reading/report.service.js` | Benchmark display in reports |

### What to Change

Find the benchmark constants (WCPM targets by grade level) in `fluency.service.js` and replace with your regional norms. The auto-level orchestrator uses these benchmarks to decide when to level up/down a student.

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
| `bot/shared/services/pdf-report.service.js` | Main PDF generator (uses pdfkit) |
| `bot/shared/services/pdf-report-pdfmake.service.js` | Alternative PDF generator (uses pdfmake) |
| `bot/shared/services/coaching/report-generator.service.js` | Orchestrates report generation, calls Gamma for visual reports |
| `bot/shared/services/chart.service.js` | Chart.js chart generation (bar charts, radar charts) |

### Adding a Radar Chart

1. In `chart.service.js`, add a radar chart method:
   ```javascript
   static async generateRadarChart(labels, scores, maxScores) { ... }
   ```

2. In `report-generator.service.js`, call it during report generation and embed the chart image in the PDF.

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
| `bot/shared/config/feature-tiers.js` | Gate behind feature flag |

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
| Which features are on/off | `bot/shared/config/feature-tiers.js` |
| Feature descriptions (help text) | `bot/shared/config/capabilities.config.js` |
| System messages (all languages) | `bot/shared/config/system-messages.js` |
| Language list | `bot/shared/config/branding.js` + `language-config.js` |
| LLM model | `.env` → `LLM_MODEL` |
| TTS voices | `bot/shared/config/tts-voices.js` |
| Coaching framework | `bot/shared/services/gpt5-mini.service.js` → `getCachedFrameworkPrompt()` |
| Scoring rubric | `bot/shared/constants/scoring.constants.js` |
| Reading benchmarks | `bot/shared/services/reading/fluency.service.js` |
| Database schema | `infrastructure/supabase/00_complete-schema.sql` |

### Database Tables by Feature

| Feature | Primary Table | Related Tables |
|---------|--------------|----------------|
| Registration | `users` | - |
| AI Chat | `conversations` | `chat_sessions` |
| Coaching | `coaching_sessions` | `coaching_jobs` |
| Reading | `reading_sessions` | `reading_results`, `reading_passages` |
| Lesson Plans | `lesson_plan_requests` | - |
| Video | `video_requests` | `video_sessions` |
| Attendance | `attendance_classes` | `attendance_records`, `attendance_setup` |
| Exam Checker | `exam_sessions` | `exam_papers`, `exam_grades` |

---

## Tips for AI-Assisted Development

1. **Start with the file map** - Point your AI at the specific files listed for your change
2. **Read before editing** - Always have the AI read the target file first to understand the current implementation
3. **Test after each change** - Run `npm test` after every file change
4. **Use the simulator** - `cd bot && npm run simulate` lets you test without WhatsApp
5. **Check feature tiers** - Make sure your feature is enabled in the right tier
6. **Follow the pattern** - Every feature follows: capability config → feature tier → handler gate → service → worker (if async)
