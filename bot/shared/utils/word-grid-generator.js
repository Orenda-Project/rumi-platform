/**
 * Word Grid Generator
 * Bug #27 Fix: Generate structured 2-column word grid using Canvas
 *
 * Purpose: Create consistent, professional word assessment images
 * with GPT-4 age-appropriate words + guaranteed word count
 *
 * Hybrid Approach:
 * 1. GPT-4 generates 20-30 age-appropriate words (leverages AI intelligence)
 * 2. We truncate to exactly 14 words (guarantees count compliance)
 * 3. Canvas renders in 2-column layout (professional formatting)
 *
 * Layout: 2 columns x 7 rows (14 total words)
 */

const { createCanvas } = require('canvas');
const { logToFile } = require('./logger');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Grid configuration
const CANVAS_WIDTH = 1080;
const CANVAS_PADDING = 60;
const ROW_INDICATOR_WIDTH = 60; // Bug #17: Space for row indicators
const BACKGROUND_COLOR = '#FFFFFF';
const TEXT_COLOR = '#1A1A1A';
const ROW_INDICATOR_COLOR = '#999999'; // Bug #17: Light gray for row indicators
const FONT_SIZE = 80; // Match passage-generation.service.js words font size
const LINE_HEIGHT_MULTIPLIER = 1.8; // Consistent with word rendering

/**
 * Generate age-appropriate word list using GPT-4 + post-processing
 * @param {number} wordCount - Number of words to generate (must be 14)
 * @param {number} gradeLevel - Grade level (0-5)
 * @param {string} language - 'en' or 'ur'
 * @returns {Promise<string[]>} Array of exactly 14 words
 */
