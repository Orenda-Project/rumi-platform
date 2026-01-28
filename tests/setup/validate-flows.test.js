/**
 * Tests for validate-flows — pre-flight check that verifies all flows
 * and templates exist and are in the correct state.
 *
 * TDD: This test file was written BEFORE the implementation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// We need to mock MetaAPI before requiring the module under test
jest.mock('../../bot/scripts/setup/meta-api');

const { SetupState } = require('../../bot/scripts/setup/setup-state');
const { MetaAPI } = require('../../bot/scripts/setup/meta-api');
const { validateSetup } = require('../../bot/scripts/setup/validate-flows');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a complete, valid state object with all 3 flows + encryption */
function buildCompleteState(overrides = {}) {
  const now = new Date().toISOString();
  return {
    version: '2.0.0',
    createdAt: now,
    updatedAt: now,
    encryption: { configured: true, publicKeyHash: 'sha256_abc', registeredAt: now },
    flows: {
      registration: {
        flowId: 'flow_reg_1',
        status: 'PUBLISHED',
        envVar: 'REGISTRATION_FLOW_ID',
        type: 'registration',
        endpointPath: '/webhook/flow/registration',
        registeredAt: now,
      },
      feedback: {
        flowId: 'flow_fb_2',
        status: 'PUBLISHED',
        envVar: 'FEEDBACK_FLOW_ID',
        type: 'feedback',
        endpointPath: '/webhook/flow/feedback',
        registeredAt: now,
      },
      lesson_plan: {
        flowId: 'flow_lp_3',
        status: 'PUBLISHED',
        envVar: 'LESSON_PLAN_FLOW_ID',
        type: 'lesson_plan',
        endpointPath: '/webhook/flow/lesson_plan',
        registeredAt: now,
      },
    },
    templates: {
      welcome_message: { templateId: 'tpl_1', status: 'APPROVED', registeredAt: now },
      video_style_selection: { templateId: 'tpl_2', status: 'APPROVED', registeredAt: now },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('validateSetup', () => {
  let tmpDir;
  let statePath;
  let mockGetFlowDetails;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-flows-test-'));
    statePath = path.join(tmpDir, '.setup-state.json');

    // Reset mock
    mockGetFlowDetails = jest.fn();
    MetaAPI.mockImplementation(() => ({
      getFlowDetails: mockGetFlowDetails,
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Return shape
  // -----------------------------------------------------------------------
  describe('return shape', () => {
    it('returns { valid, issues, warnings } structure', async () => {
      // Write a complete state
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Valid setup — all flows PUBLISHED, encryption configured
  // -----------------------------------------------------------------------
  describe('valid setup', () => {
    it('returns valid=true when all 3 flows are PUBLISHED and encryption is configured', async () => {
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('calls api.getFlowDetails for each registered flow', async () => {
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(mockGetFlowDetails).toHaveBeenCalledTimes(3);
      expect(mockGetFlowDetails).toHaveBeenCalledWith('flow_reg_1');
      expect(mockGetFlowDetails).toHaveBeenCalledWith('flow_fb_2');
      expect(mockGetFlowDetails).toHaveBeenCalledWith('flow_lp_3');
    });
  });

  // -----------------------------------------------------------------------
  // Missing state file
  // -----------------------------------------------------------------------
  describe('missing state file', () => {
    it('returns issues when state file does not exist (no flows registered)', async () => {
      // Don't write any state file — statePath does not exist

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Encryption not configured
  // -----------------------------------------------------------------------
  describe('encryption not configured', () => {
    it('adds an issue when encryption.configured is false', async () => {
      const state = buildCompleteState({
        encryption: { configured: false },
      });
      fs.writeFileSync(statePath, JSON.stringify(state));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.stringMatching(/encryption/i)]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Missing flows
  // -----------------------------------------------------------------------
  describe('missing flows', () => {
    it('adds an issue for each missing flow', async () => {
      const state = buildCompleteState();
      // Remove two flows
      delete state.flows.feedback;
      delete state.flows.lesson_plan;
      fs.writeFileSync(statePath, JSON.stringify(state));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/feedback.*not registered/i),
          expect.stringMatching(/lesson_plan.*not registered/i),
        ]),
      );
    });

    it('identifies a specific missing flow by name', async () => {
      const state = buildCompleteState();
      delete state.flows.registration;
      fs.writeFileSync(statePath, JSON.stringify(state));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/registration.*not registered/i),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Flow not PUBLISHED (API verification)
  // -----------------------------------------------------------------------
  describe('flow not PUBLISHED', () => {
    it('adds an issue when a flow is DRAFT on the API', async () => {
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails
        .mockResolvedValueOnce({ success: true, data: { status: 'PUBLISHED' } })
        .mockResolvedValueOnce({ success: true, data: { status: 'DRAFT' } })
        .mockResolvedValueOnce({ success: true, data: { status: 'PUBLISHED' } });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/feedback.*not PUBLISHED/i),
        ]),
      );
    });

    it('adds an issue when API call fails for a flow', async () => {
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails
        .mockResolvedValueOnce({ success: true, data: { status: 'PUBLISHED' } })
        .mockResolvedValueOnce({
          success: false,
          error: { status: 404, message: 'Not found' },
        })
        .mockResolvedValueOnce({ success: true, data: { status: 'PUBLISHED' } });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/feedback/i),
        ]),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Template statuses
  // -----------------------------------------------------------------------
  describe('template statuses', () => {
    it('adds a warning when a template status is PENDING', async () => {
      const state = buildCompleteState();
      state.templates.video_style_selection.status = 'PENDING';
      fs.writeFileSync(statePath, JSON.stringify(state));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      // PENDING template is a warning, not an issue
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/video_style_selection.*PENDING/i),
        ]),
      );
    });

    it('adds an issue when a template status is REJECTED', async () => {
      const state = buildCompleteState();
      state.templates.welcome_message.status = 'REJECTED';
      fs.writeFileSync(statePath, JSON.stringify(state));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/welcome_message.*REJECTED/i),
        ]),
      );
    });

    it('does not warn for APPROVED templates', async () => {
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.warnings).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Creates MetaAPI with correct options
  // -----------------------------------------------------------------------
  describe('MetaAPI instantiation', () => {
    it('creates MetaAPI with the provided wabaId, accessToken, phoneNumberId', async () => {
      fs.writeFileSync(statePath, JSON.stringify(buildCompleteState()));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      await validateSetup({
        wabaId: 'waba_test',
        accessToken: 'tok_test',
        phoneNumberId: 'phone_test',
        statePath,
      });

      expect(MetaAPI).toHaveBeenCalledWith({
        wabaId: 'waba_test',
        accessToken: 'tok_test',
        phoneNumberId: 'phone_test',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Multiple issues at once
  // -----------------------------------------------------------------------
  describe('multiple issues', () => {
    it('accumulates issues from encryption, missing flows, and rejected templates', async () => {
      const state = buildCompleteState({
        encryption: { configured: false },
      });
      delete state.flows.lesson_plan;
      state.templates.welcome_message.status = 'REJECTED';
      fs.writeFileSync(statePath, JSON.stringify(state));

      mockGetFlowDetails.mockResolvedValue({
        success: true,
        data: { status: 'PUBLISHED' },
      });

      const result = await validateSetup({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
        statePath,
      });

      expect(result.valid).toBe(false);
      // Should have at least 3 issues: encryption + missing flow + rejected template
      expect(result.issues.length).toBeGreaterThanOrEqual(3);
    });
  });
});
