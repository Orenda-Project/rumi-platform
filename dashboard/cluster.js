/**
 * Digital Coach Dashboard - Cluster Wrapper
 *
 * Uses Node.js cluster module to spawn multiple worker processes.
 * This prevents a single slow request (like GPT processing) from blocking
 * other requests (like serving static files for Teachers' Portal).
 *
 * Bead: plt-clus01
 * Issue: Concurrent GPT processing blocking other requests
 * Solution: Multiple workers handle requests independently
 */

const cluster = require('cluster');
const os = require('os');

// Configuration
const NUM_WORKERS = parseInt(process.env.CLUSTER_WORKERS || '0') || Math.min(os.cpus().length, 4);
const CLUSTER_ENABLED = process.env.CLUSTER_ENABLED !== 'false'; // Enabled by default

if (CLUSTER_ENABLED && cluster.isPrimary) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('🚀 Digital Coach Dashboard - Cluster Mode');
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 Primary process ${process.pid} is running`);
  console.log(`🔧 Spawning ${NUM_WORKERS} worker processes...`);
  console.log(`${'='.repeat(70)}\n`);

  // Fork workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = cluster.fork();
    console.log(`✅ Worker ${worker.process.pid} started`);
  }

  // Handle worker exit
  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);

    // Restart worker unless it was killed intentionally
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      console.log('🔄 Starting a new worker...');
      const newWorker = cluster.fork();
      console.log(`✅ New worker ${newWorker.process.pid} started`);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\n📴 SIGTERM received, shutting down gracefully...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n📴 SIGINT received, shutting down gracefully...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  });

} else {
  // Worker process - run the main application
  if (CLUSTER_ENABLED) {
    console.log(`👷 Worker ${process.pid} starting...`);
  }

  // Load the main application
  require('./index.js');
}