async function generateRandomWords(wordCount, gradeLevel, language) {
  if (wordCount !== 14) {
    throw new Error(`Bug #27 requires exactly 14 words, got ${wordCount}`);
  }

  try {
    // Grade level descriptions for GPT context
    const gradeDescriptions = {
      0: 'Early Years (Age 5-6): Simple CVC words, basic phonics',
      1: 'Primary 1 (Age 6-7): CCVC/CVCC words, common objects',
      2: 'Primary 2 (Age 7-8): Multi-syllabic words, abstract concepts',
      3: 'Primary 3 (Age 8-9): Complex multi-syllabic words, descriptive language',
      4: 'Primary 4 (Age 9-10): Advanced vocabulary, compound words',
      5: 'Primary 5 (Age 10-11): Complex academic vocabulary'
    };

    const languageNames = {
      en: 'English',
      ur: 'Urdu',
      ar: 'Arabic',
      es: 'Spanish'
    };

    const prompt = `Generate 20-30 age-appropriate words for a reading fluency assessment.

**Requirements**:
- Language: ${languageNames[language] || language}
- Grade Level: ${gradeDescriptions[gradeLevel] || gradeLevel}
- Words should be suitable for EGRA (Early Grade Reading Assessment)
- For English: Phonetically decodable, appropriate complexity for grade
- For Urdu: NO diacritics (harakat), common vocabulary from Pakistani textbooks
- Mix of nouns, verbs, adjectives appropriate for the grade level

**Format**: Return ONLY the words separated by commas, nothing else.

Example output format: word1, word2, word3, ...`;

    logToFile('🤖 Calling GPT-4 for word generation', {
      language,
      gradeLevel,
      targetWords: 20
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert in EGRA reading assessments and age-appropriate vocabulary selection.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8, // Higher creativity for word variety
      max_tokens: 500
    });

    const generatedText = response.choices[0].message.content.trim();

    // Parse GPT response (comma-separated words)
    let words = generatedText
      .split(',')
      .map(w => w.trim())
      .filter(w => w.length > 0);

    logToFile('✅ GPT-4 word generation complete', {
      language,
      gradeLevel,
      wordsGenerated: words.length,
      firstFewWords: words.slice(0, 5).join(', ')
    });

    // Bug #27 Fix: Truncate to exactly 14 words (guarantees count compliance)
    const selectedWords = words.slice(0, 14);

    if (selectedWords.length < 14) {
      throw new Error(`GPT-4 generated only ${selectedWords.length} words, need 14`);
    }

    logToFile('✅ Word selection complete', {
      language,
      gradeLevel,
      wordCount: selectedWords.length,
      words: selectedWords.join(', ')
    });

    return selectedWords;

  } catch (error) {
    logToFile('❌ Error generating words with GPT-4', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Generate word grid image for reading assessment
 * @param {string[]} words - Array of 14 words to display
 * @param {string} language - 'en' or 'ur'
 * @param {string} fontFamily - Font family to use ('Lexend' for English, 'Noto Nastaliq Urdu' for Urdu)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateWordGrid(words, language, fontFamily) {
  try {
    logToFile('📊 Generating word grid', {
      language,
      wordCount: words.length,
      fontFamily
    });

    // Validate input
    if (!words || words.length !== 14) {
      throw new Error(`Expected 14 words, got ${words?.length || 0}`);
    }

    // Calculate layout
    const lineHeight = FONT_SIZE * LINE_HEIGHT_MULTIPLIER;
    const wordsPerColumn = 7;
    const leftColumn = words.slice(0, wordsPerColumn);
    const rightColumn = words.slice(wordsPerColumn);

    // Calculate canvas dimensions
    const columnWidth = (CANVAS_WIDTH - (CANVAS_PADDING * 3)) / 2; // 3 paddings: left, middle, right
    const canvasHeight = (wordsPerColumn * lineHeight) + (CANVAS_PADDING * 2) + 100;

    // Create canvas
    const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

    // Configure text rendering
    ctx.font = `${FONT_SIZE}px "${fontFamily}"`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textBaseline = 'top';

    // For Urdu/Arabic (RTL), right column comes first visually
    // For English (LTR), left column comes first
    const isRTL = ['ur', 'ar'].includes(language);

    if (isRTL) {
      // Right-to-left: Draw right column on left side, left column on right side
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';

      // Draw "left column" words on right side of canvas with row indicators
      let y = CANVAS_PADDING;
      for (let i = 0; i < leftColumn.length; i++) {
        const word = leftColumn[i];

        // Bug #17: Draw row indicator on the right (←1, ←2, etc. for RTL)
        ctx.fillStyle = ROW_INDICATOR_COLOR;
        ctx.font = `${FONT_SIZE * 0.4}px "${fontFamily}"`;
        ctx.textAlign = 'left';
        ctx.fillText(`←${i + 1}`, CANVAS_WIDTH - CANVAS_PADDING + 10, y + (FONT_SIZE * 0.3));

        // Draw the word
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = `${FONT_SIZE}px "${fontFamily}"`;
        ctx.textAlign = 'right';
        const x = CANVAS_WIDTH - CANVAS_PADDING - ROW_INDICATOR_WIDTH;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }

      // Draw "right column" words on left side of canvas (no indicators - continues from right)
      y = CANVAS_PADDING;
      for (const word of rightColumn) {
        const x = CANVAS_WIDTH - CANVAS_PADDING - ROW_INDICATOR_WIDTH - columnWidth - CANVAS_PADDING;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }
    } else {
      // Left-to-right: Standard column layout
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';

      // Draw left column with row indicators
      let y = CANVAS_PADDING;
      for (let i = 0; i < leftColumn.length; i++) {
        const word = leftColumn[i];

        // Bug #17: Draw row indicator (1→, 2→, etc.)
        ctx.fillStyle = ROW_INDICATOR_COLOR;
        ctx.font = `${FONT_SIZE * 0.4}px "${fontFamily}"`;
        ctx.textAlign = 'right';
        ctx.fillText(`${i + 1}→`, CANVAS_PADDING - 10, y + (FONT_SIZE * 0.3));

        // Draw the word
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = `${FONT_SIZE}px "${fontFamily}"`;
        ctx.textAlign = 'left';
        const x = CANVAS_PADDING + ROW_INDICATOR_WIDTH;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }

      // Draw right column (no row indicators - continues from left)
      y = CANVAS_PADDING;
      for (const word of rightColumn) {
        const x = CANVAS_PADDING + ROW_INDICATOR_WIDTH + columnWidth + CANVAS_PADDING;
        ctx.fillText(word, x, y);
        y += lineHeight;
      }
    }

    const buffer = canvas.toBuffer('image/png');

    logToFile('✅ Word grid generated', {
      width: CANVAS_WIDTH,
      height: canvasHeight,
      leftColumnWords: leftColumn.length,
      rightColumnWords: rightColumn.length,
      bufferSize: buffer.length
    });

    return buffer;
  } catch (error) {
    logToFile('❌ Error generating word grid', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  generateRandomWords,
  generateWordGrid
};
