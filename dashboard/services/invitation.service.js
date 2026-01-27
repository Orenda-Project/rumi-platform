/**
 * Invitation Service
 * Manages partner admin invitations with email delivery
 *
 * Flow:
 * 1. Super admin creates invitation with email + scope configuration
 * 2. Invitation email sent with secure token link
 * 3. User clicks link, sets username/password
 * 4. Account created with specified scope
 * 5. User can immediately log in
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const accessScopeService = require('./access-scope.service');

/**
 * Create a new invitation for a partner admin
 * @param {Object} dbClient - Database client with transaction support
 * @param {string} email - Email address for invitation
 * @param {string} role - Role for new user ('partner_admin' only)
 * @param {Object} scopeConfig - {scope_type, scope_value} configuration
 * @param {string} invitedBy - Dashboard user ID of inviter (super admin)
 * @param {number} expirationDays - Days until expiration (default 7)
 * @returns {Promise<Object>} Created invitation object
 */
async function createInvitation(
  dbClient,
  email,
  role,
  scopeConfig,
  invitedBy,
  expirationDays = 7
) {
  try {
    // Validate role - allow partner_admin and partner_viewer
    const allowedRoles = ['partner_admin', 'partner_viewer'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Invalid role - only partner_admin or partner_viewer roles are allowed');
    }

    // Validate scope configuration
    const validation = accessScopeService.validateScope(scopeConfig.scope_type, scopeConfig.scope_value);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Check if user with this email already exists
    const existingUserCheck = await dbClient.query(
      'SELECT id FROM dashboard_users WHERE email = $1',
      [email]
    );

    if (existingUserCheck.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Check for existing pending invitation
    const existingInvitationCheck = await dbClient.query(
      'SELECT id FROM invitations WHERE email = $1 AND status = $2',
      [email, 'pending']
    );

    if (existingInvitationCheck.rows.length > 0) {
      throw new Error('Pending invitation already exists for this email');
    }

    // Generate secure token (64 characters hex)
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Create invitation
    const result = await dbClient.query(
      `INSERT INTO invitations (email, role, scope_config, token, expires_at, invited_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        email,
        role,
        JSON.stringify(scopeConfig),
        token,
        expiresAt.toISOString(),
        invitedBy,
        'pending'
      ]
    );

    const invitation = result.rows[0];

    return {
      ...invitation,
      scope_config: typeof invitation.scope_config === 'string'
        ? JSON.parse(invitation.scope_config)
        : invitation.scope_config
    };
  } catch (error) {
    console.error('Error creating invitation:', error);
    throw error;
  }
}

/**
 * Get invitation by token
 * @param {Object} dbClient - Database client
 * @param {string} token - Invitation token
 * @returns {Promise<Object|null>} Invitation object or null
 */
async function getInvitation(dbClient, token) {
  try {
    const result = await dbClient.query(
      `SELECT
        inv.*,
        du.username as inviter_username,
        du.email as inviter_email
       FROM invitations inv
       LEFT JOIN dashboard_users du ON inv.invited_by = du.id
       WHERE inv.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const invitation = result.rows[0];

    return {
      ...invitation,
      scope_config: typeof invitation.scope_config === 'string'
        ? JSON.parse(invitation.scope_config)
        : invitation.scope_config
    };
  } catch (error) {
    console.error('Error getting invitation:', error);
    throw error;
  }
}

/**
 * Get all pending invitations
 * @param {Object} dbClient - Database client
 * @returns {Promise<Array>} Array of pending invitations
 */
async function getPendingInvitations(dbClient) {
  try {
    const result = await dbClient.query(
      `SELECT
        inv.*,
        du.username as inviter_username,
        du.email as inviter_email
       FROM invitations inv
       LEFT JOIN dashboard_users du ON inv.invited_by = du.id
       WHERE inv.status = 'pending'
       ORDER BY inv.created_at DESC`
    );

    return result.rows.map(row => ({
      ...row,
      scope_config: typeof row.scope_config === 'string'
        ? JSON.parse(row.scope_config)
        : row.scope_config
    }));
  } catch (error) {
    console.error('Error getting pending invitations:', error);
    throw error;
  }
}

/**
 * Accept invitation and create user account
 * @param {Object} dbClient - Database client with transaction support
 * @param {string} token - Invitation token
 * @param {string} username - Desired username
 * @param {string} password - Password (will be hashed)
 * @returns {Promise<Object>} Created user and scope information
 */
async function acceptInvitation(dbClient, token, username, password) {
  try {
    // Validate password strength
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Get invitation
    const invitation = await getInvitation(dbClient, token);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    // Check if already accepted
    if (invitation.status === 'accepted') {
      throw new Error('Invitation has already been accepted');
    }

    // Check if revoked
    if (invitation.status === 'revoked') {
      throw new Error('Invitation has been revoked');
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      throw new Error('Invitation has expired');
    }

    // Check if username is taken
    const usernameCheck = await dbClient.query(
      'SELECT id FROM dashboard_users WHERE username = $1',
      [username]
    );

    if (usernameCheck.rows.length > 0) {
      throw new Error('Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user account
    const userResult = await dbClient.query(
      `INSERT INTO dashboard_users (email, username, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [invitation.email, username, passwordHash, invitation.role, true]
    );

    const user = userResult.rows[0];

    // Create access scope
    await accessScopeService.createScope(
      dbClient,
      user.id,
      invitation.scope_config.scope_type,
      invitation.scope_config.scope_value
    );

    // Update invitation status
    await dbClient.query(
      `UPDATE invitations
       SET status = 'accepted', accepted_at = NOW(), created_user_id = $1
       WHERE token = $2`,
      [user.id, token]
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at
      },
      scope: invitation.scope_config
    };
  } catch (error) {
    console.error('Error accepting invitation:', error);
    throw error;
  }
}

/**
 * Revoke/cancel a pending invitation
 * @param {Object} dbClient - Database client
 * @param {string} token - Invitation token
 * @returns {Promise<boolean>} True if revoked, false if not found
 */
async function revokeInvitation(dbClient, token) {
  try {
    // Check current status
    const invitation = await getInvitation(dbClient, token);

    if (!invitation) {
      return false;
    }

    if (invitation.status === 'accepted') {
      throw new Error('Cannot revoke accepted invitation');
    }

    // Revoke invitation
    const result = await dbClient.query(
      `UPDATE invitations
       SET status = 'revoked', revoked_at = NOW()
       WHERE token = $1 AND status = 'pending'
       RETURNING id`,
      [token]
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error revoking invitation:', error);
    throw error;
  }
}

/**
 * Check if invitation is valid (pending and not expired)
 * @param {Object} dbClient - Database client
 * @param {string} token - Invitation token
 * @returns {Promise<boolean>} True if valid
 */
async function isInvitationValid(dbClient, token) {
  try {
    const invitation = await getInvitation(dbClient, token);

    if (!invitation) {
      return false;
    }

    if (invitation.status !== 'pending') {
      return false;
    }

    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking invitation validity:', error);
    return false;
  }
}

/**
 * Resend invitation email
 * @param {Object} dbClient - Database client
 * @param {string} token - Invitation token
 * @returns {Promise<boolean>} True if resent
 */
async function resendInvitation(dbClient, token) {
  try {
    const invitation = await getInvitation(dbClient, token);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Can only resend pending invitations');
    }

    // Update last_sent_at timestamp
    await dbClient.query(
      'UPDATE invitations SET last_sent_at = NOW() WHERE token = $1',
      [token]
    );

    // TODO: Send email via email service
    // await emailService.sendInvitationEmail(invitation.email, token);

    return true;
  } catch (error) {
    console.error('Error resending invitation:', error);
    throw error;
  }
}

/**
 * Get invitation statistics (for super admin dashboard)
 * @param {Object} dbClient - Database client
 * @returns {Promise<Object>} Statistics object
 */
async function getInvitationStats(dbClient) {
  try {
    const result = await dbClient.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE status = 'revoked') as revoked,
        COUNT(*) FILTER (WHERE status = 'pending' AND expires_at < NOW()) as expired
      FROM invitations
    `);

    const stats = result.rows[0];

    return {
      total: parseInt(stats.total) || 0,
      pending: parseInt(stats.pending) || 0,
      accepted: parseInt(stats.accepted) || 0,
      revoked: parseInt(stats.revoked) || 0,
      expired: parseInt(stats.expired) || 0
    };
  } catch (error) {
    console.error('Error getting invitation stats:', error);
    throw error;
  }
}

module.exports = {
  createInvitation,
  getInvitation,
  getPendingInvitations,
  acceptInvitation,
  revokeInvitation,
  isInvitationValid,
  resendInvitation,
  getInvitationStats
};
