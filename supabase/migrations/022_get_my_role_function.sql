-- ══════════════════════════════════════════════════════════════
--  Migration 022: get_my_role() SECURITY DEFINER function
--
--  The profiles table RLS policies reference is_tps_staff() and
--  my_company_id(), both of which query profiles — creating a
--  circular dependency that can cause the middleware role check
--  to silently fail.
--
--  This function bypasses RLS to return the authenticated user's
--  own role, used by the admin middleware for auth checks.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid();
$$;

-- Only authenticated users can call this function
REVOKE ALL ON FUNCTION get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
