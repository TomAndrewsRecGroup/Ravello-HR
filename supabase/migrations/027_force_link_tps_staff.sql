-- ======================================================================
--  Migration 027: Force-link ALL tps_admin / tps_client to demo company
--
--  Migration 025 only linked profiles with company_id IS NULL.
--  This migration force-links ALL tps_admin/tps_client users
--  regardless of their current company_id state.
-- ======================================================================

-- Force-link every tps_admin and tps_client to the demo company
UPDATE profiles
SET company_id = '00000000-0000-0000-0000-000000000001',
    onboarding_completed = true
WHERE role IN ('tps_admin', 'tps_client');

-- Also update the trigger to always set company_id for staff
-- (not just when NULL) — handles reassignment scenarios
CREATE OR REPLACE FUNCTION link_tps_staff_to_demo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  demo_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NEW.role IN ('tps_admin', 'tps_client') THEN
    NEW.company_id := demo_id;
    NEW.onboarding_completed := true;
  END IF;
  RETURN NEW;
END;
$$;
