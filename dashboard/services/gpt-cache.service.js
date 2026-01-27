/**
 * GPT Response Cache Service
 * Bead: plt-cch01
 *
 * Provides Redis caching for GPT-4o-mini responses to reduce
 * redundant API calls and improve response times.
 *
 * Features:
 * - SHA256 hash-based cache keys for large prompts
 * - Configurable TTL (default: 1 hour for transcripts, 30 min for AMA)
 * - Graceful degradation when Redis unavailable
 * - withCache() wrapper for easy integration
 */

const crypto = require('crypto');

// Redis client - set externally via setRedisClient()
let redisClient = null;

// Default TTL: 1 hour (3600 seconds)
const DEFAULT_TTL = parseInt(process.env.GPT_CACHE_TTL || '3600', 10);

/**
 * Set the Redis client for caching operations
 * Called from index.js after Redis connection is established
 *
 * @param {Object} client - Redis client (node-redis or ioredis compatible)
 */
function setRedisClient(client) {
  redisClient = client;
  if (client) {
    console.log('[GPT Cache] Redis client configured');
  } else {
    console.log('[GPT Cache] Redis client cleared - caching disabled');
  }
}

/**
 * Generate a cache key from prompt/content
 * Uses SHA256 hash to handle large prompts and ensure consistent keys
 *
 * @param {string} prefix - Cache key prefix (e.g., 'transcript', 'ama')
 * @param {Object|string} content - The content to hash for the cache key
 * @returns {string} Cache key in format: gpt:{prefix}:{hash16}
 */
function generateCacheKey(prefix, content) {
  const stringContent = typeof content === 'string'
    ? content
    : JSON.stringify(content);

  const hash = crypto.createHash('sha256')
    .update(stringContent)
    .digest('hex')
    .substring(0, 16); // First 16 chars for readability

  return `gpt:${prefix}:${hash}`;
}

/**
 * Get cached GPT response
 *
 * @param {string} cacheKey - The cache key to look up
 * @returns {Promise<Object|null>} Cached response or null if not found/expired
 */
async function getCachedResponse(cacheKey) {
  if (!redisClient) {
    return null;
  }

  try {
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      console.log(`[GPT Cache] HIT: ${cacheKey}`);
      return JSON.parse(cached);
    }

    console.log(`[GPT Cache] MISS: ${cacheKey}`);
    return null;

  } catch (error) {
    console.error(`[GPT Cache] Read error for ${cacheKey}:`, error.message);
    return null;
  }
}

/**
 * Cache GPT response
 *
 * @param {string} cacheKey - The cache key
 * @param {Object} response - The GPT response to cache
 * @param {number} ttl - TTL in seconds (default: 1 hour)
 */
async function cacheResponse(cacheKey, response, ttl = DEFAULT_TTL) {
  if (!redisClient) {
    return;
  }

  try {
    const serialized = JSON.stringify(response);
    await redisClient.setex(cacheKey, ttl, serialized);

    console.log(`[GPT Cache] SET: ${cacheKey} (TTL: ${ttl}s, size: ${serialized.length} bytes)`);

  } catch (error) {
    console.error(`[GPT Cache] Write error for ${cacheKey}:`, error.message);
    // Don't throw - caching is best-effort
  }
}

/**
 * Wrapper for GPT calls with caching
 *
 * This is the main integration point. Wrap your GPT call with this function
 * to automatically cache and retrieve responses.
 *
 * @param {string} prefix - Cache key prefix (e.g., 'transcript', 'ama')
 * @param {Object} promptContent - The prompt content (used for cache key generation)
 * @param {Function} gptCallFn - Async function that calls GPT (only called on cache miss)
 * @param {number} ttl - Optional TTL override in seconds
 * @returns {Promise<Object>} Result object with { data, fromCache, cacheKey, durationMs }
 *
 * @example
 * const { data, fromCache } = await withCache(
 *   'transcript',
 *   { sessionId, contentHash: transcript.substring(0, 100) },
 *   async () => {
 *     const response = await openai.chat.completions.create({...});
 *     return JSON.parse(response.choices[0].message.content);
 *   },
 *   3600 // 1 hour TTL
 * );
 */
async function withCache(prefix, promptContent, gptCallFn, ttl = DEFAULT_TTL) {
  const cacheKey = generateCacheKey(prefix, promptContent);
  const startTime = Date.now();

  // Try to get from cache
  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    return {
      data: cached,
      fromCache: true,
      cacheKey,
      durationMs: Date.now() - startTime
    };
  }

  // Call GPT (cache miss)
  const result = await gptCallFn();

  // Cache the result (best-effort, won't throw)
  await cacheResponse(cacheKey, result, ttl);

  return {
    data: result,
    fromCache: false,
    cacheKey,
    durationMs: Date.now() - startTime
  };
}

/**
 * Invalidate cache for a specific pattern
 * Useful when underlying data changes and cached responses are stale
 *
 * @param {string} pattern - Pattern to match (e.g., 'transcript' to invalidate all transcript caches)
 */
async function invalidateCache(pattern) {
  if (!redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(`gpt:${pattern}:*`);

    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`[GPT Cache] Invalidated ${keys.length} keys for pattern: ${pattern}`);
    }

  } catch (error) {
    console.error(`[GPT Cache] Invalidation error for ${pattern}:`, error.message);
  }
}

/**
 * Get cache statistics
 *
 * @returns {Promise<Object>} Cache statistics
 */
async function getStats() {
  if (!redisClient) {
    return {
      enabled: false,
      reason: 'Redis client not configured'
    };
  }

  try {
    const transcriptKeys = await redisClient.keys('gpt:transcript:*');
    const amaKeys = await redisClient.keys('gpt:ama:*');

    return {
      enabled: true,
      transcriptCacheCount: transcriptKeys.length,
      amaCacheCount: amaKeys.length,
      totalCacheCount: transcriptKeys.length + amaKeys.length
    };

  } catch (error) {
    return {
      enabled: false,
      reason: error.message
    };
  }
}

module.exports = {
  setRedisClient,
  generateCacheKey,
  getCachedResponse,
  cacheResponse,
  withCache,
  invalidateCache,
  getStats
};
