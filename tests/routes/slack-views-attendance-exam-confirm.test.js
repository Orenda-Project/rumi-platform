/**
 * slack-views/attendance.view.js and exam-confirm.view.js — the concrete
 * screen <-> Block Kit mapping for the two retrofitted Slack Flow-equivalents.
 * Mirrors tests/routes/slack-views.test.js's conventions (registration/settings).
 */

const attendanceView = require('../../bot/shared/routes/slack-views/attendance.view');
const examConfirmView = require('../../bot/shared/routes/slack-views/exam-confirm.view');
const attendanceMarkingView = require('../../bot/shared/routes/slack-views/attendance-marking.view');

const METADATA = JSON.stringify({ kind: 'attendance', screen: 'CLASS_INFO', flowToken: 'u1:attendance:169' });

describe('attendance.view — screenToView', () => {
  it('CLASS_INFO renders class_name/section (text) and attendance_frequency (once/twice select)', () => {
    const view = attendanceView.screenToView('CLASS_INFO', {}, { metadata: METADATA });
    expect(view.private_metadata).toBe(METADATA);
    const blockIds = view.blocks.map((b) => b.block_id);
    expect(blockIds).toEqual(['class_name_block', 'section_block', 'attendance_frequency_block']);

    const freqBlock = view.blocks.find((b) => b.block_id === 'attendance_frequency_block');
    expect(freqBlock.element.type).toBe('static_select');
    expect(freqBlock.element.options).toEqual([
      { text: { type: 'plain_text', text: 'Once per day' }, value: 'once' },
      { text: { type: 'plain_text', text: 'Twice (morning & afternoon)' }, value: 'twice' },
    ]);
  });

  it('ADD_STUDENT renders first_name/last_name text inputs plus a non-modal-submit "I\'m Done" button', () => {
    const view = attendanceView.screenToView('ADD_STUDENT', {
      heading: 'Add Student #2',
      class_info: 'Class: Grade 3 - A | Students: 1',
      students_list: 'Added: 1. Zara Abdul',
    }, { metadata: METADATA });

    expect(view.title.text).toBe('Add Student #2');
    expect(view.submit.text).toBe('Add & Continue');

    const blockIds = view.blocks.map((b) => b.block_id);
    expect(blockIds).toEqual([
      'class_info_block', 'students_list_block', 'first_name_block', 'last_name_block', 'attendance_finish_block',
    ]);

    const finishBlock = view.blocks.find((b) => b.block_id === 'attendance_finish_block');
    expect(finishBlock.type).toBe('actions');
    expect(finishBlock.elements[0]).toEqual(expect.objectContaining({
      type: 'button', action_id: 'attendance_finish', text: { type: 'plain_text', text: "I'm Done" },
    }));
  });

  it('ADD_STUDENT omits the class_info/students_list section blocks when absent (first student, fresh class)', () => {
    const view = attendanceView.screenToView('ADD_STUDENT', { heading: 'Add Student #1' }, { metadata: METADATA });
    const blockIds = view.blocks.map((b) => b.block_id);
    expect(blockIds).toEqual(['first_name_block', 'last_name_block', 'attendance_finish_block']);
  });

  // Regression: handleDoneAction rejects "I'm Done" with 0 students by
  // re-returning this same ADD_STUDENT screen with data.error — but this
  // view never rendered it, so the reopened modal looked pixel-identical to
  // before and the rejection was invisible to the teacher.
  it('ADD_STUDENT renders the error block when data.error is present (0-student "I\'m Done" rejection)', () => {
    const view = attendanceView.screenToView('ADD_STUDENT', {
      heading: 'Add Student #1',
      error: { message: 'Please add at least one student before finishing.' },
    }, { metadata: METADATA });

    const errorBlock = view.blocks.find((b) => b.block_id === 'add_student_error_block');
    expect(errorBlock).toBeTruthy();
    expect(errorBlock.text.text).toBe('⚠️ Please add at least one student before finishing.');
  });

  it('ADD_STUDENT omits the error block when data.error is absent', () => {
    const view = attendanceView.screenToView('ADD_STUDENT', { heading: 'Add Student #1' }, { metadata: METADATA });
    expect(view.blocks.find((b) => b.block_id === 'add_student_error_block')).toBeUndefined();
  });

  it('SUCCESS renders the success_message as a closeable, submit-less confirmation screen', () => {
    const view = attendanceView.screenToView('SUCCESS', {
      success_message: 'Your class Grade 3 - A has been created with 3 students.',
    }, { metadata: METADATA });

    expect(view.submit).toBeUndefined();
    const successBlock = view.blocks.find((b) => b.block_id === 'success_block');
    expect(successBlock.text.text).toBe('Your class Grade 3 - A has been created with 3 students.');
  });

  it('throws for an unmapped screen', () => {
    expect(() => attendanceView.screenToView('NOT_A_SCREEN', {}, { metadata: METADATA })).toThrow(/no view mapping/);
  });
});

