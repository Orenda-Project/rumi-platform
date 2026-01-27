/**
 * Attendance Delivery Service Tests
 * TDD for bd-063
 *
 * Created: January 24, 2026
 * Bead: bd-063
 */

// Mock dependencies before requiring the module
const mockAttendanceGenerator = {
  createExcelBuffer: jest.fn(),
  formatFileName: jest.fn(),
  formatDateForDisplay: jest.fn()
};

const mockWhatsAppService = {
  sendDocument: jest.fn(),
  sendDocumentFromUrl: jest.fn()
};

const mockConversationService = {
  clearSessionState: jest.fn()
};

const mockR2 = {
  uploadBuffer: jest.fn()
};

const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

jest.mock('../../shared/services/attendance-generator.service', () => mockAttendanceGenerator);
jest.mock('../../shared/services/whatsapp.service', () => mockWhatsAppService);
jest.mock('../../shared/services/attendance-conversation.service', () => mockConversationService);
jest.mock('../../shared/storage/r2', () => mockR2);
jest.mock('../../shared/config/supabase', () => mockSupabase);
jest.mock('../../shared/utils/logger', () => ({
  logToFile: jest.fn()
}));
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn()
}));

const AttendanceDeliveryService = require('../../shared/services/attendance-delivery.service');

describe('AttendanceDeliveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCaption', () => {
    it('should generate caption with class name and summary', () => {
      const metadata = {
        className: 'Grade 4',
        section: 'B',
        date: new Date('2026-01-24')
      };

      const summary = {
        present: 25,
        absent: 5,
        attendancePercentage: 83.33
      };

      mockAttendanceGenerator.formatDateForDisplay.mockReturnValue('24-01-2026');

      const caption = AttendanceDeliveryService.generateCaption(metadata, summary);

      expect(caption).toContain('Grade 4 - B');
      expect(caption).toContain('24-01-2026');
      expect(caption).toContain('Present: 25');
      expect(caption).toContain('Absent: 5');
      expect(caption).toContain('Attendance: 83%');
    });

    it('should handle class without section', () => {
      const metadata = {
        className: 'Grade 5',
        section: null,
        date: new Date()
      };

      const summary = { present: 30, absent: 0, attendancePercentage: 100 };
      mockAttendanceGenerator.formatDateForDisplay.mockReturnValue('24-01-2026');

      const caption = AttendanceDeliveryService.generateCaption(metadata, summary);

      expect(caption).toContain('Grade 5');
      expect(caption).not.toContain(' - null');
    });

    it('should handle missing summary', () => {
      const metadata = { className: 'Class', section: null, date: new Date() };
      mockAttendanceGenerator.formatDateForDisplay.mockReturnValue('24-01-2026');

      const caption = AttendanceDeliveryService.generateCaption(metadata, null);

      expect(caption).toContain('Present: 0');
      expect(caption).toContain('Absent: 0');
    });
  });

  describe('processAndDeliver', () => {
    const mockUserId = 'user-123';
    const mockPhoneNumber = '+923001234567';
    const mockSessionData = {
      selectedClass: { class_name: 'Grade 4', section: 'A' },
      selectedListId: 'list-123',
      records: [
        { studentId: 's1', studentName: 'Zara', rollNumber: 1, status: 'present' },
        { studentId: 's2', studentName: 'Ahmed', rollNumber: 2, status: 'absent' }
      ],
      summary: { present: 1, absent: 1, attendancePercentage: 50 }
    };

    beforeEach(() => {
      mockAttendanceGenerator.createExcelBuffer.mockResolvedValue(Buffer.from('mock-excel'));
      mockAttendanceGenerator.formatFileName.mockReturnValue('Attendance_Grade_4_A_24-01-2026.xlsx');
      mockAttendanceGenerator.formatDateForDisplay.mockReturnValue('24-01-2026');
      mockR2.uploadBuffer.mockResolvedValue('https://r2.example.com/attendance/user-123/file.xlsx');
      mockWhatsAppService.sendDocument.mockResolvedValue(true);
      mockConversationService.clearSessionState.mockResolvedValue(true);

      // Mock supabase chain
      const mockInsertChain = {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'session-123' }, error: null })
      };
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'attendance_sessions') {
          return { insert: jest.fn().mockReturnValue(mockInsertChain) };
        }
        if (table === 'attendance_records') {
          return { insert: jest.fn().mockResolvedValue({ error: null }) };
        }
        return { insert: jest.fn() };
      });
    });

    it('should complete full delivery flow', async () => {
      const result = await AttendanceDeliveryService.processAndDeliver(
        mockUserId,
        mockPhoneNumber,
        mockSessionData
      );

      expect(result.success).toBe(true);
      expect(result.fileName).toBe('Attendance_Grade_4_A_24-01-2026.xlsx');
      expect(mockAttendanceGenerator.createExcelBuffer).toHaveBeenCalled();
      expect(mockR2.uploadBuffer).toHaveBeenCalled();
      expect(mockWhatsAppService.sendDocument).toHaveBeenCalled();
      expect(mockConversationService.clearSessionState).toHaveBeenCalledWith(mockUserId);
    });

    it('should return error on Excel generation failure', async () => {
      mockAttendanceGenerator.createExcelBuffer.mockRejectedValue(new Error('Excel error'));

      const result = await AttendanceDeliveryService.processAndDeliver(
        mockUserId,
        mockPhoneNumber,
        mockSessionData
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Excel error');
    });

    it('should include elapsed time in result', async () => {
      const result = await AttendanceDeliveryService.processAndDeliver(
        mockUserId,
        mockPhoneNumber,
        mockSessionData
      );

      expect(result.elapsedMs).toBeDefined();
      expect(typeof result.elapsedMs).toBe('number');
    });
  });

  describe('saveToDatabase', () => {
    it('should calculate summary statistics correctly', async () => {
      const records = [
        { status: 'present' },
        { status: 'present' },
        { status: 'absent' }
      ];

      const sessionData = {
        selectedListId: 'list-1',
        records
      };

      // Mock the insert chain
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null })
      });

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'attendance_sessions') {
          return { insert: mockInsert };
        }
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      });

      await AttendanceDeliveryService.saveToDatabase(
        'user-123',
        sessionData,
        'https://r2.example.com/file.xlsx',
        { sessionType: 'morning' }
      );

      // Verify insert was called with correct counts
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          total_students: 3,
          present_count: 2,
          absent_count: 1
        })
      );
    });
  });
});
