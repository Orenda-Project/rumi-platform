/**
 * StudentListService.parseStudentText — the roster parser.
 *
 * Load-bearing for class setup on any channel without a Flow, where the teacher
 * types the whole roster as one message (see messaging/text-flow-definitions.js).
 * The optional parent phone number matters: quizzes and reports are delivered to
 * parents, so a roster with no numbers gets as far as the class picker and stops.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }), { virtual: true });
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const StudentListService = require('../../bot/shared/services/student-list.service');

const parse = (text) => StudentListService.parseStudentText(text);

describe('names', () => {
  it('takes one student per line', () => {
    expect(parse('Ahmed Khan\nBilal Hussain')).toEqual([
      { studentName: 'Ahmed Khan', fatherName: null, parentPhone: null },
      { studentName: 'Bilal Hussain', fatherName: null, parentPhone: null },
    ]);
  });

  it('splits s/o and d/o into student and father', () => {
    expect(parse('Zara d/o Abdul Ghaffar')).toEqual([
      { studentName: 'Zara', fatherName: 'Abdul Ghaffar', parentPhone: null },
    ]);
  });

  it('treats a comma as "Name, Father Name"', () => {
    expect(parse('Ahmed Khan, Khan Sahib')).toEqual([
      { studentName: 'Ahmed Khan', fatherName: 'Khan Sahib', parentPhone: null },
    ]);
  });

  it('strips list numbering and bullets, and ignores blank lines', () => {
    expect(parse('1. Ahmed\n\n- Bilal\n• Zara\n   \n')).toEqual([
      { studentName: 'Ahmed', fatherName: null, parentPhone: null },
      { studentName: 'Bilal', fatherName: null, parentPhone: null },
      { studentName: 'Zara', fatherName: null, parentPhone: null },
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parse('Ahmed\r\nBilal')).toHaveLength(2);
  });

  it('returns nothing for empty or non-string input', () => {
    expect(parse('')).toEqual([]);
    expect(parse(null)).toEqual([]);
    expect(parse(undefined)).toEqual([]);
    expect(parse('   \n  \n')).toEqual([]);
  });
});

describe('optional parent phone number', () => {
  it('extracts an international number and keeps the name clean', () => {
    expect(parse('Ahmed Khan +923001234567')).toEqual([
      { studentName: 'Ahmed Khan', fatherName: null, parentPhone: '+923001234567' },
    ]);
  });

  it('extracts a local-format number', () => {
    expect(parse('Bilal Hussain 03001234567')).toEqual([
      { studentName: 'Bilal Hussain', fatherName: null, parentPhone: '03001234567' },
    ]);
  });

  it('normalises spaces and dashes out of the number', () => {
    expect(parse('Ahmed Khan +92 300 123-4567')[0].parentPhone).toBe('+923001234567');
  });

  it('keeps s/o parsing working alongside a number', () => {
    expect(parse('Zara s/o Abdul 03007654321')).toEqual([
      { studentName: 'Zara', fatherName: 'Abdul', parentPhone: '03007654321' },
    ]);
  });

  it('does not leave a dangling separator when the number followed a comma', () => {
    expect(parse('Ahmed Khan, +923001234567')).toEqual([
      { studentName: 'Ahmed Khan', fatherName: null, parentPhone: '+923001234567' },
    ]);
  });

  it('mixes students with and without numbers in one roster', () => {
    const rows = parse('Ahmed Khan +923001234567\nBilal Hussain\nZara s/o Abdul 03007654321');
    expect(rows.map((r) => r.parentPhone)).toEqual(['+923001234567', null, '03007654321']);
    expect(rows.map((r) => r.studentName)).toEqual(['Ahmed Khan', 'Bilal Hussain', 'Zara']);
  });

  it('does NOT mistake a short number for a phone', () => {
    // A grade, a roll number, or a year is not a phone number — the pattern
    // deliberately requires 10+ digits.
    expect(parse('Ahmed Khan 4')).toEqual([
      { studentName: 'Ahmed Khan 4', fatherName: null, parentPhone: null },
    ]);
    expect(parse('Class 2026 Ahmed')[0].parentPhone).toBeNull();
  });

  it('skips a line that is only a phone number — it names no student', () => {
    expect(parse('+923001234567')).toEqual([]);
  });
});

describe('createStudentData carries the phone through to the row', () => {
  it('maps parentPhone to the parent_phone column', () => {
    const row = StudentListService.createStudentData('list-1', {
      studentName: 'Ahmed', fatherName: 'Khan', parentPhone: '+923001234567', rollNumber: 1,
    });
    expect(row).toEqual({
      list_id: 'list-1',
      student_name: 'Ahmed',
      father_name: 'Khan',
      parent_phone: '+923001234567',
      roll_number: 1,
      is_active: true,
    });
  });

  it('writes null when no number was given, rather than undefined', () => {
    const row = StudentListService.createStudentData('list-1', {
      studentName: 'Ahmed', rollNumber: 2,
    });
    expect(row.parent_phone).toBeNull();
    expect(row.father_name).toBeNull();
  });
});
