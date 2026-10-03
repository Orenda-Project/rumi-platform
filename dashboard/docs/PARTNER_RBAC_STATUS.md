# Partner RBAC — Feature Overview

Role-based access control for the observability dashboard: database foundation,
invitation system, and admin user management, with testing notes below.

---

## Partner roles get no teacher data from the released schema (2026-10-04)

**What changed.** The released SQL (`infrastructure/supabase/00_complete-schema.sql`,
`01_rls-policies.sql` and the migration `V2.11.0__portal_access.sql`) creates the
`portal_app_user` role the dashboard switches to for every signed-in request, and one
`portal_app_user_access` policy on every table with row-level security. That policy lets
rows through only while the dashboard user set on the connection
(`set_portal_user_context`) is active and has an **unscoped** role: `super_admin`, `admin`
or `viewer`. The check lives in one function, `portal_user_is_unscoped()`, which only
`portal_app_user` may call.

**The known limit.** `partner_admin`, `partner_viewer` and any other role get **no rows**
from any of those tables through the dashboard's database role: no teachers (`users`), no
`conversations`, `coaching_sessions`, `lesson_plan_requests`, `video_requests`,
`reading_assessments`, and none of the other teacher-data tables. This is deliberate: a
policy that only asked "is someone signed in" handed a school-scoped partner every teacher
and every private conversation in the database. The scoped policies in
`dashboard/database/migrations/018_partner_rbac_system.sql` and
`019_rls_related_tables.sql` (which apply a partner's `access_scopes` row) are not part of
the released schema, and as written they target `service_role`, not `portal_app_user`, so
they would not help even where an operator has run them.

What a partner sees today:
- Sign-in works, and the feature checks still open the partner pages (the
  `feature_permissions` rows for the partner roles are seeded `true` on purpose, so those
  pages come back without a seed change once scoped policies exist).
- Pages that read the tables (a teacher's detail and conversations, coaching, videos,
  lesson plans, reading) show nothing.
- Pages that read the scoped materialized views (`mv_users_activity` and friends, filtered
  in the query by `services/materialized-views.service.js`) work only where the dashboard
  migrations that create those views (022, 024) have been run; the released schema does
  not create them.

**What an operator should do.**
- Run the dashboard with `super_admin` (or the legacy `admin` / `viewer`) accounts for
  internal staff. Those roles see everything, as before.
- Do not invite partners yet, or tell them their pages will be empty. Do not "fix" empty
  partner pages by adding a broad policy for `portal_app_user`: it would show every partner
  every teacher.
- If you applied an earlier, unreleased build of `V2.11.0__portal_access.sql` (its policy
  was `NULLIF(current_setting('app.portal_user_id', true), '') IS NOT NULL`), run the
  current file once by hand with `psql -v ON_ERROR_STOP=1 -f ...`. `migrate.js` skips a
  version that is already recorded, and the file replaces the open policy by name. Check
  with `SELECT count(*) FROM pg_policies WHERE policyname = 'portal_app_user_access' AND
  qual LIKE '%IS NOT NULL%';` (expect 0).
- To give partners data, port the scoped policies: add policies `TO portal_app_user` on the
  teacher-data tables that match the partner's `access_scopes` row, reading
  `dashboard_users` / `access_scopes` through a `SECURITY DEFINER` function (as
  `portal_user_is_unscoped()` does) so the policy does not recurse through the RLS on those
  tables. They are additive to the unscoped policy.

---

## Phase 1: Database & Backend Foundation ✅ COMPLETE

### Database Schema
- ✅ Migration 020: Invitations table created
- ✅ Access scopes table updated with `updated_at` column
- ✅ Trigger for auto-updating `updated_at` timestamp
- ✅ Validation function `is_invitation_valid()`
- ✅ Indexes on invitations table for performance
- ✅ Database permissions (SELECT on all tables for portal_app_user)

### Backend Services
- ✅ Access Scope Service (`services/access-scope.service.js`)
  - Create/read/update/delete scopes
  - Validate scope configurations
  - Apply RLS filters
- ✅ Resend Email Service (`services/resend-email.service.js`)
  - Send invitation emails
  - Send password reset emails
  - HTML + plain text templates
- ✅ Database Context Middleware
  - Sets `portal_app_user` role for RLS enforcement
  - Applies on all routes except auth endpoints

### Row-Level Security (RLS)
- ✅ RLS policies on all data tables
- ✅ Super admin bypass (role = 'super_admin')
- ✅ Partner admin filtering by access scope
- ✅ Scope types: all, country, school, phone_list, combined

---

## Phase 2: Invitation System ✅ COMPLETE

### Invitation Creation
- ✅ `/observability/admin/invitations` page
- ✅ Full scope builder UI with 5 scope types
- ✅ School autocomplete from database
- ✅ Preview user access before sending
- ✅ Email/role/scope validation

### Invitation Management
- ✅ Pending invitations list
- ✅ Resend invitation email
- ✅ Revoke invitation
- ✅ Recent invitations history
- ✅ Expiration tracking (7 days)

### Password Setup Flow
- ✅ `/setup-password?token=xxx` endpoint
- ✅ Token validation
- ✅ Password strength requirements
- ✅ User creation on acceptance
- ✅ Scope assignment from invitation

### Email Integration
- ✅ Resend API integration
- ✅ Branded HTML email templates
- ✅ Role-specific messaging
- ✅ Secure token generation (crypto.randomBytes)

---

## Phase 3: Admin User Management ✅ COMPLETE

### User Management Page
- ✅ `/observability/admin/users` page (super admin only)
- ✅ Card-based user display
- ✅ User details: username, email, role, status, last login
- ✅ Scope summary display
- ✅ "No scope configured" warning

### Filtering & Search
- ✅ Filter by role (all/super_admin/partner_admin/partner_viewer)
- ✅ Filter by status (all/active/inactive)
- ✅ Filter by scope type (all/country/school/phone_list/combined)
- ✅ Empty state when no results

### Scope Management
- ✅ "Manage Scope" button for partner admins
- ✅ Full-featured scope editor modal
- ✅ Load existing scope data
- ✅ Switch between scope types
- ✅ Add/remove country codes
- ✅ Add/remove school names (with autocomplete)
- ✅ Add/remove phone numbers
- ✅ Combined scope (countries + schools)
- ✅ API endpoints:
  - GET `/api/admin/users/:userId/scope`
  - PUT `/api/admin/users/:userId/scope`
  - POST `/api/admin/users/:userId/scope`

### User Actions
- ✅ Deactivate user
- ✅ Reactivate user
- ✅ Audit log placeholder (coming in Phase 5)

### Bulk Actions
- ✅ Select all / deselect all
- ✅ Multi-select checkboxes
- ✅ Bulk deactivate button
- ✅ Selected count display
- ✅ API endpoint: POST `/api/admin/users/bulk-deactivate`

---

## Phase 4: Comprehensive Testing ⏳ IN PROGRESS

### Backend Testing ✅ COMPLETE
- ✅ Test scope creation for all types (Code Review)
- ✅ Test scope updates (Code Review)
- ✅ Test scope deletion (Code Review)
- ✅ Verify RLS policies exist and enabled (Database Verified)
- ✅ Verify RLS super admin bypass logic (Database Verified)
- ✅ Verify RLS scope filtering logic (Database Verified)
- ✅ Test invitation flow code (Code Review)
- ✅ Self-deactivation prevention (Code Review)
- ✅ Audit logging implementation (Code Review + Database Verified)

### Frontend Testing (Code Review ✅, Manual Testing Pending)
- ✅ Code Review: User management page filtering logic
- ✅ Code Review: Scope editor modal implementation
- ✅ Code Review: Bulk actions functionality
- ✅ Code Review: Deactivate/reactivate endpoints
- ⏸️ **Manual Test**: Open scope modal, test all 5 scope types
- ⏸️ **Manual Test**: Verify filtering works (role/status/scope)
- ⏸️ **Manual Test**: Bulk select and deactivate
- ⏸️ **Manual Test**: UI updates after actions

### Email Testing
- ✅ Code Review: Resend API integration
- ✅ Code Review: HTML template with role badges
- ✅ Code Review: Setup link generation
- ⏸️ **Manual Test**: Send test invitation, verify email delivery
- ⏸️ **Manual Test**: Complete password setup flow
- ⏸️ **Manual Test**: Verify branded template renders correctly

### Security Testing
- ✅ Database Verified: RLS enabled on all tables
- ✅ Database Verified: Super admin bypass logic
- ✅ Database Verified: Country code normalization (+94 → 94)
- ✅ Database Verified: country-scoped user counts resolve correctly
- ⏸️ **Manual Test**: Create partner admin, verify scoped access
- ⏸️ **Manual Test**: Test a country scope (e.g. +94) shows the expected user count
- ⏸️ **Manual Test**: Verify partner can't access out-of-scope data
- ⏸️ **Manual Test**: Try direct URL to out-of-scope conversation

---

## Phase 5: Production Rollout ⏸️ NOT STARTED

### Initial Setup
- ❌ Create production super admin accounts
- ❌ Document credential management
- ❌ Set up monitoring alerts

### Partner Onboarding
- ❌ Identify initial partner organizations
- ❌ Define scope configurations
- ❌ Send invitations
- ❌ Support password setup

### Monitoring
- ❌ Monitor RLS performance
- ❌ Monitor email delivery rates
- ❌ Track invitation acceptance rates
- ❌ Review audit logs

### Documentation
- ❌ Create partner admin user guide
- ❌ Document scope configuration best practices
- ❌ Create troubleshooting guide

---

## Known Issues

### Resolved
- ✅ Test accounts cleaned up
- ✅ Database permissions fixed (conversations table)
- ✅ Migration 020 idempotency fixed (DROP TRIGGER IF EXISTS)
- ✅ API endpoints returning HTML instead of JSON (commit 324f33c)
  - **Problem**: Deactivate/reactivate/scope endpoints returned HTML login page
  - **Root Cause**: Old requireAuth middleware redirects (not JSON)
  - **Fix**: Removed requireAuth, requireSuperAdmin already checks auth + returns JSON
  - **Affected Endpoints**: All 7 user management API endpoints fixed
- ✅ Navigation template error - currentPage undefined (commit 84abdc6)
  - **Problem**: Portal pages failed to load with "currentPage is not defined"
  - **Root Cause**: Dashboard/admin routes missing currentPage parameter in res.render()
  - **Fix**: Added currentPage to dashboard, admin-users, and admin-invitations routes
  - **Affected Routes**: /observability/dashboard, /observability/admin/users, /observability/admin/invitations
- ✅ Missing RLS policies for portal_app_user (Database Fix - Jan 13, 2026)
  - **Problem**: Conversations and feature data returned HTTP 500 errors for all users including super admins
  - **Root Cause**: conversations, coaching_sessions, lesson_plan_requests, video_requests tables had RLS enabled but no SELECT policies for portal_app_user role
  - **Fix**: Created 4 RLS policies with super admin bypass logic for all tables
  - **Affected Tables**: conversations, coaching_sessions, lesson_plan_requests, video_requests
  - **Policy Logic**: Super admins bypass all filters, partner admins filtered by access scope

### Open
- Partner roles get no teacher data from the released schema: see "Partner roles get no teacher data from the released schema (2026-10-04)" above.

---

## Recent Deployments

| Date | Commit | Description |
|------|--------|-------------|
| Jan 13, 2026 | Database | **FIX**: Missing RLS policies for portal_app_user on 4 tables |
| Jan 13, 2026 | `84abdc6` | **FIX**: Navigation template error (currentPage undefined) |
| Jan 13, 2026 | `324f33c` | **FIX**: API endpoints returning HTML instead of JSON |
| Jan 13, 2026 | `4dee470` | Phase 4 Testing: Code review and database verification |
| Jan 13, 2026 | `34e9341` | Fix country code scope (+94 Sri Lanka normalization) |
| Jan 13, 2026 | `d518df9` | Polish invitations page to match minimal aesthetic |
| Jan 13, 2026 | `e99c5b5` | Polish Partner RBAC UI to match Rumi minimal aesthetic |
| Jan 13, 2026 | `2f8ca55` | Implement inline scope editing in admin users page |
| Jan 13, 2026 | `43cd7da` | Merge conflict resolution (dashboard stats + RBAC users) |
| Jan 13, 2026 | `9d08d51` | Initial Partner RBAC implementation (Phases 1-3) |

---

## Next Steps

### ✅ Completed Today (Jan 13, 2026)
1. Code review of all 36 tests → 21 passed via code review
2. Database verification (RLS, permissions, audit logging)
3. Country code normalization fix verified (+94 scope resolves correctly)
4. Created comprehensive test execution report (PHASE_4_TEST_EXECUTION.md)

### 🔄 In Progress (Manual Testing)
1. **Critical Priority**:
   - [ ] Test a +country-code preview (verify it shows the expected user count)
   - [ ] Create test partner admin via invitation
   - [ ] Log in as partner admin, verify RLS enforcement

2. **High Priority**:
   - [ ] Test scope modal for all 5 types (country, school, phone_list, combined, all)
   - [ ] Test filtering (role/status/scope) on admin users page
   - [ ] Send test invitation email, verify delivery

3. **Medium Priority**:
   - [ ] Test bulk deactivate (select 3 users)
   - [ ] Test self-deactivation prevention
   - [ ] Complete password setup flow

### 📋 Phase 5 Prep
1. Identify real partner organizations
2. Define scope configurations
3. Create partner onboarding documentation
