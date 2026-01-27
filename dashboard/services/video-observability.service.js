/**
 * Video Observability Service
 * Provides queries for admin video gallery with RLS enforcement
 */

/**
 * Get all videos with pagination, filtering, and user info
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {Object} options - Query options
 * @returns {Object} { videos, totalCount, hasMore }
 */
async function getVideos(dbClient, {
  page = 1,
  limit = 20,
  statusFilter = 'all',
  languageFilter = null,
  dateFrom = null,
  dateTo = null,
  userId = null,
  topicSearch = null
} = {}) {
  // Ensure page is at least 1
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * limit;

  // Build WHERE clause dynamically
  const conditions = [];
  const params = [limit, offset];
  let paramIndex = 3;

  // Apply status filter
  if (statusFilter !== 'all') {
    if (statusFilter === 'processing') {
      conditions.push(`vr.status IN ($${paramIndex++}, $${paramIndex++})`);
      params.push('processing', 'queued');
    } else {
      conditions.push(`vr.status = $${paramIndex++}`);
      params.push(statusFilter);
    }
  }

  if (languageFilter) {
    conditions.push(`vr.language = $${paramIndex++}`);
    params.push(languageFilter);
  }

  if (dateFrom) {
    conditions.push(`vr.created_at >= $${paramIndex++}`);
    params.push(`${dateFrom}T00:00:00Z`);
  }

  if (dateTo) {
    conditions.push(`vr.created_at <= $${paramIndex++}`);
    params.push(`${dateTo}T23:59:59Z`);
  }

  if (userId) {
    conditions.push(`vr.user_id = $${paramIndex++}`);
    params.push(userId);
  }

  if (topicSearch) {
    conditions.push(`vr.topic ILIKE $${paramIndex++}`);
    params.push(`%${topicSearch}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Videos query with user info
  const videosQuery = `
    SELECT
      vr.id,
      vr.user_id,
      vr.topic,
      vr.language,
      vr.status,
      vr.current_step,
      vr.video_url,
      vr.pdf_url,
      vr.slide_urls,
      vr.error_message,
      vr.generation_time_seconds,
      vr.estimated_cost,
      vr.created_at,
      vr.completed_at,
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.school_name
    FROM video_requests vr
    INNER JOIN users u ON vr.user_id = u.id
    ${whereClause}
    ORDER BY vr.created_at DESC
    LIMIT $1 OFFSET $2
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM video_requests vr
    INNER JOIN users u ON vr.user_id = u.id
    ${whereClause}
  `;

  try {
    // Run both queries in parallel
    const [videosResult, countResult] = await Promise.all([
      dbClient.query(videosQuery, params),
      dbClient.query(countQuery, params.slice(2)) // Skip limit and offset for count
    ]);

    const totalCount = parseInt(countResult.rows[0].total) || 0;

    // Transform rows to match Supabase nested structure
    const videos = videosResult.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      topic: row.topic,
      language: row.language,
      status: row.status,
      current_step: row.current_step,
      video_url: row.video_url,
      pdf_url: row.pdf_url,
      slide_urls: row.slide_urls,
      error_message: row.error_message,
      generation_time_seconds: row.generation_time_seconds,
      estimated_cost: row.estimated_cost,
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
      videos,
      totalCount,
      hasMore: totalCount > offset + limit
    };
  } catch (error) {
    console.error('Failed to fetch videos:', error);
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }
}

/**
 * Get video status statistics
 * Uses efficient FILTER clause for conditional aggregation
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @returns {Object} Count of videos by status
 */
async function getVideoStats(dbClient) {
  // Single query with FILTER clauses (much more efficient than 5 separate queries)
  const result = await dbClient.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status IN ('processing', 'queued')) as processing,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
    FROM video_requests
  `);

  const row = result.rows[0];
  const all = parseInt(row.total) || 0;
  const completed = parseInt(row.completed) || 0;

  return {
    all,
    completed,
    processing: parseInt(row.processing) || 0,
    failed: parseInt(row.failed) || 0,
    cancelled: parseInt(row.cancelled) || 0,
    successRate: all > 0 ? Math.round((completed / all) * 100) : 0
  };
}

/**
 * Get videos aggregated by date
 * Uses database GROUP BY for efficient aggregation
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {number} days - Number of days to look back
 * @returns {Array} Daily video counts
 */
async function getVideosByDate(dbClient, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await dbClient.query(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM video_requests
    WHERE created_at >= $1
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [startDate.toISOString()]);

  return result.rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    total: parseInt(row.total),
    completed: parseInt(row.completed),
    failed: parseInt(row.failed)
  }));
}

/**
 * Get a single video by ID with user info
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @param {string} videoId - Video UUID
 * @returns {Object|null} Video details or null if not found
 */
async function getVideoById(dbClient, videoId) {
  const result = await dbClient.query(`
    SELECT
      vr.id,
      vr.user_id,
      vr.topic,
      vr.language,
      vr.status,
      vr.current_step,
      vr.video_url,
      vr.pdf_url,
      vr.slide_urls,
      vr.script_data,
      vr.error_message,
      vr.generation_time_seconds,
      vr.estimated_cost,
      vr.created_at,
      vr.completed_at,
      u.id as user_id,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.school_name
    FROM video_requests vr
    INNER JOIN users u ON vr.user_id = u.id
    WHERE vr.id = $1
  `, [videoId]);

  // Return null if no rows found
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Transform to match Supabase nested structure
  return {
    id: row.id,
    user_id: row.user_id,
    topic: row.topic,
    language: row.language,
    status: row.status,
    current_step: row.current_step,
    video_url: row.video_url,
    pdf_url: row.pdf_url,
    slide_urls: row.slide_urls,
    script_data: row.script_data,
    error_message: row.error_message,
    generation_time_seconds: row.generation_time_seconds,
    estimated_cost: row.estimated_cost,
    created_at: row.created_at,
    completed_at: row.completed_at,
    users: {
      id: row.user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      phone_number: row.phone_number,
      school_name: row.school_name
    }
  };
}

/**
 * Get users with video counts for filter dropdown
 * Uses database GROUP BY for efficient aggregation
 * @param {Object} dbClient - Database client with RLS context (from req.dbClient)
 * @returns {Array} Users with video counts
 */
async function getUsersWithVideos(dbClient) {
  // Database does the grouping and counting
  const result = await dbClient.query(`
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.phone_number,
      COUNT(vr.id) as video_count
    FROM users u
    INNER JOIN video_requests vr ON u.id = vr.user_id
    GROUP BY u.id, u.first_name, u.last_name, u.phone_number
    ORDER BY video_count DESC
  `);

  return result.rows.map(row => ({
    id: row.id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.phone_number,
    phone: row.phone_number,
    count: parseInt(row.video_count)
  }));
}

module.exports = {
  getVideos,
  getVideoById,
  getVideoStats,
  getVideosByDate,
  getUsersWithVideos
};
