/**
 * Authentication Service for Dashboard RBAC
 * Handles user authentication, password management, and role checks
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');

class AuthService {
  /**
   * Authenticate a user with username and password
   * Also fetches user's access scope for RLS enforcement
   */
  static async authenticate(username, password) {
    try {
      const { data: user, error } = await supabase
        .from('dashboard_users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .single();

      if (error || !user) {
        return { success: false, error: 'Invalid credentials' };
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return { success: false, error: 'Invalid credentials' };
      }

      // Update last login
      await supabase
        .from('dashboard_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id);

      // Fetch access scope for partner admins (super admins have no scope = full access)
      let accessScope = null;
      if (user.role === 'partner_admin') {
        const { data: scope, error: scopeError } = await supabase
          .from('access_scopes')
          .select('*')
          .eq('dashboard_user_id', user.id)
          .single();

        if (!scopeError && scope) {
          accessScope = {
            id: scope.id,
            scope_type: scope.scope_type,
            scope_value: scope.scope_value,
            created_at: scope.created_at,
            updated_at: scope.updated_at
          };
        }
      }

      // Remove sensitive data
      delete user.password_hash;
      delete user.invite_token;
      delete user.password_reset_token;

      return { success: true, user, accessScope };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Create a new user invitation
   */
  static async createInvitation(email, role, invitedById) {
    try {
      const inviteToken = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const { data, error } = await supabase
        .from('dashboard_users')
        .insert({
          email,
          username: email, // Temporary, user will set their own
          role,
          invited_by: invitedById,
          invite_token: inviteToken,
          invite_expires_at: expiresAt.toISOString(),
          is_active: false // Not active until password is set
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique violation
          return { success: false, error: 'User already exists' };
        }
        throw error;
      }

      return { success: true, inviteToken, user: data };
    } catch (error) {
      console.error('Create invitation error:', error);
      return { success: false, error: 'Failed to create invitation' };
    }
  }

  /**
   * Validate invitation token and get user
   */
  static async validateInviteToken(token) {
    try {
      const { data: user, error } = await supabase
        .from('dashboard_users')
        .select('*')
        .eq('invite_token', token)
        .gt('invite_expires_at', new Date().toISOString())
        .single();

      if (error || !user) {
        return { valid: false, error: 'Invalid or expired invitation' };
      }

      return { valid: true, user };
    } catch (error) {
      console.error('Validate token error:', error);
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Set up new user account with username and password
   */
  static async setupAccount(token, username, password) {
    try {
      // Validate token first
      const validation = await this.validateInviteToken(token);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Check if username is already taken
      const { data: existingUser } = await supabase
        .from('dashboard_users')
        .select('id')
        .eq('username', username)
        .neq('invite_token', token)
        .single();

      if (existingUser) {
        return { success: false, error: 'Username already taken' };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Update user account
      const { data: user, error } = await supabase
        .from('dashboard_users')
        .update({
          username,
          password_hash: passwordHash,
          invite_token: null,
          invite_expires_at: null,
          is_active: true
        })
        .eq('invite_token', token)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { success: true, user };
    } catch (error) {
      console.error('Setup account error:', error);
      return { success: false, error: 'Failed to set up account' };
    }
  }

  /**
   * Change user password
   */
  static async changePassword(userId, oldPassword, newPassword) {
    try {
      // Get user to verify old password
      const { data: user, error } = await supabase
        .from('dashboard_users')
        .select('password_hash')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return { success: false, error: 'User not found' };
      }

      // Verify old password
      const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
      if (!validPassword) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      const { error: updateError } = await supabase
        .from('dashboard_users')
        .update({ password_hash: newPasswordHash })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }

  /**
   * Get all users (for admin)
   */
  static async getAllUsers() {
    try {
      const { data: users, error } = await supabase
        .from('dashboard_users')
        .select('id, email, username, role, is_active, created_at, last_login')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return { success: true, users };
    } catch (error) {
      console.error('Get users error:', error);
      return { success: false, error: 'Failed to fetch users' };
    }
  }

  /**
   * Update user role (admin only)
   */
  static async updateUserRole(userId, newRole) {
    try {
      const { error } = await supabase
        .from('dashboard_users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Update role error:', error);
      return { success: false, error: 'Failed to update user role' };
    }
  }

  /**
   * Deactivate user (soft delete)
   */
  static async deactivateUser(userId) {
    try {
      const { error } = await supabase
        .from('dashboard_users')
        .update({ is_active: false })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Deactivate user error:', error);
      return { success: false, error: 'Failed to deactivate user' };
    }
  }

  /**
   * Reactivate user (undo deactivation)
   */
  static async reactivateUser(userId) {
    try {
      const { error } = await supabase
        .from('dashboard_users')
        .update({ is_active: true })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Reactivate user error:', error);
      return { success: false, error: 'Failed to reactivate user' };
    }
  }

  /**
   * Delete user permanently (hard delete)
   */
  static async deleteUser(userId) {
    try {
      const { error } = await supabase
        .from('dashboard_users')
        .delete()
        .eq('id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: 'Failed to delete user' };
    }
  }

  /**
   * Log audit event
   */
  static async logAudit(userId, action, details, ipAddress, userAgent) {
    try {
      await supabase
        .from('dashboard_audit_log')
        .insert({
          user_id: userId,
          action,
          details,
          ip_address: ipAddress,
          user_agent: userAgent
        });
    } catch (error) {
      console.error('Audit log error:', error);
      // Don't throw - audit logging shouldn't break the app
    }
  }
}

module.exports = AuthService;