/**
 * Schema Completeness Test
 *
 * Ensures that every Supabase table referenced in bot code has a corresponding
 * CREATE TABLE statement in the consolidated schema SQL file.
 *
 * TDD: This test file was written BEFORE adding the missing tables.
 *
 * bd-330: Comprehensive sweep found 8+ tables referenced in bot code but
 * missing from 00_complete-schema.sql. This blocks async job processing
 * (lesson plans, video generation) for clone users.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively find all .js files under a directory, excluding node_modules
 * and __mocks__ directories.
 */
function findJsFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__mocks__') continue;
      results.push(...findJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Extract all Supabase table references from a JS file's content.
 * Patterns matched:
 *   .from('table_name')
 *   .from("table_name")
 */
function extractTableReferences(content) {
  const tables = new Set();
  const fromPattern = /\.from\(\s*['"]([a-z_]+)['"]\s*\)/g;
  let match;
  while ((match = fromPattern.exec(content)) !== null) {
    tables.add(match[1]);
  }
  return tables;
}

/**
 * Extract all RPC function references from a JS file's content.
 * Patterns matched:
 *   .rpc('function_name')
 *   .rpc("function_name")
 */
function extractRpcReferences(content) {
  const rpcs = new Set();
  const rpcPattern = /\.rpc\(\s*['"]([a-z_]+)['"]\s*[,)]/g;
  let match;
  while ((match = rpcPattern.exec(content)) !== null) {
    rpcs.add(match[1]);
  }
  return rpcs;
}

/**
 * Extract all CREATE TABLE names from the schema SQL.
 */
function extractCreateTables(sqlContent) {
  const tables = new Set();
  const createPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let match;
  while ((match = createPattern.exec(sqlContent)) !== null) {
    tables.add(match[1].toLowerCase());
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const BOT_DIR = path.resolve(__dirname, '../../bot');
const SCHEMA_PATH = path.resolve(
  __dirname,
  '../../infrastructure/supabase/00_complete-schema.sql',
);

// Names that appear in .from() but are not real table references
// (e.g. test fixtures, mock data, or dynamically-constructed names)
const IGNORED_REFERENCES = new Set([
  'mock-excel',
  'fake audio data',
  'speech',
  'sessions', // alias / ambiguous — not a standalone table
]);

// Known required tables that MUST exist in the schema.
// These are critical for async job processing and core bot functionality.
const KNOWN_REQUIRED_TABLES = [
  'lesson_plan_requests',
  'video_tasks',
  'broadcast_messages',
  'user_feature_first_use',
  'feature_suggestions',
  'ab_tests',
  'ab_test_variants',
  'ab_test_events',
  'chat_starts',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema Completeness', () => {
  let schemaSQL;
  let schemaTables;
  let codeTableRefs;

  beforeAll(() => {
    // Read schema SQL
    schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    schemaTables = extractCreateTables(schemaSQL);

    // Scan all bot JS files for table references
    codeTableRefs = new Set();
    const jsFiles = findJsFiles(BOT_DIR);

    for (const filePath of jsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const refs = extractTableReferences(content);
      for (const ref of refs) {
        if (!IGNORED_REFERENCES.has(ref)) {
          codeTableRefs.add(ref);
        }
      }
    }
  });

  // -------------------------------------------------------------------------
  // Core assertion: every code reference has a CREATE TABLE
  // -------------------------------------------------------------------------
  describe('all code-referenced tables exist in schema', () => {
    it('should have a CREATE TABLE for every .from() reference in bot code', () => {
      const missing = [];
      for (const table of codeTableRefs) {
        if (!schemaTables.has(table)) {
          missing.push(table);
        }
      }

      const message = missing.length > 0
        ? [
            `${missing.length} table(s) referenced in bot code but missing from schema:`,
            ...missing.map((t) => `  - ${t}`),
            '',
            'Add CREATE TABLE IF NOT EXISTS statements to:',
            '  infrastructure/supabase/00_complete-schema.sql',
          ].join('\n')
        : '';

      expect(missing).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Known required tables — explicit checks for critical tables
  // -------------------------------------------------------------------------
  describe('known required tables', () => {
    for (const table of KNOWN_REQUIRED_TABLES) {
      it(`schema contains CREATE TABLE for "${table}"`, () => {
        expect(schemaTables.has(table)).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Sanity checks — make sure parsing is working correctly
  // -------------------------------------------------------------------------
  describe('sanity checks', () => {
    it('schema SQL file exists and is non-empty', () => {
      expect(schemaSQL.length).toBeGreaterThan(0);
    });

    it('found existing known tables in schema (e.g. users, conversations)', () => {
      expect(schemaTables.has('users')).toBe(true);
      expect(schemaTables.has('conversations')).toBe(true);
      expect(schemaTables.has('coaching_sessions')).toBe(true);
    });

    it('found table references in bot code', () => {
      expect(codeTableRefs.size).toBeGreaterThan(0);
    });

    it('bot code references known tables like users and conversations', () => {
      expect(codeTableRefs.has('users')).toBe(true);
      expect(codeTableRefs.has('conversations')).toBe(true);
    });
  });
});
