-- Migration 023: Fix Materialized View Permissions
--
-- Issue: Permission denied for materialized views
-- Root Cause: GRANTs were only to 'authenticated' and 'service_role' Supabase roles,
--             but portal connects directly with postgres or a custom role
--
-- Fix: Grant SELECT to PUBLIC (all roles)
--
-- Author: Claude Code
-- Date: January 23, 2026
-- Bead: bd-046

-- Grant SELECT on all materialized views to PUBLIC
GRANT SELECT ON mv_dashboard_stats TO PUBLIC;
GRANT SELECT ON mv_users_activity TO PUBLIC;
GRANT SELECT ON mv_retention_cohorts TO PUBLIC;
GRANT SELECT ON mv_view_refresh_status TO PUBLIC;

-- Also grant to postgres explicitly (the direct connection role)
GRANT SELECT ON mv_dashboard_stats TO postgres;
GRANT SELECT ON mv_users_activity TO postgres;
GRANT SELECT ON mv_retention_cohorts TO postgres;
GRANT SELECT ON mv_view_refresh_status TO postgres;

-- Verify grants
SELECT
  schemaname,
  matviewname,
  matviewowner,
  hasindexes
FROM pg_matviews
WHERE matviewname LIKE 'mv_%';
