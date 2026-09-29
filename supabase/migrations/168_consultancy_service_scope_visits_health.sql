-- Core-OS 360 Phase 6, Group 2: service scope, consultancy visits, and
-- the client health snapshot's factual portfolio counts.
--
-- Two new tables, both keyed (consultancy_organisation_id,
-- client_organisation_id) rather than a single company_id — a service
-- scope or a visit is a fact about a RELATIONSHIP between two
-- organisations, not a fact that belongs to either one alone.
--
-- `consultancy_visits` is DELIBERATELY MINIMAL: date, type, status,
-- who, where. Phase 7 ("Consultant Visit Mode & Automated Site-Visit
-- Reporting") explicitly owns the full workflow — pre-visit briefs,
-- templates, mobile/tablet mode, structured observations, the report
-- builder, versioning/distribution, follow-up. Building that here would
-- be doing Phase 7's work early and out of its own gated review. This
-- table exists now because Phase 6 section 2's own worked example
-- ("Next consultant visit: 04/11/2026") and section 6 ("visits due")
-- both need a real date to read from — Phase 7 EXTENDS this table
-- (the "reuse, never a parallel system" rule every phase in this
-- codebase has followed since the Phase 4 pre-work audit), it does not
-- replace it.

-- ── consultancy_relationship_live(): the same fact
--    grant_relationship_current() checks for a GRANT, checked here
--    directly against a (consultancy, client) pair with no grant
--    involved — a service scope or visit is recorded by a consultancy
--    person acting IN the client organisation (their grant already
--    proves they may act there); what this checks is that the
--    consultancy-client RELATIONSHIP ITSELF is still live, so a scope
--    or visit cannot be filed against a client whose contract with this
--    consultancy has already ended, even by someone who still (briefly)
--    holds an unrevoked grant.
CREATE OR REPLACE FUNCTION public.consultancy_relationship_live(p_consultancy uuid, p_client uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_relationships r
     WHERE r.source_organisation_id = p_consultancy
       AND r.target_organisation_id = p_client
       AND r.relationship_type = 'consultancy_client'
       AND r.status = 'active'
       AND r.valid_from <= current_date
       AND (r.valid_until IS NULL OR r.valid_until >= current_date)
  )
$$;
REVOKE ALL ON FUNCTION public.consultancy_relationship_live(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultancy_relationship_live(uuid, uuid) TO authenticated;

-- ── consultancy_service_scopes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultancy_service_scopes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultancy_organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_organisation_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_type                text NOT NULL CHECK (service_type IN (
    'retained_hs_consultancy', 'audit_support', 'iso_support', 'training',
    'incident_support', 'document_management', 'occupational_health_coordination', 'recruitment'
  )),
  status                      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  start_date                  date NOT NULL DEFAULT current_date,
  end_date                    date,
  service_owner_person_id     uuid REFERENCES public.people(id) ON DELETE SET NULL,
  included_scope              text,
  excluded_scope              text,
  review_frequency            text CHECK (review_frequency IS NULL OR review_frequency IN ('monthly', 'quarterly', 'biannual', 'annual')),
  commercial_reference        text,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (consultancy_organisation_id <> client_organisation_id)
);
CREATE INDEX IF NOT EXISTS idx_consultancy_service_scopes_client ON public.consultancy_service_scopes(client_organisation_id);
CREATE INDEX IF NOT EXISTS idx_consultancy_service_scopes_consultancy ON public.consultancy_service_scopes(consultancy_organisation_id);

-- ── consultancy_visits ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultancy_visits (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultancy_organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_organisation_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id                     uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  consultant_person_id        uuid REFERENCES public.people(id) ON DELETE SET NULL,
  visit_type                  text NOT NULL CHECK (visit_type IN (
    'retained_visit', 'audit_visit', 'incident_support', 'training_delivery', 'management_review_support', 'other'
  )),
  scheduled_date               date NOT NULL,
  status                       text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes                        text,
  created_by                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CHECK (consultancy_organisation_id <> client_organisation_id)
);
CREATE INDEX IF NOT EXISTS idx_consultancy_visits_client_date ON public.consultancy_visits(client_organisation_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_consultancy_visits_consultancy_date ON public.consultancy_visits(consultancy_organisation_id, scheduled_date);

-- ── same-organisation + live-relationship guards, both tables ──────
CREATE OR REPLACE FUNCTION public.consultancy_service_scope_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.consultancy_relationship_live(NEW.consultancy_organisation_id, NEW.client_organisation_id) THEN
    RAISE EXCEPTION 'No live consultancy relationship between these organisations' USING ERRCODE = '42501';
  END IF;
  IF NEW.service_owner_person_id IS NOT NULL
     AND public.hs_entity_company('person', NEW.service_owner_person_id) IS DISTINCT FROM NEW.consultancy_organisation_id THEN
    RAISE EXCEPTION 'service_owner_person_id must belong to the consultancy organisation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_service_scope_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_service_scope_guard ON public.consultancy_service_scopes;
CREATE TRIGGER consultancy_service_scope_guard BEFORE INSERT OR UPDATE ON public.consultancy_service_scopes
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_service_scope_guard();

CREATE OR REPLACE FUNCTION public.consultancy_visit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.consultancy_relationship_live(NEW.consultancy_organisation_id, NEW.client_organisation_id) THEN
    RAISE EXCEPTION 'No live consultancy relationship between these organisations' USING ERRCODE = '42501';
  END IF;
  IF NEW.consultant_person_id IS NOT NULL
     AND public.hs_entity_company('person', NEW.consultant_person_id) IS DISTINCT FROM NEW.consultancy_organisation_id THEN
    RAISE EXCEPTION 'consultant_person_id must belong to the consultancy organisation' USING ERRCODE = '42501';
  END IF;
  IF NEW.site_id IS NOT NULL
     AND public.hs_entity_company('site', NEW.site_id) IS DISTINCT FROM NEW.client_organisation_id THEN
    RAISE EXCEPTION 'site_id must belong to the client organisation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_visit_guard ON public.consultancy_visits;
CREATE TRIGGER consultancy_visit_guard BEFORE INSERT OR UPDATE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_visit_guard();

-- ── updated_at stamping (plain, no history discipline needed — both
--    tables are ordinary mutable records, edited in place like
--    contractor_insurances, not insert-only like the register) ──────
CREATE OR REPLACE FUNCTION public.consultancy_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS consultancy_service_scopes_touch ON public.consultancy_service_scopes;
CREATE TRIGGER consultancy_service_scopes_touch BEFORE UPDATE ON public.consultancy_service_scopes
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_touch_updated_at();

DROP TRIGGER IF EXISTS consultancy_visits_touch ON public.consultancy_visits;
CREATE TRIGGER consultancy_visits_touch BEFORE UPDATE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_touch_updated_at();

-- ── audit trail: attributed to the CLIENT organisation — "whose
--    record this affects", the same choice every other client-facing
--    table's org_col makes. service_scope.updated / (a visit has no
--    named event in section 13, so it rides the generic audit_row
--    label 'consultancy_visit').
DROP TRIGGER IF EXISTS consultancy_service_scopes_audit ON public.consultancy_service_scopes;
CREATE TRIGGER consultancy_service_scopes_audit AFTER INSERT OR UPDATE OR DELETE ON public.consultancy_service_scopes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'service_scope', 'client_organisation_id',
    'consultancy_organisation_id', 'service_type', 'status', 'start_date', 'end_date', 'review_frequency'
  );

