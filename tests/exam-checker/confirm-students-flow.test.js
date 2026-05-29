/**
 * Exam-checker "confirm students" Flow (bd-1875) — end-to-end wiring.
 *
 * Before this fix the feature was dead at the first interactive step (three
 * stacked breaks: a nonexistent sendFlowMessage method, an unregistered Flow
 * asset, and an unrouted NFM completion). These tests lock the three seams of
 * the rebuilt data_exchange Flow:
 *   1. endpoint INIT serves the session's detected students;
 *   2. endpoint data_exchange echoes the selected ids in the completion payload;
 *   3. the orchestrator maps those id-strings back to detected-student objects.
 * (The flow-response routing seam is covered by flow-config-conformance +
 * the endpoint mount; the NFM parse → handleExamFlow path is exercised in
 * tests/flow-response/.)
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/flow-encryption.service', () => ({
  createErrorResponse: (msg) => ({ error: msg }),
  handlePing: () => ({ data: { status: 'active' } }),
}));

// Session store the endpoint + orchestrator read through.
const mockSession = { current: null };
jest.mock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
  getById: jest.fn(async () => mockSession.current),
  update: jest.fn(async () => mockSession.current),
  updateStatus: jest.fn(async () => mockSession.current),
}));

const {
  handleExamConfirmInit,
  handleExamConfirmDataExchange,
} = require('../../bot/shared/routes/exam-confirm-endpoint');

const DETECTED = [
  { name: 'Ayesha Khan', pageNumbers: [1], confidence: 0.9 },
  { name: 'Bilal Ahmed', pageNumbers: [2], confidence: 0.8 },
  { name: 'Fatima Noor', pageNumbers: [3], confidence: 0.7 },
];

describe('exam-confirm endpoint', () => {
  beforeEach(() => { mockSession.current = { id: 'sess-1', detected_students: DETECTED }; });

  it('INIT renders the CONFIRM_STUDENTS screen from the session detected_students', async () => {
    const res = await handleExamConfirmInit('sess-1');
    expect(res.screen).toBe('CONFIRM_STUDENTS');
    expect(res.data.students).toHaveLength(3);
    expect(res.data.students[0]).toEqual({ id: '0', title: '1. Ayesha Khan' });
    expect(res.data.heading).toMatch(/3 students/);
  });

  it('INIT errors cleanly when the session is gone', async () => {
    mockSession.current = null;
    const res = await handleExamConfirmInit('missing');
    expect(res.error).toMatch(/not found|expired/i);
  });

  it('data_exchange echoes the selected ids as a string array in the completion payload', async () => {
    const res = await handleExamConfirmDataExchange('sess-1', 'CONFIRM_STUDENTS', { confirmed_students: ['0', '2'] });
    expect(res.screen).toBe('SUCCESS');
    const params = res.data.extension_message_response.params;
    expect(params.confirmed_students).toEqual(['0', '2']);
    expect(params.flow_token).toBe('sess-1');
  });
});

describe('orchestrator.handleStudentConfirmation — id→object mapping', () => {
  beforeEach(() => { jest.resetModules(); });

  it('maps the confirmed id-strings back to the detected-student objects', async () => {
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const updates = [];
    jest.doMock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
      update: jest.fn(async (id, patch) => { updates.push(patch); }),
      updateStatus: jest.fn(async () => {}),
    }));
    // Stop the chain at question detection — we only assert the mapping.
    const Orchestrator = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator').ExamCheckerOrchestrator
      || require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');
    const orch = Orchestrator.ExamCheckerOrchestrator || Orchestrator;
    orch.handleQuestionDetection = jest.fn(async () => ({ text: 'questions next' }));

    const session = { id: 'sess-1', detected_students: DETECTED };
    const message = { type: 'flow', flowResponse: { confirmed_students: ['0', '2'] } };
    await orch.handleStudentConfirmation(session, message, 'user-1');

    const confirmedPatch = updates.find((u) => u.confirmed_students);
    expect(confirmedPatch).toBeDefined();
    expect(confirmedPatch.confirmed_students.map((s) => s.name)).toEqual(['Ayesha Khan', 'Fatima Noor']);
  });

  it('falls back to all detected students when the payload resolves to nothing', async () => {
    jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const updates = [];
    jest.doMock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
      update: jest.fn(async (id, patch) => { updates.push(patch); }),
      updateStatus: jest.fn(async () => {}),
    }));
    const mod = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');
    const orch = mod.ExamCheckerOrchestrator || mod;
    orch.handleQuestionDetection = jest.fn(async () => ({ text: 'questions next' }));

    const session = { id: 'sess-1', detected_students: DETECTED };
    const message = { type: 'flow', flowResponse: { confirmed_students: [] } };
    await orch.handleStudentConfirmation(session, message, 'user-1');

    const confirmedPatch = updates.find((u) => u.confirmed_students);
    expect(confirmedPatch.confirmed_students).toHaveLength(3);
  });
});
