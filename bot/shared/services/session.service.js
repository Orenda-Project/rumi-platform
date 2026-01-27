const { PROCESSED_MESSAGES_LIMIT, PROCESSED_MESSAGES_CLEANUP } = require('../utils/constants');
const RedisService = require('./cache/railway-redis.service');
const { logToFile } = require('../utils/logger');

/**
 * Session Service
 * Manages processed messages and user tracking with Redis-backed persistence
 *
 * Key improvements:
 * - Redis-based duplicate detection (survives deployments)
 * - Fallback to in-memory if Redis unavailable
 * - TTL-based auto-cleanup (24 hours)
 */
class SessionService {
  constructor() {
    // Fallback in-memory stores (used when Redis unavailable)
    this.processedMessages = new Set();

    // Track users who have already received a heart reaction (for first message)
    this.usersWithFirstMessage = new Set();

    // Redis key prefix for message deduplication
    this.MESSAGE_PREFIX = 'whatsapp:message:';
    this.MESSAGE_TTL = 86400; // 24 hours in seconds
  }

  /**
   * Check if a message has been processed (Redis-backed with in-memory fallback)
   * @param {string} messageId - Message ID
   * @returns {Promise<boolean>}
   */
  async isProcessed(messageId) {
    try {
      // Try Redis first
      const redisKey = `${this.MESSAGE_PREFIX}${messageId}`;
      const exists = await RedisService.get(redisKey);

      if (exists !== null) {
        logToFile('Message already processed (Redis)', { messageId });
        return true;
      }

      // Fallback to in-memory
      if (this.processedMessages.has(messageId)) {
        logToFile('Message already processed (in-memory fallback)', { messageId });
        return true;
      }

      return false;
    } catch (error) {
      logToFile('⚠️  Error checking Redis for duplicate, using in-memory fallback', {
        error: error.message,
        messageId
      });

      // Fallback to in-memory on Redis error
      return this.processedMessages.has(messageId);
    }
  }

  /**
   * Mark a message as processed (Redis-backed with in-memory fallback)
   * @param {string} messageId - Message ID
   * @returns {Promise<void>}
   */
  async markAsProcessed(messageId) {
    try {
      // Store in Redis with TTL
      const redisKey = `${this.MESSAGE_PREFIX}${messageId}`;
      await RedisService.set(redisKey, Date.now().toString(), this.MESSAGE_TTL);

      logToFile('Message marked as processed (Redis)', { messageId, ttl: this.MESSAGE_TTL });
    } catch (error) {
      logToFile('⚠️  Error storing in Redis, using in-memory fallback', {
        error: error.message,
        messageId
      });
    }

    // Always store in-memory as fallback
    this.processedMessages.add(messageId);

    // Clean up old message IDs from in-memory store (keep only last N)
    if (this.processedMessages.size > PROCESSED_MESSAGES_LIMIT) {
      const toDelete = Array.from(this.processedMessages).slice(0, PROCESSED_MESSAGES_CLEANUP);
      toDelete.forEach(id => this.processedMessages.delete(id));
    }
  }

  /**
   * Check if user has received first message reaction
   * @param {string} userId - User identifier
   * @returns {boolean}
   */
  isFirstMessage(userId) {
    return !this.usersWithFirstMessage.has(userId);
  }

  /**
   * Mark user as having received first message
   * @param {string} userId - User identifier
   */
  markFirstMessageReceived(userId) {
    this.usersWithFirstMessage.add(userId);
  }

  /**
   * Get appropriate reaction emoji based on whether it's user's first message
   * @param {string} userId - User identifier
   * @returns {string} Emoji ('❤️' for first message, '👍' for subsequent)
   */
  getReactionEmoji(userId) {
    const isFirst = this.isFirstMessage(userId);

    if (isFirst) {
      this.markFirstMessageReceived(userId);
      return '❤️';
    }

    return '👍';
  }

  /**
   * Clear all processed messages (useful for testing)
   */
  clearProcessedMessages() {
    this.processedMessages.clear();
  }

  /**
   * Clear all first message tracking (useful for testing)
   */
  clearFirstMessageTracking() {
    this.usersWithFirstMessage.clear();
  }

  /**
   * Get statistics about current state
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      processedMessagesCount: this.processedMessages.size,
      usersWithFirstMessageCount: this.usersWithFirstMessage.size
    };
  }
}

// Export singleton instance
module.exports = new SessionService();
