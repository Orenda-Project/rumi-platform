/**
 * Test: Video Observability View
 *
 * TDD Tests for Video Gallery EJS Template
 * RUN: node tests/video-observability-view.test.js
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('\n=== Video Observability View Tests ===\n');
  let passed = 0;
  let failed = 0;

  const viewPath = path.join(__dirname, '..', 'views', 'videos.ejs');

  // Test 1: View file exists
  console.log('Test 1: videos.ejs view file exists');
  try {
    assert.ok(fs.existsSync(viewPath), 'View file should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    // Can't continue without the file
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('TESTS FAILED - View file not found\n');
    process.exit(1);
  }

  const viewContent = fs.readFileSync(viewPath, 'utf8');

  // Test 2: View includes navigation partial
  console.log('Test 2: View includes navigation partial');
  try {
    assert.ok(
      viewContent.includes('include("partials/navigation"') ||
      viewContent.includes("include('partials/navigation'"),
      'Should include navigation partial'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: View has video grid container
  console.log('Test 3: View has video grid container');
  try {
    assert.ok(
      viewContent.includes('video-grid') || viewContent.includes('grid'),
      'Should have grid container class'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: View has stats section
  console.log('Test 4: View displays stats');
  try {
    assert.ok(
      viewContent.includes('stats.all') || viewContent.includes('stats.completed'),
      'Should display stats'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: View has filter form
  console.log('Test 5: View has filter form');
  try {
    assert.ok(
      viewContent.includes('<form') && viewContent.includes('method="GET"'),
      'Should have GET form for filters'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: View iterates over videos
  console.log('Test 6: View iterates over videos array');
  try {
    assert.ok(
      viewContent.includes('videos.forEach') || viewContent.includes('for video of videos'),
      'Should iterate over videos'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: View displays video status
  console.log('Test 7: View displays video status badges');
  try {
    assert.ok(
      viewContent.includes('video.status') &&
      (viewContent.includes('completed') || viewContent.includes('statusLabel')),
      'Should display status badges'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: View has pagination
  console.log('Test 8: View has pagination controls');
  try {
    assert.ok(
      viewContent.includes('currentPage') &&
      (viewContent.includes('Previous') || viewContent.includes('Next')),
      'Should have pagination controls'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: View handles empty state
  console.log('Test 9: View handles empty state');
  try {
    assert.ok(
      viewContent.includes('videos.length === 0') ||
      viewContent.includes('No videos found'),
      'Should handle empty state'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: View shows user info with link
  console.log('Test 10: View shows user info with link');
  try {
    assert.ok(
      viewContent.includes('video.users') &&
      viewContent.includes('/observability/users'),
      'Should show user info with link'
    );
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
