/**
 * Materialized Views Service
 *
 * Provides fast access to pre-computed dashboard statistics via PostgreSQL materialized views.
 * This replaces the 17-query getDashboardStats() pattern with single-view reads.
 *
 * Performance improvement: 500-800ms → <50ms
 *
 * Views managed:
 * - mv_dashboard_stats: All dashboard statistics in one row
 * - mv_users_activity: Users with pre-computed last_activity (replaces 99ms JOIN)
 * - mv_retention_cohorts: Pre-computed retention data (replaces 317ms function)
 *
 * Refresh strategy:
 * - Background refresh every 5 minutes via pg_cron or application scheduler
 * - CONCURRENTLY refresh allows reads during refresh
 * - Staleness indicator when data is older than threshold
 *
 * @module materialized-views.service
 * @bead bd-044
 *
 * References:
 * - https://sngeth.com/rails/performance/postgresql/2025/10/03/materialized-views-performance-case-study/
 * - https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html
 */

const STALE_THRESHOLD_MINUTES = 5; // Consider data stale after 5 minutes
const VIEW_NAMES = [
  'mv_dashboard_stats',
  'mv_users_activity',
  'mv_retention_cohorts',
  'mv_dashboard_stats_by_country'  // bd-045: Pre-aggregated country stats for partners
];

/**
 * Get dashboard stats from materialized view
 * Replaces 17 parallel queries with single view read
 *
 * @param {Object} dbClient - Database client with RLS context
 * @returns {Object|null} Dashboard stats or null if view doesn't exist
 */
async function getDashboardStatsFromView(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        total_users,
        total_messages,
        voice_notes_received,
        daily_active_users,
        weekly_active_users,
        total_sessions,
        sessions_today,
        sessions_this_week,
        avg_session_length,
        avg_messages_per_session,
        total_lesson_plans,
        total_presentations,
        total_coaching_sessions,
        total_videos_generated,
        total_reading_assessments,
        registration_rate,
        feature_discovery_rate,
        last_refreshed
      FROM mv_dashboard_stats
      LIMIT 1
    `);

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const lastRefreshed = new Date(row.last_refreshed);
    const staleMinutes = Math.floor((Date.now() - lastRefreshed.getTime()) / 60000);

    return {
      // Map snake_case to camelCase for frontend compatibility
      totalUsers: parseInt(row.total_users),
      totalMessages: parseInt(row.total_messages),
      voiceNotesReceived: parseInt(row.voice_notes_received),
      dailyActiveUsers: parseInt(row.daily_active_users),
      weeklyActiveUsers: parseInt(row.weekly_active_users),
      totalSessions: parseInt(row.total_sessions),
      sessionsToday: parseInt(row.sessions_today),
      sessionsThisWeek: parseInt(row.sessions_this_week),
      avgSessionLength: parseFloat(row.avg_session_length),
      avgMessagesPerSession: parseFloat(row.avg_messages_per_session),
      totalLessonPlans: parseInt(row.total_lesson_plans),
      totalPresentations: parseInt(row.total_presentations),
      totalCompletedCoachingSessions: parseInt(row.total_coaching_sessions),
      totalVideosGenerated: parseInt(row.total_videos_generated),
      totalReadingAssessments: parseInt(row.total_reading_assessments),
      registrationRate: parseFloat(row.registration_rate),
      featureDiscoveryRate: parseFloat(row.feature_discovery_rate),
      lastRefreshed,
      isStale: staleMinutes >= STALE_THRESHOLD_MINUTES,
      staleMinutes
    };
  } catch (error) {
    // View might not exist yet
    if (error.message.includes('does not exist')) {
      console.warn('[MaterializedViews] mv_dashboard_stats does not exist, migration pending');
      return null;
    }
    console.error('[MaterializedViews] getDashboardStatsFromView error:', error.message);
    return null;
  }
}

/**
 * Get users with pre-computed last_activity from materialized view
 * Replaces 99ms LEFT JOIN query
 *
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} limit - Number of users to return
 * @param {number} offset - Offset for pagination
 * @returns {Array} Users with last_activity
 */
async function getUsersWithActivityFromView(dbClient, limit = 100, offset = 0) {
  try {
    const result = await dbClient.query(`
      SELECT
        id,
        phone_number,
        name,
        first_name,
        last_name,
        registration_completed,
        registration_state,
        registration_started_at,
        registration_completed_at,
        registration_state_updated_at,
        created_at,
        last_activity,
        total_messages,
        last_refreshed
      FROM mv_users_activity
      ORDER BY last_activity DESC NULLS LAST, created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return result.rows;
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.warn('[MaterializedViews] mv_users_activity does not exist, migration pending');
      return [];
    }
    console.error('[MaterializedViews] getUsersWithActivityFromView error:', error.message);
    return [];
  }
}

