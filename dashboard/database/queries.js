/**
 * Database Queries for Admin Dashboard
 * Provides analytics and data retrieval functions
 *
 * UPDATED: January 12, 2026 - RLS enforcement via req.dbClient
 * All functions now accept dbClient as first parameter
 *
 * UPDATED: January 23, 2026 - Materialized views optimization
 * Added getDashboardStatsOptimized, getAllUsersOptimized with MV fallback
 */

const supabase = require('../config/supabase');
const materializedViews = require('../services/materialized-views.service');

/**
 * Get total number of users (chats started)
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 */
async function getTotalUsers(dbClient) {
  const result = await dbClient.query('SELECT COUNT(*) FROM users');
  return parseInt(result.rows[0].count);
}

/**
 * Get total voice notes received (from users)
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalVoiceNotesReceived(dbClient) {
  const result = await dbClient.query(`
    SELECT COUNT(*) FROM conversations
    WHERE role = $1 AND message_type = $2
  `, ['user', 'voice']);
  return parseInt(result.rows[0].count);
}

/**
 * Get total voice notes sent (by bot)
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalVoiceNotesSent(dbClient) {
  const result = await dbClient.query(`
    SELECT COUNT(*) FROM conversations
    WHERE role = $1 AND message_type = $2
  `, ['assistant', 'voice']);
  return parseInt(result.rows[0].count);
}

/**
 * Get total messages exchanged
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalMessages(dbClient) {
  const result = await dbClient.query('SELECT COUNT(*) FROM conversations');
  return parseInt(result.rows[0].count);
}

/**
 * Get Daily Active Users (users who sent messages in last 24 hours)
 * @param {Object} dbClient - Database client with RLS context
 */
async function getDailyActiveUsers(dbClient) {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const result = await dbClient.query(`
    SELECT COUNT(DISTINCT user_id) FROM conversations
    WHERE role = $1 AND created_at >= $2
  `, ['user', oneDayAgo.toISOString()]);

  return parseInt(result.rows[0].count);
}

/**
 * Get Weekly Active Users (users who sent messages in last 7 days)
 * @param {Object} dbClient - Database client with RLS context
 */
async function getWeeklyActiveUsers(dbClient) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await dbClient.query(`
    SELECT COUNT(DISTINCT user_id) FROM conversations
    WHERE role = $1 AND created_at >= $2
  `, ['user', sevenDaysAgo.toISOString()]);

  return parseInt(result.rows[0].count);
}

/**
 * Get all users with basic info including registration tracking
 * Sorted by most recent conversation (users with recent activity appear first)
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} limit - Number of users to return
 * @param {number} offset - Offset for pagination
 */
async function getAllUsers(dbClient, limit = 100, offset = 0) {
  // Direct SQL query with LEFT JOIN to get last activity
  // RLS policy automatically filters users based on access scope
  const result = await dbClient.query(`
    SELECT
      u.id,
      u.phone_number,
      u.name,
      u.first_name,
      u.last_name,
      u.registration_completed,
      u.registration_state,
      u.registration_started_at,
      u.registration_completed_at,
      u.registration_state_updated_at,
      u.created_at,
      MAX(c.created_at) as last_activity
    FROM users u
    LEFT JOIN conversations c ON c.user_id = u.id
    GROUP BY u.id
    ORDER BY last_activity DESC NULLS LAST, u.created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  return result.rows;
}

/**
 * Get conversation history for a specific user
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} userId - User UUID
 * @param {number} limit - Number of conversations to return
 * @param {number} offset - Offset for pagination
 */
async function getUserConversations(dbClient, userId, limit = 50, offset = 0) {
  const result = await dbClient.query(`
    SELECT id, role, content, message_type, created_at
    FROM conversations
    WHERE user_id = $1
    ORDER BY created_at ASC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);

  return result.rows;
}

/**
 * Get user details by ID
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} userId - User UUID
 */
async function getUserById(dbClient, userId) {
  const result = await dbClient.query(`
    SELECT * FROM users WHERE id = $1
  `, [userId]);

  if (result.rows.length === 0) {
    throw new Error(`User not found: ${userId}`);
  }

  return result.rows[0];
}

/**
 * Get recent activity (last N conversations across all users)
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} limit - Number of conversations to return
 */
async function getRecentActivity(dbClient, limit = 10) {
  const result = await dbClient.query(`
    SELECT
      c.id,
      c.role,
      c.content,
      c.message_type,
      c.created_at,
      c.user_id,
      u.phone_number,
      u.name
    FROM conversations c
    INNER JOIN users u ON c.user_id = u.id
    ORDER BY c.created_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

/**
 * Get total sessions count
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalSessions(dbClient) {
  try {
    const result = await dbClient.query('SELECT COUNT(*) FROM chat_sessions');
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting total sessions:', error);
    return 0;
  }
}

/**
 * Get sessions per day for the last N days
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} days - Number of days to look back
 */
async function getSessionsPerDay(dbClient, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await dbClient.query(`
      SELECT
        DATE(started_at) as date,
        COUNT(*) as count
      FROM chat_sessions
      WHERE started_at >= $1
      GROUP BY DATE(started_at)
      ORDER BY date ASC
    `, [startDate.toISOString()]);

    return result.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      count: parseInt(row.count)
    }));
  } catch (error) {
    console.error('Error getting sessions per day:', error);
    return [];
  }
}

/**
 * Get average session length in minutes
 * @param {Object} dbClient - Database client with RLS context
 */
async function getAverageSessionLength(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT ROUND(
        AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::numeric,
        1
      ) as avg_minutes
      FROM chat_sessions
      WHERE ended_at IS NOT NULL
    `);
    return parseFloat(result.rows[0].avg_minutes) || 0;
  } catch (error) {
    console.error('Error getting average session length:', error);
    return 0;
  }
}

/**
 * Display name mapping for session types
 */
const SESSION_TYPE_DISPLAY_NAMES = {
  'lesson_plan': 'Lesson Plan',
  'presentation': 'Presentation',
  'general': 'General Chat',
  'audio_coaching': 'Audio Coaching',
  'coaching': 'Coaching Session',
  'ai_video_generation': 'AI Video Generation',
  'reading_assessment': 'Reading Assessment'
};

/**
 * Get session type breakdown
 * @param {Object} dbClient - Database client with RLS context
 */
