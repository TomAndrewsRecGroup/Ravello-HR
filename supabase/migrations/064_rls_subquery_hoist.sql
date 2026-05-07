-- ═══════════════════════════════════════════════════════════
-- Phase 64: Hoist remaining is_tps_staff() inline calls into
-- (SELECT ...) subqueries so the planner evaluates them once
-- per query rather than once per row.
--
-- Migration 044 did the bulk of this work. These three policies
-- (from migrations 003, 011, 013) were missed and still call the
-- function inline. On any wide RLS scan over bd_companies /
-- bd_scanned_roles / jd_templates / partner_api_keys we pay the
-- function dispatch per row — visible on the BD pipeline + admin
-- candidates pages once the dataset grows.
--
-- Safe to re-run. Drops + recreates each policy under the same
-- name so RLS is never disabled mid-migration.
-- ═══════════════════════════════════════════════════════════

-- bd_companies / bd_scanned_roles
DROP POLICY IF EXISTS "tps_bd_companies"      ON bd_companies;
CREATE POLICY        "tps_bd_companies"      ON bd_companies      FOR ALL USING ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS "tps_bd_scanned_roles"  ON bd_scanned_roles;
CREATE POLICY        "tps_bd_scanned_roles"  ON bd_scanned_roles  FOR ALL USING ((SELECT public.is_tps_staff()));

-- jd_templates: discover the original policy name + recreate
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
     WHERE polrelid = 'public.jd_templates'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON jd_templates', pol.polname);
  END LOOP;
END $$;

CREATE POLICY "jd_templates_staff_all" ON jd_templates
  FOR ALL USING ((SELECT public.is_tps_staff()));

-- partner_api_keys
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
     WHERE polrelid = 'public.partner_api_keys'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON partner_api_keys', pol.polname);
  END LOOP;
END $$;

CREATE POLICY "partner_api_keys_staff_all" ON partner_api_keys
  FOR ALL USING ((SELECT public.is_tps_staff()));
