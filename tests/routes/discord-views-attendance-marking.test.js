/**
 * discord-views/attendance-marking.view.js — the tap-to-mark
 * StringSelectMenu screen mapping. No existing test file directly exercises
 * discord-views/*'s screenToSteps/mergeScreenData pure functions (the
 * registry test's fakeTrigger() only ever returns a generic 'some_value'
 * selection), so this is the first to test the real chunking/merge logic on
 * realistic data.
 */

const attendanceMarkingView = require('../../bot/shared/routes/discord-views/attendance-marking.view');

describe('attendance-marking.view — screenToSteps', () => {
  const students = [
    { id: 's1', title: 'Zara Abdul' },
    { id: 's2', title: 'Ahmed Khan' },
  ];

  it('MARK_ABSENT renders a single select step for a roster under the 25-option cap', () => {
    const { steps, textFields, title } = attendanceMarkingView.screenToSteps('MARK_ABSENT', {
      class_display: 'Grade 3 - A', students,
    });

    expect(textFields).toEqual([]); // all-enum screen — never opens a Discord Modal
    expect(title).toBe('Mark Attendance');
    expect(steps).toHaveLength(1);
    expect(steps[0].fieldName).toBe('absent_students_chunk_0');
    expect(steps[0].multi).toBe(true);
    expect(steps[0].promptText).toContain('Grade 3 - A');

    const menu = steps[0].buildMenu().toJSON();
    expect(menu.min_values).toBe(0);
    expect(menu.max_values).toBe(2);
    expect(menu.options).toEqual([
      { label: 'Zara Abdul', value: 's1' },
      { label: 'Ahmed Khan', value: 's2' },
    ]);
    // unlike exam-confirm's all-pre-selected "confirmed" semantics, nothing
    // here should be pre-selected — a selected option means ABSENT.
    expect(menu.options.some((o) => o.default)).toBe(false);
  });

  it('chunks a 40-student roster into two sequential select steps (25-option Discord cap)', () => {
    const bigRoster = Array.from({ length: 40 }, (_, i) => ({ id: String(i), title: `Student ${i}` }));
    const { steps } = attendanceMarkingView.screenToSteps('MARK_ABSENT', { students: bigRoster });

    expect(steps).toHaveLength(2);
    expect(steps[0].buildMenu().toJSON().options).toHaveLength(25);
    expect(steps[1].buildMenu().toJSON().options).toHaveLength(15);
    expect(steps[0].promptText).toContain('1/2');
    expect(steps[1].promptText).toContain('2/2');
  });

  it('handles an empty roster without throwing (zero options, still one step)', () => {
    const { steps } = attendanceMarkingView.screenToSteps('MARK_ABSENT', { students: [] });
    expect(steps).toHaveLength(0);
  });

  it('throws for an unmapped screen', () => {
    expect(() => attendanceMarkingView.screenToSteps('NOT_A_SCREEN', {})).toThrow(/no screen mapping/);
  });
});

describe('attendance-marking.view — mergeScreenData', () => {
  it('flattens and orders chunked selections by chunk index into absent_student_ids', () => {
    const enumAnswers = {
      absent_students_chunk_1: ['s26'],
      absent_students_chunk_0: ['s1', 's5'],
    };
    expect(attendanceMarkingView.mergeScreenData('MARK_ABSENT', enumAnswers)).toEqual({
      absent_student_ids: ['s1', 's5', 's26'],
    });
  });

  it('defaults to an empty array when nobody is selected (everyone present)', () => {
    expect(attendanceMarkingView.mergeScreenData('MARK_ABSENT', { absent_students_chunk_0: [] })).toEqual({
      absent_student_ids: [],
    });
  });

  it('returns {} for an unrecognized screen', () => {
    expect(attendanceMarkingView.mergeScreenData('UNKNOWN', {})).toEqual({});
  });
});

describe('attendance-marking.view — chunkStudents', () => {
  it('splits at exactly the 25-item CHUNK_SIZE boundary', () => {
    const roster = Array.from({ length: 26 }, (_, i) => ({ id: String(i), title: `S${i}` }));
    const chunks = attendanceMarkingView.chunkStudents(roster);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(25);
    expect(chunks[1]).toHaveLength(1);
  });
});
