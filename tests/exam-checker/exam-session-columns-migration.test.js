/**
 * exam_check_sessions as the exam checker writes it.
 *
 * The code stores the page readings, the grades and the marked pages on the
 * session row (ocr_results, grading_results, annotated_images), and the
 * detected / confirmed students as objects ({ name, pageNumbers, … }). The
 * schema had none of the three columns — every grading run ended in "Failed to
 * update session" — and stored the students as text[], which turned each object
 * into a string, so student.name and student.pageNumbers were undefined
 * downstream (a null student_name on exam_submissions, 0 marks, no marked
 * pages). V2.11.7 adds the columns and turns the student columns into jsonb.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const FILE = path.join(ROOT, 'infrastructure/supabase/migrations/V2.11.7__exam_session_columns.sql');

describe('V2.11.7 exam session columns', () => {
  const sql = () => fs.readFileSync(FILE, 'utf8');
  const code = () => sql().replace(/--.*$/gm, '');

  it('adds the three jsonb columns the exam checker writes', () => {
    expect(fs.existsSync(FILE)).toBe(true);
    for (const col of ['ocr_results', 'grading_results', 'annotated_images']) {
      expect(code()).toMatch(new RegExp(`ALTER TABLE exam_check_sessions ADD COLUMN IF NOT EXISTS ${col} JSONB;`));
    }
  });

  it('turns the student columns into jsonb only while they are still text[]', () => {
    for (const col of ['detected_students', 'confirmed_students']) {
      expect(code()).toMatch(new RegExp(`column_name = '${col}'[\\s\\S]*?= 'ARRAY'`));
      expect(code()).toMatch(new RegExp(`ALTER COLUMN ${col} TYPE JSONB USING to_jsonb\\(${col}\\)`));
    }
  });

  it('is one all-or-nothing block that records 2.11.7 and drops or deletes nothing', () => {
    expect(code()).toMatch(/INSERT INTO schema_versions \(version, description\)\s*VALUES \('2\.11\.7',[^;]*ON CONFLICT \(version\) DO NOTHING;/);
    expect(code()).not.toMatch(/\b(DROP|DELETE|TRUNCATE|RENAME)\b/i);
    expect(code()).not.toMatch(/\bUPDATE\s+\w/i);
    expect(sql()).toMatch(/ROLLBACK:/);
  });
});
