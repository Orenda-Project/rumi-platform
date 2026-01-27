/**
 * Access Scope Service
 * Manages partner admin access scopes for RLS enforcement
 *
 * Scope Types:
 * - all: Full access to all users (for legacy compatibility)
 * - country: Filter by phone number country codes (e.g., {country_codes: ['+92', '+94']})
 * - school: Filter by specific school names (e.g., {school_names: ['ABC School']})
 * - phone_list: Filter by specific phone numbers (e.g., {phone_numbers: ['923001234567']})
 * - combined: Multiple filters (country + schools, etc.)
 */

/**
 * Create a new access scope for a partner admin
 * @param {Object} dbClient - Database client with transaction support
 * @param {string} dashboardUserId - Dashboard user ID (UUID)
 * @param {string} scopeType - 'country', 'school', or 'region'
 * @param {Object} scopeValue - JSON object with scope configuration
 * @param {number} expirationDays - Optional expiration days (null = no expiration)
 * @returns {Promise<Object>} Created scope object
 */
async function createScope(dbClient, dashboardUserId, scopeType, scopeValue) {
  try {
    // Normalize scope value (strip '+' from country codes)
    const normalizedScopeValue = normalizeScopeValue(scopeType, scopeValue);

    // Validate scope configuration
    const validation = validateScope(scopeType, normalizedScopeValue);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check if user is super admin (super admins cannot have scopes)
    const userCheck = await dbClient.query(
      'SELECT role FROM dashboard_users WHERE id = $1',
      [dashboardUserId]
    );

    if (userCheck.rows.length === 0) {
      throw new Error('User not found');
    }

    if (userCheck.rows[0].role === 'super_admin') {
      throw new Error('Super admins cannot have scopes - they have full access');
    }

    // Check for existing scope
    const existingCheck = await dbClient.query(
      'SELECT id FROM access_scopes WHERE dashboard_user_id = $1',
      [dashboardUserId]
    );

    if (existingCheck.rows.length > 0) {
      throw new Error('Scope already exists for this user - use updateScope to modify');
    }

    // Create scope
    const result = await dbClient.query(
      `INSERT INTO access_scopes (dashboard_user_id, scope_type, scope_value)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dashboardUserId, scopeType, JSON.stringify(normalizedScopeValue)]
    );

    const scope = result.rows[0];

    return {
      ...scope,
      scope_value: typeof scope.scope_value === 'string'
        ? JSON.parse(scope.scope_value)
        : scope.scope_value
    };
  } catch (error) {
    console.error('Error creating scope:', error);
    throw error;
  }
}

/**
 * Get access scope for a dashboard user
 * @param {Object} dbClient - Database client
 * @param {string} dashboardUserId - Dashboard user ID (UUID)
 * @returns {Promise<Object|null>} Scope object or null if not found
 */
async function getScope(dbClient, dashboardUserId) {
  try {
    const result = await dbClient.query(
      `SELECT * FROM access_scopes WHERE dashboard_user_id = $1`,
      [dashboardUserId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const scope = result.rows[0];

    return {
      ...scope,
      scope_value: typeof scope.scope_value === 'string'
        ? JSON.parse(scope.scope_value)
        : scope.scope_value
    };
  } catch (error) {
    console.error('Error getting scope:', error);
    throw error;
  }
}

/**
 * Update access scope for a dashboard user
 * @param {Object} dbClient - Database client
 * @param {string} dashboardUserId - Dashboard user ID (UUID)
 * @param {string} scopeType - New scope type
 * @param {Object} scopeValue - New scope value
 * @returns {Promise<Object>} Updated scope object
 */
async function updateScope(dbClient, dashboardUserId, scopeType, scopeValue) {
  try {
    // Normalize scope value (strip '+' from country codes)
    const normalizedScopeValue = normalizeScopeValue(scopeType, scopeValue);

    // Validate scope configuration
    const validation = validateScope(scopeType, normalizedScopeValue);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check if scope exists
    const existingCheck = await dbClient.query(
      'SELECT id FROM access_scopes WHERE dashboard_user_id = $1',
      [dashboardUserId]
    );

    if (existingCheck.rows.length === 0) {
      throw new Error('Scope not found for this user - use createScope to create one');
    }

    // Update scope
    const result = await dbClient.query(
      `UPDATE access_scopes
       SET scope_type = $1, scope_value = $2, updated_at = NOW()
       WHERE dashboard_user_id = $3
       RETURNING *`,
      [scopeType, JSON.stringify(normalizedScopeValue), dashboardUserId]
    );

    const scope = result.rows[0];

    return {
      ...scope,
      scope_value: typeof scope.scope_value === 'string'
        ? JSON.parse(scope.scope_value)
        : scope.scope_value
    };
  } catch (error) {
    console.error('Error updating scope:', error);
    throw error;
  }
}

/**
 * Delete access scope for a dashboard user
 * @param {Object} dbClient - Database client
 * @param {string} dashboardUserId - Dashboard user ID (UUID)
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteScope(dbClient, dashboardUserId) {
  try {
    const result = await dbClient.query(
      'DELETE FROM access_scopes WHERE dashboard_user_id = $1 RETURNING id',
      [dashboardUserId]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error deleting scope:', error);
    throw error;
  }
}

/**
 * Normalize scope value - strip '+' from country codes
 * @param {string} scopeType - Scope type
 * @param {Object} scopeValue - Scope value to normalize
 * @returns {Object} Normalized scope value
 */
function normalizeScopeValue(scopeType, scopeValue) {
  if (!scopeValue) return scopeValue;

  const normalized = { ...scopeValue };

  // Strip '+' from country codes since database stores phone numbers without it
  if ((scopeType === 'country' || scopeType === 'combined') && normalized.country_codes) {
    normalized.country_codes = normalized.country_codes.map(code =>
      typeof code === 'string' ? code.replace(/^\+/, '') : code
    );
  }

  return normalized;
}

/**
 * Validate scope configuration
 * @param {string} scopeType - Scope type
 * @param {Object} scopeValue - Scope value
 * @returns {Object} {valid: boolean, error: string|null}
 */
function validateScope(scopeType, scopeValue) {
  // 'all' scope type has null scope_value
  if (scopeType === 'all') {
    if (scopeValue === null || Object.keys(scopeValue || {}).length === 0) {
      return { valid: true, error: null };
    }
    return { valid: false, error: 'Invalid scope configuration' };
  }

  // Check for valid scope type first
  const validTypes = ['country', 'school', 'phone_list', 'combined'];
  if (!validTypes.includes(scopeType)) {
    return { valid: false, error: 'Invalid scope type' };
  }

  if (!scopeValue || typeof scopeValue !== 'object') {
    return { valid: false, error: 'Invalid scope configuration' };
  }

  if (Object.keys(scopeValue).length === 0) {
    return { valid: false, error: 'Scope value cannot be empty' };
  }

  switch (scopeType) {
    case 'country':
      if (Array.isArray(scopeValue.country_codes) && scopeValue.country_codes.length > 0) {
        return { valid: true, error: null };
      }
      return { valid: false, error: 'Invalid scope configuration' };

    case 'school':
      if (Array.isArray(scopeValue.school_names) && scopeValue.school_names.length > 0) {
        return { valid: true, error: null };
      }
      return { valid: false, error: 'Invalid scope configuration' };

    case 'phone_list':
      if (Array.isArray(scopeValue.phone_numbers) && scopeValue.phone_numbers.length > 0) {
        return { valid: true, error: null };
      }
      return { valid: false, error: 'Invalid scope configuration' };

    case 'combined':
      // Combined scope must have at least one valid filter
      const hasCountry = Array.isArray(scopeValue.country_codes) && scopeValue.country_codes.length > 0;
      const hasSchools = Array.isArray(scopeValue.school_names) && scopeValue.school_names.length > 0;
      const hasPhones = Array.isArray(scopeValue.phone_numbers) && scopeValue.phone_numbers.length > 0;
      if (hasCountry || hasSchools || hasPhones) {
        return { valid: true, error: null };
      }
      return { valid: false, error: 'Invalid scope configuration' };

    default:
      return { valid: false, error: 'Invalid scope type' };
  }
}

/**
 * Get statistics about scopes (for super admin dashboard)
 * @param {Object} dbClient - Database client
 * @returns {Promise<Object>} Statistics object
 */
async function getScopeStats(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE scope_type = 'all') as all,
        COUNT(*) FILTER (WHERE scope_type = 'country') as country,
        COUNT(*) FILTER (WHERE scope_type = 'school') as school,
        COUNT(*) FILTER (WHERE scope_type = 'phone_list') as phone_list,
        COUNT(*) FILTER (WHERE scope_type = 'combined') as combined
      FROM access_scopes
    `);

    const stats = result.rows[0];

    // Get count of partner admins without scopes
    const withoutScopeResult = await dbClient.query(`
      SELECT COUNT(*) as count
      FROM dashboard_users du
      LEFT JOIN access_scopes acs ON du.id = acs.dashboard_user_id
      WHERE du.role = 'partner_admin' AND acs.id IS NULL
    `);

    return {
      total: parseInt(stats.total) || 0,
      byType: {
        all: parseInt(stats.all) || 0,
        country: parseInt(stats.country) || 0,
        school: parseInt(stats.school) || 0,
        phone_list: parseInt(stats.phone_list) || 0,
        combined: parseInt(stats.combined) || 0
      },
      withoutScope: parseInt(withoutScopeResult.rows[0].count) || 0
    };
  } catch (error) {
    console.error('Error getting scope stats:', error);
    throw error;
  }
}

/**
 * Get all users with a specific scope type
 * @param {Object} dbClient - Database client
 * @param {string} scopeType - Scope type to filter by
 * @returns {Promise<Array>} Array of users with scope details
 */
async function getUsersWithScope(dbClient, scopeType) {
  try {
    const result = await dbClient.query(
      `SELECT
        acs.dashboard_user_id,
        acs.scope_type,
        acs.scope_value,
        acs.created_at,
        acs.updated_at,
        du.username,
        du.email,
        du.role
       FROM access_scopes acs
       INNER JOIN dashboard_users du ON acs.dashboard_user_id = du.id
       WHERE acs.scope_type = $1
       ORDER BY acs.created_at DESC`,
      [scopeType]
    );

    return result.rows.map(row => ({
      ...row,
      scope_value: typeof row.scope_value === 'string'
        ? JSON.parse(row.scope_value)
        : row.scope_value
    }));
  } catch (error) {
    console.error('Error getting users with scope:', error);
    throw error;
  }
}

module.exports = {
  createScope,
  getScope,
  updateScope,
  deleteScope,
  validateScope,
  normalizeScopeValue,
  getScopeStats,
  getUsersWithScope
};
