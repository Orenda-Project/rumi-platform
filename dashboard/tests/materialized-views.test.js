/**
 * Test: Materialized Views Service
 *
 * TDD Tests for PostgreSQL materialized views for dashboard performance optimization
 *
 * Performance Goal: Reduce dashboard load from 500-800ms to <50ms
 * Strategy: Pre-compute expensive aggregations, refresh every 5 minutes
 *
 * Reference: https://sngeth.com/rails/performance/postgresql/2025/10/03/materialized-views-performance-case-study/
 *
 * @bead bd-044
 */

const materializedViews = require('../services/materialized-views.service');

// Mock the database client
const mockDbClient = {
  query: jest.fn()
};

describe('Materialized Views Service', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockDbClient.query.mockReset();
  });

  // ============================================================================
  // DASHBOARD STATS TESTS
  // ============================================================================
  describe('getDashboardStatsFromView', () => {

    test('should return pre-computed stats from materialized view', async () => {
      // Arrange: Mock the materialized view query result
      const mockStats = {
        rows: [{
          total_users: 1403,
          total_messages: 26085,
          voice_notes_received: 1250,
          daily_active_users: 44,
          weekly_active_users: 169,
          total_sessions: 3713,
          sessions_today: 42,
          sessions_this_week: 287,
          avg_session_length: 12.5,
          avg_messages_per_session: 7.2,
          total_lesson_plans: 1097,
          total_presentations: 450,
          total_coaching_sessions: 128,
          total_videos_generated: 89,
          total_reading_assessments: 156,
          registration_rate: 65.2,
          feature_discovery_rate: 43.8,
          last_refreshed: new Date('2026-01-23T10:00:00Z')
        }]
      };
      mockDbClient.query.mockResolvedValue(mockStats);

      // Act
      const result = await materializedViews.getDashboardStatsFromView(mockDbClient);

      // Assert: Single query to materialized view, not 17 queries
      expect(mockDbClient.query).toHaveBeenCalledTimes(1);
      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('mv_dashboard_stats')
      );
      expect(result.totalUsers).toBe(1403);
      expect(result.totalMessages).toBe(26085);
      expect(result.dailyActiveUsers).toBe(44);
      expect(result.lastRefreshed).toBeDefined();
    });

    test('should handle empty/null stats gracefully', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      const result = await materializedViews.getDashboardStatsFromView(mockDbClient);

      expect(result).toBeNull();
    });

    test('should include staleness indicator when data is older than threshold', async () => {
      // Stats refreshed 10 minutes ago (stale threshold is 5 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const mockStats = {
        rows: [{
          total_users: 1403,
          last_refreshed: tenMinutesAgo
        }]
      };
      mockDbClient.query.mockResolvedValue(mockStats);

      const result = await materializedViews.getDashboardStatsFromView(mockDbClient);

      expect(result.isStale).toBe(true);
      expect(result.staleMinutes).toBeGreaterThanOrEqual(10);
    });
  });

  // ============================================================================
  // USER ACTIVITY VIEW TESTS
  // ============================================================================
  describe('getUsersWithActivityFromView', () => {

    test('should return users with pre-computed last_activity', async () => {
      const mockUsers = {
        rows: [
          { id: 'uuid-1', name: 'Teacher A', last_activity: new Date('2026-01-23T09:00:00Z') },
          { id: 'uuid-2', name: 'Teacher B', last_activity: new Date('2026-01-22T15:30:00Z') }
        ]
      };
      mockDbClient.query.mockResolvedValue(mockUsers);

      const result = await materializedViews.getUsersWithActivityFromView(mockDbClient, 100, 0);

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('mv_users_activity'),
        [100, 0]
      );
      expect(result).toHaveLength(2);
      expect(result[0].last_activity).toBeDefined();
    });

    test('should support pagination with LIMIT and OFFSET', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getUsersWithActivityFromView(mockDbClient, 50, 100);

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [50, 100]
      );
    });
  });

  // ============================================================================
  // RETENTION VIEW TESTS
  // ============================================================================
  describe('getRetentionFromView', () => {

    test('should return pre-computed retention cohorts', async () => {
      const mockRetention = {
        rows: [
          {
            cohort_week: '2026-01-19',
            cohort_size: 254,
            week1_pct: 8.5,
            week2_pct: 6.2,
            has_week2_data: true
          },
          {
            cohort_week: '2026-01-12',
            cohort_size: 366,
            week1_pct: 9.1,
            week2_pct: 7.8,
            has_week2_data: true
          }
        ]
      };
      mockDbClient.query.mockResolvedValue(mockRetention);

      const result = await materializedViews.getRetentionFromView(mockDbClient, 'overall');

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('mv_retention_cohorts'),
        ['overall']
      );
      expect(result).toHaveLength(2);
      expect(result[0].cohort_size).toBe(254);
    });

    test('should filter by feature type', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.getRetentionFromView(mockDbClient, 'coaching');

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('feature_type = $1'),
        ['coaching']
      );
    });
  });

  // ============================================================================
  // REFRESH TESTS
  // ============================================================================
  describe('refreshViews', () => {

    test('should refresh all views concurrently', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.refreshAllViews(mockDbClient);

      // Should call REFRESH MATERIALIZED VIEW CONCURRENTLY for each view
      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats')
      );
      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_users_activity')
      );
      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_retention_cohorts')
      );
    });

    test('should record refresh timestamp', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      const result = await materializedViews.refreshAllViews(mockDbClient);

      expect(result.refreshedAt).toBeDefined();
      expect(result.views).toContain('mv_dashboard_stats');
    });

    test('should handle refresh failures gracefully', async () => {
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // First view succeeds
        .mockRejectedValueOnce(new Error('Connection timeout')) // Second view fails
        .mockResolvedValueOnce({ rows: [] }); // Third view succeeds

      const result = await materializedViews.refreshAllViews(mockDbClient);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('mv_users_activity');
    });

    test('should support individual view refresh', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      await materializedViews.refreshView(mockDbClient, 'mv_dashboard_stats');

      expect(mockDbClient.query).toHaveBeenCalledTimes(1);
      expect(mockDbClient.query).toHaveBeenCalledWith(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats'
      );
    });
  });

  // ============================================================================
  // VIEW STATUS TESTS
  // ============================================================================
  describe('getViewStatus', () => {

    test('should return refresh status for all views', async () => {
      const mockStatus = {
        rows: [
          { view_name: 'mv_dashboard_stats', last_refresh: new Date(), row_count: 1 },
          { view_name: 'mv_users_activity', last_refresh: new Date(), row_count: 1403 },
          { view_name: 'mv_retention_cohorts', last_refresh: new Date(), row_count: 12 }
        ]
      };
      mockDbClient.query.mockResolvedValue(mockStatus);

      const result = await materializedViews.getViewStatus(mockDbClient);

      expect(result).toHaveLength(3);
      expect(result[0].view_name).toBe('mv_dashboard_stats');
    });

    test('should indicate if refresh is needed', async () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const mockStatus = {
        rows: [
          { view_name: 'mv_dashboard_stats', last_refresh: thirtyMinutesAgo, row_count: 1 }
        ]
      };
      mockDbClient.query.mockResolvedValue(mockStatus);

      const result = await materializedViews.getViewStatus(mockDbClient);

      expect(result[0].needsRefresh).toBe(true);
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================
  describe('Performance benchmarks', () => {

    test('getDashboardStatsFromView should complete in <50ms', async () => {
      mockDbClient.query.mockResolvedValue({
        rows: [{ total_users: 1403, last_refreshed: new Date() }]
      });

      const start = Date.now();
      await materializedViews.getDashboardStatsFromView(mockDbClient);
      const duration = Date.now() - start;

      // Should be nearly instant since it's just reading from view
      expect(duration).toBeLessThan(50);
    });

    test('getUsersWithActivityFromView should be faster than JOIN query', async () => {
      mockDbClient.query.mockResolvedValue({ rows: [] });

      const start = Date.now();
      await materializedViews.getUsersWithActivityFromView(mockDbClient, 100, 0);
      const duration = Date.now() - start;

      // Should be <50ms (vs 99ms for JOIN query)
      expect(duration).toBeLessThan(50);
    });
  });

  // ============================================================================
  // FALLBACK TESTS
  // ============================================================================
  describe('Fallback to direct queries', () => {

    test('should fallback to direct queries if view does not exist', async () => {
      mockDbClient.query.mockRejectedValueOnce(
        new Error('relation "mv_dashboard_stats" does not exist')
      );

      const result = await materializedViews.getDashboardStatsFromView(mockDbClient);

      // Should return null and log warning (allows caller to fallback)
      expect(result).toBeNull();
    });

    test('should provide helper to check if views exist', async () => {
      mockDbClient.query.mockResolvedValue({
        rows: [{ exists: true }]
      });

      const exists = await materializedViews.viewsExist(mockDbClient);

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining("matviewname = 'mv_dashboard_stats'")
      );
      expect(exists).toBe(true);
    });
  });
});
