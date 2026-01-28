/**
 * Tests for setupEncryption — generates RSA-2048 keypair and registers
 * the public key with Meta's Graph API for WhatsApp Flow encryption.
 *
 * TDD: This test file was written BEFORE the implementation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Mocks — must be declared before require()
// ---------------------------------------------------------------------------

jest.mock('../../bot/scripts/setup/meta-api');
jest.mock('../../bot/scripts/setup/setup-state');

const { MetaAPI } = require('../../bot/scripts/setup/meta-api');
const { SetupState } = require('../../bot/scripts/setup/setup-state');
const { setupEncryption } = require('../../bot/scripts/setup/setup-encryption');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWe',
  'FakeKeyDataHereFakeKeyDataHereFakeKeyDataHereFakeKeyDataHere0000',
  'FakeKeyDataHereFakeKeyDataHereFakeKeyDataHereFakeKeyDataHere1111',
  'FakeKeyDataHereFakeKeyDataHereFakeKeyDataHereFakeKeyDataHere2222',
  'QQIDAQAB',
  '-----END PUBLIC KEY-----',
  '',
].join('\n');

const FAKE_PRIVATE_KEY = [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDRndVLkklx2zfF',
  'FakePrivateKeyDataHereFakePrivateKeyDataHereFakePrivateKeyData00',
  'FakePrivateKeyDataHereFakePrivateKeyDataHereFakePrivateKeyData11',
  'FakePrivateKeyDataHereFakePrivateKeyDataHereFakePrivateKeyData22',
  'AQAB',
  '-----END PRIVATE KEY-----',
  '',
].join('\n');

const DEFAULT_OPTS = {
  wabaId: 'waba_123',
  accessToken: 'tok_secret',
  phoneNumberId: 'phone_456',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spy on crypto.generateKeyPairSync and return fake keys */
function mockKeyPairGeneration() {
  return jest.spyOn(crypto, 'generateKeyPairSync').mockReturnValue({
    publicKey: FAKE_PUBLIC_KEY,
    privateKey: FAKE_PRIVATE_KEY,
  });
}

/** Create mock MetaAPI instance with registerPublicKey */
function createMockApi(registerResult) {
  const mockApi = {
    registerPublicKey: jest.fn().mockResolvedValue(
      registerResult || { success: true, data: { success: true } },
    ),
  };
  MetaAPI.mockImplementation(() => mockApi);
  return mockApi;
}

