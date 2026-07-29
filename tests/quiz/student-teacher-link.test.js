'use strict';
/**
 * bd-2340 — a child belongs to the teacher whose quiz first brought them in.
 *
 * bd-2337 remembered the child. It did not remember WHOSE child they are, so
 * "show me my students" was not a question the data could answer.
 *
 * The rule that matters is that the link is set ONCE. A child invited by a
 * friend into a different teacher's quiz must not be silently reassigned —
 * otherwise one popular quiz shared across a school moves half a class to
 * whoever shared it last, and no teacher would ever notice it happening.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

const supabase = require('../../bot/shared/config/supabase');
const identity = require('../../bot/shared/services/quiz/student-identity.service');

function stub({ rows = [] } = {}) {
  const captured = { insert: null, update: null };
  supabase.from.mockImplementation(() => {
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      then: (resolve) => resolve({ data: rows, error: null }),
      insert: (p) => {
        captured.insert = p;
        return { select: () => ({ single: async () => ({ data: { id: 'stu-1', ...p }, error: null }) }) };
      },
      update: (p) => { captured.update = p; return { eq: async () => ({ error: null }) }; },
    };
    return chain;
  });
  return captured;
}

beforeEach(() => jest.clearAllMocks());

describe('bd-2340 — a new child is filed under the teacher who enrolled them', () => {
  test('the enrolling teacher is stored on first sight', async () => {
    const captured = stub();
    await identity.remember({
      phone: '923001234567', name: 'Hooria', className: '3-B',
      enrolledByUserId: 'teacher-1',
    });
    expect(captured.insert.enrolled_by_user_id).toBe('teacher-1');
  });

  test('a child with no teacher context is still remembered', async () => {
    const captured = stub();
    await identity.remember({ phone: '923001234567', name: 'Hooria' });
    expect(captured.insert.student_name).toBe('Hooria');
    expect(captured.insert.enrolled_by_user_id ?? null).toBeNull();
  });
});

describe('bd-2340 — the link is never rewritten', () => {
  test("a friend's invite into another teacher's quiz does not move the child", async () => {
    const captured = stub();
    await identity.touch('stu-1', { className: '4-A', enrolledByUserId: 'teacher-2' });
    // The class may be refreshed — children move up a year. Ownership may not.
    expect(captured.update).toBeTruthy();
    expect(Object.keys(captured.update)).not.toContain('enrolled_by_user_id');
  });
});

describe('bd-2340 — a teacher can ask who her students are', () => {
  test('it returns the children she enrolled', async () => {
    stub({
      rows: [
        { id: 's1', student_name: 'Hooria', self_reported_class: '3-B' },
        { id: 's2', student_name: 'Bilal', self_reported_class: '3-B' },
      ],
    });
    const mine = await identity.findByTeacher('teacher-1');
    expect(mine).toHaveLength(2);
    expect(mine.map((s) => s.student_name)).toEqual(['Hooria', 'Bilal']);
  });

  test('a teacher with nobody enrolled gets an empty list, not an error', async () => {
    stub({ rows: [] });
    await expect(identity.findByTeacher('teacher-nobody')).resolves.toEqual([]);
  });
});
