-- ======================================================================
--  Migration 025: Auto-link tps_admin / tps_client to demo company
--
--  Root cause: migration 024 runs UPDATE profiles SET company_id = demo
--  WHERE role IN ('tps_admin','tps_client'), but those profiles may not
--  exist yet at migration time (users sign up AFTER migrations run).
--
--  Fix: a trigger that fires on INSERT or UPDATE of profiles.role and
--  automatically links tps_admin/tps_client users to the demo company
--  when they have no company_id assigned.  Also re-runs the seed link
--  for any existing unlinked tps staff.
-- ======================================================================

-- 1. Create a function that auto-links staff to the demo company
CREATE OR REPLACE FUNCTION link_tps_staff_to_demo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  demo_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Only act on tps_admin or tps_client roles
  IF NEW.role IN ('tps_admin', 'tps_client') THEN
    -- Only set company_id if it is currently NULL
    IF NEW.company_id IS NULL THEN
      NEW.company_id := demo_id;
    END IF;
    -- Always mark onboarding as completed for TPO staff
    NEW.onboarding_completed := true;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Create trigger on profiles (fires BEFORE insert or update of role)
DROP TRIGGER IF EXISTS trg_link_tps_staff ON profiles;
CREATE TRIGGER trg_link_tps_staff
  BEFORE INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION link_tps_staff_to_demo();

-- 3. Back-fill any existing tps_admin/tps_client users that are unlinked
UPDATE profiles
SET company_id = '00000000-0000-0000-0000-000000000001',
    onboarding_completed = true
WHERE role IN ('tps_admin', 'tps_client')
  AND company_id IS NULL;
