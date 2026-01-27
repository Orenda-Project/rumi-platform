/**
 * Code Embedder Service
 *
 * Generates semantic embeddings for code chunks using OpenAI text-embedding-3-small
 * Used for vector search in The Forge AI
 *
 * @author Claude Opus 4.5
 * @date January 2026
 */

const OpenAI = require('openai');
const crypto = require('crypto');

// Initialize OpenAI client
let openai = null;
function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[Embedder] OPENAI_API_KEY not configured, embeddings disabled');
      return null;
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

// In-memory cache for embeddings (keyed by content hash)
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 1000;

/**
 * Generate a hash for content to use as cache key
 */
function hashContent(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Clean up cache if it exceeds max size
 */
function cleanupCache() {
  if (embeddingCache.size > MAX_CACHE_SIZE) {
    // Remove oldest 20% of entries
    const keysToRemove = Array.from(embeddingCache.keys()).slice(0, MAX_CACHE_SIZE * 0.2);
    keysToRemove.forEach(key => embeddingCache.delete(key));
  }
}

/**
 * Generate embedding for a single code chunk
 *
 * @param {string} code - Code content to embed
 * @param {Object} metadata - Metadata to include in result
 * @returns {Promise<Object>} Embedding result with vector and metadata
 */
async function embedCodeChunk(code, metadata = {}) {
  const client = getOpenAIClient();

  // Handle empty or whitespace-only code
  if (!code || code.trim().length === 0) {
    return {
      embedding: null,
      metadata,
      cached: false,
      error: 'Empty code chunk'
    };
  }

  // Check cache first
  const cacheKey = hashContent(code);
  if (embeddingCache.has(cacheKey)) {
    const cachedEmbedding = embeddingCache.get(cacheKey);
    return {
      embedding: cachedEmbedding,
      metadata,
      cached: true
    };
  }

  // If no client, return mock embedding for testing
  if (!client) {
    const mockEmbedding = new Array(1536).fill(0.1);
    return {
      embedding: mockEmbedding,
      metadata,
      cached: false,
      mock: true
    };
  }

  try {
    // Truncate code if too long (max ~8000 tokens for text-embedding-3-small)
    const truncatedCode = code.slice(0, 30000); // Rough character limit

    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedCode,
      encoding_format: 'float'
    });

    const embedding = response.data[0].embedding;

    // Cache the result
    embeddingCache.set(cacheKey, embedding);
    cleanupCache();

    return {
      embedding,
      metadata,
      cached: false,
      tokens: response.usage?.total_tokens
    };
  } catch (error) {
    console.error('[Embedder] Error generating embedding:', error.message);
    // Return mock embedding on error to maintain functionality
    return {
      embedding: new Array(1536).fill(0.1),
      metadata,
      cached: false,
      error: error.message
    };
  }
}

/**
 * Generate embedding for a search query
 *
 * @param {string} query - Search query text
 * @returns {Promise<Array>} Embedding vector (1536 dimensions)
 */
async function embedQuery(query) {
  const client = getOpenAIClient();

  if (!query || query.trim().length === 0) {
    return new Array(1536).fill(0);
  }

  // If no client, return mock embedding
  if (!client) {
    return new Array(1536).fill(0.1);
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[Embedder] Error generating query embedding:', error.message);
    return new Array(1536).fill(0.1);
  }
}

/**
 * Batch embed multiple code chunks efficiently
 *
 * @param {Array} chunks - Array of { code, metadata } objects
 * @returns {Promise<Array>} Array of embedding results
 */
async function batchEmbed(chunks) {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  const client = getOpenAIClient();
  const results = new Array(chunks.length);

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Handle empty code
    if (!chunk.code || chunk.code.trim().length === 0) {
      results[i] = {
        embedding: null,
        metadata: chunk.metadata,
        error: 'Empty code chunk'
      };
      continue;
    }

    // Check cache
    const cacheKey = hashContent(chunk.code);
    if (embeddingCache.has(cacheKey)) {
      results[i] = {
        embedding: embeddingCache.get(cacheKey),
        metadata: chunk.metadata,
        cached: true
      };
      continue;
    }

    // Generate embedding
    if (client) {
      try {
        const response = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: chunk.code.slice(0, 30000),
          encoding_format: 'float'
        });

        const embedding = response.data[0].embedding;
        embeddingCache.set(cacheKey, embedding);

        results[i] = {
          embedding,
          metadata: chunk.metadata,
          cached: false
        };
      } catch (error) {
        results[i] = {
          embedding: new Array(1536).fill(0.1),
          metadata: chunk.metadata,
          error: error.message
        };
      }
    } else {
      // No client, use mock embedding
      results[i] = {
        embedding: new Array(1536).fill(0.1),
        metadata: chunk.metadata,
        mock: true
      };
    }
  }

  cleanupCache();
  return results;
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    size: embeddingCache.size,
    maxSize: MAX_CACHE_SIZE
  };
}

/**
 * Clear the embedding cache
 */
function clearCache() {
  embeddingCache.clear();
}

module.exports = {
  embedCodeChunk,
  embedQuery,
  batchEmbed,
  getCacheStats,
  clearCache
};
