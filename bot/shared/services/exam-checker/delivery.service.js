/**
 * Delivery Service for Exam Checker
 * Sends graded results to users via WhatsApp
 *
 * Created: 2026-01-24
 * Bead: (annotation dependency)
 */

const whatsappService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');

class DeliveryService {
  /**
   * Send grading results to user
   * @param {object} session - Exam session with grading results
   * @param {string} userId - User ID for looking up phone
   */
  static async sendResults(session, userId) {
    logToFile('📤 Starting result delivery', {
      sessionId: session.id,
      userId
    });

    const gradingResults = session.grading_results || { successful: [], failed: [], summary: {} };
    const annotatedImages = session.annotated_images || [];

    // Get user's phone number
    const phoneNumber = await this._getUserPhone(userId);
    if (!phoneNumber) {
      throw new Error('User phone number not found');
    }

    // 1. Send summary message
    await this._sendSummaryMessage(phoneNumber, session, gradingResults);

    // 2. Send annotated images (up to 10)
    await this._sendAnnotatedImages(phoneNumber, annotatedImages);

    // 3. Send individual grade cards
    await this._sendGradeCards(phoneNumber, gradingResults.successful);

    // 4. Send portal link
    await this._sendPortalLink(phoneNumber, session);

    logToFile('✅ Result delivery complete', { sessionId: session.id });
  }

  /**
   * Send summary message with overall stats
   */
  static async _sendSummaryMessage(phoneNumber, session, gradingResults) {
    const { summary } = gradingResults;
    const studentCount = gradingResults.successful.length;
    const failedCount = gradingResults.failed.length;

    let message = `✅ *Exam Grading Complete!*\n\n`;
    message += `📊 *Summary:*\n`;
    message += `• Students graded: ${studentCount}\n`;

    if (failedCount > 0) {
      message += `• Failed to grade: ${failedCount}\n`;
    }

    if (summary) {
      message += `• Average score: ${summary.averagePercentage}%\n`;
      message += `• Highest: ${summary.highestScore}%\n`;
      message += `• Lowest: ${summary.lowestScore}%\n\n`;

      // Grade distribution
      if (summary.gradeDistribution) {
        message += `📈 *Grade Distribution:*\n`;
        for (const [grade, count] of Object.entries(summary.gradeDistribution)) {
          message += `${grade}: ${count} student${count !== 1 ? 's' : ''}\n`;
        }
      }
    }

    await whatsappService.sendMessage(phoneNumber, message);
  }

  /**
   * Send annotated exam images
   */
  static async _sendAnnotatedImages(phoneNumber, annotatedImages) {
    let imagesSent = 0;
    const MAX_IMAGES = 10;

    for (const studentImages of annotatedImages) {
      if (imagesSent >= MAX_IMAGES) {
        await whatsappService.sendMessage(
          phoneNumber,
          `📷 Showing first ${MAX_IMAGES} annotated exams. View all in the portal.`
        );
        break;
      }

      for (const imageUrl of studentImages.images || []) {
        if (imagesSent >= MAX_IMAGES) break;

        try {
          await whatsappService.sendImage(phoneNumber, imageUrl, `${studentImages.student}'s graded exam`);
          imagesSent++;

          // Rate limiting
          await this._delay(500);
        } catch (error) {
          logToFile('⚠️ Failed to send image', { error: error.message });
        }
      }
    }
  }

  /**
   * Send individual grade cards for each student
   */
  static async _sendGradeCards(phoneNumber, successfulResults) {
    // Only send individual cards if <= 5 students
    if (successfulResults.length > 5) {
      return; // Summary is enough for larger batches
    }

    for (const result of successfulResults) {
      const { student, marksAwarded, totalMarks, percentage, grade, questionResults } = result;

      let card = `📝 *${student.name}*`;
      if (student.rollNumber) {
        card += ` (${student.rollNumber})`;
      }
      card += `\n\n`;

      card += `🎯 Score: ${marksAwarded}/${totalMarks} (${percentage}%)\n`;
      card += `📊 Grade: ${grade}\n\n`;

      // Question breakdown (brief)
      if (questionResults && questionResults.length <= 10) {
        card += `*Question Breakdown:*\n`;
        for (const qr of questionResults) {
          const emoji = qr.marksAwarded === qr.maxMarks ? '✅' :
                       qr.marksAwarded > 0 ? '🟡' : '❌';
          card += `${emoji} ${qr.questionId}: ${qr.marksAwarded}/${qr.maxMarks}\n`;
        }
      }

      await whatsappService.sendMessage(phoneNumber, card);
      await this._delay(300);
    }
  }

  /**
   * Send portal link for detailed view. No-op when PORTAL_URL isn't
   * configured — the grades + annotated PDF have already been delivered;
   * this is just the optional follow-up.
   */
  static async _sendPortalLink(phoneNumber, session) {
    const portalBase = require('../../config/branding').portalUrl();
    if (!portalBase) {
      logToFile('⚠️ PORTAL_URL not configured — skipping portal-link follow-up', {
        sessionId: session.id,
      });
      return;
    }
    const examUrl = `${portalBase}/portal/exams/${session.id}`;

    const message = `🔗 *View & Edit Results*\n\n` +
      `See detailed grades, edit marks, and download reports:\n${examUrl}\n\n` +
      `💡 You can adjust any grades and add comments in the portal.`;

    await whatsappService.sendMessage(phoneNumber, message, {
      preview_url: true
    });
  }

  /**
   * Get user's phone number from database
   */
  static async _getUserPhone(userId) {
    const supabase = require('../../config/supabase');

    const { data, error } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', userId)
      .single();

    if (error || !data) {
      logToFile('⚠️ Failed to get user phone', { userId, error: error?.message });
      return null;
    }

    return data.phone_number;
  }

  /**
   * Delay helper for rate limiting
   */
  static _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send error notification to user
   */
  static async sendErrorNotification(phoneNumber, sessionId, errorMessage) {
    const message = `❌ *Exam Grading Error*\n\n` +
      `Something went wrong while grading your exams.\n\n` +
      `Error: ${errorMessage}\n\n` +
      `Please try again by sending "check exams" and uploading the images again.\n\n` +
      `If the problem persists, contact support.`;

    await whatsappService.sendMessage(phoneNumber, message);
  }

  /**
   * Send progress update during long grading sessions
   */
  static async sendProgressUpdate(phoneNumber, progress) {
    const { completed, total, percentage } = progress;

    // Only send updates at 25%, 50%, 75%
    if (![25, 50, 75].includes(percentage)) return;

    const message = `⏳ Grading progress: ${completed}/${total} exams (${percentage}%)...`;
    await whatsappService.sendMessage(phoneNumber, message);
  }
}

module.exports = DeliveryService;