/** Create mock SetupState instance */
function createMockState(encryptionState) {
  const mockState = {
    load: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue(undefined),
    getEncryption: jest.fn().mockReturnValue(
      encryptionState || { configured: false },
    ),
    setEncryption: jest.fn().mockResolvedValue(undefined),
  };
  SetupState.mockImplementation(() => mockState);
  return mockState;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('setupEncryption', () => {
  let tmpDir;
  let keyOutputDir;
  let statePath;
  let generateSpy;
  let consoleSpy;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-enc-test-'));
    keyOutputDir = path.join(tmpDir, 'keys');
    statePath = path.join(tmpDir, '.setup-state.json');

    // Suppress console output during tests
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Reset mocks
    MetaAPI.mockReset();
    SetupState.mockReset();
  });

  afterEach(() => {
    // Restore crypto spy if active
    if (generateSpy) {
      generateSpy.mockRestore();
      generateSpy = null;
    }

    // Restore console
    consoleSpy.mockRestore();

    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Key generation
  // -----------------------------------------------------------------------
  describe('key generation', () => {
    it('generates RSA-2048 keypair using crypto.generateKeyPairSync', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(generateSpy).toHaveBeenCalledWith('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
    });
  });

  // -----------------------------------------------------------------------
  // File output
  // -----------------------------------------------------------------------
  describe('file output', () => {
    it('saves private key to {keyOutputDir}/flow_private_key.pem', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      const privateKeyPath = path.join(keyOutputDir, 'flow_private_key.pem');
      expect(fs.existsSync(privateKeyPath)).toBe(true);
      expect(fs.readFileSync(privateKeyPath, 'utf-8')).toBe(FAKE_PRIVATE_KEY);
    });

    it('saves public key to {keyOutputDir}/flow_public_key.pem', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      const publicKeyPath = path.join(keyOutputDir, 'flow_public_key.pem');
      expect(fs.existsSync(publicKeyPath)).toBe(true);
      expect(fs.readFileSync(publicKeyPath, 'utf-8')).toBe(FAKE_PUBLIC_KEY);
    });

    it('creates the output directory if it does not exist', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      const nestedDir = path.join(tmpDir, 'deep', 'nested', 'keys');
      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir: nestedDir, statePath });

      expect(fs.existsSync(nestedDir)).toBe(true);
      expect(fs.existsSync(path.join(nestedDir, 'flow_private_key.pem'))).toBe(true);
      expect(fs.existsSync(path.join(nestedDir, 'flow_public_key.pem'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Meta API registration
  // -----------------------------------------------------------------------
  describe('Meta API registration', () => {
    it('creates MetaAPI with wabaId, accessToken, and phoneNumberId', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(MetaAPI).toHaveBeenCalledWith({
        wabaId: 'waba_123',
        accessToken: 'tok_secret',
        phoneNumberId: 'phone_456',
      });
    });

    it('registers the public key via api.registerPublicKey()', async () => {
      generateSpy = mockKeyPairGeneration();
      const mockApi = createMockApi();
      createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(mockApi.registerPublicKey).toHaveBeenCalledWith(FAKE_PUBLIC_KEY);
    });

    it('returns registered: true when Meta API succeeds', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi({ success: true, data: { success: true } });
      createMockState();

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(result.registered).toBe(true);
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Setup state recording
  // -----------------------------------------------------------------------
  describe('setup state recording', () => {
    it('loads and records encryption state via state.setEncryption()', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      const mockState = createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(mockState.load).toHaveBeenCalled();
      expect(mockState.setEncryption).toHaveBeenCalledWith(
        expect.objectContaining({
          configured: true,
          publicKeyHash: expect.any(String),
          registeredAt: expect.any(String),
        }),
      );
    });

    it('stores the SHA-256 hash of the public key PEM', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      const mockState = createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      const expectedHash = crypto
        .createHash('sha256')
        .update(FAKE_PUBLIC_KEY)
        .digest('hex');

      const setEncCall = mockState.setEncryption.mock.calls[0][0];
      expect(setEncCall.publicKeyHash).toBe(expectedHash);
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------
  describe('idempotency', () => {
    it('skips generation and returns success if already configured', async () => {
      generateSpy = mockKeyPairGeneration();
      const mockApi = createMockApi();
      const mockState = createMockState({ configured: true });

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      // Should NOT generate keys
      expect(generateSpy).not.toHaveBeenCalled();

      // Should NOT register with Meta
      expect(mockApi.registerPublicKey).not.toHaveBeenCalled();

      // Should NOT update state
      expect(mockState.setEncryption).not.toHaveBeenCalled();

      // Should return success
      expect(result.success).toBe(true);
    });

    it('does not write key files when already configured', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState({ configured: true });

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      // Output directory should not have been created
      expect(fs.existsSync(path.join(keyOutputDir, 'flow_private_key.pem'))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('saves keys locally even when Meta API fails', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi({
        success: false,
        error: { status: 403, code: 200, message: 'Permissions error' },
      });
      createMockState();

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      // Keys should still be saved
      expect(fs.existsSync(path.join(keyOutputDir, 'flow_private_key.pem'))).toBe(true);
      expect(fs.existsSync(path.join(keyOutputDir, 'flow_public_key.pem'))).toBe(true);

      // Result should indicate failure to register
      expect(result.registered).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success: false with error details when Meta API fails', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi({
        success: false,
        error: { status: 403, code: 200, message: 'Permissions error' },
      });
      createMockState();

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permissions error');
    });

    it('does not record encryption state when Meta API fails', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi({
        success: false,
        error: { status: 403, code: 200, message: 'Permissions error' },
      });
      const mockState = createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(mockState.setEncryption).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Return value structure
  // -----------------------------------------------------------------------
  describe('return value', () => {
    it('returns { success, privateKeyPath, publicKeyPath, registered } on success', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(result).toEqual({
        success: true,
        privateKeyPath: path.join(keyOutputDir, 'flow_private_key.pem'),
        publicKeyPath: path.join(keyOutputDir, 'flow_public_key.pem'),
        registered: true,
      });
    });

    it('returns { success, privateKeyPath, publicKeyPath, registered, error } on API failure', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi({
        success: false,
        error: { status: 500, message: 'Internal error' },
      });
      createMockState();

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(result).toEqual({
        success: false,
        privateKeyPath: path.join(keyOutputDir, 'flow_private_key.pem'),
        publicKeyPath: path.join(keyOutputDir, 'flow_public_key.pem'),
        registered: false,
        error: expect.stringContaining('Internal error'),
      });
    });

    it('returns { success: true } (minimal) on idempotent skip', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState({ configured: true });

      const result = await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // Console output
  // -----------------------------------------------------------------------
  describe('console output', () => {
    it('outputs the FLOW_PRIVATE_KEY env var hint as base64', async () => {
      generateSpy = mockKeyPairGeneration();
      createMockApi();
      createMockState();

      await setupEncryption({ ...DEFAULT_OPTS, keyOutputDir, statePath });

      const base64PrivateKey = Buffer.from(FAKE_PRIVATE_KEY).toString('base64');

      // Check that console.log was called with the env var hint
      const logCalls = consoleSpy.mock.calls.map((c) => c.join(' '));
      const envVarLog = logCalls.find((line) => line.includes('FLOW_PRIVATE_KEY='));

      expect(envVarLog).toBeDefined();
      expect(envVarLog).toContain(base64PrivateKey);
    });
  });
});
