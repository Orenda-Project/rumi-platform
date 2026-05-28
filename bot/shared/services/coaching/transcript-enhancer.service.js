/**
 * Transcript Enhancer Service
 *
 * Phase 2-6: GPT-4o LLM Post-Processing for Enhanced Transcripts
 *
 * Performs five tasks in one GPT-4o call:
 * 1. Speaker Attribution (IRE pattern) - speaker_0/1 → Teacher/Student names
 * 2. Phonetic English Conversion - "سفکس" → "<en>suffix</en>"
 * 3. Utterance Tagging - instruction, question, praise, response, explanation
 * 4. SLO Mastery Detection (Phase 5) - Maps lesson objectives to student evidence
 * 5. Classroom Climate Analysis (Phase 6) - CLASS framework indicators
 *
 * @module transcript-enhancer.service
 */

const OpenAI = require('openai');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const { lazyClient } = require('../../utils/lazy-client');

// Lazy-initialised: the enhancer only runs when a coaching transcript is being
// post-processed. Setting OPENAI_API_KEY is optional at boot time.
const getOpenAI = lazyClient(OpenAI, ['OPENAI_API_KEY'], (env) => ({
  apiKey: env.OPENAI_API_KEY,
}));

/**
 * Phonetic Urdu → English Dictionary
 * Built from dry run findings (56 base + 50+ new from DR-04)
 */
const PHONETIC_DICTIONARY = {
  // Common classroom words
  'سفکس': 'suffix',
  'پریفکس': 'prefix',
  'ٹاپک': 'topic',
  'چیپٹر': 'chapter',
  'لیسن': 'lesson',
  'پیج': 'page',
  'بک': 'book',
  'کاپی': 'copy',
  'پینسل': 'pencil',
  'رولر': 'ruler',
  'بورڈ': 'board',
  'چاک': 'chalk',
  'مارکر': 'marker',

  // Instructions
  'لوک': 'look',
  'لوک ایٹ': 'look at',
  'ریڈ': 'read',
  'رائٹ': 'write',
  'لسن': 'listen',
  'اوپن': 'open',
  'کلوز': 'close',
  'سٹینڈ': 'stand',
  'سٹ': 'sit',
  'کم': 'come',
  'گو': 'go',
  'سٹاپ': 'stop',
  'سٹارٹ': 'start',
  'فوکس': 'focus',
  'اٹینشن': 'attention',

  // Academic terms
  'ورڈ': 'word',
  'سینٹینس': 'sentence',
  'پیراگراف': 'paragraph',
  'کویشچن': 'question',
  'آنسر': 'answer',
  'ایگزامپل': 'example',
  'پوائنٹ': 'point',
  'ڈیفینیشن': 'definition',
  'مینینگ': 'meaning',
  'ٹرانسلیٹ': 'translate',
  'ایکسپلین': 'explain',

  // Science terms
  'کیمیکل': 'chemical',
  'ریایکشن': 'reaction',
  'ایٹم': 'atom',
  'مالیکیول': 'molecule',
  'ایلیمنٹ': 'element',
  'کمپاؤنڈ': 'compound',
  'فارمولا': 'formula',
  'ایکویشن': 'equation',
  'ایسڈ': 'acid',
  'بیس': 'base',
  'سالٹ': 'salt',
  'آکسیجن': 'oxygen',
  'ہائیڈروجن': 'hydrogen',
  'کاربن': 'carbon',
  'نائٹروجن': 'nitrogen',

  // Evaluation words
  'گڈ': 'good',
  'ویری گڈ': 'very good',
  'ایکسیلنٹ': 'excellent',
  'پرفیکٹ': 'perfect',
  'کریکٹ': 'correct',
  'رائٹ': 'right',
  'رانگ': 'wrong',
  'ٹرائی': 'try',
  'اگین': 'again',

  // Time words
  'منٹ': 'minute',
  'سیکنڈ': 'second',
  'ٹائم': 'time',
  'ٹوڈے': 'today',
  'ٹومارو': 'tomorrow',
  'ویک': 'week',

  // New from dry run DR-04
  'انگیجمنٹ': 'engagement',
  'ڈفرنس': 'difference',
  'موومنٹ': 'movement',
  'بیسیکلی': 'basically',
  'کوئیکلی': 'quickly',
  'ایکچولی': 'actually',
  'پرابلم': 'problem',
  'سولیوشن': 'solution',
  'میتھڈ': 'method',
  'پروسیس': 'process',
  'ریزلٹ': 'result',
  'ٹیسٹ': 'test',
  'ایگزام': 'exam',
  'کلاس': 'class',
  'اسٹوڈنٹ': 'student',
  'ٹیچر': 'teacher',
  'اسکول': 'school',
  'ہوم ورک': 'homework',
  'پروجیکٹ': 'project',
  'گروپ': 'group',
  'ٹیم': 'team'
};

