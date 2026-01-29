/**
 * bd-342: Railway provisioning service tests
 * TDD: RED → GREEN → REFACTOR
 *
 * Tests mock the Railway GraphQL API to avoid real API calls
 */

// Mock node-fetch before requiring the module
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Set env vars before requiring the module
process.env.RAILWAY_TEAM_TOKEN = 'test-railway-token';

const RailwayProvisioner = require('../services/railway-provisioner');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RailwayProvisioner', () => {
  describe('createProject', () => {
    test('creates project via GraphQL mutation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            projectCreate: {
              id: 'railway-proj-123',
              name: 'rumi-test-deployment'
            }
          }
        })
      });

      const provisioner = new RailwayProvisioner();
      const result = await provisioner.createProject('test-deployment');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://backboard.railway.com/graphql/v2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-railway-token',
            'Content-Type': 'application/json'
          })
        })
      );

      expect(result).toHaveProperty('id', 'railway-proj-123');
    });

    test('throws error on GraphQL error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: 'Project creation failed' }]
        })
      });

      const provisioner = new RailwayProvisioner();

      await expect(provisioner.createProject('test'))
        .rejects.toThrow('Failed to create Railway project');
    });
  });

  describe('addRedisPlugin', () => {
    test('adds Redis plugin to project', async () => {
      // Mock getting environments first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            project: {
              environments: {
                edges: [{ node: { id: 'env-123', name: 'production' } }]
              }
            }
          }
        })
      });

      // Mock adding Redis plugin
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            serviceCreate: {
              id: 'redis-service-123'
            }
          }
        })
      });

      const provisioner = new RailwayProvisioner();
      const result = await provisioner.addRedisPlugin('railway-proj-123');

      expect(result).toHaveProperty('serviceId', 'redis-service-123');
    });
  });

  describe('getRedisConnectionString', () => {
    test('returns Redis connection URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            variables: {
              REDIS_URL: 'redis://default:password@host.railway.app:6379'
            }
          }
        })
      });

      const provisioner = new RailwayProvisioner();
      const url = await provisioner.getRedisConnectionString('redis-service-123', 'env-123');

      expect(url).toBe('redis://default:password@host.railway.app:6379');
    });

    test('throws if REDIS_URL not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { variables: {} }
        })
      });

      const provisioner = new RailwayProvisioner();

      await expect(provisioner.getRedisConnectionString('redis-123', 'env-123'))
        .rejects.toThrow('Redis URL not found');
    });
  });

  describe('getProjectUrl', () => {
    test('returns Railway project dashboard URL', () => {
      const provisioner = new RailwayProvisioner();
      const url = provisioner.getProjectUrl('proj-123');

      expect(url).toBe('https://railway.com/project/proj-123');
    });
  });

  describe('createProject - edge cases', () => {
    test('throws on empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { projectCreate: null }
        })
      });

      const provisioner = new RailwayProvisioner();

      await expect(provisioner.createProject('test'))
        .rejects.toThrow('Failed to create Railway project');
    });

    test('prefixes project name with rumi-', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            projectCreate: { id: 'test-id', name: 'rumi-my-project' }
          }
        })
      });

      const provisioner = new RailwayProvisioner();
      await provisioner.createProject('my-project');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.variables.input.name).toBe('rumi-my-project');
    });
  });

  describe('addRedisPlugin - edge cases', () => {
    test('throws if no environment found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            project: {
              environments: { edges: [] }
            }
          }
        })
      });

      const provisioner = new RailwayProvisioner();

      await expect(provisioner.addRedisPlugin('proj-123'))
        .rejects.toThrow('No environment found');
    });

    test('uses first environment if no production env', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            project: {
              environments: {
                edges: [{ node: { id: 'staging-env', name: 'staging' } }]
              }
            }
          }
        })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { serviceCreate: { id: 'redis-123' } }
        })
      });

      const provisioner = new RailwayProvisioner();
      const result = await provisioner.addRedisPlugin('proj-123');

      expect(result).toHaveProperty('environmentId', 'staging-env');
    });
  });

  describe('graphql helper', () => {
    test('throws on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: 'Unauthorized' }]
        })
      });

      const provisioner = new RailwayProvisioner();

      await expect(provisioner.graphql('{ me { name } }'))
        .rejects.toThrow('GraphQL error: Unauthorized');
    });
  });
});
