-- ════════════════════════════════════════════════════════════════════════
-- Migration 049: Retire deprecated user roles
-- ────────────────────────────────────────────────────────────────────────
-- Three roles are being removed from active use:
--
--   • tps_client      → migrate to tps_admin (was a synonym, never a
--                       distinct permission tier in practice)
--   • client_user     → migrate to client_editor (already done in 046,
--                       repeated here in case any rows leaked through)
--   • client_viewer   → CODE-ONLY alias. Never added to the enum, so
--                       no rows can ever have it; just remove the
--                       label from app code (already done in 049's
--                       sister commit). No DB migration needed.
--
-- This migration also DROPS the link_tps_staff_to_demo() function from
-- migrations 025/027. That function backed a trigger (trg_link_tps_staff)
-- that force-set every staff profile's company_id to the demo UUID on
-- every UPDATE. After the factory reset wiped the demo company, every
-- attempt to update a staff profile failed the FK check because the
-- trigger kept stamping the dead UUID back in. Dropping the trigger and
-- function unblocks ordinary profile maintenance.
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
-- 1. Drop every trigger on profiles that depends on the demo-link
--    function, then drop the function itself.
--
--    Belt-and-braces: query pg_trigger by function name (catches any
--    rename), then DROP FUNCTION ... CASCADE as a final safety net.
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  trg RECORD;
BEGIN
  FOR trg IN
    SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE p.proname = 'link_tps_staff_to_demo'
       AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON profiles', trg.tgname);
    RAISE NOTICE 'Dropped trigger %', trg.tgname;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS link_tps_staff_to_demo() CASCADE;


-- ────────────────────────────────────────────────────────────────────────
-- 2. Migrate any rows still using deprecated roles
--    (client_viewer was a code-only alias — never added as an enum
--    value — so we don't reference it here. Postgres rejects the
--    literal at parse time even with a 0-row WHERE clause.)
-- ────────────────────────────────────────────────────────────────────────

UPDATE profiles SET role = 'tps_admin'     WHERE role = 'tps_client';
UPDATE profiles SET role = 'client_editor' WHERE role = 'client_user';


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
  COUNT(*) FILTER (WHERE role = 'client_user')   AS leftover_client_user
FROM profiles;

-- Confirm the demo-link function is gone (should return 0 rows)
SELECT proname FROM pg_proc WHERE proname = 'link_tps_staff_to_demo';
