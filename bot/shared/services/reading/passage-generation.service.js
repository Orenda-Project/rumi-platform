/**
 * Passage Generation Service
 * Handles reading passage generation and image creation for reading assessments
 *
 * Responsibilities:
 * - Generate age-appropriate reading passages using GPT-4
 * - Create mobile-optimized images of passages using Canvas
 * - Upload passage images to R2 storage
 * - Send passage images to WhatsApp
 * - Update assessment records with passage data
 *
 * CRITICAL: Urdu passages MUST NOT contain diacritical marks (matches Pakistani textbooks)
 *
 * NOTE: This service requires the 'canvas' optional dependency.
 * If canvas is not installed, passage image generation will fail gracefully.
 * See shared/utils/canvas-loader.js for installation instructions.
 */

const { isCanvasAvailable, getCanvas } = require('../../utils/canvas-loader');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { OPENAI_API_KEY, TEMP_DIR } = require('../../utils/constants');
const { generateAlphabetGrid } = require('../../utils/alphabet-grid-generator');
const { generateRandomWords, generateWordGrid } = require('../../utils/word-grid-generator');
const https = require('https');
const { getPresignedUrl } = require('../../storage/r2');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Background configuration for child-friendly visuals
const PASSAGE_BACKGROUNDS = require('../../config/passage-backgrounds.json');

// Feature flag for background images (enable after uploading to R2)
const USE_BACKGROUND_IMAGES = process.env.USE_PASSAGE_BACKGROUNDS === 'true';

// Canvas availability flag - checked once at module load
const CANVAS_AVAILABLE = isCanvasAvailable();

// Register fonts for proper Urdu rendering (only if canvas is available)
if (CANVAS_AVAILABLE) {
  try {
    const { registerFont } = getCanvas();
    registerFont(path.join(__dirname, '../../fonts/NotoNastaliqUrdu-Regular.ttf'), {
      family: 'Noto Nastaliq Urdu',
      weight: 'normal',
      style: 'normal'
    });

    registerFont(path.join(__dirname, '../../fonts/NotoNastaliqUrdu-Bold.ttf'), {
      family: 'Noto Nastaliq Urdu',
      weight: 'bold',
      style: 'normal'
    });
  } catch (fontError) {
    console.warn('[passage-generation] Font registration failed:', fontError.message);
  }
  // Bug #20 Fix: Register Lexend font for English passages (improves reading proficiency)
  try {
    const { registerFont } = getCanvas();
    registerFont(path.join(__dirname, '../../fonts/Lexend-Regular.ttf'), {
      family: 'Lexend',
      weight: 'normal',
      style: 'normal'
    });

    registerFont(path.join(__dirname, '../../fonts/Lexend-Bold.ttf'), {
      family: 'Lexend',
      weight: 'bold',
      style: 'normal'
    });
    logToFile('✅ Noto Nastaliq Urdu and Lexend fonts registered for passage rendering');
  } catch (fontError) {
    console.warn('[passage-generation] Lexend font registration failed:', fontError.message);
  }
} else {
  console.warn('[passage-generation] Canvas not available - passage image generation will be disabled');
}

// Helper functions that get canvas module at runtime (to handle optional dependency)
function getCreateCanvas() {
  if (!CANVAS_AVAILABLE) {
    throw new Error('Canvas module not available - passage image generation disabled');
  }
  return getCanvas().createCanvas;
}

function getLoadImage() {
  if (!CANVAS_AVAILABLE) {
    throw new Error('Canvas module not available - passage image generation disabled');
  }
  return getCanvas().loadImage;
}

// Canvas configuration for mobile-optimized passages
const CANVAS_WIDTH = 1080;
const CANVAS_PADDING = 60;
const BACKGROUND_COLOR = '#FFFFFF';
const TEXT_COLOR = '#1A1A1A';

// Font sizes based on passage type
// Bug #21 Fix: Increased word font size from 56 to 80 for better readability
const FONT_SIZES = {
  letters: 72,    // Very large for letter recognition
  words: 80,      // Very large for word reading (Bug #21: increased from 56)
  sentences: 48,  // Medium-large for sentence reading
  paragraph: 42,  // Standard for paragraph reading
  story: 38       // Slightly smaller for longer stories
};

// Line height multipliers
// Bug #22 Fix: Urdu needs 2.0x spacing for proper script readability
const LINE_HEIGHT_MULTIPLIER = {
  en: 1.6,  // English: Standard spacing
  ur: 2.0   // Urdu: Double spacing for Nastaliq script
};

// ============================================================================
// Bug #8 Fix: Sentence Diversity System
// Prevents thematic repetition (Sara/Ali, dogs, parks, mangoes)
// ============================================================================

