-- ======================================================================
--  Migration 028: Fix circular RLS on profiles table
--
--  Problem: profiles RLS policy calls is_tps_staff() which queries
--  profiles table → triggers RLS → calls is_tps_staff() → infinite
--  recursion → "stack depth limit exceeded" error.
--
--  Fix: Replace profiles RLS policies with ones that use get_my_role()
--  (SECURITY DEFINER, bypasses RLS) instead of is_tps_staff().
-- ======================================================================

-- Drop the problematic policies
DROP POLICY IF EXISTS "own_profile"      ON profiles;
DROP POLICY IF EXISTS "tps_profiles"     ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;

-- Recreate with non-circular logic.
-- get_my_role() is SECURITY DEFINER so it bypasses RLS — no recursion.
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid()
  OR company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  )
  OR (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);

CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (
  id = auth.uid()
);

CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (
  id = auth.uid()
  OR (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);

CREATE POLICY "profiles_delete" ON profiles FOR DELETE USING (
  (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);

-- Also fix is_tps_staff() to use get_my_role() instead of querying
-- profiles directly — prevents recursion in ALL other table policies too.
CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (SELECT get_my_role()) IN ('tps_admin', 'tps_client');
$$;

-- Same fix for my_company_id() — use SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;
