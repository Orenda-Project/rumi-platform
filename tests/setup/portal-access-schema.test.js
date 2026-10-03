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
 *   - 01 gives it a policy on every RLS table, or it would read zero rows, and
 *     that policy lets rows through only for the unscoped dashboard roles
 *     (super_admin, admin, viewer): a partner role gets no teacher data until
 *     scoped policies exist;
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

/**
 * Each portal_app_user policy in a SQL text: its name, USING and WITH CHECK.
 * The policies are built inside a format() call, so the text between the
 * policy and the end of that call is what grants rows.
 */
function portalPolicies(sql) {
  const out = [];
  for (const m of sql.matchAll(/CREATE POLICY (\w+) ON [^\n]*?TO portal_app_user([\s\S]*?)\$p\$/g)) {
    const body = m[2];
    const using = body.match(/USING\s*([\s\S]*?)(?:\s+WITH CHECK|$)/);
    const check = body.match(/WITH CHECK\s*([\s\S]*)$/);
    out.push({ name: m[1], body, using: using && using[1].trim(), check: check && check[1].trim() });
  }
  return out;
}

const UNSCOPED_CHECK = '((SELECT public.portal_user_is_unscoped()))';

describe.each([
  ['01_rls-policies.sql', RLS],
  ['V2.11.0', MIGRATION],
])('%s: rows the role can see', (_name, sql) => {
  test('every RLS table gets a portal_app_user policy', () => {
    expect(sql).toMatch(/c\.relrowsecurity/);
    expect(sql).toMatch(/CREATE POLICY portal_app_user_access ON public\.%I FOR ALL TO portal_app_user/);
  });

  // The dashboard signs in partner roles too, and the policy runs over every
  // RLS table (users, conversations, coaching_sessions, ...). A policy that
  // only asks "is someone signed in" hands a school-scoped partner every
  // teacher in the database. Until scoped policies exist, rows go only to the
  // unscoped dashboard roles.
  test('every portal_app_user policy grants rows only through the unscoped-role check, reading and writing', () => {
    const policies = portalPolicies(sql);
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      expect({ name: p.name, using: p.using, check: p.check })
        .toEqual({ name: p.name, using: UNSCOPED_CHECK, check: UNSCOPED_CHECK });
    }
  });

  test('no portal_app_user policy names a partner role, or lets in anyone merely signed in', () => {
    for (const p of portalPolicies(sql)) {
      expect(p.body).not.toMatch(/partner_admin|partner_viewer/);
      expect(p.body).not.toMatch(/IS NOT NULL/);
    }
  });

  test('replaces a policy of the same name left by an earlier run', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS portal_app_user_access ON public\.%I/);
  });
});

/** The body of the portal_user_is_unscoped() definition in a SQL text. */
function unscopedFunction(sql) {
  const m = sql.match(/CREATE OR REPLACE FUNCTION public\.portal_user_is_unscoped\(\)([\s\S]*?)\$function\$([\s\S]*?)\$function\$/);
  return m && { header: m[1], body: m[2] };
}

describe.each([
  ['00_complete-schema.sql', SCHEMA],
  ['V2.11.0', MIGRATION],
])('%s: portal_user_is_unscoped()', (_name, sql) => {
  test('is defined, takes no arguments, and answers only about the signed-in dashboard user', () => {
    const fn = unscopedFunction(sql);
    expect(fn).not.toBeNull();
    expect(fn.body).toMatch(/current_setting\('app\.portal_user_id', true\)/);
    expect(fn.body).toMatch(/FROM public\.dashboard_users/);
  });

  test('lets in only super_admin, admin and viewer, and only while active', () => {
    const { body } = unscopedFunction(sql);
    const list = body.match(/role IN \(([^)]*)\)/);
    expect(list).not.toBeNull();
    const roles = [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(roles).toEqual(['admin', 'super_admin', 'viewer']);
    expect(body).not.toMatch(/partner/);
    expect(body).toMatch(/is_active IS TRUE/);
  });

  // It reads dashboard_users, which has RLS and this same policy: as an
  // invoker function it would see no rows (or recurse). It runs as its owner
  // instead, with a fixed search_path so nothing on the caller's path is used.
  test('is SECURITY DEFINER with a fixed search_path, stable, returning boolean', () => {
    const { header } = unscopedFunction(sql);
    expect(header).toMatch(/RETURNS boolean/);
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/STABLE/);
    expect(header).toMatch(/SET search_path = pg_catalog, public/);
  });

  test('only portal_app_user may call it', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.portal_user_is_unscoped\(\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.portal_user_is_unscoped\(\) FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.portal_user_is_unscoped\(\) TO portal_app_user/);
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
