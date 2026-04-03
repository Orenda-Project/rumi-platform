/**
 * Photo Analysis Service
 *
 * Analyzes classroom photos using the existing vision.service.js
 * (GPT-4.1-mini) with framework-specific prompts.
 *
 * Bead: bd-613 (Phase 1C-B)
 */

const { logToFile } = require('../../../utils/logger');

const FRAMEWORK_VISION_PROMPTS = {
  hots: `Analyze this classroom photo for evidence of Higher-Order Thinking Skills (HOTS):
- Look for thinking prompts, questioning displays, Bloom's taxonomy posters
- Check for student work samples showing analysis, evaluation, or creation
- Note any visible scaffolding tools, graphic organizers, or thinking routine charts
- Assess classroom setup for collaborative thinking (group seating, discussion areas)
Describe what you see in 2-3 sentences, focusing on HOTS-related evidence.`,

  fico: `Analyze this classroom photo for FICO observation evidence:
- Look for lesson plan materials, routine charts, or daily schedule displays
- Check for student engagement materials and learning aids
- Note classroom organization, transition readiness, and safety features
- Assess whether materials match curricular expectations
Describe what you see in 2-3 sentences, focusing on fidelity and classroom quality.`,

  oecd: `Analyze this classroom photo for OECD observation evidence:
- Look for formative assessment displays, learning objectives posted
- Check for student self-assessment tools, rubrics, or success criteria
- Note evidence of differentiated instruction or inclusive practices
- Assess classroom culture indicators (student work displays, learning environment)
Describe what you see in 2-3 sentences, focusing on assessment and engagement.`,

  teach: `Analyze this classroom photo for Teach observation evidence:
- Look for collaborative seating arrangements and group work areas
- Check for respectful environment indicators (rules, expectations posted)
- Note autonomy supports (choice boards, student roles, volunteering)
- Assess perseverance and social-emotional learning displays
Describe what you see in 2-3 sentences, focusing on culture and collaboration.`,
};

const GENERIC_PROMPT = `Analyze this classroom photo:
- Describe the classroom layout, student arrangement, and visible materials
- Note any learning displays, posted objectives, or student work
- Assess the overall classroom environment
Describe what you see in 2-3 sentences.`;

/**
 * Build a framework-specific vision prompt for classroom photo analysis.
 *
 * @param {string} frameworkKey - Framework key (oecd, hots, teach, fico)
 * @returns {string} Vision prompt
 */
function buildFrameworkVisionPrompt(frameworkKey) {
  return FRAMEWORK_VISION_PROMPTS[frameworkKey] || GENERIC_PROMPT;
}

/**
 * Process a classroom photo using the vision service.
 *
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} mimeType - Image MIME type
 * @param {string} frameworkKey - Framework key for targeted prompt
 * @returns {Promise<string|null>} Analysis text or null on failure
 */
async function processClassroomPhoto(imageBuffer, mimeType, frameworkKey) {
  try {
    const { analyzeWithRetry } = require('../../vision.service');
    const prompt = buildFrameworkVisionPrompt(frameworkKey);

    const result = await analyzeWithRetry(imageBuffer, mimeType, {
      prompt,
      detail: 'low',
    });

    if (result.success) {
      logToFile('Classroom photo analyzed', {
        framework: frameworkKey,
        analysisLength: result.analysis?.length,
        tokens: result.usage?.totalTokens,
      });
      return result.analysis;
    }

    logToFile('Classroom photo analysis failed', {
      framework: frameworkKey,
      error: result.error,
    });
    return null;
  } catch (error) {
    logToFile('Error processing classroom photo', { error: error.message });
    return null;
  }
}

module.exports = { buildFrameworkVisionPrompt, processClassroomPhoto };
