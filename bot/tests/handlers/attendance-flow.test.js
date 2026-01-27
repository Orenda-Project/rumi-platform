/**
 * Attendance Flow Handler Tests
 * TDD for bd-057
 *
 * Created: January 24, 2026
 * Bead: bd-057
 */

// Mock dependencies
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn(),
  eq: jest.fn().mockReturnThis()
};

jest.mock('../../shared/config/supabase', () => mockSupabase);
jest.mock('../../shared/utils/logger', () => ({
  logToFile: jest.fn()
}));

const AttendanceFlowHandler = require('../../shared/handlers/attendance-flow.handler');

describe('AttendanceFlowHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseSetupFlowResponse', () => {
    it('should parse valid setup flow response', () => {
      const responseJson = {
        class_name: 'Grade 4',
        section: 'B',
        academic_year: '2025-2026',
        attendance_frequency: 'once',
        student_list: 'Zara, Abdul\nAhmed, Hassan'
      };

      const result = AttendanceFlowHandler.parseSetupFlowResponse(responseJson);

      expect(result.className).toBe('Grade 4');
      expect(result.section).toBe('B');
      expect(result.academicYear).toBe('2025-2026');
      expect(result.attendanceFrequency).toBe('once');
      expect(result.studentList).toBe('Zara, Abdul\nAhmed, Hassan');
    });

    it('should handle missing optional section', () => {
      const responseJson = {
        class_name: 'Grade 4',
        academic_year: '2025-2026',
        attendance_frequency: 'once',
        student_list: 'Zara'
      };

      const result = AttendanceFlowHandler.parseSetupFlowResponse(responseJson);

      expect(result.section).toBeNull();
    });

    it('should return null for invalid response', () => {
      const result = AttendanceFlowHandler.parseSetupFlowResponse(null);
      expect(result).toBeNull();
    });

    it('should return null if required fields missing', () => {
      const responseJson = {
        class_name: 'Grade 4'
        // missing other required fields
      };

      const result = AttendanceFlowHandler.parseSetupFlowResponse(responseJson);
      expect(result).toBeNull();
    });
  });

  describe('parseMarkingFlowResponse', () => {
    it('should parse absent students list', () => {
      const responseJson = {
        absent_students: ['uuid-1', 'uuid-2'],
        class_name: 'Grade 4 - B',
        date_display: 'Friday, 24 January 2026',
        session_type: 'Morning'
      };

      const result = AttendanceFlowHandler.parseMarkingFlowResponse(responseJson);

      expect(result.absentStudentIds).toEqual(['uuid-1', 'uuid-2']);
      expect(result.className).toBe('Grade 4 - B');
      expect(result.sessionType).toBe('Morning');
    });

    it('should handle empty absent list (everyone present)', () => {
      const responseJson = {
        absent_students: [],
        class_name: 'Grade 4',
        date_display: 'Friday, 24 January 2026',
        session_type: 'Full Day'
      };

      const result = AttendanceFlowHandler.parseMarkingFlowResponse(responseJson);

      expect(result.absentStudentIds).toEqual([]);
      expect(result.everyonePresent).toBe(true);
    });

    it('should return null for invalid response', () => {
      const result = AttendanceFlowHandler.parseMarkingFlowResponse(null);
      expect(result).toBeNull();
    });
  });

  describe('validateSetupData', () => {
    it('should validate correct data', () => {
      const data = {
        className: 'Grade 4',
        academicYear: '2025-2026',
        attendanceFrequency: 'once',
        studentList: 'Zara\nAhmed'
      };

      const result = AttendanceFlowHandler.validateSetupData(data);

      expect(result.valid).toBe(true);
    });

    it('should reject empty class name', () => {
      const data = {
        className: '',
        academicYear: '2025-2026',
        attendanceFrequency: 'once',
        studentList: 'Zara'
      };

      const result = AttendanceFlowHandler.validateSetupData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Class');
    });

    it('should reject invalid academic year', () => {
      const data = {
        className: 'Grade 4',
        academicYear: '2025',
        attendanceFrequency: 'once',
        studentList: 'Zara'
      };

      const result = AttendanceFlowHandler.validateSetupData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('year');
    });

    it('should reject empty student list', () => {
      const data = {
        className: 'Grade 4',
        academicYear: '2025-2026',
        attendanceFrequency: 'once',
        studentList: ''
      };

      const result = AttendanceFlowHandler.validateSetupData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Student');
    });
  });

  describe('buildAttendanceRecords', () => {
    it('should mark non-absent students as present', () => {
      const allStudents = [
        { id: 'uuid-1', student_name: 'Zara' },
        { id: 'uuid-2', student_name: 'Ahmed' },
        { id: 'uuid-3', student_name: 'Fatima' }
      ];
      const absentIds = ['uuid-2'];

      const records = AttendanceFlowHandler.buildAttendanceRecords(allStudents, absentIds);

      expect(records).toHaveLength(3);
      expect(records.find(r => r.studentId === 'uuid-1').status).toBe('present');
      expect(records.find(r => r.studentId === 'uuid-2').status).toBe('absent');
      expect(records.find(r => r.studentId === 'uuid-3').status).toBe('present');
    });

    it('should mark everyone present when absent list is empty', () => {
      const allStudents = [
        { id: 'uuid-1', student_name: 'Zara' },
        { id: 'uuid-2', student_name: 'Ahmed' }
      ];
      const absentIds = [];

      const records = AttendanceFlowHandler.buildAttendanceRecords(allStudents, absentIds);

      expect(records.every(r => r.status === 'present')).toBe(true);
    });
  });

  describe('generateConfirmationMessage', () => {
    it('should generate message with counts', () => {
      const stats = {
        total: 25,
        present: 23,
        absent: 2,
        attendanceRate: '92%'
      };
      const className = 'Grade 4 - B';

      const message = AttendanceFlowHandler.generateConfirmationMessage(className, stats);

      expect(message).toContain('Grade 4 - B');
      expect(message).toContain('25');
      expect(message).toContain('23');
      expect(message).toContain('2');
      expect(message).toContain('92%');
    });

    it('should handle 100% attendance', () => {
      const stats = {
        total: 25,
        present: 25,
        absent: 0,
        attendanceRate: '100%'
      };

      const message = AttendanceFlowHandler.generateConfirmationMessage('Grade 4', stats);

      expect(message).toContain('100%');
    });
  });
});