// Topic themes with subjects and actions for varied sentence generation
const SENTENCE_THEMES = {
  en: [
    { topic: 'school', subjects: ['teacher', 'student', 'class', 'principal'], actions: ['reads', 'writes', 'learns', 'teaches', 'draws'] },
    { topic: 'home', subjects: ['mother', 'father', 'sister', 'brother', 'grandma'], actions: ['cooks', 'cleans', 'helps', 'makes', 'fixes'] },
    { topic: 'sports', subjects: ['boy', 'girl', 'team', 'player', 'coach'], actions: ['kicks', 'throws', 'catches', 'runs', 'jumps'] },
    { topic: 'nature', subjects: ['flowers', 'trees', 'butterfly', 'river', 'mountain'], actions: ['grow', 'bloom', 'flow', 'shine', 'wave'] },
    { topic: 'animals', subjects: ['cat', 'rabbit', 'fish', 'horse', 'elephant'], actions: ['sleeps', 'hops', 'swims', 'gallops', 'trumpets'] },
    { topic: 'friends', subjects: ['friends', 'children', 'kids', 'neighbors', 'classmates'], actions: ['play', 'share', 'laugh', 'help', 'talk'] },
    { topic: 'food', subjects: ['bread', 'rice', 'vegetables', 'milk', 'eggs'], actions: ['tastes', 'smells', 'looks', 'cooks', 'bakes'] },
    { topic: 'weather', subjects: ['rain', 'snow', 'wind', 'clouds', 'sunshine'], actions: ['falls', 'blows', 'drifts', 'shines', 'passes'] },
    { topic: 'city', subjects: ['bus', 'shop', 'market', 'library', 'hospital'], actions: ['drives', 'opens', 'closes', 'helps', 'serves'] },
    { topic: 'farm', subjects: ['farmer', 'cow', 'chicken', 'tractor', 'crops'], actions: ['plants', 'harvests', 'feeds', 'plows', 'grows'] }
  ],
  ur: [
    { topic: 'مدرسہ', subjects: ['استاد', 'طالب علم', 'ناظم', 'لڑکا', 'لڑکی'], actions: ['پڑھتا ہے', 'لکھتا ہے', 'سیکھتا ہے', 'پڑھاتا ہے'] },
    { topic: 'گھر', subjects: ['امی', 'ابو', 'بہن', 'بھائی', 'دادی'], actions: ['پکاتی ہے', 'صاف کرتی ہے', 'مدد کرتی ہے', 'بناتی ہے'] },
    { topic: 'کھیل', subjects: ['کھلاڑی', 'ٹیم', 'کوچ', 'بچے', 'دوست'], actions: ['کھیلتا ہے', 'دوڑتا ہے', 'کودتا ہے', 'پھینکتا ہے'] },
    { topic: 'فطرت', subjects: ['پھول', 'درخت', 'تتلی', 'دریا', 'پہاڑ'], actions: ['اگتا ہے', 'کھلتا ہے', 'بہتا ہے', 'چمکتا ہے'] },
    { topic: 'جانور', subjects: ['بلی', 'خرگوش', 'مچھلی', 'گھوڑا', 'طوطا'], actions: ['سوتا ہے', 'کودتا ہے', 'تیرتا ہے', 'اڑتا ہے'] },
    { topic: 'خاندان', subjects: ['چچا', 'خالہ', 'ماموں', 'نانی', 'دادا'], actions: ['آتا ہے', 'ملتا ہے', 'لاتا ہے', 'کہتا ہے'] },
    { topic: 'کھانا', subjects: ['روٹی', 'چاول', 'سبزی', 'دودھ', 'پھل'], actions: ['کھاتا ہے', 'پیتا ہے', 'پکتا ہے', 'ملتا ہے'] },
    { topic: 'موسم', subjects: ['بارش', 'دھوپ', 'ہوا', 'بادل', 'برف'], actions: ['آتی ہے', 'چمکتی ہے', 'چلتی ہے', 'گرتی ہے'] },
    { topic: 'بازار', subjects: ['دکان', 'گاڑی', 'تانگہ', 'سڑک', 'پل'], actions: ['کھلتی ہے', 'چلتی ہے', 'رکتی ہے', 'جاتی ہے'] },
    { topic: 'کھیت', subjects: ['کسان', 'فصل', 'ٹریکٹر', 'بیج', 'پانی'], actions: ['بوتا ہے', 'کاٹتا ہے', 'چلاتا ہے', 'دیتا ہے'] }
  ]
};

// Diverse child names pool (culturally appropriate for Pakistan + international)
const CHILD_NAMES = {
  en: ['Emma', 'Zain', 'Aisha', 'Omar', 'Mia', 'Hamza', 'Layla', 'Adam', 'Noor', 'Yusuf',
       'Fatima', 'Ibrahim', 'Zara', 'Bilal', 'Maya', 'Hassan', 'Amina', 'Khalid', 'Sana', 'Tariq'],
  ur: ['احمد', 'فاطمہ', 'عمر', 'عائشہ', 'حمزہ', 'زینب', 'یوسف', 'مریم', 'بلال', 'ثنا',
       'حسن', 'امینہ', 'خالد', 'نور', 'طارق', 'سارہ', 'ابراہیم', 'زارا', 'عدنان', 'رابعہ']
};

// Topics to AVOID (overused in previous GPT generations)
const AVOID_TOPICS = {
  en: ['dog running in park', 'eating mango', 'eating apple', 'bird singing', 'building tower with blocks', 'drawing flower'],
  ur: ['کتا پارک میں', 'آم کھانا', 'سیب کھانا', 'پرندہ گانا', 'بلاکس سے ٹاور']
};

// Helper function: Fisher-Yates shuffle
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Get random names from pool
function getRandomNames(count, language = 'en') {
  const names = CHILD_NAMES[language] || CHILD_NAMES.en;
  return shuffleArray(names).slice(0, count);
}

// Get random themes from pool
function getRandomThemes(count, language = 'en') {
  const themes = SENTENCE_THEMES[language] || SENTENCE_THEMES.en;
  return shuffleArray(themes).slice(0, count);
}

// Get topics to avoid as string
function getAvoidTopics(language = 'en') {
  const topics = AVOID_TOPICS[language] || AVOID_TOPICS.en;
  return topics.join(', ');
}

// ============================================================================

