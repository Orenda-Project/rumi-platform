/**
 * Transcript Processor Service
 *
 * Uses GPT-4o-mini to process raw classroom transcripts:
 * 1. Fix Urdu word spacing (concatenated words → proper word boundaries)
 * 2. Re-infer speaker roles (Teacher/Student) based on contextual patterns
 * 3. Group content by classroom activity sections
 * 4. Generate lesson summary
 */

require('dotenv').config();
const OpenAI = require('openai');
const { withCache } = require('./gpt-cache.service');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * System prompt for transcript processing
 * Updated Dec 10, 2025 - V2: Added few-shot examples, activity patterns, enhanced named student detection
 */
const SYSTEM_PROMPT = `You are an expert transcript formatter for Pakistani educational classroom recordings.

=============================================================================
🚨 CRITICAL RULE - READ THIS FIRST 🚨
=============================================================================
You MUST preserve EVERY SINGLE dialogue line from the input transcript.
DO NOT summarize, combine, or skip ANY lines.

If the input has 169 lines, your output MUST have 169 lines.
If the input has timestamps from 00:00 to 25:36, ALL those timestamps MUST appear in output.

This is the MOST IMPORTANT rule. Violating this makes the transcript useless.

=============================================================================
SECTION 1: FIX URDU WORD SPACING
=============================================================================
The transcript has concatenated Urdu words (no spaces). Add proper word boundaries.
Example: "ہمنےسرگرمینمبرساتکیاتھا" → "ہم نے سرگرمی نمبر سات کیا تھا"

=============================================================================
SECTION 2: PHONETIC ENGLISH DETECTION (MOST CRITICAL TASK)
=============================================================================

THE PHENOMENON:
In Pakistani classrooms, teachers speak English words but Soniox transcribes them
PHONETICALLY into Urdu script. You MUST recognize these and convert back to English.

*** FEW-SHOT EXAMPLES - STUDY THESE CAREFULLY ***

EXAMPLE 1 - Chemistry Terms:
INPUT:  "پلاسٹرآفپیرسمیںکونساکیمیکلہوتاہے؟ کیلشیمسلفیٹ۔"
OUTPUT: "{{en:Plaster of Paris}} میں کون سا {{en:chemical}} ہوتا ہے؟ {{en:Calcium sulphate}}۔"

EXAMPLE 2 - Classroom Instructions:
INPUT:  "سٹینڈاپ۔ پیجنمبرونتھرٹینائناوپنکریں۔ سیونمنٹسمیںریڈکریں۔"
OUTPUT: "{{en:Stand up}}۔ {{en:Page number 139 open}} کریں۔ {{en:Seven minutes}} میں {{en:read}} کریں۔"

EXAMPLE 3 - Praise and Responses:
INPUT:  "ویریگڈ! شاباش! اوکےسٹڈاؤن۔ ایکسیلینٹ!"
OUTPUT: "{{en:Very good}}! شاباش! {{en:Okay, sit down}}۔ {{en:Excellent}}!"

EXAMPLE 4 - Scientific Concepts:
INPUT:  "یہایگزوتھرمکریایکشنہے۔ ہاٹپیکساورکولڈپیکسیادہیں؟ نیوٹرلائزیشنہوتاہے۔"
OUTPUT: "یہ {{en:exothermic reaction}} ہے۔ {{en:Hot packs}} اور {{en:cold packs}} یاد ہیں؟ {{en:Neutralization}} ہوتا ہے۔"

EXAMPLE 5 - Chemical Formulas and pH:
INPUT:  "تیزابیمٹیکیپیایچکیاہوگی؟ زیروسےسکستک۔ ایچسیایلاوراین اے او ایچ۔"
OUTPUT: "تیزابی مٹی کی {{en:pH}} کیا ہوگی؟ {{en:Zero}} سے {{en:six}} تک۔ {{en:HCl}} اور {{en:NaOH}}۔"

EXAMPLE 6 - Academic Terms:
INPUT:  "ہومورکمیںایکٹیویٹینمبرپانچکریں۔ چیپٹرٹوریویوکریں۔"
OUTPUT: "{{en:Homework}} میں {{en:activity}} نمبر پانچ کریں۔ {{en:Chapter two review}} کریں۔"

EXAMPLE 7 - Mixed Salt/Properties Discussion:
INPUT:  "کرسٹلائنپاؤڈرکیشکلمیںہوتاہے۔ مائنرلزکیوجہسےبلیکہوتاہے۔ کلرلیسنہیں۔"
OUTPUT: "{{en:Crystalline powder}} کی شکل میں ہوتا ہے۔ {{en:Minerals}} کی وجہ سے {{en:black}} ہوتا ہے۔ {{en:Colourless}} نہیں۔"

*** PATTERN CATEGORIES TO RECOGNIZE ***

CHEMISTRY/SCIENCE TERMS:
- Formulas: ایچسیایل (HCl), این اے سی ایل/ایناےسیایل (NaCl), این اے او ایچ (NaOH),
  پی ایچ (pH), ایچ ٹو او (H2O), سی او ٹو (CO2)
- Compounds: پلاسٹرآفپیرس/پلاسٹر آف پیرس (Plaster of Paris), کیلشیمسلفیٹ (Calcium sulphate),
  کیلشیماکسائیڈ (Calcium oxide), کیلشیمکاربونیٹ (Calcium carbonate),
  کیلشیمکلورائیڈ (Calcium chloride), سوڈیمہائیڈروکسائیڈ (Sodium hydroxide),
  سوڈیمکلورائیڈ (Sodium chloride), ہائیڈروکلورکایسڈ (Hydrochloric acid),
  فارمکایسڈ (Formic acid), فینولتھیلیم/فینولفتھیلین (phenolphthalein)
- Concepts: ایگزوتھرمک (exothermic), اینڈوتھرمک (endothermic), نیوٹرلائزیشن (neutralization),
  اینڈایسڈ/اینٹی ایسڈ (antacid), ری ایکشن (reaction), ایسڈ (acid), بیس (base),
  سالٹ (salt), نیوٹرل (neutral), بیلنس (balance)
- Properties: کرسٹلائن (crystalline), پاؤڈر (powder), مائنرلز (minerals),
  کلرلیس (colourless), بلیک (black), وائٹ (white), ییلو (yellow)
- Equipment: ہاٹپیکس (hot packs), کولڈپیکس (cold packs), انیمل (enamel)

CLASSROOM INSTRUCTIONS:
- سٹینڈاپ (stand up), سٹڈاؤن (sit down), ریڈ (read), رائٹ (write)
- اوپن (open), کلوز (close), ریپیٹ (repeat), شیئر (share)
- پیئراینڈشیئر (pair and share), تھنک (think)

ACADEMIC TERMS:
- پیج/پیجنمبر (page/page number), چیپٹر (chapter), ایکٹیویٹی (activity)
- ہومورک (homework), ٹیسٹ (test), کوئسچن (question), آنسر (answer)
- ریویو (review), منٹس (minutes), ٹائم (time), ڈے (day)

NUMBERS (often phonetic):
- ون (one), ٹو (two), تھری (three), فور (four), فائیو (five)
- سکس (six), سیون (seven), ایٹ (eight), نائن (nine), زیرو (zero)
- ونتھرٹینائن (139), ونفورٹیون (141)

PRAISE & RESPONSES:
- ویریگڈ (very good), گڈ (good), ایکسیلینٹ (excellent), ویلڈن (well done)
- اوکے (okay), یس (yes), نو (no), سر (sir), تھینکیو (thank you)

*** DETECTION APPROACH ***
1. Scan for phonetic patterns that sound like English when spoken aloud
2. Consider: "How would an Urdu speaker write this English word phonetically?"
3. When uncertain, GUESS ENGLISH - false positives are better than missing words
4. Wrap detected English in {{en:word}} markers

=============================================================================
SECTION 3: SPEAKER ROLE INFERENCE
=============================================================================

TEACHER patterns:
- Instructions: "آپ بتائیے", "سٹینڈ اپ", "بیٹھ جائیں", "page number X open کریں"
- Questions: "کیا ہوتا ہے؟", "بتائیں", "کون بتائے گا؟"
- Longer explanations and definitions
- Praise: "بہت اچھا", "شاباش", "very good"
- Calling students: "حمزہ بتائیں", "مریم؟", "وحید!"

STUDENT patterns:
- Short answers responding to questions
- Tentative responses
- Single word/phrase answers

=============================================================================
SECTION 4: NAMED STUDENT DETECTION (MANDATORY)
=============================================================================

*** STEP-BY-STEP LOGIC - FOLLOW EXACTLY ***

STEP 1: Scan each teacher utterance for student names
STEP 2: If name found → FLAG that name
STEP 3: IMMEDIATE NEXT student response → Use flagged name as speaker
STEP 4: After that response → CLEAR flag, revert to "طالب علم"

*** WORKED EXAMPLE ***

[Teacher]: "تعدیل کا عمل کیا ہوتا ہے، حمزہ؟"
           ↑ SCAN: Found name "حمزہ" → FLAG IT

[Student]: "تعدیل کا عمل وہ دو hydrogen..."
           ↑ FLAG ACTIVE → SPEAKER = "حمزہ" (NOT "طالب علم")
           ↑ CLEAR FLAG after this response

[Teacher]: "بہت اچھا۔ دو chemicals کون کون سے ہوتے ہیں؟"
           ↑ SCAN: No name found → NO FLAG

[Student]: "Hydrochloric acid اور Sodium hydroxide"
           ↑ NO FLAG → SPEAKER = "طالب علم" (generic)

[Teacher]: "وحید، سڑکوں میں سے برف ہٹانے کے لیے کیا استعمال کیا جاتا ہے؟"
           ↑ SCAN: Found name "وحید" → FLAG IT

[Student]: "Calcium chloride"
           ↑ FLAG ACTIVE → SPEAKER = "وحید"

*** NAME DETECTION PATTERNS ***
- Direct: "حمزہ؟", "مریم بتائیں", "وحید!"
- With جی: "جی حسن", "جی بادشاہ"
- With instruction: "انایہ آپ بتائیے", "زینب بتائیں"
- In reprimand: "وحید، سٹڈاؤن!" (previous speaker was وحید)

COMMON NAMES: حمزہ، مریم، حسن، وحید، انایہ، زینب، احمد، حسان، بادشاہ، ہریم، فاطمہ، عائشہ، علی، احد

=============================================================================
SECTION 5: CHORUS DETECTION
=============================================================================

Use speaker: "طلباء (اجتماعی)" and speakerType: "chorus" when:
- Very short responses (1-3 words): جی، یس، نہیں، ہاں جی، جی سر
- Following yes/no questions from teacher
- Unanimous responses to greetings

INDIVIDUAL (not chorus): Longer explanatory answers, unique content

=============================================================================
SECTION 6: SECTION ORGANIZATION BY PEDAGOGICAL ACTIVITY
=============================================================================

*** CREATE SECTIONS BASED ON CLASSROOM ACTIVITIES, NOT ARBITRARY TIME CHUNKS ***

=============================================================================
🚨 MANDATORY: ACTIVITY TRANSITION DETECTION (HIGHEST PRIORITY) 🚨
=============================================================================

*** YOU MUST CREATE A NEW SECTION when ANY of these patterns appear: ***
This rule OVERRIDES all other sectioning considerations.
Even if content seems related, these markers indicate the teacher is
starting a DIFFERENT CLASSROOM ACTIVITY that requires a new section.

REQUIRED section breaks - when teacher says:

📖 BOOK/READING TRANSITIONS:
   - "بکس کو کھولیں" / "کتاب کھولیں" / "اپنی بکس" → Start Reading Activity
   - "page number X" / "صفحہ نمبر" → Start Reading Activity
   - "X minutes میں پڑھیں" / "پڑھیں" → Start Reading Activity

✏️ EXERCISE/PRACTICE TRANSITIONS:
   - "سوال نمبر X" / "سوال" + number → Start Practice/Exercise
   - "ٹیبل دیا گیا ہے" / "ٹیبل" → Start Practice/Exercise
   - "مشق کریں" / "کر کے دکھائیں" → Start Practice/Exercise

📝 WRITING TRANSITIONS:
   - "بک میں لکھیں" / "لکھ سکتے ہیں" → Start Writing Activity
   - "کاپی میں کمپلیٹ" / "کاپی میں لکھیں" → Start Writing Activity
   - "نوٹ کر لیں" → Start Writing Activity

📋 WRAP-UP/HOMEWORK TRANSITIONS:
   - "کل آپ کا..." → Wrap-up/Consolidation
   - "homework" / "ہومورک" → Homework Assignment
   - "یونٹ کنسولیڈیشن" / "کنسولیڈیشن" → Consolidation

📚 SUBJECT CHANGE:
   - "ایس ایس ٹی کی کاپی نکالو" / "[subject] کی کاپی" → Subject Change
   - "اب ہم X کریں گے" / "آئیے X کریں" → Topic Change

*** IMPORTANT RULES FOR SECTIONING ***
1. HIGHEST PRIORITY: If you detect a marker from the list above, YOU MUST create a new section
2. Even during Q&A, if "سوال نمبر X" appears, start a new "Practice" section
3. Even during Q&A, if "بکس کو کھولیں" appears, start a new "Reading" section
4. Even during Q&A, if "لکھ سکتے ہیں/کاپی میں" appears, start a new "Writing" section
5. The markers above indicate CLASSROOM ACTIVITY changes, not topic changes
6. Do NOT put 150+ lines in one section - that usually means you missed activity markers

=============================================================================
ACTIVITY PATTERNS (Reference)
=============================================================================

📖 REVIEW OF PREVIOUS LESSON (start of class):
   Markers: "کل", "پچھلی activity", "review", references to previous day
   → Title: "📖 Review of Previous Lesson" or "📖 پچھلے سبق کا Review"

📖 READING ACTIVITY:
   Markers: "page number X open کریں", "read کریں", "X minutes میں پڑھیں"
   → Title: "📖 Reading Activity"
   → Note: Include time allocation if mentioned (e.g., "7 minutes")

🎯 LEARNING OBJECTIVES:
   Markers: "آج ہم سیکھیں گے", "today we will learn"
   → Title: "🎯 Learning Objectives"

🤝 THINK-PAIR-SHARE:
   Markers: "pair and share", "partner کو سمجھائیں", "discuss with neighbor"
   → Title: "🤝 Think, Pair and Share"

💊 Q&A ON SPECIFIC TOPIC:
   Markers: Extended Q&A focused on one concept (antacid, neutralization, etc.)
   → Title: "💊 [Topic] کا استعمال" or "🔬 [Topic] کی خصوصیات"
   → Use topic-specific icons:
     💊 medicine/antacid, 🐝 insects/stings, 🏭 industrial, 🧂 salt
     🍽️ food/table salt, ⚫ black salt, 🌱 soil/plants, 🔬 properties

📝 HOMEWORK REVIEW:
   Markers: "homework check کریں", "کام کر لیا?"
   → Title: "📝 Homework Review"

✏️ PRACTICE/CLASSWORK:
   Markers: "سوال نمبر X کریں", "مشق کریں", exercises assigned
   → Title: "✏️ Practice Questions"

❓ ADDITIONAL QUESTIONS:
   Markers: End-of-class Q&A, "اور کوئی سوال؟"
   → Title: "❓ Additional Questions"

📋 WRAP-UP/CONSOLIDATION:
   Markers: "کل آپ کا...", "یونٹ کنسولیڈیشن", end-of-class announcements
   → Title: "📋 Wrap-up" or "📋 Consolidation"

*** SECTION TITLE FORMAT ***
- Include emoji prefix
- Mix Urdu and English naturally (e.g., "💊 Antacid کا استعمال")
- Include time range: "00:00 - 02:30"

=============================================================================
SECTION 7: JSON OUTPUT FORMAT
=============================================================================

{
  "summary": "Brief 2-3 sentence summary of the lesson",
  "sections": [
    {
      "title": "📖 Review of Previous Lesson",
      "timeRange": "00:00 - 02:30",
      "lines": [
        {
          "timestamp": "00:09",
          "speaker": "استاد",
          "speakerType": "teacher",
          "text": "چلیں، کل ہم نے {{en:activity}} نمبر سات کیا تھا۔"
        },
        {
          "timestamp": "00:15",
          "speaker": "طلباء (اجتماعی)",
          "speakerType": "chorus",
          "text": "جی {{en:sir}}"
        },
        {
          "timestamp": "00:25",
          "speaker": "استاد",
          "speakerType": "teacher",
          "text": "حمزہ، تم بتاؤ {{en:answer}} کیا ہے؟"
        },
        {
          "timestamp": "00:30",
          "speaker": "حمزہ",
          "speakerType": "student",
          "text": "{{en:Sodium chloride}} اور پانی۔"
        }
      ]
    },
    {
      "title": "📖 Reading Activity",
      "timeRange": "02:30 - 10:00",
      "lines": [...]
    },
    {
      "title": "💊 Antacid کا استعمال",
      "timeRange": "14:00 - 16:00",
      "lines": [...]
    }
  ]
}

=============================================================================
CRITICAL RULES
=============================================================================

1. PRESERVE ALL DIALOGUE - never skip content
2. KEEP ORIGINAL TIMESTAMPS exactly as provided
3. FIX WORD SPACING but don't change meaning
4. speakerType: "teacher", "student", or "chorus"
5. Speaker names: "استاد" (teacher), "طالب علم" (generic student), actual name (if called), "طلباء (اجتماعی)" (chorus)
6. Return ONLY valid JSON, no markdown code blocks

=============================================================================
⚠️ MANDATORY QUALITY CHECK - DO THIS BEFORE OUTPUT ⚠️
=============================================================================

**STOP! Before outputting JSON, scan EACH line and verify English detection:**

For EVERY line in your output, ask:
"Does this line contain any of these common phonetic patterns?"

MUST CONVERT THESE (appearing in almost every transcript):
- فوکس → {{en:Focus}}
- چیپٹر → {{en:chapter}}
- ویری گڈ → {{en:Very good}}
- یس → {{en:Yes}}
- نو → {{en:No}}
- اوکے → {{en:Okay}}
- پیج نمبر → {{en:page number}}
- سٹارٹ/شروع → {{en:start}}
- کمپلیٹ → {{en:complete}}
- ٹاپک → {{en:topic}}
- پورشن → {{en:portion}}
- کنفیوژن → {{en:confusion}}
- نیکسٹ → {{en:Next}}
- پوائنٹ → {{en:point}}
- ویٹ → {{en:wait}}
- ریلیٹڈ → {{en:related}}
- سیکنڈز/منٹس → {{en:seconds}}/{{en:minutes}}
- پرابلم/پرابلمز → {{en:problem}}/{{en:problems}}
- ایکٹیویٹی → {{en:activity}}
- ہومورک → {{en:homework}}
- ٹیسٹ → {{en:test}}
- شیئر → {{en:share}}
- کوئیک → {{en:quick}}
- سٹاپ → {{en:stop}}
- رائٹنگ → {{en:writing}}
- ریڈنگ → {{en:reading}}

**If your output has ANY of these patterns WITHOUT {{en:...}} markers, you have FAILED.**

Example validation:
❌ WRONG: "فوکس کریں، بیٹا۔"
✅ RIGHT: "{{en:Focus}} کریں، بیٹا۔"

❌ WRONG: "چیپٹر ٹو ریویو کریں۔"
✅ RIGHT: "{{en:chapter two review}} کریں۔"

❌ WRONG: "ویری گڈ۔ نیکسٹ پہ چلیں۔"
✅ RIGHT: "{{en:Very good}}۔ {{en:Next}} پہ چلیں۔"

=============================================================================
SECTION 8: SLO MASTERY DETECTION (EXPERIMENTAL - Phase 5)
=============================================================================

Analyze the transcript to INFER what learning objectives were being taught:

*** STEP 1: Infer Learning Objectives ***
- What concepts did the teacher explain?
- What skills were students being asked to demonstrate?
- What was the main topic/subject matter?
Generate 1-5 inferred objectives based on transcript evidence.

*** STEP 2: Classify by Bloom's Taxonomy ***
For each inferred objective, determine the cognitive level:
- Remember: Facts, definitions, lists (بتائیں، یاد، نام)
- Understand: Explain "why" or "how", paraphrase (سمجھائیں، وضاحت، بیان)
- Apply: Use concept in new context (استعمال، حل، دکھائیں)
- Analyze: Compare, contrast, differentiate (موازنہ، فرق)
- Evaluate: Judge, critique (رائے، جانچ)
- Create: Design, produce new work (بنائیں، ڈیزائن)

*** STEP 3: Detect Student Mastery Evidence ***
For EACH inferred objective:
1. Was it assessed? (did teacher ask students about it)
2. Student evidence (quotes showing understanding)
3. Mastery confidence: low/medium/high

*** Talk Moves to Detect ***
- Teacher Revoicing: "تو آپ کہہ رہے ہیں کہ..." (builds on student answer)
- Press for Reasoning: "کیوں؟", "وضاحت کریں" (asks for explanation)
- Uptake: Teacher builds on/extends student answer

=============================================================================
SECTION 9: CLASSROOM CLIMATE ANALYSIS (EXPERIMENTAL - Phase 6)
=============================================================================

Analyze the transcript for classroom climate indicators based on CLASS Framework:

*** Emotional Support ***
- praise_count: "بہت اچھا", "شاباش", "very good", "excellent"
- named_praise_count: Praise with student name (e.g., "شاباش حمزہ")
- encouragement_count: "کوشش کریں", "آپ کر سکتے ہیں"
- negative_language_count: Criticism, harsh words (should be 0 or low)
- student_perspective_questions: "آپ کو کیا لگتا ہے؟", "کیا آپ سمجھے؟"

*** Instructional Support ***
- press_for_reasoning: "کیوں؟", "وضاحت کریں", "کیسے؟"
- higher_order_questions: Questions requiring analysis/evaluation
- connection_statements: Linking to real life, previous lessons
- specific_feedback_count: Feedback beyond simple praise
- scaffolding_instances: Breaking down complex ideas

*** Classroom Organization ***
- transition_cues: "اب ہم...", "چلیں آگے", "next"
- redirection_count: "توجہ دیں", managing behavior

=============================================================================
SECTION 10: EXTENDED JSON OUTPUT FORMAT
=============================================================================

Include these additional fields in your JSON output:

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
            "quote": "Student response showing understanding"
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
  },
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
      "scaffolding_instances": 3
    },
    "classroom_organization": {
      "transition_cues": 4,
      "redirection_count": 1
    }
  }`;

