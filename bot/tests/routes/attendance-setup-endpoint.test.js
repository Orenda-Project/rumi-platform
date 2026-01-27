/**
 * Attendance Setup Endpoint Tests
 * TDD for bd-215: Student entry redesign with endpoint-based navigation loops
 *
 * Created: January 26, 2026
 * Bead: bd-215
 */

// Create chainable mock that tracks calls
const createChainableMock = () => {
  const mock = {
    from: jest.fn(),
    insert: jest.fn(),
    select: jest.fn(),
    single: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    // Reset mocks and set up chaining
    _setupChain: function() {
      this.from.mockReturnValue(this);
      this.insert.mockReturnValue(this);
      this.select.mockReturnValue(this);
      this.eq.mockReturnValue(this);
      this.order.mockReturnValue(this);
      return this;
    }
  };
  return mock._setupChain();
};

const mockSupabase = createChainableMock();

jest.mock('../../shared/config/supabase', () => mockSupabase);
jest.mock('../../shared/utils/logger', () => ({
  logToFile: jest.fn()
}));

// Mock StudentListService
const mockStudentListService = {
  createStudentList: jest.fn()
};
jest.mock('../../shared/services/student-list.service', () => mockStudentListService);

// Import after mocks
const {
  handleSetupInit,
  handleSetupDataExchange,
  handleAddStudentAction,
  handleDoneAction,
  getStudentListSummary
} = require('../../shared/routes/attendance-setup-endpoint');

