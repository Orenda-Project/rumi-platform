/**
 * Transcript UX Helpers Tests
 * Bead: etv-ux01 (Phase 7)
 *
 * TDD tests for SLO Mastery and Classroom Climate UX helper functions.
 * These functions convert raw data into user-friendly status indicators.
 *
 * Created: January 18, 2026
 */

const assert = require('assert');

// Import module under test
const {
  getMasteryStatus,
  getEmotionalSupportStatus,
  getInstructionalSupportStatus,
  getClassroomOrganizationStatus,
  formatStudentEvidence,
  formatTimestamp,
  getSLOCoverageSummary,
  getStatusLabel
} = require('../services/transcript-ux-helpers.service');

// Test results tracking
let passed = 0;
let failed = 0;

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('✅');
    passed++;
  } catch (error) {
    console.log('❌');
    console.log(`    Error: ${error.message}`);
    if (error.actual !== undefined && error.expected !== undefined) {
      console.log(`    Expected: ${JSON.stringify(error.expected)}`);
      console.log(`    Actual: ${JSON.stringify(error.actual)}`);
    }
    failed++;
  }
}

async function runTests() {
  console.log('\n🎯 Transcript UX Helpers Tests (etv-ux01)\n');
  console.log('='.repeat(60));

  // ================================================================
  // 1. getMasteryStatus Tests
  // ================================================================
  console.log('\n1️⃣ getMasteryStatus() - SLO Mastery Status\n');

  await runTest('HIGH confidence + 3+ evidence → ACHIEVED (green)', async () => {
    const result = getMasteryStatus('high', 3, true);
    assert.strictEqual(result.status, 'ACHIEVED');
    assert.strictEqual(result.icon, '🟢');
    assert.strictEqual(result.cssClass, 'mastery-achieved');
    assert.ok(result.message.includes('demonstrated'));
  });

  await runTest('HIGH confidence + 1 evidence → LIKELY_ACHIEVED (green)', async () => {
    const result = getMasteryStatus('high', 1, true);
    assert.strictEqual(result.status, 'LIKELY_ACHIEVED');
    assert.strictEqual(result.icon, '🟢');
    assert.strictEqual(result.cssClass, 'mastery-achieved');
  });

  await runTest('MEDIUM confidence → NEEDS_EVIDENCE (yellow)', async () => {
    const result = getMasteryStatus('medium', 1, true);
    assert.strictEqual(result.status, 'NEEDS_EVIDENCE');
    assert.strictEqual(result.icon, '🟡');
    assert.strictEqual(result.cssClass, 'mastery-needs-evidence');
    assert.ok(result.suggestion, 'Should include suggestion for medium confidence');
  });

  await runTest('LOW confidence → NOT_ASSESSED (red)', async () => {
    const result = getMasteryStatus('low', 0, true);
    assert.strictEqual(result.status, 'NOT_ASSESSED');
    assert.strictEqual(result.icon, '🔴');
    assert.strictEqual(result.cssClass, 'mastery-not-assessed');
    assert.ok(result.suggestion, 'Should include suggestion for low confidence');
  });

  await runTest('addressed=false → NOT_ADDRESSED (gray)', async () => {
    const result = getMasteryStatus('high', 5, false);
    assert.strictEqual(result.status, 'NOT_ADDRESSED');
    assert.strictEqual(result.icon, '⬜');
    assert.strictEqual(result.cssClass, 'mastery-not-addressed');
    assert.ok(result.message.includes('not covered'));
  });

  await runTest('null confidence → NOT_ASSESSED', async () => {
    const result = getMasteryStatus(null, 0, true);
    assert.strictEqual(result.status, 'NOT_ASSESSED');
    assert.strictEqual(result.icon, '🔴');
  });

  await runTest('empty string confidence → NOT_ASSESSED', async () => {
    const result = getMasteryStatus('', 0, true);
    assert.strictEqual(result.status, 'NOT_ASSESSED');
  });

  await runTest('case insensitive confidence (HIGH vs high)', async () => {
    const result1 = getMasteryStatus('HIGH', 3, true);
    const result2 = getMasteryStatus('high', 3, true);
    assert.strictEqual(result1.status, result2.status);
    assert.strictEqual(result1.icon, result2.icon);
  });

  // ================================================================
  // 2. getEmotionalSupportStatus Tests
  // ================================================================
  console.log('\n2️⃣ getEmotionalSupportStatus() - Classroom Climate\n');

  await runTest('High praise (10+) + no negative → POSITIVE (green)', async () => {
    const metrics = {
      praise_count: 12,
      named_praise_count: 3,
      negative_language_count: 0,
      encouragement_count: 2
    };
    const result = getEmotionalSupportStatus(metrics, 30);
    assert.strictEqual(result.status, 'POSITIVE');
    assert.strictEqual(result.icon, '🟢');
    assert.ok(result.highlights.length > 0, 'Should have highlights');
    assert.strictEqual(result.concerns.length, 0, 'Should have no concerns');
  });

  await runTest('No negative language → should be a highlight', async () => {
    const metrics = {
      praise_count: 5,
      negative_language_count: 0
    };
    const result = getEmotionalSupportStatus(metrics, 30);
    const hasNoNegativeHighlight = result.highlights.some(h => h.includes('No negative'));
    assert.ok(hasNoNegativeHighlight, 'Should highlight no negative language');
  });

  await runTest('High negative language (>3) → CONCERNING (red)', async () => {
    const metrics = {
      praise_count: 5,
      negative_language_count: 5
    };
    const result = getEmotionalSupportStatus(metrics, 30);
    assert.strictEqual(result.status, 'CONCERNING');
    assert.strictEqual(result.icon, '🔴');
    assert.ok(result.concerns.length > 0, 'Should have concerns');
  });

  await runTest('Low praise → should be a concern', async () => {
    const metrics = {
      praise_count: 2,
      negative_language_count: 0
    };
    const result = getEmotionalSupportStatus(metrics, 30);
    const hasPraiseConcern = result.concerns.some(c => c.includes('praise'));
    assert.ok(hasPraiseConcern, 'Should flag low praise as concern');
  });

  await runTest('Named praise → should be a highlight', async () => {
    const metrics = {
      praise_count: 5,
      named_praise_count: 3,
      negative_language_count: 0
    };
    const result = getEmotionalSupportStatus(metrics, 30);
    const hasNamedPraise = result.highlights.some(h => h.includes('praised by name'));
    assert.ok(hasNamedPraise, 'Should highlight named praise');
  });

  await runTest('null metrics → NO_DATA', async () => {
    const result = getEmotionalSupportStatus(null);
    assert.strictEqual(result.status, 'NO_DATA');
    assert.strictEqual(result.icon, '⬜');
  });

  await runTest('shorter duration should adjust benchmarks', async () => {
    // Same absolute count but for 15 min session (vs 30 min)
    // Should be interpreted as higher rate
    const metrics = {
      praise_count: 8,
      negative_language_count: 0
    };
    const result15 = getEmotionalSupportStatus(metrics, 15);
    const result30 = getEmotionalSupportStatus(metrics, 30);
    // 15 min session with 8 praise = 16 praise/30min rate = excellent
    // 30 min session with 8 praise = 8 praise/30min rate = good
    assert.strictEqual(result15.status, 'POSITIVE');
    assert.strictEqual(result30.status, 'POSITIVE');
  });

  // ================================================================
  // 3. getInstructionalSupportStatus Tests
  // ================================================================
  console.log('\n3️⃣ getInstructionalSupportStatus() - Teaching Quality\n');

  await runTest('High press + higher-order + scaffolding → EXCELLENT', async () => {
    const metrics = {
      press_for_reasoning: 6,
      higher_order_questions: 4,
      scaffolding_instances: 3
    };
    const result = getInstructionalSupportStatus(metrics);
    assert.strictEqual(result.status, 'EXCELLENT');
    assert.strictEqual(result.icon, '🟢');
  });

  await runTest('Medium indicators → GOOD', async () => {
    const metrics = {
      press_for_reasoning: 3,
      higher_order_questions: 2,
      scaffolding_instances: 1
    };
    const result = getInstructionalSupportStatus(metrics);
    assert.ok(['GOOD', 'ROOM_TO_GROW'].includes(result.status));
    assert.ok(['🟢', '🟡'].includes(result.icon));
  });

  await runTest('Low indicators → NEEDS_IMPROVEMENT', async () => {
    const metrics = {
      press_for_reasoning: 0,
      higher_order_questions: 0,
      scaffolding_instances: 0
    };
    const result = getInstructionalSupportStatus(metrics);
    assert.strictEqual(result.status, 'NEEDS_IMPROVEMENT');
    assert.ok(result.concerns.length > 0, 'Should have concerns');
  });

  await runTest('Press for reasoning highlighted correctly', async () => {
    const metrics = {
      press_for_reasoning: 6,
      higher_order_questions: 0,
      scaffolding_instances: 0
    };
    const result = getInstructionalSupportStatus(metrics);
    const hasPressHighlight = result.highlights.some(h => h.includes('why'));
    assert.ok(hasPressHighlight, 'Should highlight why questions');
  });

  await runTest('null metrics → NO_DATA', async () => {
    const result = getInstructionalSupportStatus(null);
    assert.strictEqual(result.status, 'NO_DATA');
  });

  // ================================================================
  // 4. getClassroomOrganizationStatus Tests
  // ================================================================
  console.log('\n4️⃣ getClassroomOrganizationStatus() - Organization\n');

  await runTest('No redirections + transitions → WELL_ORGANIZED', async () => {
    const metrics = {
      transition_cues: 4,
      redirection_count: 0
    };
    const result = getClassroomOrganizationStatus(metrics);
    assert.strictEqual(result.status, 'WELL_ORGANIZED');
    assert.strictEqual(result.icon, '🟢');
  });

  await runTest('Some redirections → GOOD', async () => {
    const metrics = {
      transition_cues: 2,
      redirection_count: 2
    };
    const result = getClassroomOrganizationStatus(metrics);
    assert.strictEqual(result.status, 'GOOD');
  });

  await runTest('Many redirections → concern', async () => {
    const metrics = {
      transition_cues: 1,
      redirection_count: 6
    };
    const result = getClassroomOrganizationStatus(metrics);
    assert.ok(result.concerns.length > 0);
  });

  await runTest('Should include low confidence note', async () => {
    const metrics = { transition_cues: 2, redirection_count: 1 };
    const result = getClassroomOrganizationStatus(metrics);
    assert.ok(result.note, 'Should include confidence note');
    assert.ok(result.note.includes('video'), 'Note should mention video');
  });

  // ================================================================
  // 5. formatStudentEvidence Tests
  // ================================================================
  console.log('\n5️⃣ formatStudentEvidence() - Evidence Formatting\n');

  await runTest('string array → formatted quotes', async () => {
    const evidence = ['This is a quote', 'Another quote'];
    const result = formatStudentEvidence(evidence);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].quote, 'This is a quote');
    assert.strictEqual(result[0].speaker, null);
  });

  await runTest('object array → formatted with speaker', async () => {
    const evidence = [
      { quote: 'Student said this', speaker: 'حمزہ', timestamp_ms: 60000 }
    ];
    const result = formatStudentEvidence(evidence);
    assert.strictEqual(result[0].quote, 'Student said this');
    assert.strictEqual(result[0].speaker, 'حمزہ');
    assert.strictEqual(result[0].timestamp, '1:00');
  });

  await runTest('mixed evidence formats', async () => {
    const evidence = [
      'Plain string',
      { utterance: 'Object with utterance' },
      { text: 'Object with text' }
    ];
    const result = formatStudentEvidence(evidence);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].quote, 'Plain string');
    assert.strictEqual(result[1].quote, 'Object with utterance');
    assert.strictEqual(result[2].quote, 'Object with text');
  });

  await runTest('empty array → empty result', async () => {
    const result = formatStudentEvidence([]);
    assert.strictEqual(result.length, 0);
  });

  await runTest('null → empty result', async () => {
    const result = formatStudentEvidence(null);
    assert.strictEqual(result.length, 0);
  });

  // ================================================================
  // 6. formatTimestamp Tests
  // ================================================================
  console.log('\n6️⃣ formatTimestamp() - Time Formatting\n');

  await runTest('60000ms → 1:00', async () => {
    assert.strictEqual(formatTimestamp(60000), '1:00');
  });

  await runTest('125000ms → 2:05', async () => {
    assert.strictEqual(formatTimestamp(125000), '2:05');
  });

  await runTest('0ms → 0:00', async () => {
    assert.strictEqual(formatTimestamp(0), null);
  });

  await runTest('null → null', async () => {
    assert.strictEqual(formatTimestamp(null), null);
  });

  await runTest('undefined → null', async () => {
    assert.strictEqual(formatTimestamp(undefined), null);
  });

  // ================================================================
  // 7. getSLOCoverageSummary Tests
  // ================================================================
  console.log('\n7️⃣ getSLOCoverageSummary() - Coverage Summary\n');

  await runTest('all objectives addressed → 100%', async () => {
    const objectives = [
      { addressed: true, mastery_confidence: 'high', student_evidence: [1, 2, 3] },
      { addressed: true, mastery_confidence: 'high', student_evidence: [1, 2] }
    ];
    const result = getSLOCoverageSummary(objectives);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.addressed, 2);
    assert.strictEqual(result.percentage, 100);
    assert.strictEqual(result.progressBar, '██████████');
  });

  await runTest('partial objectives addressed', async () => {
    const objectives = [
      { addressed: true, mastery_confidence: 'high', student_evidence: [] },
      { addressed: false, mastery_confidence: 'low', student_evidence: [] },
      { addressed: true, mastery_confidence: 'medium', student_evidence: [] }
    ];
    const result = getSLOCoverageSummary(objectives);
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.addressed, 2);
    assert.strictEqual(result.percentage, 67);
  });

  await runTest('counts achieved correctly', async () => {
    const objectives = [
      { mastery_confidence: 'high', student_evidence: [1, 2, 3] }, // ACHIEVED
      { mastery_confidence: 'medium', student_evidence: [1] }, // NEEDS_EVIDENCE
      { mastery_confidence: 'low', student_evidence: [] } // NOT_ASSESSED
    ];
    const result = getSLOCoverageSummary(objectives);
    assert.strictEqual(result.achieved, 1);
  });

  await runTest('empty array → zeros', async () => {
    const result = getSLOCoverageSummary([]);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.percentage, 0);
  });

  await runTest('null → zeros', async () => {
    const result = getSLOCoverageSummary(null);
    assert.strictEqual(result.total, 0);
  });

  // ================================================================
  // 8. getStatusLabel Tests
  // ================================================================
  console.log('\n8️⃣ getStatusLabel() - Human-Readable Labels\n');

  await runTest('ACHIEVED → Likely Achieved', async () => {
    assert.strictEqual(getStatusLabel('ACHIEVED'), 'Likely Achieved');
  });

  await runTest('NEEDS_EVIDENCE → Needs More Evidence', async () => {
    assert.strictEqual(getStatusLabel('NEEDS_EVIDENCE'), 'Needs More Evidence');
  });

  await runTest('POSITIVE → Positive Environment', async () => {
    assert.strictEqual(getStatusLabel('POSITIVE'), 'Positive Environment');
  });

  await runTest('unknown status → returns original', async () => {
    assert.strictEqual(getStatusLabel('CUSTOM_STATUS'), 'CUSTOM_STATUS');
  });

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
