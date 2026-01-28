/**
 * Railway Redis Service
 * Handles caching, rate limiting, deduplication, and distributed locks
 *
 * Use Cases:
 * 1. Rate Limiting - Prevent spam (30 messages/minute per user)
 * 2. Message Deduplication - Prevent duplicate webhook processing
 * 3. Session Caching - Cache active user sessions
 * 4. Distributed Locks - Prevent race conditions
 * 5. Temporary Data - Store temporary analysis results
 *
 * Performance at 1,000 teachers scale:
 * - 30,000 messages/day
 * - ~20-30 operations per message
 * - ~600,000-900,000 Redis operations/day
 * - Average latency: <5ms
 */

const Redis = require('ioredis');
const { logToFile } = require('../../utils/logger');
const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } = require('../../utils/constants');

class RailwayRedisService {
  constructor() {
    if (!process.env.REDIS_URL) {
      logToFile('⚠️  REDIS_URL not configured. Redis service disabled.', { level: 'warn' });
      this.redis = null;
      return;
    }

    try {
      this.redis = new Redis(process.env.REDIS_URL, {
        // Retry strategy: exponential backoff up to 2 seconds
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logToFile('Redis retrying connection', { attempt: times, delayMs: delay });
          return delay;
        },

        // Max retries before giving up
        maxRetriesPerRequest: 3,

        // Connection timeout
        connectTimeout: 10000,

        // Keep-alive to prevent connection drops
        keepAlive: 30000,

        // Fail fast if Redis is down (don't queue commands)
        enableOfflineQueue: false,

        // Connect immediately
        lazyConnect: false
      });

      // Connection event handlers
      this.redis.on('connect', () => {
        logToFile('✅ Connected to Railway Redis', {
          url: process.env.REDIS_URL.replace(/:[^:@]*@/, ':***@') // Hide password in logs
        });
      });

      this.redis.on('ready', () => {
        logToFile('✅ Railway Redis ready');
      });

      this.redis.on('error', (error) => {
        logToFile('❌ Railway Redis error', {
          error: error.message
        });
      });

      this.redis.on('close', () => {
        logToFile('⚠️  Railway Redis connection closed');
      });

      this.redis.on('reconnecting', () => {
        logToFile('🔄 Reconnecting to Railway Redis...');
      });

    } catch (error) {
      logToFile('❌ Failed to initialize Railway Redis', {
        error: error.message
      });
      this.redis = null;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable() {
    return this.redis !== null && this.redis.status === 'ready';
  }

  /**
   * Ping Redis to check connection
   */
  async ping() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logToFile('Redis ping failed', { error: error.message });
      return false;
    }
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Check if user/phone is within rate limit
   * Uses sliding window algorithm for accurate rate limiting
   *
   * @param {string} identifier - User ID or phone number
   * @param {number} limit - Maximum requests allowed (default: 30)
   * @param {number} windowSeconds - Time window in seconds (default: 60)
   * @returns {Promise<{allowed: boolean, count: number, remaining: number, resetAt: Date}>}
   */
  async checkRateLimit(identifier, limit = RATE_LIMIT_MAX, windowSeconds = RATE_LIMIT_WINDOW_SECONDS) {
    if (!this.isAvailable()) {
      // If Redis is down, allow the request (fail open)
      logToFile('⚠️  Redis unavailable, rate limit check bypassed', { identifier });
      return { allowed: true, count: 0, remaining: limit, resetAt: null };
    }

    try {
      const key = `rate:${identifier}`;
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);

      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Add current timestamp
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // Count entries in window
      pipeline.zcount(key, windowStart, now);

      // Set expiry (cleanup old keys)
      pipeline.expire(key, windowSeconds + 1);

      const results = await pipeline.exec();

      // Get count from pipeline results
      const count = results[2][1]; // Third command (zcount) result

      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = new Date(now + windowSeconds * 1000);

      return {
        allowed,
        count,
        remaining,
        resetAt
      };

    } catch (error) {
      logToFile('❌ Rate limit check failed', {
        identifier,
        error: error.message
      });
      // Fail open - allow the request if Redis fails
      return { allowed: true, count: 0, remaining: limit, resetAt: null };
    }
  }

  /**
   * Reset rate limit for a user (admin function)
   */
  async resetRateLimit(identifier) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const key = `rate:${identifier}`;
      await this.redis.del(key);
      logToFile('Rate limit reset', { identifier });
      return true;
    } catch (error) {
      logToFile('Failed to reset rate limit', {
        identifier,
        error: error.message
      });
      return false;
    }
  }

  // ============================================================================
  // MESSAGE DEDUPLICATION
  // ============================================================================

  /**
   * Check if message was already processed (prevents duplicate webhooks)
   *
   * @param {string} messageId - WhatsApp message ID
   * @param {number} ttlSeconds - How long to remember (default: 300 = 5 minutes)
   * @returns {Promise<boolean>} true if duplicate, false if new
   */
  async isDuplicateMessage(messageId, ttlSeconds = 300) {
    if (!this.isAvailable()) {
      // If Redis is down, assume not duplicate (risk: double processing)
      return false;
    }

    try {
      const key = `dedup:${messageId}`;

      // Check if key exists
      const exists = await this.redis.exists(key);

      if (exists) {
        logToFile('Duplicate message detected', { messageId });
        return true;
      }

      // Mark as processed
      await this.redis.setex(key, ttlSeconds, '1');
      return false;

    } catch (error) {
      logToFile('❌ Duplicate check failed', {
        messageId,
        error: error.message
      });
      // Fail safe - assume not duplicate
      return false;
    }
  }

  /**
   * Mark message as processed
   */
  async markMessageProcessed(messageId, ttlSeconds = 300) {
    if (!this.isAvailable()) {
      return;
    }

    try {
      const key = `dedup:${messageId}`;
      await this.redis.setex(key, ttlSeconds, '1');
    } catch (error) {
      logToFile('Failed to mark message as processed', {
        messageId,
        error: error.message
      });
    }
  }

  // ============================================================================
  // SESSION CACHING
  // ============================================================================

  /**
   * Cache user session data
   *
   * @param {string} sessionId - Session identifier
   * @param {object} data - Session data to cache
   * @param {number} ttlSeconds - Time to live (default: 1800 = 30 minutes)
   */
  async cacheSession(sessionId, data, ttlSeconds = 1800) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const key = `session:${sessionId}`;
      await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
      return true;
    } catch (error) {
      logToFile('Failed to cache session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get cached session data
   *
   * @param {string} sessionId - Session identifier
   * @returns {Promise<object|null>} Session data or null if not found
   */
  async getSession(sessionId) {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const key = `session:${sessionId}`;
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data);

    } catch (error) {
      logToFile('Failed to get session', {
        sessionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Delete cached session
   */
  async deleteSession(sessionId) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const key = `session:${sessionId}`;
      await this.redis.del(key);
      return true;
    } catch (error) {
      logToFile('Failed to delete session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  // ============================================================================
  // DISTRIBUTED LOCKS
  // ============================================================================

  /**
   * Acquire distributed lock (prevents race conditions)
   *
   * @param {string} resource - Resource to lock
   * @param {string} lockId - Unique lock identifier
   * @param {number} ttlSeconds - Lock timeout (default: 10 seconds)
   * @returns {Promise<boolean>} true if lock acquired, false otherwise
   */
  async acquireLock(resource, lockId, ttlSeconds = 10) {
    if (!this.isAvailable()) {
      // If Redis is down, fail to acquire lock (fail safe)
      return false;
    }

    try {
      const key = `lock:${resource}`;

      // SET NX EX: Set if Not eXists, with EXpiry
      const result = await this.redis.set(key, lockId, 'EX', ttlSeconds, 'NX');

      return result === 'OK';

    } catch (error) {
      logToFile('Failed to acquire lock', {
        resource,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Release distributed lock
   *
   * @param {string} resource - Resource to unlock
   * @param {string} lockId - Lock identifier (must match)
   * @returns {Promise<boolean>} true if lock released, false otherwise
   */
  async releaseLock(resource, lockId) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const key = `lock:${resource}`;

      // Use Lua script for atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, key, lockId);

      return result === 1;

    } catch (error) {
      logToFile('Failed to release lock', {
        resource,
        error: error.message
      });
      return false;
    }
  }

  // ============================================================================
  // GENERIC CACHE OPERATIONS
  // ============================================================================

  /**
   * Set a value with optional TTL
   */
  async set(key, value, ttlSeconds = null) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      return true;
    } catch (error) {
      logToFile('Failed to set cache', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get a value
   */
  async get(key) {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      // Try to parse JSON, fallback to string
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }

    } catch (error) {
      logToFile('Failed to get cache', {
        key,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Delete a key
   */
  async delete(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logToFile('Failed to delete cache', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logToFile('Failed to check existence', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get TTL of a key
   */
  async getTTL(key) {
    if (!this.isAvailable()) {
      return -1;
    }

    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logToFile('Failed to get TTL', {
        key,
        error: error.message
      });
      return -1;
    }
  }

  /**
   * Increment a key's value by 1
   * @param {string} key - The key to increment
   * @returns {Promise<number|null>} New value after increment, or null on failure
   */
  async incr(key) {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      return await this.redis.incr(key);
    } catch (error) {
      logToFile('Failed to increment key', {
        key,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Set expiration on a key
   * @param {string} key - The key to set expiration on
   * @param {number} seconds - TTL in seconds
   * @returns {Promise<boolean>} True if expiration was set
   */
  async expire(key, seconds) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis.expire(key, seconds);
      return true;
    } catch (error) {
      logToFile('Failed to set expiration', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Set a value with TTL (alias for set with ttl)
   * @param {string} key - The key
   * @param {number} seconds - TTL in seconds
   * @param {string} value - The value
   */
  async setex(key, seconds, value) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis.setex(key, seconds, value);
      return true;
    } catch (error) {
      logToFile('Failed to setex', {
        key,
        error: error.message
      });
      return false;
    }
  }

  // ============================================================================
  // MONITORING & ADMIN
  // ============================================================================

  /**
   * Get Redis info and stats
   */
  async getInfo() {
    if (!this.isAvailable()) {
      return {
        status: 'unavailable',
        message: 'Redis not configured or not connected'
      };
    }

    try {
      const info = await this.redis.info();
      const memoryInfo = await this.redis.info('memory');

      return {
        status: 'connected',
        redisVersion: info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown',
        uptime: info.match(/uptime_in_seconds:([^\r\n]+)/)?.[1] || 'unknown',
        connectedClients: info.match(/connected_clients:([^\r\n]+)/)?.[1] || 'unknown',
        usedMemory: memoryInfo.match(/used_memory_human:([^\r\n]+)/)?.[1] || 'unknown',
        maxMemory: memoryInfo.match(/maxmemory_human:([^\r\n]+)/)?.[1] || 'unlimited'
      };

    } catch (error) {
      logToFile('Failed to get Redis info', { error: error.message });
      return {
        status: 'error',
        message: error.message
      };
    }
  }

  /**
   * Flush all data (USE WITH CAUTION!)
   * Only works in non-production environments
   */
  async flushAll() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot flush Redis in production!');
    }

    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.redis.flushall();
      logToFile('⚠️  Redis flushed', { environment: process.env.NODE_ENV });
      return true;
    } catch (error) {
      logToFile('Failed to flush Redis', { error: error.message });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      logToFile('Railway Redis connection closed');
    }
  }
}

// Export singleton instance
module.exports = new RailwayRedisService();
