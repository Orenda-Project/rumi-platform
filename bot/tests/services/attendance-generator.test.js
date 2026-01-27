/**
 * Attendance Generator Service Tests
 * TDD for bd-053
 *
 * Created: January 24, 2026
 * Bead: bd-053
 */

const AttendanceGeneratorService = require('../../shared/services/attendance-generator.service');

describe('AttendanceGeneratorService', () => {
  describe('formatDateForDisplay', () => {
    it('should format date as DD-MM-YYYY', () => {
      const date = new Date('2026-01-24');
      const formatted = AttendanceGeneratorService.formatDateForDisplay(date);
      expect(formatted).toBe('24-01-2026');
    });

    it('should handle string date input', () => {
      const formatted = AttendanceGeneratorService.formatDateForDisplay('2026-01-24');
      expect(formatted).toBe('24-01-2026');
    });

    it('should pad single digit days and months', () => {
      const date = new Date('2026-01-05');
      const formatted = AttendanceGeneratorService.formatDateForDisplay(date);
      expect(formatted).toBe('05-01-2026');
    });
  });

  describe('formatFileName', () => {
    it('should create valid filename with class and date', () => {
      const fileName = AttendanceGeneratorService.formatFileName('Grade 4', null, '2026-01-24');
      expect(fileName).toContain('Grade_4');
      expect(fileName).toContain('24-01-2026');
      expect(fileName).toEndWith('.xlsx');
    });

    it('should include section if provided', () => {
      const fileName = AttendanceGeneratorService.formatFileName('Grade 4', 'B', '2026-01-24');
      expect(fileName).toContain('Grade_4_B');
    });

    it('should sanitize special characters', () => {
      const fileName = AttendanceGeneratorService.formatFileName('Grade/4', null, '2026-01-24');
      expect(fileName).not.toContain('/');
    });
  });

  describe('getStatusDisplay', () => {
    it('should return P for present', () => {
      expect(AttendanceGeneratorService.getStatusDisplay('present')).toBe('P');
    });

    it('should return A for absent', () => {
      expect(AttendanceGeneratorService.getStatusDisplay('absent')).toBe('A');
    });

    it('should return ? for unknown', () => {
      expect(AttendanceGeneratorService.getStatusDisplay('unknown')).toBe('?');
    });

    it('should handle uppercase input', () => {
      expect(AttendanceGeneratorService.getStatusDisplay('PRESENT')).toBe('P');
    });
  });

  describe('prepareAttendanceRows', () => {
    it('should create rows with roll number, name, father name, status', () => {
      const records = [
        { rollNumber: 1, studentName: 'Zara', fatherName: 'Abdul', status: 'present' },
        { rollNumber: 2, studentName: 'Ahmed', fatherName: 'Hassan', status: 'absent' }
      ];

      const rows = AttendanceGeneratorService.prepareAttendanceRows(records);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual([1, 'Zara', 'Abdul', 'P']);
      expect(rows[1]).toEqual([2, 'Ahmed', 'Hassan', 'A']);
    });

    it('should handle null father name', () => {
      const records = [
        { rollNumber: 1, studentName: 'Zara', fatherName: null, status: 'present' }
      ];

      const rows = AttendanceGeneratorService.prepareAttendanceRows(records);

      expect(rows[0][2]).toBe('-');
    });

    it('should sort by roll number', () => {
      const records = [
        { rollNumber: 3, studentName: 'C', fatherName: null, status: 'present' },
        { rollNumber: 1, studentName: 'A', fatherName: null, status: 'present' },
        { rollNumber: 2, studentName: 'B', fatherName: null, status: 'present' }
      ];

      const rows = AttendanceGeneratorService.prepareAttendanceRows(records);

      expect(rows[0][0]).toBe(1);
      expect(rows[1][0]).toBe(2);
      expect(rows[2][0]).toBe(3);
    });
  });

  describe('calculateSummaryStats', () => {
    it('should calculate total, present, absent counts', () => {
      const records = [
        { status: 'present' },
        { status: 'present' },
        { status: 'absent' }
      ];

      const stats = AttendanceGeneratorService.calculateSummaryStats(records);

      expect(stats.total).toBe(3);
      expect(stats.present).toBe(2);
      expect(stats.absent).toBe(1);
      expect(stats.attendanceRate).toBe('66.67%');
    });

    it('should handle empty records', () => {
      const stats = AttendanceGeneratorService.calculateSummaryStats([]);

      expect(stats.total).toBe(0);
      expect(stats.present).toBe(0);
      expect(stats.attendanceRate).toBe('0%');
    });

    it('should handle all present', () => {
      const records = [
        { status: 'present' },
        { status: 'present' }
      ];

      const stats = AttendanceGeneratorService.calculateSummaryStats(records);

      expect(stats.attendanceRate).toBe('100%');
    });
  });

  describe('getColumnWidths', () => {
    it('should return appropriate widths for attendance columns', () => {
      const widths = AttendanceGeneratorService.getColumnWidths();

      expect(widths.rollNumber).toBeGreaterThan(5);
      expect(widths.studentName).toBeGreaterThan(15);
      expect(widths.fatherName).toBeGreaterThan(15);
      expect(widths.status).toBeGreaterThan(5);
    });
  });

  describe('getHeaderStyle', () => {
    it('should return style object with bold font', () => {
      const style = AttendanceGeneratorService.getHeaderStyle();

      expect(style.font.bold).toBe(true);
    });

    it('should include fill color', () => {
      const style = AttendanceGeneratorService.getHeaderStyle();

      expect(style.fill).toBeDefined();
      expect(style.fill.type).toBe('pattern');
    });

    it('should include border', () => {
      const style = AttendanceGeneratorService.getHeaderStyle();

      expect(style.border).toBeDefined();
    });
  });

  describe('getPresentStyle', () => {
    it('should return style with green-ish background', () => {
      const style = AttendanceGeneratorService.getPresentStyle();

      expect(style.fill).toBeDefined();
      expect(style.font.color).toBeDefined();
    });
  });

  describe('getAbsentStyle', () => {
    it('should return style with red-ish background', () => {
      const style = AttendanceGeneratorService.getAbsentStyle();

      expect(style.fill).toBeDefined();
      expect(style.font.color).toBeDefined();
    });
  });

  describe('createExcelBuffer', () => {
    it('should create valid Excel buffer', async () => {
      const metadata = {
        className: 'Grade 4',
        section: 'B',
        date: '2026-01-24',
        teacherName: 'Test Teacher'
      };

      const records = [
        { rollNumber: 1, studentName: 'Zara', fatherName: 'Abdul', status: 'present' },
        { rollNumber: 2, studentName: 'Ahmed', fatherName: 'Hassan', status: 'absent' }
      ];

      const buffer = await AttendanceGeneratorService.createExcelBuffer(metadata, records);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Check for Excel file signature (PK for ZIP format)
      expect(buffer[0]).toBe(0x50); // P
      expect(buffer[1]).toBe(0x4B); // K
    });

    it('should handle empty records', async () => {
      const metadata = {
        className: 'Grade 4',
        date: '2026-01-24'
      };

      const buffer = await AttendanceGeneratorService.createExcelBuffer(metadata, []);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});

  // =========================================================================
  // MONTHLY REGISTER TESTS (bd-199, bd-204)
  // =========================================================================

  describe('getWeekendDays', () => {
    it('should return weekend days for January 2026', () => {
      const weekends = AttendanceGeneratorService.getWeekendDays(2026, 1);

      // January 2026: Saturdays are 3, 10, 17, 24, 31; Sundays are 4, 11, 18, 25
      expect(weekends).toContain(3);  // Saturday
      expect(weekends).toContain(4);  // Sunday
      expect(weekends).toContain(10); // Saturday
      expect(weekends).toContain(11); // Sunday
      expect(weekends).not.toContain(1);  // Thursday
      expect(weekends).not.toContain(2);  // Friday
    });

    it('should handle February in leap year', () => {
      // 2024 is a leap year
      const weekends = AttendanceGeneratorService.getWeekendDays(2024, 2);
      // February 2024 has 29 days
      expect(weekends.length).toBeGreaterThan(0);
    });

    it('should return empty array for invalid input', () => {
      const weekends = AttendanceGeneratorService.getWeekendDays(null, null);
      expect(Array.isArray(weekends)).toBe(true);
    });
  });

  describe('formatMonthlyFileName', () => {
    it('should create filename with month and year', () => {
      const fileName = AttendanceGeneratorService.formatMonthlyFileName('Grade 5', 'A', 1, 2026);
      expect(fileName).toContain('Grade_5');
      expect(fileName).toContain('A');
      expect(fileName).toContain('January');
      expect(fileName).toContain('2026');
      expect(fileName).toEndWith('.xlsx');
    });

    it('should handle class without section', () => {
      const fileName = AttendanceGeneratorService.formatMonthlyFileName('Grade 5', null, 1, 2026);
      expect(fileName).toContain('Grade_5');
      expect(fileName).not.toContain('null');
    });
  });

  describe('buildAttendanceMatrix', () => {
    it('should create matrix with students as rows and days as columns', () => {
      const students = [
        { id: 'stu-1', roll_number: 1, student_name: 'Haroon', father_name: 'Yasin' },
        { id: 'stu-2', roll_number: 2, student_name: 'Farhan', father_name: 'Yasin' }
      ];

      const sessions = [
        {
          session_date: '2026-01-06',
          attendance_records: [
            { student_id: 'stu-1', status: 'present' },
            { student_id: 'stu-2', status: 'absent' }
          ]
        },
        {
          session_date: '2026-01-07',
          attendance_records: [
            { student_id: 'stu-1', status: 'present' },
            { student_id: 'stu-2', status: 'present' }
          ]
        }
      ];

      const matrix = AttendanceGeneratorService.buildAttendanceMatrix(students, sessions);

      expect(matrix['stu-1'].days[6]).toBe('P'); // Day 6 = present
      expect(matrix['stu-1'].days[7]).toBe('P'); // Day 7 = present
      expect(matrix['stu-2'].days[6]).toBe('A'); // Day 6 = absent
      expect(matrix['stu-2'].days[7]).toBe('P'); // Day 7 = present
    });

    it('should handle students with no attendance records', () => {
      const students = [
        { id: 'stu-1', roll_number: 1, student_name: 'Haroon', father_name: 'Yasin' }
      ];

      const sessions = []; // No sessions

      const matrix = AttendanceGeneratorService.buildAttendanceMatrix(students, sessions);

      expect(matrix['stu-1'].student.student_name).toBe('Haroon');
      expect(Object.keys(matrix['stu-1'].days).length).toBe(0); // No attendance data
    });
  });

  describe('calculateStudentMonthlyStats', () => {
    it('should calculate present, absent, and percentage', () => {
      const days = { 1: 'P', 2: 'P', 3: 'A', 5: 'P', 6: 'P', 7: 'A' };

      const stats = AttendanceGeneratorService.calculateStudentMonthlyStats(days);

      expect(stats.present).toBe(4);
      expect(stats.absent).toBe(2);
      expect(stats.percentage).toBe(67); // 4/6 = 66.67 rounded to 67
    });

    it('should handle all present', () => {
      const days = { 1: 'P', 2: 'P', 3: 'P' };

      const stats = AttendanceGeneratorService.calculateStudentMonthlyStats(days);

      expect(stats.present).toBe(3);
      expect(stats.absent).toBe(0);
      expect(stats.percentage).toBe(100);
    });

    it('should handle no records', () => {
      const days = {};

      const stats = AttendanceGeneratorService.calculateStudentMonthlyStats(days);

      expect(stats.present).toBe(0);
      expect(stats.absent).toBe(0);
      expect(stats.percentage).toBe(0);
    });
  });

  describe('createMonthlyRegisterBuffer', () => {
    // Note: This test requires mocking supabase - will be integration tested
    it('should create valid Excel buffer with monthly format', async () => {
      // Mock data
      const students = [
        { id: 'stu-1', roll_number: 1, student_name: 'Haroon', father_name: 'Yasin' },
        { id: 'stu-2', roll_number: 2, student_name: 'Farhan', father_name: 'Yasin' }
      ];

      const sessions = [
        {
          session_date: '2026-01-06',
          attendance_records: [
            { student_id: 'stu-1', status: 'present' },
            { student_id: 'stu-2', status: 'absent' }
          ]
        }
      ];

      const buffer = await AttendanceGeneratorService.createMonthlyRegisterBufferFromData(
        { className: '5', section: 'A' },
        1, // January
        2026,
        students,
        sessions
      );

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Check for Excel file signature (PK for ZIP format)
      expect(buffer[0]).toBe(0x50); // P
      expect(buffer[1]).toBe(0x4B); // K
    });
  });
});

// Custom matcher for string ending
expect.extend({
  toEndWith(received, suffix) {
    const pass = received.endsWith(suffix);
    return {
      message: () => `expected ${received} to end with ${suffix}`,
      pass
    };
  }
});
