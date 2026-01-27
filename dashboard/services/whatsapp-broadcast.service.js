/**
 * WhatsApp Broadcast Service
 *
 * Handles:
 * - Dynamic template creation with Meta API
 * - Template approval polling
 * - Broadcast message sending
 * - Delivery status tracking
 */

const axios = require('axios');
const queries = require('../database/queries');

// Environment configuration
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WABA_ID = process.env.WABA_ID;
const API_VERSION = 'v21.0';

// Bot domain for URL validation (escaped for regex)
const BOT_DOMAIN = (process.env.BOT_DOMAIN || 'example.com').replace(/\./g, '\\.');

// Rate limiting
const MESSAGE_DELAY_MS = 50; // 20 messages per second
const TEMPLATE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_TEMPLATE_POLL_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Active polling sessions (stored in memory)
const activePollers = new Map();

/**
 * Validate broadcast message content
 * @returns {Object} { valid: boolean, error?: string, warnings: string[] }
 */
function validateBroadcastContent(message) {
  const warnings = [];

  // Check for empty message
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty', warnings: [] };
  }

  // Check length limit (WhatsApp template body limit)
  if (message.length > 4096) {
    return { valid: false, error: `Message exceeds 4096 character limit (${message.length} characters)`, warnings: [] };
  }

  // Warning checks
  const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
  if (capsRatio > 0.3) {
    warnings.push('Excessive capitalization may slow approval');
  }

  if (new RegExp(`https?:\\/\\/(?!${BOT_DOMAIN})`, 'i').test(message)) {
    warnings.push('External URLs may require longer review');
  }

  if (/act now|limited time|hurry|urgent|last chance/i.test(message)) {
    warnings.push('Urgency language may trigger rejection');
  }

  const emojiCount = (message.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 5) {
    warnings.push('Many emojis may slow approval');
  }

  return { valid: true, warnings };
}

/**
 * Get approval likelihood score
 * @returns {Object} { score: number, likelihood: string, warnings: string[] }
 */
function getApprovalLikelihood(message) {
  let score = 100;
  const warnings = [];

  const capsRatio = (message.match(/[A-Z]/g) || []).length / (message.length || 1);
  if (capsRatio > 0.3) {
    score -= 20;
    warnings.push('Excessive capitalization may slow approval');
  }

  if (new RegExp(`https?:\\/\\/(?!${BOT_DOMAIN})`, 'i').test(message)) {
    score -= 30;
    warnings.push('External URLs may require longer review');
  }

  if (/act now|limited time|hurry|urgent|last chance/i.test(message)) {
    score -= 25;
    warnings.push('Urgency language may trigger rejection');
  }

  const emojiCount = (message.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 5) {
    score -= 10;
    warnings.push('Many emojis may slow approval');
  }

  return {
    score: Math.max(0, score),
    likelihood: score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
    warnings
  };
}

/**
 * Calculate estimated cost for broadcast
 * @param {Array} users - Array of user objects with phone_number
 * @returns {Object} Cost estimation breakdown
 */
function calculateCost(users) {
  // WhatsApp marketing conversation rates (approximate USD)
  const PAKISTAN_RATE = 0.0127;
  const SRI_LANKA_RATE = 0.0203;

  const pakistanUsers = users.filter(u => u.phone_number.startsWith('92')).length;
  const sriLankaUsers = users.filter(u => u.phone_number.startsWith('94')).length;
  const otherUsers = users.length - pakistanUsers - sriLankaUsers;

  const baseEstimate = (pakistanUsers * PAKISTAN_RATE) + (sriLankaUsers * SRI_LANKA_RATE);

  return {
    min: (baseEstimate * 0.8).toFixed(2),
    max: (baseEstimate * 1.2).toFixed(2),
    currency: 'USD',
    breakdown: {
      pakistan: { count: pakistanUsers, cost: (pakistanUsers * PAKISTAN_RATE).toFixed(2) },
      sriLanka: { count: sriLankaUsers, cost: (sriLankaUsers * SRI_LANKA_RATE).toFixed(2) },
      other: { count: otherUsers, cost: '0.00' }
    }
  };
}

/**
 * Get estimated send time
 * @param {number} userCount - Number of users
 * @returns {string} Human-readable time estimate
 */
