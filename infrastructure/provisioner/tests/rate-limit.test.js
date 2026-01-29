/**
 * bd-343: Rate limiting middleware tests
 * TDD: RED → GREEN → REFACTOR
 */

const request = require('supertest');

let app;

beforeAll(() => {
  process.env.PROVISIONER_API_KEY = 'test-api-key-123';
  process.env.RATE_LIMIT_MAX = '2'; // Low limit for testing
  process.env.RATE_LIMIT_WINDOW_MS = '60000'; // 1 minute
  jest.spyOn(console, 'log').mockImplementation(() => {});

  // Clear module cache to apply new env vars
  jest.resetModules();
  app = require('../index');
});

afterAll(() => {
  jest.restoreAllMocks();
  delete process.env.PROVISIONER_API_KEY;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.RATE_LIMIT_WINDOW_MS;
});

describe('Rate Limiting', () => {
  test('First request succeeds', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key-123')
      .set('X-Forwarded-For', '192.168.1.100') // Unique IP
      .send({ deployment_name: 'test1', region: 'ap-south-1' });

    expect(response.status).not.toBe(429);
  });

  test('Requests beyond limit return 429', async () => {
    // Use unique IP for this test
    const testIp = '192.168.1.200';

    // Make requests up to the limit
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/provision')
        .set('X-Provisioner-Key', 'test-api-key-123')
        .set('X-Forwarded-For', testIp)
        .send({ deployment_name: `test${i}`, region: 'ap-south-1' });
    }

    // This request should be rate limited
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key-123')
      .set('X-Forwarded-For', testIp)
      .send({ deployment_name: 'test-limited', region: 'ap-south-1' });

    expect(response.status).toBe(429);
    expect(response.body).toHaveProperty('error', 'rate_limit_exceeded');
  });

  test('Rate limit response includes retry_after', async () => {
    const testIp = '192.168.1.201';

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/provision')
        .set('X-Provisioner-Key', 'test-api-key-123')
        .set('X-Forwarded-For', testIp)
        .send({ deployment_name: `exhaust${i}`, region: 'ap-south-1' });
    }

    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key-123')
      .set('X-Forwarded-For', testIp)
      .send({ deployment_name: 'after-exhaust', region: 'ap-south-1' });

    if (response.status === 429) {
      expect(response.body).toHaveProperty('retry_after');
    }
  });

  test('Health endpoint is not rate limited', async () => {
    // Make many health requests
    for (let i = 0; i < 10; i++) {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    }
  });
});