/**
 * Few-shot examples for GPT-4o prompt
 * Built from dry run session results
 */
const FEW_SHOT_EXAMPLES = [
  {
    input: `[00:05] speaker_1: لوک ایٹ دا بورڈ۔ آج ہم سفکس پڑھیں گے۔
[00:12] speaker_1: حمزہ بتائیں، سفکس کیا ہے؟
[00:18] speaker_2: جی سر، ورڈ کے بعد ایڈ کرتے ہیں۔
[00:25] speaker_1: بہت اچھا!`,
    output: {
      segments: [
        {
          start_ms: 5000,
          speaker: 'Teacher',
          speaker_type: 'teacher',
          tags: ['instruction'],
          text_raw: 'لوک ایٹ دا بورڈ۔ آج ہم سفکس پڑھیں گے۔',
          text_mixed: '<en>Look at the board.</en> آج ہم <en>suffix</en> پڑھیں گے۔'
        },
        {
          start_ms: 12000,
          speaker: 'Teacher',
          speaker_type: 'teacher',
          tags: ['question'],
          text_raw: 'حمزہ بتائیں، سفکس کیا ہے؟',
          text_mixed: 'حمزہ بتائیں، <en>suffix</en> کیا ہے؟'
        },
        {
          start_ms: 18000,
          speaker: 'حمزہ',
          speaker_type: 'student',
          tags: ['response'],
          text_raw: 'جی سر، ورڈ کے بعد ایڈ کرتے ہیں۔',
          text_mixed: 'جی سر، <en>word</en> کے بعد <en>add</en> کرتے ہیں۔'
        },
        {
          start_ms: 25000,
          speaker: 'Teacher',
          speaker_type: 'teacher',
          tags: ['praise'],
          text_raw: 'بہت اچھا!',
          text_mixed: 'بہت اچھا!'
        }
      ],
      named_students: ['حمزہ'],
      metrics: {
        total_segments: 4,
        phonetic_conversions: 5,
        speaker_corrections: 1
      }
    }
  },
  {
    input: `[00:00] speaker_1: مریم، آپ بتائیں کہ پانی کا فارمولا کیا ہے؟
[00:05] speaker_2: جی ماں، H2O
[00:08] speaker_1: بہت اچھا! اب علی بتائیں، آکسیجن کا سمبل کیا ہے؟
[00:12] speaker_3: جی سر، O ہے۔`,
    output: {
      segments: [
        {
          start_ms: 0,
          speaker: 'Teacher',
          speaker_type: 'teacher',
          tags: ['question'],
          text_raw: 'مریم، آپ بتائیں کہ پانی کا فارمولا کیا ہے؟',
          text_mixed: 'مریم، آپ بتائیں کہ پانی کا <en>formula</en> کیا ہے؟'
        },
        {
          start_ms: 5000,
          speaker: 'مریم',
          speaker_type: 'student',
          tags: ['response'],
          text_raw: 'جی ماں، H2O',
          text_mixed: 'جی ماں، <en>H2O</en>'
        },
        {
          start_ms: 8000,
          speaker: 'Teacher',
          speaker_type: 'teacher',
          tags: ['praise', 'question'],
          text_raw: 'بہت اچھا! اب علی بتائیں، آکسیجن کا سمبل کیا ہے؟',
          text_mixed: 'بہت اچھا! اب علی بتائیں، <en>oxygen</en> کا <en>symbol</en> کیا ہے؟'
        },
        {
          start_ms: 12000,
          speaker: 'علی',
          speaker_type: 'student',
          tags: ['response'],
          text_raw: 'جی سر، O ہے۔',
          text_mixed: 'جی سر، <en>O</en> ہے۔'
        }
      ],
      named_students: ['مریم', 'علی'],
      metrics: {
        total_segments: 4,
        phonetic_conversions: 4,
        speaker_corrections: 2
      }
    }
  }
];

