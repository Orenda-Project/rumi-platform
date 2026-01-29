/**
 * bd-348: Status endpoint tests
 * TDD: RED → GREEN → REFACTOR
 */

const request = require('supertest');

let app;

beforeAll(() => {
  process.env.PROVISIONER_API_KEY = 'test-api-key-123';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  app = require('../index');
});

afterAll(() => {
  jest.restoreAllMocks();
  delete process.env.PROVISIONER_API_KEY;
});

beforeEach(() => {
  // Clear deployment status between tests
  app.deploymentStatus.clear();
});

describe('Status Endpoint', () => {
  test('GET /status/:name returns 404 for unknown deployment', async () => {
    const response = await request(app)
      .get('/status/unknown-deployment')
      .set('X-Provisioner-Key', 'test-api-key-123');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'not_found');
  });

  test('GET /status/:name returns deployment status when found', async () => {
    // Add a deployment status
    app.deploymentStatus.set('test-deployment', {
      status: 'completed',
      step: 'done',
      created_at: '2026-01-29T00:00:00Z'
    });

    const response = await request(app)
      .get('/status/test-deployment')
      .set('X-Provisioner-Key', 'test-api-key-123');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('deployment_name', 'test-deployment');
    expect(response.body).toHaveProperty('status', 'completed');
  });

  test('GET /status/:name requires API key', async () => {
    const response = await request(app)
      .get('/status/test-deployment');

    expect(response.status).toBe(401);
  });

  test('updateDeploymentStatus helper works correctly', () => {
    app.updateDeploymentStatus('helper-test', { status: 'provisioning', step: 'started' });

    const status = app.deploymentStatus.get('helper-test');
    expect(status).toHaveProperty('status', 'provisioning');
    expect(status).toHaveProperty('step', 'started');
    expect(status).toHaveProperty('updated_at');
  });
});