async function getSessionTypeBreakdown(dbClient) {
  try {
    // Get counts for all session types in parallel using subqueries
    const result = await dbClient.query(`
      SELECT
        (SELECT COUNT(*) FROM coaching_sessions) as coaching_count,
        (SELECT COUNT(*) FROM video_requests WHERE status = 'completed') as video_count,
        (SELECT COUNT(*) FROM chat_sessions WHERE session_type = 'lesson_plan') as lesson_plan_count,
        (SELECT COUNT(*) FROM chat_sessions WHERE session_type = 'presentation') as presentation_count,
        (SELECT COUNT(*) FROM chat_sessions WHERE session_type IS NULL OR session_type = 'general') as general_count,
        (SELECT COUNT(*) FROM chat_sessions WHERE session_type = 'audio_coaching') as audio_coaching_count
    `);

    const row = result.rows[0];
    const typeCounts = [];

    // Map database counts to display names
    if (row.coaching_count > 0) {
      typeCounts.push({
        type: SESSION_TYPE_DISPLAY_NAMES['coaching'],
        count: parseInt(row.coaching_count)
      });
    }
    if (row.video_count > 0) {
      typeCounts.push({
        type: SESSION_TYPE_DISPLAY_NAMES['ai_video_generation'],
        count: parseInt(row.video_count)
      });
    }
    if (row.lesson_plan_count > 0) {
      typeCounts.push({
        type: SESSION_TYPE_DISPLAY_NAMES['lesson_plan'],
        count: parseInt(row.lesson_plan_count)
      });
    }
    if (row.presentation_count > 0) {
      typeCounts.push({
        type: SESSION_TYPE_DISPLAY_NAMES['presentation'],
        count: parseInt(row.presentation_count)
      });
    }
    if (row.general_count > 0) {
      typeCounts.push({
        type: SESSION_TYPE_DISPLAY_NAMES['general'],
        count: parseInt(row.general_count)
      });
    }
    if (row.audio_coaching_count > 0) {
      typeCounts.push({
        type: SESSION_TYPE_DISPLAY_NAMES['audio_coaching'],
        count: parseInt(row.audio_coaching_count)
      });
    }

    // Sort by count descending
    return typeCounts.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error getting session type breakdown:', error);
    return [];
  }
}

/**
 * Get most active session hours (0-23)
 * @param {Object} dbClient - Database client with RLS context
 */
async function getMostActiveSessionHours(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        EXTRACT(HOUR FROM started_at)::integer as hour,
        COUNT(*) as count
      FROM chat_sessions
      GROUP BY EXTRACT(HOUR FROM started_at)
      ORDER BY hour ASC
    `);

    // Create array with all 24 hours (fill missing hours with 0)
    const hourCounts = Array(24).fill(0);
    result.rows.forEach(row => {
      hourCounts[row.hour] = parseInt(row.count);
    });

    // Convert to array format
    return hourCounts.map((count, hour) => ({
      hour: `${hour}:00`,
      count
    }));
  } catch (error) {
    console.error('Error getting active session hours:', error);
    return [];
  }
}

/**
 * Get sessions today
 * @param {Object} dbClient - Database client with RLS context
 */
async function getSessionsToday(dbClient) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await dbClient.query(`
      SELECT COUNT(*) FROM chat_sessions
      WHERE started_at >= $1
    `, [today.toISOString()]);

    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting sessions today:', error);
    return 0;
  }
}

/**
 * Get sessions this week
 * @param {Object} dbClient - Database client with RLS context
 */
async function getSessionsThisWeek(dbClient) {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const result = await dbClient.query(`
      SELECT COUNT(*) FROM chat_sessions
      WHERE started_at >= $1
    `, [weekAgo.toISOString()]);

    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting sessions this week:', error);
    return 0;
  }
}

/**
 * Get average messages per session
 * @param {Object} dbClient - Database client with RLS context
 */
async function getAverageMessagesPerSession(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT ROUND(AVG(COALESCE(message_count, 0))::numeric, 1) as avg_messages
      FROM chat_sessions
    `);

    return parseFloat(result.rows[0].avg_messages) || 0;
  } catch (error) {
    console.error('Error getting average messages per session:', error);
    return 0;
  }
}

/**
 * Get dashboard stats summary
 * @param {Object} dbClient - Database client with RLS context
 */
async function getDashboardStats(dbClient) {
  const [
    totalUsers,
    totalMessages,
    voiceNotesReceived,
    dau,
    wau,
    totalSessions,
    sessionsToday,
    sessionsThisWeek,
    avgSessionLength,
    avgMessagesPerSession,
    totalLessonPlans,
    totalPresentations,
    totalCompletedCoachingSessions,
    totalVideosGenerated,
    totalReadingAssessments,
    registrationRate,
    featureDiscoveryRate
  ] = await Promise.all([
    getTotalUsers(dbClient),
    getTotalMessages(dbClient),
    getTotalVoiceNotesReceived(dbClient),
    getDailyActiveUsers(dbClient),
    getWeeklyActiveUsers(dbClient),
    getTotalSessions(dbClient),
    getSessionsToday(dbClient),
    getSessionsThisWeek(dbClient),
    getAverageSessionLength(dbClient),
    getAverageMessagesPerSession(dbClient),
    getTotalLessonPlans(dbClient),
    getTotalPresentations(dbClient),
    getTotalCompletedCoachingSessions(dbClient),
    getTotalVideosGenerated(dbClient),
    getTotalReadingAssessments(dbClient),
    getRegistrationRate(dbClient),
    getFeatureDiscoveryRate(dbClient)
  ]);

  return {
    totalUsers,
    totalMessages,
    voiceNotesReceived,
    dailyActiveUsers: dau,
    weeklyActiveUsers: wau,
    totalSessions,
    sessionsToday,
    sessionsThisWeek,
    avgSessionLength,
    avgMessagesPerSession,
    totalLessonPlans,
    totalPresentations,
    totalCompletedCoachingSessions,
    totalVideosGenerated,
    totalReadingAssessments,
    registrationRate,
    featureDiscoveryRate
  };
}

// ============================================================================
// OPTIMIZED FUNCTIONS WITH MATERIALIZED VIEW FALLBACK
// ============================================================================

/**
 * Get dashboard stats - OPTIMIZED with materialized view
 * Tries MV first (~10ms), falls back to 17 queries (~500ms) if MV doesn't exist
 *
 * @param {Object} dbClient - Database client with RLS context
 * @returns {Object} Dashboard stats (same format as getDashboardStats)
 */
async function getDashboardStatsOptimized(dbClient) {
  // Try materialized view first (fast path)
  const mvStats = await materializedViews.getDashboardStatsFromView(dbClient);

  if (mvStats) {
    // Add metadata about data freshness
    return {
      ...mvStats,
      _source: 'materialized_view',
      _freshness: mvStats.isStale ? 'stale' : 'fresh'
    };
  }

  // Fallback to original 17-query pattern (slow path)
  console.log('[queries.js] Falling back to direct queries (MV not available)');
  const stats = await getDashboardStats(dbClient);
  return {
    ...stats,
    _source: 'direct_queries',
    _freshness: 'realtime'
  };
}

