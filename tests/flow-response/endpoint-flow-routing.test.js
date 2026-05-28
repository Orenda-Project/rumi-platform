/**
 * Flow-response handler — endpoint-flow NFM_REPLY routing contract.
 *
 * Before this fix, only 3 flow IDs were routed (READING_ASSESSMENT_FLOW_ID +
 * the two ATTENDANCE_*_FLOW_IDs). The other 8 endpoint flows — Settings,
 * Status, Homework Request, Edit Class, Student Videos, Pic-to-LP Confirm,
 * Quiz Manager, Registration — each landed on the catch-all
 * `'⚠️ Unknown flow ID'` warning log and the function returned `false`,
 * which read like a real routing bug in the field.
 *
 * In reality those flows are data_exchange endpoint flows: their actual
 * submission was persisted by the corresponding `/api/flows/<path>` route
 * BEFORE the NFM_REPLY arrived. The NFM is just a delivery ack.
 *
 * This contract asserts: when a configured endpoint-flow ID arrives, the
 * handler returns true AND emits a structured "endpoint-flow NFM
 * completion" log (so debugging can confirm the round-trip), NOT the
 * unknown-flow warning.
 */

const path = require('path');

jest.mock('../../bot/shared/config/supabase', () => ({}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(),
}));
jest.mock('../../bot/shared/services/reading/passage-generation.service', () => ({}));
jest.mock('../../bot/shared/services/reading/auto-level-orchestrator.service', () => ({}));
jest.mock('../../bot/shared/handlers/attendance-flow.handler', () => ({}));
jest.mock('../../bot/shared/services/attendance-delivery.service', () => ({}));

const mockLogSpy = jest.fn();
jest.mock('../../bot/shared/utils/logger', () => ({
  logToFile: (...args) => mockLogSpy(...args),
}));

const ENDPOINT_FLOWS = {
  SETTINGS_FLOW_ID: { id: '111111', name: 'Settings', endpoint: '/api/flows/settings' },
  STATUS_FLOW_ID: { id: '222222', name: 'Status', endpoint: '/api/flows/status' },
  HOMEWORK_FLOW_ID: { id: '333333', name: 'Homework Request', endpoint: '/api/flows/homework-request' },
  EDIT_CLASS_FLOW_ID: { id: '444444', name: 'Edit Class', endpoint: '/api/flows/edit-class' },
  STUDENT_VIDEOS_FLOW_ID: { id: '555555', name: 'Student Videos', endpoint: '/api/flows/student-videos' },
  PIC_LP_FLOW_ID: { id: '666666', name: 'Pic-to-LP Confirm', endpoint: '/api/flows/pic-lp' },
  QUIZ_FLOW_ID: { id: '777777', name: 'Quiz Manager', endpoint: '/api/flows/quiz' },
  REGISTRATION_FLOW_ID: { id: '888888', name: 'Registration', endpoint: '/api/flows/registration' },
};

function buildFlowMessage(flowId) {
  return {
    interactive: {
      type: 'nfm_reply',
      nfm_reply: {
        name: `flow_${flowId}`,
        response_json: '{"flow_token":"abc"}',
        body: 'Submitted',
      },
    },
  };
}

describe('flow-response handler — endpoint-only flows are recognised, not "unknown"', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    for (const [k, v] of Object.entries(ENDPOINT_FLOWS)) {
      process.env[k] = v.id;
    }
    mockLogSpy.mockClear();
  });

  afterAll(() => { process.env = originalEnv; });

  for (const [envVar, flow] of Object.entries(ENDPOINT_FLOWS)) {
    it(`${flow.name} NFM_REPLY → logs completion, returns true (NOT "unknown flow ID")`, async () => {
      const { handleFlowResponse } = require('../../bot/shared/handlers/flow-response.handler');
      const ok = await handleFlowResponse(buildFlowMessage(flow.id), '923001234567', 'user-uuid');

      expect(ok).toBe(true);

      const completionLogs = mockLogSpy.mock.calls.filter(
        ([msg]) => typeof msg === 'string' && msg.includes('Endpoint-flow NFM completion received')
      );
      expect(completionLogs.length).toBeGreaterThanOrEqual(1);
      const [, payload] = completionLogs[0];
      expect(payload.flowName).toBe(flow.name);
      expect(payload.endpoint).toBe(flow.endpoint);
      expect(payload.flowId).toBe(flow.id);

      const unknownLogs = mockLogSpy.mock.calls.filter(
        ([msg]) => typeof msg === 'string' && msg.includes('Unknown flow ID')
      );
      expect(unknownLogs).toEqual([]);
    });
  }

  it('a flow ID that is unconfigured AND not one of the 8 endpoint flows still falls through to "Unknown flow ID"', async () => {
    const { handleFlowResponse } = require('../../bot/shared/handlers/flow-response.handler');
    const ok = await handleFlowResponse(buildFlowMessage('999999-not-real'), '923001234567', 'user-uuid');

    expect(ok).toBe(false);
    const unknownLogs = mockLogSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('Unknown flow ID')
    );
    expect(unknownLogs.length).toBeGreaterThanOrEqual(1);
  });
});
