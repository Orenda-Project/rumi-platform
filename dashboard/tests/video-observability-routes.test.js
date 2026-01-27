/**
 * Test: Video Observability Routes
 *
 * TDD Tests for Video Gallery Route Handler
 * RUN: node tests/video-observability-routes.test.js
 */

require('dotenv').config();
const assert = require('assert');
const http = require('http');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000';

// Helper to make HTTP requests
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n=== Video Observability Routes Tests ===\n');
  console.log(`Testing against: ${BASE_URL}\n`);
  let passed = 0;
  let failed = 0;

  // Test 1: Route exists (returns 302 redirect to login if not authenticated)
  console.log('Test 1: /observability/videos route exists');
  try {
    const res = await makeRequest('/observability/videos');

    // Should either redirect to login (302) or return 200 if session exists
    assert.ok(
      res.status === 200 || res.status === 302,
      `Should return 200 or 302, got ${res.status}`
    );

    console.log(`  Status: ${res.status}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 2: Route accepts query parameters
  console.log('Test 2: Route accepts filter query parameters');
  try {
    const res = await makeRequest('/observability/videos?status=completed&language=ur&page=1');

    assert.ok(
      res.status === 200 || res.status === 302,
      `Should return 200 or 302, got ${res.status}`
    );

    console.log(`  Status: ${res.status}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: Route handles date range parameters
  console.log('Test 3: Route handles date range parameters');
  try {
    const res = await makeRequest('/observability/videos?dateFrom=2025-01-01&dateTo=2025-12-31');

    assert.ok(
      res.status === 200 || res.status === 302,
      `Should return 200 or 302, got ${res.status}`
    );

    console.log(`  Status: ${res.status}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: Invalid status filter doesn't crash
  console.log('Test 4: Invalid status filter handled gracefully');
  try {
    const res = await makeRequest('/observability/videos?status=invalid_status');

    // Should not return 500
    assert.ok(
      res.status !== 500,
      `Should not return 500 for invalid filter, got ${res.status}`
    );

    console.log(`  Status: ${res.status}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ===========================================
  // SUMMARY
  // ===========================================

  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  if (failed > 0) {
    console.log('TESTS FAILED\n');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
