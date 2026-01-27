const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { logToFile } = require('./logger');

const execAsync = promisify(exec);

/**
 * Convert GIF to animated WebP sticker
 * @param {string} gifPath - Path to the GIF file
 * @param {string} outputDir - Directory to save the WebP file
 * @returns {Promise<string>} - Path to the converted WebP file
 */
async function convertGifToWebP(gifPath, outputDir) {
  const outputPath = path.join(outputDir, `${path.basename(gifPath, '.gif')}.webp`);

  // Check if WebP already exists
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    logToFile('WebP sticker already exists', {
      outputPath,
      size: `${(stats.size / 1024).toFixed(2)} KB`
    });
    return outputPath;
  }

  try {
    logToFile('Converting GIF to animated WebP sticker...', { gifPath, outputPath });

    // Use ffmpeg to convert GIF to animated WebP
    // -vcodec libwebp: Use WebP codec
    // -lossless 0: Use lossy compression to reduce file size
    // -q:v 80: Quality level (0-100, higher is better)
    // -loop 0: Loop forever
    // -preset default: Compression preset
    // -an: No audio
    // -vsync 0: Preserve frame rate
    const command = `ffmpeg -i "${gifPath}" -vcodec libwebp -lossless 0 -q:v 80 -loop 0 -preset default -an -vsync 0 -y "${outputPath}"`;

    const { stdout, stderr } = await execAsync(command);

    // Check file size
    const stats = fs.statSync(outputPath);
    const fileSizeKB = stats.size / 1024;

    logToFile('✅ GIF converted to animated WebP successfully', {
      outputPath,
      size: `${fileSizeKB.toFixed(2)} KB`,
      maxSize: '500 KB'
    });

    // Warn if file is too large
    if (fileSizeKB > 500) {
      logToFile('⚠️ Warning: WebP sticker exceeds 500 KB limit', {
        size: `${fileSizeKB.toFixed(2)} KB`
      });
    }

    return outputPath;
  } catch (error) {
    logToFile('❌ Failed to convert GIF to WebP', {
      error: error.message,
      gifPath,
      outputPath
    });
    throw new Error(`Failed to convert GIF to WebP: ${error.message}`);
  }
}

module.exports = {
  convertGifToWebP
};
