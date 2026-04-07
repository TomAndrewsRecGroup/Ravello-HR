-- ======================================================================
--  COMPLETE FIX: Run this ONCE in Supabase SQL Editor
--  Fixes all RLS, functions, profile, and demo data in one go.
-- ======================================================================

-- ============================================
-- STEP 1: Fix ALL security definer functions
-- ============================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_client'));
$$;

CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (company_id UUID, ui_preferences JSONB, onboarding_completed BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT p.company_id, p.ui_preferences, p.onboarding_completed
  FROM profiles p WHERE p.id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION is_tps_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

-- ============================================
-- STEP 2: Fix profiles RLS (break recursion)
-- ============================================
DROP POLICY IF EXISTS "own_profile"      ON profiles;
DROP POLICY IF EXISTS "tps_profiles"     ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select"  ON profiles;
DROP POLICY IF EXISTS "profiles_update"  ON profiles;
DROP POLICY IF EXISTS "profiles_insert"  ON profiles;
DROP POLICY IF EXISTS "profiles_delete"  ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid()
  OR (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (
  id = auth.uid()
  OR (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (
  id = auth.uid()
  OR (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);
CREATE POLICY "profiles_delete" ON profiles FOR DELETE USING (
  (SELECT get_my_role()) IN ('tps_admin', 'tps_client')
);

-- ============================================
-- STEP 3: Ensure your profile is correct
-- ============================================
INSERT INTO profiles (id, email, full_name, role, company_id, onboarding_completed)
VALUES (
  '3f6b51bb-d9ac-43ef-9252-ff4274143897',
  'tom@andrews-recruitment.com',
  'Tom Andrews',
  'tps_admin',
  '00000000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO UPDATE SET
  role = 'tps_admin',
  company_id = '00000000-0000-0000-0000-000000000001',
  onboarding_completed = true;

-- ============================================
-- STEP 4: Verify everything works
-- ============================================
SELECT
  p.id,
  p.email,
  p.role,
  p.company_id,
  c.name as company_name,
  p.onboarding_completed
FROM profiles p
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.id = '3f6b51bb-d9ac-43ef-9252-ff4274143897';