/**
 * Get all users - OPTIMIZED with materialized view
 * Tries MV first (~10ms), falls back to LEFT JOIN (~99ms) if MV doesn't exist
 *
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} limit - Number of users to return
 * @param {number} offset - Offset for pagination
 * @returns {Array} Users with last_activity
 */
async function getAllUsersOptimized(dbClient, limit = 100, offset = 0) {
  // Check if views exist (cached check would be better)
  const viewsExist = await materializedViews.viewsExist(dbClient);

  if (viewsExist) {
    const users = await materializedViews.getUsersWithActivityFromView(dbClient, limit, offset);
    if (users && users.length > 0) {
      return users;
    }
  }

  // Fallback to original LEFT JOIN query (slow path)
  console.log('[queries.js] Falling back to getAllUsers (MV not available)');
  return await getAllUsers(dbClient, limit, offset);
}

/**
 * Get total user count - OPTIMIZED with materialized view
 *
 * @param {Object} dbClient - Database client with RLS context
 * @returns {number} Total user count
 */
async function getTotalUserCountOptimized(dbClient) {
  const count = await materializedViews.getTotalUserCountFromView(dbClient);
  if (count > 0) {
    return count;
  }
  // Fallback
  return await getTotalUsers(dbClient);
}

// ============================================================================
// DATE-FILTERED DASHBOARD STATS (for timeline slider)
// ============================================================================

/**
 * Get stats for a specific date range with percentage change vs previous period
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} days - Number of days for the current period (7, 30, 90, 365, or 0 for all-time)
 * @param {Date} customStart - Optional custom start date (overrides days)
 * @param {Date} customEnd - Optional custom end date (overrides days)
 * @returns {Object} Stats with current values and percentage changes
 */
async function getDashboardStatsForPeriod(dbClient, days = 0, customStart = null, customEnd = null) {
  // Custom date range mode
  if (customStart && customEnd) {
    const periodStart = new Date(customStart);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(customEnd);
    periodEnd.setHours(23, 59, 59, 999);

    // Calculate period length in days for previous period comparison
    const periodLengthMs = periodEnd.getTime() - periodStart.getTime();
    const periodLengthDays = Math.ceil(periodLengthMs / (1000 * 60 * 60 * 24));

    // Calculate previous period (same length, immediately before)
    const previousPeriodEnd = new Date(periodStart);
    previousPeriodEnd.setMilliseconds(-1); // 1ms before period start
    const previousPeriodStart = new Date(previousPeriodEnd);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - periodLengthDays);
    previousPeriodStart.setHours(0, 0, 0, 0);

    // Fetch current period and previous period stats in parallel
    const [currentStats, previousStats] = await Promise.all([
      getStatsForDateRange(periodStart, periodEnd),
      getStatsForDateRange(previousPeriodStart, previousPeriodEnd)
    ]);

    // Calculate percentage changes
    const changes = calculatePercentageChanges(currentStats, previousStats);

    // Format dates for label
    const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const periodLabel = `${formatDate(periodStart)} - ${formatDate(periodEnd)}`;

    return {
      stats: currentStats,
      changes,
      period: 'custom',
      periodLabel,
      periodDays: periodLengthDays,
      dateRange: {
        start: periodStart.toISOString().split('T')[0],
        end: periodEnd.toISOString().split('T')[0]
      }
    };
  }

  // days=0 means all-time (no date filtering)
  if (days === 0) {
    const stats = await getDashboardStats(dbClient);
    // Return all-time stats with no percentage changes
    return {
      stats,
      changes: null,
      period: 'all-time',
      periodLabel: 'All Time'
    };
  }

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);
  periodStart.setHours(0, 0, 0, 0);

  const previousPeriodStart = new Date(periodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - days);

  // Fetch current period and previous period stats in parallel
  const [currentStats, previousStats] = await Promise.all([
    getStatsForDateRange(periodStart, now),
    getStatsForDateRange(previousPeriodStart, periodStart)
  ]);

  // Calculate percentage changes
  const changes = calculatePercentageChanges(currentStats, previousStats);

  const periodLabels = {
    7: 'Last 7 Days',
    30: 'Last 30 Days',
    90: 'Last 90 Days',
    365: 'Last Year'
  };

  return {
    stats: currentStats,
    changes,
    period: `${days}d`,
    periodLabel: periodLabels[days] || `Last ${days} Days`
  };
}

/**
 * Get stats for a specific date range
 * @param {Date} startDate - Start of period
 * @param {Date} endDate - End of period
 * @returns {Object} Stats for the period
 */
