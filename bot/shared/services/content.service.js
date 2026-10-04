const axios = require('axios');
const { GAMMA_API_KEY, GAMMA_MAX_ATTEMPTS, GAMMA_POLL_INTERVAL } = require('../utils/constants');
const { logToFile } = require('../utils/logger');
const { redactUrl } = require('../utils/redact-url');
const { getLanguageConfig } = require('../config/gamma-languages.config');
const { buildLessonPlanPrompt } = require('./lesson-plan-template.service');

/**
 * Content Service
 * Handles content generation using Gamma AI (lesson plans and presentations)
 */
class ContentService {
  /**
   * Generate content using Gamma API (presentations and lesson plans)
   * Added language parameter for RTL support
   * @param {string} topic - Content topic
   * @param {string} fullUserMessage - Full user message for context
   * @param {string} format - 'presentation' or 'document'
   * @param {string} contentType - 'lesson plan' or 'presentation'
   * @param {string} language - Language code ('en', 'ur', 'ar', 'es') - defaults to 'en'
   * @returns {Promise<Object>} {gammaUrl: string, pdfUrl: string}
   * @private
   */
  static async _generateGammaContent(topic, fullUserMessage, format, contentType, language = 'en') {
    try {
      // Get language configuration for RTL support
      const langConfig = getLanguageConfig(language);
      logToFile(`Generating ${contentType} with Gamma API`, { topic, format, language: langConfig.code });

      // The lesson-plan framework (9-section / 5E structure), the numCards
      // hint, and the reinforcement instruction all come from ONE source:
      // lesson-plan-template.service.js. (Reserved grade/subject pass-through
      // for future per-grade framework tuning; inert today.)
      const lpTemplate = buildLessonPlanPrompt({ language: langConfig.code });

      // Use the full user message to preserve all details
      // Use language-specific intro and prompt suffix
      const inputText = format === 'presentation'
        ? `${langConfig.presentationIntro} based on this request: "${fullUserMessage}"

${langConfig.promptSuffix}

Make it visually appealing and suitable for teachers to use in Pakistani classrooms. Include:
- An introduction slide
- Multiple content slides covering all requested aspects
- A conclusion/summary slide`
        : `${langConfig.lessonPlanIntro} based on this request: "${fullUserMessage}"

${langConfig.promptSuffix}

${lpTemplate.inputText}`;

      // Step 1: Create generation
      const requestBody = {
        inputText,
        format,
        textMode: format === 'presentation' ? 'generate' : 'preserve', // Preserve structure for lesson plans
        numCards: format === 'presentation' ? 5 : lpTemplate.numCards, // Gamma card-layout hint (see lesson-plan-template.service.js)
        exportAs: 'pdf',
        additionalInstructions: format === 'presentation'
          ? undefined
          : lpTemplate.additionalInstructions,
        textOptions: {
          language: langConfig.code, // Use detected language instead of hardcoded 'en'
          audience: format === 'presentation' ? 'teachers and students' : 'teachers',
          tone: 'educational and engaging',
          amount: format === 'presentation' ? undefined : 'extensive' // Keep all details for lesson plans
        },
        imageOptions: {
          source: 'webAllImages',
          style: 'photorealistic, professional, educational'
        }
      };

      // MIGRATED: v0.2 → v1.0 on Jan 25, 2026 (v0.2 sunsets Jan 16, 2026)
      const createResponse = await axios.post(
        'https://public-api.gamma.app/v1.0/generations',
        requestBody,
        {
          headers: {
            'X-API-KEY': GAMMA_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const generationId = createResponse.data.generationId;
      logToFile('Gamma generation started (API v1.0)', { generationId, contentType });

      // Step 2: Poll for completion (v1.0 recommends 5 second intervals)
      let attempts = 0;

      while (attempts < GAMMA_MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, GAMMA_POLL_INTERVAL));

        const statusResponse = await axios.get(
          `https://public-api.gamma.app/v1.0/generations/${generationId}`,
          {
            headers: {
              'X-API-KEY': GAMMA_API_KEY,
            },
          }
        );

        const status = statusResponse.data.status;
        logToFile(`Gamma ${contentType} status: ${status}`, { attempt: attempts + 1 });

        if (status === 'completed') {
          const gammaUrl = statusResponse.data.gammaUrl;
          const pdfUrl = statusResponse.data.pdfUrl || statusResponse.data.exportUrl || statusResponse.data.fileUrl;

          // The body carries the document link and the export URL, both of
          // which open the file for anyone holding them — log the field names
          // and redacted URLs, never the body itself.
          logToFile(`${contentType} generated successfully`, {
            generationId,
            status,
            gammaUrl: redactUrl(gammaUrl),
            pdfUrl: redactUrl(pdfUrl),
            allFields: Object.keys(statusResponse.data)
          });

          return { gammaUrl, pdfUrl };
        } else if (status === 'failed') {
          throw new Error(`Gamma ${contentType} generation failed`);
        }

        attempts++;
      }

      throw new Error(`${contentType} generation timeout`);
    } catch (error) {
      logToFile(`Error generating ${contentType} with Gamma`, {
        error: error.message,
        errorDetails: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Generate a lesson plan using Gamma API
   * Added language parameter for RTL support
   * @param {string} topic - Lesson topic
   * @param {string} fullUserMessage - Full user message for context
   * @param {string} language - Language code ('en', 'ur', 'ar', 'es') - defaults to 'en'
   * @returns {Promise<Object>} {gammaUrl: string, pdfUrl: string}
   */
  static async generateLessonPlan(topic, fullUserMessage, language = 'en') {
    try {
      logToFile('Generating lesson plan with Gamma API', { topic, language });
      return await this._generateGammaContent(topic, fullUserMessage, 'document', 'lesson plan', language);
    } catch (error) {
      logToFile('Error generating lesson plan', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate a presentation using Gamma API
   * Added language parameter for RTL support
   * @param {string} topic - Presentation topic
   * @param {string} fullUserMessage - Full user message for context
   * @param {string} language - Language code ('en', 'ur', 'ar', 'es') - defaults to 'en'
   * @returns {Promise<Object>} {gammaUrl: string, pdfUrl: string}
   */
  static async generatePresentation(topic, fullUserMessage, language = 'en') {
    try {
      logToFile('Generating presentation with Gamma API', { topic, language });
      return await this._generateGammaContent(topic, fullUserMessage, 'presentation', 'presentation', language);
    } catch (error) {
      logToFile('Error generating presentation', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Download PDF from URL
   * @param {string} url - PDF URL
   * @param {string} filename - Filename for downloaded PDF
   * @param {string} tempDir - Temporary directory
   * @returns {Promise<string>} Path to downloaded PDF
   */
  static async downloadPDF(url, filename, tempDir) {
    const path = require('path');
    const fs = require('fs');

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer'
      });

      const pdfPath = path.join(tempDir, filename);
      fs.writeFileSync(pdfPath, response.data);

      logToFile('PDF downloaded successfully', { pdfPath });
      return pdfPath;
    } catch (error) {
      logToFile('Error downloading PDF', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = ContentService;
