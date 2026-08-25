/**
 * attendance-marking-endpoint.js — the Slack/Discord modal-workaround
 * counterpart to the WhatsApp attendance-marking Flow. Unlike
 * attendance-setup-endpoint.js (only exercised indirectly via
 * slack-flow-registry.test.js), this one has real branching logic (session
 * lookup, absent/present record building) worth testing directly rather
 * than only through a mock at the registry layer.
 */

const mockConversationService = {
  getSessionState: jest.fn(),
  formatClassDisplayName: jest.fn((cls) => (cls?.section ? `${cls.class_name} - ${cls.section}` : cls?.class_name)),
};
jest.mock('../../bot/shared/services/attendance-conversation.service', () => mockConversationService);
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const endpoint = require('../../bot/shared/routes/attendance-marking-endpoint');

describe('handleMarkingInit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns MARK_ABSENT with the roster from the existing tap-to-mark session', async () => {
    mockConversationService.getSessionState.mockResolvedValue({
      selectedClass: { class_name: 'Grade 3', section: 'A' },
      students: [
        { id: 's1', student_name: 'Zara Abdul' },
        { id: 's2', student_name: 'Ahmed Khan' },
      ],
    });

    const result = await endpoint.handleMarkingInit('u1');

    expect(result.screen).toBe('MARK_ABSENT');
    expect(result.data.class_display).toBe('Grade 3 - A');
    expect(result.data.students).toEqual([
      { id: 's1', title: 'Zara Abdul' },
      { id: 's2', title: 'Ahmed Khan' },
    ]);
  });

  it('returns an error when no session exists (modal opened stale/out of order)', async () => {
    mockConversationService.getSessionState.mockResolvedValue(null);
    const result = await endpoint.handleMarkingInit('u1');
    expect(result.data.error.message).toMatch(/no attendance session/i);
  });

  it('returns an error when the session has no roster yet', async () => {
    mockConversationService.getSessionState.mockResolvedValue({ selectedClass: {}, students: [] });
    const result = await endpoint.handleMarkingInit('u1');
    expect(result.data.error).toBeTruthy();
  });
});

describe('handleMarkingExchange', () => {
  beforeEach(() => jest.clearAllMocks());

  const sessionState = {
    selectedClass: { class_name: 'Grade 3', section: 'A' },
    selectedListId: 'list-1',
    selectedDate: '2026-08-25',
    sessionType: 'morning',
    students: [
      { id: 's1', student_name: 'Zara Abdul', father_name: null, roll_number: 1 },
      { id: 's2', student_name: 'Ahmed Khan', father_name: null, roll_number: 2 },
    ],
  };

  it('marks checked students absent and everyone else present', async () => {
    mockConversationService.getSessionState.mockResolvedValue(sessionState);

    const result = await endpoint.handleMarkingExchange('u1', 'MARK_ABSENT', { absent_student_ids: ['s2'] });

    expect(result.screen).toBe('SUCCESS');
    expect(result.data.records).toEqual([
      expect.objectContaining({ studentId: 's1', status: 'present' }),
      expect.objectContaining({ studentId: 's2', status: 'absent' }),
    ]);
    expect(result.data.stats).toEqual({ total: 2, present: 1, absent: 1, attendanceRate: '50.00%' });
    expect(result.data.success_message).toContain('Grade 3 - A');
    expect(result.data.selectedListId).toBe('list-1');
  });

  it('treats an empty absent list as everyone present', async () => {
    mockConversationService.getSessionState.mockResolvedValue(sessionState);
    const result = await endpoint.handleMarkingExchange('u1', 'MARK_ABSENT', { absent_student_ids: [] });
    expect(result.data.stats).toEqual({ total: 2, present: 2, absent: 0, attendanceRate: '100%' });
  });

  it('rejects an unknown screen', async () => {
    const result = await endpoint.handleMarkingExchange('u1', 'NOT_A_SCREEN', {});
    expect(result.data.error).toBeTruthy();
  });

  it('errors when the session expired between opening the modal and submitting it', async () => {
    mockConversationService.getSessionState.mockResolvedValue(null);
    const result = await endpoint.handleMarkingExchange('u1', 'MARK_ABSENT', { absent_student_ids: [] });
    expect(result.data.error.message).toMatch(/session expired/i);
  });
});
