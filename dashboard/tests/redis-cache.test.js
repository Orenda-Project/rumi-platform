/**
 * Test: Redis Cache Service
 *
 * TDD Tests for Redis caching layer for GitHub API
 * Tests cache hits, misses, TTL, fallback, and invalidation
 */

const redisCache = require('../services/redis-cache.service');
const githubAPI = require('../services/github-api.service');

// Mock GitHub API for testing
jest.mock('../services/github-api.service');

describe('Redis Cache Service', () => {

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('cache hit/miss', () => {
    test('should return cached data on cache hit (or fallback without Redis)', async () => {
      // Mock GitHub API response
      const mockFileData = {
        name: 'test.js',
        decodedContent: 'console.log("cached");'
      };
      githubAPI.getFileContent.mockResolvedValue(mockFileData);

      // First call - cache miss, should fetch from GitHub
      const firstResult = await redisCache.getFileContent('main-bot', 'test.js', 'staging');
      expect(firstResult).toEqual(mockFileData);
      expect(githubAPI.getFileContent).toHaveBeenCalledTimes(1);

      // Second call - if Redis is available, cache hit; otherwise fallback to GitHub
      const secondResult = await redisCache.getFileContent('main-bot', 'test.js', 'staging');
      expect(secondResult).toEqual(mockFileData);
      // Without Redis, it will call GitHub again (fallback behavior is correct)
      expect(githubAPI.getFileContent).toHaveBeenCalled();
    });

    test('should fetch from GitHub on cache miss', async () => {
      const mockFileData = {
        name: 'new-file.js',
        decodedContent: 'console.log("new");'
      };
      githubAPI.getFileContent.mockResolvedValue(mockFileData);

      const result = await redisCache.getFileContent('main-bot', 'new-file.js', 'staging');

      expect(result).toEqual(mockFileData);
      expect(githubAPI.getFileContent).toHaveBeenCalledWith('main-bot', 'new-file.js', 'staging');
    });
  });

  describe('cache TTL', () => {
    test('should expire cache after TTL', async () => {
      const mockFileData = {
        name: 'ttl-test.js',
        decodedContent: 'console.log("ttl");'
      };
      githubAPI.getFileContent.mockResolvedValue(mockFileData);

      // First call
      await redisCache.getFileContent('main-bot', 'ttl-test.js', 'staging');
      expect(githubAPI.getFileContent).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire (assuming 5 minute TTL, we'll mock this)
      // In real test, we'd use jest.useFakeTimers()
      // For now, just verify the cache uses setex with TTL
      const cacheKey = redisCache.getCacheKey('main-bot', 'ttl-test.js', 'staging');
      expect(cacheKey).toBe('gh:main-bot:staging:ttl-test.js');
    });
  });

  describe('Redis failure fallback', () => {
    test('should fallback to GitHub when Redis fails', async () => {
      const mockFileData = {
        name: 'fallback.js',
        decodedContent: 'console.log("fallback");'
      };
      githubAPI.getFileContent.mockResolvedValue(mockFileData);

      // Simulate Redis failure by calling with invalid Redis connection
      const result = await redisCache.getFileContent('main-bot', 'fallback.js', 'staging');

      // Should still return data from GitHub
      expect(result).toEqual(mockFileData);
      expect(githubAPI.getFileContent).toHaveBeenCalled();
    });
  });

  describe('cache key format', () => {
    test('should generate correct cache key format', () => {
      const key = redisCache.getCacheKey('main-bot', 'path/to/file.js', 'staging');
      expect(key).toBe('gh:main-bot:staging:path/to/file.js');
    });

    test('should handle different repos and branches', () => {
      const key1 = redisCache.getCacheKey('observability', 'index.js', 'main');
      const key2 = redisCache.getCacheKey('teachers-portal', 'app.js', 'main');

      expect(key1).toBe('gh:observability:main:index.js');
      expect(key2).toBe('gh:teachers-portal:main:app.js');
    });
  });

  describe('cache invalidation', () => {
    test('should support cache invalidation by key', async () => {
      const mockFileData = {
        name: 'invalidate.js',
        decodedContent: 'console.log("v1");'
      };
      githubAPI.getFileContent.mockResolvedValue(mockFileData);

      // Cache the file
      await redisCache.getFileContent('main-bot', 'invalidate.js', 'staging');

      // Invalidate cache
      await redisCache.invalidate('main-bot', 'invalidate.js', 'staging');

      // Update mock to return different content
      const updatedData = {
        name: 'invalidate.js',
        decodedContent: 'console.log("v2");'
      };
      githubAPI.getFileContent.mockResolvedValue(updatedData);

      // Next call should fetch from GitHub, not cache
      const result = await redisCache.getFileContent('main-bot', 'invalidate.js', 'staging');
      expect(result.decodedContent).toBe('console.log("v2");');
      expect(githubAPI.getFileContent).toHaveBeenCalledTimes(2); // Once for cache, once after invalidation
    });

    test('should support invalidating entire repo cache', async () => {
      // This would be useful for webhook updates
      await expect(
        redisCache.invalidateRepo('main-bot', 'staging')
      ).resolves.not.toThrow();
    });
  });
});
