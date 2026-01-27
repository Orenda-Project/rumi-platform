/**
 * Test: Billing Service
 *
 * P5 TDD Tests: Verify API billing/usage checks in Observability Portal
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let billingService;

async function runTests() {
  console.log('\n=== Billing Service Tests (P5) ===\n');
  let passed = 0;
  let failed = 0;

  // ============================================================
  // SERVICE EXISTENCE TESTS
  // ============================================================

  // Test 1: Service module exists
  console.log('Test 1: Billing service module exists');
  try {
    billingService = require('../services/billing.service');
    assert.ok(billingService, 'Service should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    // Can't continue without the module
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}\n`);
    console.log('TESTS FAILED - Create billing.service.js first\n');
    process.exit(1);
  }

  // Test 2: Service exports getAnthropicUsage function
  console.log('Test 2: Service exports getAnthropicUsage function');
  try {
    assert.strictEqual(typeof billingService.getAnthropicUsage, 'function', 'Should have getAnthropicUsage');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: Service exports getWhatsAppQuota function
  console.log('Test 3: Service exports getWhatsAppQuota function');
  try {
    assert.strictEqual(typeof billingService.getWhatsAppQuota, 'function', 'Should have getWhatsAppQuota');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: Service exports getOpenAIUsage function
  console.log('Test 4: Service exports getOpenAIUsage function');
  try {
    assert.strictEqual(typeof billingService.getOpenAIUsage, 'function', 'Should have getOpenAIUsage');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: Service exports getAllBillingData function
  console.log('Test 5: Service exports getAllBillingData function');
  try {
    assert.strictEqual(typeof billingService.getAllBillingData, 'function', 'Should have getAllBillingData');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ============================================================
  // FUNCTION RETURN STRUCTURE TESTS
  // ============================================================

  // Test 6: getAnthropicUsage returns structured data
  console.log('Test 6: getAnthropicUsage returns structured data');
  try {
    const result = await billingService.getAnthropicUsage();
    assert.ok(result, 'Should return result');
    assert.ok('provider' in result, 'Should have provider field');
    assert.strictEqual(result.provider, 'anthropic', 'Provider should be anthropic');
    assert.ok('available' in result, 'Should have available field');
    console.log(`  Result: available=${result.available}, status=${result.status || 'N/A'}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: getWhatsAppQuota returns structured data
  console.log('Test 7: getWhatsAppQuota returns structured data');
  try {
    const result = await billingService.getWhatsAppQuota();
    assert.ok(result, 'Should return result');
    assert.ok('provider' in result, 'Should have provider field');
    assert.strictEqual(result.provider, 'whatsapp', 'Provider should be whatsapp');
    assert.ok('available' in result, 'Should have available field');
    console.log(`  Result: available=${result.available}, tier=${result.tier || 'N/A'}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: getAllBillingData aggregates all providers
  console.log('Test 8: getAllBillingData aggregates all providers');
  try {
    const result = await billingService.getAllBillingData();
    assert.ok(result, 'Should return result');
    assert.ok('providers' in result, 'Should have providers array');
    assert.ok(Array.isArray(result.providers), 'providers should be array');
    assert.ok(result.providers.length >= 2, 'Should have at least 2 providers');
    console.log(`  Found ${result.providers.length} provider(s)`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: Low credit triggers warning flag
  console.log('Test 9: getAllBillingData includes hasWarnings flag');
  try {
    const result = await billingService.getAllBillingData();
    assert.ok('hasWarnings' in result, 'Should have hasWarnings field');
    assert.strictEqual(typeof result.hasWarnings, 'boolean', 'hasWarnings should be boolean');
    console.log(`  hasWarnings: ${result.hasWarnings}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // ============================================================
  // ROUTE AND VIEW TESTS
  // ============================================================

  // ============================================================
  // SUMMARY
  // ============================================================

  console.log('=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  if (failed > 0) {
    console.log('TESTS FAILED - Implement the missing functionality!\n');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED\n');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
