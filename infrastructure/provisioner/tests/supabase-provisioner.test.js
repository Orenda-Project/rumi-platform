/**
 * bd-340: Supabase provisioning service tests
 * TDD: RED → GREEN → REFACTOR
 *
 * Tests mock the Supabase Management API to avoid real API calls
 */

// Mock node-fetch before requiring the module
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Set env vars before requiring the module
process.env.SUPABASE_ORG_ID = 'test-org-id';
process.env.SUPABASE_ACCESS_TOKEN = 'test-token';

const SupabaseProvisioner = require('../services/supabase-provisioner');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseProvisioner', () => {
  describe('createProject', () => {
    test('creates project with correct parameters', async () => {
      const mockProjectResponse = {
        id: 'proj-123',
        ref: 'proj-123',
        name: 'rumi-test-deployment',
        region: 'ap-south-1',
        status: 'COMING_UP'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProjectResponse)
      });

      const provisioner = new SupabaseProvisioner();
      const result = await provisioner.createProject('test-deployment', 'ap-south-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      );

      expect(result).toHaveProperty('id', 'proj-123');
      expect(result).toHaveProperty('name', 'rumi-test-deployment');
    });

    test('generates secure database password', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'proj-123', status: 'COMING_UP' })
      });

      const provisioner = new SupabaseProvisioner();
      await provisioner.createProject('test', 'ap-south-1');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.db_pass).toBeDefined();
      expect(callBody.db_pass.length).toBeGreaterThanOrEqual(20);
    });

    test('throws error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid request' })
      });

      const provisioner = new SupabaseProvisioner();

      await expect(provisioner.createProject('test', 'ap-south-1'))
        .rejects.toThrow('Failed to create Supabase project');
    });
  });

  describe('waitForHealthy', () => {
    test('polls until project is ACTIVE_HEALTHY', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'COMING_UP' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'COMING_UP' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'ACTIVE_HEALTHY' })
        });

      const provisioner = new SupabaseProvisioner();
      const result = await provisioner.waitForHealthy('proj-123', { pollInterval: 10, maxAttempts: 5 });

      expect(result.status).toBe('ACTIVE_HEALTHY');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('throws after max attempts exceeded', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'COMING_UP' })
      });

      const provisioner = new SupabaseProvisioner();

      await expect(provisioner.waitForHealthy('proj-123', { pollInterval: 10, maxAttempts: 3 }))
        .rejects.toThrow('Project did not become healthy');
    });
  });

  describe('getApiKeys', () => {
    test('returns anon and service role keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { name: 'anon', api_key: 'anon-key-123' },
          { name: 'service_role', api_key: 'service-key-456' }
        ])
      });

      const provisioner = new SupabaseProvisioner();
      const keys = await provisioner.getApiKeys('proj-123');

      expect(keys).toHaveProperty('anon_key', 'anon-key-123');
      expect(keys).toHaveProperty('service_key', 'service-key-456');
    });

    test('throws if keys not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([])
      });

      const provisioner = new SupabaseProvisioner();

      await expect(provisioner.getApiKeys('proj-123'))
        .rejects.toThrow('API keys not found');
    });
  });

  describe('applySchema', () => {
    test('applies schema via migrations API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const provisioner = new SupabaseProvisioner();
      const result = await provisioner.applySchema('proj-123', 'CREATE TABLE test (id INT);');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/proj-123/database/migrations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );

      expect(result).toHaveProperty('success', true);
    });

    test('throws error on schema apply failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid SQL' })
      });

      const provisioner = new SupabaseProvisioner();

      await expect(provisioner.applySchema('proj-123', 'INVALID SQL'))
        .rejects.toThrow('Failed to apply schema');
    });
  });

  describe('waitForHealthy - edge cases', () => {
    test('throws on status check API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      });

      const provisioner = new SupabaseProvisioner();

      await expect(provisioner.waitForHealthy('invalid-proj', { pollInterval: 10, maxAttempts: 1 }))
        .rejects.toThrow('Failed to check project status');
    });
  });

  describe('generatePassword', () => {
    test('generates passwords of sufficient length', () => {
      const provisioner = new SupabaseProvisioner();
      const password = provisioner.generatePassword();

      expect(password.length).toBeGreaterThanOrEqual(20);
    });

    test('generates unique passwords', () => {
      const provisioner = new SupabaseProvisioner();
      const pass1 = provisioner.generatePassword();
      const pass2 = provisioner.generatePassword();

      expect(pass1).not.toBe(pass2);
    });
  });
});
