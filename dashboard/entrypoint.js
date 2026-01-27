#!/usr/bin/env node
/**
 * Railway Entrypoint
 *
 * Runs either the main Portal server or the SQS worker based on
 * the WORKER_MODE environment variable.
 *
 * Usage:
 *   - Main server: node entrypoint.js (or WORKER_MODE not set)
 *   - SQS Worker:  WORKER_MODE=sqs node entrypoint.js
 */

const { spawn } = require('child_process');
const path = require('path');

const WORKER_MODE = process.env.WORKER_MODE;

console.log(`[Entrypoint] Starting in ${WORKER_MODE ? `worker mode: ${WORKER_MODE}` : 'main server mode'}`);

let command, args;

if (WORKER_MODE === 'sqs') {
  // Run SQS worker
  command = 'node';
  args = [path.join(__dirname, 'workers', 'portal-sqs-worker.js')];
  console.log('[Entrypoint] Running SQS worker...');
} else {
  // Run main server (cluster mode)
  command = 'node';
  args = ['--max-old-space-size=512', path.join(__dirname, 'cluster.js')];
  console.log('[Entrypoint] Running main server (cluster mode)...');
}

// Spawn the appropriate process
const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (err) => {
  console.error('[Entrypoint] Failed to start:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`[Entrypoint] Process terminated by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code || 0);
});

// Forward signals to child
process.on('SIGTERM', () => {
  console.log('[Entrypoint] Received SIGTERM, forwarding to child...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('[Entrypoint] Received SIGINT, forwarding to child...');
  child.kill('SIGINT');
});
