/**
 * Attendance Conversation Service Tests
 * TDD for bd-059
 *
 * Created: January 24, 2026
 * Bead: bd-059
 */

// Mock dependencies
// Note: The service uses redisService.set(key, value, ttl) and redisService.delete(key)
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
};

const mockStudentListService = {
  getStudentListsByUser: jest.fn(),
  getStudentsByList: jest.fn(),
  getStudentListById: jest.fn()
};

jest.mock('../../shared/services/cache/railway-redis.service', () => mockRedis);
jest.mock('../../shared/services/student-list.service', () => mockStudentListService);
jest.mock('../../shared/utils/logger', () => ({
  logToFile: jest.fn()
}));

const AttendanceConversationService = require('../../shared/services/attendance-conversation.service');

describe('AttendanceConversationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constants', () => {
    it('should export state constants', () => {
      expect(AttendanceConversationService.STATES.IDLE).toBe('IDLE');
      expect(AttendanceConversationService.STATES.AWAITING_CLASS_SELECTION).toBe('AWAITING_CLASS_SELECTION');
      expect(AttendanceConversationService.STATES.AWAITING_MARKING_METHOD).toBe('AWAITING_MARKING_METHOD');
      expect(AttendanceConversationService.STATES.AWAITING_VOICE_INPUT).toBe('AWAITING_VOICE_INPUT');
      expect(AttendanceConversationService.STATES.AWAITING_VERIFICATION).toBe('AWAITING_VERIFICATION');
      expect(AttendanceConversationService.STATES.PROCESSING).toBe('PROCESSING');
      expect(AttendanceConversationService.STATES.COMPLETED).toBe('COMPLETED');
    });
  });

  describe('getRedisKey', () => {
    it('should generate correct Redis key format', () => {
      const key = AttendanceConversationService.getRedisKey('user-123');
      expect(key).toBe('attendance:session:user-123');
    });
  });

  describe('getSessionState', () => {
    it('should return null when no session exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const state = await AttendanceConversationService.getSessionState('user-123');

      expect(state).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('attendance:session:user-123');
    });

    it('should return parsed session state when exists', async () => {
      const sessionData = {
        state: 'AWAITING_CLASS_SELECTION',
        userId: 'user-123',
        classList: [{ id: 'list-1', className: 'Grade 4' }]
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));

      const state = await AttendanceConversationService.getSessionState('user-123');

      expect(state).toEqual(sessionData);
    });
  });

  describe('saveSessionState', () => {
    it('should save session state to Redis with TTL', async () => {
      const sessionData = {
        state: 'AWAITING_MARKING_METHOD',
        userId: 'user-123',
        selectedListId: 'list-1'
      };

      await AttendanceConversationService.saveSessionState('user-123', sessionData);

      // redisService.set takes key, data, ttl (3rd arg)
      expect(mockRedis.set).toHaveBeenCalledWith(
        'attendance:session:user-123',
        sessionData,
        3600 // 1 hour TTL
      );
    });
  });

  describe('clearSessionState', () => {
    it('should delete session from Redis', async () => {
      await AttendanceConversationService.clearSessionState('user-123');

      // redisService.delete (not del)
      expect(mockRedis.delete).toHaveBeenCalledWith('attendance:session:user-123');
    });
  });

  describe('startAttendanceSession', () => {
    it('should return setup flow action when user has no classes', async () => {
      mockStudentListService.getStudentListsByUser.mockResolvedValue({ data: [], error: null });

      const result = await AttendanceConversationService.startAttendanceSession('user-123');

      expect(result.action).toBe('SEND_SETUP_FLOW');
      expect(result.message).toContain('set up');
    });

    it('should proceed directly when user has one class', async () => {
      const classList = [{ id: 'list-1', class_name: 'Grade 4', section: 'B' }];
      mockStudentListService.getStudentListsByUser.mockResolvedValue({ data: classList, error: null });
      mockRedis.set.mockResolvedValue('OK');
      // TTL is passed as 3rd arg to set(), no separate expire call

      const result = await AttendanceConversationService.startAttendanceSession('user-123');

      expect(result.action).toBe('ASK_MARKING_METHOD');
      expect(result.selectedClass).toEqual(classList[0]);
      expect(result.message).toContain('Grade 4 - B');
    });

    it('should ask for class selection when user has multiple classes', async () => {
      const classList = [
        { id: 'list-1', class_name: 'Grade 4', section: 'A' },
        { id: 'list-2', class_name: 'Grade 5', section: null }
      ];
      mockStudentListService.getStudentListsByUser.mockResolvedValue({ data: classList, error: null });
      mockRedis.set.mockResolvedValue('OK');
      // TTL is passed as 3rd arg to set(), no separate expire call

      const result = await AttendanceConversationService.startAttendanceSession('user-123');

      expect(result.action).toBe('ASK_CLASS_SELECTION');
      expect(result.classes).toHaveLength(2);
      expect(result.message).toContain('1');
      expect(result.message).toContain('2');
    });
  });

  describe('handleClassSelection', () => {
    it('should transition to AWAITING_MARKING_METHOD on valid selection', async () => {
      const sessionState = {
        state: 'AWAITING_CLASS_SELECTION',
        userId: 'user-123',
        classList: [
          { id: 'list-1', class_name: 'Grade 4', section: 'A' },
          { id: 'list-2', class_name: 'Grade 5', section: null }
        ]
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionState));
      mockRedis.set.mockResolvedValue('OK');
      // TTL is passed as 3rd arg to set(), no separate expire call

      const result = await AttendanceConversationService.handleClassSelection('user-123', '1');

      expect(result.action).toBe('ASK_MARKING_METHOD');
      expect(result.selectedClass.id).toBe('list-1');
    });

    it('should reject invalid selection number', async () => {
      const sessionState = {
        state: 'AWAITING_CLASS_SELECTION',
        userId: 'user-123',
        classList: [
          { id: 'list-1', class_name: 'Grade 4', section: 'A' }
        ]
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionState));

      const result = await AttendanceConversationService.handleClassSelection('user-123', '5');

      expect(result.action).toBe('INVALID_SELECTION');
      expect(result.message).toContain('valid');
    });

    it('should handle text-based class name selection', async () => {
      const sessionState = {
        state: 'AWAITING_CLASS_SELECTION',
        userId: 'user-123',
        classList: [
          { id: 'list-1', class_name: 'Grade 4', section: 'A' },
          { id: 'list-2', class_name: 'Grade 5', section: null }
        ]
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionState));
      mockRedis.set.mockResolvedValue('OK');
      // TTL is passed as 3rd arg to set(), no separate expire call

      const result = await AttendanceConversationService.handleClassSelection('user-123', 'grade 5');

      expect(result.action).toBe('ASK_MARKING_METHOD');
      expect(result.selectedClass.id).toBe('list-2');
    });
  });

  describe('handleMarkingMethodSelection', () => {
    beforeEach(() => {
      const sessionState = {
        state: 'AWAITING_MARKING_METHOD',
        userId: 'user-123',
        selectedListId: 'list-1',
        selectedClass: { id: 'list-1', class_name: 'Grade 4', section: 'A' }
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionState));
      mockRedis.set.mockResolvedValue('OK');
      // TTL is passed as 3rd arg to set(), no separate expire call
    });

    it('should transition to AWAITING_VOICE_INPUT for voice option', async () => {
      const result = await AttendanceConversationService.handleMarkingMethodSelection('user-123', 'voice');

      expect(result.action).toBe('AWAIT_VOICE_INPUT');
      expect(result.message).toContain('voice');
    });

    it('should transition to send marking flow for tap option', async () => {
      mockStudentListService.getStudentsByList.mockResolvedValue({
        data: [
          { id: 'student-1', student_name: 'Zara', roll_number: 1 },
          { id: 'student-2', student_name: 'Ahmed', roll_number: 2 }
        ],
        error: null
      });

      const result = await AttendanceConversationService.handleMarkingMethodSelection('user-123', 'tap');

      expect(result.action).toBe('SEND_MARKING_FLOW');
      expect(result.students).toHaveLength(2);
    });

    it('should recognize Urdu keywords for voice', async () => {
      const result = await AttendanceConversationService.handleMarkingMethodSelection('user-123', 'آواز');

      expect(result.action).toBe('AWAIT_VOICE_INPUT');
    });

    it('should recognize numeric selection (1 for voice, 2 for tap)', async () => {
      const result = await AttendanceConversationService.handleMarkingMethodSelection('user-123', '1');

      expect(result.action).toBe('AWAIT_VOICE_INPUT');
    });
  });

  describe('formatClassDisplayName', () => {
    it('should format class name with section', () => {
      const classData = { class_name: 'Grade 4', section: 'B' };
      const result = AttendanceConversationService.formatClassDisplayName(classData);
      expect(result).toBe('Grade 4 - B');
    });

    it('should format class name without section', () => {
      const classData = { class_name: 'Grade 4', section: null };
      const result = AttendanceConversationService.formatClassDisplayName(classData);
      expect(result).toBe('Grade 4');
    });

    it('should handle empty section string', () => {
      const classData = { class_name: 'Grade 4', section: '' };
      const result = AttendanceConversationService.formatClassDisplayName(classData);
      expect(result).toBe('Grade 4');
    });
  });

  describe('generateClassSelectionMessage', () => {
    it('should generate numbered list of classes', () => {
      const classes = [
        { class_name: 'Grade 4', section: 'A' },
        { class_name: 'Grade 5', section: null }
      ];

      const message = AttendanceConversationService.generateClassSelectionMessage(classes);

      expect(message).toContain('1. Grade 4 - A');
      expect(message).toContain('2. Grade 5');
      expect(message).toContain('reply with the number');
    });
  });

  describe('generateMarkingMethodMessage', () => {
    it('should include both options', () => {
      const classData = { class_name: 'Grade 4', section: 'B' };

      const message = AttendanceConversationService.generateMarkingMethodMessage(classData);

      expect(message).toContain('Grade 4 - B');
      expect(message).toContain('1');
      expect(message).toContain('Voice');
      expect(message).toContain('2');
      expect(message).toContain('Tap');
    });
  });

  describe('isInAttendanceSession', () => {
    it('should return true when session exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ state: 'AWAITING_CLASS_SELECTION' }));

      const result = await AttendanceConversationService.isInAttendanceSession('user-123');

      expect(result).toBe(true);
    });

    it('should return false when no session exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await AttendanceConversationService.isInAttendanceSession('user-123');

      expect(result).toBe(false);
    });
  });

  describe('cancelSession', () => {
    it('should clear session and return confirmation', async () => {
      mockRedis.delete.mockResolvedValue(true);

      const result = await AttendanceConversationService.cancelSession('user-123');

      expect(result.action).toBe('SESSION_CANCELLED');
      expect(mockRedis.delete).toHaveBeenCalled();
    });
  });

  describe('handleEveryonePresent', () => {
    it('should transition directly to processing when confirmed', async () => {
      const sessionState = {
        state: 'AWAITING_MARKING_METHOD',
        userId: 'user-123',
        selectedListId: 'list-1',
        selectedClass: { id: 'list-1', class_name: 'Grade 4', section: 'A' }
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionState));
      mockRedis.set.mockResolvedValue('OK');
      // TTL is passed as 3rd arg to set(), no separate expire call
      mockStudentListService.getStudentsByList.mockResolvedValue({
        data: [
          { id: 'student-1', student_name: 'Zara' },
          { id: 'student-2', student_name: 'Ahmed' }
        ],
        error: null
      });

      const result = await AttendanceConversationService.handleEveryonePresent('user-123');

      expect(result.action).toBe('GENERATE_ATTENDANCE');
      expect(result.records.every(r => r.status === 'present')).toBe(true);
    });
  });

  describe('State validation', () => {
    it('should reject handleClassSelection when not in AWAITING_CLASS_SELECTION state', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ state: 'IDLE' }));

      const result = await AttendanceConversationService.handleClassSelection('user-123', '1');

      expect(result.action).toBe('INVALID_STATE');
    });

    it('should reject handleMarkingMethodSelection when not in AWAITING_MARKING_METHOD state', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ state: 'IDLE' }));

      const result = await AttendanceConversationService.handleMarkingMethodSelection('user-123', 'voice');

      expect(result.action).toBe('INVALID_STATE');
    });
  });
});
