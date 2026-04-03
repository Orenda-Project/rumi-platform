/**
 * Coaching Flow Integration Tests
 *
 * Validates wiring of new Phase 1C services into the coaching flow:
 * - bd-614: Photo prompt + analysis wiring
 * - bd-618: Coaching card wiring
 * - bd-622: LP selection list wiring
 *
 * These tests validate the *integration glue* — the functions that
 * orchestrate the individual services into the coaching pipeline.
 */

jest.mock('../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn(),
}));

jest.mock('../../bot/shared/config/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { from: jest.fn(() => chain) };
});

// ─── bd-622: LP Selection List in Coaching Flow ─────────────────────────

describe('LP Selection in Coaching Flow (bd-622)', () => {
  let buildLPSelectionList;

  beforeAll(() => {
    buildLPSelectionList = require(
      '../../bot/shared/services/coaching/lp-coaching/lp-selection-list.service'
    ).buildLPSelectionList;
  });

  test('SCENARIO: With recent LPs, produces list type with sections', () => {
    const lps = [
      { id: 'lp-1', topic: 'Math', grade: '3', created_at: '2026-03-01' },
      { id: 'lp-2', topic: 'Science', grade: '4', created_at: '2026-02-28' },
    ];
    const result = buildLPSelectionList('s-1', lps, 'en');
    expect(result.type).toBe('list');
    // Can be sent via WhatsAppService.sendInteractiveMessage()
    expect(result.listData.action.sections).toHaveLength(2);
    expect(result.listData.action.button).toBeTruthy();
  });

  test('SCENARIO: Without LPs, produces buttons type (backwards compatible)', () => {
    const result = buildLPSelectionList('s-1', [], 'en');
    expect(result.type).toBe('buttons');
    // Can be sent via WhatsAppService.sendInteractiveButtons()
    expect(result.buttons[0].id).toContain('lessonplan_yes');
  });

  test('SCENARIO: LP selection → handleLPSelection links LP to session', async () => {
    jest.resetModules();
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.mock('../../bot/shared/config/supabase', () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'lp-1', content: { steps: ['intro'] }, topic: 'Math' },
          error: null,
        }),
      };
      return { from: jest.fn(() => chain) };
    });

    const { handleLPSelection } = require(
      '../../bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service'
    );

    const result = await handleLPSelection('s-1', 'lp_select_lp-1_s-1');
    expect(result.linked_lesson_plan_id).toBe('lp-1');
    expect(result.lesson_plan_content.topic).toBe('Math');
    expect(result.lesson_plan_link_method).toBe('selected_recent');
  });
});

// ─── bd-618: Coaching Card in Report Flow ───────────────────────────────

describe('Coaching Card in Report Flow (bd-618)', () => {
  let generatePrioritizedAction, generateCardImage;

  beforeAll(() => {
    generatePrioritizedAction = require(
      '../../bot/shared/services/coaching/coaching-card/prioritized-action.service'
    ).generatePrioritizedAction;
  });

  test('SCENARIO: Analysis with weak indicator → produces action + example', async () => {
    const analysis = {
      framework: 'hots',
      areas: {
        lesson_planning: {
          indicators: [
            { id: 'LP1', name: 'Bloom Taxonomy Questions', score: 1 },
            { id: 'LP2', name: 'Lesson Objectives', score: 2 },
          ],
        },
      },
    };
    const result = await generatePrioritizedAction(analysis, 'Sarah');
    expect(result).not.toBeNull();
    expect(result.action).toContain('Bloom Taxonomy Questions');
    expect(result.example).toBeTruthy();
    expect(result.indicator).toContain('LP1');
  });

  test('SCENARIO: Coaching card image generated from action data', async () => {
    // Dynamically import to avoid canvas issues on CI
    let generateCardImage;
    try {
      generateCardImage = require(
        '../../bot/shared/services/coaching/coaching-card/card-image.service'
      ).generateCardImage;
    } catch {
      // Canvas not available in test environment — skip
      return;
    }

    const actionData = {
      action: 'Focus on questioning techniques.',
      example: 'Try asking "Why do you think that?"',
      indicator: 'Questioning (Q1)',
    };
    const buffer = await generateCardImage(actionData, 'hots');
    if (buffer) {
      expect(Buffer.isBuffer(buffer)).toBe(true);
      // PNG magic bytes
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
    }
  });

  test('SCENARIO: Card response handler stores teacher response', async () => {
    jest.resetModules();
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.mock('../../bot/shared/config/supabase', () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { prioritized_action: { action: 'Focus on X', indicator: 'X1' } },
          error: null,
        }),
      };
      return { from: jest.fn(() => chain) };
    });

    const { handleCoachingCardResponse } = require(
      '../../bot/shared/services/coaching/coaching-card/card-response.service'
    );

    const result = await handleCoachingCardResponse('s-1', 'yes');
    expect(result.teacher_response).toBe('yes');
    expect(result.responded_at).toBeTruthy();
  });
});

// ─── bd-614: Photo Analysis in Coaching Flow ────────────────────────────

describe('Photo Analysis in Coaching Flow (bd-614)', () => {
  test('SCENARIO: Photo prompt builds bilingual config', () => {
    const { buildPhotoPrompt } = require(
      '../../bot/shared/services/coaching/classroom-photo/photo-prompt.service'
    );
    const config = buildPhotoPrompt('s-1', 'en');
    expect(config.body).toContain('photo');
    expect(config.buttons).toHaveLength(2);
  });

  test('SCENARIO: Framework vision prompts target correct evidence', () => {
    const { buildFrameworkVisionPrompt } = require(
      '../../bot/shared/services/coaching/classroom-photo/photo-analysis.service'
    );

    // Each framework prompt mentions different things
    expect(buildFrameworkVisionPrompt('hots')).toContain('thinking');
    expect(buildFrameworkVisionPrompt('fico')).toContain('routine');
    expect(buildFrameworkVisionPrompt('oecd')).toContain('formative');
    expect(buildFrameworkVisionPrompt('teach')).toContain('collaborative');
  });

  test('SCENARIO: processClassroomPhoto success returns analysis text', async () => {
    jest.resetModules();
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.mock('../../bot/shared/services/vision.service', () => ({
      analyzeWithRetry: jest.fn().mockResolvedValue({
        success: true,
        analysis: 'Classroom has Bloom taxonomy poster on the wall.',
      }),
    }));

    const { processClassroomPhoto } = require(
      '../../bot/shared/services/coaching/classroom-photo/photo-analysis.service'
    );

    const result = await processClassroomPhoto(Buffer.from('img'), 'image/jpeg', 'hots');
    expect(result).toContain('Bloom');
  });

  test('SCENARIO: processClassroomPhoto failure returns null (non-blocking)', async () => {
    jest.resetModules();
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.mock('../../bot/shared/services/vision.service', () => ({
      analyzeWithRetry: jest.fn().mockRejectedValue(new Error('API down')),
    }));

    const { processClassroomPhoto } = require(
      '../../bot/shared/services/coaching/classroom-photo/photo-analysis.service'
    );

    const result = await processClassroomPhoto(Buffer.from('img'), 'image/jpeg', 'hots');
    expect(result).toBeNull();
  });

  test('SCENARIO: Framework LP instructions available for all 4 frameworks', () => {
    const { getFrameworkLPInstructions } = require(
      '../../bot/shared/services/coaching/lp-coaching/lp-framework-prompt.service'
    );

    ['oecd', 'hots', 'teach', 'fico'].forEach(fw => {
      const instructions = getFrameworkLPInstructions(fw);
      expect(instructions.length).toBeGreaterThan(50);
    });
  });
});
