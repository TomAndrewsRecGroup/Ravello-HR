-- ════════════════════════════════════════════════════════════════════════
-- Migration 044: RLS performance optimization
-- ────────────────────────────────────────────────────────────────────────
-- 1. Wraps helper-function calls in (SELECT …) so Postgres caches the
--    result via an InitPlan and runs it ONCE per query instead of per row
--    (the official Supabase RLS performance pattern).
-- 2. Adds `TO authenticated` so anonymous requests skip RLS evaluation
--    entirely — EXCEPT on the public-anon-readable `latest_updates`
--    policy used by the marketing site.
-- 3. Backfills missing company_id indexes so the policy filter can use
--    an index lookup instead of a sequential scan.
--
-- Idempotent — uses DROP IF EXISTS + CREATE everywhere. Safe to re-run
-- against an already-optimized DB.
--
-- Originally applied to production via the Supabase SQL Editor on
-- 2026-04-26; persisted here so fresh environments built from
-- migrations/ get the same optimized RLS state.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- 1. Helper functions (re-confirm STABLE + SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND role IN ('tps_admin','tps_client')
  );
$$;

CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_role()   TO authenticated;
GRANT EXECUTE ON FUNCTION is_tps_staff()  TO authenticated;
GRANT EXECUTE ON FUNCTION my_company_id() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. profiles
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "own_profile"        ON profiles;
DROP POLICY IF EXISTS "tps_profiles"       ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "profiles_select"    ON profiles;
DROP POLICY IF EXISTS "profiles_update"    ON profiles;
DROP POLICY IF EXISTS "profiles_insert"    ON profiles;
DROP POLICY IF EXISTS "profiles_delete"    ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid())
  OR (SELECT get_my_role()) IN ('tps_admin','tps_client')
);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (
  id = (SELECT auth.uid())
  OR (SELECT get_my_role()) IN ('tps_admin','tps_client')
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (
  id = (SELECT auth.uid())
  OR (SELECT get_my_role()) IN ('tps_admin','tps_client')
);
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (
  (SELECT get_my_role()) IN ('tps_admin','tps_client')
);


-- ════════════════════════════════════════════════════════════════
-- 3. companies
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_companies"        ON companies;
DROP POLICY IF EXISTS "tps_manage_companies"    ON companies;
DROP POLICY IF EXISTS "tps_companies"           ON companies;
DROP POLICY IF EXISTS "staff_companies"         ON companies;
DROP POLICY IF EXISTS "staff_companies_all"     ON companies;
DROP POLICY IF EXISTS "client_companies_select" ON companies;

CREATE POLICY "client_companies" ON companies FOR SELECT TO authenticated USING (
  id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "tps_manage_companies" ON companies FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 4. requisitions
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_requisitions" ON requisitions;
DROP POLICY IF EXISTS "client_insert_req"   ON requisitions;
DROP POLICY IF EXISTS "tps_requisitions"    ON requisitions;
DROP POLICY IF EXISTS "staff_requisitions"  ON requisitions;

CREATE POLICY "client_requisitions" ON requisitions FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "client_insert_req" ON requisitions FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()));
CREATE POLICY "tps_requisitions" ON requisitions FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 5. candidates  (preserve client_update_cand semantics)
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_candidates"  ON candidates;
DROP POLICY IF EXISTS "client_update_cand" ON candidates;
DROP POLICY IF EXISTS "tps_candidates"     ON candidates;
DROP POLICY IF EXISTS "staff_candidates"   ON candidates;

CREATE POLICY "client_candidates" ON candidates FOR SELECT TO authenticated USING (
  (company_id = (SELECT my_company_id()) AND approved_for_client = TRUE)
  OR (SELECT is_tps_staff())
);
CREATE POLICY "client_update_cand" ON candidates FOR UPDATE TO authenticated
  USING (company_id = (SELECT my_company_id()))
  WITH CHECK (company_id = (SELECT my_company_id()));
CREATE POLICY "tps_candidates" ON candidates FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 6. documents
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_documents" ON documents;
DROP POLICY IF EXISTS "tps_documents"    ON documents;
DROP POLICY IF EXISTS "staff_documents"  ON documents;

CREATE POLICY "client_documents" ON documents FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "tps_documents" ON documents FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 7. tickets  (preserve status filter on update)
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_tickets"        ON tickets;
DROP POLICY IF EXISTS "client_insert_ticket"  ON tickets;
DROP POLICY IF EXISTS "client_update_ticket"  ON tickets;
DROP POLICY IF EXISTS "tps_tickets"           ON tickets;
DROP POLICY IF EXISTS "staff_tickets"         ON tickets;

