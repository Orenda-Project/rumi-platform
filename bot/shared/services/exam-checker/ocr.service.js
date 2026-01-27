/**
 * OCR Service for Exam Checker
 * Extracts text from exam images using Mistral (primary) → Chandra (fallback)
 * Enhanced with Surya bounding boxes for annotation positioning (bd-173)
 *
 * Created: 2026-01-24
 * Updated: 2026-01-25 (Surya integration)
 * Beads: bd-083 (OCR), bd-173 (Surya integration)
 */

const axios = require('axios');
const { logToFile } = require('../../utils/logger');
const SuryaService = require('./surya.service');

// Provider configuration
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const CHANDRA_API_URL = process.env.CHANDRA_API_URL || 'https://api.chandra.datalab.to/v1/ocr';

// OCR prompt for exam papers
const OCR_SYSTEM_PROMPT = `You are an expert OCR system specialized in reading handwritten exam papers.

Extract ALL text from this exam paper image, including:
1. Student name (usually at top)
2. Roll number / ID
3. Question numbers and text
4. Student's handwritten answers
5. Any printed instructions

Format your response as JSON:
{
  "studentName": "name if visible",
  "rollNumber": "number if visible",
  "questions": [
    {
      "number": "1",
      "questionText": "printed question if visible",
      "studentAnswer": "handwritten answer",
      "confidence": 0.0-1.0
    }
  ],
  "rawText": "all text in reading order",
  "metadata": {
    "isHandwritten": true/false,
    "language": "detected language",
    "pageType": "exam/answer_sheet/both"
  }
}

Be thorough - teachers need accurate transcription for grading.`;

class OCRService {
  /**
   * Extract text from a batch of images
   * @param {Array} images - Array of image objects with url property
   * @returns {object} Batch OCR results
   */
  static async extractBatch(images) {
    if (!images || images.length === 0) {
      throw new Error('No images provided for OCR');
    }

    logToFile('🔍 Starting batch OCR', { imageCount: images.length });

    const results = [];
    let provider = 'mistral';
    let totalConfidence = 0;
    let successCount = 0;

    for (const image of images) {
      try {
        const result = await this.extractSingle(image.url);
        results.push({
          pageNumber: image.pageNumber || results.length + 1,
          ...result,
          success: true
        });
        totalConfidence += result.confidence || 0.8;
        successCount++;
        provider = result.provider;
      } catch (error) {
        logToFile('⚠️ OCR failed for image', {
          pageNumber: image.pageNumber,
          error: error.message
        });
        results.push({
          pageNumber: image.pageNumber || results.length + 1,
          success: false,
          error: error.message
        });
      }
    }

    return {
      pages: results,
      provider,
      averageConfidence: successCount > 0 ? totalConfidence / successCount : 0,
      successRate: successCount / images.length,
      totalPages: images.length,
      successfulPages: successCount
    };
  }

  /**
   * Extract text from a single image
   * Enhanced with Surya bounding boxes for annotation positioning (bd-173)
   * @param {string} imageUrl - URL of the image
   * @param {boolean} includeBoundingBoxes - Whether to fetch Surya bounding boxes
   * @returns {object} OCR result with optional bounding boxes
   */
  static async extractSingle(imageUrl, includeBoundingBoxes = true) {
    let ocrResult;

    // Try Mistral first
    try {
      ocrResult = await this._extractWithMistral(imageUrl);
      ocrResult.provider = 'mistral';
    } catch (mistralError) {
      logToFile('⚠️ Mistral OCR failed, trying Chandra', { error: mistralError.message });

      // Fallback to Chandra
      try {
        ocrResult = await this._extractWithChandra(imageUrl);
        ocrResult.provider = 'chandra';
      } catch (chandraError) {
        logToFile('❌ Both OCR providers failed', {
          mistral: mistralError.message,
          chandra: chandraError.message
        });
        throw new Error('OCR failed with all providers');
      }
    }

    // Enhance with Surya bounding boxes for annotation positioning
    if (includeBoundingBoxes) {
      try {
        ocrResult = await SuryaService.enhanceWithBoundingBoxes(imageUrl, ocrResult);
        logToFile('✅ Enhanced OCR with Surya bounding boxes', {
          questionCount: ocrResult.questions?.length || 0,
          boxCount: ocrResult.boundingBoxes?.length || 0
        });
      } catch (suryaError) {
        logToFile('⚠️ Surya enhancement failed, continuing without bounding boxes', {
          error: suryaError.message
        });
        // Continue without bounding boxes - annotation will use fallback positioning
      }
    }

    return ocrResult;
  }

