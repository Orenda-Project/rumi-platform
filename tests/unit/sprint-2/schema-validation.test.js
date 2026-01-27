/**
 * Sprint 2: Database Schema Validation Tests (bd-236 to bd-240)
 *
 * Validates that the consolidated SQL files exist, contain expected tables,
 * and have no security issues (no exec_sql, no hardcoded credentials).
 */

const fs = require('fs');
const path = require('path');

const INFRA_DIR = path.resolve(__dirname, '../../../infrastructure/supabase');

describe('Database Schema Files', () => {
  describe('schema files exist', () => {
    test('00_complete-schema.sql exists', () => {
      expect(fs.existsSync(path.join(INFRA_DIR, '00_complete-schema.sql'))).toBe(true);
    });

    test('01_rls-policies.sql exists', () => {
      expect(fs.existsSync(path.join(INFRA_DIR, '01_rls-policies.sql'))).toBe(true);
    });

    test('02_seed-data.sql exists', () => {
      expect(fs.existsSync(path.join(INFRA_DIR, '02_seed-data.sql'))).toBe(true);
    });

    test('verify-schema.sql exists', () => {
      expect(fs.existsSync(path.join(INFRA_DIR, 'verify-schema.sql'))).toBe(true);
    });
  });

  describe('00_complete-schema.sql content', () => {
    let schema;

    beforeAll(() => {
      schema = fs.readFileSync(path.join(INFRA_DIR, '00_complete-schema.sql'), 'utf8');
    });

    test('enables uuid-ossp extension', () => {
      expect(schema).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    });

    test('creates all core tables', () => {
      const requiredTables = [
        'users',
        'chat_sessions',
        'conversations',
        'coaching_sessions',
        'audio_sessions',
        'reading_assessments',
        'lesson_plans',
        'teacher_progress',
        'teacher_facts',
        'videos',
        'failed_operations',
        'schema_versions',
      ];

      for (const table of requiredTables) {
        expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      }
    });

    test('creates coaching pipeline tables', () => {
      expect(schema).toContain('coaching_processing_queue');
      expect(schema).toContain('coaching_quality_metrics');
    });

    test('creates exam checker tables', () => {
      expect(schema).toContain('exam_check_sessions');
      expect(schema).toContain('exam_submissions');
      expect(schema).toContain('exam_grades');
      expect(schema).toContain('exam_templates');
    });

    test('creates attendance tables', () => {
      expect(schema).toContain('student_lists');
      expect(schema).toContain('students');
      expect(schema).toContain('attendance_sessions');
      expect(schema).toContain('attendance_records');
    });

    test('creates video tables', () => {
      expect(schema).toContain('video_requests');
      expect(schema).toContain('student_videos');
    });

    test('creates reading assessment tables', () => {
      expect(schema).toContain('reading_assessments');
      expect(schema).toContain('wcpm_percentiles');
    });

    test('creates performance indexes', () => {
      expect(schema).toContain('CREATE INDEX');
      expect(schema).toContain('idx_users_phone');
      expect(schema).toContain('idx_conversations_user_created');
    });

    test('creates updated_at trigger function', () => {
      expect(schema).toContain('update_updated_at_column');
    });

    test('does NOT contain exec_sql', () => {
      expect(schema).not.toContain('exec_sql');
    });

    test('does NOT contain hardcoded credentials', () => {
      expect(schema).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(schema).not.toMatch(/eyJhbGciOi/);
    });
  });

  describe('01_rls-policies.sql content', () => {
    let rls;

    beforeAll(() => {
      rls = fs.readFileSync(path.join(INFRA_DIR, '01_rls-policies.sql'), 'utf8');
    });

    test('enables RLS on core tables', () => {
      const tables = ['users', 'conversations', 'coaching_sessions', 'lesson_plans', 'reading_assessments'];
      for (const table of tables) {
        expect(rls).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      }
    });

    test('creates service_role policies', () => {
      expect(rls).toContain("auth.role() = 'service_role'");
      // At least 10 policies
      const policyCount = (rls.match(/CREATE POLICY/g) || []).length;
      expect(policyCount).toBeGreaterThanOrEqual(10);
    });
  });

  describe('02_seed-data.sql content', () => {
    let seed;

    beforeAll(() => {
      seed = fs.readFileSync(path.join(INFRA_DIR, '02_seed-data.sql'), 'utf8');
    });

    test('seeds WCPM percentile benchmarks', () => {
      expect(seed).toContain('wcpm_percentiles');
      expect(seed).toContain('DIBELS');
    });

    test('records schema version', () => {
      expect(seed).toContain('schema_versions');
    });
  });

  describe('verify-schema.sql content', () => {
    let verify;

    beforeAll(() => {
      verify = fs.readFileSync(path.join(INFRA_DIR, 'verify-schema.sql'), 'utf8');
    });

    test('checks table count', () => {
      expect(verify).toContain('information_schema.tables');
    });

    test('verifies RLS status', () => {
      expect(verify).toContain('rowsecurity');
    });

    test('verifies seed data', () => {
      expect(verify).toContain('wcpm_percentiles');
    });

    test('verifies extensions', () => {
      expect(verify).toContain('pg_extension');
      expect(verify).toContain('uuid-ossp');
    });
  });
});
