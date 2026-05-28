/**
 * GradingService._saveGrade — schema-shape contract.
 *
 * Before this fix, `_saveGrade` upserted a per-STUDENT summary into the
 * `exam_grades` table using columns (`session_id`, `student_name`,
 * `total_marks`, `marks_obtained`, `percentage`, `grade`,
 * `question_breakdown`, `graded_at`) — none of which exist on
 * `exam_grades`. Every grading run silently failed to persist.
 *
 * The fix normalises the writes to match the schema:
 *   - One INSERT (or UPDATE) into `exam_submissions` per (session, student)
 *   - One INSERT per question into `exam_grades`, unique-keyed on
 *     `(submission_id, question_id)` for idempotent re-grading
 *
 * This test pins the contract via a tracking Supabase mock — it asserts
 * the table names + column names + chained methods, not the row contents.
 * If `_saveGrade` ever regresses to the per-student shape, this fails fast.
 */

const path = require('path');

jest.mock('../../bot/shared/config/supabase', () => {
  // Capture every chained call so the test can assert table + payload shape.
  const calls = [];
  const builder = (table) => {
    const ctx = { table, ops: [], _filters: [], _payload: null };
    const noopThen = (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
    const fluent = {
      select() { ctx.ops.push('select'); return fluent; },
      insert(payload) { ctx.ops.push('insert'); ctx._payload = payload; calls.push(ctx); return fluent; },
      update(payload) { ctx.ops.push('update'); ctx._payload = payload; calls.push(ctx); return fluent; },
      upsert(payload, opts) { ctx.ops.push('upsert'); ctx._payload = payload; ctx._opts = opts; calls.push(ctx); return fluent; },
      eq(col, val) { ctx._filters.push([col, val]); return fluent; },
      maybeSingle() {
        // For the "look up existing submission" path, return null (no existing).
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        // For ".select('id').single()" after insert — return a synthetic UUID.
        return Promise.resolve({ data: { id: '00000000-0000-0000-0000-000000000999' }, error: null });
      },
      then: noopThen,
    };
    return fluent;
  };
  return {
    from(table) {
      // First lookup call (.from('exam_submissions').select('id').eq.eq.maybeSingle)
      // returns no existing row. Subsequent insert/upsert tracked.
      return builder(table);
    },
    __mockCalls: () => calls,
    __resetMock: () => { calls.length = 0; },
  };
});

jest.mock('../../bot/shared/services/llm-client', () => ({
  getClient: () => ({}),
}));

jest.mock('../../bot/shared/services/exam-checker/grading-scale.service', () => ({
  getFullReport: () => ({ grade: 'A' }),
  convert: () => 'A',
}));

jest.mock('../../bot/shared/services/exam-checker/feedback.service', () => ({
  generate: () => ({ feedUp: '', feedBack: '', feedForward: '' }),
  generateOverall: () => ({ summary: '' }),
}));

const supabase = require('../../bot/shared/config/supabase');
const GradingService = require('../../bot/shared/services/exam-checker/grading.service');

describe('GradingService._saveGrade — schema-shape contract', () => {
  beforeEach(() => supabase.__resetMock());

  it('writes to exam_submissions then exam_grades, NOT a non-existent column on exam_grades', async () => {
    const session = {
      id: 'session-123',
      original_images: ['https://example.test/page1.jpg', 'https://example.test/page2.jpg'],
    };
    const student = {
      name: 'Asha',
      rollNumber: 'R-001',
      pageNumbers: [1, 2],
    };
    const result = {
      gradedAt: new Date().toISOString(),
      questionResults: [
        { questionId: 'Q1', questionType: 'mcq', maxMarks: 2, marksAwarded: 2, feedback: 'Correct!' },
        { questionId: 'Q2', questionType: 'short', maxMarks: 5, marksAwarded: 3, feedback: 'Partial.' },
      ],
    };

    await GradingService._saveGrade(session, student, result);

    const calls = supabase.__mockCalls();
    const tables = calls.map((c) => c.table);

    // The contract: at minimum one exam_submissions write + one exam_grades write.
    expect(tables).toContain('exam_submissions');
    expect(tables).toContain('exam_grades');

    // Per-student summary columns (the OLD broken shape) MUST NOT appear on exam_grades writes.
    const gradesWrites = calls.filter((c) => c.table === 'exam_grades');
    for (const w of gradesWrites) {
      const payload = Array.isArray(w._payload) ? w._payload : [w._payload];
      for (const row of payload) {
        // These are the per-STUDENT summary columns that don't exist on exam_grades.
        for (const forbidden of ['total_marks', 'marks_obtained', 'percentage', 'grade', 'session_id', 'student_name', 'roll_number', 'question_breakdown', 'graded_at']) {
          expect(Object.keys(row)).not.toContain(forbidden);
        }
        // These are the per-QUESTION columns that DO exist on exam_grades.
        expect(Object.keys(row)).toEqual(expect.arrayContaining(['submission_id', 'question_id', 'max_marks', 'awarded_marks']));
      }
    }

    // The exam_grades upsert MUST use the (submission_id, question_id) unique key.
    const gradesUpsert = gradesWrites.find((w) => w.ops.includes('upsert'));
    expect(gradesUpsert).toBeDefined();
    expect(gradesUpsert._opts).toMatchObject({ onConflict: 'submission_id,question_id' });
  });

  it('produces one exam_grades row per question in the grading result', async () => {
    const session = { id: 's', original_images: [] };
    const student = { name: 'Bob', pageNumbers: [] };
    const result = {
      gradedAt: new Date().toISOString(),
      questionResults: [
        { questionId: 'Q1', maxMarks: 1, marksAwarded: 1 },
        { questionId: 'Q2', maxMarks: 1, marksAwarded: 0 },
        { questionId: 'Q3', maxMarks: 1, marksAwarded: 1 },
      ],
    };

    await GradingService._saveGrade(session, student, result);

    const calls = supabase.__mockCalls();
    const gradesWrite = calls.find((c) => c.table === 'exam_grades' && c.ops.includes('upsert'));
    expect(gradesWrite).toBeDefined();
    expect(Array.isArray(gradesWrite._payload)).toBe(true);
    expect(gradesWrite._payload).toHaveLength(3);
    expect(gradesWrite._payload.map((r) => r.question_id).sort()).toEqual(['Q1', 'Q2', 'Q3']);
  });
});