describe('attendance.view — viewToScreenData', () => {
  it('extracts class_name/section/attendance_frequency from CLASS_INFO state values', () => {
    const stateValues = {
      class_name_block: { class_name: { value: 'Grade 3' } },
      section_block: { section: { value: 'A' } },
      attendance_frequency_block: { attendance_frequency: { selected_option: { value: 'once' } } },
    };
    expect(attendanceView.viewToScreenData('CLASS_INFO', stateValues)).toEqual({
      class_name: 'Grade 3', section: 'A', attendance_frequency: 'once',
    });
  });

  it('ADD_STUDENT sets _action="add" and threads _list_id/_class_display from the carried param', () => {
    const stateValues = {
      first_name_block: { first_name: { value: 'Zara' } },
      last_name_block: { last_name: { value: 'Abdul' } },
    };
    const result = attendanceView.viewToScreenData('ADD_STUDENT', stateValues, { list_id: 'list-1', class_display: 'Grade 3 - A' });
    expect(result).toEqual({
      first_name: 'Zara', last_name: 'Abdul', _action: 'add', _list_id: 'list-1', _class_display: 'Grade 3 - A',
    });
  });

  it('ADD_STUDENT tolerates a missing carried param (defaults to {})', () => {
    const result = attendanceView.viewToScreenData('ADD_STUDENT', {
      first_name_block: { first_name: { value: 'Zara' } },
    });
    expect(result._list_id).toBeUndefined();
    expect(result._class_display).toBeUndefined();
    expect(result._action).toBe('add');
  });

  it('returns {} for an unrecognized screen', () => {
    expect(attendanceView.viewToScreenData('UNKNOWN', {})).toEqual({});
  });
});

describe('attendance.view — metadataCarry', () => {
  it('picks {list_id, class_display} out of ADD_STUDENT response data', () => {
    const carry = attendanceView.metadataCarry('ADD_STUDENT', { list_id: 'list-1', class_display: 'Grade 3 - A', student_count: 2 });
    expect(carry).toEqual({ list_id: 'list-1', class_display: 'Grade 3 - A' });
  });

  it('returns undefined for CLASS_INFO — nothing to carry yet', () => {
    expect(attendanceView.metadataCarry('CLASS_INFO', {})).toBeUndefined();
  });
});

describe('attendance.view — FIRST_INPUT_BLOCK_ID', () => {
  it('names a real block_id for every screen the endpoint can return', () => {
    for (const screen of ['CLASS_INFO', 'ADD_STUDENT']) {
      expect(attendanceView.FIRST_INPUT_BLOCK_ID[screen]).toBeTruthy();
    }
  });
});

describe('exam-confirm.view — screenToView', () => {
  const students = [
    { id: '0', title: '1. Zara Abdul' },
    { id: '1', title: '2. Ahmed Khan' },
  ];

  it('CONFIRM_STUDENTS renders every student as a checkboxes option, all pre-checked', () => {
    const view = examConfirmView.screenToView('CONFIRM_STUDENTS', {
      heading: 'I found 2 students', subheading: "Uncheck anyone who isn't real", students,
    }, { metadata: 'meta' });

    expect(view.type).toBe('modal');
    expect(view.submit.text).toBe('Confirm & Grade');

    const block = view.blocks.find((b) => b.block_id === 'confirmed_students_block');
    expect(block.element.type).toBe('checkboxes');
    expect(block.element.options).toEqual([
      { text: { type: 'plain_text', text: '1. Zara Abdul' }, value: '0' },
      { text: { type: 'plain_text', text: '2. Ahmed Khan' }, value: '1' },
    ]);
    // every option defaults to checked, matching Meta's CheckboxGroup default
    expect(block.element.initial_options).toEqual(block.element.options);
  });

  it('handles an empty roster without throwing (zero checkboxes options)', () => {
    const view = examConfirmView.screenToView('CONFIRM_STUDENTS', { students: [] }, { metadata: 'meta' });
    const block = view.blocks.find((b) => b.block_id === 'confirmed_students_block');
    expect(block.element.options).toEqual([]);
  });

  it('does not chunk a roster of 40 students — Slack checkboxes has no 25-option cap unlike Discord', () => {
    const bigRoster = Array.from({ length: 40 }, (_, i) => ({ id: String(i), title: `Student ${i}` }));
    const view = examConfirmView.screenToView('CONFIRM_STUDENTS', { students: bigRoster }, { metadata: 'meta' });
    const block = view.blocks.find((b) => b.block_id === 'confirmed_students_block');
    expect(block.element.options).toHaveLength(40);
    // exactly one block for the roster (no split across multiple blocks/screens)
    expect(view.blocks.filter((b) => b.block_id === 'confirmed_students_block')).toHaveLength(1);
  });

  it('throws for an unmapped screen', () => {
    expect(() => examConfirmView.screenToView('NOT_A_SCREEN', {}, { metadata: 'meta' })).toThrow(/no view mapping/);
  });
});

