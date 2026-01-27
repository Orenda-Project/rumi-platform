/**
 * RBAC Middleware
 *
 * Role-Based Access Control middleware for checking user roles.
 * Verifies that the authenticated user has the required role(s) to access a route.
 *
 * Roles (from highest to lowest privilege):
 * - super_admin: Full access to everything
 * - admin: Legacy admin role (being phased out)
 * - partner_admin: Partner organization admin (limited to their scope)
 * - partner_viewer: Partner organization viewer (read-only within their scope)
 * - viewer: Legacy viewer role (being phased out)
 */

const pool = require('../../config/database');

/**
 * RBAC Middleware Factory
 * Creates middleware that checks if user has one of the allowed roles
 *
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 * @returns {Function} Express middleware function
 *
 * @example
 * // Only super_admin can access
 * router.get('/admin/partners', requireRole('super_admin'), getPartners);
 *
 * @example
 * // super_admin or partner_admin can access
 * router.get('/users', requireRole(['super_admin', 'partner_admin']), getUsers);
 */
function requireRole(allowedRoles) {
  // Normalize to array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      // Get user role from database (BEFORE SET ROLE)
      // Note: We query BEFORE the database-context middleware sets portal_app_user role
      const result = await pool.query(
        'SELECT role FROM dashboard_users WHERE id = $1 AND is_active = true',
        [req.session.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found or inactive'
        });
      }

      const userRole = result.rows[0].role;

      // Check if user has one of the allowed roles
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          userRole
        });
      }

      // Attach user role to request for downstream use
      req.userRole = userRole;

      next();
    } catch (error) {
      console.error('Error in RBAC middleware:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check user permissions'
      });
    }
  };
}

/**
 * Convenience middleware for super admin only routes
 */
const requireSuperAdmin = requireRole('super_admin');

/**
 * Convenience middleware for admin routes (super_admin or admin)
 */
const requireAdmin = requireRole(['super_admin', 'admin']);

/**
 * Convenience middleware for partner admin routes
 * NOTE: Also includes legacy 'viewer' and 'admin' roles for backward compatibility
 * These roles will be migrated to partner_viewer/partner_admin over time
 */
const requirePartnerAdmin = requireRole(['super_admin', 'admin', 'partner_admin', 'partner_viewer', 'viewer']);

/**
 * Convenience middleware for any authenticated user with a valid role
 */
const requireAuth = requireRole(['super_admin', 'admin', 'partner_admin', 'partner_viewer', 'viewer']);

module.exports = {
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requirePartnerAdmin,
  requireAuth
};