CREATE POLICY "client_tickets" ON tickets FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "client_insert_ticket" ON tickets FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT my_company_id()));
CREATE POLICY "client_update_ticket" ON tickets FOR UPDATE TO authenticated
  USING (company_id = (SELECT my_company_id()) AND status NOT IN ('resolved','closed'))
  WITH CHECK (company_id = (SELECT my_company_id()));
CREATE POLICY "tps_tickets" ON tickets FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 8. ticket_messages  (preserve is_internal=FALSE for clients)
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_messages"   ON ticket_messages;
DROP POLICY IF EXISTS "client_insert_msg" ON ticket_messages;
DROP POLICY IF EXISTS "tps_messages"      ON ticket_messages;
DROP POLICY IF EXISTS "staff_messages"    ON ticket_messages;

CREATE POLICY "client_messages" ON ticket_messages FOR SELECT TO authenticated USING (
  is_internal = FALSE
  AND EXISTS (
    SELECT 1 FROM tickets t
     WHERE t.id = ticket_messages.ticket_id
       AND t.company_id = (SELECT my_company_id())
  )
);
CREATE POLICY "client_insert_msg" ON ticket_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM tickets t
     WHERE t.id = ticket_messages.ticket_id
       AND t.company_id = (SELECT my_company_id())
  )
);
CREATE POLICY "tps_messages" ON ticket_messages FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 9. service_requests
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_service_requests_select" ON service_requests;
DROP POLICY IF EXISTS "client_service_requests_insert" ON service_requests;
DROP POLICY IF EXISTS "tps_service_requests"           ON service_requests;
DROP POLICY IF EXISTS "staff_service_requests"         ON service_requests;

CREATE POLICY "client_service_requests_select" ON service_requests FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "client_service_requests_insert" ON service_requests FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT my_company_id()));
CREATE POLICY "tps_service_requests" ON service_requests FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 10. actions
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "client_actions_select" ON actions;
DROP POLICY IF EXISTS "client_actions_update" ON actions;
DROP POLICY IF EXISTS "tps_actions"           ON actions;
DROP POLICY IF EXISTS "staff_actions"         ON actions;

CREATE POLICY "client_actions_select" ON actions FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "client_actions_update" ON actions FOR UPDATE TO authenticated
  USING (company_id = (SELECT my_company_id()))
  WITH CHECK (company_id = (SELECT my_company_id()));
CREATE POLICY "tps_actions" ON actions FOR ALL TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 11. milestones, client_services, compliance_items, reports
-- ════════════════════════════════════════════════════════════════

-- milestones
DROP POLICY IF EXISTS "client_milestones_select" ON milestones;
DROP POLICY IF EXISTS "tps_milestones"           ON milestones;
DROP POLICY IF EXISTS "staff_milestones"         ON milestones;
CREATE POLICY "client_milestones_select" ON milestones FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "tps_milestones" ON milestones FOR ALL TO authenticated
  USING ((SELECT is_tps_staff())) WITH CHECK ((SELECT is_tps_staff()));

-- client_services
DROP POLICY IF EXISTS "client_services_select" ON client_services;
DROP POLICY IF EXISTS "tps_client_services"    ON client_services;
DROP POLICY IF EXISTS "staff_client_services"  ON client_services;
CREATE POLICY "client_services_select" ON client_services FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "tps_client_services" ON client_services FOR ALL TO authenticated
  USING ((SELECT is_tps_staff())) WITH CHECK ((SELECT is_tps_staff()));

-- compliance_items
DROP POLICY IF EXISTS "client_compliance" ON compliance_items;
DROP POLICY IF EXISTS "tps_compliance"    ON compliance_items;
DROP POLICY IF EXISTS "staff_compliance"  ON compliance_items;
CREATE POLICY "client_compliance" ON compliance_items FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "tps_compliance" ON compliance_items FOR ALL TO authenticated
  USING ((SELECT is_tps_staff())) WITH CHECK ((SELECT is_tps_staff()));

