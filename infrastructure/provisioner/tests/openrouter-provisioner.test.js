/**
 * bd-349: OpenRouter provisioning service tests
 * TDD: RED → GREEN → REFACTOR
 *
 * Tests mock the OpenRouter API to avoid real API calls
 */

// Mock node-fetch before requiring the module
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Set env vars before requiring the module
process.env.OPENROUTER_PROVISIONING_KEY = 'sk-or-prov-test-key';

const OpenRouterProvisioner = require('../services/openrouter-provisioner');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OpenRouterProvisioner', () => {
  describe('constructor', () => {
    test('throws if OPENROUTER_PROVISIONING_KEY not set', () => {
      const originalKey = process.env.OPENROUTER_PROVISIONING_KEY;
      delete process.env.OPENROUTER_PROVISIONING_KEY;

      expect(() => new OpenRouterProvisioner()).toThrow('OPENROUTER_PROVISIONING_KEY is required');

      process.env.OPENROUTER_PROVISIONING_KEY = originalKey;
    });

    test('initializes with provisioning key', () => {
      const provisioner = new OpenRouterProvisioner();
      expect(provisioner).toBeDefined();
    });
  });

  describe('createKey', () => {
    test('creates API key with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          key: 'sk-or-v1-new-user-key-abc123',
          data: {
            hash: 'hash123',
            name: 'rumi-test-user',
            limit: 10,
            limit_remaining: 10,
            limit_reset: 'monthly',
            expires_at: '2026-07-29T00:00:00Z',
            created_at: '2026-01-29T00:00:00Z'
          }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      const result = await provisioner.createKey('test-user', {
        limit: 10,
        limitReset: 'monthly',
        expiresInDays: 180
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/keys',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-or-prov-test-key',
            'Content-Type': 'application/json'
          })
        })
      );

      expect(result).toHaveProperty('key', 'sk-or-v1-new-user-key-abc123');
      expect(result).toHaveProperty('limit', 10);
      expect(result).toHaveProperty('limit_reset', 'monthly');
    });

    test('sets correct expiration date based on days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          key: 'sk-or-v1-test',
          data: {
            hash: 'hash123',
            name: 'rumi-test',
            limit: 10,
            expires_at: '2026-07-29T00:00:00Z'
          }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      await provisioner.createKey('test', { expiresInDays: 180 });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.expires_at).toBeDefined();

      // Verify the expiration is approximately 180 days from now
      const expiresAt = new Date(callBody.expires_at);
      const now = new Date();
      const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(179);
      expect(diffDays).toBeLessThanOrEqual(181);
    });

    test('prefixes key name with rumi-', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          key: 'sk-or-v1-test',
          data: { name: 'rumi-my-deployment' }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      await provisioner.createKey('my-deployment');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.name).toBe('rumi-my-deployment');
    });

    test('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Invalid provisioning key' }
        })
      });

      const provisioner = new OpenRouterProvisioner();

      await expect(provisioner.createKey('test'))
        .rejects.toThrow('Failed to create OpenRouter key');
    });

    test('throws on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: { message: 'Rate limit exceeded' }
        })
      });

      const provisioner = new OpenRouterProvisioner();

      await expect(provisioner.createKey('test'))
        .rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('createKey - default options', () => {
    test('uses default $10 limit if not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          key: 'sk-or-v1-test',
          data: { limit: 10 }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      await provisioner.createKey('test');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.limit).toBe(10);
    });

    test('uses monthly reset by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          key: 'sk-or-v1-test',
          data: { limit_reset: 'monthly' }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      await provisioner.createKey('test');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.limit_reset).toBe('monthly');
    });

    test('uses 180-day expiration by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          key: 'sk-or-v1-test',
          data: {}
        })
      });

      const provisioner = new OpenRouterProvisioner();
      await provisioner.createKey('test');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.expires_at).toBeDefined();
    });
  });

  describe('disableKey', () => {
    test('disables key by hash', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { hash: 'hash123', disabled: true }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      const result = await provisioner.disableKey('hash123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/keys/hash123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ disabled: true })
        })
      );

      expect(result.disabled).toBe(true);
    });
  });

  describe('getKeyInfo', () => {
    test('retrieves key info by hash', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            hash: 'hash123',
            name: 'rumi-test',
            limit: 10,
            limit_remaining: 5,
            usage: 5
          }
        })
      });

      const provisioner = new OpenRouterProvisioner();
      const result = await provisioner.getKeyInfo('hash123');

      expect(result).toHaveProperty('limit_remaining', 5);
      expect(result).toHaveProperty('usage', 5);
    });
  });
});
