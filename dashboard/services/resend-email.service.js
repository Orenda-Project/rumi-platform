/**
 * Resend Email Service for Dashboard
 * Handles sending invitation and notification emails using Resend API
 */

const { Resend } = require('resend');

class ResendEmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.EMAIL_FROM || 'Rumi <noreply@your-domain.com>';
    this.dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:4000';
  }

  /**
   * Send invitation email to new user
   */
  async sendInvitation(toEmail, inviteToken, invitedByName, role) {
    try {
      // Use Observability Dashboard URL for admin user setup
      const setupUrl = `${this.dashboardUrl}/setup-password?token=${inviteToken}`;

      // Format role for display
      const roleDisplay = {
        'partner_admin': 'Partner Admin',
        'partner_viewer': 'Partner Viewer',
        'admin': 'Admin',
        'super_admin': 'Super Admin'
      };
      const displayRole = roleDisplay[role] || role;

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject: 'You\'re Invited to Rumi Observability Portal',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background: #f8f9fa; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
              .header { background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: white; padding: 40px 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
              .header p { margin: 10px 0 0; opacity: 0.9; font-size: 14px; }
              .content { padding: 30px; }
              .button { display: inline-block; padding: 14px 32px; background: #0d9488; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 500; }
              .button:hover { background: #0f766e; }
              .role-badge { display: inline-block; padding: 4px 12px; background: ${role.includes('admin') ? '#0d9488' : '#22c55e'}; color: white; border-radius: 6px; font-size: 12px; font-weight: 600; }
              .info-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 16px; margin: 20px 0; }
              .info-box h4 { margin: 0 0 10px; color: #0d9488; font-size: 14px; }
              .info-box ul { margin: 0; padding-left: 20px; color: #475569; font-size: 14px; }
              .info-box li { margin: 4px 0; }
              .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
              .link-fallback { color: #64748b; font-size: 13px; margin-top: 10px; }
              .link-fallback code { background: #f1f5f9; padding: 4px 8px; border-radius: 4px; word-break: break-all; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="card">
                <div class="header">
                  <h1>Welcome to Rumi</h1>
                  <p>Observability Portal</p>
                </div>
                <div class="content">
                  <p>Hello,</p>

                  <p>You've been invited by <strong>${invitedByName}</strong> to join the Rumi Observability Portal as a <span class="role-badge">${displayRole}</span>.</p>

                  <p>The Rumi Observability Portal provides insights and analytics for the Rumi WhatsApp assistant, including:</p>
                  <ul>
                    <li>Teacher engagement analytics</li>
                    <li>Coaching session reports</li>
                    <li>Lesson plan management</li>
                    <li>Reading assessment data</li>
                  </ul>

                  <div class="info-box">
                    <h4>Your Access Level: ${displayRole}</h4>
                    <ul>
                      ${role === 'partner_admin' ? `
                        <li>Access to assigned schools/districts analytics</li>
                        <li>View coaching sessions and lesson plans</li>
                        <li>Invite and manage partner viewers</li>
                        <li>Access to reports within your scope</li>
                      ` : role === 'partner_viewer' ? `
                        <li>View dashboard analytics and reports</li>
                        <li>Access to conversation history</li>
                        <li>Read-only access within your scope</li>
                      ` : role === 'admin' || role === 'super_admin' ? `
                        <li>Full access to all dashboard features</li>
                        <li>Ability to invite and manage other users</li>
                        <li>Access to system settings</li>
                      ` : `
                        <li>View dashboard analytics</li>
                        <li>Access to reports</li>
                      `}
                    </ul>
                  </div>

                  <p>To get started, click the button below to set up your account:</p>

                  <div style="text-align: center;">
                    <a href="${setupUrl}" class="button">Set Up Your Account</a>
                  </div>

                  <p class="link-fallback">
                    Or copy and paste this link into your browser:<br>
                    <code>${setupUrl}</code>
                  </p>

                  <div class="footer">
                    <p><strong>Note:</strong> This invitation will expire in 7 days. If you need a new invitation, please contact ${invitedByName}.</p>
                    <p>If you didn't expect this invitation, you can safely ignore this email.</p>
                    <p style="margin-top: 15px;">Rumi by Taleemabad</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Welcome to Rumi Observability Portal

          You've been invited by ${invitedByName} to join the Rumi Observability Portal as a ${displayRole}.

          To set up your account, visit: ${setupUrl}

          This invitation will expire in 7 days.

          If you didn't expect this invitation, you can safely ignore this email.

          Rumi by Taleemabad
        `
      });

      if (error) {
        console.error('Resend error:', error);
        return { success: false, error: error.message };
      }

      console.log('Invitation email sent via Resend:', data.id);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error('Send invitation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(toEmail, resetToken, username) {
    try {
      // Use admin dashboard URL for password resets (observability portal, not teacher portal)
      const resetUrl = `${this.dashboardUrl}/observability/reset-password?token=${resetToken}`;

      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject: 'Password Reset - Rumi Observability Portal',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background: #f8f9fa; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
              .header { background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%); color: white; padding: 40px 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
              .header p { margin: 10px 0 0; opacity: 0.9; font-size: 14px; }
              .content { padding: 30px; }
              .button { display: inline-block; padding: 14px 32px; background: #dc2626; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 500; }
              .button:hover { background: #b91c1c; }
              .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
              .link-fallback { color: #64748b; font-size: 13px; margin-top: 10px; }
              .link-fallback code { background: #f1f5f9; padding: 4px 8px; border-radius: 4px; word-break: break-all; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="card">
                <div class="header">
                  <h1>Password Reset</h1>
                  <p>Rumi Observability Portal</p>
                </div>
                <div class="content">
                  <p>Hello ${username},</p>

                  <p>We received a request to reset your password for the Rumi Observability Portal.</p>

                  <p>Click the button below to reset your password:</p>

                  <div style="text-align: center;">
                    <a href="${resetUrl}" class="button">Reset Password</a>
                  </div>

                  <p class="link-fallback">
                    Or copy and paste this link into your browser:<br>
                    <code>${resetUrl}</code>
                  </p>

                  <div class="footer">
                    <p><strong>Note:</strong> This link will expire in 1 hour for security reasons.</p>
                    <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
                    <p style="margin-top: 15px;">Rumi by Taleemabad</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Password Reset - Rumi Observability Portal

          Hello ${username},

          We received a request to reset your password for the Rumi Observability Portal.

          To reset your password, visit: ${resetUrl}

          This link will expire in 1 hour.

          If you didn't request a password reset, please ignore this email.

          Rumi by Taleemabad
        `
      });

      if (error) {
        console.error('Resend error:', error);
        return { success: false, error: error.message };
      }

      console.log('Password reset email sent via Resend:', data.id);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error('Send password reset error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test email configuration
   */
  async testConnection() {
    try {
      // Verify API key is configured
      if (!process.env.RESEND_API_KEY) {
        return { success: false, error: 'RESEND_API_KEY not configured' };
      }

      console.log('Resend API key configured');
      return { success: true };
    } catch (error) {
      console.error('Resend connection test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
let resendEmailServiceInstance = null;

function getResendEmailService() {
  if (!resendEmailServiceInstance) {
    resendEmailServiceInstance = new ResendEmailService();
  }
  return resendEmailServiceInstance;
}

module.exports = getResendEmailService;
