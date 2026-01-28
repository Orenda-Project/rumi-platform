/**
 * Tests for SetupState — manages .setup-state.json for tracking
 * flow registration, template registration, and encryption status.
 *
 * TDD: This test file was written BEFORE the implementation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { SetupState } = require('../../bot/scripts/setup/setup-state');

const DEFAULT_STATE = {
  version: '2.0.0',
  createdAt: null,
  updatedAt: null,
  encryption: { configured: false },
  flows: {},
  templates: {},
};

describe('SetupState', () => {
  let tmpDir;
  let statePath;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-state-test-'));
    statePath = path.join(tmpDir, '.setup-state.json');
  });

  afterEach(() => {
    // Clean up temp directory and all contents
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------
  describe('constructor', () => {
    it('accepts a custom statePath', () => {
      const ss = new SetupState(statePath);
      expect(ss).toBeInstanceOf(SetupState);
    });

    it('defaults statePath to .setup-state.json in project root when omitted', () => {
      const ss = new SetupState();
      // The default path should end with .setup-state.json
      expect(ss.statePath).toMatch(/\.setup-state\.json$/);
    });
  });

  // ---------------------------------------------------------------
  // load()
  // ---------------------------------------------------------------
  describe('load()', () => {
    it('returns default state when file does not exist', async () => {
      const ss = new SetupState(statePath);
      const state = await ss.load();

      expect(state).toEqual(DEFAULT_STATE);
    });

    it('returns parsed state when file exists', async () => {
      const existingState = {
        ...DEFAULT_STATE,
        createdAt: '2026-01-20T00:00:00.000Z',
        updatedAt: '2026-01-20T00:00:00.000Z',
        encryption: { configured: true, publicKeyHash: 'abc123', registeredAt: '2026-01-20T00:00:00.000Z' },
      };
      fs.writeFileSync(statePath, JSON.stringify(existingState, null, 2));

      const ss = new SetupState(statePath);
      const state = await ss.load();

      expect(state).toEqual(existingState);
      expect(state.encryption.configured).toBe(true);
      expect(state.encryption.publicKeyHash).toBe('abc123');
    });
  });

  // ---------------------------------------------------------------
  // save()
  // ---------------------------------------------------------------
  describe('save()', () => {
    it('creates file with correct structure', async () => {
      const ss = new SetupState(statePath);
      const state = { ...DEFAULT_STATE, createdAt: '2026-01-20T00:00:00.000Z' };
      await ss.save(state);

      expect(fs.existsSync(statePath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(written.version).toBe('2.0.0');
      expect(written.createdAt).toBe('2026-01-20T00:00:00.000Z');
      expect(written.encryption).toEqual(expect.objectContaining({ configured: false }));
      expect(written.flows).toEqual({});
      expect(written.templates).toEqual({});
    });

    it('sets updatedAt to current ISO timestamp', async () => {
      const ss = new SetupState(statePath);
      const before = new Date().toISOString();
      await ss.save({ ...DEFAULT_STATE });
      const after = new Date().toISOString();

      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(written.updatedAt).toBeTruthy();
      // updatedAt should be between before and after (inclusive)
      expect(written.updatedAt >= before).toBe(true);
      expect(written.updatedAt <= after).toBe(true);
    });

    it('writes atomically (uses temp file + rename)', async () => {
      const ss = new SetupState(statePath);
      // Save multiple times rapidly — if not atomic, could corrupt
      const saves = [];
      for (let i = 0; i < 5; i++) {
        saves.push(ss.save({ ...DEFAULT_STATE, version: `2.0.${i}` }));
      }
      await Promise.all(saves);

      // File should exist and be valid JSON (not corrupted)
      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(written.version).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // setFlow() / getFlow()
  // ---------------------------------------------------------------
  describe('setFlow() / getFlow()', () => {
    it('round-trips flow data correctly', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      const flowData = {
        flowId: 'flow_123',
        status: 'PUBLISHED',
        envVar: 'REGISTRATION_FLOW_ID',
        type: 'registration',
        endpointPath: '/webhook/flow/registration',
        registeredAt: '2026-01-20T00:00:00.000Z',
      };
      await ss.setFlow('registration', flowData);

      const retrieved = ss.getFlow('registration');
      expect(retrieved).toEqual(flowData);
    });

    it('returns null for a flow that does not exist', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      expect(ss.getFlow('nonexistent')).toBeNull();
    });

    it('auto-saves to disk after setFlow()', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setFlow('feedback', {
        flowId: 'flow_456',
        status: 'DRAFT',
        envVar: 'FEEDBACK_FLOW_ID',
        type: 'feedback',
        endpointPath: '/webhook/flow/feedback',
        registeredAt: '2026-01-21T00:00:00.000Z',
      });

      // Read file directly to verify auto-save
      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(written.flows.feedback).toBeDefined();
      expect(written.flows.feedback.flowId).toBe('flow_456');
    });

    it('updates existing flow without creating duplicates', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setFlow('registration', {
        flowId: 'flow_v1',
        status: 'DRAFT',
        envVar: 'REGISTRATION_FLOW_ID',
        type: 'registration',
        endpointPath: '/webhook/flow/registration',
        registeredAt: '2026-01-20T00:00:00.000Z',
      });

      await ss.setFlow('registration', {
        flowId: 'flow_v2',
        status: 'PUBLISHED',
        envVar: 'REGISTRATION_FLOW_ID',
        type: 'registration',
        endpointPath: '/webhook/flow/registration',
        registeredAt: '2026-01-21T00:00:00.000Z',
      });

      const retrieved = ss.getFlow('registration');
      expect(retrieved.flowId).toBe('flow_v2');
      expect(retrieved.status).toBe('PUBLISHED');

      // Verify there is exactly one entry under 'registration'
      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(Object.keys(written.flows)).toEqual(['registration']);
    });
  });

  // ---------------------------------------------------------------
  // setTemplate() / getTemplate()
  // ---------------------------------------------------------------
  describe('setTemplate() / getTemplate()', () => {
    it('round-trips template data correctly', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      const tplData = {
        templateId: 'tpl_789',
        status: 'APPROVED',
        registeredAt: '2026-01-20T00:00:00.000Z',
      };
      await ss.setTemplate('welcome_message', tplData);

      const retrieved = ss.getTemplate('welcome_message');
      expect(retrieved).toEqual(tplData);
    });

    it('returns null for a template that does not exist', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      expect(ss.getTemplate('nonexistent')).toBeNull();
    });

    it('auto-saves to disk after setTemplate()', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setTemplate('lesson_plan', {
        templateId: 'tpl_abc',
        status: 'PENDING',
        registeredAt: '2026-01-22T00:00:00.000Z',
      });

      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(written.templates.lesson_plan).toBeDefined();
      expect(written.templates.lesson_plan.templateId).toBe('tpl_abc');
    });
  });

  // ---------------------------------------------------------------
  // setEncryption() / getEncryption()
  // ---------------------------------------------------------------
  describe('setEncryption() / getEncryption()', () => {
    it('round-trips encryption data correctly', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      const encData = {
        configured: true,
        publicKeyHash: 'sha256_hash_here',
        registeredAt: '2026-01-20T00:00:00.000Z',
      };
      await ss.setEncryption(encData);

      const retrieved = ss.getEncryption();
      expect(retrieved).toEqual(encData);
    });

    it('returns default encryption state when not configured', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      const enc = ss.getEncryption();
      expect(enc).toEqual({ configured: false });
    });

    it('auto-saves to disk after setEncryption()', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({
        configured: true,
        publicKeyHash: 'hash_xyz',
        registeredAt: '2026-01-23T00:00:00.000Z',
      });

      const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(written.encryption.configured).toBe(true);
      expect(written.encryption.publicKeyHash).toBe('hash_xyz');
    });
  });

  // ---------------------------------------------------------------
  // isComplete()
  // ---------------------------------------------------------------
  describe('isComplete()', () => {
    it('returns false when no flows are configured', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      expect(ss.isComplete()).toBe(false);
    });

    it('returns false when only some flows are configured', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });
      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });
      await ss.setFlow('feedback', { flowId: 'f2', status: 'PUBLISHED', envVar: 'E2', type: 'feedback', endpointPath: '/f', registeredAt: new Date().toISOString() });
      // Missing third flow

      expect(ss.isComplete()).toBe(false);
    });

    it('returns false when encryption is not configured', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });
      await ss.setFlow('feedback', { flowId: 'f2', status: 'PUBLISHED', envVar: 'E2', type: 'feedback', endpointPath: '/f', registeredAt: new Date().toISOString() });
      await ss.setFlow('lesson_plan', { flowId: 'f3', status: 'PUBLISHED', envVar: 'E3', type: 'lesson_plan', endpointPath: '/l', registeredAt: new Date().toISOString() });
      // Encryption NOT set

      expect(ss.isComplete()).toBe(false);
    });

    it('returns true when all 3 flows AND encryption are configured (templates PENDING is OK)', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });
      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });
      await ss.setFlow('feedback', { flowId: 'f2', status: 'PUBLISHED', envVar: 'E2', type: 'feedback', endpointPath: '/f', registeredAt: new Date().toISOString() });
      await ss.setFlow('lesson_plan', { flowId: 'f3', status: 'PUBLISHED', envVar: 'E3', type: 'lesson_plan', endpointPath: '/l', registeredAt: new Date().toISOString() });

      // Templates are PENDING — should NOT block completion
      await ss.setTemplate('welcome', { templateId: 't1', status: 'PENDING', registeredAt: new Date().toISOString() });

      expect(ss.isComplete()).toBe(true);
    });

    it('returns true even with zero templates registered', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });
      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });
      await ss.setFlow('feedback', { flowId: 'f2', status: 'PUBLISHED', envVar: 'E2', type: 'feedback', endpointPath: '/f', registeredAt: new Date().toISOString() });
      await ss.setFlow('lesson_plan', { flowId: 'f3', status: 'PUBLISHED', envVar: 'E3', type: 'lesson_plan', endpointPath: '/l', registeredAt: new Date().toISOString() });

      expect(ss.isComplete()).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // getNextIncompleteStep()
  // ---------------------------------------------------------------
  describe('getNextIncompleteStep()', () => {
    it('returns "encryption" when encryption is not configured', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      expect(ss.getNextIncompleteStep()).toBe('encryption');
    });

    it('returns "flows" when encryption is done but flows are missing', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });

      expect(ss.getNextIncompleteStep()).toBe('flows');
    });

    it('returns "flows" when only some flows are registered', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });
      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });

      expect(ss.getNextIncompleteStep()).toBe('flows');
    });

    it('returns "templates" when encryption + all flows done but no templates', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });
      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });
      await ss.setFlow('feedback', { flowId: 'f2', status: 'PUBLISHED', envVar: 'E2', type: 'feedback', endpointPath: '/f', registeredAt: new Date().toISOString() });
      await ss.setFlow('lesson_plan', { flowId: 'f3', status: 'PUBLISHED', envVar: 'E3', type: 'lesson_plan', endpointPath: '/l', registeredAt: new Date().toISOString() });

      expect(ss.getNextIncompleteStep()).toBe('templates');
    });

    it('returns null when everything is complete (encryption + 3 flows + templates)', async () => {
      const ss = new SetupState(statePath);
      await ss.load();

      await ss.setEncryption({ configured: true, publicKeyHash: 'h', registeredAt: new Date().toISOString() });
      await ss.setFlow('registration', { flowId: 'f1', status: 'PUBLISHED', envVar: 'E1', type: 'registration', endpointPath: '/r', registeredAt: new Date().toISOString() });
      await ss.setFlow('feedback', { flowId: 'f2', status: 'PUBLISHED', envVar: 'E2', type: 'feedback', endpointPath: '/f', registeredAt: new Date().toISOString() });
      await ss.setFlow('lesson_plan', { flowId: 'f3', status: 'PUBLISHED', envVar: 'E3', type: 'lesson_plan', endpointPath: '/l', registeredAt: new Date().toISOString() });
      await ss.setTemplate('welcome', { templateId: 't1', status: 'APPROVED', registeredAt: new Date().toISOString() });

      expect(ss.getNextIncompleteStep()).toBeNull();
    });
  });
});
