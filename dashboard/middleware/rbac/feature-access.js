/**
 * Feature Access Middleware
 *
 * Checks if a user has access to a specific feature based on their role.
 * Uses the feature_permissions table to determine access.
 *
 * Features:
 * - users: Bot user management
 * - coaching: Coaching sessions
 * - videos: Video generation requests
 * - analytics: Analytics dashboard
 * - dashboard: Main dashboard
 * - funnel: Registration funnel
 * - retention: User retention metrics
 * - settings: Portal settings (admin only)
 * - partner_management: Partner organization management (super_admin only)
 * - etc.
 */

const pool = require('../../config/database');

/**
 * Feature Access Middleware Factory
 * Creates middleware that checks if user has access to a feature
 *
 * @param {string} featureKey - Feature identifier (e.g., 'users', 'coaching', 'videos')
 * @returns {Function} Express middleware function
 *
 * @example
 * // Check if user can access users feature
 * router.get('/api/users', requireFeatureAccess('users'), getUsers);
 *
 * @example
 * // Check if user can access partner management
 * router.post('/api/partners', requireFeatureAccess('partner_management'), createPartner);
 */
function requireFeatureAccess(featureKey) {
  return async (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      // Get user role if not already attached by RBAC middleware
      let userRole = req.userRole;

      if (!userRole) {
        const userResult = await pool.query(
          'SELECT role FROM dashboard_users WHERE id = $1 AND is_active = true',
          [req.session.userId]
        );

        if (userResult.rows.length === 0) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'User not found or inactive'
          });
        }

        userRole = userResult.rows[0].role;
        req.userRole = userRole;
      }

      // Check feature permission
      const permissionResult = await pool.query(
        `SELECT can_access
         FROM feature_permissions
         WHERE role = $1 AND feature_key = $2`,
        [userRole, featureKey]
      );

      if (permissionResult.rows.length === 0) {
        // No permission row means feature doesn't exist or role not configured
        return res.status(403).json({
          error: 'Forbidden',
          message: `Feature '${featureKey}' not available for role '${userRole}'`,
          featureKey,
          userRole
        });
      }

      const canAccess = permissionResult.rows[0].can_access;

      if (!canAccess) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Access denied to feature '${featureKey}'`,
          featureKey,
          userRole
        });
      }

      // Attach feature key to request for logging/audit
      req.featureKey = featureKey;

      next();
    } catch (error) {
      console.error('Error in feature access middleware:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check feature permissions'
      });
    }
  };
}

/**
 * Get all accessible features for a user
 * Helper function for building UI menus/navigation
 *
 * @param {string} userId - User ID
 * @returns {Promise<string[]>} Array of accessible feature keys
 */
async function getAccessibleFeatures(userId) {
  try {
    const userResult = await pool.query(
      'SELECT role FROM dashboard_users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return [];
    }

    const userRole = userResult.rows[0].role;

    const permissionsResult = await pool.query(
      `SELECT feature_key
       FROM feature_permissions
       WHERE role = $1 AND can_access = true
       ORDER BY feature_key`,
      [userRole]
    );

    return permissionsResult.rows.map(row => row.feature_key);
  } catch (error) {
    console.error('Error getting accessible features:', error);
    return [];
  }
}

/**
 * Check if user has access to a feature (non-middleware version)
 * Use this in service layer or route handlers
 *
 * @param {string} userId - User ID
 * @param {string} featureKey - Feature identifier
 * @returns {Promise<boolean>} True if user has access
 */
async function hasFeatureAccess(userId, featureKey) {
  try {
    const userResult = await pool.query(
      'SELECT role FROM dashboard_users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return false;
    }

    const userRole = userResult.rows[0].role;

    const permissionResult = await pool.query(
      `SELECT can_access
       FROM feature_permissions
       WHERE role = $1 AND feature_key = $2`,
      [userRole, featureKey]
    );

    if (permissionResult.rows.length === 0) {
      return false;
    }

    return permissionResult.rows[0].can_access;
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
}

module.exports = {
  requireFeatureAccess,
  getAccessibleFeatures,
  hasFeatureAccess
};
