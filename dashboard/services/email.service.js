/**
 * Email Service for Dashboard
 * Handles sending invitation and notification emails
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Create transporter based on environment
    if (process.env.EMAIL_SERVICE === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD // App-specific password for Gmail
        }
      });
    } else {
      // Default SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    }

    this.fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rumi.ai';
    this.dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:4000';
  }

  /**
   * Send invitation email to new user
   */
  async sendInvitation(toEmail, inviteToken, invitedByName, role) {
    try {
      // Use Teacher Portal frontend URL for setup (not backend dashboard URL)
      const portalBaseUrl = process.env.PORTAL_URL || 'https://your-portal-domain.com';
      const setupUrl = `${portalBaseUrl}/portal/setup/${inviteToken}`;

      const mailOptions = {
        from: `Digital Coach Dashboard <${this.fromEmail}>`,
        to: toEmail,
        subject: 'Invitation to Digital Coach Dashboard',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .button:hover { background: #5a67d8; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
              .role-badge { display: inline-block; padding: 4px 12px; background: ${role === 'admin' ? '#dc2626' : '#059669'}; color: white; border-radius: 4px; font-size: 12px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to Digital Coach Dashboard</h1>
              </div>
              <div class="content">
                <p>Hello,</p>

                <p>You've been invited by <strong>${invitedByName}</strong> to join the Digital Coach Dashboard as a <span class="role-badge">${role.toUpperCase()}</span>.</p>

                <p>The Digital Coach Dashboard provides insights and analytics for the Digital Coach WhatsApp bot, including:</p>
                <ul>
                  <li>User conversation analytics</li>
                  <li>Coaching session reports</li>
                  <li>Lesson plan management</li>
                  <li>System performance metrics</li>
                </ul>

                <p><strong>Your access level (${role}):</strong></p>
                <ul>
                  ${role === 'admin' ? `
                    <li>Full access to all dashboard features</li>
                    <li>Ability to invite and manage other users</li>
                    <li>Access to system settings</li>
                  ` : `
                    <li>View all dashboard analytics and reports</li>
                    <li>Access to conversation history</li>
                    <li>Read-only access to all features</li>
                  `}
                </ul>

                <p>To get started, click the button below to set up your account:</p>

                <div style="text-align: center;">
                  <a href="${setupUrl}" class="button">Set Up Your Account</a>
                </div>

                <p style="color: #666; font-size: 14px;">
                  Or copy and paste this link into your browser:<br>
                  <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; word-break: break-all;">${setupUrl}</code>
                </p>

                <div class="footer">
                  <p><strong>Note:</strong> This invitation will expire in 7 days. If you need a new invitation, please contact ${invitedByName}.</p>
                  <p>If you didn't expect this invitation, you can safely ignore this email.</p>
                  <p>&copy; 2025 Digital Coach - Rumi AI</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Welcome to Digital Coach Dashboard

          You've been invited by ${invitedByName} to join the Digital Coach Dashboard as a ${role}.

          To set up your account, visit: ${setupUrl}

          This invitation will expire in 7 days.

          If you didn't expect this invitation, you can safely ignore this email.
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Invitation email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
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

      const mailOptions = {
        from: `Digital Coach Dashboard <${this.fromEmail}>`,
        to: toEmail,
        subject: 'Password Reset Request - Digital Coach Dashboard',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .button:hover { background: #b91c1c; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Password Reset Request</h1>
              </div>
              <div class="content">
                <p>Hello ${username},</p>

                <p>We received a request to reset your password for the Digital Coach Dashboard.</p>

                <p>Click the button below to reset your password:</p>

                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Reset Password</a>
                </div>

                <p style="color: #666; font-size: 14px;">
                  Or copy and paste this link into your browser:<br>
                  <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 3px; word-break: break-all;">${resetUrl}</code>
                </p>

                <div class="footer">
                  <p><strong>Note:</strong> This link will expire in 1 hour for security reasons.</p>
                  <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
                  <p>&copy; 2025 Digital Coach - Rumi AI</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Password Reset Request

          Hello ${username},

          We received a request to reset your password for the Digital Coach Dashboard.

          To reset your password, visit: ${resetUrl}

          This link will expire in 1 hour.

          If you didn't request a password reset, please ignore this email.
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
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
      await this.transporter.verify();
      console.log('Email server connection verified');
      return { success: true };
    } catch (error) {
      console.error('Email server connection failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
let emailServiceInstance = null;

function getEmailService() {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}

module.exports = getEmailService;