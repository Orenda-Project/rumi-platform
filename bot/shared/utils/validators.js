const { TEST_NUMBERS, TEST_ENTRY_IDS, MESSAGE_MAX_AGE } = require('./constants');
const { logToFile } = require('./logger');

/**
 * Check if the webhook entry is a test/sample webhook
 * @param {Object} entry - The webhook entry object
 * @returns {boolean}
 */
function isTestWebhook(entry) {
  if (!entry || !entry.id) {
    return true;
  }

  const isTest = TEST_ENTRY_IDS.includes(entry.id) || entry.id === '0' || entry.id === 0;

  if (isTest) {
    logToFile('⚠️ Test/sample webhook detected', { entryId: entry.id });
  }

  return isTest;
}

/**
 * Check if the phone number is a test number
 * @param {string} phoneNumber - The phone number to check
 * @returns {boolean}
 */
function isTestPhoneNumber(phoneNumber) {
  const isTest = TEST_NUMBERS.includes(phoneNumber);

  if (isTest) {
    logToFile('⚠️ Test phone number detected, skipping', { phoneNumber });
  }

  return isTest;
}

/**
 * Check if message is within the 24-hour response window
 * @param {number} messageTimestamp - Message timestamp in seconds
 * @param {string} from - Phone number (for logging)
 * @returns {boolean}
 */
function isWithin24Hours(messageTimestamp, from) {
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const messageAge = currentTime - messageTimestamp; // Age in seconds

  if (messageAge > MESSAGE_MAX_AGE) {
    logToFile('⚠️ Message too old (outside 24-hour window), skipping', {
      messageTimestamp,
      currentTime,
      ageHours: (messageAge / 3600).toFixed(2),
      from
    });
    return false;
  }

  return true;
}

/**
 * Check if message has already been processed
 * @param {string} messageId - The message ID
 * @param {Set} processedMessages - Set of processed message IDs
 * @returns {boolean}
 */
function isAlreadyProcessed(messageId, processedMessages) {
  if (processedMessages.has(messageId)) {
    logToFile('⚠️ Message already processed, skipping', { messageId });
    return true;
  }

  return false;
}

/**
 * Add message to processed set and clean up if needed
 * @param {string} messageId - The message ID to add
 * @param {Set} processedMessages - Set of processed message IDs
 * @param {number} limit - Max size before cleanup
 * @param {number} cleanupCount - Number to remove during cleanup
 */
function markAsProcessed(messageId, processedMessages, limit = 1000, cleanupCount = 100) {
  processedMessages.add(messageId);

  // Clean up old message IDs (keep only last N)
  if (processedMessages.size > limit) {
    const toDelete = Array.from(processedMessages).slice(0, cleanupCount);
    toDelete.forEach(id => processedMessages.delete(id));
  }
}

/**
 * Check if the webhook is for our configured phone number
 * Prevents cross-talk when multiple services share similar configurations
 * @param {string} webhookPhoneNumberId - Phone number ID from webhook metadata
 * @returns {boolean}
 */
function isOurPhoneNumber(webhookPhoneNumberId) {
  const configuredPhoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!webhookPhoneNumberId || !configuredPhoneNumberId) {
    logToFile('⚠️ Missing phone number ID for comparison', {
      webhookPhoneNumberId,
      configuredPhoneNumberId: configuredPhoneNumberId ? 'set' : 'missing'
    });
    return true; // Allow if we can't compare (backwards compatibility)
  }

  const isOurs = webhookPhoneNumberId === configuredPhoneNumberId;

  if (!isOurs) {
    logToFile('⚠️ Webhook for different phone number, skipping', {
      webhookPhoneNumberId,
      configuredPhoneNumberId,
      reason: 'Cross-WABA message - not for this service'
    });
  }

  return isOurs;
}

/**
 * Validate incoming message structure
 * @param {Object} req - Express request object
 * @returns {Object|null} Returns message object if valid, null otherwise
 */
function validateWebhookMessage(req) {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;
  const metadata = value?.metadata;

  if (!messages || !messages[0]) {
    return null;
  }

  return {
    entry,
    message: messages[0],
    from: messages[0].from,
    messageBody: messages[0].text?.body,
    messageType: messages[0].type,
    messageTimestamp: parseInt(messages[0].timestamp),
    phoneNumberId: metadata?.phone_number_id // Include for cross-WABA filtering
  };
}

/**
 * Validate and extract status updates from webhook
 * Used for tracking message delivery/read status (broadcasts, etc.)
 * @param {Object} req - Express request object
 * @returns {Object|null} Returns status data if valid, null otherwise
 */
function validateWebhookStatus(req) {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const statuses = value?.statuses;
  const metadata = value?.metadata;

  if (!statuses || !statuses.length) {
    return null;
  }

  return {
    entry,
    statuses,
    phoneNumberId: metadata?.phone_number_id
  };
}

module.exports = {
  isTestWebhook,
  isTestPhoneNumber,
  isWithin24Hours,
  isAlreadyProcessed,
  markAsProcessed,
  validateWebhookMessage,
  validateWebhookStatus,
  isOurPhoneNumber
};