/**
 * System prompt for GPT-4o enhancement (Tasks 1-3)
 */
const SYSTEM_PROMPT_BASE = `You are a classroom transcript processor for Pakistani schools.
Process this transcript in ONE pass with the following tasks:

## TASK 1: Speaker Attribution (IRE Pattern)
- speaker_0 or speaker_1 with most talk time, questions, instructions → "Teacher"
- When teacher calls a name (e.g., "حمزہ بتائیں", "مریم، آپ بتائیں"), the next response → that student's name
- Short answers after questions → "Student" or the named student
- "جی سر", "جی ماں" → indicates Student speaking
- "بہت اچھا", "شاباش" → Teacher (confirms previous was student)

## TASK 2: Phonetic English Conversion
- Convert phonetic Urdu to proper English with <en> tags
- Keep genuine Urdu words untouched
- Common patterns:
  - "لوک ایٹ" → "<en>look at</en>"
  - "سفکس" → "<en>suffix</en>"
  - "ٹاپک" → "<en>topic</en>"
  - "فوکس" → "<en>focus</en>"
  - "چیپٹر" → "<en>chapter</en>"
- Numbers: Keep as-is with <en> tag: "10" → "<en>10</en>"
- Chemical formulas: "<en>H2O</en>", "<en>CO2</en>"

## TASK 3: Utterance Tagging
Tag each utterance with one or more of:
- instruction: Teacher giving directions
- question: Teacher or student asking
- praise: Positive feedback ("بہت اچھا", "شاباش")
- response: Student answering
- explanation: Teacher explaining concepts`;

/**
 * Task 4: SLO Mastery Detection (Phase 5 - Experimental)
 * Used when explicit lesson objectives are provided
 */
const TASK_4_SLO_MASTERY = `

## TASK 4: SLO Mastery Detection (EXPERIMENTAL)
Given the lesson objectives below, detect evidence of student mastery:

### Bloom's Taxonomy Evidence Markers
- **Remember**: Student states facts, definitions, lists (بتائیں، یاد، نام)
- **Understand**: Student explains "why" or "how", paraphrases (سمجھائیں، وضاحت، بیان)
- **Apply**: Student uses concept in new context (استعمال، حل، دکھائیں)
- **Analyze**: Student compares, contrasts, differentiates (موازنہ، فرق)
- **Evaluate**: Student judges, critiques (رائے، جانچ)
- **Create**: Student designs, produces new work (بنائیں، ڈیزائن)

### Talk Moves to Detect
- **Teacher Revoicing**: "تو آپ کہہ رہے ہیں کہ..." (builds on student answer)
- **Press for Reasoning**: "کیوں؟", "وضاحت کریں" (asks for explanation)
- **Uptake**: Teacher builds on/extends student answer (higher learning)

For EACH objective, identify:
1. Was it addressed by teacher? (at what timestamp)
2. Was it assessed? (teacher asked students about it)
3. Student evidence (quotes showing understanding)
4. Mastery confidence: low/medium/high`;