async function getStatsForDateRange(startDate, endDate) {
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  const [
    usersResult,
    messagesResult,
    voiceNotesResult,
    sessionsResult,
    lessonPlansResult,
    presentationsResult,
    coachingResult,
    videosResult,
    readingResult,
    // Additional queries for missing metrics
    registeredUsersResult,
    sessionsWithDuration,
    usersWithFeatures
  ] = await Promise.all([
    // Users created in period
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Messages in period
    supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Voice notes received in period
    supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user')
      .eq('message_type', 'voice')
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Sessions in period
    supabase
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', startISO)
      .lte('started_at', endISO),

    // Lesson plans in period
    supabase
      .from('lesson_plans')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'lesson_plan')
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Presentations in period
    supabase
      .from('lesson_plans')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'presentation')
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Coaching sessions in period
    supabase
      .from('coaching_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Videos in period
    supabase
      .from('video_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Reading assessments in period
    supabase
      .from('reading_assessments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Users with completed registration in period.
    // Column is `registration_completed` (BOOLEAN) — there is no
    // `registration_status` text column on `users`.
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('registration_completed', true)
      .gte('created_at', startISO)
      .lte('created_at', endISO),

    // Sessions with duration data for avg calculation
    supabase
      .from('chat_sessions')
      .select('started_at, last_activity_at')
      .gte('started_at', startISO)
      .lte('started_at', endISO)
      .not('last_activity_at', 'is', null),

    // Users in period with feature usage data
    supabase
      .from('users')
      .select('id')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
  ]);

  // Get active users in period (unique users who sent messages)
  const { data: activeUsersData } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('role', 'user')
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  const activeUsers = new Set((activeUsersData || []).map(r => r.user_id)).size;

  // Calculate average session length in minutes
  let avgSessionLength = 0;
  if (sessionsWithDuration.data && sessionsWithDuration.data.length > 0) {
    const totalMinutes = sessionsWithDuration.data.reduce((sum, session) => {
      const start = new Date(session.started_at);
      const end = new Date(session.last_activity_at);
      const durationMs = end - start;
      return sum + (durationMs / 60000); // Convert to minutes
    }, 0);
    avgSessionLength = Math.round(totalMinutes / sessionsWithDuration.data.length);
  }

  // Calculate registration rate
  const totalUsersInPeriod = usersResult.count || 0;
  const registeredUsersInPeriod = registeredUsersResult.count || 0;
  const registrationRate = totalUsersInPeriod > 0
    ? Math.round((registeredUsersInPeriod / totalUsersInPeriod) * 100)
    : 0;

  // Calculate feature discovery rate for users in period
  // Count how many features each user tried (lesson plans, videos, reading, coaching)
  let featureDiscoveryRate = 0;
  if (usersWithFeatures.data && usersWithFeatures.data.length > 0) {
    const userIds = usersWithFeatures.data.map(u => u.id);

    // Get feature usage for these users
    const [lpUsers, videoUsers, readingUsers, coachingUsers] = await Promise.all([
      supabase.from('lesson_plans').select('user_id').in('user_id', userIds),
      supabase.from('video_requests').select('user_id').in('user_id', userIds),
      supabase.from('reading_assessments').select('user_id').in('user_id', userIds),
      supabase.from('coaching_sessions').select('user_id').in('user_id', userIds)
    ]);

    const lpUserSet = new Set((lpUsers.data || []).map(r => r.user_id));
    const videoUserSet = new Set((videoUsers.data || []).map(r => r.user_id));
    const readingUserSet = new Set((readingUsers.data || []).map(r => r.user_id));
    const coachingUserSet = new Set((coachingUsers.data || []).map(r => r.user_id));

    let totalFeaturesTried = 0;
    userIds.forEach(userId => {
      let featureCount = 0;
      if (lpUserSet.has(userId)) featureCount++;
      if (videoUserSet.has(userId)) featureCount++;
      if (readingUserSet.has(userId)) featureCount++;
      if (coachingUserSet.has(userId)) featureCount++;
      totalFeaturesTried += featureCount;
    });

    // 4 features total, calculate average percentage
    featureDiscoveryRate = userIds.length > 0
      ? Math.round((totalFeaturesTried / (userIds.length * 4)) * 100)
      : 0;
  }

  return {
    totalUsers: usersResult.count || 0,
    totalMessages: messagesResult.count || 0,
    voiceNotesReceived: voiceNotesResult.count || 0,
    totalSessions: sessionsResult.count || 0,
    sessionsToday: sessionsResult.count || 0, // Same as totalSessions for the period
    avgSessionLength,
    registrationRate,
    featureDiscoveryRate,
    totalLessonPlans: lessonPlansResult.count || 0,
    totalPresentations: presentationsResult.count || 0,
    totalCompletedCoachingSessions: coachingResult.count || 0,
    totalVideosGenerated: videosResult.count || 0,
    totalReadingAssessments: readingResult.count || 0,
    activeUsers
  };
}

/**
 * Calculate percentage changes between two periods
 * @param {Object} current - Current period stats
 * @param {Object} previous - Previous period stats
 * @returns {Object} Percentage changes for each stat
 */
function calculatePercentageChanges(current, previous) {
  const calcChange = (curr, prev) => {
    if (prev === 0) {
      return curr > 0 ? 100 : 0; // 100% increase if starting from 0
    }
    return Math.round(((curr - prev) / prev) * 100);
  };

  // For rate metrics (already percentages), calculate the point difference
  const calcPointChange = (curr, prev) => {
    return Math.round(curr - prev); // e.g., 80% -> 85% = +5 points
  };

  return {
    totalUsers: calcChange(current.totalUsers, previous.totalUsers),
    totalMessages: calcChange(current.totalMessages, previous.totalMessages),
    voiceNotesReceived: calcChange(current.voiceNotesReceived, previous.voiceNotesReceived),
    totalSessions: calcChange(current.totalSessions, previous.totalSessions),
    sessionsToday: calcChange(current.sessionsToday || 0, previous.sessionsToday || 0),
    avgSessionLength: calcChange(current.avgSessionLength || 0, previous.avgSessionLength || 0),
    registrationRate: calcPointChange(current.registrationRate || 0, previous.registrationRate || 0),
    featureDiscoveryRate: calcPointChange(current.featureDiscoveryRate || 0, previous.featureDiscoveryRate || 0),
    totalLessonPlans: calcChange(current.totalLessonPlans, previous.totalLessonPlans),
    totalPresentations: calcChange(current.totalPresentations, previous.totalPresentations),
    totalCompletedCoachingSessions: calcChange(current.totalCompletedCoachingSessions, previous.totalCompletedCoachingSessions),
    totalVideosGenerated: calcChange(current.totalVideosGenerated, previous.totalVideosGenerated),
    totalReadingAssessments: calcChange(current.totalReadingAssessments, previous.totalReadingAssessments),
    activeUsers: calcChange(current.activeUsers, previous.activeUsers)
  };
}

/**
 * Get comprehensive session analytics
 * @param {Object} dbClient - Database client with RLS context
 */
async function getSessionAnalytics(dbClient) {
  const [
    sessionsPerDay,
    sessionTypeBreakdown,
    activeHours,
    avgLength,
    avgMessages
  ] = await Promise.all([
    getSessionsPerDay(dbClient, 7),
    getSessionTypeBreakdown(dbClient),
    getMostActiveSessionHours(dbClient),
    getAverageSessionLength(dbClient),
    getAverageMessagesPerSession(dbClient)
  ]);

  return {
    sessionsPerDay,
    sessionTypeBreakdown,
    activeHours,
    avgLength,
    avgMessages
  };
}

/**
 * Get funnel metrics with optional date filtering
 * @param {Date|null} startDate - Optional start date filter
 * @param {Date|null} endDate - Optional end date filter
 * @returns {Promise<Object>} Funnel metrics with counts and conversion rates
 */
/**
 * Get funnel metrics for date range
 * @param {Object} dbClient - Database client with RLS context
 * @param {Date} startDate - Start date filter (optional)
 * @param {Date} endDate - End date filter (optional)
 * @returns {Promise<Object>} Funnel metrics with counts, conversion rates, and dropoff
 */
async function getFunnelMetrics(dbClient, startDate = null, endDate = null) {
  try {
    // Build WHERE clause for date filtering
    const params = [];
    let dateCondition = '';

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at >= $1 AND created_at <= $2';
      params.push(startDate.toISOString(), endDate.toISOString());
    } else if (startDate) {
      dateCondition = 'WHERE created_at >= $1';
      params.push(startDate.toISOString());
    } else if (endDate) {
      dateCondition = 'WHERE created_at <= $1';
      params.push(endDate.toISOString());
    }

    const regDateCondition = dateCondition.replace('created_at', 'registration_completed_at');

    // Single query with parallel subqueries for all funnel stages
    const result = await dbClient.query(`
      SELECT
        (SELECT COUNT(*) FROM website_visits ${dateCondition}) as website_visits,
        (SELECT COUNT(*) FROM cta_clicks ${dateCondition}) as cta_clicks,
        (SELECT COUNT(*) FROM chat_starts ${dateCondition}) as chat_starts,
        (SELECT COUNT(*) FROM users WHERE registration_completed = true ${regDateCondition ? 'AND ' + regDateCondition.substring(6) : ''}) as registrations
    `, params);

    const row = result.rows[0];
    const websiteVisits = parseInt(row.website_visits) || 0;
    const ctaClicks = parseInt(row.cta_clicks) || 0;
    const chatStarts = parseInt(row.chat_starts) || 0;
    const registrations = parseInt(row.registrations) || 0;

    // Calculate conversion rates
    const visitToCtaRate = websiteVisits > 0 ? ((ctaClicks / websiteVisits) * 100).toFixed(2) : 0;
    const ctaToChatRate = ctaClicks > 0 ? ((chatStarts / ctaClicks) * 100).toFixed(2) : 0;
    const chatToRegRate = chatStarts > 0 ? ((registrations / chatStarts) * 100).toFixed(2) : 0;
    const overallRate = websiteVisits > 0 ? ((registrations / websiteVisits) * 100).toFixed(2) : 0;

    return {
      counts: {
        websiteVisits,
        ctaClicks,
        chatStarts,
        registrations
      },
      conversionRates: {
        visitToCta: parseFloat(visitToCtaRate),
        ctaToChat: parseFloat(ctaToChatRate),
        chatToRegistration: parseFloat(chatToRegRate),
        overall: parseFloat(overallRate)
      },
      dropoff: {
        afterVisit: websiteVisits - ctaClicks,
        afterCta: ctaClicks - chatStarts,
        afterChat: chatStarts - registrations
      }
    };
  } catch (error) {
    console.error('Error getting funnel metrics:', error);
    throw error;
  }
}

