/**
 * bd-339: Health endpoint tests
 * TDD: RED → GREEN → REFACTOR
 */

const request = require('supertest');

// Import app (will fail until we create it - that's TDD!)
let app;

beforeAll(() => {
  // Suppress console.log during tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  app = require('../index');
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Health Endpoint', () => {
  test('GET /health returns 200 with status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });

  test('GET /health includes service name', async () => {
    const response = await request(app).get('/health');

    expect(response.body).toHaveProperty('service', 'rumi-provisioner');
  });

  test('GET /health includes timestamp', async () => {
    const response = await request(app).get('/health');

    expect(response.body).toHaveProperty('timestamp');
    expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
  });

  test('GET /health includes version', async () => {
    const response = await request(app).get('/health');

    expect(response.body).toHaveProperty('version');
  });
});

describe('App Configuration', () => {
  test('App exports an Express application', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });

  test('App has JSON body parser configured', async () => {
    const response = await request(app)
      .post('/provision')
      .send({ test: 'data' })
      .set('Content-Type', 'application/json');

    // Response should be JSON (body parser works), regardless of status code
    // Status may be 401/500 due to missing API key or config - that's expected
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toBeDefined();
  });
});
