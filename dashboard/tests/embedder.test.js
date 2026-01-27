/**
 * Test: Code Embedder Service
 *
 * TDD Tests for semantic code embedding using OpenAI text-embedding-3-small
 * Tests embedding generation, batch processing, caching, and error handling
 */

const embedder = require('../services/code-embedder.service');

// Mock OpenAI for testing
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [
          { embedding: new Array(1536).fill(0.1) }
        ],
        usage: { total_tokens: 50 }
      })
    }
  }));
});

describe('Code Embedder Service', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('embedCodeChunk', () => {
    test('should return 1536-dimensional vector for code chunk', async () => {
      const code = 'function hello() { return "world"; }';
      const result = await embedder.embedCodeChunk(code, { filePath: 'test.js' });

      expect(result).toBeDefined();
      expect(result.embedding).toBeDefined();
      expect(Array.isArray(result.embedding)).toBe(true);
      expect(result.embedding.length).toBe(1536);
    });

    test('should include metadata in result', async () => {
      const code = 'const x = 42;';
      const metadata = { filePath: 'math.js', startLine: 10 };
      const result = await embedder.embedCodeChunk(code, metadata);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.filePath).toBe('math.js');
      expect(result.metadata.startLine).toBe(10);
    });
  });

  describe('embedQuery', () => {
    test('should return vector for search query', async () => {
      const query = 'find authentication logic';
      const result = await embedder.embedQuery(query);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1536);
    });

    test('should handle natural language queries', async () => {
      const query = 'where is user validation performed?';
      const result = await embedder.embedQuery(query);

      expect(result).toBeDefined();
      expect(result.length).toBe(1536);
    });
  });

  describe('batchEmbed', () => {
    test('should handle multiple code chunks efficiently', async () => {
      const chunks = [
        { code: 'function a() {}', metadata: { filePath: 'a.js' } },
        { code: 'function b() {}', metadata: { filePath: 'b.js' } },
        { code: 'function c() {}', metadata: { filePath: 'c.js' } }
      ];

      const results = await embedder.batchEmbed(chunks);

      expect(results).toBeDefined();
      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.embedding.length).toBe(1536);
      });
    });

    test('should process empty array without error', async () => {
      const results = await embedder.batchEmbed([]);

      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle empty code gracefully', async () => {
      const result = await embedder.embedCodeChunk('', {});

      expect(result).toBeDefined();
      // Should return null embedding or throw - both valid
      expect(result.embedding === null || result.embedding.length === 1536).toBe(true);
    });
  });

  describe('caching', () => {
    test('should return cached embedding for identical code', async () => {
      const code = 'const cached = true;';
      const metadata = { filePath: 'cache.js' };

      // First call
      const result1 = await embedder.embedCodeChunk(code, metadata);

      // Second call - should use cache
      const result2 = await embedder.embedCodeChunk(code, metadata);

      // Results should be identical
      expect(result1.embedding).toEqual(result2.embedding);
    });
  });
});