/**
 * Get funnel metrics for last N days
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} Funnel metrics
 */
async function getFunnelMetricsForDays(dbClient, days = 7) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await getFunnelMetrics(dbClient, startDate, endDate);
}

/**
 * Get traffic source breakdown (website vs direct)
 * @param {Date|null} startDate - Optional start date filter
 * @param {Date|null} endDate - Optional end date filter
 * @returns {Promise<Array>} Array of source counts
 */
/**
 * Get traffic source breakdown (website vs direct)
 * @param {Object} dbClient - Database client with RLS context
 * @param {Date} startDate - Optional start date filter
 * @param {Date} endDate - Optional end date filter
 * @returns {Promise<Array>} Array of {source, count} objects sorted by count
 */
async function getTrafficSources(dbClient, startDate = null, endDate = null) {
  try {
    // Build WHERE clause for date filtering
    const params = [];
    const conditions = ['source IS NOT NULL'];

    if (startDate) {
      params.push(startDate.toISOString());
      conditions.push(`created_at >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate.toISOString());
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Database does the grouping and counting
    const result = await dbClient.query(`
      SELECT
        COALESCE(source, 'unknown') as source,
        COUNT(*) as count
      FROM users
      ${whereClause}
      GROUP BY source
      ORDER BY count DESC
    `, params);

    return result.rows.map(row => ({
      source: row.source,
      count: parseInt(row.count)
    }));
  } catch (error) {
    console.error('Error getting traffic sources:', error);
    return [];
  }
}

/**
 * Get funnel metrics by date (daily breakdown)
 * @param {Object} dbClient - Database client with RLS context
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Array of daily funnel metrics
 */
async function getFunnelMetricsByDate(dbClient, days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Generate date series and get counts with LEFT JOINs (database does all the work)
    const result = await dbClient.query(`
      WITH date_series AS (
        SELECT DATE(generate_series(
          $1::timestamp,
          NOW(),
          '1 day'::interval
        )) as date
      ),
      visits_by_date AS (
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM website_visits
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      clicks_by_date AS (
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM cta_clicks
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      chats_by_date AS (
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM chat_starts
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
      ),
      regs_by_date AS (
        SELECT DATE(registration_completed_at) as date, COUNT(*) as count
        FROM users
        WHERE registration_completed = true AND registration_completed_at >= $1
        GROUP BY DATE(registration_completed_at)
      )
      SELECT
        ds.date,
        COALESCE(v.count, 0) as visits,
        COALESCE(cl.count, 0) as clicks,
        COALESCE(ch.count, 0) as chats,
        COALESCE(r.count, 0) as registrations
      FROM date_series ds
      LEFT JOIN visits_by_date v ON ds.date = v.date
      LEFT JOIN clicks_by_date cl ON ds.date = cl.date
      LEFT JOIN chats_by_date ch ON ds.date = ch.date
      LEFT JOIN regs_by_date r ON ds.date = r.date
      ORDER BY ds.date ASC
    `, [startDate.toISOString()]);

    return result.rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      visits: parseInt(row.visits),
      clicks: parseInt(row.clicks),
      chats: parseInt(row.chats),
      registrations: parseInt(row.registrations)
    }));
  } catch (error) {
    console.error('Error getting funnel metrics by date:', error);
    return [];
  }
}

/**
 * Get total lesson plans count (type = 'lesson_plan')
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalLessonPlans(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT COUNT(*) FROM lesson_plans
      WHERE type = $1
    `, ['lesson_plan']);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting total lesson plans:', error);
    return 0;
  }
}

/**
 * Get total presentations count (type = 'presentation')
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalPresentations(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT COUNT(*) FROM lesson_plans
      WHERE type = $1
    `, ['presentation']);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting total presentations:', error);
    return 0;
  }
}

/**
 * Get total completed coaching sessions
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalCompletedCoachingSessions(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT COUNT(*) FROM coaching_sessions
      WHERE status = $1
    `, ['completed']);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting completed coaching sessions:', error);
    return 0;
  }
}

/**
 * Get total videos generated (completed video requests)
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalVideosGenerated(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT COUNT(*) FROM video_requests
      WHERE status = $1
    `, ['completed']);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting total videos generated:', error);
    return 0;
  }
}

/**
 * Get total completed reading assessments
 * @param {Object} dbClient - Database client with RLS context
 */
async function getTotalReadingAssessments(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT COUNT(*) FROM reading_assessments
      WHERE status = $1
    `, ['completed']);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting total reading assessments:', error);
    return 0;
  }
}

/**
 * Get registration rate (% of users who completed registration)
 * Formula: (users with registration_completed = true / total users) × 100
 * @param {Object} dbClient - Database client with RLS context
 */
async function getRegistrationRate(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE registration_completed = true) as registered_users
      FROM users
    `);

    const totalUsers = parseInt(result.rows[0].total_users);
    const registeredUsers = parseInt(result.rows[0].registered_users);

    if (totalUsers === 0) return 0;

    const rate = (registeredUsers / totalUsers) * 100;
    return parseFloat(rate.toFixed(1));
  } catch (error) {
    console.error('Error getting registration rate:', error);
    return 0;
  }
}

/**
 * Get feature discovery rate (% of possible feature uses that have been discovered)
 * Formula: (unique user-feature combinations / (total users × 4 features)) × 100
 * Features: AI Video, Lesson Plans, Coaching, Reading Assessment
 * @param {Object} dbClient - Database client with RLS context
 */
async function getFeatureDiscoveryRate(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(DISTINCT user_id) FROM video_requests) as video_users,
        (SELECT COUNT(DISTINCT user_id) FROM lesson_plans) as lesson_plan_users,
        (SELECT COUNT(DISTINCT user_id) FROM coaching_sessions) as coaching_users,
        (SELECT COUNT(DISTINCT user_id) FROM reading_assessments) as reading_users
    `);

    const totalUsers = parseInt(result.rows[0].total_users);
    if (totalUsers === 0) return 0;

    const videoUsers = parseInt(result.rows[0].video_users) || 0;
    const lessonPlanUsers = parseInt(result.rows[0].lesson_plan_users) || 0;
    const coachingUsers = parseInt(result.rows[0].coaching_users) || 0;
    const readingUsers = parseInt(result.rows[0].reading_users) || 0;

    // Total unique user-feature combinations
    const totalCombinations = videoUsers + lessonPlanUsers + coachingUsers + readingUsers;

    // Maximum possible = total users × 4 features
    const maxPossible = totalUsers * 4;

    const rate = (totalCombinations / maxPossible) * 100;
    return parseFloat(rate.toFixed(1));
  } catch (error) {
    console.error('Error getting feature discovery rate:', error);
    return 0;
  }
}

/**
 * Get coaching sessions for a user with all fields
 */
/**
 * Get coaching sessions for a specific user
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} userId - User UUID
 * @param {number} limit - Maximum number of sessions to return
 * @returns {Promise<Array>} Array of coaching sessions
 */
async function getUserCoachingSessions(dbClient, userId, limit = 10) {
  const result = await dbClient.query(`
    SELECT * FROM coaching_sessions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);

  return result.rows;
}

