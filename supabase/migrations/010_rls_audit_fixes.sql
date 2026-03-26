-- ══════════════════════════════════════════════════════════════
--  Migration 010: RLS Audit Fixes
--  Fix is_ravello_staff() to include ravello_recruiter.
--  The enum is: ravello_admin | ravello_recruiter (NOT ravello_staff).
--  Several policies also use 'ravello_staff' inline — patched below.
-- ══════════════════════════════════════════════════════════════

-- ── Fix is_ravello_staff() helper ────────────────────────────
CREATE OR REPLACE FUNCTION is_ravello_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('ravello_admin', 'ravello_recruiter')
  );
$$;

-- ── Fix LEAD / PROTECT admin policies ────────────────────────
-- These were incorrectly using 'ravello_staff' instead of 'ravello_recruiter'

DROP POLICY IF EXISTS "admin_training_needs"    ON training_needs;
DROP POLICY IF EXISTS "admin_perf_reviews"      ON performance_reviews;
DROP POLICY IF EXISTS "admin_skills_matrix"     ON skills_matrix;
DROP POLICY IF EXISTS "admin_emp_docs"          ON employee_documents;
DROP POLICY IF EXISTS "admin_absence"           ON absence_records;
DROP POLICY IF EXISTS "admin_hr_metrics"        ON hr_metrics;

CREATE POLICY "admin_training_needs" ON training_needs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_perf_reviews" ON performance_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_skills_matrix" ON skills_matrix
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_emp_docs" ON employee_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_absence" ON absence_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_hr_metrics" ON hr_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

-- ── Fix learning_content admin policy ────────────────────────
DROP POLICY IF EXISTS "admin_learning_content" ON learning_content;

CREATE POLICY "admin_learning_content" ON learning_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

-- ── Fix learning_purchases admin policy ──────────────────────
DROP POLICY IF EXISTS "admin_purchases" ON learning_purchases;

CREATE POLICY "admin_purchases" ON learning_purchases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

-- ── client_insert_req: clients can insert requisitions ───────
-- Ensure client_admin + client_user can insert (not just any my_company_id)
DROP POLICY IF EXISTS "client_insert_req" ON requisitions;

CREATE POLICY "client_insert_req" ON requisitions
  FOR INSERT WITH CHECK (
    company_id = my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('client_admin', 'client_user', 'ravello_admin', 'ravello_recruiter')
    )
  );

-- ── client_viewers should not insert tickets ─────────────────
DROP POLICY IF EXISTS "client_insert_ticket" ON tickets;

CREATE POLICY "client_insert_ticket" ON tickets
  FOR INSERT WITH CHECK (
    company_id = my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('client_admin', 'client_user', 'ravello_admin', 'ravello_recruiter')
    )
  );

-- ── Notes: ───────────────────────────────────────────────────
-- company_id INSERT checks on service_requests, ticket_messages etc.
-- are fine as-is because they rely on my_company_id() which now correctly
-- maps for any authenticated user with a company_id.
--
-- ravello_admin/recruiter have full access via is_ravello_staff()
-- on all core tables (companies, profiles, requisitions, candidates,
-- documents, tickets, ticket_messages, compliance_items, reports,
-- client_services, milestones, bd_companies, bd_scanned_roles,
-- actions, service_requests, offers, interview_schedules).
--
-- salary_benchmarks policy already uses 'ravello_recruiter' — correct.