/**
 * Get retention cohorts from materialized view
 * Replaces 317ms calculate_retention() function
 *
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} featureType - 'overall', 'coaching', 'lesson_plans', 'reading'
 * @returns {Array} Retention cohorts
 */
async function getRetentionFromView(dbClient, featureType = 'overall') {
  const startTime = Date.now();
  try {
    console.log(`[MaterializedViews] getRetentionFromView called for featureType=${featureType}`);
    const result = await dbClient.query(`
      SELECT
        cohort_week,
        cohort_size,
        day0_activation_pct,
        week1_users,
        week1_pct,
        week2_users,
        week2_pct,
        week3_users,
        week3_pct,
        week4_users,
        week4_pct,
        has_week2_data,
        has_week3_data,
        has_week4_data,
        last_refreshed
      FROM mv_retention_cohorts
      WHERE feature_type = $1
      ORDER BY cohort_week DESC
    `, [featureType]);

    console.log(`[MaterializedViews] getRetentionFromView returned ${result.rows.length} rows in ${Date.now() - startTime}ms`);
    return result.rows;
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.warn('[MaterializedViews] mv_retention_cohorts does not exist, migration pending');
      return [];
    }
    console.error(`[MaterializedViews] getRetentionFromView error (${Date.now() - startTime}ms):`, error.message);
    return [];
  }
}

/**
 * Refresh all materialized views
 * Uses CONCURRENTLY to allow reads during refresh
 *
 * @param {Object} dbClient - Database client with RLS context
 * @returns {Object} Refresh result with timing
 */
async function refreshAllViews(dbClient) {
  const results = {
    refreshedAt: new Date(),
    views: [],
    errors: [],
    timings: {}
  };

  for (const viewName of VIEW_NAMES) {
    const startTime = Date.now();
    try {
      await dbClient.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
      results.views.push(viewName);
      results.timings[viewName] = Date.now() - startTime;
    } catch (error) {
      results.errors.push(`${viewName}: ${error.message}`);
      console.error(`[MaterializedViews] Failed to refresh ${viewName}:`, error.message);
    }
  }

  // Also refresh the status view
  try {
    await dbClient.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_view_refresh_status');
    results.views.push('mv_view_refresh_status');
  } catch (error) {
    // Status view is optional, don't fail if it doesn't exist
  }

  console.log(`[MaterializedViews] Refreshed ${results.views.length} views in ${JSON.stringify(results.timings)}`);
  return results;
}

/**
 * Refresh a single materialized view
 *
 * @param {Object} dbClient - Database client
 * @param {string} viewName - Name of the view to refresh
 * @returns {Object} Refresh result
 */
async function refreshView(dbClient, viewName) {
  const startTime = Date.now();
  try {
    await dbClient.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
    return {
      success: true,
      viewName,
      duration: Date.now() - startTime
    };
  } catch (error) {
    console.error(`[MaterializedViews] Failed to refresh ${viewName}:`, error.message);
    return {
      success: false,
      viewName,
      error: error.message
    };
  }
}

/**
 * Get status of all materialized views
 *
 * @param {Object} dbClient - Database client
 * @returns {Array} View status information
 */
