-- Core-OS 360 Phase 7, Group 5: Report Builder, versioning, distribution
-- (spec section 6/7).
--
-- The report's FINDINGS are never duplicated here — they are the
-- visit's own visit_observations (174), read live at both preview and
-- PDF-generation time (client_visible = true rows only, the same
-- "nothing here is self-certified... internal-only stays internal"
-- rule those rows already carry). This table holds only what a
-- consultant actually WRITES: a narrative summary, recommendations, a
-- next-visit date, plus the issue/version bookkeeping — the standing
-- "never a second source of the same fact" discipline this codebase
-- follows everywhere else.
--
-- Versioning copies hs_documents'/emergency_plans'/environmental_
-- aspects' own discipline exactly, including the lesson Phase 5 Group
-- 10 (migrations 164-166) learned the hard way: a report reaching
-- 'issued' supersedes not just the row it names via supersedes_id, but
-- ANY other row sharing that same supersedes_id — closing the sibling-
-- race gap from day one rather than needing a second pass to find it.
-- A draft is issued IN PLACE (no new row) the first time; only a
-- REVISION of an already-issued report is a new row, and the OLD
-- issued version stays current/visible until the revision itself
-- publishes — never a gap with zero current reports.

CREATE TABLE IF NOT EXISTS public.consultancy_visit_reports (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id                     uuid NOT NULL REFERENCES public.consultancy_visits(id) ON DELETE CASCADE,
  -- Derived from the visit by trigger, never trusted from the caller.
  consultancy_organisation_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_organisation_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version                      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status                       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'superseded')),
  supersedes_id                uuid REFERENCES public.consultancy_visit_reports(id) ON DELETE SET NULL,
  summary                      text CHECK (summary IS NULL OR length(summary) <= 4000),
  recommendations              text CHECK (recommendations IS NULL OR length(recommendations) <= 4000),
  next_visit_recommended_date  date,
  storage_path                 text,
  issued_at                    timestamptz,
  issued_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CHECK (consultancy_organisation_id <> client_organisation_id)
);
CREATE INDEX IF NOT EXISTS idx_consultancy_visit_reports_visit ON public.consultancy_visit_reports(visit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultancy_visit_reports_client ON public.consultancy_visit_reports(client_organisation_id, status);

CREATE OR REPLACE FUNCTION public.consultancy_visit_report_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_consultancy uuid; v_client uuid; prev_visit uuid;
BEGIN
  SELECT consultancy_organisation_id, client_organisation_id INTO v_consultancy, v_client
    FROM public.consultancy_visits WHERE id = NEW.visit_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'visit_id does not reference a real visit' USING ERRCODE = '23503';
  END IF;
  NEW.consultancy_organisation_id := v_consultancy;
  NEW.client_organisation_id := v_client;

  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT visit_id INTO prev_visit FROM public.consultancy_visit_reports WHERE id = NEW.supersedes_id;
    IF prev_visit IS DISTINCT FROM NEW.visit_id THEN
      RAISE EXCEPTION 'A revision must supersede a report for the SAME visit' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_report_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_visit_report_fill ON public.consultancy_visit_reports;
CREATE TRIGGER consultancy_visit_report_fill BEFORE INSERT ON public.consultancy_visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_visit_report_fill();

CREATE OR REPLACE FUNCTION public.consultancy_visit_report_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  -- consultancy_organisation_id/client_organisation_id/visit_id are
  -- derived facts, not editable state — refuse a session trying to
  -- move a report to a different visit or organisation after the fact.
  -- supersedes_id is a permanent "this row is a revision of X" fact,
  -- set only at INSERT (where consultancy_visit_report_fill() already
  -- proves it names a report for the SAME visit) — a bare UPDATE has
  -- no such check of its own, so this must refuse it too.
  IF NEW.visit_id IS DISTINCT FROM OLD.visit_id
     OR NEW.consultancy_organisation_id IS DISTINCT FROM OLD.consultancy_organisation_id
     OR NEW.client_organisation_id IS DISTINCT FROM OLD.client_organisation_id
     OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id THEN
    RAISE EXCEPTION 'visit_id/organisation/supersedes_id cannot be changed after creation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_report_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_visit_report_touch ON public.consultancy_visit_reports;
CREATE TRIGGER consultancy_visit_report_touch BEFORE UPDATE ON public.consultancy_visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_visit_report_touch();

-- A revision reaching 'issued' supersedes the row(s) it replaces. Never
-- fires on the FIRST issue of a report (supersedes_id IS NULL) — that
-- transition has nothing to supersede.
CREATE OR REPLACE FUNCTION public.consultancy_visit_report_supersede_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status = 'issued' AND OLD.status IS DISTINCT FROM 'issued' AND NEW.supersedes_id IS NOT NULL THEN
    UPDATE public.consultancy_visit_reports
       SET status = 'superseded'
     WHERE supersedes_id = NEW.supersedes_id AND id <> NEW.id AND status = 'issued';
    UPDATE public.consultancy_visit_reports
       SET status = 'superseded'
     WHERE id = NEW.supersedes_id AND status = 'issued';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_report_supersede_roll() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_visit_report_supersede_roll ON public.consultancy_visit_reports;
CREATE TRIGGER consultancy_visit_report_supersede_roll AFTER UPDATE ON public.consultancy_visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_visit_report_supersede_roll();

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.consultancy_visit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultancy_visit_reports_staff_all ON public.consultancy_visit_reports FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

CREATE POLICY consultancy_visit_reports_consultancy_all ON public.consultancy_visit_reports FOR ALL TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(client_organisation_id, 'consultancy.service_manage')))
  WITH CHECK (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(client_organisation_id, 'consultancy.service_manage')));

-- A client sees what was actually sent to them, current or historical
-- — never a draft still being written.
CREATE POLICY consultancy_visit_reports_client_read ON public.consultancy_visit_reports FOR SELECT TO authenticated
  USING (client_organisation_id = (SELECT public.my_company_id()) AND status IN ('issued', 'superseded'));

SELECT public.apply_write_guard('public.consultancy_visit_reports');

-- Identifying/classifying columns only — summary/recommendations are
-- free text and never whitelisted.
CREATE TRIGGER consultancy_visit_reports_audit AFTER INSERT OR UPDATE OR DELETE ON public.consultancy_visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'consultancy_visit_report', 'client_organisation_id',
    'visit_id', 'version', 'status', 'supersedes_id'
  );

-- No outbox entry: the ONLY way to issue a report is the server route
-- that also generates the PDF and sends the email SYNCHRONOUSLY under
-- a service-role session it already holds — the same "a controlled
-- entry point calls notify() directly, no async consumer needed"
-- precedent the H&S Tests public-token route (116) already established.
-- The Service Ledger still gets its entry for free: issuing writes a
-- `reports` row, and ledger_report_generated (169) already fires on
-- reports.created — no new consequence rule needed for that either.
