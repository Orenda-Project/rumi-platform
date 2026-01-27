/**
 * Surya Bounding Box Service for Exam Checker
 * Detects text line positions using Datalab's Surya API
 *
 * Created: 2026-01-25
 * Beads: bd-166 (position detection), bd-173 (OCR integration)
 *
 * API: https://api.datalab.to/v1/detection
 * Docs: https://github.com/datalab-to/surya
 *
 * Surya provides line-level bounding boxes that we fuzzy-match
 * to Mistral OCR text for accurate annotation positioning.
 */

const axios = require('axios');
const { logToFile } = require('../../utils/logger');

// Datalab Surya API configuration
const SURYA_API_URL = process.env.SURYA_API_URL || 'https://api.datalab.to/v1/detection';
const DATALAB_API_KEY = process.env.DATALAB_API_KEY || process.env.CHANDRA_API_KEY;

// Fuzzy matching threshold
const MATCH_THRESHOLD = 0.6;

class SuryaService {
  /**
   * Detect text bounding boxes in an image
   * @param {string} imageUrl - URL of the image
   * @returns {object} Detection result with boxes
   */
  static async detectBoxes(imageUrl) {
    if (!DATALAB_API_KEY) {
      logToFile('⚠️ Surya: No API key, using heuristic fallback');
      return this._heuristicFallback();
    }

    try {
      logToFile('🔍 Surya: Detecting text boxes', { imageUrl: imageUrl.substring(0, 50) + '...' });

      const response = await axios.post(
        SURYA_API_URL,
        {
          image_url: imageUrl,
          detect_type: 'text_line'
        },
        {
          headers: {
            'X-API-Key': DATALAB_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const data = response.data;

      // Normalize response format
      const boxes = this._normalizeBoxes(data.detections || data.boxes || data.lines || []);

      logToFile('✅ Surya: Detected boxes', {
        boxCount: boxes.length,
        imageWidth: data.image_width,
        imageHeight: data.image_height
      });

      return {
        boxes,
        imageWidth: data.image_width || 1,
        imageHeight: data.image_height || 1,
        provider: 'surya'
      };

    } catch (error) {
      logToFile('⚠️ Surya API failed, using heuristic fallback', { error: error.message });
      return this._heuristicFallback();
    }
  }

  /**
   * Normalize bounding box format from various API responses
   * @param {Array} rawBoxes - Raw boxes from API
   * @returns {Array} Normalized boxes
   */
  static _normalizeBoxes(rawBoxes) {
    return rawBoxes.map((box, idx) => {
      // Handle different formats: [x1,y1,x2,y2], {bbox:[...]}, {x,y,w,h}
      let bbox;
      if (Array.isArray(box)) {
        bbox = box;
      } else if (box.bbox) {
        bbox = box.bbox;
      } else if (box.x !== undefined && box.y !== undefined) {
        // Convert x,y,w,h to x1,y1,x2,y2
        bbox = [box.x, box.y, box.x + (box.width || box.w), box.y + (box.height || box.h)];
      } else {
        return null;
      }

      // Extract polygon if available
      const polygon = box.polygon || box.vertices || [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[3]]
      ];

      return {
        id: box.id || `box_${idx}`,
        bbox, // [x1, y1, x2, y2] in pixels
        polygon,
        text: box.text || box.content || '',
        confidence: box.confidence || box.score || 0.8,
        lineNumber: idx + 1
      };
    }).filter(Boolean);
  }

  /**
   * Heuristic fallback when Surya API is unavailable
   * Creates estimated box positions based on typical exam layout
   * @returns {object} Estimated detection result
   */
  static _heuristicFallback() {
    logToFile('📐 Using heuristic bounding boxes');

    // Generate placeholder boxes for ~10 question regions
    const boxes = [];
    for (let i = 0; i < 10; i++) {
      boxes.push({
        id: `heuristic_${i}`,
        bbox: [50, 200 + i * 150, 800, 280 + i * 150], // Estimated positions
        polygon: [],
        text: '',
        confidence: 0.3, // Low confidence to indicate heuristic
        lineNumber: i + 1
      });
    }

    return {
      boxes,
      imageWidth: 850,
      imageHeight: 1100,
      provider: 'heuristic'
    };
  }

  /**
   * Match OCR text to a bounding box using fuzzy matching
   * @param {string} text - Text to match
   * @param {Array} boxes - Bounding boxes with text
   * @returns {object|null} Best matching box or null
   */
  static matchTextToBox(text, boxes) {
    if (!text || !boxes || boxes.length === 0) return null;

    const normalizedText = this._normalizeText(text);
    let bestMatch = null;
    let bestScore = 0;

    for (const box of boxes) {
      if (!box.text) continue;

      const normalizedBoxText = this._normalizeText(box.text);
      const similarity = this._calculateSimilarity(normalizedText, normalizedBoxText);

      if (similarity > bestScore && similarity >= MATCH_THRESHOLD) {
        bestScore = similarity;
        bestMatch = {
          ...box,
          similarity
        };
      }
    }

    return bestMatch;
  }

  /**
   * Match a question to its answer region
   * @param {string} questionText - Question text
   * @param {string} answerText - Student's answer text
   * @param {Array} boxes - All bounding boxes
   * @returns {object} Position info with normalized coordinates
   */
  static matchQuestionToPosition(questionText, answerText, boxes, imageWidth = 1, imageHeight = 1) {
    // First try to find the question text
    const questionBox = this.matchTextToBox(questionText, boxes);

    // Then try to find the answer text
    const answerBox = this.matchTextToBox(answerText, boxes);

    // Prefer answer position (where we'll place the mark)
    const targetBox = answerBox || questionBox;

    if (targetBox) {
      // Return normalized coordinates (0-1) for annotation positioning
      return {
        x: targetBox.bbox[2] / imageWidth, // Right edge of text
        y: (targetBox.bbox[1] + targetBox.bbox[3]) / 2 / imageHeight, // Vertical center
        width: (targetBox.bbox[2] - targetBox.bbox[0]) / imageWidth,
        height: (targetBox.bbox[3] - targetBox.bbox[1]) / imageHeight,
        confidence: targetBox.confidence * (targetBox.similarity || 0.8),
        source: answerBox ? 'answer' : 'question'
      };
    }

    // No match found - return null (caller should use fallback positioning)
    return null;
  }

  /**
   * Cluster boxes into question regions
   * Groups nearby boxes that likely belong to the same question
   * @param {Array} boxes - All bounding boxes
   * @returns {object} Clusters keyed by question ID
   */
  static clusterByQuestion(boxes) {
    if (!boxes || boxes.length === 0) return {};

    const clusters = {};
    let currentCluster = [];
    let lastY = 0;
    const gapThreshold = 80; // Pixels between questions
    let questionNum = 1;

    // Sort boxes by vertical position
    const sortedBoxes = [...boxes].sort((a, b) => a.bbox[1] - b.bbox[1]);

    for (const box of sortedBoxes) {
      const y = box.bbox[1];

      // Check if this starts a new question (large vertical gap)
      if (currentCluster.length > 0 && y - lastY > gapThreshold) {
        // Save current cluster
        clusters[`Q${questionNum}`] = {
          boxes: currentCluster,
          boundingRegion: this._calculateBoundingRegion(currentCluster)
        };
        currentCluster = [];
        questionNum++;
      }

      currentCluster.push(box);
      lastY = box.bbox[3]; // Bottom of current box
    }

    // Don't forget the last cluster
    if (currentCluster.length > 0) {
      clusters[`Q${questionNum}`] = {
        boxes: currentCluster,
        boundingRegion: this._calculateBoundingRegion(currentCluster)
      };
    }

    logToFile('📊 Surya: Clustered boxes into questions', {
      questionCount: Object.keys(clusters).length,
      totalBoxes: boxes.length
    });

    return clusters;
  }

  /**
   * Calculate bounding region for a cluster of boxes
   * @param {Array} boxes - Boxes in the cluster
   * @returns {object} Bounding region {x1, y1, x2, y2}
   */
  static _calculateBoundingRegion(boxes) {
    if (boxes.length === 0) {
      return { x1: 0, y1: 0, x2: 0, y2: 0 };
    }

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

    for (const box of boxes) {
      x1 = Math.min(x1, box.bbox[0]);
      y1 = Math.min(y1, box.bbox[1]);
      x2 = Math.max(x2, box.bbox[2]);
      y2 = Math.max(y2, box.bbox[3]);
    }

    return { x1, y1, x2, y2 };
  }

  /**
   * Normalize text for comparison
   * @param {string} text - Input text
   * @returns {string} Normalized text
   */
  static _normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Calculate similarity between two strings (Dice coefficient)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Similarity score 0-1
   */
  static _calculateSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;

    // Use character bigrams for Dice coefficient
    const bigramsA = this._getBigrams(a);
    const bigramsB = this._getBigrams(b);

    const intersection = new Set([...bigramsA].filter(x => bigramsB.has(x)));

    return (2 * intersection.size) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Get character bigrams from a string
   * @param {string} str - Input string
   * @returns {Set} Set of bigrams
   */
  static _getBigrams(str) {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Enhance OCR results with bounding box positions
   * This integrates Surya with the existing OCR pipeline
   * @param {string} imageUrl - Image URL
   * @param {object} ocrResult - OCR result from Mistral/Chandra
   * @returns {object} Enhanced OCR result with bounding boxes
   */
  static async enhanceWithBoundingBoxes(imageUrl, ocrResult) {
    try {
      const detection = await this.detectBoxes(imageUrl);

      if (!ocrResult.questions || ocrResult.questions.length === 0) {
        return {
          ...ocrResult,
          boundingBoxes: detection.boxes,
          boundingBoxProvider: detection.provider
        };
      }

      // Match each question to a bounding box
      const enhancedQuestions = ocrResult.questions.map(q => {
        const position = this.matchQuestionToPosition(
          q.questionText || '',
          q.studentAnswer || '',
          detection.boxes,
          detection.imageWidth,
          detection.imageHeight
        );

        return {
          ...q,
          bbox: position // Normalized coordinates for annotation
        };
      });

      return {
        ...ocrResult,
        questions: enhancedQuestions,
        boundingBoxes: detection.boxes,
        boundingBoxProvider: detection.provider,
        imageWidth: detection.imageWidth,
        imageHeight: detection.imageHeight
      };

    } catch (error) {
      logToFile('⚠️ Surya enhancement failed', { error: error.message });
      // Return original OCR result without bounding boxes
      return ocrResult;
    }
  }
}

module.exports = SuryaService;