-- reports
DROP POLICY IF EXISTS "client_reports" ON reports;
DROP POLICY IF EXISTS "tps_reports"    ON reports;
DROP POLICY IF EXISTS "staff_reports"  ON reports;
CREATE POLICY "client_reports" ON reports FOR SELECT TO authenticated USING (
  company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff())
);
CREATE POLICY "tps_reports" ON reports FOR ALL TO authenticated
  USING ((SELECT is_tps_staff())) WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 12. offers, interview_schedules  (have company_id)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'offers' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_offers_select" ON offers';
    EXECUTE 'DROP POLICY IF EXISTS "tps_offers"           ON offers';
    EXECUTE 'DROP POLICY IF EXISTS "staff_offers"         ON offers';
    EXECUTE $POLICY$
      CREATE POLICY "client_offers_select" ON offers FOR SELECT TO authenticated
        USING (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "tps_offers" ON offers FOR ALL TO authenticated
        USING ((SELECT is_tps_staff())) WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'interview_schedules' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_interviews_select" ON interview_schedules';
    EXECUTE 'DROP POLICY IF EXISTS "tps_interviews"           ON interview_schedules';
    EXECUTE 'DROP POLICY IF EXISTS "staff_interviews"         ON interview_schedules';
    EXECUTE $POLICY$
      CREATE POLICY "client_interviews_select" ON interview_schedules FOR SELECT TO authenticated
        USING (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "tps_interviews" ON interview_schedules FOR ALL TO authenticated
        USING ((SELECT is_tps_staff())) WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 13. LEAD/PROTECT (FOR ALL — preserves original semantics)
--     training_needs, performance_reviews, skills_matrix,
--     absence_records, employee_documents, hr_metrics
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl text;
  client_pol text;
  admin_pol  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'training_needs', 'performance_reviews', 'skills_matrix',
    'absence_records', 'employee_documents', 'hr_metrics'
  ])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = tbl AND relkind = 'r') THEN
      CONTINUE;
    END IF;

    admin_pol  := 'admin_'  || (CASE
                                  WHEN tbl = 'performance_reviews' THEN 'perf_reviews'
                                  WHEN tbl = 'employee_documents'  THEN 'emp_docs'
                                  WHEN tbl = 'absence_records'     THEN 'absence'
                                  ELSE tbl
                                END);
    client_pol := 'client_' || (CASE
                                  WHEN tbl = 'performance_reviews' THEN 'perf_reviews'
                                  WHEN tbl = 'employee_documents'  THEN 'emp_docs'
                                  WHEN tbl = 'absence_records'     THEN 'absence'
                                  ELSE tbl
                                END);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', client_pol, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', admin_pol,  tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'client_'||tbl||'_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'client_'||tbl||'_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'client_'||tbl||'_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'admin_'||tbl,             tbl);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (company_id = (SELECT my_company_id()))
         WITH CHECK (company_id = (SELECT my_company_id()))',
      client_pol, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING ((SELECT is_tps_staff()))
         WITH CHECK ((SELECT is_tps_staff()))',
      admin_pol, tbl);
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 14. learning_content, learning_purchases
--     (learning_content uses is_published, NOT active)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'learning_content' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "auth_learning_content_read" ON learning_content';
    EXECUTE 'DROP POLICY IF EXISTS "read_learning_content"      ON learning_content';
    EXECUTE 'DROP POLICY IF EXISTS "admin_learning_content"     ON learning_content';
    EXECUTE $POLICY$
      CREATE POLICY "auth_learning_content_read" ON learning_content FOR SELECT
        TO authenticated USING (is_published = true OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "admin_learning_content" ON learning_content FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'learning_purchases' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_purchases_read"   ON learning_purchases';
    EXECUTE 'DROP POLICY IF EXISTS "client_purchases_insert" ON learning_purchases';
    EXECUTE 'DROP POLICY IF EXISTS "admin_purchases"         ON learning_purchases';
    EXECUTE $POLICY$
      CREATE POLICY "client_purchases_read" ON learning_purchases FOR SELECT
        TO authenticated USING (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "client_purchases_insert" ON learning_purchases FOR INSERT
        TO authenticated WITH CHECK (company_id = (SELECT my_company_id()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "admin_purchases" ON learning_purchases FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 15. salary_benchmarks (no company_id; auth-only read)
--     jd_templates       (no company_id; staff-only)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'salary_benchmarks' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "read_benchmarks"     ON salary_benchmarks';
    EXECUTE 'DROP POLICY IF EXISTS "auth_benchmarks_read" ON salary_benchmarks';
    EXECUTE 'DROP POLICY IF EXISTS "admin_benchmarks"    ON salary_benchmarks';
    EXECUTE $POLICY$
      CREATE POLICY "read_benchmarks" ON salary_benchmarks FOR SELECT
        TO authenticated USING (true)
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "admin_benchmarks" ON salary_benchmarks FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'jd_templates' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "tps_jd_templates"       ON jd_templates';
    EXECUTE 'DROP POLICY IF EXISTS "auth_jd_templates_read" ON jd_templates';
    EXECUTE 'DROP POLICY IF EXISTS "admin_jd_templates"     ON jd_templates';
    EXECUTE $POLICY$
      CREATE POLICY "auth_jd_templates_read" ON jd_templates FOR SELECT
        TO authenticated USING (true)
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "tps_jd_templates" ON jd_templates FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 16. bd_companies, bd_scanned_roles  (staff-only)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'bd_companies' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "tps_bd_companies" ON bd_companies';
    EXECUTE $POLICY$
      CREATE POLICY "tps_bd_companies" ON bd_companies FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'bd_scanned_roles' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "tps_bd_scanned_roles" ON bd_scanned_roles';
    EXECUTE $POLICY$
      CREATE POLICY "tps_bd_scanned_roles" ON bd_scanned_roles FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 17. internal_tasks, client_notes, activity_log, ivylens_tickets
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'internal_tasks' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS internal_tasks_all ON internal_tasks';
    EXECUTE $POLICY$
      CREATE POLICY internal_tasks_all ON internal_tasks FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'client_notes' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS client_notes_all ON client_notes';
    EXECUTE $POLICY$
      CREATE POLICY client_notes_all ON client_notes FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'activity_log' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS activity_log_select ON activity_log';
    EXECUTE 'DROP POLICY IF EXISTS activity_log_insert ON activity_log';
    EXECUTE $POLICY$
      CREATE POLICY activity_log_select ON activity_log FOR SELECT
        TO authenticated
        USING (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY activity_log_insert ON activity_log FOR INSERT
        TO authenticated
        WITH CHECK ((SELECT is_tps_staff()) OR company_id = (SELECT my_company_id()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ivylens_tickets' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_ivylens_tickets" ON ivylens_tickets';
    EXECUTE 'DROP POLICY IF EXISTS "tps_ivylens_tickets"    ON ivylens_tickets';
    EXECUTE 'DROP POLICY IF EXISTS "staff_ivylens_tickets"  ON ivylens_tickets';
    EXECUTE $POLICY$
      CREATE POLICY "client_ivylens_tickets" ON ivylens_tickets FOR SELECT
        TO authenticated
        USING (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY "tps_ivylens_tickets" ON ivylens_tickets FOR ALL
        TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 18. Athletes To Industry
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS partners_auth_read   ON partners;
DROP POLICY IF EXISTS partners_staff_write ON partners;
CREATE POLICY partners_auth_read ON partners FOR SELECT
  TO authenticated USING (active = true OR (SELECT is_tps_staff()));
CREATE POLICY partners_staff_write ON partners FOR ALL
  TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));

DROP POLICY IF EXISTS athletes_client_rw ON athletes;
DROP POLICY IF EXISTS athletes_staff_rw  ON athletes;
CREATE POLICY athletes_client_rw ON athletes FOR ALL
  TO authenticated
  USING      (company_id = (SELECT my_company_id()))
  WITH CHECK (company_id = (SELECT my_company_id()));
CREATE POLICY athletes_staff_rw ON athletes FOR ALL
  TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));

DROP POLICY IF EXISTS interests_client_rw ON athlete_partner_interests;
DROP POLICY IF EXISTS interests_staff_rw  ON athlete_partner_interests;
CREATE POLICY interests_client_rw ON athlete_partner_interests FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM athletes a
       WHERE a.id = athlete_partner_interests.athlete_id
         AND a.company_id = (SELECT my_company_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athletes a
       WHERE a.id = athlete_partner_interests.athlete_id
         AND a.company_id = (SELECT my_company_id())
    )
  );
CREATE POLICY interests_staff_rw ON athlete_partner_interests FOR ALL
  TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 19. latest_updates, feed_sources
--     IMPORTANT: latest_updates_public_read intentionally has NO
--     `TO authenticated` clause — public marketing site reads with
--     the anon key. Leaving the role list empty keeps both anon and
--     authenticated working.
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'latest_updates' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS latest_updates_public_read ON latest_updates';
    EXECUTE 'DROP POLICY IF EXISTS latest_updates_staff_write ON latest_updates';
    EXECUTE $POLICY$
      CREATE POLICY latest_updates_public_read ON latest_updates
        FOR SELECT
        USING (status = 'published' OR (SELECT is_tps_staff()))
    $POLICY$;
    EXECUTE $POLICY$
      CREATE POLICY latest_updates_staff_write ON latest_updates
        FOR ALL TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'feed_sources' AND relkind = 'r') THEN
    EXECUTE 'DROP POLICY IF EXISTS feed_sources_staff_all ON feed_sources';
    EXECUTE $POLICY$
      CREATE POLICY feed_sources_staff_all ON feed_sources
        FOR ALL TO authenticated
        USING ((SELECT is_tps_staff()))
        WITH CHECK ((SELECT is_tps_staff()))
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 20. Backfill company_id indexes
--     Skips any table that doesn't actually have a company_id column.
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'requisitions', 'candidates', 'documents', 'tickets',
    'service_requests', 'actions', 'milestones', 'client_services',
    'compliance_items', 'reports', 'offers', 'interview_schedules',
    'training_needs', 'performance_reviews', 'skills_matrix',
    'absence_records', 'employee_documents', 'hr_metrics',
    'learning_purchases', 'athletes',
    'activity_log', 'ivylens_tickets', 'client_notes', 'internal_tasks'
  ])
  LOOP
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = tbl
         AND column_name  = 'company_id'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)',
        'idx_' || tbl || '_company_id',
        tbl
      );
    END IF;
  END LOOP;
END $$;
