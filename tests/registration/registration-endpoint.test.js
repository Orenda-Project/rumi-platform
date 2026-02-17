/**
 * Registration Endpoint Tests
 *
 * Tests the endpoint handler for WhatsApp Flow registration (PROJ-010).
 * Validates screen routing, BACK navigation, and Redis data persistence.
 *
 * TDD: Written BEFORE copying registration-endpoint.js from production.
 *
 * Bead: bd-396
 */

// Mock redis before requiring the module
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => {
  const store = {};
  return {
    get: jest.fn(async (key) => store[key] || null),
    set: jest.fn(async (key, value) => { store[key] = value; }),
    _store: store,
    _clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
});

jest.mock('../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn()
}));

const {
  handleRegistrationInit,
  handleRegistrationDataExchange,
  handleRegistrationBack,
  createErrorResponse
} = require('../../bot/shared/routes/registration-endpoint');

const redisService = require('../../bot/shared/services/cache/railway-redis.service');

describe('Registration Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisService._clear();
  });

  // -----------------------------------------------------------------------
  // INIT
  // -----------------------------------------------------------------------
  describe('handleRegistrationInit', () => {
    it('returns PERSONAL_INFO screen with countries dropdown', async () => {
      const result = await handleRegistrationInit('user-123');

      expect(result.screen).toBe('PERSONAL_INFO');
      expect(result.data.countries).toBeDefined();
      expect(Array.isArray(result.data.countries)).toBe(true);
      expect(result.data.countries.length).toBeGreaterThan(0);
      // Each country should have {id, title}
      expect(result.data.countries[0]).toHaveProperty('id');
      expect(result.data.countries[0]).toHaveProperty('title');
    });

    it('does not return regions on INIT (regions are on separate screen)', async () => {
      const result = await handleRegistrationInit('user-123');
      expect(result.data.regions).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // PERSONAL_INFO submission
  // -----------------------------------------------------------------------
  describe('PERSONAL_INFO submission', () => {
    it('routes PK users to REGION_INFO screen', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PERSONAL_INFO',
        { full_name: 'Ali Khan', country: 'PK' },
        'user-123:registration:12345'
      );

      expect(result.screen).toBe('REGION_INFO');
      expect(result.data.regions).toBeDefined();
      expect(Array.isArray(result.data.regions)).toBe(true);
    });

    it('routes non-PK users directly to PROFESSIONAL_INFO (skipping region)', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PERSONAL_INFO',
        { full_name: 'John Smith', country: 'US' },
        'user-123:registration:12345'
      );

      expect(result.screen).toBe('PROFESSIONAL_INFO');
      expect(result.data.organizations).toBeDefined();
      expect(result.data.grades).toBeDefined();
      expect(result.data.subjects).toBeDefined();
    });

    it('returns error if name is missing', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PERSONAL_INFO',
        { full_name: '', country: 'PK' },
        'user-123:registration:12345'
      );

      expect(result.data.error).toBeDefined();
    });

    it('returns error if country is missing', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PERSONAL_INFO',
        { full_name: 'Ali', country: '' },
        'user-123:registration:12345'
      );

      expect(result.data.error).toBeDefined();
    });

    it('stores partial data in Redis', async () => {
      await handleRegistrationDataExchange(
        'user-123',
        'PERSONAL_INFO',
        { full_name: 'Ali Khan', country: 'PK' },
        'token123'
      );

      expect(redisService.set).toHaveBeenCalledWith(
        'reg_flow:token123',
        expect.any(String),
        3600
      );
    });
  });

  // -----------------------------------------------------------------------
  // REGION_INFO submission
  // -----------------------------------------------------------------------
  describe('REGION_INFO submission', () => {
    it('navigates to PROFESSIONAL_INFO with dropdown data', async () => {
      // First, set up Redis with partial data from PERSONAL_INFO
      redisService._store['reg_flow:token123'] = JSON.stringify({
        full_name: 'Ali Khan',
        country: 'PK',
        region: null
      });

      const result = await handleRegistrationDataExchange(
        'user-123',
        'REGION_INFO',
        { region: 'punjab' },
        'token123'
      );

      expect(result.screen).toBe('PROFESSIONAL_INFO');
      expect(result.data.organizations).toBeDefined();
      expect(result.data.grades).toBeDefined();
      expect(result.data.subjects).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // PROFESSIONAL_INFO submission
  // -----------------------------------------------------------------------
  describe('PROFESSIONAL_INFO submission', () => {
    beforeEach(() => {
      redisService._store['reg_flow:token123'] = JSON.stringify({
        full_name: 'Ali Khan',
        country: 'PK',
        region: 'punjab'
      });
    });

    it('navigates to SUCCESS when org is not "other"', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PROFESSIONAL_INFO',
        { organization: 'taleemabad', school_name: 'ABC School', grade: 'grade_3', subjects: ['maths'] },
        'token123'
      );

      expect(result.screen).toBe('SUCCESS');
      expect(result.data.extension_message_response).toBeDefined();
      expect(result.data.extension_message_response.params.organization).toBe('taleemabad');
    });

    it('navigates to ORG_DETAILS when org is "other"', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PROFESSIONAL_INFO',
        { organization: 'other', school_name: 'My School', grade: 'grade_1', subjects: ['english'] },
        'token123'
      );

      expect(result.screen).toBe('ORG_DETAILS');
    });

    it('returns error if organization is missing', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PROFESSIONAL_INFO',
        { organization: '', school_name: 'School', grade: 'grade_1', subjects: [] },
        'token123'
      );

      expect(result.data.error).toBeDefined();
    });

    it('SUCCESS response includes all registration fields in params', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'PROFESSIONAL_INFO',
        { organization: 'fde', school_name: 'Test School', grade: 'grade_5', subjects: ['maths', 'english'] },
        'token123'
      );

      const params = result.data.extension_message_response.params;
      expect(params.full_name).toBe('Ali Khan');
      expect(params.country).toBe('PK');
      expect(params.region).toBe('punjab');
      expect(params.organization).toBe('fde');
      expect(params.school_name).toBe('Test School');
      expect(params.grade).toBe('grade_5');
      expect(params.subjects).toEqual(['maths', 'english']);
    });
  });

  // -----------------------------------------------------------------------
  // ORG_DETAILS submission
  // -----------------------------------------------------------------------
  describe('ORG_DETAILS submission', () => {
    beforeEach(() => {
      redisService._store['reg_flow:token123'] = JSON.stringify({
        full_name: 'Ali Khan',
        country: 'PK',
        region: 'punjab',
        organization: 'other',
        school_name: 'My School',
        grade: 'grade_1',
        subjects: ['english']
      });
    });

    it('navigates to SUCCESS with organization_other in params', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'ORG_DETAILS',
        { organization_other: 'Custom NGO' },
        'token123'
      );

      expect(result.screen).toBe('SUCCESS');
      expect(result.data.extension_message_response.params.organization_other).toBe('Custom NGO');
    });

    it('returns error if organization_other is empty', async () => {
      const result = await handleRegistrationDataExchange(
        'user-123',
        'ORG_DETAILS',
        { organization_other: '' },
        'token123'
      );

      expect(result.data.error).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // BACK navigation
  // -----------------------------------------------------------------------
  describe('handleRegistrationBack', () => {
    it('REGION_INFO → PERSONAL_INFO', async () => {
      const result = await handleRegistrationBack('user-123', 'REGION_INFO', 'token123');
      expect(result.screen).toBe('PERSONAL_INFO');
      expect(result.data.countries).toBeDefined();
    });

    it('PROFESSIONAL_INFO → REGION_INFO for PK user', async () => {
      redisService._store['reg_flow:token123'] = JSON.stringify({
        full_name: 'Ali',
        country: 'PK',
        region: 'punjab'
      });

      const result = await handleRegistrationBack('user-123', 'PROFESSIONAL_INFO', 'token123');
      expect(result.screen).toBe('REGION_INFO');
      expect(result.data.regions).toBeDefined();
    });

    it('PROFESSIONAL_INFO → PERSONAL_INFO for non-PK user', async () => {
      redisService._store['reg_flow:token123'] = JSON.stringify({
        full_name: 'John',
        country: 'US',
        region: null
      });

      const result = await handleRegistrationBack('user-123', 'PROFESSIONAL_INFO', 'token123');
      expect(result.screen).toBe('PERSONAL_INFO');
      expect(result.data.countries).toBeDefined();
    });

    it('ORG_DETAILS → PROFESSIONAL_INFO', async () => {
      const result = await handleRegistrationBack('user-123', 'ORG_DETAILS', 'token123');
      expect(result.screen).toBe('PROFESSIONAL_INFO');
      expect(result.data.organizations).toBeDefined();
      expect(result.data.grades).toBeDefined();
      expect(result.data.subjects).toBeDefined();
    });

    it('default → PERSONAL_INFO', async () => {
      const result = await handleRegistrationBack('user-123', 'UNKNOWN_SCREEN', 'token123');
      expect(result.screen).toBe('PERSONAL_INFO');
    });
  });

  // -----------------------------------------------------------------------
  // Error helper
  // -----------------------------------------------------------------------
  describe('createErrorResponse', () => {
    it('creates error response with message', () => {
      const result = createErrorResponse('Test error');
      expect(result.data.error.message).toBe('Test error');
    });
  });
});
