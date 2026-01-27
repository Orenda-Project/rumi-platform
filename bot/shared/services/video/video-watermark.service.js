/**
 * Video Watermark Service
 * Issue #39: Add Rumi branding watermark to generated videos
 *
 * CRITICAL: This service is NON-BLOCKING.
 * If watermarking fails, the original video is returned without watermark.
 * Video delivery should NEVER fail due to watermark issues.
 */

const { logToFile } = require('../../utils/logger');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Use ffmpeg from npm package (cross-platform compatible)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Default watermark configuration
const DEFAULT_CONFIG = {
  logoSize: 45,           // Logo dimensions in pixels
  fontSize: 18,           // Text font size
  text: process.env.VIDEO_WATERMARK_TEXT || 'Created with Rumi',
  position: 'bottom-right',
  boxOpacity: 0.55,       // Dark box opacity
  boxWidth: 400,          // Box width in pixels
  boxHeight: 60,          // Box height in pixels
  padding: 12,            // Padding from edges
};

// Path to the white Rumi logo asset
const LOGO_PATH = path.join(__dirname, '../../assets/rumi-watermark-logo.png');

class VideoWatermarkService {

  /**
   * Check if watermarking is enabled
   * Can be disabled via VIDEO_WATERMARK_ENABLED=false env var
   * @returns {boolean}
   */
  static isWatermarkEnabled() {
    const envValue = process.env.VIDEO_WATERMARK_ENABLED;
    if (envValue === 'false' || envValue === '0') {
      return false;
    }
    return true; // Enabled by default
  }

