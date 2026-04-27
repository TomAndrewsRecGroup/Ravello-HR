-- ════════════════════════════════════════════════════════════════════════
-- Migration 049: Retire deprecated user roles
-- ────────────────────────────────────────────────────────────────────────
-- Three roles are being removed from active use:
--
--   • tps_client      → migrate to tps_admin (was a synonym, never a
--                       distinct permission tier in practice)
--   • client_user     → migrate to client_editor (already done in 046,
--                       repeated here in case any rows leaked through)
--   • client_viewer   → migrate to client_editor (legacy code path)
--
-- This migration also DROPS the link_tps_staff_to_demo() trigger and
-- function from migration 027. That trigger force-set every staff
-- profile's company_id to '00000000-0000-0000-0000-000000000001' on
-- every UPDATE. After the factory reset wiped the demo company, every
-- attempt to update a staff profile failed the FK check because the
-- trigger kept stamping the dead UUID back in. Dropping it unblocks
-- ordinary profile maintenance.
--
-- NOTE on enum values: Postgres does not support DROP VALUE on enums
-- without rebuilding the type (and re-pointing every column / policy /
-- function that references it — high blast radius). We leave the enum
-- labels in place; with no rows or code referencing them they are
-- inert. If you ever rebuild the enum, do it in its own migration.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. Drop the demo-company trigger from migration 027
--    (Trigger name varies across environments — trg_link_tps_staff in
--    most, link_tps_staff_to_demo_trigger in older envs. Use CASCADE on
--    the function drop so any dependent trigger comes off too.)
-- ────────────────────────────────────────────────────────────────────────

DROP TRIGGER  IF EXISTS trg_link_tps_staff             ON profiles;
DROP TRIGGER  IF EXISTS link_tps_staff_to_demo_trigger ON profiles;
DROP TRIGGER  IF EXISTS link_tps_staff_to_demo         ON profiles;
DROP FUNCTION IF EXISTS link_tps_staff_to_demo() CASCADE;


-- ────────────────────────────────────────────────────────────────────────
-- 2. Migrate any rows still using deprecated roles
-- ────────────────────────────────────────────────────────────────────────

UPDATE profiles SET role = 'tps_admin'     WHERE role = 'tps_client';
UPDATE profiles SET role = 'client_editor' WHERE role IN ('client_user', 'client_viewer');


-- ────────────────────────────────────────────────────────────────────────
-- 3. Clear stale company_id refs left over from the factory reset
-- ────────────────────────────────────────────────────────────────────────

UPDATE profiles
   SET company_id = NULL
 WHERE company_id IS NOT NULL
   AND company_id NOT IN (SELECT id FROM companies);


-- ────────────────────────────────────────────────────────────────────────
-- 4. Rebuild is_tps_staff() — only tps_admin counts as staff now
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND role = 'tps_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_tps_staff() TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 5. Verification
-- ────────────────────────────────────────────────────────────────────────

SELECT role, COUNT(*) AS n FROM profiles GROUP BY role ORDER BY role;

SELECT
  COUNT(*) FILTER (WHERE role = 'tps_client')    AS leftover_tps_client,
  COUNT(*) FILTER (WHERE role = 'client_user')   AS leftover_client_user,
  COUNT(*) FILTER (WHERE role = 'client_viewer') AS leftover_client_viewer
FROM profiles;
