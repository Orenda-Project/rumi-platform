/**
 * Pic-LP Latency Service
 *
 * Wraps the lp_latency_stats RPC with a 5-minute in-memory cache. Used by the
 * wait-message service to render dynamic latency hints.
 *
 * Cold-start: when sample_size < 10, callers fall back to the baked-in
 * defaults from kieai-client.service.js pickBackend(). After ~10 generations,
 * this service returns live numbers from the DB.
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LOOKBACK_HOURS = 168; // 7 days
const cache = new Map(); // key: source string → { value, expiresAt }

/**
 * Fetch p50/p90 latency stats for a given lesson_plans.source.
 * Returns null on RPC error (caller should use baked-in defaults).
 *
 * @param {string} source - 'pic_to_lp_kieai' | 'gamma_standard' | etc.
 * @returns {Promise<{p50_ms: number, p90_ms: number, sample_size: number}|null>}
 */
async function getStats(source) {
  if (!source) return null;
  const cached = cache.get(source);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  try {
    const { data, error } = await supabase.rpc('lp_latency_stats', {
      p_source: source,
      p_lookback_hours: LOOKBACK_HOURS,
    });
    if (error) {
      logToFile('lp_latency_stats RPC error', { source, error: error.message });
      return null;
    }
    // Supabase rpc returns an array even for single-row functions
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const value = {
      p50_ms: row.p50_ms || 0,
      p90_ms: row.p90_ms || 0,
      sample_size: row.sample_size || 0,
    };
    cache.set(source, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (e) {
    logToFile('lp_latency_stats threw', { source, error: e.message });
    return null;
  }
}

/**
 * Force-clear the cache. Used by tests + by the latency-recomputation job.
 */
function clearCache() { cache.clear(); }

module.exports = { getStats, clearCache };
