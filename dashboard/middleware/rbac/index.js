/**
 * RBAC Middleware Index
 *
 * Exports all RBAC-related middleware for easy importing
 */

const {
  setDatabaseContext,
  withDatabaseContext
} = require('./database-context');

const {
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requirePartnerAdmin,
  requireAuth
} = require('./rbac');

const {
  requireFeatureAccess,
  getAccessibleFeatures,
  hasFeatureAccess
} = require('./feature-access');

module.exports = {
  // Database Context
  setDatabaseContext,
  withDatabaseContext,

  // RBAC
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requirePartnerAdmin,
  requireAuth,

  // Feature Access
  requireFeatureAccess,
  getAccessibleFeatures,
  hasFeatureAccess
};
