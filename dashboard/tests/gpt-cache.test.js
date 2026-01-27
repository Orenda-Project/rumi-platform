/**
 * GPT Response Caching Tests
 * Bead: plt-cch01
 *
 * Tests for Redis caching of GPT-4o-mini responses
 * to reduce redundant API calls and improve response time.
 */

const assert = require('assert');

// Mock Redis for testing without actual Redis connection
class MockRedis {
  constructor() {
    this.store = new Map();
    this.expiry = new Map();
  }

  async get(key) {
    // Check if expired
    const exp = this.expiry.get(key);
    if (exp && Date.now() > exp) {
      this.store.delete(key);
      this.expiry.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async setex(key, ttl, value) {
    this.store.set(key, value);
    this.expiry.set(key, Date.now() + (ttl * 1000));
    return 'OK';
  }

  async del(...keys) {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.has(key)) {
        this.store.delete(key);
        this.expiry.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async keys(pattern) {
    const prefix = pattern.replace('*', '');
    return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
  }

  clear() {
    this.store.clear();
    this.expiry.clear();
  }
}

// Test state
let mockRedis;
let gptCallCount = 0;
let lastGptArgs = null;

// Mock GPT call function
async function mockGptCall(content) {
  gptCallCount++;
  lastGptArgs = content;
  // Simulate GPT processing delay
  await new Promise(r => setTimeout(r, 50));
  return {
    sections: [{ title: 'Test Section', lines: [] }],
    summary: `Processed: ${content.substring(0, 20)}...`
  };
}

// Test results tracking
let passed = 0;
let failed = 0;

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('✅');
    passed++;
  } catch (error) {
    console.log('❌');
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n📦 GPT Response Caching Tests (plt-cch01)\n');
  console.log('='.repeat(50));

  // Initialize mock Redis
  mockRedis = new MockRedis();

  // Import the module under test (we'll mock the dependencies)
  const gptCache = require('../services/gpt-cache.service');

  // Set mock Redis client
  gptCache.setRedisClient(mockRedis);

  // Reset counters before each describe block
  const resetCounters = () => {
    gptCallCount = 0;
    lastGptArgs = null;
    mockRedis.clear();
  };

  console.log('\n1️⃣ Cache Key Generation\n');

  await runTest('should generate consistent cache keys for same content', async () => {
    const content = { sessionId: '123', transcript: 'Hello world' };
    const key1 = gptCache.generateCacheKey('transcript', content);
    const key2 = gptCache.generateCacheKey('transcript', content);

    assert.strictEqual(key1, key2, 'Same content should generate same key');
    assert.ok(key1.startsWith('gpt:transcript:'), 'Key should have correct prefix');
  });

  await runTest('should generate different keys for different content', async () => {
    const key1 = gptCache.generateCacheKey('transcript', { sessionId: '123', text: 'Hello' });
    const key2 = gptCache.generateCacheKey('transcript', { sessionId: '123', text: 'World' });

    assert.notStrictEqual(key1, key2, 'Different content should generate different keys');
  });

  await runTest('should generate different keys for different prefixes', async () => {
    const content = { query: 'test query' };
    const key1 = gptCache.generateCacheKey('transcript', content);
    const key2 = gptCache.generateCacheKey('ama', content);

    assert.notStrictEqual(key1, key2, 'Different prefixes should generate different keys');
    assert.ok(key1.startsWith('gpt:transcript:'), 'First key should have transcript prefix');
    assert.ok(key2.startsWith('gpt:ama:'), 'Second key should have ama prefix');
  });

  console.log('\n2️⃣ Cache Operations\n');

  await runTest('should cache and retrieve GPT response', async () => {
    resetCounters();

    const cacheKey = 'gpt:test:cache-retrieve';
    const testData = { sections: [], summary: 'Test summary' };

    // Cache the response
    await gptCache.cacheResponse(cacheKey, testData, 60);

    // Retrieve it
    const cached = await gptCache.getCachedResponse(cacheKey);

    assert.deepStrictEqual(cached, testData, 'Cached data should match original');
  });

  await runTest('should return null for non-existent cache key', async () => {
    resetCounters();

    const cached = await gptCache.getCachedResponse('gpt:test:nonexistent');

    assert.strictEqual(cached, null, 'Should return null for missing key');
  });

  await runTest('should handle cache expiry', async () => {
    resetCounters();

    const cacheKey = 'gpt:test:expiry';
    const testData = { summary: 'Expiry test' };

    // Cache with 1 second TTL
    await gptCache.cacheResponse(cacheKey, testData, 1);

    // Immediate retrieval should work
    const immediate = await gptCache.getCachedResponse(cacheKey);
    assert.deepStrictEqual(immediate, testData, 'Immediate retrieval should work');

    // Wait for expiry
    await new Promise(r => setTimeout(r, 1100));

    // After expiry should return null
    const expired = await gptCache.getCachedResponse(cacheKey);
    assert.strictEqual(expired, null, 'Expired data should return null');
  });

  console.log('\n3️⃣ withCache Wrapper Function\n');

  await runTest('should return cached data on cache hit', async () => {
    resetCounters();

    const promptContent = { sessionId: 'cache-hit-test', text: 'Test transcript' };

    // First call - should call GPT
    const result1 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('Test transcript'));

    assert.strictEqual(result1.fromCache, false, 'First call should be cache miss');
    assert.strictEqual(gptCallCount, 1, 'GPT should be called once');

    // Second call - should hit cache
    const result2 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('Test transcript'));

    assert.strictEqual(result2.fromCache, true, 'Second call should be cache hit');
    assert.strictEqual(gptCallCount, 1, 'GPT should NOT be called again');
    assert.deepStrictEqual(result2.data, result1.data, 'Cached data should match original');
  });

