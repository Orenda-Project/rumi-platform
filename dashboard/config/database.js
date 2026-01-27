/**
 * PostgreSQL Connection Pool - FIXED VERSION
 *
 * Fixes applied (bd-039):
 * - Correct event tracking (acquire/release instead of connect/release)
 * - Pool health monitoring with periodic logging
 * - Automatic alerting when pool is stressed (>80% capacity)
 * - Detection of impossible negative counter (debugging aid)
 *
 * Bead: bd-039 - Fix portal database connection pool leak
 */

require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT || 6543,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },

  // Pool settings
  max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,  // 10s timeout for connection
  allowExitOnIdle: false
};

const pool = new Pool(poolConfig);

// Pool statistics tracking
let stats = {
  totalCreated: 0,
  activeConnections: 0,
  totalAcquires: 0,
  totalReleases: 0,
  errors: 0,
  peakActive: 0,
};

// New connection created (only fires once per connection)
pool.on('connect', (client) => {
  stats.totalCreated++;
  console.log(`[DB Pool] New connection created (total: ${stats.totalCreated})`);
});

// Connection acquired from pool (fires for EVERY acquisition - new or reused)
pool.on('acquire', (client) => {
  stats.activeConnections++;
  stats.totalAcquires++;
  stats.peakActive = Math.max(stats.peakActive, stats.activeConnections);

  // Alert if pool is stressed (>80% capacity)
  if (stats.activeConnections > poolConfig.max * 0.8) {
    console.warn(`[DB Pool] HIGH USAGE: ${stats.activeConnections}/${poolConfig.max} active`);
  }
});

// Connection released back to pool (fires for EVERY release)
pool.on('release', (client) => {
  stats.activeConnections--;
  stats.totalReleases++;
});

// Connection removed from pool (idle timeout, error, etc.)
pool.on('remove', (client) => {
  console.log(`[DB Pool] Connection removed (pool size: ${pool.totalCount})`);
});

// Error on idle client
pool.on('error', (err, client) => {
  stats.errors++;
  console.error('[DB Pool] Idle client error:', err.message);
});

// Health check endpoint data
function getPoolStats() {
  return {
    ...stats,
    poolTotal: pool.totalCount,
    poolIdle: pool.idleCount,
    poolWaiting: pool.waitingCount,
    configMax: poolConfig.max,
  };
}

// Periodic health logging (every 30 seconds)
setInterval(() => {
  const s = getPoolStats();
  const utilization = ((s.activeConnections / s.configMax) * 100).toFixed(1);

  // Only log if there's activity or issues
  if (s.activeConnections > 0 || s.poolWaiting > 0) {
    console.log(`[DB Pool] Health: ${s.activeConnections}/${s.configMax} active (${utilization}%), ${s.poolWaiting} waiting`);
  }

  // Alert if counter is impossible (debugging aid for future issues)
  if (s.activeConnections < 0) {
    console.error(`[DB Pool] CRITICAL: Negative active count (${s.activeConnections}) - pool tracking bug!`);
  }
}, 30000);

console.log(`[DB Pool] Initialized: max=${poolConfig.max}, min=${poolConfig.min}`);

module.exports = pool;
module.exports.getPoolStats = getPoolStats;