/**
 * Task 4 (Inferred): SLO Mastery Detection when NO objectives provided
 * Infers learning objectives from the transcript itself
 */
const TASK_4_SLO_MASTERY_INFERRED = `

## TASK 4: SLO Mastery Detection with INFERRED Objectives (EXPERIMENTAL)
No lesson plan objectives were provided. INFER what learning objectives were being taught from the transcript content.

### Step 1: Infer Learning Objectives
Analyze the transcript to identify what the teacher was trying to teach:
- What concepts did the teacher explain?
- What skills were students being asked to demonstrate?
- What was the main topic/subject matter?

Generate 1-5 inferred objectives based on transcript evidence.

### Step 2: Classify by Bloom's Taxonomy
For each inferred objective, determine the cognitive level:
- **Remember**: Facts, definitions, lists (بتائیں، یاد، نام)
- **Understand**: Explain "why" or "how", paraphrase (سمجھائیں، وضاحت، بیان)
- **Apply**: Use concept in new context (استعمال، حل، دکھائیں)
- **Analyze**: Compare, contrast, differentiate (موازنہ، فرق)
- **Evaluate**: Judge, critique (رائے، جانچ)
- **Create**: Design, produce new work (بنائیں، ڈیزائن)

### Step 3: Detect Student Mastery Evidence
For EACH inferred objective:
1. Was it assessed? (did teacher ask students about it)
2. Student evidence (quotes showing understanding)
3. Mastery confidence: low/medium/high

### Talk Moves to Detect
- **Teacher Revoicing**: "تو آپ کہہ رہے ہیں کہ..." (builds on student answer)
- **Press for Reasoning**: "کیوں؟", "وضاحت کریں" (asks for explanation)
- **Uptake**: Teacher builds on/extends student answer (higher learning)`;

/**
 * Task 5: Classroom Climate Analysis (Phase 6 - Experimental)
 * Based on CLASS Framework (University of Virginia)
 */
const TASK_5_CLASSROOM_CLIMATE = `

## TASK 5: Classroom Climate Analysis (EXPERIMENTAL - CLASS Framework)
Analyze the transcript for classroom climate indicators:

### Emotional Support Indicators
- **Praise**: Count "بہت اچھا", "شاباش", "واہ", "excellent", "good"
- **Named Praise**: Praise directed at specific student (e.g., "شاباش حمزہ!")
- **Encouragement**: "کوشش کرو", "آپ کر سکتے ہو", "try again"
- **Negative Language**: "چپ", "خاموش", "غلط" (be quiet, wrong)
- **Student Perspective**: "آپ کیا سوچتے ہو؟", "your opinion" questions

### Instructional Support Indicators
- **Press for Reasoning**: "کیوں؟", "وجہ بتائیں", "explain why"
- **Higher-Order Questions**: "موازنہ کریں", "فرق بتائیں", "compare/contrast"
- **Connections**: "یاد ہے پچھلے", "remember last time" (prior knowledge)
- **Specific Feedback**: Feedback with content detail (not just "ٹھیک ہے")
- **Scaffolding**: "سوچو", "hint", "مدد" (providing support)

### Classroom Organization Indicators
- **Transitions**: "اب", "اگلا", "شروع کریں" (activity shifts)
- **Redirections**: "توجہ دو", "سنو" (behavior management)`;

/**
 * Output format for enhanced processing
 */
const OUTPUT_FORMAT_BASE = `

## OUTPUT FORMAT
Return ONLY valid JSON with this structure:
{
  "segments": [
    {
      "start_ms": 5000,
      "speaker": "Teacher" or "Student" or "حمزہ",
      "speaker_type": "teacher" or "student",
      "tags": ["instruction"],
      "text_raw": "original text unchanged",
      "text_mixed": "text with <en>English</en> tags"
    }
  ],
  "named_students": ["حمزہ", "مریم"],
  "metrics": {
    "total_segments": 4,
    "phonetic_conversions": 5,
    "speaker_corrections": 1
  }`;

