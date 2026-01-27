/**
 * Test: Video Observability Navigation
 *
 * TDD Tests for Navigation Update
 * RUN: node tests/video-observability-nav.test.js
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('\n=== Video Observability Navigation Tests ===\n');
  let passed = 0;
  let failed = 0;

  const navPath = path.join(__dirname, '..', 'views', 'partials', 'navigation.ejs');

  // Test 1: Navigation file exists
  console.log('Test 1: navigation.ejs exists');
  try {
    assert.ok(fs.existsSync(navPath), 'Navigation file should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    process.exit(1);
  }

  const navContent = fs.readFileSync(navPath, 'utf8');

  // Test 2: Navigation has AI Videos link
  console.log('Test 2: Navigation has AI Videos link');
  try {
    assert.ok(
      navContent.includes('/observability/videos'),
      'Should have link to /observability/videos'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: AI Videos link is in Operations dropdown
  console.log('Test 3: AI Videos is in Operations section');
  try {
    // Find Operations section and verify videos link is after it
    const operationsIndex = navContent.indexOf('Operations');
    const videosLinkIndex = navContent.indexOf('/observability/videos');

    assert.ok(operationsIndex !== -1, 'Should have Operations dropdown');
    assert.ok(videosLinkIndex !== -1, 'Should have videos link');
    assert.ok(videosLinkIndex > operationsIndex, 'Videos link should be after Operations');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: Navigation has videos currentPage check
  console.log('Test 4: Navigation highlights videos page');
  try {
    assert.ok(
      navContent.includes("currentPage === 'videos'"),
      'Should check for videos currentPage'
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
