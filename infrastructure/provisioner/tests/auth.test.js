/**
 * bd-344: API key auth middleware tests
 * TDD: RED → GREEN → REFACTOR
 */

const request = require('supertest');

let app;

beforeAll(() => {
  // Set test API key
  process.env.PROVISIONER_API_KEY = 'test-api-key-123';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  app = require('../index');
});

afterAll(() => {
  jest.restoreAllMocks();
  delete process.env.PROVISIONER_API_KEY;
});

describe('API Key Authentication', () => {
  test('POST /provision without API key returns 401', async () => {
    const response = await request(app)
      .post('/provision')
      .send({ deployment_name: 'test' });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'unauthorized');
  });

  test('POST /provision with invalid API key returns 401', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'wrong-key')
      .send({ deployment_name: 'test' });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error', 'unauthorized');
  });

  test('POST /provision with valid API key passes auth', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key-123')
      .send({ deployment_name: 'test', region: 'ap-south-1' });

    // Should not be 401 (might be other error, but auth passed)
    expect(response.status).not.toBe(401);
  });

  test('GET /health does not require API key', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });
});
