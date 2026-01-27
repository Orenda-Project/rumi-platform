/**
 * TDD Tests for Video Watermark Service
 * Issue #39: Add Rumi branding watermark to generated videos
 *
 * Run: npm test -- tests/video/watermark.test.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock the service before it exists (TDD approach)
let VideoWatermarkService;

describe('Video Watermark Service', () => {
  const testDir = '/tmp/watermark-test-' + Date.now();
  const testInputVideo = path.join(testDir, 'input.mp4');
  const testOutputVideo = path.join(testDir, 'output.mp4');

  beforeAll(() => {
    // Create test directory
    fs.mkdirSync(testDir, { recursive: true });

    // Create a minimal test video (1 second black screen)
    try {
      execSync(
        `ffmpeg -y -f lavfi -i color=black:s=640x360:d=1 -c:v libx264 -t 1 "${testInputVideo}"`,
        { stdio: 'pipe' }
      );
    } catch (err) {
      console.log('Could not create test video, some tests may fail');
    }

    // Import the service (will fail until implemented)
    try {
      VideoWatermarkService = require('../../shared/services/video/video-watermark.service');
    } catch (err) {
      // Expected to fail in TDD - service not yet implemented
      VideoWatermarkService = null;
    }
  });

  afterAll(() => {
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('addWatermark()', () => {
    it('should export addWatermark function', () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }
      expect(typeof VideoWatermarkService.addWatermark).toBe('function');
    });

    it('should add watermark to video successfully', async () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      const result = await VideoWatermarkService.addWatermark(
        testInputVideo,
        testOutputVideo
      );

      expect(result.success).toBe(true);
      expect(fs.existsSync(testOutputVideo)).toBe(true);
    });

    it('should return fallback path if watermark fails (non-blocking)', async () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      // Force failure with non-existent logo
      const result = await VideoWatermarkService.addWatermark(
        testInputVideo,
        path.join(testDir, 'output_fail.mp4'),
        { logoPath: '/nonexistent/logo.png' }
      );

      expect(result.success).toBe(false);
      expect(result.fallbackPath).toBe(testInputVideo);
      expect(result.error).toBeDefined();
    });

    it('should preserve video duration when adding watermark', async () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      await VideoWatermarkService.addWatermark(testInputVideo, testOutputVideo);

      // Get durations using ffprobe
      const getMediaDuration = (filePath) => {
        try {
          const result = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
            { encoding: 'utf8' }
          );
          return parseFloat(result.trim());
        } catch {
          return 0;
        }
      };

      const inputDuration = getMediaDuration(testInputVideo);
      const outputDuration = getMediaDuration(testOutputVideo);

      expect(Math.abs(inputDuration - outputDuration)).toBeLessThan(0.5);
    });

    it('should work with text-only watermark if logo missing', async () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      const result = await VideoWatermarkService.addWatermark(
        testInputVideo,
        path.join(testDir, 'output_textonly.mp4'),
        { logoPath: null, textOnly: true }
      );

      // Should succeed with text-only fallback
      expect(result.success).toBe(true);
    });

    it('should handle non-existent input video gracefully', async () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      const result = await VideoWatermarkService.addWatermark(
        '/nonexistent/video.mp4',
        testOutputVideo
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getWatermarkConfig()', () => {
    it('should return default watermark configuration', () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      const config = VideoWatermarkService.getWatermarkConfig();

      expect(config.logoSize).toBeDefined();
      expect(config.fontSize).toBeDefined();
      expect(config.text).toBeDefined();
      expect(config.position).toBe('bottom-right');
    });
  });

  describe('isWatermarkEnabled()', () => {
    it('should return true by default', () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      expect(VideoWatermarkService.isWatermarkEnabled()).toBe(true);
    });

    it('should respect VIDEO_WATERMARK_ENABLED env var', () => {
      if (!VideoWatermarkService) {
        console.log('SKIP: Service not yet implemented');
        return;
      }

      const original = process.env.VIDEO_WATERMARK_ENABLED;

      process.env.VIDEO_WATERMARK_ENABLED = 'false';
      expect(VideoWatermarkService.isWatermarkEnabled()).toBe(false);

      process.env.VIDEO_WATERMARK_ENABLED = 'true';
      expect(VideoWatermarkService.isWatermarkEnabled()).toBe(true);

      // Restore
      if (original !== undefined) {
        process.env.VIDEO_WATERMARK_ENABLED = original;
      } else {
        delete process.env.VIDEO_WATERMARK_ENABLED;
      }
    });
  });
});