/**
 * Get lesson plans for a user with Gamma URLs
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} userId - User UUID
 * @param {number} limit - Maximum number of lesson plans to return
 * @returns {Promise<Array>} Array of lesson plans
 */
async function getUserLessonPlans(dbClient, userId, limit = 10) {
  const result = await dbClient.query(`
    SELECT id, topic, type, grade, subject, gamma_url, created_at
    FROM lesson_plans
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);

  return result.rows;
}

/**
 * Get video requests for a user (AI Video Generation)
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} userId - User UUID
 * @param {number} limit - Maximum number of video requests to return
 * @returns {Promise<Array>} Array of video requests
 */
async function getUserVideoRequests(dbClient, userId, limit = 10) {
  try {
    const result = await dbClient.query(`
      SELECT id, topic, language, status, video_url, pdf_url, created_at, completed_at
      FROM video_requests
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error getting user video requests:', error);
    return [];
  }
}

/**
 * Get reading assessments for a user (Reading Assessment)
 * @param {Object} dbClient - Database client with RLS context
 * @param {string} userId - User UUID
 * @param {number} limit - Maximum number of reading assessments to return
 * @returns {Promise<Array>} Array of reading assessments
 */
async function getUserReadingSessions(dbClient, userId, limit = 10) {
  try {
    const result = await dbClient.query(`
      SELECT id, language, accuracy_percentage, wcpm, pronunciation_accuracy, grade_level, status, created_at
      FROM reading_assessments
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error getting user reading assessments:', error);
    return [];
  }
}

// ============================================================================
// Release Notes Queries (for public changelog)
// ============================================================================

/**
 * Get recent release notes for login page feed
 * Returns latest 5 production notes, ordered by date
 */
async function getRecentReleaseNotes(limit = 5) {
  const { data, error } = await supabase
    .from('release_notes')
    .select('id, version, title, icon, category, created_at')
    .eq('environment', 'production')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting recent release notes:', error);
    return [];
  }
  return data || [];
}

/**
 * Get all release notes with optional filters
 * For the full release notes page
 */
async function getReleaseNotes(options = {}) {
  const { environment = 'all', category = 'all', limit = 50 } = options;

  let query = supabase
    .from('release_notes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (environment !== 'all') {
    query = query.eq('environment', environment);
  }

  if (category !== 'all') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error getting release notes:', error);
    return [];
  }
  return data || [];
}

/**
 * Insert a new release note
 * Used by the release-notes agent
 */
async function insertReleaseNote(note) {
  const { data, error } = await supabase
    .from('release_notes')
    .insert({
      version: note.version,
      title: note.title,
      description: note.description,
      details: note.details || null,
      category: note.category || 'feature',
      environment: note.environment || 'staging',
      icon: note.icon || 'sparkles',
      is_highlighted: note.is_highlighted || false,
      created_by: note.created_by || 'release-notes-agent'
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting release note:', error);
    throw error;
  }
  return data;
}

/**
 * Promote a release note from staging to production
 */
async function promoteReleaseNote(noteId) {
  const { data, error } = await supabase
    .from('release_notes')
    .update({
      environment: 'production',
      published_at: new Date().toISOString()
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error) {
    console.error('Error promoting release note:', error);
    throw error;
  }
  return data;
}

// ============================================================================
// Broadcast Feature Queries
// ============================================================================

// Constants for broadcast query validation
const VALID_ACTIVITY_FILTERS = ['all', '24h', '7d', '30d'];
const VALID_COUNTRY_CODES = ['all', '92', '94'];
const MAX_BATCH_SIZE = 1000; // Supabase .in() limit

/**
 * Validate and sanitize broadcast filter inputs
 * @throws {Error} with specific message for invalid inputs
 */
function validateBroadcastFilters(filters) {
  const { activity = 'all', country = 'all' } = filters || {};

  if (!VALID_ACTIVITY_FILTERS.includes(activity)) {
    throw new Error(`Invalid activity filter: "${activity}". Valid: ${VALID_ACTIVITY_FILTERS.join(', ')}`);
  }

  if (!VALID_COUNTRY_CODES.includes(country)) {
    throw new Error(`Invalid country filter: "${country}". Valid: ${VALID_COUNTRY_CODES.join(', ')}`);
  }

  return { activity, country };
}

/**
 * Get unique user IDs who were active in the specified period
 * Uses conversations table (more accurate than chat_sessions)
 */
async function getActiveUserIds(activity) {
  const daysMap = { '24h': 1, '7d': 7, '30d': 30 };
  const days = daysMap[activity];

  if (!days) {
    throw new Error(`Unknown activity period: ${activity}`);
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data, error } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('role', 'user')
    .gte('created_at', cutoffDate.toISOString())
    .not('user_id', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch active users: ${error.message}`);
  }

  // Deduplicate user IDs
  const uniqueIds = [...new Set((data || []).map(r => r.user_id))];
  return uniqueIds;
}

