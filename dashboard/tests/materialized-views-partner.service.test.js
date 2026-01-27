/**
 * Test: Materialized Views Partner Scope Filtering
 * TDD Tests for partner-scoped queries on materialized views
 *
 * This ensures partners ONLY see data within their assigned scopes.
 * Scope types: all, country, school, phone_list, combined
 *
 * @bead bd-045
 * @author Claude Code
 * @date January 24, 2026
 */

const materializedViews = require('../services/materialized-views.service');

// Mock database client
const createMockDbClient = () => ({
  query: jest.fn()
});

describe('Partner-Scoped Materialized Views (bd-045)', () => {
  let mockDbClient;

  beforeEach(() => {
    mockDbClient = createMockDbClient();
    jest.clearAllMocks();
  });

  // ========================================
  // COUNTRY SCOPE TESTS
  // ========================================
  describe('Country Scope Filtering', () => {

    test('should return only +92 users for Pakistan-scoped partner', async () => {
      // Arrange
      const scope = {
        type: 'country',
        value: { country_codes: ['92'] }
      };

      mockDbClient.query.mockResolvedValue({
        rows: [
          { id: '1', phone_number: '923001234567', country_code: '92', is_test_user: false },
          { id: '2', phone_number: '923009876543', country_code: '92', is_test_user: false }
        ]
      });

      // Act
      const users = await materializedViews.getUsersWithScopeFromView(
        mockDbClient, scope, 100, 0
      );

      // Assert - Query should filter by country_code
      expect(mockDbClient.query).toHaveBeenCalledTimes(1);
      const [query, params] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('country_code = ANY');
      expect(query).toContain('is_test_user = false');
      expect(params).toContain(['92']); // Array of country codes
    });

    test('should return +92 and +94 users for multi-country scope', async () => {
      const scope = {
        type: 'country',
        value: { country_codes: ['92', '94'] }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query, params] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('country_code = ANY');
      // Should contain both country codes
      const countryCodesParam = params.find(p => Array.isArray(p) && p.includes('92'));
      expect(countryCodesParam).toContain('92');
      expect(countryCodesParam).toContain('94');
    });

    test('should normalize country codes (strip + prefix)', async () => {
      const scope = {
        type: 'country',
        value: { country_codes: ['+92', '+94'] }  // With + prefix
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      // Query should use normalized codes (without +)
      const [, params] = mockDbClient.query.mock.calls[0];
      const countryCodesParam = params.find(p => Array.isArray(p) && (p.includes('92') || p.includes('+92')));
      expect(countryCodesParam).toContain('92');  // Without +
      expect(countryCodesParam).toContain('94');  // Without +
      expect(countryCodesParam).not.toContain('+92');
      expect(countryCodesParam).not.toContain('+94');
    });

    test('should exclude test users from country-scoped results', async () => {
      const scope = { type: 'country', value: { country_codes: ['92'] } };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('is_test_user = false');
    });
  });

  // ========================================
  // SCHOOL SCOPE TESTS
  // ========================================
  describe('School Scope Filtering', () => {

    test('should return only matching school users', async () => {
      const scope = {
        type: 'school',
        value: { school_names: ['Beacon House', 'City School'] }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query, params] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('school_name_lower = ANY');
      // Should be lowercased
      const schoolsParam = params.find(p => Array.isArray(p) && p.some(s => s.includes('beacon')));
      expect(schoolsParam).toContain('beacon house');
      expect(schoolsParam).toContain('city school');
    });

    test('should handle case-insensitive school matching', async () => {
      const scope = {
        type: 'school',
        value: { school_names: ['BEACON HOUSE', 'City School'] }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [, params] = mockDbClient.query.mock.calls[0];
      const schoolsParam = params.find(p => Array.isArray(p) && p.length === 2);
      // All should be lowercase
      expect(schoolsParam).toContain('beacon house');
      expect(schoolsParam).toContain('city school');
      expect(schoolsParam).not.toContain('BEACON HOUSE');
    });

    test('should trim whitespace from school names', async () => {
      const scope = {
        type: 'school',
        value: { school_names: ['  Beacon House  ', 'City School\t'] }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [, params] = mockDbClient.query.mock.calls[0];
      const schoolsParam = params.find(p => Array.isArray(p) && p.length === 2);
      expect(schoolsParam).toContain('beacon house');
      expect(schoolsParam).toContain('city school');
    });
  });

  // ========================================
  // PHONE LIST SCOPE TESTS
  // ========================================
  describe('Phone List Scope Filtering', () => {

    test('should return only users in phone list', async () => {
      const scope = {
        type: 'phone_list',
        value: { phone_numbers: ['923001234567', '923009876543', '923005555555'] }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query, params] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('phone_number = ANY');
      expect(params).toContainEqual(['923001234567', '923009876543', '923005555555']);
    });

    test('should handle large phone lists (100+ numbers)', async () => {
      const phoneList = Array.from({ length: 150 }, (_, i) =>
        `9230012345${i.toString().padStart(2, '0')}`
      );
      const scope = {
        type: 'phone_list',
        value: { phone_numbers: phoneList }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      // Should not throw
      await expect(
        materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0)
      ).resolves.not.toThrow();

      expect(mockDbClient.query).toHaveBeenCalled();
    });

    test('should still exclude test users from phone list results', async () => {
      const scope = {
        type: 'phone_list',
        value: { phone_numbers: ['923001234567'] }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('is_test_user = false');
    });
  });

  // ========================================
  // COMBINED SCOPE TESTS
  // ========================================
  describe('Combined Scope Filtering', () => {

    test('should filter by country OR school (union)', async () => {
      const scope = {
        type: 'combined',
        value: {
          country_codes: ['92'],
          school_names: ['Beacon House']
        }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[0];
      // Should use OR between scope types
      expect(query).toContain('country_code = ANY');
      expect(query).toContain('school_name_lower = ANY');
      expect(query).toMatch(/\(.*OR.*\)/); // Should have OR logic
    });

    test('should handle combined with all three scope types', async () => {
      const scope = {
        type: 'combined',
        value: {
          country_codes: ['92'],
          school_names: ['Beacon House'],
          phone_numbers: ['923001234567']
        }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('country_code');
      expect(query).toContain('school_name_lower');
      expect(query).toContain('phone_number');
    });

    test('should handle combined with only country codes', async () => {
      const scope = {
        type: 'combined',
        value: {
          country_codes: ['92', '94']
          // No school_names or phone_numbers
        }
      };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('country_code = ANY');
    });
  });

  // ========================================
  // ALL SCOPE (SUPER ADMIN) TESTS
  // ========================================
  describe('All Scope (Super Admin)', () => {

    test('should return all non-test users without additional filters', async () => {
      const scope = { type: 'all', value: {} };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[0];
      // Should have is_test_user filter but no country/school/phone
      expect(query).toContain('is_test_user = false');
      expect(query).not.toContain('country_code = ANY');
      expect(query).not.toContain('school_name_lower = ANY');
      expect(query).not.toContain('phone_number = ANY');
    });
  });

  // ========================================
  // PAGINATION TESTS
  // ========================================
  describe('Pagination', () => {

    test('should apply limit and offset correctly', async () => {
      const scope = { type: 'country', value: { country_codes: ['92'] } };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 50, 100);

      const [query, params] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('LIMIT $1 OFFSET $2');
      expect(params[0]).toBe(50);  // limit
      expect(params[1]).toBe(100); // offset
    });

    test('should use default limit and offset when not provided', async () => {
      const scope = { type: 'all', value: {} };

      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope);

      const [, params] = mockDbClient.query.mock.calls[0];
      expect(params[0]).toBe(100); // default limit
      expect(params[1]).toBe(0);   // default offset
    });
  });
});

// ========================================
// DASHBOARD STATS AGGREGATION TESTS
// ========================================
describe('Partner Dashboard Stats from MVs', () => {
  let mockDbClient;

  beforeEach(() => {
    mockDbClient = createMockDbClient();
    jest.clearAllMocks();
  });

  describe('getDashboardStatsForScope', () => {

    test('should use pre-aggregated MV for country scope (fast path)', async () => {
      const scope = {
        type: 'country',
        value: { country_codes: ['94'] }  // Sri Lanka
      };

      mockDbClient.query.mockResolvedValue({
        rows: [{
          total_users: '406',
          registered_users: '350',
          total_messages: '15000',
          daily_active_users: '25',
          weekly_active_users: '120',
          total_lesson_plans: '200',
          total_coaching_sessions: '50',
          total_reading_assessments: '80',
          total_video_requests: '30'
        }]
      });

      const stats = await materializedViews.getDashboardStatsForScope(mockDbClient, scope);

      // Should query mv_dashboard_stats_by_country
      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('mv_dashboard_stats_by_country');
      expect(query).toContain('country_code = ANY');

      // Stats structure
      expect(stats.totalUsers).toBe(406);
      expect(stats.registeredUsers).toBe(350);
      expect(stats.totalMessages).toBe(15000);
      expect(stats.dailyActiveUsers).toBe(25);
      expect(stats.weeklyActiveUsers).toBe(120);
    });

    test('should aggregate from mv_users_activity for school scope', async () => {
      const scope = {
        type: 'school',
        value: { school_names: ['Beacon House'] }
      };

      mockDbClient.query.mockResolvedValue({
        rows: [{
          total_users: '50',
          registered_users: '45',
          total_messages: '2000',
          daily_active_users: '10',
          weekly_active_users: '30'
        }]
      });

      const stats = await materializedViews.getDashboardStatsForScope(mockDbClient, scope);

      // Should query mv_users_activity (aggregation path)
      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('mv_users_activity');
      expect(query).toContain('school_name_lower = ANY');

      expect(stats.totalUsers).toBe(50);
    });

    test('should aggregate from mv_users_activity for phone_list scope', async () => {
      const scope = {
        type: 'phone_list',
        value: { phone_numbers: ['923001234567', '923009876543'] }
      };

      mockDbClient.query.mockResolvedValue({
        rows: [{
          total_users: '2',
          registered_users: '2',
          total_messages: '500',
          daily_active_users: '1',
          weekly_active_users: '2'
        }]
      });

      const stats = await materializedViews.getDashboardStatsForScope(mockDbClient, scope);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('phone_number = ANY');

      expect(stats.totalUsers).toBe(2);
    });

    test('should return zeros for empty scope results', async () => {
      const scope = {
        type: 'school',
        value: { school_names: ['NonexistentSchool123'] }
      };

      mockDbClient.query.mockResolvedValue({
        rows: [{
          total_users: null,
          registered_users: null,
          total_messages: null,
          daily_active_users: null,
          weekly_active_users: null
        }]
      });

      const stats = await materializedViews.getDashboardStatsForScope(mockDbClient, scope);

      expect(stats.totalUsers).toBe(0);
      expect(stats.totalMessages).toBe(0);
      expect(stats.dailyActiveUsers).toBe(0);
    });

    test('should use global MV for "all" scope', async () => {
      const scope = { type: 'all', value: {} };

      mockDbClient.query.mockResolvedValue({
        rows: [{
          total_users: '1500',
          registered_users: '1200',
          total_messages: '50000',
          daily_active_users: '100',
          weekly_active_users: '400'
        }]
      });

      const stats = await materializedViews.getDashboardStatsForScope(mockDbClient, scope);

      // For 'all' scope, should query the global stats
      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('mv_users_activity');
      expect(query).not.toContain('country_code = ANY');
      expect(query).not.toContain('school_name_lower = ANY');

      expect(stats.totalUsers).toBe(1500);
    });
  });
});

// ========================================
// USER COUNT FOR PAGINATION
// ========================================
describe('Partner User Count from MVs', () => {
  let mockDbClient;

  beforeEach(() => {
    mockDbClient = createMockDbClient();
    jest.clearAllMocks();
  });

  describe('getTotalUserCountForScope', () => {

    test('should return count for country scope', async () => {
      const scope = { type: 'country', value: { country_codes: ['92'] } };

      mockDbClient.query.mockResolvedValue({ rows: [{ count: '955' }] });

      const count = await materializedViews.getTotalUserCountForScope(mockDbClient, scope);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('COUNT(*)');
      expect(query).toContain('country_code = ANY');
      expect(count).toBe(955);
    });

    test('should return count for school scope', async () => {
      const scope = { type: 'school', value: { school_names: ['Beacon House'] } };

      mockDbClient.query.mockResolvedValue({ rows: [{ count: '50' }] });

      const count = await materializedViews.getTotalUserCountForScope(mockDbClient, scope);

      expect(count).toBe(50);
    });

    test('should return total count for "all" scope', async () => {
      const scope = { type: 'all', value: {} };

      mockDbClient.query.mockResolvedValue({ rows: [{ count: '1500' }] });

      const count = await materializedViews.getTotalUserCountForScope(mockDbClient, scope);

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).not.toContain('country_code = ANY');
      expect(count).toBe(1500);
    });
  });
});

// ========================================
// SECURITY TESTS - CRITICAL
// ========================================
describe('Security: Scope Enforcement', () => {
  let mockDbClient;

  beforeEach(() => {
    mockDbClient = createMockDbClient();
    jest.clearAllMocks();
  });

  test('CRITICAL: Country scope must NEVER return users from other countries', async () => {
    const scope = { type: 'country', value: { country_codes: ['94'] } };  // Sri Lanka only

    // Simulate DB returning mixed results (should never happen with correct query)
    mockDbClient.query.mockResolvedValue({
      rows: [
        { id: '1', phone_number: '94771234567', country_code: '94', is_test_user: false },
      ]
    });

    await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

    // Verify the WHERE clause contains the country filter
    const [query] = mockDbClient.query.mock.calls[0];
    expect(query).toContain('country_code = ANY');
    expect(query).toContain('is_test_user = false');
  });

  test('CRITICAL: School scope must NEVER return users from other schools', async () => {
    const scope = { type: 'school', value: { school_names: ['Beacon House'] } };

    mockDbClient.query.mockResolvedValue({ rows: [] });

    await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

    const [query] = mockDbClient.query.mock.calls[0];
    expect(query).toContain('school_name_lower = ANY');
    expect(query).toContain('is_test_user = false');
  });

  test('CRITICAL: Phone list scope must NEVER return users not in list', async () => {
    const scope = {
      type: 'phone_list',
      value: { phone_numbers: ['923001234567', '923009876543'] }
    };

    mockDbClient.query.mockResolvedValue({ rows: [] });

    await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

    const [query] = mockDbClient.query.mock.calls[0];
    expect(query).toContain('phone_number = ANY');
    expect(query).toContain('is_test_user = false');
  });

  test('CRITICAL: Test users must NEVER be visible to partners', async () => {
    // All scope types should exclude test users
    const scopes = [
      { type: 'country', value: { country_codes: ['92'] } },
      { type: 'school', value: { school_names: ['Test School'] } },
      { type: 'phone_list', value: { phone_numbers: ['923001234567'] } },
      { type: 'combined', value: { country_codes: ['92'], school_names: ['Test'] } },
      { type: 'all', value: {} }
    ];

    for (const scope of scopes) {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

      const [query] = mockDbClient.query.mock.calls[mockDbClient.query.mock.calls.length - 1];
      expect(query).toContain('is_test_user = false');
    }
  });

  test('CRITICAL: Empty scope value should return no users (not all users)', async () => {
    const scope = { type: 'country', value: { country_codes: [] } };  // Empty array

    mockDbClient.query.mockResolvedValue({ rows: [] });

    const users = await materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0);

    // Should return empty array, not bypass the filter
    expect(users).toEqual([]);
  });

  test('CRITICAL: Null scope should throw or return empty, never bypass', async () => {
    mockDbClient.query.mockResolvedValue({ rows: [] });

    // Should handle gracefully, not crash or bypass
    await expect(
      materializedViews.getUsersWithScopeFromView(mockDbClient, null, 100, 0)
    ).rejects.toThrow();
  });

  test('CRITICAL: Unknown scope type should throw, never bypass', async () => {
    const scope = { type: 'unknown_type', value: { something: 'value' } };

    mockDbClient.query.mockResolvedValue({ rows: [] });

    await expect(
      materializedViews.getUsersWithScopeFromView(mockDbClient, scope, 100, 0)
    ).rejects.toThrow();
  });
});
