/**
 * Redis Cache Service
 *
 * Provides caching layer for GitHub API calls
 * 5 minute TTL, circuit breaker for Redis failures
 */

const Redis = require('ioredis');
const githubAPI = require('./github-api.service');

// Cache TTL: 5 minutes
const CACHE_TTL = 300;

// Redis client (will be null if Redis is unavailable)
let redis = null;
let redisConnected = false;

// Circuit breaker state
let circuitBreakerOpen = false;
let circuitBreakerOpenUntil = null;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

/**
 * Initialize Redis connection
 */
function initRedis() {
  if (redis) return redis;

  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn('[Redis Cache] REDIS_URL not configured, caching disabled');
      return null;
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('[Redis Cache] Max retries exceeded, giving up');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      reconnectOnError: (err) => {
        console.error('[Redis Cache] Connection error:', err.message);
        return true;
      }
    });

    redis.on('connect', () => {
      console.log('[Redis Cache] Connected to Redis');
      redisConnected = true;
      circuitBreakerOpen = false;
    });

    redis.on('error', (err) => {
      console.error('[Redis Cache] Redis error:', err.message);
      redisConnected = false;
      openCircuitBreaker();
    });

    redis.on('close', () => {
      console.warn('[Redis Cache] Redis connection closed');
      redisConnected = false;
    });

    return redis;
  } catch (error) {
    console.error('[Redis Cache] Failed to initialize Redis:', error.message);
    return null;
  }
}

/**
 * Open circuit breaker (disable Redis for 1 minute)
 */
function openCircuitBreaker() {
  circuitBreakerOpen = true;
  circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
  console.warn('[Redis Cache] Circuit breaker opened, disabling cache for 1 minute');
}

/**
 * Check if circuit breaker should be closed
 */
function shouldUseCache() {
  if (!redis || !redisConnected) {
    return false;
  }

  if (circuitBreakerOpen) {
    if (Date.now() > circuitBreakerOpenUntil) {
      console.log('[Redis Cache] Circuit breaker timeout expired, re-enabling cache');
      circuitBreakerOpen = false;
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Generate cache key
 */
function getCacheKey(repoKey, filePath, branch) {
  return `gh:${repoKey}:${branch}:${filePath}`;
}

/**
 * Get file content with caching
 *
 * @param {string} repoKey - Repository key
 * @param {string} filePath - Path to file
 * @param {string} branch - Branch name
 * @returns {Promise<Object>} File content
 */
async function getFileContent(repoKey, filePath, branch) {
  const cacheKey = getCacheKey(repoKey, filePath, branch);

  // Initialize Redis if needed
  if (!redis) {
    initRedis();
  }

  // Try cache first if available
  if (shouldUseCache()) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Redis Cache] Cache HIT: ${cacheKey}`);
        return JSON.parse(cached);
      }
      console.log(`[Redis Cache] Cache MISS: ${cacheKey}`);
    } catch (error) {
      console.error('[Redis Cache] Cache read error:', error.message);
      openCircuitBreaker();
    }
  }

  // Fetch from GitHub
  const content = await githubAPI.getFileContent(repoKey, filePath, branch);

  // Try to cache for next time
  if (shouldUseCache()) {
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(content));
      console.log(`[Redis Cache] Cached: ${cacheKey} (TTL: ${CACHE_TTL}s)`);
    } catch (error) {
      console.error('[Redis Cache] Cache write error:', error.message);
      openCircuitBreaker();
    }
  }

  return content;
}

/**
 * Invalidate cache for specific file
 *
 * @param {string} repoKey - Repository key
 * @param {string} filePath - Path to file
 * @param {string} branch - Branch name
 */
async function invalidate(repoKey, filePath, branch) {
  const cacheKey = getCacheKey(repoKey, filePath, branch);

  if (!redis) {
    initRedis();
  }

  if (shouldUseCache()) {
    try {
      await redis.del(cacheKey);
      console.log(`[Redis Cache] Invalidated: ${cacheKey}`);
    } catch (error) {
      console.error('[Redis Cache] Invalidation error:', error.message);
    }
  }
}

/**
 * Invalidate entire repo cache (for webhook updates)
 *
 * @param {string} repoKey - Repository key
 * @param {string} branch - Branch name
 */
async function invalidateRepo(repoKey, branch) {
  if (!redis) {
    initRedis();
  }

  if (shouldUseCache()) {
    try {
      const pattern = `gh:${repoKey}:${branch}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Redis Cache] Invalidated ${keys.length} keys for ${repoKey}:${branch}`);
      }
    } catch (error) {
      console.error('[Redis Cache] Repo invalidation error:', error.message);
    }
  }
}

/**
 * Get cache statistics
 */
async function getStats() {
  if (!redis) {
    initRedis();
  }

  if (!shouldUseCache()) {
    return {
      connected: false,
      circuitBreakerOpen,
      keys: 0
    };
  }

  try {
    const keys = await redis.keys('gh:*');
    return {
      connected: redisConnected,
      circuitBreakerOpen,
      keys: keys.length
    };
  } catch (error) {
    return {
      connected: false,
      circuitBreakerOpen,
      error: error.message
    };
  }
}

module.exports = {
  getFileContent,
  invalidate,
  invalidateRepo,
  getCacheKey,
  getStats
};
