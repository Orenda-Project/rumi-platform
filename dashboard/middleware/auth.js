/**
 * Authentication Middleware for Admin Dashboard with RBAC
 */

const pool = require('../config/database');

/**
 * Middleware to check if user is authenticated (for observability dashboard)
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }

  // Store the requested URL to redirect after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/observability/login');
}

/**
 * Helper function to check if a role has admin-level access
 * Both 'admin' and 'super_admin' have full admin privileges
 */
function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Middleware to check if user is admin (for observability dashboard)
 * Accepts both 'admin' and 'super_admin' roles
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAuthenticated) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/observability/login');
  }

  if (!isAdminRole(req.session.userRole)) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to access this page.',
      error: { status: 403 }
    });
  }

  next();
}

/**
 * Middleware to redirect if already authenticated (for observability dashboard)
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/observability/dashboard');
  }
  next();
}

/**
 * Middleware to add user info to response locals
 * CRITICAL: Refreshes role from database to ensure it's not stale
 * This fixes issues where role changes weren't reflected until re-login
 */
async function addUserToLocals(req, res, next) {
  res.locals.isAuthenticated = req.session.isAuthenticated || false;
  res.locals.username = req.session.username || null;
  res.locals.userId = req.session.userId || null;
  res.locals.userEmail = req.session.userEmail || null;
  res.locals.userByofRole = req.session.userByofRole || null;  // BYOF role
  res.locals.accessScope = req.session.accessScope || null;  // Partner admin access scope

  // Refresh role from database for authenticated users (prevents stale session role)
  if (req.session.isAuthenticated && req.session.userId) {
    try {
      const result = await pool.query(
        'SELECT role FROM dashboard_users WHERE id = $1 AND is_active = true',
        [req.session.userId]
      );

      if (result.rows.length > 0) {
        const freshRole = result.rows[0].role;
        // Update session if role has changed
        if (req.session.userRole !== freshRole) {
          console.log(`Role updated for user ${req.session.username}: ${req.session.userRole} → ${freshRole}`);
          req.session.userRole = freshRole;
        }
        res.locals.userRole = freshRole;
        res.locals.isAdmin = isAdminRole(freshRole);
      } else {
        // User not found or inactive - use session value as fallback
        res.locals.userRole = req.session.userRole || null;
        res.locals.isAdmin = isAdminRole(req.session.userRole);
      }
    } catch (error) {
      console.error('Error refreshing user role:', error);
      // Fallback to session value on error
      res.locals.userRole = req.session.userRole || null;
      res.locals.isAdmin = isAdminRole(req.session.userRole);
    }
  } else {
    res.locals.userRole = req.session.userRole || null;
    res.locals.isAdmin = isAdminRole(req.session.userRole);
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  redirectIfAuthenticated,
  addUserToLocals,
  isAdminRole
};
