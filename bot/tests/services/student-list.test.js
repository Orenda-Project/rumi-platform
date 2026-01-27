/**
 * Student List Service Tests
 * TDD: Tests written first for bd-051
 *
 * Test Coverage Target: 90%+
 */

// Mock supabase before importing service
jest.mock('../../shared/config/supabase', () => ({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

const StudentListService = require('../../shared/services/student-list.service');

describe('StudentListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseStudentText', () => {
    it('should parse single student with father name (comma separated)', () => {
      const text = 'Zara, Abdul Ghaffar';
      const result = StudentListService.parseStudentText(text);
      expect(result).toEqual([
        { studentName: 'Zara', fatherName: 'Abdul Ghaffar' }
      ]);
    });

    it('should parse multiple students (newline separated)', () => {
      const text = 'Zara, Abdul Ghaffar\nZeenat, Abdul Saleem\nAhmad, Muhammad Ali';
      const result = StudentListService.parseStudentText(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ studentName: 'Zara', fatherName: 'Abdul Ghaffar' });
      expect(result[1]).toEqual({ studentName: 'Zeenat', fatherName: 'Abdul Saleem' });
      expect(result[2]).toEqual({ studentName: 'Ahmad', fatherName: 'Muhammad Ali' });
    });

    it('should handle student without father name', () => {
      const text = 'Zara';
      const result = StudentListService.parseStudentText(text);
      expect(result).toEqual([
        { studentName: 'Zara', fatherName: null }
      ]);
    });

    it('should handle mixed format (some with father names, some without)', () => {
      const text = 'Zara, Abdul Ghaffar\nZeenat\nAhmad, Muhammad Ali';
      const result = StudentListService.parseStudentText(text);
      expect(result[0].fatherName).toBe('Abdul Ghaffar');
      expect(result[1].fatherName).toBeNull();
      expect(result[2].fatherName).toBe('Muhammad Ali');
    });

    it('should trim whitespace from names', () => {
      const text = '  Zara  ,  Abdul Ghaffar  ';
      const result = StudentListService.parseStudentText(text);
      expect(result[0].studentName).toBe('Zara');
      expect(result[0].fatherName).toBe('Abdul Ghaffar');
    });

    it('should skip empty lines', () => {
      const text = 'Zara, Abdul Ghaffar\n\n\nZeenat, Abdul Saleem';
      const result = StudentListService.parseStudentText(text);
      expect(result).toHaveLength(2);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const text = 'Zara, Abdul Ghaffar\r\nZeenat, Abdul Saleem';
      const result = StudentListService.parseStudentText(text);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty string', () => {
      const result = StudentListService.parseStudentText('');
      expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(StudentListService.parseStudentText(null)).toEqual([]);
      expect(StudentListService.parseStudentText(undefined)).toEqual([]);
    });

    it('should handle numbered list format', () => {
      const text = '1. Zara, Abdul Ghaffar\n2. Zeenat, Abdul Saleem';
      const result = StudentListService.parseStudentText(text);
      expect(result).toHaveLength(2);
      expect(result[0].studentName).toBe('Zara');
      expect(result[1].studentName).toBe('Zeenat');
    });

    it('should handle bullet point format', () => {
      const text = '- Zara, Abdul Ghaffar\n- Zeenat, Abdul Saleem';
      const result = StudentListService.parseStudentText(text);
      expect(result).toHaveLength(2);
      expect(result[0].studentName).toBe('Zara');
    });

    it('should handle "s/o" or "d/o" notation', () => {
      const text = 'Zara d/o Abdul Ghaffar\nAhmad s/o Muhammad Ali';
      const result = StudentListService.parseStudentText(text);
      expect(result[0].studentName).toBe('Zara');
      expect(result[0].fatherName).toBe('Abdul Ghaffar');
      expect(result[1].studentName).toBe('Ahmad');
      expect(result[1].fatherName).toBe('Muhammad Ali');
    });
  });

  describe('validateClassName', () => {
    it('should accept valid class name', () => {
      expect(StudentListService.validateClassName('Grade 4B')).toEqual({ valid: true });
      expect(StudentListService.validateClassName('Class 5-A')).toEqual({ valid: true });
      expect(StudentListService.validateClassName('KG')).toEqual({ valid: true });
    });

    it('should reject empty class name', () => {
      const result = StudentListService.validateClassName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject class name with only spaces', () => {
      const result = StudentListService.validateClassName('   ');
      expect(result.valid).toBe(false);
    });

    it('should reject class name exceeding max length', () => {
      const longName = 'a'.repeat(101);
      const result = StudentListService.validateClassName(longName);
      expect(result.valid).toBe(false);
    });

    it('should accept class name at max length (100 chars)', () => {
      const maxName = 'a'.repeat(100);
      const result = StudentListService.validateClassName(maxName);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAcademicYear', () => {
    it('should accept valid academic year format', () => {
      expect(StudentListService.validateAcademicYear('2025-2026').valid).toBe(true);
      expect(StudentListService.validateAcademicYear('2024-2025').valid).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(StudentListService.validateAcademicYear('2025').valid).toBe(false);
      expect(StudentListService.validateAcademicYear('2025/2026').valid).toBe(false);
      expect(StudentListService.validateAcademicYear('').valid).toBe(false);
    });

    it('should reject years that are not consecutive', () => {
      expect(StudentListService.validateAcademicYear('2025-2027').valid).toBe(false);
      expect(StudentListService.validateAcademicYear('2025-2024').valid).toBe(false);
    });
  });

  describe('assignRollNumbers', () => {
    it('should assign sequential roll numbers starting from 1', () => {
      const students = [
        { studentName: 'Zara', fatherName: 'Abdul Ghaffar' },
        { studentName: 'Zeenat', fatherName: 'Abdul Saleem' },
        { studentName: 'Ahmad', fatherName: 'Muhammad Ali' }
      ];
      const result = StudentListService.assignRollNumbers(students);
      expect(result[0].rollNumber).toBe(1);
      expect(result[1].rollNumber).toBe(2);
      expect(result[2].rollNumber).toBe(3);
    });

    it('should continue from existing max roll number', () => {
      const students = [
        { studentName: 'New Student 1', fatherName: 'Father 1' },
        { studentName: 'New Student 2', fatherName: 'Father 2' }
      ];
      const result = StudentListService.assignRollNumbers(students, 10);
      expect(result[0].rollNumber).toBe(11);
      expect(result[1].rollNumber).toBe(12);
    });

    it('should not overwrite existing roll numbers', () => {
      const students = [
        { studentName: 'Zara', fatherName: 'Abdul Ghaffar', rollNumber: 5 },
        { studentName: 'Zeenat', fatherName: 'Abdul Saleem' }
      ];
      const result = StudentListService.assignRollNumbers(students);
      expect(result[0].rollNumber).toBe(5); // Kept
      expect(result[1].rollNumber).toBe(6); // Assigned after max
    });
  });

  describe('createStudentListData', () => {
    it('should create complete student list data object', () => {
      const userId = 'user-uuid-123';
      const formData = {
        className: 'Grade 4B',
        section: 'B',
        academicYear: '2025-2026',
        attendanceFrequency: 'once'
      };
      const result = StudentListService.createStudentListData(userId, formData);

      expect(result.user_id).toBe(userId);
      expect(result.class_name).toBe('Grade 4B');
      expect(result.section).toBe('B');
      expect(result.academic_year).toBe('2025-2026');
      expect(result.attendance_frequency).toBe('once');
      expect(result.is_active).toBe(true);
    });

    it('should handle optional section as null', () => {
      const result = StudentListService.createStudentListData('user-uuid', {
        className: 'KG',
        academicYear: '2025-2026'
      });
      expect(result.section).toBeNull();
    });

    it('should default attendance_frequency to "once"', () => {
      const result = StudentListService.createStudentListData('user-uuid', {
        className: 'Grade 1',
        academicYear: '2025-2026'
      });
      expect(result.attendance_frequency).toBe('once');
    });
  });

  describe('createStudentData', () => {
    it('should create student data object from parsed student', () => {
      const listId = 'list-uuid-123';
      const parsedStudent = { studentName: 'Zara', fatherName: 'Abdul Ghaffar', rollNumber: 1 };
      const result = StudentListService.createStudentData(listId, parsedStudent);

      expect(result.list_id).toBe(listId);
      expect(result.student_name).toBe('Zara');
      expect(result.father_name).toBe('Abdul Ghaffar');
      expect(result.roll_number).toBe(1);
      expect(result.is_active).toBe(true);
    });
  });

  describe('formatStudentForDisplay', () => {
    it('should format student with father name', () => {
      const student = { student_name: 'Zara', father_name: 'Abdul Ghaffar', roll_number: 1 };
      const result = StudentListService.formatStudentForDisplay(student);
      expect(result).toBe('1. Zara (Abdul Ghaffar)');
    });

    it('should format student without father name', () => {
      const student = { student_name: 'Zara', father_name: null, roll_number: 1 };
      const result = StudentListService.formatStudentForDisplay(student);
      expect(result).toBe('1. Zara');
    });
  });

  describe('formatClassForDisplay', () => {
    it('should format class with section', () => {
      const list = { class_name: 'Grade 4', section: 'B', student_count: 25 };
      const result = StudentListService.formatClassForDisplay(list);
      expect(result).toBe('Grade 4 - B (25 students)');
    });

    it('should format class without section', () => {
      const list = { class_name: 'KG', section: null, student_count: 20 };
      const result = StudentListService.formatClassForDisplay(list);
      expect(result).toBe('KG (20 students)');
    });
  });
});
