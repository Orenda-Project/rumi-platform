/**
 * Grading Scale Service for Exam Checker
 * Board-specific grade conversion (FBISE, Cambridge, Punjab Matric)
 *
 * Created: 2026-01-25
 * Bead: bd-177
 *
 * Supports:
 * - FBISE (Federal Board of Intermediate and Secondary Education)
 * - Cambridge IGCSE
 * - Punjab Matric (SSC)
 * - Custom scales
 */

const { logToFile } = require('../../utils/logger');

class GradingScaleService {
  // FBISE (Federal Board) Scale - Pakistan
  static fbiseScale = [
    { min: 90, grade: 'A+', gpa: 4.0, description: 'Outstanding' },
    { min: 80, grade: 'A', gpa: 4.0, description: 'Excellent' },
    { min: 70, grade: 'B', gpa: 3.0, description: 'Very Good' },
    { min: 60, grade: 'C', gpa: 2.0, description: 'Good' },
    { min: 50, grade: 'D', gpa: 1.0, description: 'Satisfactory' },
    { min: 40, grade: 'E', gpa: 0.0, description: 'Pass' },
    { min: 0, grade: 'F', gpa: 0.0, description: 'Fail' }
  ];

  // Cambridge IGCSE Scale
  static cambridgeScale = [
    { min: 90, grade: 'A*', description: 'Exceptional' },
    { min: 80, grade: 'A', description: 'Excellent' },
    { min: 70, grade: 'B', description: 'Very Good' },
    { min: 60, grade: 'C', description: 'Good' },
    { min: 50, grade: 'D', description: 'Satisfactory' },
    { min: 40, grade: 'E', description: 'Pass' },
    { min: 30, grade: 'F', description: 'Below Pass' },
    { min: 20, grade: 'G', description: 'Low' },
    { min: 0, grade: 'U', description: 'Ungraded' }
  ];

  // Punjab Matric (SSC) Scale
  static matricScale = [
    { min: 80, grade: 'A-1', division: 'First', description: 'Distinction' },
    { min: 70, grade: 'A', division: 'First', description: 'First Class' },
    { min: 60, grade: 'B', division: 'First', description: 'First Division' },
    { min: 50, grade: 'C', division: 'Second', description: 'Second Division' },
    { min: 40, grade: 'D', division: 'Second', description: 'Second Division' },
    { min: 33, grade: 'E', division: 'Third', description: 'Third Division' },
    { min: 0, grade: 'Fail', division: 'Fail', description: 'Failed' }
  ];

  // Generic percentage-based scale (default)
  static genericScale = [
    { min: 90, grade: 'A+', description: 'Outstanding' },
    { min: 80, grade: 'A', description: 'Excellent' },
    { min: 70, grade: 'B', description: 'Very Good' },
    { min: 60, grade: 'C', description: 'Good' },
    { min: 50, grade: 'D', description: 'Pass' },
    { min: 0, grade: 'F', description: 'Fail' }
  ];

  /**
   * Get scale for a given board
   * @param {string} board - Board name
   * @returns {Array} Scale array
   */
  static getScale(board) {
    const normalizedBoard = (board || '').toLowerCase().replace(/[^a-z]/g, '');

    const scales = {
      'fbise': this.fbiseScale,
      'federal': this.fbiseScale,
      'cambridge': this.cambridgeScale,
      'igcse': this.cambridgeScale,
      'cie': this.cambridgeScale,
      'matric': this.matricScale,
      'punjab': this.matricScale,
      'ssc': this.matricScale,
      'punjabmatric': this.matricScale
    };

    return scales[normalizedBoard] || this.genericScale;
  }

  /**
   * Convert percentage to grade for specified board
   * @param {number} percentage - Score percentage (0-100)
   * @param {string} board - Board name (FBISE, Cambridge, Punjab_Matric, etc.)
   * @returns {string} Grade letter
   */
  static convert(percentage, board) {
    const scale = this.getScale(board);

    for (const entry of scale) {
      if (percentage >= entry.min) {
        return entry.grade;
      }
    }

    return scale[scale.length - 1].grade;
  }

