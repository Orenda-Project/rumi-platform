/**
 * Canvas Loader Utility
 *
 * Provides graceful fallback for canvas module which requires native compilation.
 * Canvas has system dependencies that vary by OS:
 * - Linux: libcairo2-dev, libjpeg-dev, libpango1.0-dev, libgif-dev, librsvg2-dev
 * - macOS: brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
 * - Windows: GTK2 runtime, Visual Studio Build Tools, Python
 *
 * If canvas is not available, features that require image generation will be disabled.
 *
 * @see https://github.com/Automattic/node-canvas/wiki
 */

let canvasModule = null;
let canvasError = null;
let chartJSNodeCanvas = null;
let chartJSError = null;

// Try to load canvas
try {
  canvasModule = require('canvas');
} catch (error) {
  canvasError = error;
  console.warn(`[canvas-loader] Canvas module not available: ${error.message}`);
  console.warn('[canvas-loader] Features requiring image generation will be disabled.');
  console.warn('[canvas-loader] To enable, install system dependencies:');
  console.warn('[canvas-loader]   Linux: sudo apt-get install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev');
  console.warn('[canvas-loader]   macOS: brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman');
  console.warn('[canvas-loader]   Windows: See https://github.com/Automattic/node-canvas/wiki/Installation:-Windows');
}

// Try to load chartjs-node-canvas
try {
  chartJSNodeCanvas = require('chartjs-node-canvas');
} catch (error) {
  chartJSError = error;
  // Only warn if canvas loaded but chartjs didn't (unlikely)
  if (canvasModule) {
    console.warn(`[canvas-loader] ChartJS Node Canvas not available: ${error.message}`);
  }
}

/**
 * Check if canvas is available
 * @returns {boolean} True if canvas module loaded successfully
 */
function isCanvasAvailable() {
  return canvasModule !== null;
}

/**
 * Check if chart generation is available
 * @returns {boolean} True if chartjs-node-canvas module loaded successfully
 */
function isChartAvailable() {
  return chartJSNodeCanvas !== null;
}

/**
 * Get the canvas module (throws if not available)
 * @returns {object} Canvas module exports
 * @throws {Error} If canvas is not available
 */
function getCanvas() {
  if (!canvasModule) {
    const error = new Error('Canvas module not available. Image generation features are disabled.');
    error.code = 'CANVAS_NOT_AVAILABLE';
    error.installInstructions = {
      linux: 'sudo apt-get install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev',
      macos: 'brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman',
      windows: 'See https://github.com/Automattic/node-canvas/wiki/Installation:-Windows'
    };
    throw error;
  }
  return canvasModule;
}

/**
 * Get chartjs-node-canvas module (throws if not available)
 * @returns {object} ChartJSNodeCanvas class
 * @throws {Error} If chartjs-node-canvas is not available
 */
function getChartJSNodeCanvas() {
  if (!chartJSNodeCanvas) {
    const error = new Error('ChartJS Node Canvas not available. Chart generation features are disabled.');
    error.code = 'CHARTJS_NOT_AVAILABLE';
    throw error;
  }
  return chartJSNodeCanvas;
}

/**
 * Safely create a canvas (returns null if not available)
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {object|null} Canvas instance or null
 */
function createCanvasSafe(width, height) {
  if (!canvasModule) return null;
  return canvasModule.createCanvas(width, height);
}

/**
 * Get the installation error if canvas failed to load
 * @returns {Error|null} The error that occurred during loading, or null if loaded successfully
 */
function getCanvasError() {
  return canvasError;
}

/**
 * Get human-readable status of canvas availability
 * @returns {object} Status object with available flag and message
 */
function getStatus() {
  return {
    canvasAvailable: isCanvasAvailable(),
    chartAvailable: isChartAvailable(),
    message: isCanvasAvailable()
      ? 'Canvas is available - all image generation features enabled'
      : 'Canvas not available - image generation features disabled (reading grids, charts, annotations)',
    error: canvasError ? canvasError.message : null
  };
}

module.exports = {
  isCanvasAvailable,
  isChartAvailable,
  getCanvas,
  getChartJSNodeCanvas,
  createCanvasSafe,
  getCanvasError,
  getStatus,
  // Re-export canvas functions for convenience (will throw if not available)
  get createCanvas() { return getCanvas().createCanvas; },
  get loadImage() { return getCanvas().loadImage; },
  get registerFont() { return getCanvas().registerFont; },
  get ChartJSNodeCanvas() { return getChartJSNodeCanvas().ChartJSNodeCanvas; }
};