  /**
   * Get watermark configuration
   * @returns {Object} Watermark config
   */
  static getWatermarkConfig() {
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Add watermark to a video file
   *
   * CRITICAL: This method is NON-BLOCKING.
   * On failure, returns { success: false, fallbackPath: inputPath }
   * The caller should use fallbackPath to continue without watermark.
   *
   * @param {string} inputPath - Path to input video
   * @param {string} outputPath - Path to output watermarked video
   * @param {Object} options - Optional overrides
   * @returns {Promise<{success: boolean, path?: string, fallbackPath?: string, error?: string}>}
   */
  static async addWatermark(inputPath, outputPath, options = {}) {
    const startTime = Date.now();

    try {
      // Check if watermarking is enabled
      if (!this.isWatermarkEnabled()) {
        logToFile('Watermark disabled via env var, skipping', { inputPath });
        // Copy input to output without watermark
        fs.copyFileSync(inputPath, outputPath);
        return { success: true, path: outputPath, skipped: true };
      }

      // Validate input file exists
      if (!fs.existsSync(inputPath)) {
        logToFile('Watermark input file not found', { inputPath });
        return {
          success: false,
          fallbackPath: inputPath,
          error: 'Input file not found'
        };
      }

      // Determine logo path
      const logoPath = options.logoPath !== undefined ? options.logoPath : LOGO_PATH;
      const useTextOnly = options.textOnly || (logoPath && !fs.existsSync(logoPath));

      // Build FFmpeg filter
      const config = { ...DEFAULT_CONFIG, ...options };
      const filter = this._buildFilterComplex(config, logoPath, useTextOnly);

      // Build FFmpeg command
      const ffmpegCmd = useTextOnly
        ? this._buildTextOnlyCommand(inputPath, outputPath, filter)
        : this._buildFullCommand(inputPath, outputPath, logoPath, filter);

      // Execute FFmpeg
      logToFile('Applying watermark to video', {
        inputPath,
        outputPath,
        useTextOnly,
        hasLogo: !!logoPath && fs.existsSync(logoPath)
      });

      execSync(ffmpegCmd, { stdio: 'pipe', timeout: 300000 }); // 5 min timeout

      // Verify output was created
      if (!fs.existsSync(outputPath)) {
        throw new Error('FFmpeg completed but output file not found');
      }

      const elapsedMs = Date.now() - startTime;
      logToFile('Watermark applied successfully', {
        inputPath,
        outputPath,
        elapsedMs
      });

      return { success: true, path: outputPath };

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      logToFile('Watermark application failed (non-blocking)', {
        inputPath,
        outputPath,
        error: error.message,
        elapsedMs
      });

      // Return fallback - original video without watermark
      return {
        success: false,
        fallbackPath: inputPath,
        error: error.message
      };
    }
  }

  /**
   * Get a suitable font for drawtext
   * Railway/Linux uses DejaVu, macOS uses Arial
   * @private
   */
  static _getFontPath() {
    const possibleFonts = [
      // Railway/Linux (DejaVu is commonly available)
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/dejavu/DejaVuSans.ttf',
      // macOS
      '/System/Library/Fonts/Helvetica.ttc',
      '/System/Library/Fonts/Supplemental/Arial.ttf',
      '/Library/Fonts/Arial.ttf',
    ];

    for (const fontPath of possibleFonts) {
      if (fs.existsSync(fontPath)) {
        return fontPath;
      }
    }

    return null; // Will use fontconfig fallback
  }

  /**
   * Build FFmpeg filter_complex string
   * @private
   */
  static _buildFilterComplex(config, logoPath, textOnly) {
    const { logoSize, fontSize, text, boxOpacity, boxWidth, boxHeight, padding } = config;

    // Escape text for FFmpeg (spaces need backslash)
    const escapedText = text.replace(/ /g, '\\ ');

    // Get font configuration
    const fontPath = this._getFontPath();
    const fontConfig = fontPath ? `fontfile=${fontPath}:` : '';

    if (textOnly) {
      // Text-only filter (no logo)
      return `drawbox=x=iw-${boxWidth}:y=ih-${boxHeight}:w=${boxWidth}:h=${boxHeight}:color=black@${boxOpacity}:t=fill,` +
        `drawtext=${fontConfig}text=${escapedText}:fontsize=${fontSize}:fontcolor=white:x=W-tw-${padding}:y=H-${boxHeight / 2 + fontSize / 2}:shadowcolor=black@0.5:shadowx=1:shadowy=1`;
    }

    // Full filter with logo and text
    return `[0:v]drawbox=x=iw-${boxWidth}:y=ih-${boxHeight}:w=${boxWidth}:h=${boxHeight}:color=black@${boxOpacity}:t=fill[bg];` +
      `[1:v]scale=${logoSize}:${logoSize}[logo];` +
      `[bg][logo]overlay=W-w-${padding}:H-h-${Math.floor(boxHeight / 2 - logoSize / 2)}:format=auto,` +
      `drawtext=${fontConfig}text=${escapedText}:fontsize=${fontSize}:fontcolor=white:x=W-tw-${logoSize + padding + 10}:y=H-${Math.floor(boxHeight / 2 + fontSize / 2)}:shadowcolor=black@0.5:shadowx=1:shadowy=1`;
  }

  /**
   * Build full FFmpeg command with logo
   * ISSUE #59 FIX: Re-encode video for WhatsApp mobile compatibility
   * @private
   */
  static _buildFullCommand(inputPath, outputPath, logoPath, filter) {
    // ISSUE #59: WhatsApp mobile requires yuv420p pixel format
    // Without this, videos show black screen on mobile (audio only)
    return `"${ffmpegPath}" -y -i "${inputPath}" -i "${logoPath}" ` +
      `-filter_complex "${filter}" ` +
      `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -profile:v main -level 3.1 ` +
      `-c:a copy -movflags +faststart "${outputPath}"`;
  }

  /**
   * Build text-only FFmpeg command (no logo input)
   * ISSUE #59 FIX: Re-encode video for WhatsApp mobile compatibility
   * @private
   */
  static _buildTextOnlyCommand(inputPath, outputPath, filter) {
    // ISSUE #59: WhatsApp mobile requires yuv420p pixel format
    // Without this, videos show black screen on mobile (audio only)
    return `"${ffmpegPath}" -y -i "${inputPath}" -vf "${filter}" ` +
      `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -profile:v main -level 3.1 ` +
      `-c:a copy -movflags +faststart "${outputPath}"`;
  }
}

module.exports = VideoWatermarkService;