function getEstimatedTime(userCount) {
  const totalSeconds = Math.ceil((userCount * MESSAGE_DELAY_MS) / 1000);

  if (totalSeconds < 60) {
    return `~${totalSeconds} seconds`;
  } else if (totalSeconds < 3600) {
    const minutes = Math.ceil(totalSeconds / 60);
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    const hours = Math.ceil(totalSeconds / 3600);
    return `~${hours} hour${hours > 1 ? 's' : ''}`;
  }
}

/**
 * Mask phone number for display
 */
function maskPhoneNumber(phone) {
  if (!phone || phone.length < 7) return phone;
  return phone.substring(0, 4) + '****' + phone.substring(phone.length - 3);
}

/**
 * Create a broadcast template dynamically via Meta API
 *
 * @param {string} broadcastId - Unique broadcast identifier
 * @param {string} messageContent - The message text
 * @returns {Object} { templateId, templateName, status }
 */
async function createBroadcastTemplate(broadcastId, messageContent) {
  // Generate unique template name (Meta requires lowercase, underscores only)
  const templateName = `broadcast_${broadcastId.replace(/-/g, '_').substring(0, 20)}`;

  const templatePayload = {
    name: templateName,
    language: 'en',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text: messageContent
      }
    ]
  };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`,
      templatePayload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`[Broadcast] Template created: ${templateName}, ID: ${response.data.id}`);

    return {
      templateId: response.data.id,
      templateName: templateName,
      status: 'PENDING'
    };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`[Broadcast] Template creation failed:`, errorMessage);
    throw new Error(`Failed to create template: ${errorMessage}`);
  }
}

/**
 * Check template approval status via Meta API
 *
 * @param {string} templateId - Meta template ID
 * @returns {Object} { status, rejectedReason, qualityScore }
 */
async function checkTemplateStatus(templateId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${templateId}`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        },
        params: {
          fields: 'status,rejected_reason,quality_score'
        }
      }
    );

    return {
      status: response.data.status,
      rejectedReason: response.data.rejected_reason || null,
      qualityScore: response.data.quality_score || null
    };

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`[Broadcast] Template status check failed:`, errorMessage);
    throw new Error(`Failed to check template status: ${errorMessage}`);
  }
}

/**
 * Send a template message to a single user
 *
 * @param {string} phoneNumber - Recipient phone number (with country code)
 * @param {string} templateName - Approved template name
 * @returns {Object} WhatsApp API response
 */
async function sendTemplateMessage(phoneNumber, templateName) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new Error(errorMessage);
  }
}

/**
 * Send a direct text message (for users within 24hr service window)
 * No template needed - can send free-form text
 *
 * @param {string} phoneNumber - Recipient phone number (with country code)
 * @param {string} messageText - The message text to send
 * @returns {Object} WhatsApp API response
 */
async function sendDirectMessage(phoneNumber, messageText) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: messageText }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new Error(errorMessage);
  }
}

/**
 * Check if a user is within the 24-hour service window
 * @param {Date|string} lastMessageAt - User's last message timestamp
 * @returns {boolean} True if within 24hr window
 */
function isWithinServiceWindow(lastMessageAt) {
  if (!lastMessageAt) return false;
  const lastMsg = new Date(lastMessageAt);
  const now = new Date();
  const hoursDiff = (now - lastMsg) / (1000 * 60 * 60);
  return hoursDiff < 24;
}

/**
 * Start background template polling for a broadcast
 * When approved, automatically triggers broadcast execution
 *
 * @param {string} broadcastId - Broadcast ID
 * @param {string} templateId - Meta template ID
 */
