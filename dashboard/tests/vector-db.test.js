/**
 * Test: Vector Database Service
 *
 * TDD Tests for vector storage and semantic search
 * Tests upsert, search, filtering, and retrieval
 */

const vectorDB = require('../services/vector-db.service');

describe('Vector Database Service', () => {

  beforeEach(async () => {
    // Clear the database before each test
    await vectorDB.clear();
  });

  describe('upsert', () => {
    test('should store embeddings with metadata', async () => {
      const chunk = {
        id: 'test-chunk-1',
        repoKey: 'main-bot',
        filePath: 'src/handlers/message.js',
        startLine: 10,
        endLine: 25,
        functionName: 'handleMessage',
        code: 'async function handleMessage(msg) { ... }',
        embedding: new Array(1536).fill(0.1)
      };

      await vectorDB.upsert(chunk);
      const count = await vectorDB.count();

      expect(count).toBe(1);
    });

    test('should update existing chunk on duplicate id', async () => {
      const chunk1 = {
        id: 'dup-chunk',
        repoKey: 'main-bot',
        filePath: 'test.js',
        code: 'version 1',
        embedding: new Array(1536).fill(0.1)
      };

      const chunk2 = {
        id: 'dup-chunk',
        repoKey: 'main-bot',
        filePath: 'test.js',
        code: 'version 2',
        embedding: new Array(1536).fill(0.2)
      };

      await vectorDB.upsert(chunk1);
      await vectorDB.upsert(chunk2);

      const count = await vectorDB.count();
      expect(count).toBe(1);

      const results = await vectorDB.search({
        vector: new Array(1536).fill(0.2),
        limit: 10
      });
      expect(results[0].code).toBe('version 2');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Add test data
      await vectorDB.upsert({
        id: 'auth-1',
        repoKey: 'main-bot',
        filePath: 'src/auth.js',
        functionName: 'validateToken',
        code: 'function validateToken(token) { return jwt.verify(token); }',
        embedding: [0.8, 0.2, ...new Array(1534).fill(0)]
      });
      await vectorDB.upsert({
        id: 'message-1',
        repoKey: 'main-bot',
        filePath: 'src/message.js',
        functionName: 'sendMessage',
        code: 'function sendMessage(to, text) { return wa.sendText(to, text); }',
        embedding: [0.3, 0.9, ...new Array(1534).fill(0)]
      });
      await vectorDB.upsert({
        id: 'portal-1',
        repoKey: 'observability',
        filePath: 'routes/dashboard.js',
        functionName: 'getDashboard',
        code: 'function getDashboard(req, res) { res.render("dashboard"); }',
        embedding: [0.5, 0.5, ...new Array(1534).fill(0)]
      });
    });

    test('should return similar chunks by vector similarity', async () => {
      const queryVector = [0.85, 0.15, ...new Array(1534).fill(0)]; // Similar to auth-1

      const results = await vectorDB.search({
        vector: queryVector,
        limit: 3
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].functionName).toBe('validateToken'); // Most similar
    });

    test('should filter by repoKey', async () => {
      const queryVector = [0.5, 0.5, ...new Array(1534).fill(0)];

      const results = await vectorDB.search({
        vector: queryVector,
        repoKey: 'observability',
        limit: 10
      });

      expect(results.length).toBe(1);
      expect(results[0].repoKey).toBe('observability');
    });

    test('should respect limit parameter', async () => {
      const queryVector = [0.5, 0.5, ...new Array(1534).fill(0)];

      const results = await vectorDB.search({
        vector: queryVector,
        limit: 1
      });

      expect(results.length).toBe(1);
    });

    test('should include similarity score', async () => {
      const queryVector = [0.8, 0.2, ...new Array(1534).fill(0)];

      const results = await vectorDB.search({
        vector: queryVector,
        limit: 3
      });

      expect(results[0].score).toBeDefined();
      expect(typeof results[0].score).toBe('number');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });
  });

  describe('filtering', () => {
    beforeEach(async () => {
      await vectorDB.upsert({
        id: 'js-file',
        repoKey: 'main-bot',
        filePath: 'handler.js',
        code: 'function handler() {}',
        embedding: new Array(1536).fill(0.5)
      });
      await vectorDB.upsert({
        id: 'ts-file',
        repoKey: 'main-bot',
        filePath: 'service.ts',
        code: 'function service() {}',
        embedding: new Array(1536).fill(0.5)
      });
      await vectorDB.upsert({
        id: 'ejs-file',
        repoKey: 'observability',
        filePath: 'views/dashboard.ejs',
        code: '<div>Dashboard</div>',
        embedding: new Array(1536).fill(0.5)
      });
    });

    test('should filter by file extension', async () => {
      const results = await vectorDB.search({
        vector: new Array(1536).fill(0.5),
        fileType: 'js',
        limit: 10
      });

      expect(results.length).toBe(1);
      expect(results[0].filePath).toBe('handler.js');
    });
  });

  describe('edge cases', () => {
    test('should handle empty search results gracefully', async () => {
      // Empty database
      const results = await vectorDB.search({
        vector: new Array(1536).fill(0.5),
        limit: 10
      });

      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });

    test('should handle minScore threshold', async () => {
      // Create orthogonal vectors (perpendicular = 0 similarity)
      const storedEmbedding = new Array(1536).fill(0);
      storedEmbedding[0] = 1; // Point along first axis

      await vectorDB.upsert({
        id: 'low-match',
        repoKey: 'main-bot',
        filePath: 'test.js',
        code: 'test',
        embedding: storedEmbedding
      });

      // Query with perpendicular vector (points along second axis)
      const queryVector = new Array(1536).fill(0);
      queryVector[1] = 1; // Perpendicular to stored vector

      const results = await vectorDB.search({
        vector: queryVector,
        minScore: 0.5, // Any positive threshold
        limit: 10
      });

      // Perpendicular vectors have 0 similarity, should be filtered out
      expect(results.length).toBe(0);
    });
  });

  describe('batch operations', () => {
    test('should upsert multiple chunks', async () => {
      const chunks = [
        { id: 'batch-1', repoKey: 'main-bot', filePath: 'a.js', code: 'a', embedding: new Array(1536).fill(0.1) },
        { id: 'batch-2', repoKey: 'main-bot', filePath: 'b.js', code: 'b', embedding: new Array(1536).fill(0.2) },
        { id: 'batch-3', repoKey: 'main-bot', filePath: 'c.js', code: 'c', embedding: new Array(1536).fill(0.3) }
      ];

      await vectorDB.upsertBatch(chunks);
      const count = await vectorDB.count();

      expect(count).toBe(3);
    });
  });
});
