/**
 * Alphabet Grid Generator
 * Bug #24 Fix: Generate structured 3x4+2 alphabet grid using Canvas
 *
 * Purpose: Create consistent, professional alphabet assessment images
 * without GPT-4 Vision's prompt injection risk
 *
 * Layout: 3 rows of 4 letters + 1 row of 2 letters (14 total)
 */

const { createCanvas } = require('canvas');
const { logToFile } = require('./logger');

// Grid configuration
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const BACKGROUND_COLOR = '#FFFFFF';
const TEXT_COLOR = '#1A1A1A';
const FONT_SIZE = 80; // Bug #26: Increased from 72 for better visibility
const CELL_WIDTH = 200; // Bug #XX: Reduced from 300 to fix excessive white space (was 66% wasted)
const CELL_HEIGHT = 200;
const START_Y = 50; // Bug #26: Reduced from 100 to prevent top row clipping

/**
 * Generate alphabet grid image for reading assessment
 * @param {string[]} letters - Array of 14 letters to display
 * @param {string} language - 'en' or 'ur'
 * @param {string} fontFamily - Font family to use ('Lexend' for English, 'Noto Nastaliq Urdu' for Urdu)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateAlphabetGrid(letters, language, fontFamily) {
  try {
    // Bug #5 Fix: Determine if RTL language (Urdu, Arabic read right-to-left)
    const isRTL = ['ur', 'ar'].includes(language);

    logToFile('📊 Generating alphabet grid', {
      language,
      letterCount: letters.length,
      fontFamily,
      isRTL
    });

    // Validate input
    if (!letters || letters.length !== 14) {
      throw new Error(`Expected 14 letters, got ${letters?.length || 0}`);
    }

    // Bug #5 Fix: For RTL languages, reverse letter order so position 0 is on the RIGHT
    // This allows natural right-to-left reading while maintaining position-based scoring
    const displayLetters = isRTL ? [...letters].reverse() : letters;

    // Create canvas
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Configure text rendering
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `bold ${FONT_SIZE}px "${fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = language === 'ur' ? 'rtl' : 'ltr';

    // Grid layout: 3 rows of 4 + 1 row of 2
    const rows = [4, 4, 4, 2];
    let letterIndex = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const lettersInRow = rows[rowIndex];
      const rowY = START_Y + rowIndex * CELL_HEIGHT;

      // Center the row horizontally
      const rowWidth = lettersInRow * CELL_WIDTH;
      const rowStartX = (CANVAS_WIDTH - rowWidth) / 2;

      // Bug #5 Fix: Add row number with direction arrow
      const rowNumberX = isRTL ? rowStartX + rowWidth + 40 : rowStartX - 40;
      const directionArrow = isRTL ? '←' : '→';
      ctx.fillStyle = '#999999'; // Light gray for row indicators
      ctx.font = `${FONT_SIZE * 0.5}px "${fontFamily}"`;
      ctx.textAlign = 'center';
      ctx.fillText(`${rowIndex + 1}${directionArrow}`, rowNumberX, rowY + CELL_HEIGHT / 2);

      // Reset font for letters
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `bold ${FONT_SIZE}px "${fontFamily}"`;

      for (let colIndex = 0; colIndex < lettersInRow; colIndex++) {
        const letter = displayLetters[letterIndex];
        const x = rowStartX + colIndex * CELL_WIDTH + CELL_WIDTH / 2;
        const y = rowY + CELL_HEIGHT / 2;

        // Draw letter
        ctx.fillText(letter, x, y);

        letterIndex++;
      }
    }

    const buffer = canvas.toBuffer('image/png');

    logToFile('✅ Alphabet grid generated', {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      letters: letters.join(' '),
      bufferSize: buffer.length
    });

    return buffer;
  } catch (error) {
    logToFile('❌ Error generating alphabet grid', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  generateAlphabetGrid
};
