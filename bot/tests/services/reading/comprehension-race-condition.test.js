/**
 * Bug 5 Regression Test: Race Condition in Comprehension Flow
 *
 * This test verifies that startFlow() is called BEFORE _sendComprehensionQuestion()
 * to prevent race conditions where fast voice responses miss the active flow status.
 *
 * The bug: When a user sends a voice message immediately after receiving a
 * comprehension question, the message would go to general conversation because
 * the database status wasn't set yet.
 *
 * The fix: Reorder operations so status is set before the question is sent.
 */

const fs = require('fs');
const path = require('path');

describe('Bug 5: Comprehension Race Condition Fix', () => {
  let analysisServiceCode;

  beforeAll(() => {
    // Read the actual source code
    const filePath = path.join(__dirname, '../../../shared/services/reading/analysis.service.js');
    analysisServiceCode = fs.readFileSync(filePath, 'utf8');
  });

  test('startFlow() should be called BEFORE _sendComprehensionQuestion() in startComprehensionFlow', () => {
    // Find the startComprehensionFlow method
    const methodMatch = analysisServiceCode.match(
      /static\s+async\s+startComprehensionFlow\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}static|\n\}$)/
    );

    expect(methodMatch).toBeTruthy();
    const methodCode = methodMatch[0];

    // Find positions of the two critical calls
    const startFlowCall = methodCode.search(/RedisComprehensionService\.startFlow\s*\(/);
    const sendQuestionCall = methodCode.search(/this\._sendComprehensionQuestion\s*\(|_sendComprehensionQuestion\s*\(/);

    // Both calls should exist
    expect(startFlowCall).toBeGreaterThan(-1);
    expect(sendQuestionCall).toBeGreaterThan(-1);

    // startFlow must come BEFORE sendQuestion (Bug 5 fix)
    expect(startFlowCall).toBeLessThan(sendQuestionCall);
  });

  test('startFlow() should not be inside a callback or after an await that sends messages', () => {
    // Find startComprehensionFlow method
    const methodMatch = analysisServiceCode.match(
      /static\s+async\s+startComprehensionFlow\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}static|\n\}$)/
    );

    const methodCode = methodMatch[0];

    // Find all await statements before startFlow
    const startFlowPos = methodCode.search(/RedisComprehensionService\.startFlow\s*\(/);
    const codeBeforeStartFlow = methodCode.substring(0, startFlowPos);

    // Should NOT have sendMessage or _sendComprehensionQuestion before startFlow
    const sendMessageBeforeStartFlow = codeBeforeStartFlow.includes('await WhatsAppService.sendMessage') &&
      codeBeforeStartFlow.includes('_sendComprehensionQuestion');

    expect(sendMessageBeforeStartFlow).toBe(false);
  });

  test('comprehension question is sent after flow status is set', () => {
    // This ensures the user can respond immediately and the flow will be found
    const methodMatch = analysisServiceCode.match(
      /static\s+async\s+startComprehensionFlow\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}static|\n\}$)/
    );

    const methodCode = methodMatch[0];

    // Extract the sequence of awaited operations
    const awaitPattern = /await\s+([^;]+);/g;
    const awaits = [];
    let match;
    while ((match = awaitPattern.exec(methodCode)) !== null) {
      awaits.push(match[1].trim());
    }

    // Find indices
    const startFlowIndex = awaits.findIndex(a => a.includes('RedisComprehensionService.startFlow'));
    const sendQuestionIndex = awaits.findIndex(a => a.includes('_sendComprehensionQuestion'));

    // startFlow should come before sendQuestion in the await sequence
    if (startFlowIndex !== -1 && sendQuestionIndex !== -1) {
      expect(startFlowIndex).toBeLessThan(sendQuestionIndex);
    }
  });
});

describe('Comprehension Flow Order Verification', () => {
  test('intro message, then startFlow, then question - correct sequence', () => {
    const filePath = path.join(__dirname, '../../../shared/services/reading/analysis.service.js');
    const code = fs.readFileSync(filePath, 'utf8');

    // Look for the pattern in startComprehensionFlow
    // Correct order: introMessage -> startFlow -> _sendComprehensionQuestion
    const correctPattern = /sendMessage[^;]+introMessage[\s\S]*?startFlow[\s\S]*?_sendComprehensionQuestion/;

    expect(correctPattern.test(code)).toBe(true);
  });
});