/**
 * Batch query users for large ID sets (>1000)
 */
async function batchQueryUsers(userIds, country) {
  const batches = [];

  for (let i = 0; i < userIds.length; i += MAX_BATCH_SIZE) {
    batches.push(userIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(async (batch, index) => {
      console.log(`[Broadcast Query] Processing batch ${index + 1}/${batches.length}`);

      let query = supabase
        .from('users')
        .select('id, phone_number, first_name, last_name, name, last_message_at')
        .eq('registration_completed', true)
        .not('phone_number', 'is', null)
        .in('id', batch);

      if (country !== 'all') {
        query = query.like('phone_number', `${country}%`);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Batch ${index + 1} failed: ${error.message}`);
      return data || [];
    })
  );

  return results.flat();
}

/**
 * Get users for broadcast with comprehensive filtering
 *
 * @param {Object} filters - Filter options
 * @param {string} filters.activity - 'all', '24h', '7d', or '30d'
 * @param {string} filters.country - 'all', '92' (Pakistan), or '94' (Sri Lanka)
 * @returns {Promise<Array>} Array of user objects with id, phone_number, first_name, last_name, name
 */
async function getUsersForBroadcast(filters = {}) {
  const startTime = Date.now();

  // CRITICAL: Handle search mode (individual user targeting)
  if (filters.mode === 'search' && filters.selectedUserIds) {
    const userIds = Array.isArray(filters.selectedUserIds) ? filters.selectedUserIds : [];
    console.log(`[Broadcast Query] SEARCH MODE - fetching ${userIds.length} specific users`);

    if (userIds.length === 0) {
      console.log('[Broadcast Query] No user IDs provided in search mode');
      return [];
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, phone_number, first_name, last_name, name, last_message_at')
      .in('id', userIds)
      .eq('registration_completed', true)
      .not('phone_number', 'is', null);

    if (error) throw new Error(`Search mode user lookup failed: ${error.message}`);

    console.log(`[Broadcast Query] SEARCH MODE completed in ${Date.now() - startTime}ms. Found ${(data || []).length} users`);
    return data || [];
  }

  // Filter mode (activity/country)
  const { activity, country } = validateBroadcastFilters(filters);

  console.log(`[Broadcast Query] FILTER MODE - activity=${activity}, country=${country}`);

  try {
    let userIds = null;

    // Step 1: Get active user IDs if filtering by activity
    if (activity !== 'all') {
      userIds = await getActiveUserIds(activity);

      console.log(`[Broadcast Query] Found ${userIds.length} active users for ${activity} filter`);

      // Early return if no active users
      if (userIds.length === 0) {
        console.log('[Broadcast Query] No active users found, returning empty array');
        return [];
      }
    }

    // Step 2: Query users with all filters
    let users;

    if (userIds && userIds.length > 0) {
      if (userIds.length > MAX_BATCH_SIZE) {
        console.log(`[Broadcast Query] Processing ${userIds.length} users in batches of ${MAX_BATCH_SIZE}`);
        users = await batchQueryUsers(userIds, country);
      } else {
        let query = supabase
          .from('users')
          .select('id, phone_number, first_name, last_name, name, last_message_at')
          .eq('registration_completed', true)
          .not('phone_number', 'is', null)
          .in('id', userIds);

        if (country !== 'all') {
          query = query.like('phone_number', `${country}%`);
        }

        const { data, error } = await query;
        if (error) throw new Error(`User query failed: ${error.message}`);
        users = data || [];
      }
    } else {
      // No user ID filter (all users)
      let query = supabase
        .from('users')
        .select('id, phone_number, first_name, last_name, name, last_message_at')
        .eq('registration_completed', true)
        .not('phone_number', 'is', null);

      if (country !== 'all') {
        query = query.like('phone_number', `${country}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(`User query failed: ${error.message}`);
      users = data || [];
    }

    console.log(`[Broadcast Query] Completed in ${Date.now() - startTime}ms. Found ${users.length} users`);

    return users;

  } catch (error) {
    console.error('[Broadcast Query] ERROR:', {
      filters,
      error: error.message,
      stack: error.stack?.substring(0, 500)
    });
    throw error;
  }
}

/**
 * Get user counts for broadcast preview matrix
 * Returns counts for all filter combinations
 */
async function getBroadcastUserCounts() {
  const results = {};

  // Get all registered users with phone numbers
  const { data: allUsers, error } = await supabase
    .from('users')
    .select('id, phone_number')
    .eq('registration_completed', true)
    .not('phone_number', 'is', null);

  if (error) {
    console.error('Error getting broadcast user counts:', error);
    throw error;
  }

  // Get active user IDs for each period
  const [active24h, active7d, active30d] = await Promise.all([
    getActiveUserIds('24h'),
    getActiveUserIds('7d'),
    getActiveUserIds('30d')
  ]);

  const active24hSet = new Set(active24h);
  const active7dSet = new Set(active7d);
  const active30dSet = new Set(active30d);

  // Helper to count users
  const countByCountry = (users, activeSet = null) => {
    const filtered = activeSet
      ? users.filter(u => activeSet.has(u.id))
      : users;

    return {
      all: filtered.length,
      pakistan: filtered.filter(u => u.phone_number.startsWith('92')).length,
      sriLanka: filtered.filter(u => u.phone_number.startsWith('94')).length
    };
  };

  results.all = countByCountry(allUsers);
  results['24h'] = countByCountry(allUsers, active24hSet);
  results['7d'] = countByCountry(allUsers, active7dSet);
  results['30d'] = countByCountry(allUsers, active30dSet);

  return results;
}

/**
 * Get broadcast logs with pagination
 */
async function getBroadcastLogs(limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('broadcast_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error getting broadcast logs:', error);
    throw error;
  }
  return data || [];
}

/**
 * Get a single broadcast by ID
 */
async function getBroadcastById(broadcastId) {
  const { data, error } = await supabase
    .from('broadcast_logs')
    .select('*')
    .eq('id', broadcastId)
    .single();

  if (error) {
    console.error('Error getting broadcast:', error);
    throw error;
  }
  return data;
}

/**
 * Create a new broadcast log
 */
async function createBroadcastLog(broadcastData) {
  const { data, error } = await supabase
    .from('broadcast_logs')
    .insert(broadcastData)
    .select()
    .single();

  if (error) {
    console.error('Error creating broadcast log:', error);
    throw error;
  }
  return data;
}

/**
 * Update a broadcast log
 */
async function updateBroadcastLog(broadcastId, updates) {
  const { data, error } = await supabase
    .from('broadcast_logs')
    .update(updates)
    .eq('id', broadcastId)
    .select()
    .single();

  if (error) {
    console.error('Error updating broadcast log:', error);
    throw error;
  }
  return data;
}

/**
 * Insert broadcast messages in batches
 */
async function insertBroadcastMessages(messages) {
  const BATCH_SIZE = 500;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('broadcast_messages')
      .insert(batch);

    if (error) {
      console.error(`Error inserting broadcast messages batch ${i / BATCH_SIZE + 1}:`, error);
      throw error;
    }
  }
}

/**
 * Create a single broadcast message record
 */
async function createBroadcastMessage(broadcastId, userId, phoneNumber, status, errorMessage = null) {
  const { error } = await supabase
    .from('broadcast_messages')
    .insert({
      broadcast_id: broadcastId,
      user_id: userId,
      phone_number: phoneNumber,
      status: status,
      error_message: errorMessage,
      sent_at: status === 'sent' ? new Date().toISOString() : null
    });

  if (error) {
    console.error('Error creating broadcast message:', error);
    // Don't throw - we don't want to break the loop
  }
}

/**
 * Update a broadcast message
 */
async function updateBroadcastMessage(broadcastId, userId, updates) {
  const { error } = await supabase
    .from('broadcast_messages')
    .update(updates)
    .eq('broadcast_id', broadcastId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating broadcast message:', error);
    throw error;
  }
}

/**
 * Get pending broadcast messages for a broadcast (for crash recovery)
 */
async function getPendingBroadcastMessages(broadcastId) {
  const { data, error } = await supabase
    .from('broadcast_messages')
    .select('id, user_id, phone_number')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error getting pending broadcast messages:', error);
    throw error;
  }
  return data || [];
}

