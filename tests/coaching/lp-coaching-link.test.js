/**
 * LP-Coaching Integration Tests (TDD)
 *
 * Validates bd-619/620/621: LP selection list, LP linking,
 * framework-aware LP generation prompts.
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

// ─── Tests for bd-619: LP Selection List Builder ────────────────────────

describe('LP Selection List Builder (bd-619)', () => {
  let buildLPSelectionList;

  beforeAll(() => {
    buildLPSelectionList = require(
      '../../bot/shared/services/coaching/lp-coaching/lp-selection-list.service'
    ).buildLPSelectionList;
  });

  test('SCENARIO: Teacher with 3+ LPs gets interactive list with recent LPs', () => {
    const recentLPs = [
      { id: 'lp-1', topic: 'Photosynthesis', grade: '5', created_at: '2026-03-01' },
      { id: 'lp-2', topic: 'Fractions', grade: '4', created_at: '2026-02-28' },
      { id: 'lp-3', topic: 'Urdu Poetry', grade: '6', created_at: '2026-02-27' },
    ];

    const result = buildLPSelectionList('session-abc', recentLPs, 'en');
    expect(result.type).toBe('list');
    expect(result.listData.action.sections).toBeDefined();

    // LP rows should be present
    const lpSection = result.listData.action.sections.find(s => s.title === 'Recent Lesson Plans');
    expect(lpSection.rows.length).toBe(3);
  });

  test('SCENARIO: Teacher with 0 LPs gets simple Yes/No buttons (fallback)', () => {
    const result = buildLPSelectionList('session-abc', [], 'en');
    expect(result.type).toBe('buttons');
    expect(result.buttons).toHaveLength(2);
    expect(result.buttons[0].id).toContain('lessonplan_yes');
    expect(result.buttons[1].id).toContain('lessonplan_no');
  });

  test('SCENARIO: List includes "Upload new" and "No LP" options', () => {
    const recentLPs = [
      { id: 'lp-1', topic: 'Photosynthesis', grade: '5', created_at: '2026-03-01' },
    ];

    const result = buildLPSelectionList('session-abc', recentLPs, 'en');
    const allRows = result.listData.action.sections.flatMap(s => s.rows);
    const uploadRow = allRows.find(r => r.id.includes('lp_upload'));
    const noneRow = allRows.find(r => r.id.includes('lp_none'));
    expect(uploadRow).toBeDefined();
    expect(noneRow).toBeDefined();
  });

  test('SCENARIO: LP titles truncated to 24 chars, descriptions to 72 chars', () => {
    const recentLPs = [
      {
        id: 'lp-1',
        topic: 'Advanced Photosynthesis and Cellular Respiration in Plants',
        grade: '5',
        created_at: '2026-03-01',
      },
    ];

    const result = buildLPSelectionList('session-abc', recentLPs, 'en');
    const lpSection = result.listData.action.sections.find(s => s.title === 'Recent Lesson Plans');
    const row = lpSection.rows[0];
    expect(row.title.length).toBeLessThanOrEqual(24);
    expect(row.description.length).toBeLessThanOrEqual(72);
  });

  test('SCENARIO: Urdu language shows Urdu labels', () => {
    const recentLPs = [
      { id: 'lp-1', topic: 'Photosynthesis', grade: '5', created_at: '2026-03-01' },
    ];

    const result = buildLPSelectionList('session-abc', recentLPs, 'ur');
    expect(result.listData.body.text || result.listData.body).toMatch(/سبق|درس|لیسن/);
  });
});

// ─── Tests for bd-620: LP Linking ───────────────────────────────────────

describe('LP Coaching Linker (bd-620)', () => {
  let handleLPSelection;
  const supabase = require('../../bot/shared/config/supabase');

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.mock('../../bot/shared/config/supabase', () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 'lp-1', content: { steps: ['step1'] }, topic: 'Photosynthesis' },
          error: null,
        }),
      };
      return { from: jest.fn(() => chain) };
    });

    handleLPSelection = require(
      '../../bot/shared/services/coaching/lp-coaching/lp-coaching-linker.service'
    ).handleLPSelection;
  });

  test('SCENARIO: Selecting recent LP sets linked_lesson_plan_id', async () => {
    const result = await handleLPSelection('session-abc', 'lp_select_lp-1_session-abc');
    expect(result.linked_lesson_plan_id).toBe('lp-1');
  });

  test('SCENARIO: Selecting recent LP fetches LP content for analysis', async () => {
    const result = await handleLPSelection('session-abc', 'lp_select_lp-1_session-abc');
    expect(result.lesson_plan_content).toBeDefined();
    expect(result.lesson_plan_content.topic).toBe('Photosynthesis');
  });

  test('SCENARIO: "No LP" proceeds without LP', async () => {
    const result = await handleLPSelection('session-abc', 'lp_none_session-abc');
    expect(result.linked_lesson_plan_id).toBeNull();
    expect(result.lesson_plan_link_method).toBe('none');
  });

  test('SCENARIO: "Upload new" triggers upload flow', async () => {
    const result = await handleLPSelection('session-abc', 'lp_upload_session-abc');
    expect(result.lesson_plan_link_method).toBe('uploaded');
    expect(result.awaiting_upload).toBe(true);
  });

  test('SCENARIO: lesson_plan_link_method recorded (selected_recent|uploaded|none)', async () => {
    const result = await handleLPSelection('session-abc', 'lp_select_lp-1_session-abc');
    expect(result.lesson_plan_link_method).toBe('selected_recent');
  });
});

// ─── Tests for bd-621: Framework-Aware LP Generation Prompts ────────────

describe('Framework-Aware LP Prompt (bd-621)', () => {
  let getFrameworkLPInstructions;

  beforeAll(() => {
    getFrameworkLPInstructions = require(
      '../../bot/shared/services/coaching/lp-coaching/lp-framework-prompt.service'
    ).getFrameworkLPInstructions;
  });

  test('SCENARIO: LP generation prompt includes framework-specific instructions', () => {
    const instructions = getFrameworkLPInstructions('oecd');
    expect(instructions).toBeTruthy();
    expect(typeof instructions).toBe('string');
  });

  test('SCENARIO: HOTS LP prompt mentions Bloom taxonomy and open-ended questions', () => {
    const instructions = getFrameworkLPInstructions('hots');
    expect(instructions).toMatch(/[Bb]loom/);
    expect(instructions).toMatch(/open.ended|higher.order|thinking/i);
  });

  test('SCENARIO: FICO LP prompt mentions fidelity steps and materials', () => {
    const instructions = getFrameworkLPInstructions('fico');
    expect(instructions).toMatch(/fidelity|step/i);
    expect(instructions).toMatch(/material/i);
  });

  test('SCENARIO: Teach LP prompt mentions collaborative activities', () => {
    const instructions = getFrameworkLPInstructions('teach');
    expect(instructions).toMatch(/collaborat|autonomy|social/i);
  });

  test('SCENARIO: OECD LP prompt mentions assessment and engagement', () => {
    const instructions = getFrameworkLPInstructions('oecd');
    expect(instructions).toMatch(/assessment|formative/i);
  });

  test('SCENARIO: Unknown framework returns empty string (non-breaking)', () => {
    const instructions = getFrameworkLPInstructions('unknown');
    expect(instructions).toBe('');
  });
});
