/**
 * Voice Attendance Service Tests
 * TDD for bd-061
 *
 * Created: January 24, 2026
 * Bead: bd-061
 */

// Mock dependencies before requiring the module
const mockAudioService = {
  transcribe: jest.fn(),
  convertToWav: jest.fn()
};

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn()
    }
  }
};

jest.mock('../../shared/services/audio.service', () => mockAudioService);
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => mockOpenAI);
});
jest.mock('../../shared/utils/logger', () => ({
  logToFile: jest.fn()
}));

const VoiceAttendanceService = require('../../shared/services/voice-attendance.service');

describe('VoiceAttendanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constants', () => {
    it('should export status constants', () => {
      expect(VoiceAttendanceService.STATUS.PRESENT).toBe('present');
      expect(VoiceAttendanceService.STATUS.ABSENT).toBe('absent');
    });
  });

  describe('processVoiceAttendance', () => {
    const mockStudentList = [
      { id: 'student-1', student_name: 'Zara Abdul Ghaffar', roll_number: 1 },
      { id: 'student-2', student_name: 'Ahmed Hassan', roll_number: 2 },
      { id: 'student-3', student_name: 'Fatima Ali', roll_number: 3 },
      { id: 'student-4', student_name: 'Muhammad Usman', roll_number: 4 },
      { id: 'student-5', student_name: 'Ayesha Khan', roll_number: 5 }
    ];

    it('should transcribe audio and extract attendance', async () => {
      // Mock Soniox transcription
      mockAudioService.transcribe.mockResolvedValue({
        text: 'Zara - موجود، Ahmed - غیر حاضر، Fatima - present, Usman - absent, Ayesha - present',
        language: 'ur'
      });

      // Mock GPT name extraction
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              attendance: [
                { name: 'Zara', status: 'present', confidence: 0.95 },
                { name: 'Ahmed', status: 'absent', confidence: 0.90 },
                { name: 'Fatima', status: 'present', confidence: 0.95 },
                { name: 'Usman', status: 'absent', confidence: 0.85 },
                { name: 'Ayesha', status: 'present', confidence: 0.95 }
              ]
            })
          }
        }]
      });

      const result = await VoiceAttendanceService.processVoiceAttendance(
        '/tmp/test-audio.wav',
        mockStudentList
      );

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(5);
      expect(result.records.find(r => r.student_id === 'student-1').status).toBe('present');
      expect(result.records.find(r => r.student_id === 'student-2').status).toBe('absent');
    });

    it('should handle Urdu keywords for present/absent', async () => {
      mockAudioService.transcribe.mockResolvedValue({
        text: 'زارا موجود، احمد غائب، فاطمہ حاضر',
        language: 'ur'
      });

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              attendance: [
                { name: 'زارا', status: 'present', confidence: 0.90 },
                { name: 'احمد', status: 'absent', confidence: 0.90 },
                { name: 'فاطمہ', status: 'present', confidence: 0.90 }
              ]
            })
          }
        }]
      });

      const result = await VoiceAttendanceService.processVoiceAttendance(
        '/tmp/test-audio.wav',
        mockStudentList.slice(0, 3)
      );

      expect(result.success).toBe(true);
      expect(result.records).toHaveLength(3);
    });

    it('should handle transcription errors gracefully', async () => {
      mockAudioService.transcribe.mockRejectedValue(new Error('Soniox API error'));

      const result = await VoiceAttendanceService.processVoiceAttendance(
        '/tmp/test-audio.wav',
        mockStudentList
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Soniox');
    });

    it('should handle GPT extraction errors', async () => {
      mockAudioService.transcribe.mockResolvedValue({
        text: 'Some valid transcript',
        language: 'en'
      });

      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI rate limit'));

      const result = await VoiceAttendanceService.processVoiceAttendance(
        '/tmp/test-audio.wav',
        mockStudentList
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI');
    });
  });

  describe('matchStudentNames', () => {
    const studentList = [
      { id: 'student-1', student_name: 'Zara Abdul Ghaffar', roll_number: 1 },
      { id: 'student-2', student_name: 'Ahmed Hassan', roll_number: 2 },
      { id: 'student-3', student_name: 'Muhammad Usman', roll_number: 3 }
    ];

    it('should match exact first name', () => {
      const match = VoiceAttendanceService.matchStudentName('Zara', studentList);
      expect(match.student_id).toBe('student-1');
      expect(match.confidence).toBeGreaterThan(0.9);
    });

    it('should match partial name', () => {
      const match = VoiceAttendanceService.matchStudentName('Ahmed', studentList);
      expect(match.student_id).toBe('student-2');
    });

    it('should match Urdu name to English entry', () => {
      const match = VoiceAttendanceService.matchStudentName('احمد', studentList);
      // Should use GPT for transliteration matching
      expect(match).toBeDefined();
    });

    it('should handle roll number reference', () => {
      const match = VoiceAttendanceService.matchStudentName('roll number 2', studentList);
      expect(match.student_id).toBe('student-2');
    });

    it('should return null for unmatched names', () => {
      const match = VoiceAttendanceService.matchStudentName('Unknown Student', studentList);
      expect(match).toBeNull();
    });
  });

  describe('parseUrduAttendanceKeywords', () => {
    it('should detect present in Urdu', () => {
      expect(VoiceAttendanceService.parseAttendanceKeyword('موجود')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('حاضر')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('پریزنٹ')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('ہاں')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('جی')).toBe('present');
    });

    it('should detect absent in Urdu', () => {
      expect(VoiceAttendanceService.parseAttendanceKeyword('غیر حاضر')).toBe('absent');
      expect(VoiceAttendanceService.parseAttendanceKeyword('غائب')).toBe('absent');
      expect(VoiceAttendanceService.parseAttendanceKeyword('ایبسنٹ')).toBe('absent');
      expect(VoiceAttendanceService.parseAttendanceKeyword('نہیں')).toBe('absent');
    });

    it('should detect present in English', () => {
      expect(VoiceAttendanceService.parseAttendanceKeyword('present')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('Present')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('yes')).toBe('present');
      expect(VoiceAttendanceService.parseAttendanceKeyword('here')).toBe('present');
    });

    it('should detect absent in English', () => {
      expect(VoiceAttendanceService.parseAttendanceKeyword('absent')).toBe('absent');
      expect(VoiceAttendanceService.parseAttendanceKeyword('Absent')).toBe('absent');
      expect(VoiceAttendanceService.parseAttendanceKeyword('no')).toBe('absent');
      expect(VoiceAttendanceService.parseAttendanceKeyword('not here')).toBe('absent');
    });

    it('should return null for unknown keywords', () => {
      expect(VoiceAttendanceService.parseAttendanceKeyword('random')).toBeNull();
    });
  });

  describe('generateAttendanceRecords', () => {
    it('should generate records for all students', () => {
      const students = [
        { id: 'student-1', student_name: 'Zara' },
        { id: 'student-2', student_name: 'Ahmed' }
      ];

      const extractedAttendance = [
        { name: 'Zara', status: 'present', confidence: 0.95 },
        { name: 'Ahmed', status: 'absent', confidence: 0.90 }
      ];

      const records = VoiceAttendanceService.generateAttendanceRecords(
        students,
        extractedAttendance
      );

      expect(records).toHaveLength(2);
      expect(records[0].status).toBe('present');
      expect(records[1].status).toBe('absent');
    });

    it('should mark unmentioned students as present by default', () => {
      const students = [
        { id: 'student-1', student_name: 'Zara' },
        { id: 'student-2', student_name: 'Ahmed' },
        { id: 'student-3', student_name: 'Fatima' }
      ];

      // Only Zara mentioned as absent
      const extractedAttendance = [
        { name: 'Zara', status: 'absent', confidence: 0.95 }
      ];

      const records = VoiceAttendanceService.generateAttendanceRecords(
        students,
        extractedAttendance,
        { defaultStatus: 'present' }
      );

      expect(records).toHaveLength(3);
      expect(records.find(r => r.student_id === 'student-1').status).toBe('absent');
      expect(records.find(r => r.student_id === 'student-2').status).toBe('present');
      expect(records.find(r => r.student_id === 'student-3').status).toBe('present');
    });
  });

  describe('buildGPTPrompt', () => {
    it('should include student list in prompt', () => {
      const students = [
        { id: 'student-1', student_name: 'Zara Abdul Ghaffar', roll_number: 1 },
        { id: 'student-2', student_name: 'Ahmed Hassan', roll_number: 2 }
      ];

      const prompt = VoiceAttendanceService.buildGPTPrompt(
        'Zara is present, Ahmed absent',
        students
      );

      expect(prompt).toContain('Zara Abdul Ghaffar');
      expect(prompt).toContain('Ahmed Hassan');
      expect(prompt).toContain('present');
      expect(prompt).toContain('absent');
    });

    it('should include Urdu keywords in prompt', () => {
      const students = [{ id: 'student-1', student_name: 'Test' }];

      const prompt = VoiceAttendanceService.buildGPTPrompt(
        'Test transcript',
        students
      );

      expect(prompt).toContain('موجود');
      expect(prompt).toContain('غیر حاضر');
    });
  });

  describe('calculateOverallConfidence', () => {
    it('should calculate average confidence', () => {
      const records = [
        { confidence: 0.90 },
        { confidence: 0.80 },
        { confidence: 0.70 }
      ];

      const confidence = VoiceAttendanceService.calculateOverallConfidence(records);
      expect(confidence).toBeCloseTo(0.80, 2);
    });

    it('should handle empty records', () => {
      const confidence = VoiceAttendanceService.calculateOverallConfidence([]);
      expect(confidence).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should calculate summary statistics', () => {
      const records = [
        { status: 'present' },
        { status: 'present' },
        { status: 'absent' },
        { status: 'present' }
      ];

      const summary = VoiceAttendanceService.getSummary(records);

      expect(summary.total).toBe(4);
      expect(summary.present).toBe(3);
      expect(summary.absent).toBe(1);
      expect(summary.attendancePercentage).toBeCloseTo(75, 0);
    });
  });
});
