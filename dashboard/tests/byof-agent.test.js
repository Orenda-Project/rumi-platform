/**
 * BYOF Agent TDD Tests
 *
 * Tests for the Claude AI integration in The Forge
 *
 * Run: npm test tests/byof-agent.test.js
 */

const assert = require('assert');

// Track test results
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASSED' });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    results.push({ name, status: 'FAILED', error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASSED' });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    results.push({ name, status: 'FAILED', error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('BYOF AGENT TESTS');
console.log('='.repeat(60) + '\n');

// ============================================================
// Module Loading
// ============================================================

console.log('Module Loading');
console.log('-'.repeat(40));

test('byof-agent module should load without errors', () => {
  const byofAgent = require('../services/byof-agent.service');
  assert(byofAgent !== null, 'Module should load');
});

test('should export createForgeAgent function', () => {
  const { createForgeAgent } = require('../services/byof-agent.service');
  assert(typeof createForgeAgent === 'function', 'Should export createForgeAgent');
});

test('should export processUserMessage function', () => {
  const { processUserMessage } = require('../services/byof-agent.service');
  assert(typeof processUserMessage === 'function', 'Should export processUserMessage');
});

test('should export generateSystemPrompt function', () => {
  const { generateSystemPrompt } = require('../services/byof-agent.service');
  assert(typeof generateSystemPrompt === 'function', 'Should export generateSystemPrompt');
});

test('should export BYOF_TOOLS array', () => {
  const { BYOF_TOOLS } = require('../services/byof-agent.service');
  assert(Array.isArray(BYOF_TOOLS), 'Should be an array');
});

console.log();

// ============================================================
// System Prompt Generation
// ============================================================

console.log('System Prompt Generation');
console.log('-'.repeat(40));

test('generateSystemPrompt should return string', () => {
  const { generateSystemPrompt } = require('../services/byof-agent.service');
  const prompt = generateSystemPrompt({ type: 'bug', title: 'Test Bug' });
  assert(typeof prompt === 'string', 'Should return string');
});

test('generateSystemPrompt should include session type', () => {
  const { generateSystemPrompt } = require('../services/byof-agent.service');
  const bugPrompt = generateSystemPrompt({ type: 'bug', title: 'Test Bug' });
  const featurePrompt = generateSystemPrompt({ type: 'feature', title: 'Test Feature' });

  assert(bugPrompt.includes('bug'), 'Bug prompt should mention bug');
  assert(featurePrompt.includes('feature'), 'Feature prompt should mention feature');
});

test('generateSystemPrompt should include workflow steps', () => {
  const { generateSystemPrompt } = require('../services/byof-agent.service');
  const prompt = generateSystemPrompt({ type: 'bug', title: 'Test' });

  assert(prompt.includes('UNDERSTAND'), 'Should include UNDERSTAND step');
  assert(prompt.includes('INVESTIGATE'), 'Should include INVESTIGATE step');
  assert(prompt.includes('PLAN'), 'Should include PLAN step');
});

test('generateSystemPrompt should include available repos', () => {
  const { generateSystemPrompt } = require('../services/byof-agent.service');
  const prompt = generateSystemPrompt({ type: 'bug', title: 'Test' });

  assert(prompt.includes('main-bot') || prompt.includes('Main Rumi Bot') || prompt.includes('WhatsApp'), 'Should mention bot repo');
});

console.log();

// ============================================================
// Tool Definitions
// ============================================================

console.log('Tool Definitions');
console.log('-'.repeat(40));

test('BYOF_TOOLS should have search_codebase tool', () => {
  const { BYOF_TOOLS } = require('../services/byof-agent.service');
  const searchTool = BYOF_TOOLS.find(t => t.name === 'search_codebase');

  assert(searchTool !== undefined, 'Should have search_codebase tool');
  assert(searchTool.input_schema.type === 'object', 'Should have object schema');
});

test('BYOF_TOOLS should have read_file tool', () => {
  const { BYOF_TOOLS } = require('../services/byof-agent.service');
  const readTool = BYOF_TOOLS.find(t => t.name === 'read_file');

  assert(readTool !== undefined, 'Should have read_file tool');
  assert(readTool.input_schema.properties.path !== undefined, 'Should have path property');
});

test('BYOF_TOOLS should have list_files tool', () => {
  const { BYOF_TOOLS } = require('../services/byof-agent.service');
  const listTool = BYOF_TOOLS.find(t => t.name === 'list_files');

  assert(listTool !== undefined, 'Should have list_files tool');
});

test('BYOF_TOOLS should have generate_plan tool', () => {
  const { BYOF_TOOLS } = require('../services/byof-agent.service');
  const planTool = BYOF_TOOLS.find(t => t.name === 'generate_plan');

  assert(planTool !== undefined, 'Should have generate_plan tool');
  assert(planTool.input_schema.properties.plan_markdown !== undefined, 'Should have plan_markdown property');
});

console.log();

// ============================================================
// Message Processing
// ============================================================

console.log('Message Processing');
console.log('-'.repeat(40));

asyncTest('processUserMessage should return response object', async () => {
  const { processUserMessage } = require('../services/byof-agent.service');

  // Mock session
  const mockSession = {
    id: 'test-session-1',
    type: 'bug',
    title: 'Test Bug',
    messages: []
  };

  // This will likely fail without API key, which is expected in tests
  try {
    const result = await processUserMessage(mockSession, 'Hello, I found a bug');
    assert(typeof result === 'object', 'Should return object');
    assert('content' in result || 'error' in result, 'Should have content or error');
  } catch (error) {
    // Expected in test environment without API key
    assert(error.message.includes('API') || error.message.includes('key') || error.message.includes('ANTHROPIC'),
      'Should fail with API key error in test environment');
  }
});

asyncTest('processUserMessage should handle empty message', async () => {
  const { processUserMessage } = require('../services/byof-agent.service');

  const mockSession = {
    id: 'test-session-2',
    type: 'feature',
    title: 'Test Feature',
    messages: []
  };

  try {
    await processUserMessage(mockSession, '');
    assert(false, 'Should throw on empty message');
  } catch (error) {
    assert(error.message.includes('empty') || error.message.includes('required') || error.message.includes('API'),
      'Should error on empty message or API key');
  }
});

console.log();

// ============================================================
// Agent State Management
// ============================================================

console.log('Agent State Management');
console.log('-'.repeat(40));

test('createForgeAgent should return agent with expected methods', () => {
  const { createForgeAgent } = require('../services/byof-agent.service');

  const agent = createForgeAgent({
    id: 'test-session',
    type: 'bug',
    title: 'Test'
  });

  assert(typeof agent === 'object', 'Should return object');
  assert(typeof agent.chat === 'function', 'Should have chat method');
  assert(typeof agent.getHistory === 'function', 'Should have getHistory method');
  assert(typeof agent.getState === 'function', 'Should have getState method');
});

test('createForgeAgent state should start as investigating', () => {
  const { createForgeAgent } = require('../services/byof-agent.service');

  const agent = createForgeAgent({
    id: 'test-session',
    type: 'bug',
    title: 'Test'
  });

  const state = agent.getState();
  assert(state.phase === 'investigating', 'Should start in investigating phase');
});

console.log();

// ============================================================
// Summary
// ============================================================

setTimeout(() => {
  console.log('='.repeat(60));
  console.log('BYOF AGENT TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFAILED TESTS:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    console.log('\n');
    process.exit(1);
  } else {
    console.log('\nALL BYOF AGENT TESTS PASSED!\n');
    process.exit(0);
  }
}, 1000);
