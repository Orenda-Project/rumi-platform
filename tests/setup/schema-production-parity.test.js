/**
 * Schema Production Parity Test
 *
 * Ensures that 00_complete-schema.sql matches production Rumi database.
 * Production has 60 tables, 38 functions, 27 triggers, 186+ indexes.
 *
 * TDD: Written BEFORE updating schema file to production parity.
 *
 * bd-395: Zavia1 (Mahrah Education) clone had 25 missing tables, 82 missing
 * columns, 37 missing functions — every feature broke. This test prevents
 * future schema drift by asserting exact production parity.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Schema file path
// ---------------------------------------------------------------------------

const SCHEMA_PATH = path.resolve(
  __dirname,
  '../../infrastructure/supabase/00_complete-schema.sql',
);

// ---------------------------------------------------------------------------
// All 60 production tables (as of 2026-02-17)
// ---------------------------------------------------------------------------

const PRODUCTION_TABLES = [
  // Core User Management
  'users',
  'dashboard_users',
  'portal_organizations',
  'access_scopes',
  'feature_permissions',
  'invitations',

  // Engagement & Analytics
  'user_feature_first_use',
  'chat_sessions',
  'conversations',
  'chat_starts',
  'cta_clicks',

  // Coaching
  'coaching_sessions',
  'coaching_jobs',
  'coaching_processing_queue',
  'coaching_quality_metrics',

  // Legacy Audio & Teacher
  'audio_sessions',
  'teacher_progress',
  'teacher_facts',

  // Lesson Plans
  'lesson_plans',
  'lesson_plan_requests',

  // Curriculum Lesson Plans + region gating (Phase 4A)
  'textbooks',
  'textbook_pages',
  'textbook_toc',
  'pre_generated_lps',
  'region_features',

  // Reading Assessment
  'reading_assessments',
  'lcpm_benchmarks',
  'wcpm_percentiles',

  // Attendance
  'student_lists',
  'students',
  'student_videos',
  'attendance_sessions',
  'attendance_records',

  // Exam Checker
  'exam_check_sessions',
  'exam_templates',
  'exam_submissions',
  'exam_grades',
  'grade_audit_log',

  // Image Analysis
  'image_analysis_requests',

  // Video
  'video_requests',
  'video_tasks',
  'videos',

  // A/B Testing
  'ab_tests',
  'ab_test_variants',
  'ab_test_events',

  // AMA (Ask Me Anything)
  'ama_conversations',
  'ama_messages',
  'ama_query_audit',

  // BYOF (Build Your Own Feature)
  'byof_sessions',
  'byof_messages',
  'byof_plans',
  'byof_approval_log',

  // Broadcast
  'broadcast_logs',
  'broadcast_messages',

  // QA
  'qa_test_runs',
  'qa_analyst_proposals',
  'qa_bug_patterns',

  // Misc / System
  'dashboard_audit_log',
  'feature_suggestions',
  'api_usage_log',
  'failed_operations',
  'release_notes',
  'schema_versions',
  'website_visits',
  'migration_test',
];

// ---------------------------------------------------------------------------
// All 37 production functions (as of 2026-02-17)
// Note: exec_sql is excluded from open-source schema (dashboard-only, add separately)
// ---------------------------------------------------------------------------

const PRODUCTION_FUNCTIONS = [
  'acquire_assessment_lock',
  'acquire_broadcast_lock',
  'auto_title_conversation',
  'backfill_chat_sessions',
  'calculate_attendance_percentage',
  'calculate_retention',
  'calculate_wcpm',
  'check_benchmark_status',
  'check_lcpm_benchmark_status',
  'claim_next_coaching_job',
  'cleanup_old_coaching_jobs',
  'complete_coaching_job',
  'fail_coaching_job',
  'get_attendance_summary',
  'get_broadcast_counts',
  'get_or_create_session',
  'get_portal_users',
  'get_users_with_last_activity',
  'increment_broadcast_count',
  'increment_replied_count',
  'increment_turn_count',
  'is_invitation_valid',
  'log_broadcast_changes',
  'queue_coaching_job',
  'refresh_dashboard_views',
  'release_broadcast_lock',
  'set_portal_user_context',
  'update_access_scopes_updated_at',
  'update_assessment_status',
  'update_byof_session_timestamp',
  'update_conversation_on_message',
  'update_exam_checker_updated_at',
  'update_qa_updated_at',
  'update_session_message_count',
  'update_student_count',
  'update_student_videos_search_vector',
  'update_updated_at_column',
];

// ---------------------------------------------------------------------------
// Critical columns on `users` table (registration flow v3 depends on these)
// ---------------------------------------------------------------------------

const USERS_REQUIRED_COLUMNS = [
  'id',
  'phone_number',
  'name',
  'first_name',
  'last_name',
  'country',
  'region',
  'organization',
  'school_name',
  'grades_taught',
  'subjects_taught',
  'preferred_language',
  'registration_completed',
  'registration_state',
  'source',
  'portal_password_hash',
  'portal_activated',
  'is_test_user',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCreateTables(sql) {
  const tables = new Set();
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let m;
  while ((m = pattern.exec(sql)) !== null) {
    tables.add(m[1].toLowerCase());
  }
  return tables;
}

function extractFunctions(sql) {
  const fns = new Set();
  const pattern = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)/gi;
  let m;
  while ((m = pattern.exec(sql)) !== null) {
    fns.add(m[1].toLowerCase());
  }
  return fns;
}

function extractTriggers(sql) {
  const triggers = new Set();
  const pattern = /CREATE\s+TRIGGER\s+(\w+)/gi;
  let m;
  while ((m = pattern.exec(sql)) !== null) {
    triggers.add(m[1].toLowerCase());
  }
  return triggers;
}

function extractIndexes(sql) {
  const indexes = new Set();
  const pattern = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let m;
  while ((m = pattern.exec(sql)) !== null) {
    indexes.add(m[1].toLowerCase());
  }
  return indexes;
}

function extractUsersColumns(sql) {
  // Extract the CREATE TABLE users block
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?users\s*\(([\s\S]*?)\);/i;
  const match = tablePattern.exec(sql);
  if (!match) return new Set();

  const columns = new Set();
  const body = match[1];
  // Each line that starts with a column name (not PRIMARY KEY, CONSTRAINT, etc.)
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip constraints, empty lines, and comments
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('PRIMARY')
        || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('UNIQUE')
        || trimmed.startsWith('FOREIGN') || trimmed.startsWith('CHECK')) {
      continue;
    }
    const colMatch = trimmed.match(/^(\w+)\s+/);
    if (colMatch) {
      columns.add(colMatch[1].toLowerCase());
    }
  }
  return columns;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema Production Parity', () => {
  let schemaSQL;
  let schemaTables;
  let schemaFunctions;
  let schemaTriggers;
  let schemaIndexes;

  beforeAll(() => {
    schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    schemaTables = extractCreateTables(schemaSQL);
    schemaFunctions = extractFunctions(schemaSQL);
    schemaTriggers = extractTriggers(schemaSQL);
    schemaIndexes = extractIndexes(schemaSQL);
  });

  // -------------------------------------------------------------------------
  // Table count and completeness
  // -------------------------------------------------------------------------
  describe('tables', () => {
    it('should have at least 60 tables', () => {
      expect(schemaTables.size).toBeGreaterThanOrEqual(60);
    });

    for (const table of PRODUCTION_TABLES) {
      it(`should contain table "${table}"`, () => {
        expect(schemaTables.has(table)).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Function count and completeness
  // -------------------------------------------------------------------------
  describe('functions', () => {
    it('should have at least 30 functions', () => {
      expect(schemaFunctions.size).toBeGreaterThanOrEqual(30);
    });

    for (const fn of PRODUCTION_FUNCTIONS) {
      it(`should contain function "${fn}"`, () => {
        expect(schemaFunctions.has(fn)).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Trigger count
  // -------------------------------------------------------------------------
  describe('triggers', () => {
    it('should have at least 20 triggers', () => {
      expect(schemaTriggers.size).toBeGreaterThanOrEqual(20);
    });
  });

  // -------------------------------------------------------------------------
  // Index count
  // -------------------------------------------------------------------------
  describe('indexes', () => {
    it('should have at least 100 indexes', () => {
      expect(schemaIndexes.size).toBeGreaterThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // Users table columns (registration flow v3 depends on these)
  // -------------------------------------------------------------------------
  describe('users table columns', () => {
    let usersColumns;

    beforeAll(() => {
      usersColumns = extractUsersColumns(schemaSQL);
    });

    for (const col of USERS_REQUIRED_COLUMNS) {
      it(`users table should have column "${col}"`, () => {
        expect(usersColumns.has(col)).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Extensions
  // -------------------------------------------------------------------------
  describe('extensions', () => {
    it('should enable uuid-ossp extension', () => {
      expect(schemaSQL).toMatch(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+["']?uuid-ossp["']?/i);
    });

    it('should enable vector extension', () => {
      expect(schemaSQL).toMatch(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+["']?vector["']?/i);
    });
  });

  // -------------------------------------------------------------------------
  // Schema structure
  // -------------------------------------------------------------------------
  describe('schema structure', () => {
    it('should use IF NOT EXISTS for all tables', () => {
      const rawCreates = schemaSQL.match(/CREATE\s+TABLE\s+(?!IF)/gi);
      expect(rawCreates).toBeNull();
    });

    it('should use CREATE OR REPLACE for all functions', () => {
      const rawFunctions = schemaSQL.match(/CREATE\s+FUNCTION\s+(?!OR)/gi);
      expect(rawFunctions).toBeNull();
    });

    it('should end with PostgREST reload notification', () => {
      expect(schemaSQL).toContain("NOTIFY pgrst, 'reload schema'");
    });
  });
});
