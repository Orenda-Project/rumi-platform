const axios = require('axios');
const { GAMMA_API_KEY, GAMMA_MAX_ATTEMPTS, GAMMA_POLL_INTERVAL } = require('../utils/constants');
const { logToFile } = require('../utils/logger');
const { getLanguageConfig } = require('../config/gamma-languages.config');

/**
 * Content Service
 * Handles content generation using Gamma AI (lesson plans and presentations)
 */
class ContentService {
  /**
   * Generate content using Gamma API (presentations and lesson plans)
   * Bug #10: Added language parameter for RTL support
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
      // Bug #10: Get language configuration for RTL support
      const langConfig = getLanguageConfig(language);
      logToFile(`Generating ${contentType} with Gamma API`, { topic, format, language: langConfig.code });

      // Use the full user message to preserve all details
      // Bug #10: Use language-specific intro and prompt suffix
      const inputText = format === 'presentation'
        ? `${langConfig.presentationIntro} based on this request: "${fullUserMessage}"

${langConfig.promptSuffix}

Make it visually appealing and suitable for teachers to use in Pakistani classrooms. Include:
- An introduction slide
- Multiple content slides covering all requested aspects
- A conclusion/summary slide`
        : `${langConfig.lessonPlanIntro} based on this request: "${fullUserMessage}"

${langConfig.promptSuffix}

This lesson plan should follow evidence-based pedagogical frameworks and be suitable for teachers in Pakistani classrooms (mixed-ability, limited resources). Structure the plan with these sections:

## 1. LEARNING OBJECTIVES & SUCCESS CRITERIA
- 2-3 clear, measurable learning objectives aligned with curriculum standards
- Student-friendly success criteria ("I can..." statements)
- Connection to prior knowledge and real-world applications

## 2. LESSON OVERVIEW
- Grade level and subject
- Duration (typically 40-60 minutes)
- Key concepts and vocabulary
- Prerequisites

## 3. MATERIALS & PREPARATION
- Required materials (emphasize low-cost, locally available resources)
- Teacher preparation steps
- Student handouts or worksheets needed
- Technology/digital resources (if applicable)

## 4. INTRODUCTION (ENGAGE) [8-10 minutes]
- Hook/attention-grabber to activate prior knowledge
- Essential question for the lesson
- Learning objectives shared with students
- Connection to students' lives and experiences

## 5. EXPLORATION/INVESTIGATION [15-20 minutes]
- Hands-on activity or investigation for students to explore the concept
- Guiding questions for teachers to ask
- What students should observe/discover
- Group work or pair work structures
- Common misconceptions to address

## 6. EXPLANATION/DIRECT INSTRUCTION [10-15 minutes]
- Clear, step-by-step explanation of key concepts
- Visual aids, diagrams, or models to use
- Examples and non-examples
- Vocabulary definitions with context
- Teacher modeling and think-aloud strategies

## 7. ELABORATION/GUIDED PRACTICE [10-15 minutes]
- Structured practice activities progressing from simple to complex
- Scaffolding strategies for struggling learners
- Extension challenges for advanced students
- Real-world application tasks
- Collaborative learning opportunities

## 8. EVALUATION/FORMATIVE ASSESSMENT [5-10 minutes]
- Formative assessment strategy (exit ticket, quick quiz, demonstration, etc.)
- Questions to check for understanding throughout the lesson
- Success criteria checklist
- Homework assignment (if applicable)
- Preview of next lesson

## 9. DIFFERENTIATION STRATEGIES
- Support for struggling learners (scaffolds, sentence frames, visual aids)
- Extensions for advanced students (depth, complexity, independent research)
- Language support for multilingual learners
- Modifications for students with special needs
- Alternative assessment options

Throughout the lesson plan, include:
- Specific dialogue examples for teachers
- Transition phrases between activities
- Time allocations for each section
- Questioning strategies (open-ended, probing, wait time)
- Classroom management tips for large/mixed-ability classes
- Formative assessment checkpoints

Make this practical, detailed, and immediately usable by teachers with varying experience levels.`;

      // Step 1: Create generation
      const requestBody = {
        inputText,
        format,
        textMode: format === 'presentation' ? 'generate' : 'preserve', // Preserve structure for lesson plans
        numCards: format === 'presentation' ? 5 : 7, // 7 cards for comprehensive lesson plan structure
        exportAs: 'pdf',
        additionalInstructions: format === 'presentation'
          ? undefined
          : 'Maintain the exact structure and formatting provided in the prompt. Include all 9 sections with clear headings. Preserve all bullet points, time allocations, and instructional details. Do not summarize or condense the content.',
        textOptions: {
          language: langConfig.code,  // Bug #10: Use detected language instead of hardcoded 'en'
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
          // Log full response to see all available fields
          logToFile('Gamma generation completed - full response:', statusResponse.data);

          const gammaUrl = statusResponse.data.gammaUrl;
          const pdfUrl = statusResponse.data.pdfUrl || statusResponse.data.exportUrl || statusResponse.data.fileUrl;

          logToFile(`${contentType} generated successfully`, {
            gammaUrl,
            pdfUrl,
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
   * Bug #10: Added language parameter for RTL support
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
   * Bug #10: Added language parameter for RTL support
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