async function getViewStatus(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        view_name,
        last_refresh,
        row_count,
        EXTRACT(EPOCH FROM (NOW() - last_refresh)) / 60 AS minutes_since_refresh
      FROM mv_view_refresh_status
    `);

    return result.rows.map(row => ({
      view_name: row.view_name,
      last_refresh: row.last_refresh,
      row_count: parseInt(row.row_count),
      minutesSinceRefresh: Math.floor(parseFloat(row.minutes_since_refresh)),
      needsRefresh: parseFloat(row.minutes_since_refresh) >= STALE_THRESHOLD_MINUTES
    }));
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return [];
    }
    console.error('[MaterializedViews] getViewStatus error:', error.message);
    return [];
  }
}

/**
 * Check if materialized views exist in the database
 *
 * @param {Object} dbClient - Database client
 * @returns {boolean} True if views exist
 */
async function viewsExist(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_dashboard_stats'
      ) as exists
    `);
    return result.rows[0]?.exists || false;
  } catch (error) {
    console.error('[MaterializedViews] viewsExist check error:', error.message);
    return false;
  }
}

/**
 * Get total user count from materialized view (for pagination)
 *
 * @param {Object} dbClient - Database client
 * @returns {number} Total user count
 */
async function getTotalUserCountFromView(dbClient) {
  try {
    const result = await dbClient.query('SELECT COUNT(*) FROM mv_users_activity');
    return parseInt(result.rows[0].count);
  } catch (error) {
    return 0;
  }
}

// ============================================
// PARTNER SCOPE FUNCTIONS (bd-045)
// ============================================

/**
 * Build WHERE clause for partner scope filtering
 * SECURITY CRITICAL: This function enforces partner data boundaries
 *
 * @param {Object} scope - { type, value } from access_scopes table
 * @param {number} startParamIndex - Starting parameter index for SQL params
 * @returns {{ whereClause: string, params: Array }} SQL clause and parameters
 * @throws {Error} If scope is null/invalid or scope type is unknown
 * @private
 */
function buildScopeWhereClause(scope, startParamIndex = 3) {
  // SECURITY: Null scope must throw, never bypass
  if (!scope || typeof scope !== 'object') {
    throw new Error('[MaterializedViews] SECURITY: Scope is required and must be an object');
  }

  if (!scope.type) {
    throw new Error('[MaterializedViews] SECURITY: Scope type is required');
  }

  let whereClause = 'WHERE is_test_user = false';
  const params = [];
  let paramIndex = startParamIndex;

  switch (scope.type) {
    case 'all':
      // No additional filter (super admin / portal admin with all access)
      break;

    case 'country':
      // SECURITY: Empty country codes means no access, not all access
      if (!scope.value?.country_codes?.length) {
        throw new Error('[MaterializedViews] SECURITY: Country scope requires country_codes array');
      }
      // Normalize country codes (strip + prefix)
      const countryCodes = scope.value.country_codes.map(c =>
        String(c).replace(/^\+/, '').trim()
      );
      whereClause += ` AND country_code = ANY($${paramIndex})`;
      params.push(countryCodes);
      paramIndex++;
      break;

    case 'school':
      // SECURITY: Empty school names means no access, not all access
      if (!scope.value?.school_names?.length) {
        throw new Error('[MaterializedViews] SECURITY: School scope requires school_names array');
      }
      // Normalize school names (lowercase + trim)
      const schools = scope.value.school_names.map(s =>
        String(s).toLowerCase().trim()
      );
      whereClause += ` AND school_name_lower = ANY($${paramIndex})`;
      params.push(schools);
      paramIndex++;
      break;

    case 'phone_list':
      // SECURITY: Empty phone list means no access, not all access
      if (!scope.value?.phone_numbers?.length) {
        throw new Error('[MaterializedViews] SECURITY: Phone list scope requires phone_numbers array');
      }
      whereClause += ` AND phone_number = ANY($${paramIndex})`;
      params.push(scope.value.phone_numbers);
      paramIndex++;
      break;

    case 'combined':
      // Combined scope: Country OR School OR Phone List (union)
      const conditions = [];

      if (scope.value?.country_codes?.length) {
        const codes = scope.value.country_codes.map(c =>
          String(c).replace(/^\+/, '').trim()
        );
        conditions.push(`country_code = ANY($${paramIndex})`);
        params.push(codes);
        paramIndex++;
      }

      if (scope.value?.school_names?.length) {
        const schoolNames = scope.value.school_names.map(s =>
          String(s).toLowerCase().trim()
        );
        conditions.push(`school_name_lower = ANY($${paramIndex})`);
        params.push(schoolNames);
        paramIndex++;
      }

      if (scope.value?.phone_numbers?.length) {
        conditions.push(`phone_number = ANY($${paramIndex})`);
        params.push(scope.value.phone_numbers);
        paramIndex++;
      }

      // SECURITY: Combined scope with no conditions means no access
      if (conditions.length === 0) {
        throw new Error('[MaterializedViews] SECURITY: Combined scope requires at least one filter');
      }

      whereClause += ` AND (${conditions.join(' OR ')})`;
      break;

    default:
      // SECURITY: Unknown scope type must throw, never bypass
      throw new Error(`[MaterializedViews] SECURITY: Unknown scope type: ${scope.type}`);
  }

  return { whereClause, params };
}