const OUTPUT_FORMAT_SLO = `,
  "slo_mastery": {
    "objectives": [
      {
        "objective_text": "Students will define suffix",
        "bloom_level": "remember",
        "addressed": true,
        "addressed_at_ms": 45000,
        "assessed": true,
        "student_evidence": [
          {
            "speaker": "حمزہ",
            "timestamp_ms": 125000,
            "utterance": "suffix word کے بعد آتا ہے",
            "evidence_type": "definition_given"
          }
        ],
        "mastery_confidence": "high"
      }
    ],
    "talk_moves": {
      "teacher_revoicing": 2,
      "teacher_press_for_reasoning": 3,
      "uptake_instances": 1
    }
  }`;

const OUTPUT_FORMAT_SLO_INFERRED = `,
  "slo_mastery": {
    "objectives_inferred": true,
    "inferred_topic": "Brief description of what the lesson was about",
    "objectives": [
      {
        "objective_text": "Inferred objective based on transcript content",
        "bloom_level": "understand",
        "inference_evidence": "Teacher explained X, asked students about Y",
        "assessed": true,
        "student_evidence": [
          {
            "speaker": "Student name or generic",
            "timestamp_ms": 125000,
            "utterance": "Student response showing understanding",
            "evidence_type": "explanation_given"
          }
        ],
        "mastery_confidence": "medium"
      }
    ],
    "talk_moves": {
      "teacher_revoicing": 2,
      "teacher_press_for_reasoning": 3,
      "uptake_instances": 1
    }
  }`;

const OUTPUT_FORMAT_CLIMATE = `,
  "classroom_climate": {
    "emotional_support": {
      "praise_count": 8,
      "named_praise_count": 3,
      "encouragement_count": 2,
      "negative_language_count": 0,
      "student_perspective_questions": 2
    },
    "instructional_support": {
      "press_for_reasoning": 5,
      "higher_order_questions": 3,
      "connection_statements": 2,
      "specific_feedback_count": 4,
      "scaffolding_instances": 2
    },
    "classroom_organization": {
      "transition_cues": 4,
      "redirection_count": 1
    }
  }`;

/**
 * Build the complete system prompt based on options
 * @param {Object} options - Enhancement options
 * @param {Array} options.lessonObjectives - Explicit lesson objectives (from lesson plan)
 * @param {boolean} options.enableSLOMastery - Enable SLO mastery detection (will infer if no objectives)
 * @param {boolean} options.enableClimateAnalysis - Enable classroom climate analysis
 * @returns {string} Complete system prompt
 */
function buildSystemPrompt(options = {}) {
  const { lessonObjectives, enableSLOMastery = false, enableClimateAnalysis = false } = options;

  let prompt = SYSTEM_PROMPT_BASE;
  let outputFormat = OUTPUT_FORMAT_BASE;

  // Add Task 4 for SLO Mastery Detection
  if (lessonObjectives && lessonObjectives.length > 0) {
    // Case 1: Explicit objectives provided - compare against them
    prompt += TASK_4_SLO_MASTERY;
    prompt += '\n\n### LESSON OBJECTIVES FOR THIS SESSION:\n';
    lessonObjectives.forEach((obj, i) => {
      const objText = typeof obj === 'string' ? obj : obj.text || obj.objective || JSON.stringify(obj);
      prompt += `${i + 1}. ${objText}\n`;
    });
    outputFormat += OUTPUT_FORMAT_SLO;
  } else if (enableSLOMastery) {
    // Case 2: No objectives but SLO mastery enabled - INFER objectives from transcript
    prompt += TASK_4_SLO_MASTERY_INFERRED;
    outputFormat += OUTPUT_FORMAT_SLO_INFERRED;
  }

  // Add Task 5 for classroom climate (always enabled as experimental)
  if (enableClimateAnalysis) {
    prompt += TASK_5_CLASSROOM_CLIMATE;
    outputFormat += OUTPUT_FORMAT_CLIMATE;
  }

  outputFormat += '\n}';
  prompt += outputFormat;

  return prompt;
}