function startTemplatePolling(broadcastId, templateId) {
  const startTime = Date.now();

  const poll = async () => {
    // Check if polling was cancelled
    if (!activePollers.has(broadcastId)) {
      console.log(`[Broadcast ${broadcastId}] Polling cancelled`);
      return;
    }

    // Check timeout
    if (Date.now() - startTime > MAX_TEMPLATE_POLL_DURATION_MS) {
      console.log(`[Broadcast ${broadcastId}] Template approval timed out`);
      await queries.updateBroadcastLog(broadcastId, {
        status: 'template_timeout',
        template_status: 'TIMEOUT',
        error_message: 'Template approval timed out after 24 hours'
      });
      activePollers.delete(broadcastId);
      return;
    }

    try {
      // Check if broadcast was cancelled
      const broadcast = await queries.getBroadcastById(broadcastId);
      if (broadcast?.status === 'cancelled') {
        console.log(`[Broadcast ${broadcastId}] Broadcast was cancelled`);
        activePollers.delete(broadcastId);
        return;
      }

      // Check template status
      const templateStatus = await checkTemplateStatus(templateId);
      console.log(`[Broadcast ${broadcastId}] Template status: ${templateStatus.status}`);

      // Update broadcast with template status
      await queries.updateBroadcastLog(broadcastId, {
        template_status: templateStatus.status,
        template_rejected_reason: templateStatus.rejectedReason
      });

      if (templateStatus.status === 'APPROVED') {
        console.log(`[Broadcast ${broadcastId}] Template approved! Starting broadcast...`);
        activePollers.delete(broadcastId);
        await executeBroadcast(broadcastId);
        return;
      }

      if (templateStatus.status === 'REJECTED') {
        console.log(`[Broadcast ${broadcastId}] Template rejected: ${templateStatus.rejectedReason}`);
        await queries.updateBroadcastLog(broadcastId, {
          status: 'template_rejected',
          error_message: templateStatus.rejectedReason
        });
        activePollers.delete(broadcastId);
        return;
      }

      // Still pending - continue polling
      setTimeout(poll, TEMPLATE_POLL_INTERVAL_MS);

    } catch (error) {
      console.error(`[Broadcast ${broadcastId}] Template poll error:`, error.message);
      // Continue polling despite errors
      setTimeout(poll, TEMPLATE_POLL_INTERVAL_MS);
    }
  };

  // Store poller reference
  activePollers.set(broadcastId, { startTime, templateId });

  // Start polling after initial delay
  setTimeout(poll, TEMPLATE_POLL_INTERVAL_MS);

  console.log(`[Broadcast ${broadcastId}] Started template polling for ${templateId}`);
}

/**
 * Cancel template polling for a broadcast
 */
function cancelTemplatePolling(broadcastId) {
  if (activePollers.has(broadcastId)) {
    activePollers.delete(broadcastId);
    console.log(`[Broadcast ${broadcastId}] Polling cancelled`);
    return true;
  }
  return false;
}

/**
 * Execute the broadcast after template approval
 *
 * @param {string} broadcastId - Broadcast ID
 */
async function executeBroadcast(broadcastId) {
  console.log(`[Broadcast ${broadcastId}] Starting execution...`);

  try {
    // Get broadcast details
    const broadcast = await queries.getBroadcastById(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Update status to sending
    await queries.updateBroadcastLog(broadcastId, {
      status: 'sending',
      started_at: new Date().toISOString()
    });

    // Get users based on filters
    const users = await queries.getUsersForBroadcast(broadcast.filters);
    console.log(`[Broadcast ${broadcastId}] Found ${users.length} users to message`);

    // CRITICAL SAFETY CHECK: Abort if user count doesn't match expected
    // This prevents the catastrophic bug where wrong users are fetched
    const expectedCount = broadcast.total_recipients;
    if (users.length !== expectedCount) {
      const errorMsg = `SAFETY ABORT: User count mismatch! Expected ${expectedCount}, got ${users.length}. Filters may be broken.`;
      console.error(`[Broadcast ${broadcastId}] ${errorMsg}`);
      await queries.updateBroadcastLog(broadcastId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMsg
      });
      return;
    }

    if (users.length === 0) {
      await queries.updateBroadcastLog(broadcastId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: 'No users matched the filters'
      });
      return;
    }

    // Pre-insert all message records as 'pending' (for crash recovery)
    const messageRecords = users.map(user => ({
      broadcast_id: broadcastId,
      user_id: user.id,
      phone_number: user.phone_number,
      status: 'pending'
    }));

    await queries.insertBroadcastMessages(messageRecords);
    console.log(`[Broadcast ${broadcastId}] Pre-inserted ${messageRecords.length} message records`);

    // Send messages
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        const response = await sendTemplateMessage(user.phone_number, broadcast.template_name);

        // Update message record
        await queries.updateBroadcastMessage(broadcastId, user.id, {
          status: 'sent',
          message_id: response.messages?.[0]?.id,
          sent_at: new Date().toISOString()
        });

        sentCount++;

      } catch (error) {
        await queries.updateBroadcastMessage(broadcastId, user.id, {
          status: 'failed',
          error_message: error.message
        });

        failedCount++;
        if (errors.length < 100) {
          errors.push({
            userId: user.id,
            phoneNumber: user.phone_number,
            error: error.message
          });
        }
      }

      // Update progress every 10 messages
      if ((sentCount + failedCount) % 10 === 0) {
        await queries.updateBroadcastLog(broadcastId, {
          sent_count: sentCount,
          failed_count: failedCount
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
    }

    // Final update
    await queries.updateBroadcastLog(broadcastId, {
      status: failedCount > 0 ? 'completed_with_errors' : 'completed',
      sent_count: sentCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
      errors: errors.length > 0 ? errors : null
    });

    console.log(`[Broadcast ${broadcastId}] Completed: ${sentCount} sent, ${failedCount} failed`);

  } catch (error) {
    console.error(`[Broadcast ${broadcastId}] Execution error:`, error.message);
    await queries.updateBroadcastLog(broadcastId, {
      status: 'failed',
      error_message: error.message
    });
  }
}