  /**
   * Extract text using Mistral Vision API
   * @param {string} imageUrl - URL of the image
   * @returns {object} Parsed OCR result
   */
  static async _extractWithMistral(imageUrl) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }

    logToFile('🔍 Calling Mistral OCR', { imageUrl: imageUrl.substring(0, 50) + '...' });

    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model: 'pixtral-large-latest',
        messages: [
          {
            role: 'system',
            content: OCR_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              },
              {
                type: 'text',
                text: 'Extract all text from this exam paper. Return JSON format.'
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Mistral');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        studentName: parsed.studentName,
        rollNumber: parsed.rollNumber,
        questions: parsed.questions || [],
        rawText: parsed.rawText || content,
        metadata: parsed.metadata || {},
        confidence: this._calculateConfidence(parsed)
      };
    } catch (parseError) {
      // Return raw text if JSON parsing fails
      return {
        rawText: content,
        questions: [],
        confidence: 0.5
      };
    }
  }

  /**
   * Extract text using Chandra/Datalab OCR API
   * @param {string} imageUrl - URL of the image
   * @returns {object} Parsed OCR result
   */
  static async _extractWithChandra(imageUrl) {
    const apiKey = process.env.CHANDRA_API_KEY;
    if (!apiKey) {
      throw new Error('CHANDRA_API_KEY not configured');
    }

    logToFile('🔍 Calling Chandra OCR', { imageUrl: imageUrl.substring(0, 50) + '...' });

    const response = await axios.post(
      CHANDRA_API_URL,
      {
        image_url: imageUrl,
        output_format: 'json',
        detect_handwriting: true,
        languages: ['en', 'ur', 'ar']
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const data = response.data;

    // Parse Chandra response format
    return {
      rawText: data.text || data.raw_text || '',
      questions: this._parseQuestionsFromText(data.text || ''),
      metadata: {
        boundingBoxes: data.bounding_boxes,
        language: data.detected_language
      },
      confidence: data.confidence || 0.7
    };
  }

  /**
   * Parse questions from raw OCR text
   * @param {string} text - Raw OCR text
   * @returns {Array} Parsed questions
   */
  static _parseQuestionsFromText(text) {
    const questions = [];

    // Common question patterns
    const patterns = [
      /Q\.?\s*(\d+)[.:)]\s*(.*?)(?=Q\.?\s*\d+|$)/gis,
      /(\d+)[.)]\s*(.*?)(?=\d+[.)]|$)/gis,
      /Question\s*(\d+)[.:)]\s*(.*?)(?=Question\s*\d+|$)/gis
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        questions.push({
          number: match[1],
          questionText: match[2]?.trim().substring(0, 200),
          studentAnswer: '', // Will be filled by analysis
          confidence: 0.6
        });
      }
      if (questions.length > 0) break;
    }

    return questions;
  }

  /**
   * Calculate confidence score from parsed result
   * @param {object} parsed - Parsed OCR result
   * @returns {number} Confidence 0-1
   */
  static _calculateConfidence(parsed) {
    let score = 0.5; // Base score

    if (parsed.studentName) score += 0.1;
    if (parsed.rollNumber) score += 0.1;
    if (parsed.questions?.length > 0) score += 0.2;
    if (parsed.rawText?.length > 100) score += 0.1;

    // Average question confidence
    if (parsed.questions?.length > 0) {
      const avgQConf = parsed.questions.reduce((sum, q) => sum + (q.confidence || 0.5), 0) / parsed.questions.length;
      score = (score + avgQConf) / 2;
    }

    return Math.min(score, 1.0);
  }
}

module.exports = OCRService;