// Keep legacy SYSTEM_PROMPT for backward compatibility
const SYSTEM_PROMPT = buildSystemPrompt();

class TranscriptEnhancerService {
  /**
   * Build the GPT-4o prompt with few-shot examples
   * @param {Array} segments - Array of diarization segments from Phase 1
   * @param {Object} enhancementOptions - Options for Phase 5/6 tasks
   * @returns {string} Complete prompt for GPT-4o
   */
  static buildPromptWithFewShot(segments, enhancementOptions = {}) {
    const systemPrompt = buildSystemPrompt(enhancementOptions);

    if (!segments || segments.length === 0) {
      return systemPrompt + '\n\nNo segments to process.';
    }

    // Format segments as transcript lines
    const transcriptLines = segments.map(seg => {
      const minutes = Math.floor(seg.start_ms / 60000);
      const seconds = Math.floor((seg.start_ms % 60000) / 1000);
      const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
      return `${timestamp} speaker_${seg.speaker}: ${seg.text}`;
    }).join('\n');

    // Build prompt with few-shot examples
    let prompt = systemPrompt + '\n\n';
    prompt += '## EXAMPLES\n\n';

    FEW_SHOT_EXAMPLES.forEach((example, i) => {
      prompt += `### Example ${i + 1}\n`;
      prompt += `INPUT:\n${example.input}\n\n`;
      prompt += `OUTPUT:\n${JSON.stringify(example.output, null, 2)}\n\n`;
    });

    prompt += '---\n\n';
    prompt += '## NOW PROCESS THIS TRANSCRIPT:\n\n';
    prompt += transcriptLines;

    return prompt;
  }

  /**
   * Parse GPT-4o enhancement response
   * @param {string} response - Raw JSON string from GPT-4o
   * @returns {Object} Parsed enhancement result
   */
  static parseEnhancementResponse(response) {
    try {
      const result = JSON.parse(response);

      // Validate structure
      if (!result.segments) {
        result.segments = [];
      }
      if (!result.named_students) {
        result.named_students = [];
      }
      if (!result.metrics) {
        result.metrics = {
          total_segments: result.segments.length,
          phonetic_conversions: 0,
          speaker_corrections: 0
        };
      }

      return result;
    } catch (error) {
      logToFile('[TranscriptEnhancer] Failed to parse GPT-4o response', {
        error: error.message,
        responsePreview: response?.substring(0, 200)
      });

      return {
        segments: [],
        named_students: [],
        metrics: {
          total_segments: 0,
          phonetic_conversions: 0,
          speaker_corrections: 0
        },
        error: error.message
      };
    }
  }

  /**
   * Enhance transcript with GPT-4o
   * @param {Array} segments - Array of diarization segments
   * @param {Object} options - Enhancement options
   * @param {Array} options.lessonObjectives - Lesson objectives for SLO mastery detection (Phase 5)
   * @param {boolean} options.enableSLOMastery - Enable SLO mastery detection even without objectives
   * @param {boolean} options.enableClimateAnalysis - Enable classroom climate analysis (Phase 6)
   * @returns {Promise<Object>} Enhanced transcript data
   */
  static async enhanceTranscript(segments, options = {}) {
    const {
      maxRetries = 3,
      temperature = 0.3,
      maxTokens = 6000, // Increased for Phase 5/6 outputs
      // Phase 5/6 options
      lessonObjectives = null,
      enableSLOMastery = false,
      enableClimateAnalysis = false
    } = options;

    const startTime = Date.now();

    // Determine which experimental features are enabled
    const hasExplicitObjectives = lessonObjectives && lessonObjectives.length > 0;
    const hasSLOMastery = hasExplicitObjectives || enableSLOMastery;
    const hasInferredObjectives = enableSLOMastery && !hasExplicitObjectives;
    const hasClimateAnalysis = enableClimateAnalysis;

    logEvent('transcript.enhancement.started', {
      segmentCount: segments?.length || 0,
      experimentalFeatures: {
        sloMastery: hasSLOMastery,
        sloMasteryMode: hasExplicitObjectives ? 'explicit' : (hasInferredObjectives ? 'inferred' : 'disabled'),
        climateAnalysis: hasClimateAnalysis,
        objectivesCount: lessonObjectives?.length || 0
      }
    });

    try {
      // Build prompt with enhancement options
      const enhancementOptions = {
        lessonObjectives,
        enableSLOMastery,
        enableClimateAnalysis
      };
      const prompt = this.buildPromptWithFewShot(segments, enhancementOptions);

      // Call GPT-4o
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      });