/**
 * Chunk transcript by semantic boundaries (paragraphs) for long transcripts
 *
 * @param {string} transcriptText - Raw transcript text
 * @param {number} maxChunkSize - Maximum chunk size in characters (default: 15000 to prevent max_tokens truncation)
 * @returns {Array<string>} Array of transcript chunks
 */
function chunkTranscriptBySemantic(transcriptText, maxChunkSize = 15000) {
  // If transcript is small, no chunking needed
  if (transcriptText.length <= maxChunkSize) {
    return [transcriptText];
  }

  console.log(`[TranscriptProcessor] Transcript is ${transcriptText.length} chars, chunking by semantic boundaries...`);

  // Split by double newlines (paragraph boundaries)
  const paragraphs = transcriptText.split('\n\n');
  const chunks = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + para).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  console.log(`[TranscriptProcessor] Created ${chunks.length} chunks (avg ${Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)} chars each)`);

  return chunks;
}

/**
 * Process a raw transcript using GPT-4o-mini
 *
 * @param {string} rawTranscript - The raw transcript text from database
 * @param {Object} sessionInfo - Session metadata
 * @param {string} sessionInfo.teacherName - Teacher's name
 * @param {string} sessionInfo.schoolName - School name
 * @param {string} sessionInfo.duration - Session duration
 * @param {number} sessionInfo.chunkIndex - Optional: current chunk index (for chunked processing)
 * @param {number} sessionInfo.totalChunks - Optional: total number of chunks (for chunked processing)
 * @returns {Promise<Object>} Processed transcript with sections and summary
 */
