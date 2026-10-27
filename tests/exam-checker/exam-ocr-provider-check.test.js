/**
 * exam_check_sessions.ocr_provider now stores the vision model that read the
 * papers ("gemini-3.5-flash"). Installs that applied the legacy
 * bot/database/migrations/015_exam_checker.sql carry a CHECK limiting it to
 * ('mistral', 'chandra') that would reject every new write. Drop that CHECK in
 * place — only when it is the legacy one — for older databases, and in the
 * complete schema for fresh installs that replay it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const FILE = path.join(ROOT, 'infrastructure/supabase/migrations/V2.11.6__exam_ocr_provider_any_model.sql');

describe('legacy ocr_provider CHECK', () => {
  test('V2.11.6 drops only the legacy mistral/chandra CHECK and records 2.11.6', () => {
    expect(fs.existsSync(FILE)).toBe(true);
    const sql = fs.readFileSync(FILE, 'utf8');
    const code = sql.replace(/--.*$/gm, '');
    expect(code).toMatch(/conname = 'exam_check_sessions_ocr_provider_check'/);
    expect(code).toMatch(/pg_get_constraintdef\(oid\) LIKE '%mistral%'/);
    expect(code).toMatch(/ALTER TABLE exam_check_sessions DROP CONSTRAINT exam_check_sessions_ocr_provider_check;/);
    expect(code).toMatch(/INSERT INTO schema_versions \(version, description\)\s*VALUES \('2\.11\.6',[^;]*ON CONFLICT \(version\) DO NOTHING;/);
    // Nothing else is dropped, deleted or rewritten.
    expect(code.match(/\bDROP\b/gi)).toHaveLength(1);
    expect(code).not.toMatch(/\b(DELETE|TRUNCATE|RENAME)\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+\w/i);
  });

  test('00_complete-schema creates ocr_provider with no CHECK, so a fresh install needs no drop', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'infrastructure/supabase/00_complete-schema.sql'), 'utf8');
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS exam_check_sessions (');
    const table = schema.slice(start, schema.indexOf('\n);', start));
    expect(table).toMatch(/ocr_provider VARCHAR\(20\),/);
    expect(schema).not.toMatch(/ocr_provider[^\n]*CHECK/);
  });

  test('the migration says how to undo it', () => {
    const sql = fs.readFileSync(FILE, 'utf8');
    expect(sql).toMatch(/ROLLBACK:[\s\S]*ADD CONSTRAINT exam_check_sessions_ocr_provider_check/);
  });
});
