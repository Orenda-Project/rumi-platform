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

// Directories scanned for `.from('<table>')` / `.rpc('<fn>')` references.
// Historical note: this used to be `bot/` only, which let `.from('schools')` in
// `dashboard/scripts/` ship undetected. The scope is now every shipped source
// directory so the schema↔code contract is enforced across the whole repo.
// (Scope widening + IGNORED_REFERENCES sanitization landed together.)
const SOURCE_DIRS = ['bot', 'dashboard', 'scripts'].map((d) =>
  path.resolve(__dirname, '../..', d)
);
const SCHEMA_PATH = path.resolve(
  __dirname,
  '../../infrastructure/supabase/00_complete-schema.sql',
);

// Names that appear in .from() but are not real Supabase table references —
// they are `Buffer.from(...)` / mock fixture literals matched by the same
// regex. Every entry here MUST be verified to be a non-DB call; do NOT
// allowlist a suspected typo. (`'sessions'` was previously here classified as
// "alias / ambiguous"; it was actually a literal typo for `chat_sessions` and
// the misclassification masked two production runtime crashes for months.)
const IGNORED_REFERENCES = new Set([
  'mock-excel',          // Buffer.from('mock-excel') in tests/excel-export.test.js
  'fake audio data',     // Buffer.from('fake audio data') in audio test fixtures
  'speech',              // Buffer.from('speech') in bug-005-audio-document.test.js
  'mock',                // Buffer.from('mock') in __mocks__/supabase.js
]);

// RPC names referenced only from test code (never production) — clones don't need them.
const IGNORED_RPCS = new Set([
  'get_column_info', // test-only introspection helper (bot/tests/video/style-selection.test.js)
]);

/**
 * Extract all CREATE [OR REPLACE] FUNCTION names from the schema SQL,
 * tolerating an optional `public.` schema qualifier.
 */
function extractCreateFunctions(sqlContent) {
  const fns = new Set();
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  let match;
  while ((match = re.exec(sqlContent)) !== null) {
    fns.add(match[1].toLowerCase());
  }
  return fns;
}

const isTestFile = (p) => /(^|\/)(tests?|__tests__)\//.test(p) || /\.test\.js$/.test(p);

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
  let schemaFunctions;
  let codeTableRefs;
  let codeRpcRefs;

  beforeAll(() => {
    // Read schema SQL
    schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    schemaTables = extractCreateTables(schemaSQL);
    schemaFunctions = extractCreateFunctions(schemaSQL);

    // Scan every shipped source directory for table references; RPCs from
    // production files only. Scope widened from bot/-only in bd-1850 to catch
    // dashboard/ and scripts/ drift (e.g. `.from('schools')` in
    // dashboard/scripts/* that escaped the original BOT_DIR-only guard).
    codeTableRefs = new Set();
    codeRpcRefs = new Set();
    const jsFiles = SOURCE_DIRS.flatMap((dir) =>
      fs.existsSync(dir) ? findJsFiles(dir) : []
    );

    for (const filePath of jsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const refs = extractTableReferences(content);
      for (const ref of refs) {
        if (!IGNORED_REFERENCES.has(ref)) {
          codeTableRefs.add(ref);
        }
      }
      if (!isTestFile(filePath)) {
        for (const rpc of extractRpcReferences(content)) {
          if (!IGNORED_RPCS.has(rpc)) codeRpcRefs.add(rpc);
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
  // Every production .rpc() has a CREATE FUNCTION
  // -------------------------------------------------------------------------
  describe('all code-referenced RPCs exist in schema', () => {
    it('should have a CREATE [OR REPLACE] FUNCTION for every .rpc() in production bot code', () => {
      const missing = [];
      for (const rpc of codeRpcRefs) {
        if (!schemaFunctions.has(rpc)) missing.push(rpc);
      }
      missing.sort();
      // (message intentionally mirrors the table assertion's guidance)
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
