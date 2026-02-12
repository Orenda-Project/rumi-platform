/**
 * bd-345: Setup agent integration tests
 * TDD: RED → GREEN → REFACTOR
 */

const fs = require('fs');
const path = require('path');

// Mock fetch before requiring the module
global.fetch = jest.fn();

const {
  provisionInfrastructure,
  writeEnvFile,
  generateRandomKey,
  parseArgs
} = require('./provision-infrastructure');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('provisionInfrastructure', () => {
  test('calls provisioner API with correct parameters', async () => {
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        deployment_name: 'test-org',
        supabase: { url: 'https://test.supabase.co', project_id: 'proj-123' },
        railway: { project_url: 'https://railway.app/project/123' }
      })
    });

    const result = await provisionInfrastructure('test-org', 'ap-south-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/provision'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Provisioner-Key': expect.any(String)
        })
      })
    );

    expect(result).toHaveProperty('success', true);
  });

  test('throws error on failed provisioning', async () => {
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: false,
        message: 'Rate limit exceeded'
      })
    });

    await expect(provisionInfrastructure('test-org'))
      .rejects.toThrow('Provisioning failed');
  });
});

describe('writeEnvFile', () => {
  const testEnvPath = path.join(__dirname, '.env.test');

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
  });

  const baseCredentials = {
    deployment_name: 'test-org',
    supabase: {
      url: 'https://test.supabase.co',
      anon_key: 'anon-key',
      service_key: 'service-key'
    },
    railway: {
      redis_url: 'redis://localhost:6379',
      project_url: 'https://railway.app/project/123',
      deploy_token: {
        token: 'test-token-123',
        usage: 'cd bot && RAILWAY_TOKEN=test-token-123 railway up --service bot'
      }
    }
  };

  test('writes credentials to .env file', () => {
    writeEnvFile(baseCredentials, testEnvPath);

    expect(fs.existsSync(testEnvPath)).toBe(true);

    const content = fs.readFileSync(testEnvPath, 'utf-8');
    expect(content).toContain('SUPABASE_URL=https://test.supabase.co');
    expect(content).toContain('SUPABASE_ANON_KEY=anon-key');
    expect(content).toContain('REDIS_URL=redis://localhost:6379');
  });

  // bd-381: Must use SUPABASE_SERVICE_ROLE_KEY (not SUPABASE_SERVICE_KEY)
  test('writes SUPABASE_SERVICE_ROLE_KEY not SUPABASE_SERVICE_KEY', () => {
    writeEnvFile(baseCredentials, testEnvPath);
    const content = fs.readFileSync(testEnvPath, 'utf-8');

    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY=service-key');
    expect(content).not.toContain('SUPABASE_SERVICE_KEY=');
  });

  // bd-382: Deploy command should not show "undefined"
  test('writes deploy command from deploy_token.usage', () => {
    writeEnvFile(baseCredentials, testEnvPath);
    const content = fs.readFileSync(testEnvPath, 'utf-8');

    expect(content).not.toContain('undefined');
    expect(content).toContain('RAILWAY_TOKEN=test-token-123');
  });

  // bd-382: Should handle missing deploy_token gracefully
  test('handles missing deploy_token without undefined', () => {
    const creds = {
      ...baseCredentials,
      railway: { ...baseCredentials.railway, deploy_token: undefined }
    };
    writeEnvFile(creds, testEnvPath);
    const content = fs.readFileSync(testEnvPath, 'utf-8');

    expect(content).not.toContain('undefined');
  });

  // bd-383: Should preserve existing WhatsApp credentials
  test('preserves existing WhatsApp credentials from .env', () => {
    // Pre-populate .env with WhatsApp creds
    fs.writeFileSync(testEnvPath, `WHATSAPP_TOKEN=existing-wa-token
PHONE_NUMBER_ID=12345
WABA_ID=67890
WEBHOOK_VERIFY_TOKEN=my-verify-token
SOME_OTHER_VAR=should-be-lost
`);

    writeEnvFile(baseCredentials, testEnvPath);
    const content = fs.readFileSync(testEnvPath, 'utf-8');

    // WhatsApp creds should be preserved
    expect(content).toContain('WHATSAPP_TOKEN=existing-wa-token');
    expect(content).toContain('PHONE_NUMBER_ID=12345');
    expect(content).toContain('WABA_ID=67890');
    expect(content).toContain('WEBHOOK_VERIFY_TOKEN=my-verify-token');
    // Non-WhatsApp creds should be overwritten by provisioner values
    expect(content).not.toContain('SOME_OTHER_VAR');
  });

  // bd-383: Should use placeholder when no existing WhatsApp creds
  test('uses placeholder when no existing .env', () => {
    writeEnvFile(baseCredentials, testEnvPath);
    const content = fs.readFileSync(testEnvPath, 'utf-8');

    expect(content).toContain('WHATSAPP_TOKEN=your_whatsapp_token_here');
  });

  // bd-381: Writes RAILWAY_DEPLOY_TOKEN for future deploys
  test('writes RAILWAY_DEPLOY_TOKEN', () => {
    writeEnvFile(baseCredentials, testEnvPath);
    const content = fs.readFileSync(testEnvPath, 'utf-8');

    expect(content).toContain('RAILWAY_DEPLOY_TOKEN=test-token-123');
  });
});

describe('generateRandomKey', () => {
  test('generates unique keys', () => {
    const key1 = generateRandomKey();
    const key2 = generateRandomKey();

    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^rumi-/);
  });

  test('generates keys of reasonable length', () => {
    const key = generateRandomKey();
    expect(key.length).toBeGreaterThan(15);
  });
});

describe('parseArgs', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  test('parses --name argument', () => {
    process.argv = ['node', 'script.js', '--name', 'my-org'];
    const options = parseArgs();
    expect(options.name).toBe('my-org');
  });

  test('parses --region argument', () => {
    process.argv = ['node', 'script.js', '--name', 'my-org', '--region', 'eu-west-1'];
    const options = parseArgs();
    expect(options.region).toBe('eu-west-1');
  });

  test('uses default region when not specified', () => {
    process.argv = ['node', 'script.js', '--name', 'my-org'];
    const options = parseArgs();
    expect(options.region).toBe('ap-south-1');
  });
});