/**
 * Check for active broadcasts (for concurrency control)
 */
async function checkActiveBroadcast(excludeId = null) {
  let query = supabase
    .from('broadcast_logs')
    .select('id, admin_username, created_at, status')
    .in('status', ['template_pending', 'sending']);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error checking active broadcast:', error);
    throw error;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Check for duplicate broadcast (same message in last 5 minutes)
 */
async function checkDuplicateBroadcast(message, adminUserId) {
  const fiveMinutesAgo = new Date();
  fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

  const { data, error } = await supabase
    .from('broadcast_logs')
    .select('id, created_at')
    .eq('admin_user_id', adminUserId)
    .eq('message_content', message)
    .gte('created_at', fiveMinutesAgo.toISOString())
    .limit(1);

  if (error) {
    console.error('Error checking duplicate broadcast:', error);
    throw error;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Check broadcast cooldown (1 hour between broadcasts)
 */
async function checkBroadcastCooldown(adminUserId) {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const { data, error } = await supabase
    .from('broadcast_logs')
    .select('completed_at')
    .eq('admin_user_id', adminUserId)
    .eq('status', 'completed')
    .gte('completed_at', oneHourAgo.toISOString())
    .order('completed_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error checking broadcast cooldown:', error);
    throw error;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Get broadcasts that were interrupted (for crash recovery)
 */
async function getInterruptedBroadcasts() {
  const { data, error } = await supabase
    .from('broadcast_logs')
    .select('id, template_name, filters')
    .eq('status', 'sending');

  if (error) {
    console.error('Error getting interrupted broadcasts:', error);
    throw error;
  }
  return data || [];
}

module.exports = {
  getTotalUsers,
  getTotalVoiceNotesReceived,
  getTotalVoiceNotesSent,
  getTotalMessages,
  getDailyActiveUsers,
  getWeeklyActiveUsers,
  getAllUsers,
  getUserConversations,
  getUserById,
  getRecentActivity,
  getDashboardStats,
  getDashboardStatsForPeriod,
  // Optimized functions with MV fallback
  getDashboardStatsOptimized,
  getAllUsersOptimized,
  getTotalUserCountOptimized,
  // Session analytics
  getTotalSessions,
  getSessionsPerDay,
  getAverageSessionLength,
  getSessionTypeBreakdown,
  getMostActiveSessionHours,
  getSessionsToday,
  getSessionsThisWeek,
  getAverageMessagesPerSession,
  getSessionAnalytics,
  // Funnel analytics
  getFunnelMetrics,
  getFunnelMetricsForDays,
  getTrafficSources,
  getFunnelMetricsByDate,
  // Coaching and lesson plans
  getUserCoachingSessions,
  getUserLessonPlans,
  getTotalLessonPlans,
  getTotalPresentations,
  getTotalCompletedCoachingSessions,
  getTotalVideosGenerated,
  getTotalReadingAssessments,
  getRegistrationRate,
  getFeatureDiscoveryRate,
  // User activity
  getUserVideoRequests,
  getUserReadingSessions,
  // Release notes
  getRecentReleaseNotes,
  getReleaseNotes,
  insertReleaseNote,
  promoteReleaseNote,
  // Broadcast feature
  getUsersForBroadcast,
  getBroadcastUserCounts,
  getBroadcastLogs,
  getBroadcastById,
  createBroadcastLog,
  updateBroadcastLog,
  insertBroadcastMessages,
  createBroadcastMessage,
  updateBroadcastMessage,
  getPendingBroadcastMessages,
  checkActiveBroadcast,
  checkDuplicateBroadcast,
  checkBroadcastCooldown,
  getInterruptedBroadcasts
};
