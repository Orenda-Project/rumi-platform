/**
 * Test: Video Observability Service
 *
 * TDD Tests for Video Gallery Feature
 * RUN FIRST: node tests/video-observability-service.test.js
 */

require('dotenv').config();
const assert = require('assert');

let videoService;

async function runTests() {
  console.log('\n=== Video Observability Service Tests ===\n');
  let passed = 0;
  let failed = 0;

  // ===========================================
  // MODULE EXISTENCE TESTS
  // ===========================================

  // Test 1: Service module exists
  console.log('Test 1: Service module exists');
  try {
    videoService = require('../services/video-observability.service');
    assert.ok(videoService, 'Service should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('TESTS FAILED - Service module not found\n');
    process.exit(1);
  }

  // Test 2: getVideos function exists
  console.log('Test 2: getVideos function exists');
  try {
    assert.strictEqual(typeof videoService.getVideos, 'function', 'Should have getVideos');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: getVideoStats function exists
  console.log('Test 3: getVideoStats function exists');
  try {
    assert.strictEqual(typeof videoService.getVideoStats, 'function', 'Should have getVideoStats');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: getVideosByDate function exists
  console.log('Test 4: getVideosByDate function exists');
  try {
    assert.strictEqual(typeof videoService.getVideosByDate, 'function', 'Should have getVideosByDate');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: getUsersWithVideos function exists
  console.log('Test 5: getUsersWithVideos function exists');
  try {
    assert.strictEqual(typeof videoService.getUsersWithVideos, 'function', 'Should have getUsersWithVideos');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ===========================================
  // DATA STRUCTURE TESTS
  // ===========================================

  // Test 6: getVideos returns correct structure
  console.log('Test 6: getVideos returns correct data structure');
  try {
    const result = await videoService.getVideos({ page: 1, limit: 5 });

    assert.ok(result, 'Should return result');
    assert.ok(Array.isArray(result.videos), 'Should have videos array');
    assert.ok('totalCount' in result, 'Should have totalCount');
    assert.ok('hasMore' in result, 'Should have hasMore boolean');
    assert.strictEqual(typeof result.totalCount, 'number', 'totalCount should be number');
    assert.strictEqual(typeof result.hasMore, 'boolean', 'hasMore should be boolean');

    console.log(`  Found ${result.videos.length} videos, total: ${result.totalCount}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: getVideoStats returns stats object with required fields
  console.log('Test 7: getVideoStats returns correct stats structure');
  try {
    const stats = await videoService.getVideoStats();

    assert.ok(stats, 'Should return stats');
    assert.ok('all' in stats, 'Should have all count');
    assert.ok('completed' in stats, 'Should have completed count');
    assert.ok('processing' in stats, 'Should have processing count');
    assert.ok('failed' in stats, 'Should have failed count');
    assert.ok('cancelled' in stats, 'Should have cancelled count');
    assert.ok('successRate' in stats, 'Should have successRate');

    // Validate types
    assert.strictEqual(typeof stats.all, 'number', 'all should be number');
    assert.strictEqual(typeof stats.successRate, 'number', 'successRate should be number');

    // Validate logic: successRate should be 0-100
    assert.ok(stats.successRate >= 0 && stats.successRate <= 100, 'successRate should be 0-100');

    console.log(`  Stats: all=${stats.all}, completed=${stats.completed}, rate=${stats.successRate}%`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: getUsersWithVideos returns user array
  console.log('Test 8: getUsersWithVideos returns user array');
  try {
    const users = await videoService.getUsersWithVideos();

    assert.ok(Array.isArray(users), 'Should return array');

    if (users.length > 0) {
      const user = users[0];
      assert.ok('id' in user, 'User should have id');
      assert.ok('name' in user, 'User should have name');
      assert.ok('phone' in user, 'User should have phone');
      assert.ok('count' in user, 'User should have count');
      assert.strictEqual(typeof user.count, 'number', 'count should be number');
    }

    console.log(`  Found ${users.length} users with videos`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ===========================================
  // FILTERING TESTS
  // ===========================================

  // Test 9: getVideos with status filter
  console.log('Test 9: getVideos filters by status correctly');
  try {
    const allVideos = await videoService.getVideos({ statusFilter: 'all' });
    const completedVideos = await videoService.getVideos({ statusFilter: 'completed' });

    assert.ok(completedVideos.totalCount <= allVideos.totalCount, 'Filtered count should be <= total');

    // If we have completed videos, verify they're actually completed
    if (completedVideos.videos.length > 0) {
      const allCompleted = completedVideos.videos.every(v => v.status === 'completed');
      assert.ok(allCompleted, 'All videos should have completed status');
    }

    console.log(`  All: ${allVideos.totalCount}, Completed: ${completedVideos.totalCount}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: getVideos with date range filter
  console.log('Test 10: getVideos filters by date range');
  try {
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await videoService.getVideos({
      dateFrom: lastWeek,
      dateTo: today
    });

    assert.ok(result, 'Should return result');
    assert.ok(Array.isArray(result.videos), 'Should have videos array');

    // Verify all videos are within date range
    if (result.videos.length > 0) {
      const allInRange = result.videos.every(v => {
        const created = new Date(v.created_at);
        return created >= new Date(lastWeek) && created <= new Date(today + 'T23:59:59Z');
      });
      assert.ok(allInRange, 'All videos should be within date range');
    }

    console.log(`  Videos in last 7 days: ${result.totalCount}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: getVideos with language filter
  console.log('Test 11: getVideos filters by language');
  try {
    const result = await videoService.getVideos({ languageFilter: 'ur' });

    assert.ok(result, 'Should return result');

    // If we have Urdu videos, verify they're actually Urdu
    if (result.videos.length > 0) {
      const allUrdu = result.videos.every(v => v.language === 'ur');
      assert.ok(allUrdu, 'All videos should have ur language');
    }

    console.log(`  Urdu videos: ${result.totalCount}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: getVideos with topic search
  console.log('Test 12: getVideos filters by topic search');
  try {
    const result = await videoService.getVideos({ topicSearch: 'gravity' });

    assert.ok(result, 'Should return result');

    // If we have results, verify topic contains search term
    if (result.videos.length > 0) {
      const allMatch = result.videos.every(v =>
        v.topic.toLowerCase().includes('gravity')
      );
      assert.ok(allMatch, 'All videos should match topic search');
    }

    console.log(`  Videos matching "gravity": ${result.totalCount}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ===========================================
  // PAGINATION TESTS
  // ===========================================

  // Test 13: Pagination works correctly
  console.log('Test 13: Pagination returns correct page');
  try {
    const page1 = await videoService.getVideos({ page: 1, limit: 2 });
    const page2 = await videoService.getVideos({ page: 2, limit: 2 });

    assert.ok(page1.videos.length <= 2, 'Page 1 should have at most 2 videos');
    assert.ok(page2.videos.length <= 2, 'Page 2 should have at most 2 videos');

    // If we have enough videos, pages should be different
    if (page1.totalCount > 2 && page1.videos.length > 0 && page2.videos.length > 0) {
      assert.notStrictEqual(
        page1.videos[0].id,
        page2.videos[0].id,
        'Pages should have different videos'
      );
    }

    console.log(`  Page 1: ${page1.videos.length} videos, Page 2: ${page2.videos.length} videos`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: hasMore flag is correct
  console.log('Test 14: hasMore flag is accurate');
  try {
    const result = await videoService.getVideos({ page: 1, limit: 1 });

    if (result.totalCount > 1) {
      assert.strictEqual(result.hasMore, true, 'hasMore should be true when more pages exist');
    } else if (result.totalCount <= 1) {
      assert.strictEqual(result.hasMore, false, 'hasMore should be false when no more pages');
    }

    console.log(`  Total: ${result.totalCount}, hasMore: ${result.hasMore}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ===========================================
  // VIDEO DATA INTEGRITY TESTS
  // ===========================================

  // Test 15: Video objects have required fields
  console.log('Test 15: Video objects have required fields');
  try {
    const result = await videoService.getVideos({ limit: 5 });

    if (result.videos.length > 0) {
      const video = result.videos[0];

      // Required fields
      assert.ok('id' in video, 'Video should have id');
      assert.ok('user_id' in video, 'Video should have user_id');
      assert.ok('topic' in video, 'Video should have topic');
      assert.ok('language' in video, 'Video should have language');
      assert.ok('status' in video, 'Video should have status');
      assert.ok('created_at' in video, 'Video should have created_at');

      // User join data
      assert.ok('users' in video, 'Video should have users join');
      assert.ok('phone_number' in video.users, 'User should have phone_number');

      console.log(`  Video ${video.id.substring(0, 8)}... has all required fields`);
    } else {
      console.log('  No videos to test (empty database)');
    }

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 16: getVideosByDate returns daily aggregation
  console.log('Test 16: getVideosByDate returns daily aggregation');
  try {
    const byDate = await videoService.getVideosByDate(30);

    assert.ok(Array.isArray(byDate), 'Should return array');

    if (byDate.length > 0) {
      const day = byDate[0];
      assert.ok('date' in day, 'Should have date');
      assert.ok('total' in day, 'Should have total');
      assert.ok('completed' in day, 'Should have completed');
      assert.ok('failed' in day, 'Should have failed');

      // Validate date format (YYYY-MM-DD)
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(day.date), 'Date should be YYYY-MM-DD format');
    }

    console.log(`  ${byDate.length} days with video activity`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ===========================================
  // EDGE CASE TESTS
  // ===========================================

  // Test 17: Empty filters don't break query
  console.log('Test 17: Empty/null filters handled gracefully');
  try {
    const result = await videoService.getVideos({
      statusFilter: 'all',
      languageFilter: null,
      dateFrom: null,
      dateTo: null,
      userId: null,
      topicSearch: null
    });

    assert.ok(result, 'Should handle null filters');
    assert.ok(Array.isArray(result.videos), 'Should return videos array');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 18: Invalid page number defaults gracefully
  console.log('Test 18: Invalid page defaults to page 1');
  try {
    const result = await videoService.getVideos({ page: -1, limit: 5 });

    // Should not throw, should return valid result
    assert.ok(result, 'Should return result for invalid page');
    assert.ok(Array.isArray(result.videos), 'Should have videos array');

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
    console.log('TESTS FAILED - Fix issues before implementation\n');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED - Ready for implementation\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
