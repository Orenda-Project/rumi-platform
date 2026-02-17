#!/usr/bin/env node
/**
 * Test runner that handles Node.js version compatibility.
 * Node 22+ requires --localstorage-file for Jest to work properly.
 * This script sets that flag automatically when needed.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const major = parseInt(process.versions.node.split('.')[0], 10);

const nodeOpts = major >= 25
  ? '--no-experimental-webstorage'
  : major >= 22
    ? '--localstorage-file=/tmp/jest-ls'
    : '';
const args = process.argv.slice(2).join(' ');

// Resolve jest binary from node_modules
const jestBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'jest');
const jestCmd = fs.existsSync(jestBin) ? jestBin : 'jest';
const cmd = `"${jestCmd}" --config tests/jest.config.js ${args}`;

try {
  execSync(cmd, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(nodeOpts ? { NODE_OPTIONS: [process.env.NODE_OPTIONS, nodeOpts].filter(Boolean).join(' ') } : {})
    }
  });
} catch (err) {
  process.exit(err.status || 1);
}