DROP TRIGGER IF EXISTS consultancy_visits_audit ON public.consultancy_visits;
CREATE TRIGGER consultancy_visits_audit AFTER INSERT OR UPDATE OR DELETE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'consultancy_visit', 'client_organisation_id',
    'consultancy_organisation_id', 'visit_type', 'status', 'scheduled_date'
  );

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.consultancy_service_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultancy_service_scopes_staff_all ON public.consultancy_service_scopes FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY consultancy_visits_staff_all ON public.consultancy_visits FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Consultancy side: PORTFOLIO-WIDE, not gated on the currently active
-- organisation. has_capability(p_org, cap) takes the ORGANISATION as a
-- parameter and checks the caller's grant on THAT org directly — it
-- does not require p_org to be my_company_id(). Checking
-- `consultancy_organisation_id = my_company_id()` here was the first
-- draft's real bug, caught live by this migration's own probe: a
-- consultant switched INTO a client (my_company_id() = the client, not
-- the consultancy) could write nothing at all, because that comparison
-- can only ever be true while somehow "active in your own consultancy
-- home" — exactly the one-client-at-a-time shape the whole Command
-- Centre exists to get away from. `my_home_company_id()` (always the
-- consultancy, regardless of which org is currently active) plus
-- has_capability(row's own client_organisation_id, cap) is what makes
-- this portfolio-wide: a consultant never needs to switch into a
-- client to log a scope or a visit against it. Read uses
-- consultancy.client_access (the existing "may I open this client"
-- gate); write uses the new consultancy.service_manage (167) — distinct
-- capabilities so a read-only consultant can see the scope but not
-- edit it.
CREATE POLICY consultancy_service_scopes_consultancy_read ON public.consultancy_service_scopes FOR SELECT TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_service_scopes.client_organisation_id, 'consultancy.client_access')));
CREATE POLICY consultancy_service_scopes_consultancy_write ON public.consultancy_service_scopes FOR ALL TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_service_scopes.client_organisation_id, 'consultancy.service_manage')))
  WITH CHECK (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_service_scopes.client_organisation_id, 'consultancy.service_manage')));

