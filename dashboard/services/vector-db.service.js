/**
 * Vector Database Service
 *
 * In-memory vector store with cosine similarity search
 * Provides semantic code search for The Forge AI
 *
 * Uses JSON file persistence (can be upgraded to LanceDB later)
 *
 * @author Claude Opus 4.5
 * @date January 2026
 */

const fs = require('fs').promises;
const path = require('path');

// In-memory vector store
let vectorStore = new Map();

// Persistence file path
const STORE_PATH = process.env.VECTOR_STORE_PATH || path.join(__dirname, '../data/vector-store.json');

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Store or update a code chunk
 *
 * @param {Object} chunk - Code chunk with embedding
 * @param {string} chunk.id - Unique identifier
 * @param {string} chunk.repoKey - Repository key
 * @param {string} chunk.filePath - File path
 * @param {number} chunk.startLine - Start line number
 * @param {number} chunk.endLine - End line number
 * @param {string} chunk.functionName - Function name (optional)
 * @param {string} chunk.className - Class name (optional)
 * @param {string} chunk.code - Code content
 * @param {Array} chunk.embedding - 1536-dim vector
 */
async function upsert(chunk) {
  if (!chunk.id) {
    chunk.id = generateId(chunk);
  }

  vectorStore.set(chunk.id, {
    ...chunk,
    indexedAt: new Date().toISOString()
  });

  return { success: true, id: chunk.id };
}

/**
 * Store multiple chunks at once
 *
 * @param {Array} chunks - Array of code chunks
 */
async function upsertBatch(chunks) {
  for (const chunk of chunks) {
    await upsert(chunk);
  }
  return { success: true, count: chunks.length };
}

/**
 * Generate a unique ID for a chunk
 */
function generateId(chunk) {
  return `${chunk.repoKey}:${chunk.filePath}:${chunk.startLine || 0}`;
}

/**
 * Search for similar code chunks
 *
 * @param {Object} options - Search options
 * @param {Array} options.vector - Query embedding (1536-dim)
 * @param {string} options.repoKey - Filter by repository (optional)
 * @param {string} options.fileType - Filter by file extension (optional)
 * @param {number} options.limit - Maximum results (default: 10)
 * @param {number} options.minScore - Minimum similarity score (default: 0)
 * @returns {Array} Sorted array of matching chunks with scores
 */
async function search(options) {
  const {
    vector,
    repoKey,
    fileType,
    limit = 10,
    minScore = 0
  } = options;

  if (!vector || vector.length === 0) {
    return [];
  }

  const results = [];

  for (const [id, chunk] of vectorStore) {
    // Apply filters
    if (repoKey && chunk.repoKey !== repoKey) {
      continue;
    }

    if (fileType && !chunk.filePath.endsWith(`.${fileType}`)) {
      continue;
    }

    if (!chunk.embedding) {
      continue;
    }

    // Calculate similarity
    const score = cosineSimilarity(vector, chunk.embedding);

    if (score >= minScore) {
      results.push({
        ...chunk,
        score
      });
    }
  }

  // Sort by score descending and limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get the count of stored chunks
 */
async function count() {
  return vectorStore.size;
}

/**
 * Clear all stored chunks
 */
async function clear() {
  vectorStore.clear();
  return { success: true };
}

/**
 * Delete chunks by repository
 *
 * @param {string} repoKey - Repository key
 */
async function deleteByRepo(repoKey) {
  let deleted = 0;
  for (const [id, chunk] of vectorStore) {
    if (chunk.repoKey === repoKey) {
      vectorStore.delete(id);
      deleted++;
    }
  }
  return { success: true, deleted };
}

/**
 * Delete chunks by file path
 *
 * @param {string} repoKey - Repository key
 * @param {string} filePath - File path
 */
async function deleteByFile(repoKey, filePath) {
  let deleted = 0;
  for (const [id, chunk] of vectorStore) {
    if (chunk.repoKey === repoKey && chunk.filePath === filePath) {
      vectorStore.delete(id);
      deleted++;
    }
  }
  return { success: true, deleted };
}

/**
 * Save vector store to disk
 */
async function persist() {
  try {
    const dirPath = path.dirname(STORE_PATH);
    await fs.mkdir(dirPath, { recursive: true });

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      chunks: Array.from(vectorStore.entries())
    };

    await fs.writeFile(STORE_PATH, JSON.stringify(data), 'utf-8');
    return { success: true, count: vectorStore.size };
  } catch (error) {
    console.error('[VectorDB] Error persisting:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Load vector store from disk
 */
async function load() {
  try {
    const content = await fs.readFile(STORE_PATH, 'utf-8');
    const data = JSON.parse(content);

    vectorStore = new Map(data.chunks);
    return { success: true, count: vectorStore.size };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, start fresh
      return { success: true, count: 0 };
    }
    console.error('[VectorDB] Error loading:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get statistics about the vector store
 */
async function stats() {
  const repos = {};
  for (const [id, chunk] of vectorStore) {
    repos[chunk.repoKey] = (repos[chunk.repoKey] || 0) + 1;
  }

  return {
    totalChunks: vectorStore.size,
    byRepo: repos
  };
}

/**
 * Get all chunks (for debugging/export)
 */
async function getAll() {
  return Array.from(vectorStore.values());
}

module.exports = {
  upsert,
  upsertBatch,
  search,
  count,
  clear,
  deleteByRepo,
  deleteByFile,
  persist,
  load,
  stats,
  getAll
};