async function processTranscript(rawTranscript, sessionInfo) {
  // Count input lines for validation
  const inputLineCount = (rawTranscript.match(/^\[\d{2}:\d{2}\]/gm) || []).length;

  const userPrompt = `Process this Urdu classroom transcript.

=============================================================================
🚨 LINE PRESERVATION REQUIREMENT 🚨
=============================================================================
This transcript contains ${inputLineCount} timestamped dialogue lines.
Your output MUST contain ALL ${inputLineCount} lines.
DO NOT summarize, combine, or omit ANY dialogue.

=============================================================================
ENGLISH DETECTION REQUIREMENT
=============================================================================
If you see: "[00:46] Teacher (UR): ویری گڈ۔ چیپٹر ٹو میں نیکسٹ پورشن کمپلیٹ کریں۔"
You MUST output: "{{en:Very good}}۔ {{en:chapter two}} میں {{en:next}} {{en:portion}} {{en:complete}} کریں۔"

=============================================================================
SESSION INFO
=============================================================================
- Teacher: ${sessionInfo.teacherName}
- School: ${sessionInfo.schoolName}
- Duration: ${sessionInfo.duration}
- Input Line Count: ${inputLineCount}

=============================================================================
RAW TRANSCRIPT (${inputLineCount} lines to process)
=============================================================================
${rawTranscript}

=============================================================================
REQUIRED OUTPUT FORMAT
=============================================================================
Your JSON response MUST include these top-level fields:
{
  "summary": "Brief summary of the lesson",
  "sections": [...],         // All ${inputLineCount} lines distributed across sections
  "slo_mastery": {...},      // REQUIRED - learning objectives analysis
  "classroom_climate": {...} // REQUIRED - CLASS framework metrics
}

REMEMBER:
1. Every فوکس, چیپٹر, ویری گڈ, یس, نیکسٹ, کنفیوژن etc. MUST be wrapped in {{en:...}} markers.
2. PRESERVE ALL ${inputLineCount} dialogue lines - do not summarize!`;

  try {
    console.log(`[TranscriptProcessor] Processing transcript (${rawTranscript.length} chars, ${inputLineCount} lines)...`);
    const startTime = Date.now();

    // Use cache wrapper for GPT call (1 hour TTL)
    // Cache key based on transcript content hash (first 200 chars + length as identifier)
    // etv-len01: Added inputLineCount to cache key to invalidate old truncated caches
    const cacheContent = {
      transcriptHash: rawTranscript.substring(0, 200),
      transcriptLength: rawTranscript.length,
      inputLineCount: inputLineCount,
      teacherName: sessionInfo.teacherName || 'unknown',
      version: 4 // Increment to invalidate old caches (Structured Outputs update)
    };

    const { data: processed, fromCache, durationMs } = await withCache(
      'transcript',
      cacheContent,
      async () => {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini-2024-07-18', // Specific model version supporting Structured Outputs
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1, // Lower temperature for JSON reliability
          max_tokens: 16384,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "transcript_processing_schema",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        timeRange: { type: "string" },
                        lines: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              timestamp: { type: "string" },
                              speaker: { type: "string" },
                              speakerType: { type: "string" },
                              text: { type: "string" }
                            },
                            required: ["timestamp", "speaker", "speakerType", "text"],
                            additionalProperties: false
                          }
                        }
                      },
                      required: ["title", "timeRange", "lines"],
                      additionalProperties: false
                    }
                  },
                  slo_mastery: {
                    type: "object",
                    properties: {
                      objectives_inferred: { type: "boolean" },
                      inferred_topic: { type: "string" },
                      objectives: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            objective_text: { type: "string" },
                            bloom_level: { type: "string" },
                            inference_evidence: { type: "string" },
                            assessed: { type: "boolean" },
                            student_evidence: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  speaker: { type: "string" },
                                  quote: { type: "string" }
                                },
                                required: ["speaker", "quote"],
                                additionalProperties: false
                              }
                            },
                            mastery_confidence: { type: "string" }
                          },
                          required: ["objective_text", "bloom_level", "inference_evidence", "assessed", "student_evidence", "mastery_confidence"],
                          additionalProperties: false
                        }
                      },
                      talk_moves: {
                        type: "object",
                        properties: {
                          teacher_revoicing: { type: "number" },
                          teacher_press_for_reasoning: { type: "number" },
                          uptake_instances: { type: "number" }
                        },
                        required: ["teacher_revoicing", "teacher_press_for_reasoning", "uptake_instances"],
                        additionalProperties: false
                      }
                    },
                    required: ["objectives_inferred", "inferred_topic", "objectives", "talk_moves"],
                    additionalProperties: false
                  },
                  classroom_climate: {
                    type: "object",
                    properties: {
                      emotional_support: {
                        type: "object",
                        properties: {
                          praise_count: { type: "number" },
                          named_praise_count: { type: "number" },
                          encouragement_count: { type: "number" },
                          negative_language_count: { type: "number" },
                          student_perspective_questions: { type: "number" }
                        },
                        required: ["praise_count", "named_praise_count", "encouragement_count", "negative_language_count", "student_perspective_questions"],
                        additionalProperties: false
                      },
                      instructional_support: {
                        type: "object",
                        properties: {
                          press_for_reasoning: { type: "number" },
                          higher_order_questions: { type: "number" },
                          connection_statements: { type: "number" },
                          specific_feedback_count: { type: "number" },
                          scaffolding_instances: { type: "number" }
                        },
                        required: ["press_for_reasoning", "higher_order_questions", "connection_statements", "specific_feedback_count", "scaffolding_instances"],
                        additionalProperties: false
                      },
                      classroom_organization: {
                        type: "object",
                        properties: {
                          transition_cues: { type: "number" },
                          redirection_count: { type: "number" }
                        },
                        required: ["transition_cues", "redirection_count"],
                        additionalProperties: false
                      }
                    },
                    required: ["emotional_support", "instructional_support", "classroom_organization"],
                    additionalProperties: false
                  }
                },
                required: ["summary", "sections", "slo_mastery", "classroom_climate"],
                additionalProperties: false
              }
            }
          }
        });

        // Check for truncated response
        const choice = response.choices[0];
        if (choice.finish_reason === 'length') {
          throw new Error(`Response truncated - hit max_tokens limit. Chunk is too large (${rawTranscript.length} chars). Please reduce chunk size.`);
        }

        // Check for refusal (Structured Outputs safety feature)
        if (choice.message.refusal) {
          throw new Error(`Model refused to generate response: ${choice.message.refusal}`);
        }

        // Parse the JSON response
        const content = choice.message.content;
        if (!content) {
          throw new Error('Empty response from GPT');
        }

        const result = JSON.parse(content);

        // Validate structure
        if (!result.summary || !result.sections || !Array.isArray(result.sections)) {
          throw new Error('Invalid response structure from GPT');
        }

        return result;
      },
      3600 // 1 hour TTL
    );

    const elapsed = Date.now() - startTime;
    console.log(`[TranscriptProcessor] GPT processing completed in ${elapsed}ms (fromCache: ${fromCache})`);

    // Log stats and validate line preservation
    const totalLines = processed.sections.reduce((acc, s) => acc + s.lines.length, 0);
    console.log(`[TranscriptProcessor] Processed: ${processed.sections.length} sections, ${totalLines} lines`);

    // etv-len01: Warn if significant line loss (>20%)
    const lineLossPercent = ((inputLineCount - totalLines) / inputLineCount) * 100;
    if (lineLossPercent > 20) {
      console.warn(`[TranscriptProcessor] ⚠️ LINE LOSS WARNING: Input had ${inputLineCount} lines, output has ${totalLines} lines (${lineLossPercent.toFixed(1)}% loss)`);
    }

    // etv-slo01: Warn if missing slo_mastery or classroom_climate
    if (!processed.slo_mastery) {
      console.warn('[TranscriptProcessor] ⚠️ Missing slo_mastery in GPT response');
    }
    if (!processed.classroom_climate) {
      console.warn('[TranscriptProcessor] ⚠️ Missing classroom_climate in GPT response');
    }

    return processed;

  } catch (error) {
    console.error('[TranscriptProcessor] Error processing transcript:', error.message);
    throw error;
  }
}

