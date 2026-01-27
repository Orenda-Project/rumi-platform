/**
 * Test: AMA Service - Schema Validation
 *
 * TDD Tests for AMA schema hallucination prevention
 * These tests verify column validation, blocking behavior, and retry mechanisms
 */

require('dotenv').config();
const assert = require('assert');

let AMAService;

async function runTests() {
  console.log('\n=== AMA Service Schema Validation Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Service module exists
  console.log('Test 1: AMA Service module exists');
  try {
    AMAService = require('../services/ama.service');
    assert.ok(AMAService, 'Service should exist');
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

  // Test 2: validateSQL function exists
  console.log('Test 2: validateSQL function exists');
  try {
    assert.strictEqual(typeof AMAService.validateSQL, 'function', 'Should have validateSQL');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: validateColumnsExist function exists
  console.log('Test 3: validateColumnsExist function exists');
  try {
    assert.strictEqual(typeof AMAService.validateColumnsExist, 'function', 'Should have validateColumnsExist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: parseError function exists
  console.log('Test 4: parseError function exists');
  try {
    assert.strictEqual(typeof AMAService.parseError, 'function', 'Should have parseError');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: validateSQL blocks dangerous keywords
  console.log('Test 5: validateSQL blocks dangerous keywords');
  try {
    const dangerousQueries = [
      'DROP TABLE users',
      'DELETE FROM users WHERE 1=1',
      'INSERT INTO users (name) VALUES ("hacker")',
      'UPDATE users SET role = "admin"',
      'TRUNCATE users'
    ];

    for (const sql of dangerousQueries) {
      const result = AMAService.validateSQL(sql);
      assert.strictEqual(result.isValid, false, `Should block: ${sql}`);
    }
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: validateSQL allows safe SELECT queries
  console.log('Test 6: validateSQL allows safe SELECT queries');
  try {
    const safeQueries = [
      'SELECT * FROM users',
      'SELECT COUNT(*) FROM lesson_plans WHERE user_id = $1',
      'SELECT u.name, COUNT(lp.id) FROM users u JOIN lesson_plans lp ON u.id = lp.user_id GROUP BY u.name'
    ];

    for (const sql of safeQueries) {
      const result = AMAService.validateSQL(sql);
      assert.strictEqual(result.isValid, true, `Should allow: ${sql}`);
    }
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: validateColumnsExist detects invalid columns
  console.log('Test 7: validateColumnsExist detects invalid columns');
  try {
    // Mock schema with known tables and columns
    const mockSchema = {
      users: [
        { name: 'id', type: 'uuid' },
        { name: 'phone_number', type: 'varchar' },
        { name: 'name', type: 'varchar' },
        { name: 'created_at', type: 'timestamp' }
      ],
      website_visits: [
        { name: 'id', type: 'uuid' },
        { name: 'session_id', type: 'varchar' },
        { name: 'created_at', type: 'timestamp' }
        // NOTE: message_count does NOT exist here
      ],
      chat_sessions: [
        { name: 'id', type: 'uuid' },
        { name: 'user_id', type: 'uuid' },
        { name: 'message_count', type: 'integer' },
        { name: 'created_at', type: 'timestamp' }
      ]
    };

    // This query uses a non-existent column (message_count on website_visits)
    const invalidSql = 'SELECT wv.message_count FROM website_visits wv';
    const result = AMAService.validateColumnsExist(invalidSql, mockSchema);

    // Should detect the invalid column
    assert.strictEqual(result.isValid, false, 'Should detect invalid column wv.message_count');
    assert.ok(result.invalidColumns && result.invalidColumns.length > 0, 'Should list invalid columns');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: validateColumnsExist allows valid columns
  console.log('Test 8: validateColumnsExist allows valid columns');
  try {
    const mockSchema = {
      users: [
        { name: 'id', type: 'uuid' },
        { name: 'phone_number', type: 'varchar' },
        { name: 'name', type: 'varchar' }
      ],
      chat_sessions: [
        { name: 'id', type: 'uuid' },
        { name: 'user_id', type: 'uuid' },
        { name: 'message_count', type: 'integer' }
      ]
    };

    // Valid query using correct columns
    const validSql = 'SELECT cs.message_count FROM chat_sessions cs JOIN users u ON u.id = cs.user_id';
    const result = AMAService.validateColumnsExist(validSql, mockSchema);

    assert.strictEqual(result.isValid, true, 'Should allow valid columns');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: parseError provides helpful suggestions for column errors
  console.log('Test 9: parseError provides helpful suggestions for column errors');
  try {
    const errorMessage = 'column wv.message_count does not exist';
    const result = AMAService.parseError(errorMessage);

    assert.ok(result.originalError, 'Should include original error');
    assert.ok(result.suggestion, 'Should provide suggestion');
    assert.ok(result.suggestion.includes('message_count'), 'Suggestion should mention the column');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: DATABASE_SCHEMA includes website_visits full columns
  console.log('Test 10: DATABASE_SCHEMA includes website_visits with correct columns');
  try {
    // Access the module's internal schema (we'll need to export it or check indirectly)
    // For now, verify via a method or by checking the system prompt contains the info
    const schemaSource = require('fs').readFileSync(
      require('path').join(__dirname, '../services/ama.service.js'),
      'utf8'
    );

    // Check that website_visits schema is documented and does NOT include message_count
    assert.ok(
      schemaSource.includes('website_visits'),
      'Schema should include website_visits table'
    );

    // Check for the negative example warning
    assert.ok(
      schemaSource.includes('message_count') &&
      (schemaSource.includes('chat_sessions') || schemaSource.includes('ama_conversations')),
      'Schema should document that message_count is in chat_sessions/ama_conversations'
    );

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: NEGATIVE_EXAMPLES section exists to prevent hallucinations
  console.log('Test 11: NEGATIVE_EXAMPLES section exists');
  try {
    const schemaSource = require('fs').readFileSync(
      require('path').join(__dirname, '../services/ama.service.js'),
      'utf8'
    );

    // Check for explicit negative examples / hallucination warnings
    const hasNegativeExamples =
      schemaSource.includes('DO NOT') ||
      schemaSource.includes('DOES NOT EXIST') ||
      schemaSource.includes('WRONG') ||
      schemaSource.includes('HALLUCINATION');

    assert.ok(hasNegativeExamples, 'Should have negative examples or hallucination warnings');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: Schema includes chat_starts table (commonly missed)
  console.log('Test 12: DATABASE_SCHEMA includes chat_starts table');
  try {
    const schemaSource = require('fs').readFileSync(
      require('path').join(__dirname, '../services/ama.service.js'),
      'utf8'
    );

    assert.ok(
      schemaSource.includes('chat_starts'),
      'Schema should include chat_starts table for funnel queries'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: retryWithSchemaHint function exists
  console.log('Test 13: retryWithSchemaHint function exists');
  try {
    assert.strictEqual(
      typeof AMAService.retryWithSchemaHint,
      'function',
      'Should have retryWithSchemaHint for schema-aware retries'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: extractColumnReferences function exists
  console.log('Test 14: extractColumnReferences function exists');
  try {
    assert.strictEqual(
      typeof AMAService.extractColumnReferences,
      'function',
      'Should have extractColumnReferences for parsing SQL'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 15: extractColumnReferences correctly parses aliased columns
  console.log('Test 15: extractColumnReferences parses aliased columns');
  try {
    const sql = 'SELECT wv.session_id, u.name, cs.message_count FROM website_visits wv JOIN users u ON wv.user_id = u.id JOIN chat_sessions cs ON cs.user_id = u.id';
    const refs = AMAService.extractColumnReferences(sql);

    // Should find: wv.session_id, u.name, cs.message_count, wv.user_id, u.id, cs.user_id
    assert.ok(Array.isArray(refs), 'Should return array');
    assert.ok(refs.length >= 3, 'Should find multiple column references');

    // Check specific references
    const hasWvSessionId = refs.some(r => r.alias === 'wv' && r.column === 'session_id');
    const hasCsMessageCount = refs.some(r => r.alias === 'cs' && r.column === 'message_count');

    assert.ok(hasWvSessionId, 'Should find wv.session_id');
    assert.ok(hasCsMessageCount, 'Should find cs.message_count');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  if (failed > 0) {
    console.log('TESTS FAILED - Some features need implementation\n');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED\n');
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
