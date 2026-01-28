/**
 * Register All Flows — Test Suite
 *
 * Tests the registerAllFlows module that registers all 3 WhatsApp Flows
 * (Reading Assessment, Attendance Setup, Attendance Marking) with Meta's
 * Graph API.
 *
 * Mocks MetaAPI and SetupState entirely — no real API calls.
 *
 * TDD: This test file was written BEFORE the implementation.
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../bot/scripts/setup/meta-api');
jest.mock('../../bot/scripts/setup/setup-state');

const { MetaAPI } = require('../../bot/scripts/setup/meta-api');
const { SetupState } = require('../../bot/scripts/setup/setup-state');

// We need to mock fs.readFileSync for flow JSON loading
const fs = require('fs');
jest.spyOn(fs, 'readFileSync');

// Import after mocks are set up
const { registerAllFlows, registerFlow, FLOW_CONFIGS } = require('../../bot/scripts/setup/register-all-flows');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_OPTS = {
  wabaId: 'waba_test_123',
  accessToken: 'tok_test_secret',
  phoneNumberId: 'phone_test_456',
  endpointBase: 'https://my-app.railway.app',
  statePath: '/tmp/test-state.json',
};

/** Stub flow JSON content returned by fs.readFileSync */
const STUB_FLOW_JSON = { version: '5.0', screens: [{ id: 'WELCOME' }] };

/** Create a mock MetaAPI instance with all methods stubbed */
function createMockApi() {
  return {
    findFlowByName: jest.fn(),
    createFlow: jest.fn(),
    uploadFlowJson: jest.fn(),
    setFlowEndpoint: jest.fn(),
    publishFlow: jest.fn(),
  };
}