  /**
   * Shorthand for FBISE conversion
   * @param {number} percentage
   * @returns {string}
   */
  static toFBISE(percentage) {
    return this.convert(percentage, 'FBISE');
  }

  /**
   * Shorthand for Cambridge conversion
   * @param {number} percentage
   * @returns {string}
   */
  static toCambridge(percentage) {
    return this.convert(percentage, 'Cambridge');
  }

  /**
   * Shorthand for Punjab Matric conversion
   * @param {number} percentage
   * @returns {string}
   */
  static toMatric(percentage) {
    return this.convert(percentage, 'Punjab_Matric');
  }

  /**
   * Get full grade report with all details
   * @param {number} percentage - Score percentage
   * @param {string} board - Board name
   * @returns {object} Full grade report
   */
  static getFullReport(percentage, board) {
    const scale = this.getScale(board);
    const normalizedBoard = board || 'Generic';

    for (const entry of scale) {
      if (percentage >= entry.min) {
        return {
          percentage: Math.round(percentage),
          grade: entry.grade,
          gpa: entry.gpa,
          division: entry.division,
          description: entry.description,
          scale: normalizedBoard,
          passed: entry.grade !== 'F' && entry.grade !== 'Fail' && entry.grade !== 'U'
        };
      }
    }

    // Default to last entry (fail)
    const lastEntry = scale[scale.length - 1];
    return {
      percentage: Math.round(percentage),
      grade: lastEntry.grade,
      gpa: lastEntry.gpa || 0,
      division: lastEntry.division || 'Fail',
      description: lastEntry.description,
      scale: normalizedBoard,
      passed: false
    };
  }

  /**
   * Get descriptive text for a grade
   * @param {string} grade - Grade letter
   * @param {string} board - Board name
   * @returns {string} Description
   */
  static getGradeDescription(grade, board) {
    const scale = this.getScale(board);
    const entry = scale.find(e => e.grade === grade);
    return entry?.description || 'Unknown';
  }

  /**
   * Check if a percentage is a passing score
   * @param {number} percentage
   * @param {string} board
   * @returns {boolean}
   */
  static isPassing(percentage, board) {
    const report = this.getFullReport(percentage, board);
    return report.passed;
  }

  /**
   * Get grade emoji for visual representation
   * @param {string} grade
   * @returns {string}
   */
  static getGradeEmoji(grade) {
    const emojiMap = {
      'A+': '🌟',
      'A*': '🌟',
      'A': '⭐',
      'A-1': '🌟',
      'B': '👍',
      'C': '✅',
      'D': '📝',
      'E': '📚',
      'F': '💪',
      'G': '📖',
      'U': '📖',
      'Fail': '💪'
    };

    return emojiMap[grade] || '📋';
  }

  /**
   * Format grade for display with emoji and description
   * @param {number} percentage
   * @param {string} board
   * @returns {string} Formatted string
   */
  static formatGrade(percentage, board) {
    const report = this.getFullReport(percentage, board);
    const emoji = this.getGradeEmoji(report.grade);

    let result = `${emoji} Grade: ${report.grade} (${report.percentage}%)`;

    if (report.division) {
      result += ` - ${report.division}`;
    }

    if (report.gpa !== undefined) {
      result += ` | GPA: ${report.gpa}`;
    }

    return result;
  }

  /**
   * Get all available boards
   * @returns {Array} List of board options
   */
  static getAvailableBoards() {
    return [
      { id: 'FBISE', name: 'Federal Board (FBISE)', region: 'Pakistan' },
      { id: 'Cambridge', name: 'Cambridge IGCSE', region: 'International' },
      { id: 'Punjab_Matric', name: 'Punjab Matric (SSC)', region: 'Punjab, Pakistan' },
      { id: 'Generic', name: 'Generic Scale', region: 'Universal' }
    ];
  }
}

module.exports = GradingScaleService;