class PassageGenerationService {
  /**
   * Get a random background image URL for the given passage type
   * @param {string} type - Passage type (letters, words, sentences, paragraph, story)
   * @returns {string|null} Background image URL or null if not available
   */
  static getRandomBackgroundUrl(type) {
    const levelBackgrounds = PASSAGE_BACKGROUNDS.levels?.[type];
    if (!levelBackgrounds || levelBackgrounds.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * levelBackgrounds.length);
    const backgroundPath = levelBackgrounds[randomIndex];
    const baseUrl = process.env.R2_PUBLIC_URL || PASSAGE_BACKGROUNDS.r2BaseUrl;
    return `${baseUrl}/${backgroundPath}`;
  }

  /**
   * Fetch background image from R2 URL (requires presigned URL for private bucket)
   * @param {string} url - R2 Image URL (will be converted to presigned URL)
   * @returns {Promise<Image|null>} Canvas Image object or null on failure
   */
  static async fetchBackgroundImage(url) {
    try {
      // R2 bucket is private - need presigned URL for access
      const presignedUrl = await getPresignedUrl(url, 3600); // 1 hour expiry

      return new Promise((resolve) => {
        https.get(presignedUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            https.get(response.headers.location, (redirectResponse) => {
              const chunks = [];
              redirectResponse.on('data', chunk => chunks.push(chunk));
              redirectResponse.on('end', async () => {
                try {
                  const buffer = Buffer.concat(chunks);
                  const image = await getLoadImage()(buffer);
                  resolve(image);
                } catch (error) {
                  logToFile('⚠️ Failed to load background image after redirect', { url, error: error.message });
                  resolve(null);
                }
              });
              redirectResponse.on('error', () => resolve(null));
            }).on('error', () => resolve(null));
            return;
          }

          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
              const image = await getLoadImage()(buffer);
              resolve(image);
            } catch (error) {
              logToFile('⚠️ Failed to load background image', { url, error: error.message });
              resolve(null);
            }
          });
          response.on('error', () => resolve(null));
        }).on('error', () => resolve(null));
      });
    } catch (error) {
      logToFile('⚠️ Failed to get presigned URL for background', { url, error: error.message });
      return null;
    }
  }

  /**
   * Main entry point: Generate passage and send to user
   * @param {string} assessmentId - UUID of reading assessment
   * @param {string} userId - User UUID
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} language - 'en' or 'ur'
   * @param {object} passageConfig - { type, wordCount, grade }
   * @param {string} userLanguage - User's preferred language for messages
   * @returns {Promise<void>}
   */
  static async generateAndSendPassage(
    assessmentId,
    userId,
    phoneNumber,
    language,
    passageConfig,
    userLanguage = 'en'
  ) {
    try {
      logToFile('📝 Starting passage generation', {
        assessmentId,
        userId,
        language,
        type: passageConfig.type,
        wordCount: passageConfig.wordCount
      });

      // Step 1: Generate passage text
      // Bug #27 Fix: For word-type passages, use manual word generation (bypass GPT-4)
      // For other types, use GPT-4 generation
      let passageText;
      let passageTitle = null;

      if (passageConfig.type === 'words') {
        // Bug #27 Fix: GPT-4 hybrid approach (age-appropriate words + guaranteed count)
        // ALWAYS generate exactly 14 words for 2-column grid (7 per column), ignore passageConfig.wordCount
        const words = await generateRandomWords(14, passageConfig.grade, language);

        // Bug #2a Fix: Store words in HORIZONTAL reading order for fluency comparison
        // Grid displays in 2 columns (7 rows):
        //   words[0]   words[7]   (row 0)
        //   words[1]   words[8]   (row 1)
        //   ...
        //   words[6]   words[13]  (row 6)
        //
        // User reads horizontally: words[0], words[7], words[1], words[8], ...
        // So passageText must be stored in this horizontal order, not column order
        const horizontalWords = [];
        for (let row = 0; row < 7; row++) {
          horizontalWords.push(words[row]);       // left column word
          horizontalWords.push(words[row + 7]);   // right column word
        }

        // passageText = horizontal order (for fluency scoring)
        passageText = horizontalWords.join('\n');

        // BUT: Image generator needs COLUMN order to display grid correctly
        // We'll pass column order to createPassageImage via a special property
        passageConfig._columnOrderWords = words;

        logToFile('✅ GPT-4 hybrid word generation complete', {
          type: 'words',
          language,
          wordCount: words.length,
          columnOrder: words.join(', '),
          horizontalOrder: horizontalWords.join(', ')
        });
      } else {
        // GPT-4 generation for non-word types (letters, sentences, paragraph, story)
        const passageData = await this.generatePassageText(
          language,
          passageConfig.type,
          passageConfig.wordCount,
          passageConfig.grade
        );

        passageText = passageData.text;
        passageTitle = passageData.title;
      }

      // Step 2: Validate Urdu passages for diacritics (CRITICAL)
      if (language === 'ur') {
        const hasDiacritics = this.checkForDiacritics(passageText);
        if (hasDiacritics) {
          logToFile('⚠️ WARNING: Generated Urdu passage contains diacritics', {
            assessmentId,
            passageText: passageText.substring(0, 100)
          });
          // Log but continue - GPT may have ignored instructions
        }
      }

      // Step 3: Create passage image using Canvas (only passage text, no title)
      let imageBuffer;
      if (passageConfig.type === 'words' && passageConfig._columnOrderWords) {
        // Bug #2a Fix: For words, use column-order array for grid image
        // (passageText is already in horizontal order for fluency scoring)
        const fontFamily = language === 'ur' ? 'Noto Nastaliq Urdu' : 'Lexend';
        imageBuffer = await generateWordGrid(passageConfig._columnOrderWords, language, fontFamily);
        delete passageConfig._columnOrderWords; // Clean up temp property
      } else {
        imageBuffer = await this.createPassageImage(
          passageText,
          language,
          passageConfig.type
        );
      }

      // Step 3b: Save image to temp file (needed for WhatsApp upload)
      const tempImagePath = path.join(TEMP_DIR, `passage_${assessmentId}.png`);
      fs.writeFileSync(tempImagePath, imageBuffer);
      logToFile('📁 Passage image saved to temp file', { tempImagePath });

      // Step 4: Upload image to R2
      const imageUrl = await this.uploadPassageImage(
        imageBuffer,
        userId,
        assessmentId
      );

      // Step 5: Update assessment record (Bug #16 fix: store title separately)
      await supabase
        .from('reading_assessments')
        .update({
          passage_text: passageText,
          passage_title: passageTitle, // Bug #16: Store title separately (null for letters/words/sentences)
          passage_image_url: imageUrl,
          passage_generated_at: new Date().toISOString(),
          passage_word_count: passageConfig.wordCount,
          status: 'passage_generated'
        })
        .eq('id', assessmentId);

      logToFile('✅ Passage saved to database', {
        assessmentId,
        imageUrl,
        hasTitle: passageTitle !== null,
        title: passageTitle
      });

      // Step 6: Send passage image to WhatsApp (using local file path)
      await WhatsAppService.sendImage(phoneNumber, tempImagePath);

      // Step 6b: Clean up temp file
      try {
        fs.unlinkSync(tempImagePath);
        logToFile('🗑️ Temp passage image deleted', { tempImagePath });
      } catch (cleanupError) {
        logToFile('⚠️ Could not delete temp file', {
          path: tempImagePath,
          error: cleanupError.message
        });
      }

      // Step 7: Send instructions in user's language
      // Bug #5 Fix: Add language-specific reading direction for letters type
      const isRTL = ['ur', 'ar'].includes(language);
      const readingDirection = isRTL ? 'RIGHT TO LEFT' : 'LEFT TO RIGHT';
      const readingDirectionUrdu = 'دائیں سے بائیں';  // Right to left in Urdu
      const readingDirectionArabic = 'من اليمين إلى اليسار';  // Right to left in Arabic

      let instructionsPrompt;

      if (passageConfig.type === 'letters') {
        // Bug #5 Fix: Special instructions for alphabet reading with explicit direction
        const directionText = userLanguage === 'ur' ? readingDirectionUrdu :
                              userLanguage === 'ar' ? readingDirectionArabic :
                              readingDirection;

        instructionsPrompt = `Generate a brief message in language code "${userLanguage}" instructing the teacher to:
1. Show this alphabet grid to the student
2. Ask the student to read the letters aloud going ${directionText} across each row, starting from row 1 at the top
3. The numbers with arrows (1→, 2→, etc.) show the reading direction for each row
4. Record the student reading with WhatsApp voice message
5. Send the recording back to me
6. Use encouraging, supportive tone
7. Maximum 4-5 sentences
8. NO markdown, NO meta-commentary`;
      } else {
        // Standard instructions for other passage types
        instructionsPrompt = `Generate a brief message in language code "${userLanguage}" instructing the teacher to:
1. Show this passage to the student
2. Ask the student to read it aloud
3. Record the student reading with WhatsApp voice message
4. Send the recording back to me
5. Use encouraging, supportive tone
6. Maximum 3-4 sentences
7. NO markdown, NO meta-commentary`;
      }

      const instructionsResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: instructionsPrompt }],
        temperature: 0.3,
        max_tokens: 250
      });

      const instructionsMessage = instructionsResponse.choices[0].message.content.trim();

      await WhatsAppService.sendMessage(phoneNumber, instructionsMessage);

      logToFile('✅ Passage generation complete', {
        assessmentId,
        wordCount: passageConfig.wordCount,
        language
      });

    } catch (error) {
      logToFile('❌ Error generating passage', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });

      // Update assessment status to failed
      await supabase
        .from('reading_assessments')
        .update({
          status: 'failed',
          failed_step: 'passage_generation',
          error_message: error.message
        })
        .eq('id', assessmentId);

      // Send error message to user
      const errorPrompt = `Generate a brief error message in language code "${userLanguage}" saying:
1. There was an error generating the passage
2. They can try again with /reading test
3. Apologetic tone
4. Maximum 2 sentences
5. NO markdown`;

      const errorResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: errorPrompt }],
        temperature: 0.3,
        max_tokens: 100
      });

      await WhatsAppService.sendMessage(
        phoneNumber,
        errorResponse.choices[0].message.content.trim()
      );

      throw error;
    }
  }

  /**
   * Generate passage text using GPT-4
   * @param {string} language - 'en' or 'ur'
   * @param {string} type - 'letters', 'words', 'sentences', 'paragraph', 'story'
   * @param {number} wordCount - Target word count
   * @param {number} grade - Grade level (0-3)
   * @returns {Promise<string>} Generated passage text
   */
  static async generatePassageText(language, type, wordCount, grade) {
    const prompts = {
      letters: {
        en: `CRITICAL: Output ONLY the letters with spaces between them. NO explanatory text, NO titles, NO descriptions, NO meta-commentary.

Generate EXACTLY ${wordCount} random letters for letter recognition practice. NO MORE, NO LESS.
- EXACTLY ${wordCount} letters (count carefully!)
- Use uppercase and lowercase letters
- Mix consonants and vowels
- Separate letters with spaces
- NO sentences or words, just individual letters
- Example format (for 14 letters): "A b C d E f G h I j K l M n"

Bug #24 Fix: MUST generate exactly ${wordCount} letters for 3x4+2 grid layout (3 rows of 4 + 1 row of 2)

IMPORTANT: Start your response DIRECTLY with the first letter. Do NOT include phrases like "Here's a sequence" or "Certainly!" or any other text. JUST THE LETTERS.`,

        ur: `CRITICAL: Output ONLY the Urdu letters with spaces between them. NO explanatory text, NO titles, NO descriptions, NO meta-commentary.

Generate EXACTLY ${wordCount} random Urdu letters for letter recognition practice. NO MORE, NO LESS.
- EXACTLY ${wordCount} letters (count carefully!)
- Use common Urdu alphabet letters (alif, bay, pay, tay, etc.)
- Mix different letter forms
- Separate letters with spaces
- NO diacritical marks (zabar, zer, pesh, etc.) - CRITICAL
- NO words or sentences, just individual letters
- Example format (for 14 letters): ا ب پ ت ٹ ث ج چ ح خ د ڈ ذ ر

Bug #24 Fix: MUST generate exactly ${wordCount} letters for 3x4+2 grid layout (3 rows of 4 + 1 row of 2)

IMPORTANT: Start your response DIRECTLY with the first Urdu letter. Do NOT include phrases like "یہاں ہے" or "Certainly!" or "Here's a sequence" or any other text in any language. JUST THE URDU LETTERS.`
      },

      words: {
        en: `CRITICAL: Generate EXACTLY ${wordCount} simple, grade ${grade}-appropriate English words for reading practice. NO MORE, NO LESS.
- Use common, age-appropriate vocabulary (CVC words, sight words)
- One word per line
- EXACTLY ${wordCount} words (count carefully!)
- NO sentences
- Words should be 3-6 letters long
- Mix phonetic patterns (cat, dog, sun, run, etc.)
- Example format (for 14 words):
cat
dog
sun
run
big
red
hat
sit
top
box
fun
bed
cup
pen

Bug #21 Fix: MUST generate exactly ${wordCount} words for 2-column layout (7 words per column)`,

        ur: `CRITICAL: Generate EXACTLY ${wordCount} simple, grade ${grade}-appropriate Urdu words for reading practice. NO MORE, NO LESS.
- Use common, everyday Urdu vocabulary
- One word per line
- EXACTLY ${wordCount} words (count carefully!)
- NO sentences
- Words should be 2-4 letters long
- CRITICAL: NO diacritical marks (zabar, zer, pesh, etc.)
- CRITICAL: PURE URDU ONLY - NO English words or transliterated English (e.g., use مدرسہ NOT سکول, use گاڑی NOT کار)
- Use words like: کتاب، گھر، درخت، پانی، مدرسہ
- Example format (for 14 words):
کتاب
گھر
پانی
مدرسہ
کھانا
بچہ
ماں
باپ
دوست
رنگ
پھول
پرندہ
شیر
ہاتھی

Bug #21 Fix: MUST generate exactly ${wordCount} words for 2-column layout (7 words per column)`
      },

      sentences: {
        en: `Generate ${Math.floor(wordCount / 10)} short, simple sentences for grade ${grade} reading practice (approximately ${wordCount} words total).

REQUIREMENTS:
- Simple subject-verb-object structure
- Common, age-appropriate vocabulary
- 8-12 words per sentence
- Clear punctuation

🚨 CRITICAL - DIVERSITY RULES (Bug #8 Fix):
- Use DIFFERENT names in each sentence (NOT just Sara/Ali!)
- Names to use: ${getRandomNames(5, 'en').join(', ')}
- Each sentence must have a DIFFERENT topic/theme
- AVOID repeating: ${getAvoidTopics('en')}
- Use topics from: ${getRandomThemes(5, 'en').map(t => t.topic).join(', ')}

VARIED EXAMPLE THEMES (use different ones for each sentence):
School: The teacher reads a story to the class.
Home: Mom makes warm bread for breakfast.
Sports: The boy kicks the ball into the goal.
Nature: Flowers bloom in the sunny garden.
Animals: The cat sleeps on the soft pillow.
Friends: Two friends share a tasty snack.
Weather: The rain falls gently on the roof.
Farm: The farmer feeds the hungry chickens.`,

        ur: `Generate ${Math.floor(wordCount / 10)} short, simple Urdu sentences for grade ${grade} reading practice (approximately ${wordCount} words total).

REQUIREMENTS:
- Simple sentence structure
- Common, everyday Urdu vocabulary
- 8-12 words per sentence
- CRITICAL: NO diacritical marks (zabar, zer, pesh, shadda, etc.)
- CRITICAL: PURE URDU ONLY - NO English words or transliterated English (e.g., use مدرسہ NOT سکول, use گاڑی NOT بس/کار)
- Use Pakistani Urdu (not literary Urdu)

🚨 CRITICAL - DIVERSITY RULES (Bug #8 Fix):
- Use DIFFERENT names in each sentence (NOT just سارہ/علی!)
- Names to use: ${getRandomNames(5, 'ur').join('، ')}
- Each sentence must have a DIFFERENT topic/theme
- AVOID repeating: ${getAvoidTopics('ur')}
- Use topics from: ${getRandomThemes(5, 'ur').map(t => t.topic).join('، ')}

VARIED EXAMPLE THEMES (use different ones for each sentence):
مدرسہ: استاد بچوں کو کہانی سناتا ہے
گھر: امی ناشتے میں پراٹھے بناتی ہے
کھیل: لڑکا گیند کو گول میں مارتا ہے
فطرت: باغ میں خوبصورت پھول کھلتے ہیں
جانور: بلی نرم تکیے پر سوتی ہے
خاندان: دادا بچوں کو کہانی سناتے ہیں
موسم: بارش چھت پر آہستہ گرتی ہے
کھیت: کسان بھوکی مرغیوں کو دانہ دیتا ہے`
      },

      paragraph: {
        en: `Generate a coherent paragraph of approximately ${wordCount} words for grade ${grade} reading fluency assessment.
- Age-appropriate topic (animals, family, school, nature, etc.)
- Simple vocabulary and sentence structures
- 4-6 sentences
- Engaging narrative or description
- Clear punctuation
- Example topic: A day at the park, helping at home, playing with friends

IMPORTANT: Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "A short descriptive title (3-6 words)",
  "passage": "The actual paragraph text that students will read (start directly with first sentence, NO title included in passage)"
}`,

        ur: `Generate a coherent Urdu paragraph of approximately ${wordCount} words for grade ${grade} reading fluency assessment.
- Age-appropriate topic (جانور، خاندان، مدرسہ، فطرت، etc.)
- Simple vocabulary and sentence structures
- 4-6 sentences
- Engaging narrative or description
- CRITICAL: NO diacritical marks (zabar, zer, pesh, shadda, tanween, etc.)
- CRITICAL: PURE URDU ONLY - NO English words or transliterated English (e.g., use مدرسہ NOT سکول, use گاڑی NOT بس/کار, use چڑیا گھر NOT زو)
- Use Pakistani Urdu (not literary Urdu)
- Match style of Pakistani primary school textbooks
- Example topics: پارک میں دن، گھر میں مدد، دوستوں کے ساتھ کھیلنا

IMPORTANT: Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "مختصر عنوان (3-6 الفاظ)",
  "passage": "اصل پیراگراف (پہلے جملے سے شروع کریں، عنوان شامل نہ کریں)"
}`
      },

      story: {
        en: `Generate a short, engaging story of approximately ${wordCount} words for grade ${grade} reading fluency assessment.
- Simple plot with beginning, middle, and end
- Age-appropriate characters and theme
- Grade-appropriate vocabulary
- 8-12 sentences
- Clear dialogue (if included)
- Engaging but not too complex
- Example themes: helping others, overcoming challenges, learning something new

IMPORTANT: Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "A short story title (3-6 words)",
  "passage": "The actual story text that students will read (start directly with story, NO title included in passage)"
}`,

        ur: `Generate a short, engaging Urdu story of approximately ${wordCount} words for grade ${grade} reading fluency assessment.
- Simple plot with beginning, middle, and end
- Age-appropriate characters and theme (Pakistani context)
- Grade-appropriate vocabulary
- 8-12 sentences
- CRITICAL: NO diacritical marks (zabar, zer, pesh, shadda, tanween, etc.)
- CRITICAL: PURE URDU ONLY - NO English words or transliterated English (e.g., use مدرسہ NOT سکول, use گاڑی NOT بس/کار, use چڑیا گھر NOT زو)
- Use Pakistani Urdu (not literary Urdu)
- Match style of Pakistani primary school textbooks and story books
- Example themes: دوسروں کی مدد، مشکلات پر قابو پانا، کچھ نیا سیکھنا

IMPORTANT: Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "مختصر کہانی کا عنوان (3-6 الفاظ)",
  "passage": "اصل کہانی (کہانی کے آغاز سے شروع کریں، عنوان شامل نہ کریں)"
}`
      }
    };

    const prompt = prompts[type][language];

    if (!prompt) {
      throw new Error(`Invalid passage type or language: ${type}, ${language}`);
    }

    logToFile('Generating passage with GPT-4', { type, language, wordCount });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert in early-grade reading assessment and curriculum development. Generate reading passages that match the exact style and complexity of EGRA/ASER assessments used in Pakistan.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: wordCount * 4 // Allow room for generation
    });

    let passageText = response.choices[0].message.content.trim();
    let passageTitle = null;

    // CRITICAL FIX (Bug #16): For paragraph and story types, extract title separately
    // JSON format: { "title": "...", "passage": "..." }
    // Title stored in passage_title column, only passage text used for word alignment
    if (type === 'paragraph' || type === 'story') {
      try {
        // Remove markdown code blocks if present (```json ... ```)
        const cleanedResponse = passageText.replace(/```json\s*|\s*```/g, '').trim();
        const parsed = JSON.parse(cleanedResponse);

        if (parsed.title && parsed.passage) {
          passageTitle = parsed.title.trim();
          passageText = parsed.passage.trim();

          logToFile('✅ Title and passage extracted from JSON', {
            type,
            language,
            title: passageTitle,
            passageLength: passageText.length
          });
        } else {
          logToFile('⚠️ JSON missing title or passage fields, using full text', {
            type,
            parsed
          });
        }
      } catch (jsonError) {
        logToFile('⚠️ Failed to parse JSON response, using full text as passage', {
          type,
          error: jsonError.message,
          response: passageText.substring(0, 200)
        });
        // Keep passageText as-is, passageTitle remains null
      }
    }

    // CRITICAL FIX (Bug #3): Remove ordinal numbers added by GPT
    // GPT-4o often adds "1. 2. 3." before sentences even though not requested
    // This causes word alignment to fail catastrophically (90+ false errors)
    // Regex removes patterns like "1. ", "2. ", "99. " at start of lines
    let cleanedPassageText = passageText
      .replace(/^\d+\.\s+/gm, '')  // Remove "1. ", "2. ", etc. at start of lines (multiline mode)
      .trim();

    // CRITICAL FIX (Bug #25): Enforce exact word count for word-type passages
    // GPT-4 often ignores "EXACTLY X words" constraints and generates more
    // Similar to Bug #24 (letter count validation), truncate to exact count
    if (type === 'words') {
      const words = cleanedPassageText
        .split('\n')
        .map(w => w.trim())
        .filter(w => w.length > 0);

      const originalWordCount = words.length;

      if (originalWordCount !== wordCount) {
        // Truncate to exact count
        const truncatedWords = words.slice(0, wordCount);
        cleanedPassageText = truncatedWords.join('\n');

        logToFile('⚠️ Word count mismatch - truncated to exact count', {
          type,
          language,
          requested: wordCount,
          generated: originalWordCount,
          truncated: truncatedWords.length,
          removedWords: originalWordCount - truncatedWords.length
        });
      } else {
        logToFile('✅ Word count matches exactly', {
          type,
          language,
          wordCount: originalWordCount
        });
      }
    }

    logToFile('✅ Passage generated (ordinal numbers removed if present)', {
      type,
      language,
      originalLength: passageText.length,
      cleanedLength: cleanedPassageText.length,
      hadOrdinalNumbers: passageText.length !== cleanedPassageText.length,
      hasTitle: passageTitle !== null
    });

    // Return object with both title and passage for paragraph/story types
    // For other types, only passage is returned (title is null)
    return { text: cleanedPassageText, title: passageTitle };
  }

  /**
   * Check if Urdu text contains diacritical marks (VALIDATION)
   * @param {string} text - Urdu text to check
   * @returns {boolean} True if diacritics found
   */
  static checkForDiacritics(text) {
    // Unicode ranges for Urdu diacritics
    const diacriticRegex = /[\u064B-\u0652\u0670\u0656\u0657]/g;
    return diacriticRegex.test(text);
  }

  /**
   * Create passage image using Canvas
   * Bug #21 Fix: 2-column layout for word type passages
   * @param {string} text - Passage text
   * @param {string} language - 'en' or 'ur'
   * @param {string} type - Passage type for font size selection
   * @returns {Promise<Buffer>} PNG image buffer
   */
  static async createPassageImage(text, language, type) {
    try {
      logToFile('Creating passage image', { language, type });

      const fontSize = FONT_SIZES[type] || 42;
      // Bug #22 Fix: Use language-specific line height (Urdu 2.0x, English 1.6x)
      const lineHeight = fontSize * (LINE_HEIGHT_MULTIPLIER[language] || LINE_HEIGHT_MULTIPLIER.en);

      // Set font based on language
      // Bug #20 Fix: Use Lexend for English (improves reading proficiency)
      // CRITICAL: Use Noto Nastaliq Urdu for proper contextual letter shaping in Urdu
      const fontFamily = language === 'ur' ? 'Noto Nastaliq Urdu' : 'Lexend';

      // Bug #24 Fix: Use alphabet grid generator for letter type passages
      if (type === 'letters') {
        // Split letters by spaces and take first 14
        const letters = text.split(/\s+/).filter(l => l.length > 0).slice(0, 14);
        if (letters.length === 14) {
          return await generateAlphabetGrid(letters, language, fontFamily);
        }
        // Fallback to standard layout if not exactly 14 letters
        logToFile('⚠️ Letter count not 14, falling back to standard layout', {
          letterCount: letters.length
        });
      }

      // Bug #21 Fix: 2-column layout for word type passages
      if (type === 'words') {
        return this.createTwoColumnWordImage(text, language, fontSize, fontFamily);
      }

      // Standard single-column layout for all other types
      // Create temporary canvas to measure text
      const tempCanvas = getCreateCanvas()(CANVAS_WIDTH, 100);
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.font = `${fontSize}px "${fontFamily}"`; // Quoted font name for fonts with spaces
      tempCtx.textAlign = language === 'ur' ? 'right' : 'left';
      tempCtx.direction = language === 'ur' ? 'rtl' : 'ltr';

      // Word wrap text to fit canvas width
      const lines = this.wrapText(tempCtx, text, CANVAS_WIDTH - (CANVAS_PADDING * 2));

      // Calculate canvas height based on number of lines
      const canvasHeight = (lines.length * lineHeight) + (CANVAS_PADDING * 2) + 100; // Extra space at bottom

      // Create final canvas
      const canvas = getCreateCanvas()(CANVAS_WIDTH, canvasHeight);
      const ctx = canvas.getContext('2d');

      // Try to use background image if enabled
      let usedBackground = false;
      if (USE_BACKGROUND_IMAGES) {
        const backgroundUrl = this.getRandomBackgroundUrl(type);
        if (backgroundUrl) {
          const backgroundImage = await this.fetchBackgroundImage(backgroundUrl);
          if (backgroundImage) {
            // Draw background image (scaled to fit canvas)
            ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, canvasHeight);

            // Apply 85% white overlay for text readability
            const overlayOpacity = PASSAGE_BACKGROUNDS.overlayOpacity || 0.85;
            ctx.fillStyle = `rgba(255, 255, 255, ${overlayOpacity})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

            usedBackground = true;
            logToFile('✅ Applied background image with overlay', { type, url: backgroundUrl });
          }
        }
      }

      // Fallback to solid color if no background
      if (!usedBackground) {
        const fallbackColor = PASSAGE_BACKGROUNDS.fallbackColors?.[type] || BACKGROUND_COLOR;
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);
      }

      // Configure text rendering
      ctx.font = `${fontSize}px "${fontFamily}"`; // Quoted font name for fonts with spaces
      ctx.fillStyle = TEXT_COLOR;
      ctx.textBaseline = 'top';
      ctx.textAlign = language === 'ur' ? 'right' : 'left';
      ctx.direction = language === 'ur' ? 'rtl' : 'ltr';

      // Draw text lines
      const startX = language === 'ur' ? CANVAS_WIDTH - CANVAS_PADDING : CANVAS_PADDING;
      let y = CANVAS_PADDING;

      for (const line of lines) {
        ctx.fillText(line, startX, y);
        y += lineHeight;
      }

      const buffer = canvas.toBuffer('image/png');

      logToFile('✅ Passage image created', {
        width: CANVAS_WIDTH,
        height: canvasHeight,
        lines: lines.length,
        bufferSize: buffer.length
      });

      return buffer;

    } catch (error) {
      logToFile('❌ Error creating passage image', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Bug #21: Create 2-column layout image for word type passages
   * @param {string} text - Word list (one word per line)
   * @param {string} language - 'en' or 'ur'
   * @param {number} fontSize - Font size
   * @param {string} fontFamily - Font family name
   * @returns {Buffer} PNG image buffer
   */
  static createTwoColumnWordImage(text, language, fontSize, fontFamily) {
    // Split text into individual words
    const words = text.split('\n').map(w => w.trim()).filter(w => w.length > 0);

    logToFile('Creating 2-column word layout', {
      language,
      fontSize,
      totalWords: words.length
    });

    // Split words into two columns (7 words each for 14 total)
    const wordsPerColumn = Math.ceil(words.length / 2);
    const leftColumn = words.slice(0, wordsPerColumn);
    const rightColumn = words.slice(wordsPerColumn);

    const lineHeight = fontSize * 1.8; // Slightly more spacing for word lists

    // Calculate canvas dimensions
    const columnWidth = (CANVAS_WIDTH - (CANVAS_PADDING * 3)) / 2; // 3 paddings: left, middle, right
    const maxRows = Math.max(leftColumn.length, rightColumn.length);
    const canvasHeight = (maxRows * lineHeight) + (CANVAS_PADDING * 2) + 100;

    // Create canvas
    const canvas = getCreateCanvas()(CANVAS_WIDTH, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

    // Configure text rendering
    ctx.font = `${fontSize}px "${fontFamily}"`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textBaseline = 'top';

    // For Urdu (RTL), right column comes first visually
    // For English (LTR), left column comes first
    if (language === 'ur') {
      // Right-to-left: Draw right column on left side, left column on right side
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';

      // Draw "left column" words on right side of canvas
      let y = CANVAS_PADDING;
      for (const word of leftColumn) {
        const x = CANVAS_WIDTH - CANVAS_PADDING;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }

      // Draw "right column" words on left side of canvas
      y = CANVAS_PADDING;
      for (const word of rightColumn) {
        const x = CANVAS_WIDTH - CANVAS_PADDING - columnWidth - CANVAS_PADDING;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }
    } else {
      // Left-to-right: Standard column layout
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';

      // Draw left column
      let y = CANVAS_PADDING;
      for (const word of leftColumn) {
        const x = CANVAS_PADDING;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }

      // Draw right column
      y = CANVAS_PADDING;
      for (const word of rightColumn) {
        const x = CANVAS_PADDING + columnWidth + CANVAS_PADDING;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }
    }

    const buffer = canvas.toBuffer('image/png');

    logToFile('✅ 2-column word image created', {
      width: CANVAS_WIDTH,
      height: canvasHeight,
      leftColumnWords: leftColumn.length,
      rightColumnWords: rightColumn.length,
      bufferSize: buffer.length
    });

    return buffer;
  }

  /**
   * Word wrap text to fit within max width
   * @param {CanvasRenderingContext2D} ctx - Canvas context with font already set
   * @param {string} text - Text to wrap
   * @param {number} maxWidth - Maximum line width in pixels
   * @returns {string[]} Array of wrapped lines
   */
  static wrapText(ctx, text, maxWidth) {
    const paragraphs = text.split('\n');
    const lines = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        lines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine !== '') {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  /**
   * Upload passage image to R2 storage
   * @param {Buffer} imageBuffer - PNG image buffer
   * @param {string} userId - User UUID
   * @param {string} assessmentId - Assessment UUID
   * @returns {Promise<string>} Public URL of uploaded image
   */
  static async uploadPassageImage(imageBuffer, userId, assessmentId) {
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

      const r2Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });

      const BUCKET_NAME = process.env.R2_BUCKET_NAME;
      const key = `reading_passages/${userId}/${assessmentId}.png`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: 'image/png',
        Metadata: {
          userId: userId,
          assessmentId: assessmentId,
          generatedAt: new Date().toISOString()
        }
      });

      await r2Client.send(command);

      const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

      logToFile('✅ Passage image uploaded to R2', { key, url: publicUrl });

      return publicUrl;

    } catch (error) {
      logToFile('❌ Error uploading passage image to R2', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = PassageGenerationService;
