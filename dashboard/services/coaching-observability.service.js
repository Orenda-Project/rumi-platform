/**
 * Get coaching sessions with pagination and filtering
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @param {string} statusFilter - 'all', 'completed', 'in_progress', 'failed', 'cancelled'
 * @param {string} dateFrom - Start date (YYYY-MM-DD format)
 * @param {string} dateTo - End date (YYYY-MM-DD format)
 * @returns {Object} { sessions, totalCount, hasMore }
 */
async function getCoachingSessions(dbClient, page = 1, limit = 10, statusFilter = 'all', dateFrom = null, dateTo = null) {
  const offset = (page - 1) * limit;

  // Build WHERE clause dynamically
  const conditions = [];
  const params = [limit, offset];
  let paramIndex = 3;

  // Apply status filter
  if (statusFilter === 'completed') {
    conditions.push(`cs.status = $${paramIndex++}`);
    params.push('completed');
  } else if (statusFilter === 'in_progress') {
    conditions.push(`cs.status IN ($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
    params.push('awaiting_lesson_plan', 'conducting_conversation', 'confirmed', 'generating_report', 'initiated');
  } else if (statusFilter === 'failed') {
    conditions.push(`cs.status = $${paramIndex++}`);
    params.push('failed');
  } else if (statusFilter === 'cancelled') {
    conditions.push(`cs.status = $${paramIndex++}`);
    params.push('cancelled');
  }
  // 'all' = no filter

  // Apply date range filter
  if (dateFrom) {
    conditions.push(`cs.created_at >= $${paramIndex++}`);
    params.push(`${dateFrom}T00:00:00Z`);
  }
  if (dateTo) {
    conditions.push(`cs.created_at <= $${paramIndex++}`);
    params.push(`${dateTo}T23:59:59Z`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // NOTE: Intentionally NOT fetching transcript_text and full analysis_data
  // These are large fields (10KB+) that slow down list view
  // Only fetch what's needed for the list display
  const sessionsQuery = `
    SELECT
      cs.id,
      cs.user_id,
      cs.session_id,
      cs.status,
      cs.last_successful_step,
      cs.failed_step,
      cs.error_message,
      cs.can_resume,
      cs.audio_url,
      cs.audio_duration_seconds,
      cs.report_pdf_url,
      cs.voice_debrief_url,
      cs.voice_debrief_duration_seconds,
      cs.created_at,
      cs.completed_at,
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.school_name
    FROM coaching_sessions cs
    INNER JOIN users u ON cs.user_id = u.id
    ${whereClause}
    ORDER BY cs.created_at DESC
    LIMIT $1 OFFSET $2
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM coaching_sessions cs
    INNER JOIN users u ON cs.user_id = u.id
    ${whereClause}
  `;

  try {
    // Run both queries in parallel
    const [sessionsResult, countResult] = await Promise.all([
      dbClient.query(sessionsQuery, params),
      dbClient.query(countQuery, params.slice(2)) // Skip limit and offset for count query
    ]);

    const totalCount = parseInt(countResult.rows[0].total) || 0;

    // Transform rows to match Supabase nested structure
    const sessions = sessionsResult.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      session_id: row.session_id,
      status: row.status,
      last_successful_step: row.last_successful_step,
      failed_step: row.failed_step,
      error_message: row.error_message,
      can_resume: row.can_resume,
      audio_url: row.audio_url,
      audio_duration_seconds: row.audio_duration_seconds,
      report_pdf_url: row.report_pdf_url,
      voice_debrief_url: row.voice_debrief_url,
      voice_debrief_duration_seconds: row.voice_debrief_duration_seconds,
      created_at: row.created_at,
      completed_at: row.completed_at,
      users: {
        id: row.user_id,
        first_name: row.first_name,
        last_name: row.last_name,
        phone_number: row.phone_number,
        school_name: row.school_name
      }
    }));

    return {
      sessions,
      totalCount,
      hasMore: totalCount > offset + limit
    };
  } catch (error) {
    console.error('Failed to fetch coaching sessions:', error);
    throw new Error(`Failed to fetch coaching sessions: ${error.message}`);
  }
}

/**
 * Get status statistics for dashboard
 * Uses efficient FILTER clause for conditional aggregation
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @returns {Object} Count of sessions by status
 */
async function getStatusStats(dbClient) {
  // Single query with FILTER clauses (much more efficient than 4 separate queries)
  const result = await dbClient.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) FILTER (WHERE status NOT IN ('completed', 'failed', 'cancelled')) as in_progress
    FROM coaching_sessions
  `);

  const row = result.rows[0];

  return {
    all: parseInt(row.total) || 0,
    completed: parseInt(row.completed) || 0,
    failed: parseInt(row.failed) || 0,
    cancelled: parseInt(row.cancelled) || 0,
    inProgress: parseInt(row.in_progress) || 0
  };
}

module.exports = {
  getCoachingSessions,
  getStatusStats
};