/**
 * Resume interrupted broadcasts (call on server startup)
 */
async function resumeInterruptedBroadcasts() {
  try {
    const interrupted = await queries.getInterruptedBroadcasts();

    for (const broadcast of interrupted) {
      console.log(`[Broadcast Recovery] Resuming ${broadcast.id}`);

      // Get pending messages
      const pending = await queries.getPendingBroadcastMessages(broadcast.id);

      if (pending.length > 0) {
        // Resume sending
        await resumeBroadcast(broadcast.id, broadcast.template_name, pending);
      } else {
        // All messages sent, mark complete
        await queries.updateBroadcastLog(broadcast.id, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });
      }
    }

    if (interrupted.length > 0) {
      console.log(`[Broadcast Recovery] Resumed ${interrupted.length} interrupted broadcasts`);
    }

  } catch (error) {
    console.error('[Broadcast Recovery] Error:', error.message);
  }
}

/**
 * Resume a broadcast with pending messages
 */
async function resumeBroadcast(broadcastId, templateName, pendingMessages) {
  console.log(`[Broadcast ${broadcastId}] Resuming with ${pendingMessages.length} pending messages`);

  let sentCount = 0;
  let failedCount = 0;

  for (const msg of pendingMessages) {
    try {
      const response = await sendTemplateMessage(msg.phone_number, templateName);

      await queries.updateBroadcastMessage(broadcastId, msg.user_id, {
        status: 'sent',
        message_id: response.messages?.[0]?.id,
        sent_at: new Date().toISOString()
      });

      sentCount++;

    } catch (error) {
      await queries.updateBroadcastMessage(broadcastId, msg.user_id, {
        status: 'failed',
        error_message: error.message
      });

      failedCount++;
    }

    await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
  }

  // Get current counts and update
  const broadcast = await queries.getBroadcastById(broadcastId);
  await queries.updateBroadcastLog(broadcastId, {
    status: 'completed',
    sent_count: (broadcast.sent_count || 0) + sentCount,
    failed_count: (broadcast.failed_count || 0) + failedCount,
    completed_at: new Date().toISOString()
  });

  console.log(`[Broadcast ${broadcastId}] Resume completed: ${sentCount} sent, ${failedCount} failed`);
}

module.exports = {
  // Validation
  validateBroadcastContent,
  getApprovalLikelihood,
  calculateCost,
  getEstimatedTime,
  maskPhoneNumber,

  // Template operations
  createBroadcastTemplate,
  checkTemplateStatus,
  startTemplatePolling,
  cancelTemplatePolling,

  // Message sending
  sendTemplateMessage,
  sendDirectMessage,
  executeBroadcast,

  // Service window check
  isWithinServiceWindow,

  // Recovery
  resumeInterruptedBroadcasts,
  resumeBroadcast
};
