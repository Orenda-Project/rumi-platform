'use strict';
/**
 * The database side of the admin dashboard's access checks, in released SQL.
 *
 * Every signed-in admin request runs `SET ROLE portal_app_user` and
 * `set_portal_user_context(<id>)` (dashboard/middleware/rbac/database-context.js),
 * and every guarded route looks up feature_permissions for (role, feature) and
 * answers 403 when there is no row (middleware/rbac/feature-access.js). A
 * database built from 00/01/02 had neither the role nor a single permission
 * row, so admin sign-in worked and then every page failed.
 *
 * Checked here without a database, against what the dashboard really uses:
 *   - 00 creates the role (guarded: roles are cluster-wide), lets the schema's
 *     own role switch to it, and grants it the tables;
 *   - 01 gives it a policy on every RLS table, or it would read zero rows;
 *   - 02 and V2.11.0 seed a row for every feature key a route checks, for every
 *     role the dashboard signs in;
 *   - V2.11.0 has the shape migrate.js needs and records only its own version.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

const SCHEMA = stripComments(read('infrastructure/supabase/00_complete-schema.sql'));
const RLS = stripComments(read('infrastructure/supabase/01_rls-policies.sql'));
const SEED = stripComments(read('infrastructure/supabase/02_seed-data.sql'));
const MIGRATION_REL = 'infrastructure/supabase/migrations/V2.11.0__portal_access.sql';
const MIGRATION = fs.existsSync(path.join(ROOT, MIGRATION_REL)) ? stripComments(read(MIGRATION_REL)) : '';

/** Every feature key a dashboard route checks with requireFeatureAccess('<key>'). */
function checkedFeatureKeys() {
  const keys = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (['node_modules', 'tests', 'portal-frontend'].includes(e.name)) continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) {
        // Code lines only: the JSDoc examples name features no route checks.
        const code = read(rel).split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
        for (const m of code.matchAll(/requireFeatureAccess\(\s*'([a-z_]+)'\s*\)/g)) keys.add(m[1]);
      }
    }
  };
  walk('dashboard');
  return [...keys].sort();
}

/** Every role the dashboard lets sign in (the union of rbac.js's requireRole lists). */
function dashboardRoles() {
  const src = read('dashboard/middleware/rbac/rbac.js');
  const roles = new Set();
  for (const m of src.matchAll(/requireRole\(\s*(\[[^\]]*\]|'[a-z_]+')\s*\)/g)) {
    for (const r of m[1].matchAll(/'([a-z_]+)'/g)) roles.add(r[1]);
  }
  return [...roles].sort();
}

/** (role, feature_key) pairs inserted into feature_permissions by a SQL text. */
function seededPairs(sql) {
  const pairs = new Set();
  for (const block of sql.matchAll(/INSERT INTO feature_permissions\s*\(role, feature_key, can_access\)\s*VALUES([\s\S]*?)ON CONFLICT DO NOTHING;/g)) {
    for (const m of block[1].matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*(true|false)\)/g)) pairs.add(`${m[1]}:${m[2]}`);
  }
  return pairs;
}

describe('what the dashboard checks', () => {
  test('the keys and roles are found', () => {
    expect(checkedFeatureKeys()).toEqual(expect.arrayContaining(['dashboard', 'users', 'user_management', 'invites']));
    expect(dashboardRoles()).toEqual(['admin', 'partner_admin', 'partner_viewer', 'super_admin', 'viewer']);
  });
});

describe.each([
  ['00_complete-schema.sql', SCHEMA],
  ['V2.11.0', MIGRATION],
])('%s: the portal_app_user role', (_name, sql) => {
  test('is created only if missing, cannot log in, and is not a bypass-RLS role', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'portal_app_user'\) THEN\s+CREATE ROLE portal_app_user NOLOGIN/);
    expect(sql).not.toMatch(/CREATE ROLE portal_app_user[^;]*BYPASSRLS/);
  });

  test('the role that owns the schema may switch to it', () => {
    expect(sql).toMatch(/GRANT portal_app_user TO CURRENT_USER/);
  });

  test('can use the schema, read and write its tables, and use its sequences, now and later', () => {
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA public TO portal_app_user/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app_user/);
    expect(sql).toMatch(/GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app_user/);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app_user/);
  });

  test('gets no more function rights than PUBLIC has (exec_sql stays service_role only)', () => {
    expect(sql).not.toMatch(/GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO[^;]*portal_app_user/);
    expect(sql).not.toMatch(/GRANT[^;]*exec_sql[^;]*portal_app_user/);
  });
});

describe('00_complete-schema.sql', () => {
  test('grants come after the last CREATE TABLE, so they cover every table', () => {
    const grant = SCHEMA.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app_user');
    const lastTable = SCHEMA.lastIndexOf('CREATE TABLE');
    expect(grant).toBeGreaterThan(lastTable);
    expect(SCHEMA.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
  });
});

describe.each([
  ['01_rls-policies.sql', RLS],
  ['V2.11.0', MIGRATION],
])('%s: rows the role can see', (_name, sql) => {
  test('every RLS table gets a portal_app_user policy, live only once a signed-in admin is set', () => {
    expect(sql).toMatch(/c\.relrowsecurity/);
    expect(sql).toMatch(/CREATE POLICY portal_app_user_access ON public\.%I FOR ALL TO portal_app_user/);
    expect(sql).toMatch(/NULLIF\(current_setting\('app\.portal_user_id', true\), ''\) IS NOT NULL/);
  });
});

describe.each([
  ['02_seed-data.sql', SEED],
  ['V2.11.0', MIGRATION],
])('%s: feature_permissions', (_name, sql) => {
  test('has a row for every checked feature key, for every dashboard role', () => {
    const pairs = seededPairs(sql);
    const missing = [];
    for (const role of dashboardRoles()) {
      for (const key of checkedFeatureKeys()) if (!pairs.has(`${role}:${key}`)) missing.push(`${role}:${key}`);
    }
    expect(missing).toEqual([]);
  });

  test('super_admin can open every checked feature; invites stay super_admin only', () => {
    for (const key of checkedFeatureKeys()) expect(sql).toContain(`('super_admin', '${key}', true)`);
    for (const role of ['admin', 'viewer', 'partner_admin', 'partner_viewer']) {
      expect(sql).toContain(`('${role}', 'invites', false)`);
    }
  });
});

describe('V2.11.0 migration', () => {
  test('exists, as one DO block with no transaction commands', () => {
    expect(MIGRATION).not.toBe('');
    expect(MIGRATION.match(/^DO \$\$/gm) || []).toHaveLength(1);
    expect(MIGRATION).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
  });

  test('records only 2.11.0, inside the block, then reloads the API schema', () => {
    const versions = [...MIGRATION.matchAll(/INSERT INTO schema_versions[\s\S]*?VALUES\s*\('([\d.]+)'/g)].map((m) => m[1]);
    expect(versions).toEqual(['2.11.0']);
    const insert = MIGRATION.indexOf('INSERT INTO schema_versions');
    expect(insert).toBeGreaterThan(MIGRATION.indexOf('DO $$'));
    expect(insert).toBeLessThan(MIGRATION.indexOf('END $$;'));
    expect(MIGRATION).toMatch(/VALUES \('2\.11\.0', '[^']+'\)\s*ON CONFLICT \(version\) DO NOTHING;/);
    expect(MIGRATION.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
  });
});
