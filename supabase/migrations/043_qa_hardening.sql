-- ═══════════════════════════════════════════════════════════
-- Phase 48 — QA hardening migration
--
-- Bundles:
--   B1  fix UNIQUE-with-NULL loophole on athlete_partner_interests
--   B2  composite index for the RoleInterestsPanel query
--   B3  rewrite Athletes To Industry RLS to use SECURITY DEFINER
--       helpers + EXISTS joins (was nested IN subqueries)
--   B11 storage path-scoping for `athletes/{company_id}/...`
--   B13 trigger to clean orphaned interests when a partner role
--       is removed from the role_opportunities JSONB array
--   E1  composite sort index on latest_updates
--   E2  composite index on ivylens_tickets
--   E3  composite (is_published, category) on learning_content
--   E4  tighten 6 client_* FOR ALL policies in migration 005
--
-- PG 15+ required for the NULLS NOT DISTINCT clause used in B1.
-- (Supabase Cloud has been on PG 15+ since 2023.)
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- B1: enforce uniqueness on (athlete_id, partner_id, role_opportunity_id)
-- including the NULL "general interest" case. Pre-PG-15 the original
-- UNIQUE constraint silently allowed multiple general-interest rows
-- per (athlete, partner) pair because NULL != NULL.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE athlete_partner_interests
  DROP CONSTRAINT IF EXISTS athlete_partner_interests_athlete_id_partner_id_role_oppor_key;
ALTER TABLE athlete_partner_interests
  DROP CONSTRAINT IF EXISTS athlete_partner_interests_athlete_id_partner_id_role_opportu_key;

-- De-dupe any existing rows that the old constraint missed
-- (general-interest duplicates) before adding the new constraint.
DELETE FROM athlete_partner_interests a
USING athlete_partner_interests b
WHERE a.role_opportunity_id IS NULL
  AND b.role_opportunity_id IS NULL
  AND a.athlete_id = b.athlete_id
  AND a.partner_id = b.partner_id
  AND a.id > b.id;

ALTER TABLE athlete_partner_interests
  ADD CONSTRAINT athlete_partner_interests_uniq
  UNIQUE NULLS NOT DISTINCT (athlete_id, partner_id, role_opportunity_id);

-- ─────────────────────────────────────────────────────────────
-- B2: composite index for "athletes interested in role X at partner Y"
-- (the RoleInterestsPanel hot query)
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_interests_partner_role
  ON athlete_partner_interests (partner_id, role_opportunity_id);

-- ─────────────────────────────────────────────────────────────
-- B3: rewrite Athletes To Industry RLS to use my_company_id() +
-- EXISTS joins. The original nested IN(SELECT … IN(SELECT …))
-- forced a per-row evaluation in some plans.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS athletes_client_rw  ON athletes;
DROP POLICY IF EXISTS interests_client_rw ON athlete_partner_interests;

CREATE POLICY athletes_client_rw ON athletes FOR ALL
  USING      (company_id = my_company_id())
  WITH CHECK (company_id = my_company_id());

CREATE POLICY interests_client_rw ON athlete_partner_interests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM athletes a
       WHERE a.id = athlete_partner_interests.athlete_id
         AND a.company_id = my_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM athletes a
       WHERE a.id = athlete_partner_interests.athlete_id
         AND a.company_id = my_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- B11: storage path-scoping. Without this, any authenticated user
-- can upload to athletes/{any-company-id}/... via direct storage
-- API calls, bypassing the API route's ownership checks.
-- We keep non-athletes paths permissive (existing behaviour).
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;

CREATE POLICY "Authenticated upload to documents bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() IS NOT NULL
    AND (
      -- Non-athletes paths: keep the existing permissive behaviour.
      NOT (name LIKE 'athletes/%')
      -- TPS staff can upload anywhere.
      OR is_tps_staff()
      -- Otherwise enforce the company segment matches caller's company.
      OR (storage.foldername(name))[2] = my_company_id()::text
    )
  );

