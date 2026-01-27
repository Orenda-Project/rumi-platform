/**
 * Test: BYOF Service
 *
 * TDD Tests for BYOF (Build Your Own Feature) service
 * Tests byof_role validation, session CRUD, message storage, permission checks
 */

require('dotenv').config();
const assert = require('assert');

let byofService;

async function runTests() {
  console.log('\n=== BYOF Service Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Service module exists
  console.log('Test 1: Service module exists');
  try {
    byofService = require('../services/byof.service');
    assert.ok(byofService, 'Service should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}\n`);
    console.log('TESTS FAILED - Service module not found\n');
    process.exit(1);
  }

  // Test 2: validateByofRole function exists
  console.log('Test 2: validateByofRole function exists');
  try {
    assert.strictEqual(typeof byofService.validateByofRole, 'function', 'Should have validateByofRole');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: validateByofRole accepts valid roles
  console.log('Test 3: validateByofRole accepts valid roles');
  try {
    assert.strictEqual(byofService.validateByofRole('reporter'), true, 'Should accept reporter');
    assert.strictEqual(byofService.validateByofRole('approver'), true, 'Should accept approver');
    assert.strictEqual(byofService.validateByofRole(null), true, 'Should accept null (no access)');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: validateByofRole rejects invalid roles
  console.log('Test 4: validateByofRole rejects invalid roles');
  try {
    assert.strictEqual(byofService.validateByofRole('admin'), false, 'Should reject admin');
    assert.strictEqual(byofService.validateByofRole('viewer'), false, 'Should reject viewer');
    assert.strictEqual(byofService.validateByofRole('superuser'), false, 'Should reject superuser');
    assert.strictEqual(byofService.validateByofRole(''), false, 'Should reject empty string');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: canCreateSession function exists
  console.log('Test 5: canCreateSession function exists');
  try {
    assert.strictEqual(typeof byofService.canCreateSession, 'function', 'Should have canCreateSession');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: canCreateSession permission check
  console.log('Test 6: canCreateSession permission check');
  try {
    // Reporter can create
    assert.strictEqual(byofService.canCreateSession('reporter'), true, 'Reporter should create');
    // Approver can create
    assert.strictEqual(byofService.canCreateSession('approver'), true, 'Approver should create');
    // No role cannot create
    assert.strictEqual(byofService.canCreateSession(null), false, 'Null role cannot create');
    assert.strictEqual(byofService.canCreateSession(undefined), false, 'Undefined role cannot create');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: canApprovePlan function exists
  console.log('Test 7: canApprovePlan function exists');
  try {
    assert.strictEqual(typeof byofService.canApprovePlan, 'function', 'Should have canApprovePlan');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: canApprovePlan permission check
  console.log('Test 8: canApprovePlan permission check');
  try {
    // Only approver can approve
    assert.strictEqual(byofService.canApprovePlan('approver'), true, 'Approver should approve');
    // Reporter cannot approve
    assert.strictEqual(byofService.canApprovePlan('reporter'), false, 'Reporter cannot approve');
    // No role cannot approve
    assert.strictEqual(byofService.canApprovePlan(null), false, 'Null role cannot approve');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: createSession function exists
  console.log('Test 9: createSession function exists');
  try {
    assert.strictEqual(typeof byofService.createSession, 'function', 'Should have createSession');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: getSessionById function exists
  console.log('Test 10: getSessionById function exists');
  try {
    assert.strictEqual(typeof byofService.getSessionById, 'function', 'Should have getSessionById');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: getUserSessions function exists
  console.log('Test 11: getUserSessions function exists');
  try {
    assert.strictEqual(typeof byofService.getUserSessions, 'function', 'Should have getUserSessions');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: addMessage function exists
  console.log('Test 12: addMessage function exists');
  try {
    assert.strictEqual(typeof byofService.addMessage, 'function', 'Should have addMessage');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: getSessionMessages function exists
  console.log('Test 13: getSessionMessages function exists');
  try {
    assert.strictEqual(typeof byofService.getSessionMessages, 'function', 'Should have getSessionMessages');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: validateSessionType function exists
  console.log('Test 14: validateSessionType function exists');
  try {
    assert.strictEqual(typeof byofService.validateSessionType, 'function', 'Should have validateSessionType');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 15: validateSessionType accepts valid types
  console.log('Test 15: validateSessionType accepts valid types');
  try {
    assert.strictEqual(byofService.validateSessionType('bug'), true, 'Should accept bug');
    assert.strictEqual(byofService.validateSessionType('feature'), true, 'Should accept feature');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 16: validateSessionType rejects invalid types
  console.log('Test 16: validateSessionType rejects invalid types');
  try {
    assert.strictEqual(byofService.validateSessionType('request'), false, 'Should reject request');
    assert.strictEqual(byofService.validateSessionType('task'), false, 'Should reject task');
    assert.strictEqual(byofService.validateSessionType(''), false, 'Should reject empty');
    assert.strictEqual(byofService.validateSessionType(null), false, 'Should reject null');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ============================================================
  // Plan Management Tests (Phase 3)
  // ============================================================
  console.log('\n=== Plan Management Tests ===\n');

  // Test 17: validatePlanStatus function exists
  console.log('Test 17: validatePlanStatus function exists');
  try {
    assert.strictEqual(typeof byofService.validatePlanStatus, 'function', 'Should have validatePlanStatus');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 18: validatePlanStatus accepts valid statuses
  console.log('Test 18: validatePlanStatus accepts valid statuses');
  try {
    assert.strictEqual(byofService.validatePlanStatus('draft'), true, 'Should accept draft');
    assert.strictEqual(byofService.validatePlanStatus('approved'), true, 'Should accept approved');
    assert.strictEqual(byofService.validatePlanStatus('staging_live'), true, 'Should accept staging_live');
    assert.strictEqual(byofService.validatePlanStatus('production_live'), true, 'Should accept production_live');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 19: validatePlanStatus rejects invalid statuses
  console.log('Test 19: validatePlanStatus rejects invalid statuses');
  try {
    assert.strictEqual(byofService.validatePlanStatus('pending'), false, 'Should reject pending');
    assert.strictEqual(byofService.validatePlanStatus(''), false, 'Should reject empty');
    assert.strictEqual(byofService.validatePlanStatus(null), false, 'Should reject null');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 20: createPlan function exists
  console.log('Test 20: createPlan function exists');
  try {
    assert.strictEqual(typeof byofService.createPlan, 'function', 'Should have createPlan');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 21: getPlanBySession function exists
  console.log('Test 21: getPlanBySession function exists');
  try {
    assert.strictEqual(typeof byofService.getPlanBySession, 'function', 'Should have getPlanBySession');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 22: updatePlanStatus function exists
  console.log('Test 22: updatePlanStatus function exists');
  try {
    assert.strictEqual(typeof byofService.updatePlanStatus, 'function', 'Should have updatePlanStatus');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 23: approvePlan function exists
  console.log('Test 23: approvePlan function exists');
  try {
    assert.strictEqual(typeof byofService.approvePlan, 'function', 'Should have approvePlan');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 24: rejectPlan function exists
  console.log('Test 24: rejectPlan function exists');
  try {
    assert.strictEqual(typeof byofService.rejectPlan, 'function', 'Should have rejectPlan');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ============================================================
  // PR Linking & Tracking Tests (Phase 4)
  // ============================================================
  console.log('\n=== PR Linking & Tracking Tests ===\n');

  // Test 25: validatePrUrl function exists
  console.log('Test 25: validatePrUrl function exists');
  try {
    assert.strictEqual(typeof byofService.validatePrUrl, 'function', 'Should have validatePrUrl');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 26: validatePrUrl accepts valid GitHub PR URLs
  console.log('Test 26: validatePrUrl accepts valid GitHub PR URLs');
  try {
    assert.strictEqual(
      byofService.validatePrUrl('https://github.com/your-org/whatsapp-ai-bot/pull/123'),
      true,
      'Should accept valid PR URL'
    );
    assert.strictEqual(
      byofService.validatePrUrl('https://github.com/your-org/digital-coach-dashboard/pull/45'),
      true,
      'Should accept dashboard PR URL'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 27: validatePrUrl rejects invalid URLs
  console.log('Test 27: validatePrUrl rejects invalid URLs');
  try {
    assert.strictEqual(byofService.validatePrUrl('not-a-url'), false, 'Should reject non-URL');
    assert.strictEqual(byofService.validatePrUrl('https://gitlab.com/org/repo/merge_requests/1'), false, 'Should reject GitLab');
    assert.strictEqual(byofService.validatePrUrl('https://github.com/org/repo/issues/1'), false, 'Should reject issues URL');
    assert.strictEqual(byofService.validatePrUrl(''), false, 'Should reject empty');
    assert.strictEqual(byofService.validatePrUrl(null), false, 'Should reject null');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 28: linkPrToPlan function exists
  console.log('Test 28: linkPrToPlan function exists');
  try {
    assert.strictEqual(typeof byofService.linkPrToPlan, 'function', 'Should have linkPrToPlan');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 29: getPlanByPrUrl function exists
  console.log('Test 29: getPlanByPrUrl function exists');
  try {
    assert.strictEqual(typeof byofService.getPlanByPrUrl, 'function', 'Should have getPlanByPrUrl');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 30: markPlanStagingLive function exists
  console.log('Test 30: markPlanStagingLive function exists');
  try {
    assert.strictEqual(typeof byofService.markPlanStagingLive, 'function', 'Should have markPlanStagingLive');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 31: markPlanProductionLive function exists
  console.log('Test 31: markPlanProductionLive function exists');
  try {
    assert.strictEqual(typeof byofService.markPlanProductionLive, 'function', 'Should have markPlanProductionLive');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 32: sendNotification function exists
  console.log('Test 32: sendNotification function exists');
  try {
    assert.strictEqual(typeof byofService.sendNotification, 'function', 'Should have sendNotification');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 33: getApproversForNotification function exists
  console.log('Test 33: getApproversForNotification function exists');
  try {
    assert.strictEqual(typeof byofService.getApproversForNotification, 'function', 'Should have getApproversForNotification');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 34: getPlanWithReporter function exists
  console.log('Test 34: getPlanWithReporter function exists');
  try {
    assert.strictEqual(typeof byofService.getPlanWithReporter, 'function', 'Should have getPlanWithReporter');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 35: processGitHubWebhook function exists
  console.log('Test 35: processGitHubWebhook function exists');
  try {
    assert.strictEqual(typeof byofService.processGitHubWebhook, 'function', 'Should have processGitHubWebhook');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 36: validatePrTargetBranch function exists
  console.log('Test 36: validatePrTargetBranch function exists');
  try {
    assert.strictEqual(typeof byofService.validatePrTargetBranch, 'function', 'Should have validatePrTargetBranch');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 37: validatePrTargetBranch accepts staging
  console.log('Test 37: validatePrTargetBranch accepts staging');
  try {
    const result = byofService.validatePrTargetBranch('staging');
    assert.strictEqual(result.valid, true, 'Should accept staging');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 38: validatePrTargetBranch rejects main for initial PR
  console.log('Test 38: validatePrTargetBranch rejects main for initial PR');
  try {
    const result = byofService.validatePrTargetBranch('main', false);
    assert.strictEqual(result.valid, false, 'Should reject main for initial PR');
    assert.ok(result.error, 'Should have error message');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ============================================================
  // Admin & Reporting Tests (Phase 5)
  // ============================================================
  console.log('\n=== Admin & Reporting Tests ===\n');

  // Test 39: getAllUsersWithByofRole function exists
  console.log('Test 39: getAllUsersWithByofRole function exists');
  try {
    assert.strictEqual(typeof byofService.getAllUsersWithByofRole, 'function', 'Should have getAllUsersWithByofRole');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 40: getSessionStatistics function exists
  console.log('Test 40: getSessionStatistics function exists');
  try {
    assert.strictEqual(typeof byofService.getSessionStatistics, 'function', 'Should have getSessionStatistics');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 41: getRecentActivity function exists
  console.log('Test 41: getRecentActivity function exists');
  try {
    assert.strictEqual(typeof byofService.getRecentActivity, 'function', 'Should have getRecentActivity');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 42: searchSessions function exists
  console.log('Test 42: searchSessions function exists');
  try {
    assert.strictEqual(typeof byofService.searchSessions, 'function', 'Should have searchSessions');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 43: getCompletedPlans function exists
  console.log('Test 43: getCompletedPlans function exists');
  try {
    assert.strictEqual(typeof byofService.getCompletedPlans, 'function', 'Should have getCompletedPlans');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 44: getPendingApprovals function exists
  console.log('Test 44: getPendingApprovals function exists');
  try {
    assert.strictEqual(typeof byofService.getPendingApprovals, 'function', 'Should have getPendingApprovals');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 45: getSessionsByDateRange function exists
  console.log('Test 45: getSessionsByDateRange function exists');
  try {
    assert.strictEqual(typeof byofService.getSessionsByDateRange, 'function', 'Should have getSessionsByDateRange');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 46: exportSessionData function exists
  console.log('Test 46: exportSessionData function exists');
  try {
    assert.strictEqual(typeof byofService.exportSessionData, 'function', 'Should have exportSessionData');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 47: validateSearchFilters function exists
  console.log('Test 47: validateSearchFilters function exists');
  try {
    assert.strictEqual(typeof byofService.validateSearchFilters, 'function', 'Should have validateSearchFilters');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 48: validateSearchFilters accepts valid filters
  console.log('Test 48: validateSearchFilters accepts valid filters');
  try {
    const result = byofService.validateSearchFilters({ status: 'active', type: 'bug' });
    assert.strictEqual(result.valid, true, 'Should accept valid filters');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 49: validateSearchFilters rejects invalid status
  console.log('Test 49: validateSearchFilters rejects invalid status');
  try {
    const result = byofService.validateSearchFilters({ status: 'invalid_status' });
    assert.strictEqual(result.valid, false, 'Should reject invalid status');
    assert.ok(result.error, 'Should have error message');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 50: getApprovalLog function exists
  console.log('Test 50: getApprovalLog function exists');
  try {
    assert.strictEqual(typeof byofService.getApprovalLog, 'function', 'Should have getApprovalLog');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Print summary
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
