-- ======================================================================
--  Migration 029: Add get_my_profile() SECURITY DEFINER function
--
--  The middleware needs to read the current user's profile to stamp
--  the session cookie. But the profiles table has RLS policies that
--  can cause circular dependency issues with is_tps_staff().
--
--  Solution: a SECURITY DEFINER function that bypasses RLS entirely,
--  similar to get_my_role() but returns the full profile row.
-- ======================================================================

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (
  company_id UUID,
  ui_preferences JSONB,
  onboarding_completed BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT p.company_id, p.ui_preferences, p.onboarding_completed
  FROM profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;