-- ─────────────────────────────────────────────────────────────
-- B13: orphan cleanup — when a partner's role_opportunities JSONB
-- array changes, remove (set NULL on) interest rows whose
-- role_opportunity_id no longer exists in the array. Setting NULL
-- preserves the interest as a "general interest" rather than
-- silently deleting it.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_orphaned_role_interests()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_role_ids uuid[];
BEGIN
  IF NEW.role_opportunities IS NOT DISTINCT FROM OLD.role_opportunities THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg((elem ->> 'id')::uuid), ARRAY[]::uuid[])
    INTO current_role_ids
  FROM jsonb_array_elements(COALESCE(NEW.role_opportunities, '[]'::jsonb)) AS elem
  WHERE (elem ->> 'id') IS NOT NULL;

  -- Promote orphaned specific-role interests to general interest.
  -- (Insert-or-do-nothing pattern: if a general-interest row already
  -- exists for the same (athlete, partner), drop the orphaned one
  -- instead of duplicating.)
  WITH orphans AS (
    SELECT id, athlete_id, partner_id
      FROM athlete_partner_interests
     WHERE partner_id = NEW.id
       AND role_opportunity_id IS NOT NULL
       AND NOT (role_opportunity_id = ANY (current_role_ids))
  ),
  promotable AS (
    SELECT o.id
      FROM orphans o
     WHERE NOT EXISTS (
       SELECT 1 FROM athlete_partner_interests x
        WHERE x.athlete_id = o.athlete_id
          AND x.partner_id = o.partner_id
          AND x.role_opportunity_id IS NULL
     )
  ),
  deletable AS (
    SELECT o.id
      FROM orphans o
     WHERE EXISTS (
       SELECT 1 FROM athlete_partner_interests x
        WHERE x.athlete_id = o.athlete_id
          AND x.partner_id = o.partner_id
          AND x.role_opportunity_id IS NULL
     )
  ),
  promoted AS (
    UPDATE athlete_partner_interests SET role_opportunity_id = NULL
     WHERE id IN (SELECT id FROM promotable)
    RETURNING 1
  )
  DELETE FROM athlete_partner_interests
   WHERE id IN (SELECT id FROM deletable);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_orphaned_role_interests ON partners;
CREATE TRIGGER trg_cleanup_orphaned_role_interests
  AFTER UPDATE OF role_opportunities ON partners
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_orphaned_role_interests();

-- ─────────────────────────────────────────────────────────────
-- E1: composite sort index for the admin Latest Updates list
-- (sorted by featured DESC, featured_order ASC, published_at DESC).
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_latest_updates_admin_sort
  ON latest_updates (
    featured DESC,
    featured_order ASC NULLS LAST,
    published_at DESC NULLS LAST
  );

-- ─────────────────────────────────────────────────────────────
-- E2: composite index for the IvyLens ticket-poller query
-- (filters by company_id, then dedupes by ivylens_ticket_id).
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ivylens_tickets_company
  ON ivylens_tickets (company_id, ivylens_ticket_id);

-- ─────────────────────────────────────────────────────────────
-- E3: learning_content browse pages filter by is_published and
-- often by category — composite index helps the lead/learning page.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_learning_content_published_category
  ON learning_content (is_published, category)
  WHERE is_published = true;

-- ─────────────────────────────────────────────────────────────
-- E4: tighten 6 client_* policies in migration 005 from FOR ALL
-- to per-operation. FOR ALL grants DELETE and TRUNCATE without
-- review; clients only need SELECT/INSERT/UPDATE for these.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_training_needs"  ON training_needs;
DROP POLICY IF EXISTS "client_perf_reviews"    ON performance_reviews;
DROP POLICY IF EXISTS "client_skills_matrix"   ON skills_matrix;
DROP POLICY IF EXISTS "client_emp_docs"        ON employee_documents;
DROP POLICY IF EXISTS "client_absence"         ON absence_records;
DROP POLICY IF EXISTS "client_hr_metrics"      ON hr_metrics;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'training_needs', 'performance_reviews', 'skills_matrix',
    'employee_documents', 'absence_records', 'hr_metrics'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (company_id = my_company_id())',
      'client_' || tbl || '_select', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (company_id = my_company_id())',
      'client_' || tbl || '_insert', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (company_id = my_company_id()) WITH CHECK (company_id = my_company_id())',
      'client_' || tbl || '_update', tbl
    );
    -- DELETE intentionally omitted — clients do not delete LEAD/PROTECT
    -- records via the portal; only TPS staff (covered by admin_* policies).
  END LOOP;
END $$;