/**
 * Get users filtered by partner scope
 * Uses MV with dimension filtering instead of RLS for performance
 *
 * SECURITY: Partners ONLY see users within their assigned scope
 *
 * @param {Object} dbClient - Database client
 * @param {Object} scope - { type, value } from access_scopes table
 * @param {number} limit - Pagination limit (default 100)
 * @param {number} offset - Pagination offset (default 0)
 * @returns {Array} Scoped users
 * @throws {Error} If scope is null/invalid
 * @bead bd-045
 */
async function getUsersWithScopeFromView(dbClient, scope, limit = 100, offset = 0) {
  const startTime = Date.now();

  try {
    // Build scope WHERE clause (starts at param index 3 because $1=limit, $2=offset)
    const { whereClause, params: scopeParams } = buildScopeWhereClause(scope, 3);

    // Build full params array: [limit, offset, ...scopeParams]
    const params = [limit, offset, ...scopeParams];

    const result = await dbClient.query(`
      SELECT
        id,
        phone_number,
        country_code,
        school_name_lower,
        is_test_user,
        name,
        first_name,
        last_name,
        role,
        preferred_language,
        registration_completed,
        registration_state,
        registration_started_at,
        registration_completed_at,
        registration_state_updated_at,
        created_at,
        last_activity,
        total_messages,
        user_messages,
        voice_messages,
        last_refreshed
      FROM mv_users_activity
      ${whereClause}
      ORDER BY last_activity DESC NULLS LAST
      LIMIT $1 OFFSET $2
    `, params);

    const duration = Date.now() - startTime;
    console.log(`[MaterializedViews] getUsersWithScopeFromView: scope=${scope.type}, returned ${result.rows.length} users in ${duration}ms`);

    return result.rows;
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.warn('[MaterializedViews] mv_users_activity does not exist, migration 024 pending');
      return [];
    }
    // Rethrow security errors
    if (error.message.includes('SECURITY')) {
      throw error;
    }
    console.error('[MaterializedViews] getUsersWithScopeFromView error:', error.message);
    throw error;
  }
}

/**
 * Get dashboard stats aggregated for a partner scope
 * Fast path: Country scope uses pre-aggregated mv_dashboard_stats_by_country
 * Slow path: Other scopes aggregate from mv_users_activity
 *
 * SECURITY: Stats are ONLY for users within partner's scope
 *
 * @param {Object} dbClient - Database client
 * @param {Object} scope - Partner scope { type, value }
 * @returns {Object} Dashboard stats for scope
 * @throws {Error} If scope is null/invalid
 * @bead bd-045
 */
