/**
 * Provision endpoint comprehensive tests
 * Covers the full provisioning flow with mocks
 */

const request = require('supertest');

// Mock the provisioner services
jest.mock('../services/supabase-provisioner', () => {
  return jest.fn().mockImplementation(() => ({
    createProject: jest.fn().mockResolvedValue({
      id: 'mock-supabase-id',
      db_password: 'mock-password'
    }),
    waitForHealthy: jest.fn().mockResolvedValue({ status: 'ACTIVE_HEALTHY' }),
    getApiKeys: jest.fn().mockResolvedValue({
      anon_key: 'mock-anon-key',
      service_key: 'mock-service-key'
    }),
    runMigrations: jest.fn().mockResolvedValue({
      '00_complete-schema.sql': { status: 'applied' },
      '01_rls-policies.sql': { status: 'applied' },
      '02_seed-data.sql': { status: 'applied' }
    }),
    getConnectionDetails: jest.fn().mockReturnValue({
      host: 'db.mock-supabase-id.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'mock-password',
      connection_string: 'postgresql://postgres:mock-password@db.mock-supabase-id.supabase.co:5432/postgres',
      pooler_string: 'postgresql://postgres.mock-supabase-id:mock-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
    })
  }));
});

jest.mock('../services/railway-provisioner', () => {
  return jest.fn().mockImplementation(() => ({
    provisionComplete: jest.fn().mockResolvedValue({
      project: {
        id: 'mock-railway-id',
        name: 'rumi-test',
        url: 'https://railway.com/project/mock-railway-id'
      },
      botService: {
        id: 'mock-bot-service-id',
        name: 'bot',
        environmentId: 'mock-env-id'
      },
      domain: {
        url: 'https://mock-domain.up.railway.app',
        webhookUrl: 'https://mock-domain.up.railway.app/webhook',
        domain: 'mock-domain.up.railway.app'
      },
      redis: {
        serviceId: 'mock-redis-service',
        url: 'redis://redis.railway.internal:6379'
      },
      deployToken: {
        token: 'mock-deploy-token',
        name: 'test-deploy-token',
        usage: 'cd bot && RAILWAY_TOKEN=mock-deploy-token railway up --service bot'
      }
    })
  }));
});

let app;

beforeAll(() => {
  process.env.PROVISIONER_API_KEY = 'test-api-key';
  process.env.SUPABASE_ORG_ID = 'test-org';
  process.env.SUPABASE_ACCESS_TOKEN = 'test-token';
  process.env.RAILWAY_TEAM_TOKEN = 'test-railway-token';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // Clear module cache and reload
  jest.resetModules();
  app = require('../index');
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  app.deploymentStatus.clear();
});

describe('POST /provision - Full Flow', () => {
  test('successfully provisions infrastructure', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.1.1')
      .send({ deployment_name: 'test-org', region: 'ap-south-1' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('supabase');
    expect(response.body).toHaveProperty('railway');
    expect(response.body.supabase).toHaveProperty('project_id', 'mock-supabase-id');
    expect(response.body.railway).toHaveProperty('project_id', 'mock-railway-id');
  });

  test('updates deployment status during provisioning', async () => {
    await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.1.2')
      .send({ deployment_name: 'status-test', region: 'ap-south-1' });

    const status = app.deploymentStatus.get('status-test');
    expect(status).toHaveProperty('status', 'completed');
    expect(status).toHaveProperty('step', 'done');
  });

  test('returns validation error without deployment_name', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.1.3')
      .send({ region: 'ap-south-1' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'validation_error');
  });

  test('sanitizes deployment name', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.1.4')
      .send({ deployment_name: 'Test Org 123!@#$', region: 'ap-south-1' });

    expect(response.status).toBe(200);
    expect(response.body.deployment_name).toBe('test-org-123-');
  });

  test('returns next_steps array', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.1.5')
      .send({ deployment_name: 'next-steps-test' });

    expect(response.body).toHaveProperty('next_steps');
    expect(Array.isArray(response.body.next_steps)).toBe(true);
    expect(response.body.next_steps.length).toBeGreaterThan(0);
  });
});

describe('POST /provision - Edge Cases', () => {
  test('uses default region when not specified', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.10.1')
      .send({ deployment_name: 'no-region-test' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  test('uses default tier when not specified', async () => {
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.10.2')
      .send({ deployment_name: 'no-tier-test', region: 'eu-west-1' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  test('truncates long deployment names to 30 chars', async () => {
    const longName = 'this-is-a-very-long-deployment-name-that-exceeds-thirty-characters';
    const response = await request(app)
      .post('/provision')
      .set('X-Provisioner-Key', 'test-api-key')
      .set('X-Forwarded-For', '192.168.10.3')
      .send({ deployment_name: longName });

    expect(response.status).toBe(200);
    expect(response.body.deployment_name.length).toBeLessThanOrEqual(30);
  });
});