describe('Attendance Setup Endpoint (bd-215)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase._setupChain();
  });

  describe('handleSetupInit', () => {
    it('should return CLASS_INFO screen on INIT', async () => {
      const result = await handleSetupInit('user-123');

      // Per Meta docs: no version field in response
      expect(result.version).toBeUndefined();
      expect(result.screen).toBe('CLASS_INFO');
      expect(result.data).toBeDefined();
    });

    it('should return empty data (frequency options are inline in Flow JSON)', async () => {
      const result = await handleSetupInit('user-123');

      // Frequency options are now defined inline in the Flow JSON
      // No dynamic data needed from endpoint for CLASS_INFO screen
      expect(result.data).toEqual({});
    });
  });

  describe('handleSetupDataExchange - CLASS_INFO screen', () => {
    it('should create class and navigate to ADD_STUDENT on CLASS_INFO submit', async () => {
      // Mock successful class creation via StudentListService
      mockStudentListService.createStudentList.mockResolvedValueOnce({
        data: { id: 'list-123', class_name: '5', section: 'A' },
        error: null
      });

      const screenData = {
        class_name: '5',
        section: 'A',
        attendance_frequency: 'once'
      };

      const result = await handleSetupDataExchange(
        'user-123',
        'CLASS_INFO',
        screenData
      );

      expect(result.version).toBeUndefined();
      expect(result.screen).toBe('ADD_STUDENT');
      expect(result.data.list_id).toBe('list-123');
      expect(result.data.class_display).toBe('5 - A');
      expect(result.data.student_count).toBe(0);
      expect(result.data.students_added).toEqual([]);
    });

    it('should handle class creation without section', async () => {
      mockStudentListService.createStudentList.mockResolvedValueOnce({
        data: { id: 'list-456', class_name: '4', section: null },
        error: null
      });

      const screenData = {
        class_name: '4',
        section: '',
        attendance_frequency: 'twice'
      };

      const result = await handleSetupDataExchange(
        'user-123',
        'CLASS_INFO',
        screenData
      );

      expect(result.data.class_display).toBe('4');
    });

    it('should return error on class creation failure', async () => {
      mockStudentListService.createStudentList.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      const screenData = {
        class_name: '5',
        attendance_frequency: 'once'
      };

      const result = await handleSetupDataExchange(
        'user-123',
        'CLASS_INFO',
        screenData
      );

      expect(result.data.error).toBeDefined();
    });
  });

  describe('handleAddStudentAction', () => {
    it('should add student and navigate back to ADD_STUDENT', async () => {
      // Mock get existing roll numbers (empty first)
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      });

      // Mock successful student insertion
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'student-1', student_name: 'Zara Abdul', father_name: 'Abdul', roll_number: 1 },
        error: null
      });

      // Mock get all students after insert
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          { id: 'student-1', student_name: 'Zara Abdul', father_name: 'Abdul', roll_number: 1 }
        ],
        error: null
      });

      const result = await handleAddStudentAction(
        'list-123',
        { first_name: 'Zara', last_name: 'Abdul' },
        '5 - A'
      );

      expect(result.version).toBeUndefined();
      expect(result.screen).toBe('ADD_STUDENT');
      expect(result.data.student_count).toBe(1);
      expect(result.data.students_added).toContainEqual(
        expect.objectContaining({ name: '1. Zara Abdul' })
      );
    });

    it('should increment student count on each add', async () => {
      // Mock get existing roll numbers (1 existing student)
      mockSupabase.order.mockResolvedValueOnce({
        data: [{ roll_number: 1 }],
        error: null
      });

      // Mock successful insertion
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'student-2', student_name: 'Ahmed Khan', father_name: 'Khan', roll_number: 2 },
        error: null
      });

      // Mock get all students after insert
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          { id: 'student-1', student_name: 'Zara Abdul', father_name: 'Abdul', roll_number: 1 },
          { id: 'student-2', student_name: 'Ahmed Khan', father_name: 'Khan', roll_number: 2 }
        ],
        error: null
      });

      const result = await handleAddStudentAction(
        'list-123',
        { first_name: 'Ahmed', last_name: 'Khan' },
        '5 - A'
      );

      expect(result.data.student_count).toBe(2);
      expect(result.data.students_added).toHaveLength(2);
    });

    it('should handle student without father name', async () => {
      // Mock get existing roll numbers
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      });

      // Mock successful insertion
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'student-1', student_name: 'Fatima', father_name: null, roll_number: 1 },
        error: null
      });

      // Mock get all students
      mockSupabase.order.mockResolvedValueOnce({
        data: [{ id: 'student-1', student_name: 'Fatima', father_name: null, roll_number: 1 }],
        error: null
      });

      const result = await handleAddStudentAction(
        'list-123',
        { first_name: 'Fatima', last_name: '' },
        '5'
      );

      expect(result.data.students_added[0].name).toBe('1. Fatima');
    });

    it('should validate first name is required', async () => {
      const result = await handleAddStudentAction(
        'list-123',
        { first_name: '', last_name: 'Khan' },
        '5'
      );

      expect(result.data.error).toBeDefined();
      expect(result.data.error.message).toContain('name');
    });
  });

  describe('handleDoneAction', () => {
    it('should complete flow and return success screen', async () => {
      // Mock get students
      mockSupabase.order.mockResolvedValueOnce({
        data: [
          { id: 'student-1', student_name: 'Zara', roll_number: 1 },
          { id: 'student-2', student_name: 'Ahmed', roll_number: 2 }
        ],
        error: null
      });

      const result = await handleDoneAction('list-123', '5 - A');

      expect(result.version).toBeUndefined();
      expect(result.screen).toBe('SUCCESS');
      expect(result.data.extension_message_response).toBeDefined();
      expect(result.data.extension_message_response.params.list_id).toBe('list-123');
      expect(result.data.extension_message_response.params.student_count).toBe(2);
    });

    it('should prevent completion with zero students', async () => {
      mockSupabase.order.mockResolvedValueOnce({
        data: [],
        error: null
      });

      const result = await handleDoneAction('list-123', '5');

      expect(result.screen).toBe('ADD_STUDENT');
      expect(result.data.error).toBeDefined();
      expect(result.data.error.message).toContain('at least one');
    });
  });

  describe('getStudentListSummary', () => {
    it('should format student list for display', () => {
      const students = [
        { student_name: 'Zara', father_name: 'Abdul', roll_number: 1 },
        { student_name: 'Ahmed', father_name: 'Khan', roll_number: 2 },
        { student_name: 'Fatima', father_name: null, roll_number: 3 }
      ];

      const summary = getStudentListSummary(students);

      expect(summary).toHaveLength(3);
      expect(summary[0].name).toBe('1. Zara Abdul');
      expect(summary[1].name).toBe('2. Ahmed Khan');
      expect(summary[2].name).toBe('3. Fatima');
    });

    it('should handle empty student list', () => {
      const summary = getStudentListSummary([]);
      expect(summary).toEqual([]);
    });
  });
});