async function getDashboardStatsForScope(dbClient, scope) {
  const startTime = Date.now();

  try {
    // SECURITY: Validate scope
    if (!scope || typeof scope !== 'object' || !scope.type) {
      throw new Error('[MaterializedViews] SECURITY: Valid scope required for getDashboardStatsForScope');
    }

    // FAST PATH: Country scope uses pre-aggregated MV
    if (scope.type === 'country' && scope.value?.country_codes?.length) {
      const codes = scope.value.country_codes.map(c =>
        String(c).replace(/^\+/, '').trim()
      );

      const result = await dbClient.query(`
        SELECT
          COALESCE(SUM(total_users), 0) AS total_users,
          COALESCE(SUM(registered_users), 0) AS registered_users,
          COALESCE(SUM(total_messages), 0) AS total_messages,
          COALESCE(SUM(daily_active_users), 0) AS daily_active_users,
          COALESCE(SUM(weekly_active_users), 0) AS weekly_active_users,
          COALESCE(SUM(total_lesson_plans), 0) AS total_lesson_plans,
          COALESCE(SUM(total_coaching_sessions), 0) AS total_coaching_sessions,
          COALESCE(SUM(total_reading_assessments), 0) AS total_reading_assessments,
          COALESCE(SUM(total_video_requests), 0) AS total_video_requests
        FROM mv_dashboard_stats_by_country
        WHERE country_code = ANY($1)
      `, [codes]);

      const duration = Date.now() - startTime;
      console.log(`[MaterializedViews] getDashboardStatsForScope (country fast path): ${codes.join(',')} in ${duration}ms`);

      return mapStatsRow(result.rows[0]);
    }

    // AGGREGATION PATH: All other scope types aggregate from mv_users_activity
    const { whereClause, params } = buildScopeWhereClause(scope, 1);

    const result = await dbClient.query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE registration_completed = true) AS registered_users,
        COALESCE(SUM(total_messages), 0) AS total_messages,
        COUNT(*) FILTER (WHERE last_activity >= NOW() - INTERVAL '1 day') AS daily_active_users,
        COUNT(*) FILTER (WHERE last_activity >= NOW() - INTERVAL '7 days') AS weekly_active_users
      FROM mv_users_activity
      ${whereClause}
    `, params);

    const duration = Date.now() - startTime;
    console.log(`[MaterializedViews] getDashboardStatsForScope (aggregation path): scope=${scope.type} in ${duration}ms`);

    return mapStatsRow(result.rows[0]);
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.warn('[MaterializedViews] MV does not exist, migration 024 pending');
      return mapStatsRow({});
    }
    // Rethrow security errors
    if (error.message.includes('SECURITY')) {
      throw error;
    }
    console.error('[MaterializedViews] getDashboardStatsForScope error:', error.message);
    throw error;
  }
}

/**
 * Get total user count for a partner scope (for pagination)
 *
 * @param {Object} dbClient - Database client
 * @param {Object} scope - Partner scope { type, value }
 * @returns {number} Total user count within scope
 * @bead bd-045
 */
async function getTotalUserCountForScope(dbClient, scope) {
  try {
    const { whereClause, params } = buildScopeWhereClause(scope, 1);

    const result = await dbClient.query(`
      SELECT COUNT(*) AS count
      FROM mv_users_activity
      ${whereClause}
    `, params);

    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return 0;
    }
    if (error.message.includes('SECURITY')) {
      throw error;
    }
    console.error('[MaterializedViews] getTotalUserCountForScope error:', error.message);
    return 0;
  }
}

/**
 * Map database stats row to frontend-compatible object
 * Handles null values gracefully
 *
 * @param {Object} row - Database row
 * @returns {Object} Mapped stats object
 * @private
 */
function mapStatsRow(row) {
  return {
    totalUsers: parseInt(row?.total_users || 0),
    registeredUsers: parseInt(row?.registered_users || 0),
    totalMessages: parseInt(row?.total_messages || 0),
    dailyActiveUsers: parseInt(row?.daily_active_users || 0),
    weeklyActiveUsers: parseInt(row?.weekly_active_users || 0),
    totalLessonPlans: parseInt(row?.total_lesson_plans || 0),
    totalCoachingSessions: parseInt(row?.total_coaching_sessions || 0),
    totalReadingAssessments: parseInt(row?.total_reading_assessments || 0),
    totalVideoRequests: parseInt(row?.total_video_requests || 0)
  };
}

module.exports = {
  // Global MV functions (super admin)
  getDashboardStatsFromView,
  getUsersWithActivityFromView,
  getRetentionFromView,
  refreshAllViews,
  refreshView,
  getViewStatus,
  viewsExist,
  getTotalUserCountFromView,

  // Partner scope functions (bd-045)
  getUsersWithScopeFromView,
  getDashboardStatsForScope,
  getTotalUserCountForScope,

  // Constants
  STALE_THRESHOLD_MINUTES,
  VIEW_NAMES
};
