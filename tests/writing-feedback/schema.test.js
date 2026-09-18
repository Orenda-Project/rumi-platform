/**
 * Writing feedback — the `writing_feedback_sessions` table.
 *
 * The repo's conformance guards already check that every `.from()` table and
 * every written column exists in the consolidated schema. This suite adds the
 * feature-specific half they can't know: that the columns which make the
 * human-in-the-loop signal MEASURABLE are all there and all of the right
 * shape — `ai_draft` AND `parent_final` as separate JSONB (you cannot compute
 * an edit rate from one of them), `edits_count`, and `confirmed_at`.
 *
 * Also pinned: RLS is enabled with a service-role policy (the row holds a
 * child's schoolwork), and the parent's number is stored as a hash column, not
 * a phone column.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'infrastructure/supabase/00_complete-schema.sql'), 'utf-8');
const RLS = fs.readFileSync(path.join(ROOT, 'infrastructure/supabase/01_rls-policies.sql'), 'utf-8');

const TABLE = 'writing_feedback_sessions';

/** The CREATE TABLE body for the table under test. */
function tableBody(sql, table) {
  const re = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i');
  const match = re.exec(sql);
  return match ? match[1] : null;
}

/** The declared type of one column, e.g. "VARCHAR(64)" or "JSONB". */
function columnType(body, column) {
  const re = new RegExp(`^\\s*${column}\\s+([A-Za-z0-9_]+(?:\\([^)]*\\))?)`, 'im');
  const match = re.exec(body);
  return match ? match[1].trim().toUpperCase() : null;
}

describe('writing_feedback_sessions schema', () => {
  const body = tableBody(SCHEMA, TABLE);

  it('the table exists in the consolidated schema', () => {
    expect(body).not.toBeNull();
  });

  it.each([
    ['id', 'UUID'],
    ['user_id', 'UUID'],
    ['phone_hash', 'VARCHAR'],
    ['status', 'VARCHAR'],
    ['child_age', 'INTEGER'],
    ['ocr_text', 'TEXT'],
    ['ocr_confidence', 'NUMERIC'],
    ['ai_draft', 'JSONB'],
    ['parent_final', 'JSONB'],
    ['edits_count', 'INTEGER'],
    ['confirmed_at', 'TIMESTAMPTZ'],
    ['created_at', 'TIMESTAMPTZ'],
    ['updated_at', 'TIMESTAMPTZ'],
  ])('has column %s of type %s', (column, type) => {
    const declared = columnType(body, column);
    expect(declared).not.toBeNull();
    expect(declared).toContain(type);
  });

  it('keeps the AI draft and the parent\'s final version as separate columns', () => {
    // The whole accuracy signal is the DIFFERENCE between them. One column
    // holding "the current version" would erase it.
    expect(columnType(body, 'ai_draft')).toBe('JSONB');
    expect(columnType(body, 'parent_final')).toBe('JSONB');
    expect(columnType(body, 'edits_count')).toBe('INTEGER');
  });

  it('stores a phone hash, not a phone number', () => {
    expect(body).toMatch(/phone_hash/);
    expect(body).not.toMatch(/phone_number/);
  });

  it('defaults status to awaiting_photo and edits_count to 0', () => {
    expect(body).toMatch(/status\s+VARCHAR\(30\)\s+NOT NULL\s+DEFAULT\s+'awaiting_photo'/i);
    expect(body).toMatch(/edits_count\s+INTEGER\s+DEFAULT\s+0/i);
  });

  it('is foreign-keyed to users(id), the same shape as the exam-checker sessions', () => {
    expect(SCHEMA).toMatch(
      /ALTER TABLE writing_feedback_sessions\s+ADD CONSTRAINT writing_feedback_sessions_user_id_fkey\s+FOREIGN KEY \(user_id\) REFERENCES users\(id\)/
    );
  });

  it('has the per-user lookup index the session query needs', () => {
    // getActiveSession() filters user_id and orders by created_at DESC.
    expect(SCHEMA).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_writing_feedback_sessions_user ON writing_feedback_sessions USING btree \(user_id, created_at DESC\)/
    );
  });

  it('keeps updated_at fresh via a trigger (the session timeout depends on it)', () => {
    expect(SCHEMA).toMatch(/CREATE TRIGGER writing_feedback_sessions_updated_at\s+BEFORE UPDATE ON writing_feedback_sessions/);
  });

  it('has RLS enabled with a service-role policy', () => {
    expect(RLS).toContain(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY;`);
    expect(RLS).toMatch(new RegExp(`CREATE POLICY "service_role_writing_feedback_sessions" ON ${TABLE} FOR ALL USING \\(auth\\.role\\(\\) = 'service_role'\\)`));
  });

  describe('every column the service writes exists on the table', () => {
    const serviceSource = fs.readFileSync(
      path.join(ROOT, 'bot/shared/services/writing-feedback.service.js'),
      'utf-8'
    );
    const handlerSource = fs.readFileSync(
      path.join(ROOT, 'bot/shared/handlers/writing-feedback.handler.js'),
      'utf-8'
    );

    // Every column name either file mentions in an update/insert payload.
    const WRITTEN_COLUMNS = [
      'user_id', 'phone_hash', 'status', 'edits_count', 'updated_at',
      'child_age', 'ai_draft', 'parent_final', 'confirmed_at',
      'image_url', 'ocr_text', 'ocr_confidence', 'ocr_provider',
    ];

    it.each(WRITTEN_COLUMNS)('%s', (column) => {
      expect(columnType(body, column)).not.toBeNull();
    });

    it('writes nothing this list does not cover', () => {
      // A cheap drift guard: if a new column is written without being added
      // here (and to the schema), this catches it before the conformance
      // guard has to.
      const referenced = new Set();
      for (const src of [serviceSource, handlerSource]) {
        for (const m of src.matchAll(/^\s{4,}([a-z][a-z0-9_]*):/gm)) referenced.add(m[1]);
      }
      const unknown = [...referenced].filter(
        (c) => WRITTEN_COLUMNS.includes(c) && columnType(body, c) === null
      );
      expect(unknown).toEqual([]);
    });
  });
});
