/**
 * Settings Routes for User Management and RBAC
 */

const express = require('express');
const router = express.Router();
const { requireSuperAdmin } = require('../middleware/rbac');
const AuthService = require('../services/auth.service');
const getEmailService = require('../services/resend-email.service');
const { body, validationResult } = require('express-validator');

// Settings main page (admin only)
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const result = await AuthService.getAllUsers();

    res.render('settings', {
      title: 'Settings',
      users: result.success ? result.users : [],
      error: result.success ? null : result.error,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Settings page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load settings page',
      error
    });
  }
});

// Change password form (all users)
router.get('/change-password', (req, res) => {
  res.render('change-password', {
    title: 'Change Password',
    error: null,
    success: null
  });
});

// Handle password change
router.post('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match')
], async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.render('change-password', {
      title: 'Change Password',
      error: errors.array()[0].msg,
      success: null
    });
  }

  try {
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(
      req.session.userId,
      currentPassword,
      newPassword
    );

    if (!result.success) {
      return res.render('change-password', {
        title: 'Change Password',
        error: result.error,
        success: null
      });
    }

    res.render('change-password', {
      title: 'Change Password',
      error: null,
      success: 'Password changed successfully!'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.render('change-password', {
      title: 'Change Password',
      error: 'Failed to change password',
      success: null
    });
  }
});

// Invite user form (admin only)
router.get('/invite', requireSuperAdmin, (req, res) => {
  res.render('invite-user', {
    title: 'Invite User',
    error: null,
    success: null
  });
});

// Handle user invitation
router.post('/invite', requireSuperAdmin, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['admin', 'viewer']).withMessage('Invalid role')
], async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.render('invite-user', {
      title: 'Invite User',
      error: errors.array()[0].msg,
      success: null
    });
  }

  try {
    const { email, role } = req.body;

    // Create invitation
    const inviteResult = await AuthService.createInvitation(
      email,
      role,
      req.session.userId
    );

    if (!inviteResult.success) {
      return res.render('invite-user', {
        title: 'Invite User',
        error: inviteResult.error,
        success: null
      });
    }

    // Send invitation email
    const emailService = getEmailService();
    const emailResult = await emailService.sendInvitation(
      email,
      inviteResult.inviteToken,
      req.session.username,
      role
    );

    if (!emailResult.success) {
      // Delete invitation if email fails
      await AuthService.deactivateUser(inviteResult.user.id);
      return res.render('invite-user', {
        title: 'Invite User',
        error: 'Failed to send invitation email. Please check email configuration.',
        success: null
      });
    }

    res.render('invite-user', {
      title: 'Invite User',
      error: null,
      success: `Invitation sent to ${email}`
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.render('invite-user', {
      title: 'Invite User',
      error: 'Failed to send invitation',
      success: null
    });
  }
});

// Update user role (admin only)
router.post('/update-role', requireSuperAdmin, async (req, res) => {
  try {
    const { userId, newRole } = req.body;

    if (!userId || !['admin', 'viewer'].includes(newRole)) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    // Prevent self-demotion
    if (userId === req.session.userId && newRole !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Cannot change your own admin role'
      });
    }

    const result = await AuthService.updateUserRole(userId, newRole);
    res.json(result);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

// Deactivate user (admin only)
router.post('/deactivate-user', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    // Prevent self-deactivation
    if (userId === req.session.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot deactivate your own account'
      });
    }

    const result = await AuthService.deactivateUser(userId);
    res.json(result);
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate user' });
  }
});

// Reactivate user (admin only)
router.post('/reactivate-user', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const result = await AuthService.reactivateUser(userId);
    res.json(result);
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ success: false, error: 'Failed to reactivate user' });
  }
});

// Delete user permanently (admin only)
router.post('/delete-user', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    // Prevent self-deletion
    if (userId === req.session.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const result = await AuthService.deleteUser(userId);
    res.json(result);
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

module.exports = router;