      const duration = Date.now() - startTime;
      const content = response.choices[0].message.content;
      const result = this.parseEnhancementResponse(content);

      // Add processing metadata
      result.processing = {
        durationMs: duration,
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        cost: (response.usage.prompt_tokens * 0.0025 + response.usage.completion_tokens * 0.01) / 1000,
        experimentalFeatures: {
          sloMastery: hasSLOMastery,
          sloMasteryMode: hasExplicitObjectives ? 'explicit' : (hasInferredObjectives ? 'inferred' : 'disabled'),
          climateAnalysis: hasClimateAnalysis
        }
      };

      // Add experimental disclaimer if Phase 5/6 data present
      if (result.slo_mastery || result.classroom_climate) {
        result.experimental_disclaimer = 'SLO mastery and classroom climate analysis are experimental features based on transcript patterns. Results should be validated by human observation.';
      }

      logEvent('transcript.enhancement.completed', {
        segmentCount: segments?.length || 0,
        enhancedSegments: result.segments.length,
        namedStudents: result.named_students?.length || 0,
        durationMs: duration,
        cost: result.processing.cost,
        hasSLOMastery: !!result.slo_mastery,
        hasClimateAnalysis: !!result.classroom_climate
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      logEvent('transcript.enhancement.failed', {
        segmentCount: segments?.length || 0,
        durationMs: duration,
        errorType: error.name,
        errorMessage: error.message
      });

      logToFile('[TranscriptEnhancer] Enhancement failed', {
        error: error.message,
        duration
      });

      throw error;
    }
  }

  /**
   * Enhance transcript with retry logic and exponential backoff
   * @param {Array} segments - Array of diarization segments
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Enhanced transcript data
   */
  static async enhanceWithRetry(segments, options = {}) {
    const { maxRetries = 3, baseDelayMs = 1000 } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.enhanceTranscript(segments, options);
      } catch (error) {
        lastError = error;

        // Don't retry on validation errors
        if (error.message?.includes('Invalid request')) {
          throw error;
        }

        // Check if we should retry
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);

          logToFile(`[TranscriptEnhancer] Attempt ${attempt} failed, retrying in ${delay}ms`, {
            error: error.message,
            attempt,
            maxRetries
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logToFile('[TranscriptEnhancer] All retry attempts failed', {
      maxRetries,
      lastError: lastError?.message
    });

    throw lastError;
  }
}

// Expose constants for testing
TranscriptEnhancerService.PHONETIC_DICTIONARY = PHONETIC_DICTIONARY;
TranscriptEnhancerService.FEW_SHOT_EXAMPLES = FEW_SHOT_EXAMPLES;

// Expose Phase 5/6 prompt builders for testing
TranscriptEnhancerService.buildSystemPrompt = buildSystemPrompt;
TranscriptEnhancerService.TASK_4_SLO_MASTERY = TASK_4_SLO_MASTERY;
TranscriptEnhancerService.TASK_4_SLO_MASTERY_INFERRED = TASK_4_SLO_MASTERY_INFERRED;
TranscriptEnhancerService.TASK_5_CLASSROOM_CLIMATE = TASK_5_CLASSROOM_CLIMATE;

module.exports = TranscriptEnhancerService;
