-- ════════════════════════════════════════════════════════════════════════
-- Migration 046: Admin/Editor split — migrate rows + helper + DELETE gates
-- ────────────────────────────────────────────────────────────────────────
-- Part 2 of 2. Run AFTER 045 has been committed.
--
-- Sets up the role split the user signed off on:
--
--   • Admin  (client_admin)   — full CRUD on company-scoped data
--   • Editor (client_editor)  — INSERT + UPDATE everywhere, no DELETE on
--                              protected tables, no edits to companies
--                              or sub-users. CAN delete absence_records
--                              (cancelling staff leave is part of the
--                              Editor role per spec).
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- 1. Migrate existing 'client_user' profiles to 'client_editor'
-- ════════════════════════════════════════════════════════════════

UPDATE profiles
   SET role = 'client_editor'
 WHERE role = 'client_user';


-- ════════════════════════════════════════════════════════════════
-- 2. Change new-profile default from 'client_user' to 'client_editor'
-- ════════════════════════════════════════════════════════════════

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'client_editor';


-- ════════════════════════════════════════════════════════════════
-- 3. Helper: is_company_super_user() — true iff the caller is a
--    client_admin (the Super User role within a client).
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
-- 4. DELETE policy gates on protected tables — Editor cannot delete.
--    All existing SELECT/INSERT/UPDATE policies stay as they are.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_documents_delete" ON documents;
CREATE POLICY "client_documents_delete" ON documents FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

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

DROP POLICY IF EXISTS "client_compliance_delete" ON compliance_items;
CREATE POLICY "client_compliance_delete" ON compliance_items FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

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

DROP POLICY IF EXISTS "client_requisitions_delete" ON requisitions;
CREATE POLICY "client_requisitions_delete" ON requisitions FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

DROP POLICY IF EXISTS "client_candidates_delete" ON candidates;
CREATE POLICY "client_candidates_delete" ON candidates FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

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
-- 5. UPDATE policy gates on companies and profiles — only Admin
--    can edit the company row or change/invite/remove sub-users.
-- ════════════════════════════════════════════════════════════════

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
-- 6. Verification (read-only)
-- ════════════════════════════════════════════════════════════════

SELECT
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_company_super_user') AS helper_exists,
  (SELECT COUNT(*) FROM profiles WHERE role = 'client_user')           AS legacy_client_user_count;

SELECT role, COUNT(*) AS n FROM profiles GROUP BY role ORDER BY role;

SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public'
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
     'athletes_client_delete',
     'client_company_update',
     'client_profiles_admin_manage'
   )
 ORDER BY tablename, policyname;
