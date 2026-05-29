/**
 * flow-response routes the exam-checker confirm-students NFM completion to the
 * exam handler — NOT the "Unknown flow ID" fallthrough (bd-1875).
 *
 * This is the third of the three breaks the exam-checker had: the completion
 * NFM was never routed, so the orchestrator never advanced past
 * CONFIRMING_STUDENTS. The branch now parses response_json and hands the
 * confirmed_students to ExamCheckerHandler.handleExamFlow.
 */

jest.mock('../../bot/shared/config/supabase', () => ({}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: jest.fn() }));
jest.mock('../../bot/shared/services/reading/passage-generation.service', () => ({}));
jest.mock('../../bot/shared/services/reading/auto-level-orchestrator.service', () => ({}));
jest.mock('../../bot/shared/handlers/attendance-flow.handler', () => ({}));
jest.mock('../../bot/shared/services/attendance-delivery.service', () => ({}));

const mockLogSpy = jest.fn();
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: (...a) => mockLogSpy(...a) }));

const mockHandleExamFlow = jest.fn(async () => ({ handled: true }));
jest.mock('../../bot/shared/handlers/exam-checker.handler', () => ({
  handleExamFlow: (...a) => mockHandleExamFlow(...a),
}));

const EXAM_FLOW_ID = '909090';

function buildFlowMessage(flowId, responseJson) {
  return {
    interactive: {
      type: 'nfm_reply',
      nfm_reply: { name: `flow_${flowId}`, response_json: responseJson, body: 'Submitted' },
    },
  };
}

describe('flow-response — exam-confirm NFM routing (bd-1875)', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, EXAM_CHECKER_STUDENTS_FLOW_ID: EXAM_FLOW_ID };
    mockLogSpy.mockClear();
    mockHandleExamFlow.mockClear();
  });
  afterAll(() => { process.env = originalEnv; });

  it('routes the exam-confirm completion to handleExamFlow with parsed confirmed_students', async () => {
    const { handleFlowResponse } = require('../../bot/shared/handlers/flow-response.handler');
    const ok = await handleFlowResponse(
      buildFlowMessage(EXAM_FLOW_ID, '{"flow_token":"sess-1","confirmed_students":["0","2"]}'),
      '923001234567',
      'user-uuid'
    );

    expect(ok).toBe(true);
    expect(mockHandleExamFlow).toHaveBeenCalledTimes(1);
    const [flowId, flowResponse, from, user] = mockHandleExamFlow.mock.calls[0];
    expect(flowId).toBe(EXAM_FLOW_ID);
    expect(flowResponse.confirmed_students).toEqual(['0', '2']);
    expect(from).toBe('923001234567');
    expect(user).toEqual({ id: 'user-uuid' });

    const unknown = mockLogSpy.mock.calls.filter(([m]) => typeof m === 'string' && m.includes('Unknown flow ID'));
    expect(unknown).toEqual([]);
  });

  it('still falls through to "Unknown flow ID" for an unrelated unconfigured flow id', async () => {
    const { handleFlowResponse } = require('../../bot/shared/handlers/flow-response.handler');
    const ok = await handleFlowResponse(buildFlowMessage('not-a-real-flow', '{}'), '923001234567', 'user-uuid');
    expect(ok).toBe(false);
    expect(mockHandleExamFlow).not.toHaveBeenCalled();
    const unknown = mockLogSpy.mock.calls.filter(([m]) => typeof m === 'string' && m.includes('Unknown flow ID'));
    expect(unknown.length).toBeGreaterThanOrEqual(1);
  });
});
