-- Core-OS 360 Phase 6, Group 3: the Client Service Ledger (spec section
-- 9) — the first full Service Ledger, recording factual delivered value
-- per client: consultancy visits, audits, reports, documents created/
-- updated, Broadcasts, service requests resolved, actions closed,
-- training delivered, incident support, management review support.
--
-- "Ledger entries should originate from real platform events or
-- authorised manual service entries. Do not fabricate monetary value or
-- hours saved." Every automated entry below is written by the SAME
-- five-minute platform_events consumer that already drives every other
-- consequence rule in this codebase — never a second event pipeline.

-- ── consultancy_service_ledger ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultancy_service_ledger (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultancy_organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_organisation_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_type                  text NOT NULL CHECK (entry_type IN (
    'visit', 'audit', 'report', 'document', 'broadcast', 'service_request_resolved',
    'action_closed', 'training', 'incident_support', 'management_review_support', 'manual'
  )),
  occurred_at                 timestamptz NOT NULL DEFAULT now(),
  summary                     text NOT NULL,
  source_type                 text,
  source_id                   uuid,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (consultancy_organisation_id <> client_organisation_id),
  -- A manual entry has no source_id and is never deduplicated against
  -- anything — a consultant may log as many free-text notes as they
  -- like. An AUTOMATED entry (source_id set) can only ever be recorded
  -- once per (consultancy, client, source row) — the idempotency guard
  -- IS this index, the same "the database is the boundary" rule the
  -- referral pipeline's own UNIQUE constraint already established.
  CONSTRAINT consultancy_service_ledger_no_dup UNIQUE (consultancy_organisation_id, client_organisation_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_consultancy_service_ledger_client ON public.consultancy_service_ledger(client_organisation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultancy_service_ledger_consultancy ON public.consultancy_service_ledger(consultancy_organisation_id, occurred_at DESC);

ALTER TABLE public.consultancy_service_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultancy_service_ledger_staff_all ON public.consultancy_service_ledger FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Consultancy side: portfolio-wide, the exact pattern 168's own probe
-- fixed a real bug over — my_home_company_id() (never my_company_id())
-- plus has_capability keyed on the ROW's own client_organisation_id.
CREATE POLICY consultancy_service_ledger_consultancy_read ON public.consultancy_service_ledger FOR SELECT TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_service_ledger.client_organisation_id, 'consultancy.client_access')));
-- Manual entries only: an automated entry is written by the service
-- role event consumer, which bypasses RLS entirely — a session insert
-- here is always a MANUAL entry, so source_type/source_id must be null.
CREATE POLICY consultancy_service_ledger_consultancy_manual_insert ON public.consultancy_service_ledger FOR INSERT TO authenticated
  WITH CHECK (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_service_ledger.client_organisation_id, 'consultancy.service_manage'))
         AND entry_type = 'manual' AND source_type IS NULL AND source_id IS NULL
         AND created_by = auth.uid());

CREATE POLICY consultancy_service_ledger_client_read ON public.consultancy_service_ledger FOR SELECT TO authenticated
  USING (client_organisation_id = (SELECT public.my_company_id()));

SELECT public.apply_write_guard('public.consultancy_service_ledger');

-- ── actions.created_by_admin joins the outbox whitelist ────────────
-- The one column the Broadcast-originated-action ledger rule needs and
-- the existing whitelist never carried — a plain boolean, never a
-- sensitive or free-text field. "Latest definition wins": this
-- re-creates 126's own trigger with the exact same column list plus
-- this one addition.
DROP TRIGGER IF EXISTS actions_platform_event ON public.actions;
CREATE TRIGGER actions_platform_event AFTER INSERT OR DELETE OR UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row(
    'status', 'priority', 'action_type', 'title', 'source_ref', 'related_entity_type', 'related_entity_id',
    'source_type', 'source_id', 'action_class', 'assigned_to', 'verifier_id', 'due_date', 'verification_required',
    'created_by_admin'
  );

-- ── new outbox entries for the ledger's own three remaining sources ─
-- consultancy_visits: no consequence used it in Group 2 (it had no
-- outbox trigger at all); reports and training_records already existed
-- but were never triggered. Whitelist is classifying fields only —
-- never notes, never file_url/storage_path/evidence_path.
DROP TRIGGER IF EXISTS consultancy_visits_platform_event ON public.consultancy_visits;
CREATE TRIGGER consultancy_visits_platform_event AFTER INSERT OR UPDATE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status', 'visit_type', 'scheduled_date', 'client_organisation_id', 'consultancy_organisation_id');

DROP TRIGGER IF EXISTS reports_platform_event ON public.reports;
CREATE TRIGGER reports_platform_event AFTER INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('title', 'period');

DROP TRIGGER IF EXISTS training_records_platform_event ON public.training_records;
CREATE TRIGGER training_records_platform_event AFTER INSERT ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('course_name', 'completed_on', 'employee_id', 'person_id');