describe('exam-confirm.view — viewToScreenData', () => {
  it('extracts confirmed_students as an array of selected option values', () => {
    const stateValues = {
      confirmed_students_block: {
        confirmed_students: { selected_options: [{ value: '0' }, { value: '1' }] },
      },
    };
    expect(examConfirmView.viewToScreenData('CONFIRM_STUDENTS', stateValues)).toEqual({ confirmed_students: ['0', '1'] });
  });

  it('defaults to an empty array when nothing is selected', () => {
    expect(examConfirmView.viewToScreenData('CONFIRM_STUDENTS', {})).toEqual({ confirmed_students: [] });
  });

  it('returns {} for an unrecognized screen', () => {
    expect(examConfirmView.viewToScreenData('UNKNOWN', {})).toEqual({});
  });
});

describe('exam-confirm.view — FIRST_INPUT_BLOCK_ID', () => {
  it('names the checkboxes block for CONFIRM_STUDENTS', () => {
    expect(examConfirmView.FIRST_INPUT_BLOCK_ID.CONFIRM_STUDENTS).toBe('confirmed_students_block');
  });
});

describe('attendance-marking.view — screenToView', () => {
  const students = [
    { id: 's1', title: 'Zara Abdul' },
    { id: 's2', title: 'Ahmed Khan' },
  ];

  it('MARK_ABSENT renders the roster as an optional checkboxes input, nothing pre-checked', () => {
    const view = attendanceMarkingView.screenToView('MARK_ABSENT', {
      class_display: 'Grade 3 - A', students,
    }, { metadata: 'meta' });

    expect(view.type).toBe('modal');
    expect(view.title.text).toBe('Grade 3 - A');
    expect(view.submit.text).toBe('Mark Attendance');

    const block = view.blocks.find((b) => b.block_id === 'absent_students_block');
    expect(block.optional).toBe(true);
    expect(block.element.type).toBe('checkboxes');
    expect(block.element.options).toEqual([
      { text: { type: 'plain_text', text: 'Zara Abdul' }, value: 's1' },
      { text: { type: 'plain_text', text: 'Ahmed Khan' }, value: 's2' },
    ]);
    // unlike exam-confirm's all-pre-checked "confirmed" semantics, a checked
    // box here means ABSENT — nobody should be pre-selected.
    expect(block.element.initial_options).toBeUndefined();
  });

  it('does not chunk a 40-student roster — same no-cap Block Kit checkboxes element as exam-confirm', () => {
    const bigRoster = Array.from({ length: 40 }, (_, i) => ({ id: String(i), title: `Student ${i}` }));
    const view = attendanceMarkingView.screenToView('MARK_ABSENT', { students: bigRoster }, { metadata: 'meta' });
    const block = view.blocks.find((b) => b.block_id === 'absent_students_block');
    expect(block.element.options).toHaveLength(40);
  });

  it('SUCCESS renders the success_message as a submit-less confirmation screen', () => {
    const view = attendanceMarkingView.screenToView('SUCCESS', {
      success_message: 'Attendance Recorded — Present: 18, Absent: 2',
    }, { metadata: 'meta' });

    expect(view.submit).toBeUndefined();
    const successBlock = view.blocks.find((b) => b.block_id === 'success_block');
    expect(successBlock.text.text).toBe('Attendance Recorded — Present: 18, Absent: 2');
  });

  it('throws for an unmapped screen', () => {
    expect(() => attendanceMarkingView.screenToView('NOT_A_SCREEN', {}, { metadata: 'meta' })).toThrow(/no view mapping/);
  });
});

describe('attendance-marking.view — viewToScreenData', () => {
  it('extracts absent_student_ids from the checkboxes selection', () => {
    const stateValues = {
      absent_students_block: { absent_students: { selected_options: [{ value: 's1' }] } },
    };
    expect(attendanceMarkingView.viewToScreenData('MARK_ABSENT', stateValues)).toEqual({ absent_student_ids: ['s1'] });
  });

  it('defaults to an empty array when nobody is checked (everyone present)', () => {
    expect(attendanceMarkingView.viewToScreenData('MARK_ABSENT', {})).toEqual({ absent_student_ids: [] });
  });

  it('returns {} for an unrecognized screen', () => {
    expect(attendanceMarkingView.viewToScreenData('UNKNOWN', {})).toEqual({});
  });
});

describe('attendance-marking.view — FIRST_INPUT_BLOCK_ID', () => {
  it('names the checkboxes block for MARK_ABSENT', () => {
    expect(attendanceMarkingView.FIRST_INPUT_BLOCK_ID.MARK_ABSENT).toBe('absent_students_block');
  });
});
