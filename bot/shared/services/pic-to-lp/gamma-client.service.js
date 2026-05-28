/**
 * Gamma Client
 *
 * Standalone wrapper around the Gamma generations API. Lifted from the
 * duplicated _generateViaGamma in the page/chapter LP generation services so
 * pic-to-LP doesn't add a third copy.
 *
 * Language support:
 *   en  → textOptions.language='en' (default)
 *   ur  → textOptions.language='ur' + Urdu RTL instructions
 *   sw  → textOptions.language='sw' (Gamma supports it natively)
 *   sd  → textOptions.language='ur' (Gamma doesn't support 'sd') + Sindhi instructions
 *          asking the model to write in Sindhi using Naskh script. Best-effort.
 */

const axios = require('axios');
const { logToFile } = require('../../utils/logger');
const { GAMMA_API_KEY, GAMMA_MAX_ATTEMPTS, GAMMA_POLL_INTERVAL } = require('../../utils/constants');

const SUPPORTED_LANGUAGES = ['en', 'ur', 'sw', 'sd'];

const BASE_INSTRUCTIONS = 'LAYOUT: For each daily lesson plan, use a TWO-COLUMN layout — Engage/Explore/Explain on the LEFT column, Practice/Exit Ticket/Homework on the RIGHT column. Use a TIMELINE for the lesson flow overview at the top of each day. CALLOUT DIFFERENTIATION: Use different callout styles — "Teacher says:" QUOTE block, "MODEL ANSWER:" TIP/SUCCESS callout, "Watch out:" WARNING/CAUTION callout. Render BOARD CONTENT as CODE BLOCKS (monospace, bordered, grey) — number lines, place value charts, ASCII diagrams. Display vocabulary as a styled TABLE. Use ICON layouts for materials. NUMBERED LISTS for practice problems. Bold all time allocations. Use TOGGLE blocks for extension activities. Embed scaffolding/extension within Practice — no separate DIFFERENTIATION section.';

function buildLanguageOverrides(language) {
  switch (language) {
    case 'ur':
      return {
        gammaLang: 'ur',
        extraInstructions: ' Write in Urdu (RTL). Use bilingual terms for technical vocabulary (e.g., "Fraction (کسر)").',
      };
    case 'sw':
      return {
        gammaLang: 'sw',
        extraInstructions: ' Write the lesson plan body in Kiswahili. Keep technical/educational terms in English (e.g., lesson plan, exit ticket, worksheet).',
      };
    case 'sd':
      return {
        gammaLang: 'ur', // Gamma falls back; we coerce via prompt instructions below.
        extraInstructions: ' Write the lesson plan body in Sindhi (سنڌي), using Sindhi-Arabic Naskh script. Keep technical/educational terms in English (e.g., fraction, lesson plan). Where useful, gloss new terms in English first then Sindhi in parentheses.',
      };
    case 'en':
    default:
      return {
        gammaLang: 'en',
        extraInstructions: '',
      };
  }
}

/**
 * Generate a Gamma document.
 * @param {object} args
 * @param {string} args.prompt   The full prompt (typically built via LessonPlanPromptsService.buildChapterPrompt)
 * @param {string} args.title    Header text for top-right of every page
 * @param {string} args.language One of SUPPORTED_LANGUAGES
 * @returns {Promise<{success: boolean, gammaUrl?: string, pdfUrl?: string, error?: string, generationId?: string}>}
 */
async function generate({ prompt, title, language = 'en' }) {
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : 'en';
  const { gammaLang, extraInstructions } = buildLanguageOverrides(lang);

  // Header/footer assets are optional. LOGO_URL and WEBSITE_URL each control a
  // single visual element; if either is unset, that element is simply omitted
  // and Gamma renders a clean page without a placeholder logo or fake URL.
  const branding = require('../../config/branding');
  const logo = branding.logoUrl();
  const website = branding.websiteUrl();

  const headerFooter = {
    topRight: { type: 'text', value: title },
    bottomCenter: { type: 'cardNumber' },
  };
  if (logo) {
    headerFooter.topLeft = { type: 'image', source: 'custom', src: logo, size: 'sm' };
  }
  if (website) {
    const host = website.replace(/^https?:\/\//, '');
    headerFooter.bottomRight = { type: 'text', value: `generate your lesson plan at ${host}` };
  }

  const requestBody = {
    inputText: prompt,
    format: 'document',
    exportAs: 'pdf',
    themeId: 'cornflower',
    textMode: 'generate',
    // Cap card count to match the main LP path. Without this, Gamma auto-picks
    // 10-15 cards from our verbose prompt and generations land in 5-10 min
    // instead of the 2-3 min Gamma's own docs promise.
    numCards: 7,
    cardSplit: 'inputTextBreaks',
    additionalInstructions: BASE_INSTRUCTIONS + extraInstructions,
    cardOptions: {
      headerFooter,
    },
    textOptions: {
      language: gammaLang,
      audience: 'teachers in diverse, resource-limited classrooms who may not be subject matter experts',
      tone: 'supportive, practical, step-by-step, and encouraging — like a mentor guiding a new teacher',
      amount: 'detailed',
    },
    imageOptions: {
      source: 'webAllImages',
      style: 'educational, classroom, science diagrams, clean',
    },
  };

  try {
    const axiosInstance = axios.default || axios;
    const createResponse = await axiosInstance.post(
      'https://public-api.gamma.app/v1.0/generations',
      requestBody,
      { headers: { 'X-API-KEY': GAMMA_API_KEY, 'Content-Type': 'application/json' } }
    );

    const generationId = createResponse.data.generationId;
    logToFile('Pic-LP Gamma generation started', { generationId, title, language: lang });

    let attempts = 0;
    while (attempts < GAMMA_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, GAMMA_POLL_INTERVAL));

      const statusResponse = await axiosInstance.get(
        `https://public-api.gamma.app/v1.0/generations/${generationId}`,
        { headers: { 'X-API-KEY': GAMMA_API_KEY } }
      );

      if (statusResponse.data.status === 'completed') {
        const pdfUrl = statusResponse.data.pdfUrl || statusResponse.data.exportUrl || statusResponse.data.fileUrl;
        logToFile('Pic-LP Gamma generation completed', {
          generationId,
          title,
          creditsDeducted: statusResponse.data.credits?.deducted,
          creditsRemaining: statusResponse.data.credits?.remaining,
        });
        return {
          success: true,
          generationId,
          gammaUrl: statusResponse.data.gammaUrl,
          pdfUrl,
        };
      }

      if (statusResponse.data.status === 'failed') {
        return {
          success: false,
          generationId,
          error: statusResponse.data.error || 'Gamma generation failed',
        };
      }

      attempts++;
    }

    return { success: false, generationId, error: 'Timed out waiting for Gamma' };
  } catch (error) {
    logToFile('❌ Pic-LP Gamma client failed', { error: error.message, language: lang });
    return { success: false, error: error.message };
  }
}

module.exports = { generate, SUPPORTED_LANGUAGES };
