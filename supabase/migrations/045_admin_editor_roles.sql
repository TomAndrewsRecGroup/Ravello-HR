-- ════════════════════════════════════════════════════════════════════════
-- Migration 045: Admin / Editor role split + DELETE policy gates
-- ────────────────────────────────────────────────────────────────────────
-- Per Phase 2 of the UX/onboarding plan, the client portal collapses to
-- two roles:
--
--   • Admin  (DB enum: 'client_admin')   — full CRUD on company-scoped data
--   • Editor (DB enum: 'client_editor')  — INSERT + UPDATE on most things,
--                                          but no DELETE on protected tables
--                                          like documents, employees,
--                                          handbooks, compliance items, etc.
--                                          CAN delete on absence_records
--                                          (cancelling staff leave is part
--                                          of their job).
--
-- TPS staff roles ('tps_admin', 'tps_client') unchanged. The previous
-- 'client_user' default existed but was never used as a distinct role —
-- migrating those rows to 'client_editor'.
--
-- The codebase already references 'client_viewer' in a few places (admin
-- UsersClient, invite route, summary API) but it was never added to the
-- enum. Those code references will be updated to 'client_editor' in the
-- accompanying app commit.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- 1. Add 'client_editor' to user_role enum (no-op if already present)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'user_role' AND e.enumlabel = 'client_editor'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'client_editor';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 2. Migrate existing 'client_user' profiles to 'client_editor'
-- ════════════════════════════════════════════════════════════════

UPDATE profiles
   SET role = 'client_editor'
 WHERE role = 'client_user';


-- ════════════════════════════════════════════════════════════════
-- 3. Change new-profile default from 'client_user' to 'client_editor'
-- ════════════════════════════════════════════════════════════════

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'client_editor';


-- ════════════════════════════════════════════════════════════════
-- 4. Helper: is_company_super_user() — true iff the caller is a
--    client_admin (the Super User role within a client).
--    SECURITY DEFINER + STABLE matches the existing helper pattern
--    in migrations 028/030/044 so RLS policies can wrap calls in
--    (SELECT …) for InitPlan caching.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_company_super_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND role = 'client_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_company_super_user() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 5. DELETE policy gates on protected tables — Editor cannot delete.
--    All existing SELECT/INSERT/UPDATE policies stay as they are.
--    Pattern: a separate DELETE-only policy that requires super-user.
--    Editor's lack of a matching DELETE policy means the action is
--    refused at the DB level, not just hidden in the UI.
-- ════════════════════════════════════════════════════════════════

-- documents (company-wide handbooks, contracts, policies)
DROP POLICY IF EXISTS "client_documents_delete" ON documents;
CREATE POLICY "client_documents_delete" ON documents FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

-- employee_records
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'employee_records' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "employee_records_delete" ON employee_records';
    EXECUTE $POLICY$
      CREATE POLICY "employee_records_delete" ON employee_records FOR DELETE
        TO authenticated
        USING (
          company_id = (SELECT my_company_id())
          AND (SELECT is_company_super_user())
        )
    $POLICY$;
  END IF;
END $$;

-- employee_documents (per-employee files)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'employee_documents' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "employee_documents_delete" ON employee_documents';
    EXECUTE $POLICY$
      CREATE POLICY "employee_documents_delete" ON employee_documents FOR DELETE
        TO authenticated
        USING (
          company_id = (SELECT my_company_id())
          AND (SELECT is_company_super_user())
        )
    $POLICY$;
  END IF;
END $$;

-- compliance_items
DROP POLICY IF EXISTS "client_compliance_delete" ON compliance_items;
CREATE POLICY "client_compliance_delete" ON compliance_items FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

-- training_needs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'training_needs' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "training_needs_delete" ON training_needs';
    EXECUTE $POLICY$
      CREATE POLICY "training_needs_delete" ON training_needs FOR DELETE
        TO authenticated
        USING (
          company_id = (SELECT my_company_id())
          AND (SELECT is_company_super_user())
        )
    $POLICY$;
  END IF;
END $$;

-- performance_reviews
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'performance_reviews' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "performance_reviews_delete" ON performance_reviews';
    EXECUTE $POLICY$
      CREATE POLICY "performance_reviews_delete" ON performance_reviews FOR DELETE
        TO authenticated
        USING (
          company_id = (SELECT my_company_id())
          AND (SELECT is_company_super_user())
        )
    $POLICY$;
  END IF;
END $$;

-- skills_matrix
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'skills_matrix' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "skills_matrix_delete" ON skills_matrix';
    EXECUTE $POLICY$
      CREATE POLICY "skills_matrix_delete" ON skills_matrix FOR DELETE
        TO authenticated
        USING (
          company_id = (SELECT my_company_id())
          AND (SELECT is_company_super_user())
        )
    $POLICY$;
  END IF;
END $$;

-- requisitions
DROP POLICY IF EXISTS "client_requisitions_delete" ON requisitions;
CREATE POLICY "client_requisitions_delete" ON requisitions FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

-- candidates (clients can update their feedback; only Admin can delete)
DROP POLICY IF EXISTS "client_candidates_delete" ON candidates;
CREATE POLICY "client_candidates_delete" ON candidates FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

-- athletes (Athletes To Industry roster — protected per-client)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'athletes' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "athletes_client_delete" ON athletes';
    EXECUTE $POLICY$
      CREATE POLICY "athletes_client_delete" ON athletes FOR DELETE
        TO authenticated
        USING (
          company_id = (SELECT my_company_id())
          AND (SELECT is_company_super_user())
        )
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 6. UPDATE policy gates on companies and profiles — only Admin
--    can edit the company row or change/invite/remove sub-users.
-- ════════════════════════════════════════════════════════════════

-- companies — Admin can update its own company row; Editor cannot
-- (Editor's read access via "client_companies" SELECT policy is
--  unchanged — they can still see their company's details.)
DROP POLICY IF EXISTS "client_company_update" ON companies;
CREATE POLICY "client_company_update" ON companies FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  )
  WITH CHECK (
    id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

-- profiles — Admin can manage sub-users (invite, edit role, remove)
-- within their own company. Editor cannot. The existing
-- profiles_select / profiles_update policies (from migration 044)
-- continue to allow each user to read/edit their own row.
DROP POLICY IF EXISTS "client_profiles_admin_manage" ON profiles;
CREATE POLICY "client_profiles_admin_manage" ON profiles FOR ALL
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  )
  WITH CHECK (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );


-- ════════════════════════════════════════════════════════════════
-- 7. Verification (read-only)
-- ════════════════════════════════════════════════════════════════

-- New role + helper exist
SELECT
  EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'user_role' AND e.enumlabel = 'client_editor') AS editor_role_exists,
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_company_super_user') AS helper_exists;

-- Profile counts by role
SELECT role, COUNT(*) AS n FROM profiles GROUP BY role ORDER BY role;

-- Confirm the new DELETE policies are installed
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public'
   AND policyname LIKE '%_delete'
   AND policyname IN (
     'client_documents_delete',
     'employee_records_delete',
     'employee_documents_delete',
     'client_compliance_delete',
     'training_needs_delete',
     'performance_reviews_delete',
     'skills_matrix_delete',
     'client_requisitions_delete',
     'client_candidates_delete',
     'athletes_client_delete'
   )
 ORDER BY tablename;