-- Client side: read-only, their own scope only — the register's own
-- "nothing here is self-certified" posture. A client user is never
-- granted onto another org, so my_company_id() here is always their
-- own home, unaffected by the portfolio-wide fix above.
CREATE POLICY consultancy_service_scopes_client_read ON public.consultancy_service_scopes FOR SELECT TO authenticated
  USING (client_organisation_id = (SELECT public.my_company_id()));

CREATE POLICY consultancy_visits_consultancy_read ON public.consultancy_visits FOR SELECT TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_visits.client_organisation_id, 'consultancy.client_access')));
CREATE POLICY consultancy_visits_consultancy_write ON public.consultancy_visits FOR ALL TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_visits.client_organisation_id, 'consultancy.service_manage')))
  WITH CHECK (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_visits.client_organisation_id, 'consultancy.service_manage')));
CREATE POLICY consultancy_visits_client_read ON public.consultancy_visits FOR SELECT TO authenticated
  USING (client_organisation_id = (SELECT public.my_company_id()));

SELECT public.apply_write_guard('public.consultancy_service_scopes');
SELECT public.apply_write_guard('public.consultancy_visits');

-- ── hs_entity_table gains 'person' -> 'people' and 'site' -> 'hs_sites'
--    already exist (checked live before writing this: both branches
--    are present since 095/118) — no change needed there. New evidence
--    scope for a service scope / visit is NOT wired here: neither
--    carries file evidence yet in Phase 6, so no hs_scope_for_entity
--    branch is added for either — avoids seeding a vocabulary entry
--    with nothing that uses it, the same discipline 106's sector packs
--    and 110's audit templates already followed for staff-only data.

-- ── client_health_snapshots: the factual portfolio counts from Phase 6
--    section 2's worked example. All nullable/zero-defaulted so the
--    existing band/engagement_score logic (lib/health/scoring.ts) is
--    completely untouched — these are ADDITIVE columns the cron now
--    also fills in, never a replacement for the existing RAG logic.
ALTER TABLE public.client_health_snapshots
  ADD COLUMN IF NOT EXISTS open_critical_actions        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_legal_evaluations     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_controlled_documents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_incident_investigations  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_critical_gaps          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workers_not_ready              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assets_unavailable             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS major_audit_findings           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contractor_expiring            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS environmental_permits_expiring integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_reviews_due         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_service_requests   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_consultant_visit_date     date;