/** Create a mock SetupState instance with all methods stubbed */
function createMockState() {
  return {
    load: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue(undefined),
    setFlow: jest.fn().mockResolvedValue(undefined),
    getFlow: jest.fn().mockReturnValue(null),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('register-all-flows', () => {
  let mockApi;
  let mockState;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApi = createMockApi();
    mockState = createMockState();

    // MetaAPI constructor returns our mock
    MetaAPI.mockImplementation(() => mockApi);

    // SetupState constructor returns our mock
    SetupState.mockImplementation(() => mockState);

    // fs.readFileSync returns stub flow JSON for any flow file
    fs.readFileSync.mockReturnValue(JSON.stringify(STUB_FLOW_JSON));
  });

  // -----------------------------------------------------------------------
  // FLOW_CONFIGS
  // -----------------------------------------------------------------------
  describe('FLOW_CONFIGS', () => {
    it('exports an array of exactly 3 flow configurations', () => {
      expect(Array.isArray(FLOW_CONFIGS)).toBe(true);
      expect(FLOW_CONFIGS).toHaveLength(3);
    });

    it('includes Reading Assessment as a navigate type with no endpointPath', () => {
      const ra = FLOW_CONFIGS.find((f) => f.envVar === 'READING_ASSESSMENT_FLOW_ID');
      expect(ra).toBeDefined();
      expect(ra.type).toBe('navigate');
      expect(ra.endpointPath).toBeUndefined();
      expect(ra.categories).toEqual(['OTHER']);
    });

    it('includes Attendance Setup as an endpoint type', () => {
      const as = FLOW_CONFIGS.find((f) => f.envVar === 'ATTENDANCE_SETUP_FLOW_ID');
      expect(as).toBeDefined();
      expect(as.type).toBe('endpoint');
      expect(as.endpointPath).toBe('/flow/attendance-setup');
      expect(as.categories).toEqual(['OTHER']);
    });

    it('includes Attendance Marking as an endpoint type', () => {
      const am = FLOW_CONFIGS.find((f) => f.envVar === 'ATTENDANCE_MARKING_FLOW_ID');
      expect(am).toBeDefined();
      expect(am.type).toBe('endpoint');
      expect(am.endpointPath).toBe('/flow/attendance-marking');
      expect(am.categories).toEqual(['OTHER']);
    });
  });

  // -----------------------------------------------------------------------
  // registerFlow(api, state, flowConfig, options)
  // -----------------------------------------------------------------------
  describe('registerFlow(api, state, flowConfig, options)', () => {
    const NAVIGATE_CONFIG = {
      name: 'Reading Assessment',
      jsonPath: path.resolve(__dirname, '../../bot/shared/flows/reading-assessment-flow.json'),
      type: 'navigate',
      envVar: 'READING_ASSESSMENT_FLOW_ID',
      categories: ['OTHER'],
    };

    const ENDPOINT_CONFIG = {
      name: 'Attendance Setup',
      jsonPath: path.resolve(__dirname, '../../bot/shared/flows/attendance-setup-flow.json'),
      type: 'endpoint',
      endpointPath: '/flow/attendance-setup',
      envVar: 'ATTENDANCE_SETUP_FLOW_ID',
      categories: ['OTHER'],
    };

    // ----- New flow registration (full pipeline) -----

    it('creates, uploads, and publishes a new navigate flow', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_new_1' } });
      mockApi.uploadFlowJson.mockResolvedValue({ success: true, data: {} });
      mockApi.publishFlow.mockResolvedValue({ success: true, data: {} });

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(mockApi.findFlowByName).toHaveBeenCalledWith('Reading Assessment');
      expect(mockApi.createFlow).toHaveBeenCalledWith('Reading Assessment', ['OTHER']);
      expect(mockApi.uploadFlowJson).toHaveBeenCalledWith('flow_new_1', expect.any(Object));
      expect(mockApi.setFlowEndpoint).not.toHaveBeenCalled();
      expect(mockApi.publishFlow).toHaveBeenCalledWith('flow_new_1');

      expect(result.status).toBe('registered');
      expect(result.flowId).toBe('flow_new_1');
    });

    it('creates, uploads, sets endpoint, and publishes a new endpoint flow', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_ep_1' } });
      mockApi.uploadFlowJson.mockResolvedValue({ success: true, data: {} });
      mockApi.setFlowEndpoint.mockResolvedValue({ success: true, data: {} });
      mockApi.publishFlow.mockResolvedValue({ success: true, data: {} });

      const result = await registerFlow(mockApi, mockState, ENDPOINT_CONFIG, {
        endpointBase: 'https://app.railway.app',
      });

      expect(mockApi.setFlowEndpoint).toHaveBeenCalledWith(
        'flow_ep_1',
        'https://app.railway.app/flow/attendance-setup',
      );
      expect(mockApi.publishFlow).toHaveBeenCalledWith('flow_ep_1');
      expect(result.status).toBe('registered');
      expect(result.flowId).toBe('flow_ep_1');
    });

    it('records flow in state after successful registration', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_state_1' } });
      mockApi.uploadFlowJson.mockResolvedValue({ success: true, data: {} });
      mockApi.publishFlow.mockResolvedValue({ success: true, data: {} });

      await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(mockState.setFlow).toHaveBeenCalledWith(
        'Reading Assessment',
        expect.objectContaining({
          flowId: 'flow_state_1',
          status: 'PUBLISHED',
          envVar: 'READING_ASSESSMENT_FLOW_ID',
          type: 'navigate',
          registeredAt: expect.any(String),
        }),
      );
    });

    // ----- Idempotency (existing flow) -----

    it('skips creation if findFlowByName returns an existing flow', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: true,
        data: { id: 'flow_existing_99', name: 'Reading Assessment' },
      });

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(mockApi.createFlow).not.toHaveBeenCalled();
      expect(mockApi.uploadFlowJson).not.toHaveBeenCalled();
      expect(mockApi.publishFlow).not.toHaveBeenCalled();

      expect(result.status).toBe('skipped');
      expect(result.flowId).toBe('flow_existing_99');
    });

    it('records existing flow in state when skipping', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: true,
        data: { id: 'flow_existing_77', name: 'Reading Assessment' },
      });

      await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(mockState.setFlow).toHaveBeenCalledWith(
        'Reading Assessment',
        expect.objectContaining({
          flowId: 'flow_existing_77',
          status: 'EXISTS',
          envVar: 'READING_ASSESSMENT_FLOW_ID',
        }),
      );
    });

    // ----- Error handling -----

    it('returns error result if findFlowByName fails', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: false,
        error: { message: 'Auth failed' },
      });

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(result.status).toBe('error');
      expect(result.error).toContain('Auth failed');
    });

    it('returns error result if createFlow fails', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({
        success: false,
        error: { message: 'Rate limited' },
      });

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(result.status).toBe('error');
      expect(result.error).toContain('Rate limited');
    });

    it('returns error result if uploadFlowJson fails', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_x' } });
      mockApi.uploadFlowJson.mockResolvedValue({
        success: false,
        error: { message: 'Invalid JSON' },
      });

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid JSON');
      expect(mockApi.publishFlow).not.toHaveBeenCalled();
    });

    it('returns error result if setFlowEndpoint fails for endpoint type', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_ep_x' } });
      mockApi.uploadFlowJson.mockResolvedValue({ success: true, data: {} });
      mockApi.setFlowEndpoint.mockResolvedValue({
        success: false,
        error: { message: 'Invalid endpoint' },
      });

      const result = await registerFlow(mockApi, mockState, ENDPOINT_CONFIG, {
        endpointBase: 'https://app.test',
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid endpoint');
      expect(mockApi.publishFlow).not.toHaveBeenCalled();
    });

    it('returns error result if publishFlow fails', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_pub_x' } });
      mockApi.uploadFlowJson.mockResolvedValue({ success: true, data: {} });
      mockApi.publishFlow.mockResolvedValue({
        success: false,
        error: { message: 'Cannot publish' },
      });

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(result.status).toBe('error');
      expect(result.error).toContain('Cannot publish');
    });

    it('does not call state.setFlow on error', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({
        success: false,
        error: { message: 'Fail' },
      });

      await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(mockState.setFlow).not.toHaveBeenCalled();
    });

    it('catches thrown exceptions and returns error result', async () => {
      mockApi.findFlowByName.mockRejectedValue(new Error('Network down'));

      const result = await registerFlow(mockApi, mockState, NAVIGATE_CONFIG, {});

      expect(result.status).toBe('error');
      expect(result.error).toContain('Network down');
    });
  });

  // -----------------------------------------------------------------------
  // registerAllFlows(options)
  // -----------------------------------------------------------------------
  describe('registerAllFlows(options)', () => {
    beforeEach(() => {
      // Default: all API calls succeed for new flows
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_auto' } });
      mockApi.uploadFlowJson.mockResolvedValue({ success: true, data: {} });
      mockApi.setFlowEndpoint.mockResolvedValue({ success: true, data: {} });
      mockApi.publishFlow.mockResolvedValue({ success: true, data: {} });
    });

    it('returns structured results with registered, skipped, and errors arrays', async () => {
      const result = await registerAllFlows(DEFAULT_OPTS);

      expect(result).toHaveProperty('registered');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.registered)).toBe(true);
      expect(Array.isArray(result.skipped)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('registers all 3 flows when none exist and endpointBase is provided', async () => {
      const result = await registerAllFlows(DEFAULT_OPTS);

      expect(result.registered).toHaveLength(3);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('initializes MetaAPI with correct options', async () => {
      await registerAllFlows(DEFAULT_OPTS);

      expect(MetaAPI).toHaveBeenCalledWith({
        wabaId: 'waba_test_123',
        accessToken: 'tok_test_secret',
        phoneNumberId: 'phone_test_456',
      });
    });

    it('initializes SetupState with statePath option', async () => {
      await registerAllFlows(DEFAULT_OPTS);

      expect(SetupState).toHaveBeenCalledWith('/tmp/test-state.json');
    });

    it('loads state at the beginning', async () => {
      await registerAllFlows(DEFAULT_OPTS);

      expect(mockState.load).toHaveBeenCalledTimes(1);
    });

    // ----- Skipping existing flows -----

    it('skips flows that already exist in Meta', async () => {
      // Reading Assessment exists, others do not
      mockApi.findFlowByName
        .mockResolvedValueOnce({
          success: true,
          data: { id: 'existing_ra', name: 'Reading Assessment' },
        })
        .mockResolvedValue({ success: true, data: null });

      const result = await registerAllFlows(DEFAULT_OPTS);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].name).toBe('Reading Assessment');
      expect(result.registered).toHaveLength(2);
    });

    it('skips all flows when all already exist', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: true,
        data: { id: 'existing_all', name: 'SomeFlow' },
      });

      const result = await registerAllFlows(DEFAULT_OPTS);

      expect(result.skipped).toHaveLength(3);
      expect(result.registered).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    // ----- Endpoint handling -----

    it('does not call setFlowEndpoint for navigate-type flows', async () => {
      // Only the first call (Reading Assessment) should NOT call setFlowEndpoint
      mockApi.createFlow
        .mockResolvedValueOnce({ success: true, data: { id: 'flow_nav' } })
        .mockResolvedValue({ success: true, data: { id: 'flow_ep' } });

      await registerAllFlows(DEFAULT_OPTS);

      // Check calls to setFlowEndpoint — should be called for attendance flows only
      const endpointCalls = mockApi.setFlowEndpoint.mock.calls;
      const endpointFlowIds = endpointCalls.map((c) => c[0]);

      // Navigate flow ID should NOT be in endpoint calls
      expect(endpointFlowIds).not.toContain('flow_nav');
    });

    it('skips attendance flows (endpoint type) when endpointBase is not provided', async () => {
      const optsNoEndpoint = { ...DEFAULT_OPTS };
      delete optsNoEndpoint.endpointBase;

      const result = await registerAllFlows(optsNoEndpoint);

      // Reading Assessment should register, attendance flows should be skipped
      expect(result.registered).toHaveLength(1);
      expect(result.registered[0].name).toBe('Reading Assessment');
      expect(result.skipped).toHaveLength(2);
      expect(result.skipped.map((s) => s.name)).toContain('Attendance Setup');
      expect(result.skipped.map((s) => s.name)).toContain('Attendance Marking');
    });

    it('includes reason when skipping endpoint flows due to missing endpointBase', async () => {
      const optsNoEndpoint = { ...DEFAULT_OPTS };
      delete optsNoEndpoint.endpointBase;

      const result = await registerAllFlows(optsNoEndpoint);

      const skippedAttendance = result.skipped.find((s) => s.name === 'Attendance Setup');
      expect(skippedAttendance.reason).toMatch(/endpointBase/i);
    });

    // ----- Error handling across multiple flows -----

    it('continues processing remaining flows when one fails', async () => {
      // First flow (Reading Assessment) fails, rest succeed
      mockApi.findFlowByName
        .mockResolvedValueOnce({
          success: false,
          error: { message: 'Temporary error' },
        })
        .mockResolvedValue({ success: true, data: null });

      const result = await registerAllFlows(DEFAULT_OPTS);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].name).toBe('Reading Assessment');
      expect(result.registered).toHaveLength(2);
    });

    it('collects errors with flow name and error message', async () => {
      mockApi.findFlowByName.mockResolvedValue({ success: true, data: null });
      mockApi.createFlow.mockResolvedValue({
        success: false,
        error: { message: 'Permission denied' },
      });

      const result = await registerAllFlows(DEFAULT_OPTS);

      expect(result.errors).toHaveLength(3);
      for (const err of result.errors) {
        expect(err).toHaveProperty('name');
        expect(err).toHaveProperty('error');
        expect(err.error).toContain('Permission denied');
      }
    });

    // ----- State tracking -----

    it('calls state.setFlow for each successfully registered flow', async () => {
      await registerAllFlows(DEFAULT_OPTS);

      expect(mockState.setFlow).toHaveBeenCalledTimes(3);
    });

    it('calls state.setFlow for skipped (existing) flows too', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: true,
        data: { id: 'existing_id', name: 'X' },
      });

      await registerAllFlows(DEFAULT_OPTS);

      expect(mockState.setFlow).toHaveBeenCalledTimes(3);
    });

    it('does not call state.setFlow for errored flows', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: false,
        error: { message: 'Fail all' },
      });

      await registerAllFlows(DEFAULT_OPTS);

      expect(mockState.setFlow).not.toHaveBeenCalled();
    });

    // ----- SetupState defaults -----

    it('uses default statePath when not provided', async () => {
      const optsNoState = { ...DEFAULT_OPTS };
      delete optsNoState.statePath;

      await registerAllFlows(optsNoState);

      // SetupState should be called with undefined (uses its own default)
      expect(SetupState).toHaveBeenCalledWith(undefined);
    });

    // ----- Result structure detail -----

    it('includes flowId, name, and envVar in registered results', async () => {
      mockApi.createFlow.mockResolvedValue({ success: true, data: { id: 'flow_detail_1' } });

      const result = await registerAllFlows(DEFAULT_OPTS);

      for (const reg of result.registered) {
        expect(reg).toHaveProperty('flowId');
        expect(reg).toHaveProperty('name');
        expect(reg).toHaveProperty('envVar');
      }
    });

    it('includes flowId and name in skipped results', async () => {
      mockApi.findFlowByName.mockResolvedValue({
        success: true,
        data: { id: 'existing_detail', name: 'X' },
      });

      const result = await registerAllFlows(DEFAULT_OPTS);

      for (const skip of result.skipped) {
        expect(skip).toHaveProperty('flowId');
        expect(skip).toHaveProperty('name');
      }
    });
  });
});
