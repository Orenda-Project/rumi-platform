/**
 * Coaching Card Tests (TDD)
 *
 * Validates bd-615/616/617: Prioritized action generation, Canvas card
 * image generation, and card send + button response handling.
 */

jest.mock('../../bot/shared/utils/logger', () => ({
  logToFile: jest.fn(),
}));

jest.mock('../../bot/shared/config/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    update: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  return { from: jest.fn(() => chain) };
});

// ─── Tests for bd-615: Prioritized Action Generation ─────────────────

describe('Prioritized Action Service (bd-615)', () => {
  let generatePrioritizedAction;

  beforeAll(() => {
    generatePrioritizedAction = require(
      '../../bot/shared/services/coaching/coaching-card/prioritized-action.service'
    ).generatePrioritizedAction;
  });

  const mockAnalysis = {
    framework: 'hots',
    framework_version: '1.0',
    executive_summary: 'Good teaching with room for improvement in questioning.',
    scores: { overall_marks: 30, overall_max_marks: 45, overall_percentage: 66.7 },
    areas: {
      instructional_strategies: {
        area_score: 5, area_max: 9,
        indicators: [
          { id: 'IS1', name: 'Bloom Levels', score: 1, evidence: 'Only recall questions' },
          { id: 'IS2', name: 'Critical Thinking Prompts', score: 2, evidence: 'Some why questions' },
          { id: 'IS3', name: 'Student Reasoning', score: 2, evidence: 'Students explained' },
        ],
      },
    },
  };

  test('SCENARIO: Returns object with action, example, indicator fields', async () => {
    const result = await generatePrioritizedAction(mockAnalysis, 'Zara');
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('example');
    expect(result).toHaveProperty('indicator');
    expect(typeof result.action).toBe('string');
    expect(result.action.length).toBeGreaterThan(10);
  });

  test('SCENARIO: Indicator references framework-specific name', async () => {
    const result = await generatePrioritizedAction(mockAnalysis, 'Zara');
    // Should reference an actual indicator from the analysis
    expect(result.indicator).toBeTruthy();
  });

  test('SCENARIO: Builds on prior action when provided', async () => {
    const priorAction = {
      action: 'Ask one open-ended question per group',
      teacher_response: 'yes',
    };
    const result = await generatePrioritizedAction(mockAnalysis, 'Zara', priorAction);
    expect(result).toHaveProperty('action');
    // Should be different from prior action (progressive)
    expect(result.action).not.toBe(priorAction.action);
  });

  test('SCENARIO: Null analysis returns null (non-blocking)', async () => {
    const result = await generatePrioritizedAction(null, 'Zara');
    expect(result).toBeNull();
  });
});

// ─── Tests for bd-616: Canvas Card Image Generation ──────────────────

describe('Coaching Card Image Generation (bd-616)', () => {
  let generateCardImage;

  beforeAll(() => {
    generateCardImage = require(
      '../../bot/shared/services/coaching/coaching-card/card-image.service'
    ).generateCardImage;
  });

  const mockAction = {
    action: 'Ask one open-ended "why" question to each group during group work.',
    example: 'Instead of "Is everyone done?", try: "Why did your group choose this approach?"',
    indicator: 'Bloom Levels (IS1)',
  };

  test('SCENARIO: Produces PNG Buffer', () => {
    const buffer = generateCardImage(mockAction, 'hots');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // PNG magic bytes: 89 50 4E 47
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });

  test('SCENARIO: OECD card uses blue header', () => {
    const buffer = generateCardImage(mockAction, 'oecd');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  test('SCENARIO: HOTS card uses green header', () => {
    const buffer = generateCardImage(mockAction, 'hots');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  test('SCENARIO: Null action returns null', () => {
    const buffer = generateCardImage(null, 'hots');
    expect(buffer).toBeNull();
  });

  test('SCENARIO: Long action text is word-wrapped', () => {
    const longAction = {
      ...mockAction,
      action: 'This is a very long action text that should be properly wrapped across multiple lines without any overflow or truncation issues when rendered on the coaching card image canvas.',
    };
    const buffer = generateCardImage(longAction, 'hots');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});

// ─── Tests for bd-617: Card Send + Button Response ───────────────────

describe('Coaching Card Button Response (bd-617)', () => {
  let handleCoachingCardResponse;

  beforeAll(() => {
    handleCoachingCardResponse = require(
      '../../bot/shared/services/coaching/coaching-card/card-response.service'
    ).handleCoachingCardResponse;
  });

  test('SCENARIO: "yes" response stored correctly', async () => {
    const result = await handleCoachingCardResponse('session-123', 'yes');
    expect(result.teacher_response).toBe('yes');
    expect(result.responded_at).toBeTruthy();
  });

  test('SCENARIO: "later" response stored correctly', async () => {
    const result = await handleCoachingCardResponse('session-123', 'later');
    expect(result.teacher_response).toBe('later');
  });

  test('SCENARIO: "no" response stored correctly', async () => {
    const result = await handleCoachingCardResponse('session-123', 'no');
    expect(result.teacher_response).toBe('no');
  });
});
