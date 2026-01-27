/**
 * Name Extractor Service Tests
 * TDD for bd-052
 *
 * Created: January 24, 2026
 * Bead: bd-052
 */

const NameExtractorService = require('../../shared/services/name-extractor.service');

describe('NameExtractorService', () => {
  describe('buildExtractionPrompt', () => {
    it('should build prompt without student list', () => {
      const transcript = 'Zara present. Ahmed absent.';
      const prompt = NameExtractorService.buildExtractionPrompt(transcript, []);

      expect(prompt).toContain('Extract student names');
      expect(prompt).toContain(transcript);
      expect(prompt).not.toContain('Known students');
    });

    it('should build prompt with student list for contextual biasing', () => {
      const transcript = 'Zara present. Ahmed absent.';
      const knownStudents = ['Zara Abdul Ghaffar', 'Ahmed Hassan'];
      const prompt = NameExtractorService.buildExtractionPrompt(transcript, knownStudents);

      expect(prompt).toContain('Known students');
      expect(prompt).toContain('Zara Abdul Ghaffar');
      expect(prompt).toContain('Ahmed Hassan');
    });

    it('should include instructions for present/absent detection', () => {
      const prompt = NameExtractorService.buildExtractionPrompt('test', []);

      expect(prompt.toLowerCase()).toContain('present');
      expect(prompt.toLowerCase()).toContain('absent');
    });
  });

  describe('parseGPTResponse', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        students: [
          { name: 'Zara Abdul Ghaffar', status: 'present', response: 'yes' },
          { name: 'Ahmed Hassan', status: 'absent', response: 'absent' }
        ]
      });

      const result = NameExtractorService.parseGPTResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Zara Abdul Ghaffar');
      expect(result[0].status).toBe('present');
      expect(result[1].name).toBe('Ahmed Hassan');
      expect(result[1].status).toBe('absent');
    });

    it('should handle JSON wrapped in markdown code block', () => {
      const response = '```json\n{"students":[{"name":"Zara","status":"present"}]}\n```';

      const result = NameExtractorService.parseGPTResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Zara');
    });

    it('should return empty array for invalid JSON', () => {
      const result = NameExtractorService.parseGPTResponse('invalid json');

      expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(NameExtractorService.parseGPTResponse(null)).toEqual([]);
      expect(NameExtractorService.parseGPTResponse(undefined)).toEqual([]);
    });
  });

  describe('normalizeStatus', () => {
    it('should normalize present indicators', () => {
      expect(NameExtractorService.normalizeStatus('present')).toBe('present');
      expect(NameExtractorService.normalizeStatus('PRESENT')).toBe('present');
      expect(NameExtractorService.normalizeStatus('yes')).toBe('present');
      expect(NameExtractorService.normalizeStatus('here')).toBe('present');
      expect(NameExtractorService.normalizeStatus('haazir')).toBe('present');
    });

    it('should normalize absent indicators', () => {
      expect(NameExtractorService.normalizeStatus('absent')).toBe('absent');
      expect(NameExtractorService.normalizeStatus('ABSENT')).toBe('absent');
      expect(NameExtractorService.normalizeStatus('no')).toBe('absent');
      expect(NameExtractorService.normalizeStatus('ghair hazir')).toBe('absent');
    });

    it('should default to unknown for unclear responses', () => {
      expect(NameExtractorService.normalizeStatus('')).toBe('unknown');
      expect(NameExtractorService.normalizeStatus('maybe')).toBe('unknown');
      expect(NameExtractorService.normalizeStatus(null)).toBe('unknown');
    });
  });

  describe('matchToKnownStudents', () => {
    it('should match exact names', () => {
      const extracted = [{ name: 'Zara Abdul Ghaffar', status: 'present' }];
      const known = [
        { id: 'uuid-1', student_name: 'Zara Abdul Ghaffar', father_name: 'Abdul Ghaffar', roll_number: 1 }
      ];

      const result = NameExtractorService.matchToKnownStudents(extracted, known);

      expect(result[0].studentId).toBe('uuid-1');
      expect(result[0].matchedName).toBe('Zara Abdul Ghaffar');
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should match partial names with lower confidence', () => {
      const extracted = [{ name: 'Zara', status: 'present' }];
      const known = [
        { id: 'uuid-1', student_name: 'Zara Abdul Ghaffar', father_name: 'Abdul Ghaffar', roll_number: 1 }
      ];

      const result = NameExtractorService.matchToKnownStudents(extracted, known);

      expect(result[0].studentId).toBe('uuid-1');
      expect(result[0].confidence).toBeLessThan(0.9);
      expect(result[0].confidence).toBeGreaterThan(0.5);
    });

    it('should handle unmatched names', () => {
      const extracted = [{ name: 'Unknown Student', status: 'present' }];
      const known = [
        { id: 'uuid-1', student_name: 'Zara Abdul Ghaffar', father_name: 'Abdul Ghaffar', roll_number: 1 }
      ];

      const result = NameExtractorService.matchToKnownStudents(extracted, known);

      expect(result[0].studentId).toBeNull();
      expect(result[0].matchedName).toBe('Unknown Student');
    });

    it('should handle empty known list (first-time user)', () => {
      const extracted = [{ name: 'Zara', status: 'present' }];

      const result = NameExtractorService.matchToKnownStudents(extracted, []);

      expect(result[0].studentId).toBeNull();
      expect(result[0].name).toBe('Zara');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      const score = NameExtractorService.calculateSimilarity('Zara', 'Zara');
      expect(score).toBe(1);
    });

    it('should return moderate score for similar strings', () => {
      const score = NameExtractorService.calculateSimilarity('Zara', 'Zahra');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return low score for different strings', () => {
      const score = NameExtractorService.calculateSimilarity('Zara', 'Ahmed');
      expect(score).toBeLessThan(0.5);
    });

    it('should be case-insensitive', () => {
      const score = NameExtractorService.calculateSimilarity('ZARA', 'zara');
      expect(score).toBe(1);
    });

    it('should handle substring matches', () => {
      const score = NameExtractorService.calculateSimilarity('Zara', 'Zara Abdul Ghaffar');
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('markMissingAsAbsent', () => {
    it('should mark students not in extraction as absent', () => {
      const extraction = [
        { studentId: 'uuid-1', name: 'Zara', status: 'present' }
      ];
      const allStudents = [
        { id: 'uuid-1', student_name: 'Zara', roll_number: 1 },
        { id: 'uuid-2', student_name: 'Ahmed', roll_number: 2 }
      ];

      const result = NameExtractorService.markMissingAsAbsent(extraction, allStudents);

      expect(result).toHaveLength(2);
      expect(result.find(s => s.studentId === 'uuid-1').status).toBe('present');
      expect(result.find(s => s.studentId === 'uuid-2').status).toBe('absent');
      expect(result.find(s => s.studentId === 'uuid-2').autoMarked).toBe(true);
    });

    it('should not duplicate students already in extraction', () => {
      const extraction = [
        { studentId: 'uuid-1', name: 'Zara', status: 'present' },
        { studentId: 'uuid-2', name: 'Ahmed', status: 'absent' }
      ];
      const allStudents = [
        { id: 'uuid-1', student_name: 'Zara', roll_number: 1 },
        { id: 'uuid-2', student_name: 'Ahmed', roll_number: 2 }
      ];

      const result = NameExtractorService.markMissingAsAbsent(extraction, allStudents);

      expect(result).toHaveLength(2);
    });
  });

  describe('generateAttendanceSummary', () => {
    it('should count present and absent correctly', () => {
      const records = [
        { status: 'present' },
        { status: 'present' },
        { status: 'absent' },
        { status: 'unknown' }
      ];

      const summary = NameExtractorService.generateAttendanceSummary(records);

      expect(summary.total).toBe(4);
      expect(summary.present).toBe(2);
      expect(summary.absent).toBe(1);
      expect(summary.unknown).toBe(1);
      expect(summary.presentPercentage).toBe(50);
    });

    it('should handle empty records', () => {
      const summary = NameExtractorService.generateAttendanceSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.present).toBe(0);
      expect(summary.presentPercentage).toBe(0);
    });

    it('should handle all present', () => {
      const records = [
        { status: 'present' },
        { status: 'present' }
      ];

      const summary = NameExtractorService.generateAttendanceSummary(records);

      expect(summary.presentPercentage).toBe(100);
    });
  });
});
