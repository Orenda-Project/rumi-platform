/**
 * HTML→PDF Conversion Utility — Playwright engine.
 *
 * Used to render HTML strings to print-quality PDFs (and PNGs) — e.g. the
 * reading-assessment report, which needs proper Urdu/Nastaliq glyph shaping
 * that Chromium's HarfBuzz pipeline provides.
 *
 * Design decisions:
 * - Lazy-initialized browser singleton: launches are expensive (1-2s),
 *   so we reuse a single browser instance across calls. A launch lock
 *   prevents concurrent first-time launches from spawning two browsers.
 * - waitUntil: 'domcontentloaded' is the fast path. We then await
 *   `document.fonts.ready` before page.pdf() to ensure embedded base64
 *   fonts have been parsed and applied — without this, glyphs render
 *   blank for languages that depend on the embedded fonts (Urdu, etc.).
 * - System Chromium discovery: playwright-core does NOT bundle Chromium.
 *   We look for a system install (set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or
 *   PUPPETEER_EXECUTABLE_PATH, or install chromium at /usr/bin/chromium).
 *   When no Chromium is found, page.pdf throws a clear "browser not found"
 *   error — callers (e.g. the reading report) fall back to a PDFKit renderer,
 *   so a deployment without Chromium still produces reports.
 * - Process exit cleanup: browser is killed on SIGINT/SIGTERM/exit.
 */

const fs = require('fs');
const { chromium } = require('playwright-core');
const { logToFile } = require('./logger');

function resolveChromiumPath() {
  // Explicit env vars first (PLAYWRIGHT_* preferred; PUPPETEER_* accepted for
  // compatibility with hosts that set it for a legacy Puppeteer wrapper).
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/nix/var/nix/profiles/default/bin/chromium',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null; // playwright-core will throw a clear "browser not found" error
}

/** @type {import('playwright-core').Browser|null} */
let _browser = null;

/** @type {Promise<import('playwright-core').Browser>|null} */
let _launchPromise = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_launchPromise) return _launchPromise;

  _launchPromise = (async () => {
    try {
      logToFile('Launching Playwright Chromium for HTML→PDF');

      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--font-render-hinting=none',
        ],
      };

      // Use system Chromium when present so we don't pull the bundled
      // Playwright binary into the build image.
      const execPath = resolveChromiumPath();
      if (execPath) {
        launchOptions.executablePath = execPath;
        logToFile('Playwright using system Chromium', { executablePath: execPath });
      }

      const browser = await chromium.launch(launchOptions);

      browser.on('disconnected', () => {
        logToFile('Playwright browser disconnected');
        _browser = null;
      });

      _browser = browser;
      logToFile('Playwright browser launched successfully');
      return browser;
    } catch (error) {
      _browser = null;
      logToFile('Failed to launch Playwright browser', { error: error.message });
      throw error;
    } finally {
      _launchPromise = null;
    }
  })();

  return _launchPromise;
}

/**
 * Convert an HTML string to a PDF buffer.
 *
 * Waits for `document.fonts.ready` before PDF capture so embedded
 * @font-face data: URIs render correctly. Without this, glyphs that
 * depend on a custom font (e.g. Noto Nastaliq Urdu) render blank.
 *
 * @param {string} html - The full HTML string to convert.
 * @param {Object} [options]
 * @param {number} [options.timeout=30000] - Max ms to wait for setContent.
 * @param {Object} [options.pdfOptions] - Passed directly to page.pdf().
 *   Defaults: format A4, printBackground=true, 50px margins.
 * @returns {Promise<Buffer>} The generated PDF as a Buffer.
 */
async function htmlToPdf(html, options = {}) {
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout || 30000,
    });
    // Critical for embedded base64 fonts: glyphs render blank otherwise.
    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '50px', right: '50px', bottom: '50px', left: '50px' },
      ...options.pdfOptions,
    });

    logToFile('PDF generated successfully', {
      sizeKB: (pdfBuffer.length / 1024).toFixed(2),
    });
    return pdfBuffer;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Render an HTML string to a PNG image Buffer (for WhatsApp image cards etc.).
 *
 * Same browser singleton + `document.fonts.ready` discipline as htmlToPdf, so
 * base64-embedded @font-face data URIs (Nastaliq / Naskh / Inter) render. By
 * default it screenshots the `.card` element (variable-height card crops to
 * content); if that selector is absent it falls back to a full-page shot.
 *
 * @param {string} html - The full HTML string to render.
 * @param {Object} [options]
 * @param {number} [options.width=680] - Layout viewport width in CSS px.
 * @param {number} [options.deviceScaleFactor=2] - Retina scale (2 = crisp on phones).
 * @param {string} [options.selector='.card'] - Element to crop to. Falsy → full page.
 * @param {number} [options.timeout=30000] - Max ms to wait for setContent.
 * @returns {Promise<Buffer>} PNG image as a Buffer.
 */
async function htmlToImage(html, options = {}) {
  const {
    width = 680,
    deviceScaleFactor = 2,
    selector = '.card',
    timeout = 30000,
  } = options;

  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width, height: 100 }, // height grows to content for element shots
    deviceScaleFactor,
  });
  const page = await ctx.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout });
    // Critical for embedded base64 fonts: glyphs render blank otherwise.
    await page.evaluate(() => document.fonts.ready);

    const el = selector ? await page.$(selector) : null;
    const target = el || page;
    const pngBuffer = await target.screenshot({ type: 'png' });

    logToFile('Image generated successfully', {
      sizeKB: (pngBuffer.length / 1024).toFixed(2),
      croppedToSelector: !!el,
    });
    return pngBuffer;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Explicitly close the shared browser instance.
 * Useful for graceful shutdown or test teardown.
 */
async function closeBrowser() {
  if (_browser) {
    try {
      await _browser.close();
      logToFile('Playwright browser closed');
    } catch (error) {
      logToFile('Error closing Playwright browser', { error: error.message });
    } finally {
      _browser = null;
    }
  }
}

// Cleanup on process exit
process.on('exit', () => {
  if (_browser) _browser.close().catch(() => {});
});
process.on('SIGINT', () => closeBrowser().finally(() => process.exit()));
process.on('SIGTERM', () => closeBrowser().finally(() => process.exit()));

module.exports = { htmlToPdf, htmlToImage, closeBrowser };