  await runTest('should track duration correctly', async () => {
    resetCounters();

    const promptContent = { sessionId: 'duration-test', text: 'Duration test' };

    // First call
    const result1 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('Duration test'));

    assert.ok(result1.durationMs >= 0, 'Duration should be tracked');
    assert.ok(result1.durationMs < 5000, 'Duration should be reasonable');

    // Second call (cached) should be faster
    const result2 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('Duration test'));

    assert.ok(result2.durationMs < result1.durationMs, 'Cached call should be faster');
  });

  await runTest('should include cache key in result', async () => {
    resetCounters();

    const promptContent = { sessionId: 'cachekey-test', text: 'Key test' };

    const result = await gptCache.withCache('transcript', promptContent, () => mockGptCall('Key test'));

    assert.ok(result.cacheKey, 'Result should include cache key');
    assert.ok(result.cacheKey.startsWith('gpt:transcript:'), 'Cache key should have correct prefix');
  });

  await runTest('should use custom TTL when provided', async () => {
    resetCounters();

    const promptContent = { sessionId: 'custom-ttl', text: 'TTL test' };

    // Call with 1 second TTL
    await gptCache.withCache('transcript', promptContent, () => mockGptCall('TTL test'), 1);

    // Immediate second call should hit cache
    const result2 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('TTL test'), 1);
    assert.strictEqual(result2.fromCache, true, 'Immediate call should hit cache');

    // Wait for expiry
    await new Promise(r => setTimeout(r, 1100));

    // After expiry should miss cache
    const result3 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('TTL test'), 1);
    assert.strictEqual(result3.fromCache, false, 'After TTL expiry should miss cache');
  });

  console.log('\n4️⃣ Cache Invalidation\n');

  await runTest('should invalidate cache by pattern', async () => {
    resetCounters();

    // Add multiple entries
    await gptCache.cacheResponse('gpt:transcript:abc123', { summary: 'Test 1' }, 60);
    await gptCache.cacheResponse('gpt:transcript:def456', { summary: 'Test 2' }, 60);
    await gptCache.cacheResponse('gpt:ama:xyz789', { summary: 'Test 3' }, 60);

    // Verify they exist
    const before1 = await gptCache.getCachedResponse('gpt:transcript:abc123');
    const before2 = await gptCache.getCachedResponse('gpt:ama:xyz789');
    assert.ok(before1, 'Transcript cache should exist before invalidation');
    assert.ok(before2, 'AMA cache should exist before invalidation');

    // Invalidate transcript caches
    await gptCache.invalidateCache('transcript');

    // Verify transcript caches are gone but AMA remains
    const after1 = await gptCache.getCachedResponse('gpt:transcript:abc123');
    const after2 = await gptCache.getCachedResponse('gpt:transcript:def456');
    const after3 = await gptCache.getCachedResponse('gpt:ama:xyz789');

    assert.strictEqual(after1, null, 'Transcript cache 1 should be invalidated');
    assert.strictEqual(after2, null, 'Transcript cache 2 should be invalidated');
    assert.ok(after3, 'AMA cache should remain');
  });

  console.log('\n5️⃣ Graceful Degradation\n');

  await runTest('should work without Redis (fallback mode)', async () => {
    resetCounters();

    // Clear Redis client
    gptCache.setRedisClient(null);

    const promptContent = { sessionId: 'no-redis', text: 'No Redis test' };

    // First call - should call GPT directly
    const result1 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('No Redis test'));

    assert.strictEqual(result1.fromCache, false, 'Should be cache miss without Redis');
    assert.strictEqual(gptCallCount, 1, 'GPT should be called');

    // Second call - should also call GPT (no caching)
    const result2 = await gptCache.withCache('transcript', promptContent, () => mockGptCall('No Redis test'));

    assert.strictEqual(result2.fromCache, false, 'Should be cache miss without Redis');
    assert.strictEqual(gptCallCount, 2, 'GPT should be called again without caching');

    // Restore Redis client for other tests
    gptCache.setRedisClient(mockRedis);
  });

  await runTest('should handle Redis errors gracefully', async () => {
    resetCounters();

    // Create a failing Redis mock
    const failingRedis = {
      async get() { throw new Error('Redis connection error'); },
      async setex() { throw new Error('Redis connection error'); },
      async del() { throw new Error('Redis connection error'); },
      async keys() { throw new Error('Redis connection error'); }
    };

    gptCache.setRedisClient(failingRedis);

    const promptContent = { sessionId: 'redis-error', text: 'Error test' };

    // Should still work, just without caching
    const result = await gptCache.withCache('transcript', promptContent, () => mockGptCall('Error test'));

    assert.ok(result.data, 'Should return GPT result despite Redis error');
    assert.strictEqual(result.fromCache, false, 'Should be cache miss on Redis error');

    // Restore normal Redis client
    gptCache.setRedisClient(mockRedis);
  });

  console.log('\n6️⃣ Different Cache Prefixes (Transcript vs AMA)\n');

  await runTest('should cache transcript and AMA separately', async () => {
    resetCounters();

    const sameContent = { query: 'Shared content' };

    // Cache transcript response
    const transcriptResult = await gptCache.withCache('transcript', sameContent, () => ({
      type: 'transcript',
      sections: []
    }));

    // Cache AMA response (same content, different prefix)
    const amaResult = await gptCache.withCache('ama', sameContent, () => ({
      type: 'ama',
      answer: 'Test answer'
    }));

    // Both should be cache misses (different prefixes)
    assert.strictEqual(transcriptResult.fromCache, false, 'Transcript should be cache miss');
    assert.strictEqual(amaResult.fromCache, false, 'AMA should be cache miss');

    // Verify they have different data
    assert.notStrictEqual(transcriptResult.data.type, amaResult.data.type, 'Different prefixes should store different data');

    // Retrieve each - should hit their respective caches
    const transcriptCached = await gptCache.withCache('transcript', sameContent, () => ({ type: 'NEW' }));
    const amaCached = await gptCache.withCache('ama', sameContent, () => ({ type: 'NEW' }));

    assert.strictEqual(transcriptCached.fromCache, true, 'Transcript should hit cache');
    assert.strictEqual(amaCached.fromCache, true, 'AMA should hit cache');
    assert.strictEqual(transcriptCached.data.type, 'transcript', 'Transcript data should be correct');
    assert.strictEqual(amaCached.data.type, 'ama', 'AMA data should be correct');
  });

  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