/**
 * Process long transcripts using semantic chunking
 * Splits very long transcripts (>15K chars) into 15K semantic chunks and merges results
 * Uses 15K chunks to prevent max_tokens (16384) truncation since output is ~2x input size
 *
 * @param {string} transcriptText - Raw transcript text
 * @param {Object} metadata - Session metadata (teacherName, schoolName, duration)
 * @returns {Promise<Object>} Merged processed transcript
 */
async function processLongTranscript(transcriptText, metadata) {
  // Use 15K chunks to prevent max_tokens truncation (output is ~2x input size, max_tokens is 16384)
  const chunks = chunkTranscriptBySemantic(transcriptText, 15000);

  if (chunks.length === 1) {
    // Standard processing - no chunking needed
    return await processTranscript(transcriptText, metadata);
  }

  // Process each chunk
  console.log(`[TranscriptProcessor] Processing ${chunks.length} chunks sequentially...`);
  const chunkResults = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[TranscriptProcessor] Processing chunk ${i + 1}/${chunks.length}...`);

    const chunkResult = await processTranscript(chunks[i], {
      ...metadata,
      chunkIndex: i + 1,
      totalChunks: chunks.length
    });

    chunkResults.push(chunkResult);
  }

  // Merge sections from all chunks
  const mergedSections = chunkResults.flatMap(r => r.sections || []);

  // Merge slo_mastery objectives
  const allObjectives = chunkResults
    .filter(r => r.slo_mastery && r.slo_mastery.objectives)
    .flatMap(r => r.slo_mastery.objectives);

  // Merge classroom_climate metrics (sum counts)
  const mergedClimate = {
    emotional_support: {
      praise_count: 0,
      named_praise_count: 0,
      encouragement_count: 0,
      negative_language_count: 0,
      student_perspective_questions: 0
    },
    instructional_support: {
      press_for_reasoning: 0,
      higher_order_questions: 0,
      connection_statements: 0,
      specific_feedback_count: 0,
      scaffolding_instances: 0
    },
    classroom_organization: {
      transition_cues: 0,
      redirection_count: 0
    }
  };

  chunkResults.forEach(r => {
    if (r.classroom_climate) {
      // Sum emotional_support
      if (r.classroom_climate.emotional_support) {
        Object.keys(mergedClimate.emotional_support).forEach(key => {
          mergedClimate.emotional_support[key] += r.classroom_climate.emotional_support[key] || 0;
        });
      }
      // Sum instructional_support
      if (r.classroom_climate.instructional_support) {
        Object.keys(mergedClimate.instructional_support).forEach(key => {
          mergedClimate.instructional_support[key] += r.classroom_climate.instructional_support[key] || 0;
        });
      }
      // Sum classroom_organization
      if (r.classroom_climate.classroom_organization) {
        Object.keys(mergedClimate.classroom_organization).forEach(key => {
          mergedClimate.classroom_organization[key] += r.classroom_climate.classroom_organization[key] || 0;
        });
      }
    }
  });

  // Use summary from first chunk, append note about chunking
  const firstSummary = chunkResults[0]?.summary || 'Lesson summary unavailable';
  const mergedSummary = `${firstSummary} (Processed in ${chunks.length} chunks due to length)`;

  console.log(`[TranscriptProcessor] Merged ${mergedSections.length} sections from ${chunks.length} chunks`);

  return {
    summary: mergedSummary,
    sections: mergedSections,
    slo_mastery: {
      objectives_inferred: true,
      inferred_topic: chunkResults[0]?.slo_mastery?.inferred_topic || 'Topic inference unavailable',
      objectives: allObjectives,
      talk_moves: {
        teacher_revoicing: chunkResults.reduce((sum, r) => sum + (r.slo_mastery?.talk_moves?.teacher_revoicing || 0), 0),
        teacher_press_for_reasoning: chunkResults.reduce((sum, r) => sum + (r.slo_mastery?.talk_moves?.teacher_press_for_reasoning || 0), 0),
        uptake_instances: chunkResults.reduce((sum, r) => sum + (r.slo_mastery?.talk_moves?.uptake_instances || 0), 0)
      }
    },
    classroom_climate: mergedClimate
  };
}

/**
 * Fallback parser for when GPT processing fails
 * Uses the original simple parsing logic
 *
 * @param {string} rawTranscript - Raw transcript text
 * @returns {Object} Basic parsed transcript
 */
function fallbackParse(rawTranscript) {
  const lines = rawTranscript.split('\n').filter(line => line.trim());
  const transcriptLines = [];

  lines.forEach(line => {
    // Match pattern: [MM:SS] Speaker (LANG): text
    const match = line.match(/^\[(\d{2}:\d{2})\]\s*(Teacher|Student\s*\d*)\s*\((\w+)\):\s*(.*)$/i);

    if (match) {
      const [, timestamp, speaker, , text] = match;
      transcriptLines.push({
        timestamp,
        speaker: speaker.trim(),
        speakerType: speaker.toLowerCase().includes('teacher') ? 'teacher' : 'student',
        text: text.trim()
      });
    } else if (line.trim()) {
      transcriptLines.push({
        timestamp: '--:--',
        speaker: 'Unknown',
        speakerType: 'student',
        text: line.trim()
      });
    }
  });

  return {
    summary: 'Enhanced formatting unavailable. Showing raw transcript.',
    sections: [{
      title: 'Full Transcript',
      timeRange: transcriptLines.length > 0
        ? `${transcriptLines[0].timestamp} - ${transcriptLines[transcriptLines.length - 1].timestamp}`
        : 'N/A',
      lines: transcriptLines
    }]
  };
}

/**
 * Process transcript with GPT-5.2 fallback for edge cases
 * First tries GPT-4o-mini with Structured Outputs, falls back to GPT-5.2 if that fails
 *
 * @param {string} transcriptText - Raw transcript text
 * @param {Object} metadata - Session metadata (teacherName, schoolName, duration)
 * @returns {Promise<Object>} Processed transcript
 */
async function processTranscriptWithFallback(transcriptText, metadata) {
  try {
    // Try GPT-4o-mini with Structured Outputs and chunking
    console.log('[TranscriptProcessor] Attempting GPT-4o-mini with Structured Outputs...');
    return await processLongTranscript(transcriptText, metadata);
  } catch (error) {
    console.error('[TranscriptProcessor] GPT-4o-mini failed:', error.message);
    console.log('[TranscriptProcessor] Falling back to GPT-5.2 for edge case...');

    // Fall back to GPT-5.2 for very long/complex transcripts
    const inputLineCount = (transcriptText.match(/^\[\d{2}:\d{2}\]/gm) || []).length;

    const userPrompt = `Process this Urdu classroom transcript.

=============================================================================
🚨 LINE PRESERVATION REQUIREMENT 🚨
=============================================================================
This transcript contains ${inputLineCount} timestamped dialogue lines.
Your output MUST contain ALL ${inputLineCount} lines.
DO NOT summarize, combine, or omit ANY dialogue.

=============================================================================
SESSION INFO
=============================================================================
- Teacher: ${metadata.teacherName}
- School: ${metadata.schoolName}
- Duration: ${metadata.duration}
- Input Line Count: ${inputLineCount}

=============================================================================
RAW TRANSCRIPT (${inputLineCount} lines to process)
=============================================================================
${transcriptText}

=============================================================================
REQUIRED OUTPUT FORMAT
=============================================================================
Your JSON response MUST include these top-level fields:
{
  "summary": "Brief summary of the lesson",
  "sections": [...],         // All ${inputLineCount} lines distributed across sections
  "slo_mastery": {...},      // REQUIRED - learning objectives analysis
  "classroom_climate": {...} // REQUIRED - CLASS framework metrics
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-2024-11-20', // Use latest GPT-4o (GPT-5 class model)
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "transcript_processing_schema",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      timeRange: { type: "string" },
                      lines: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            timestamp: { type: "string" },
                            speaker: { type: "string" },
                            speakerType: { type: "string" },
                            text: { type: "string" }
                          },
                          required: ["timestamp", "speaker", "speakerType", "text"],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ["title", "timeRange", "lines"],
                    additionalProperties: false
                  }
                },
                slo_mastery: {
                  type: "object",
                  properties: {
                    objectives_inferred: { type: "boolean" },
                    inferred_topic: { type: "string" },
                    objectives: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          objective_text: { type: "string" },
                          bloom_level: { type: "string" },
                          inference_evidence: { type: "string" },
                          assessed: { type: "boolean" },
                          student_evidence: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                speaker: { type: "string" },
                                quote: { type: "string" }
                              },
                              required: ["speaker", "quote"],
                              additionalProperties: false
                            }
                          },
                          mastery_confidence: { type: "string" }
                        },
                        required: ["objective_text", "bloom_level", "inference_evidence", "assessed", "student_evidence", "mastery_confidence"],
                        additionalProperties: false
                      }
                    },
                    talk_moves: {
                      type: "object",
                      properties: {
                        teacher_revoicing: { type: "number" },
                        teacher_press_for_reasoning: { type: "number" },
                        uptake_instances: { type: "number" }
                      },
                      required: ["teacher_revoicing", "teacher_press_for_reasoning", "uptake_instances"],
                      additionalProperties: false
                    }
                  },
                  required: ["objectives_inferred", "inferred_topic", "objectives", "talk_moves"],
                  additionalProperties: false
                },
                classroom_climate: {
                  type: "object",
                  properties: {
                    emotional_support: {
                      type: "object",
                      properties: {
                        praise_count: { type: "number" },
                        named_praise_count: { type: "number" },
                        encouragement_count: { type: "number" },
                        negative_language_count: { type: "number" },
                        student_perspective_questions: { type: "number" }
                      },
                      required: ["praise_count", "named_praise_count", "encouragement_count", "negative_language_count", "student_perspective_questions"],
                      additionalProperties: false
                    },
                    instructional_support: {
                      type: "object",
                      properties: {
                        press_for_reasoning: { type: "number" },
                        higher_order_questions: { type: "number" },
                        connection_statements: { type: "number" },
                        specific_feedback_count: { type: "number" },
                        scaffolding_instances: { type: "number" }
                      },
                      required: ["press_for_reasoning", "higher_order_questions", "connection_statements", "specific_feedback_count", "scaffolding_instances"],
                      additionalProperties: false
                    },
                    classroom_organization: {
                      type: "object",
                      properties: {
                        transition_cues: { type: "number" },
                        redirection_count: { type: "number" }
                      },
                      required: ["transition_cues", "redirection_count"],
                      additionalProperties: false
                    }
                  },
                  required: ["emotional_support", "instructional_support", "classroom_organization"],
                  additionalProperties: false
                }
              },
              required: ["summary", "sections", "slo_mastery", "classroom_climate"],
              additionalProperties: false
            }
          }
        }
      });

      // Check for truncated response
      const choice = response.choices[0];
      if (choice.finish_reason === 'length') {
        throw new Error(`GPT-5.2 response truncated - hit max_tokens limit. Chunk is too large (${transcriptText.length} chars).`);
      }

      // Check for refusal (Structured Outputs safety feature)
      if (choice.message.refusal) {
        throw new Error(`GPT-5.2 refused to generate response: ${choice.message.refusal}`);
      }

      const content = choice.message.content;
      if (!content) {
        throw new Error('Empty response from GPT-5.2');
      }

      const result = JSON.parse(content);

      console.log('[TranscriptProcessor] ✅ GPT-4o fallback succeeded');
      return result;

    } catch (fallbackError) {
      console.error('[TranscriptProcessor] ❌ GPT-4o fallback also failed:', fallbackError.message);
      throw fallbackError;
    }
  }
}

module.exports = {
  processTranscript,
  processLongTranscript,
  processTranscriptWithFallback,
  fallbackParse
};
