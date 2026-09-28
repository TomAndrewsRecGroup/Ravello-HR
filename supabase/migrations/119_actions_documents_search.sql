-- ═══════════════════════════════════════════════════════════════════
-- 119: Core-OS 360 Phase 1 — universal actions, document versions,
--      acknowledgement evidence, billing sources, internal search
--      (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- ACTIONS. `actions` (client-facing, fed by H&S failed checks, audit
-- findings, broadcasts, the welcome flow…) becomes the universal action
-- table: every column is ADDED and nullable/defaulted, the status CHECK
-- only GAINS 'cancelled', so every existing writer and reader is
-- untouched. `internal_tasks` stays the staff-only work queue — a
-- different audience, not a duplicate — and `action_register` is the
-- one read model across both (security_invoker: a client sees only its
-- own actions, because internal_tasks is staff-only under RLS).
-- "Overdue" is computed at read time, never stored, so it cannot go
-- stale; completion, evidence, verification and cancellation are
-- explicit columns, and verification is a separate fact from status
-- ("complete, not yet verified" is a real state).
--
-- DOCUMENT VERSIONS. documents carried `version` but an UPDATE of the
-- file replaced the evidence with nothing left behind. document_versions
-- snapshots every file a document has ever pointed at, written only by
-- trigger; replacing a file bumps the version and supersedes the old
-- row instead of erasing it. Deleting a document keeps its versions
-- (document_id → NULL, company_id kept) — the deletion itself is in
-- audit_events. hs_documents already versions by new row (106).
--
-- POLICY ACKNOWLEDGEMENTS gain the evidence a later signing flow needs:
-- the person, the exact document version, method, IP, user agent and an
-- evidence blob. The current link/admin flows keep working unchanged.
--
-- BILLING stays Stripe-driven, but an invoice now says what it is FOR
-- (billing_source) and who collects it (billing_provider), so a later
-- non-Stripe source is a value, not a schema change.
--
-- SEARCH. search_records() is SECURITY INVOKER: every branch runs under
-- the caller's own RLS, so it can only ever return rows the caller could
-- already read one table at a time. Postgres only — Tavily is for the
-- outside world, never internal data.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ─── 1. Universal actions ────────────────────────────────────────────

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS site_id             uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type         text,
  ADD COLUMN IF NOT EXISTS source_id           uuid,
  ADD COLUMN IF NOT EXISTS assigned_to         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_person_id  uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity            text,
  ADD COLUMN IF NOT EXISTS completed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_evidence jsonb,
  ADD COLUMN IF NOT EXISTS verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason    text CHECK (length(cancelled_reason) <= 1000),
  ADD COLUMN IF NOT EXISTS created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (source_type IS NULL OR source_type IN (
    'incident','audit','audit_finding','risk_assessment','inspection','equipment_inspection','consultant_visit',
    'service_request','legal_requirement','regulatory_broadcast','broadcast','hr_process','training_gap',
    'contractor_review','compliance_item','hs_check','onboarding','manual','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.actions ADD CONSTRAINT actions_severity_check CHECK (severity IS NULL OR severity IN ('low','medium','high','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.actions ADD CONSTRAINT actions_verified_needs_complete CHECK (verified_at IS NULL OR status = 'complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_status_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_status_check CHECK (status IN ('active','dismissed','complete','cancelled'));

-- related_entity_* was the old, untyped link; carry it over once.
UPDATE public.actions SET source_type = 'other', source_id = related_entity_id
 WHERE source_id IS NULL AND related_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS actions_source_idx ON public.actions (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS actions_assigned_idx ON public.actions (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS actions_company_due_idx ON public.actions (company_id, status, due_date);

CREATE OR REPLACE FUNCTION public.actions_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.assigned_person_id);
  -- An assignee must be able to reach this organisation: home member or
  -- a live grant. Staff may be assigned anything.
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.assigned_to AND (company_id = NEW.company_id OR role = 'tps_admin'))
       AND NOT EXISTS (SELECT 1 FROM user_organisation_access g WHERE g.user_id = NEW.assigned_to
                        AND g.organisation_id = NEW.company_id AND g.active_status = 'active'
                        AND (g.valid_until IS NULL OR g.valid_until > now())) THEN
      RAISE EXCEPTION 'That person has no access to this organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  IF NEW.status = 'complete' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'complete') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'complete' AND NEW.status <> 'complete' THEN
    -- Reopened: the old completion and its verification no longer hold.
    NEW.completed_at := NULL; NEW.completed_by := NULL; NEW.verified_at := NULL; NEW.verified_by := NULL;
  END IF;
  IF NEW.verified_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.verified_at IS NULL) THEN
    NEW.verified_by := COALESCE(NEW.verified_by, auth.uid());
    IF NEW.verified_by IS NOT NULL AND NEW.verified_by = NEW.completed_by AND NOT public.is_tps_staff() THEN
      RAISE EXCEPTION 'An action is verified by someone other than the person who completed it' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'cancelled' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.actions_lifecycle() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS actions_lifecycle ON public.actions;
CREATE TRIGGER actions_lifecycle BEFORE INSERT OR UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.actions_lifecycle();

DROP TRIGGER IF EXISTS actions_audit ON public.actions;
CREATE TRIGGER actions_audit AFTER INSERT OR UPDATE OR DELETE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('action', 'company_id', 'status', 'priority', 'severity', 'due_date',
    'assigned_to', 'assigned_person_id', 'source_type', 'source_id', 'completed_at', 'verified_by', 'verified_at', 'cancelled_at');

-- One read model over client actions and staff tasks.
CREATE OR REPLACE VIEW public.action_register WITH (security_invoker = true) AS
SELECT 'action'::text AS register, a.id, a.company_id AS organisation_id, a.site_id,
       COALESCE(a.source_type, a.action_type) AS source_type, a.source_id, a.title, a.priority, a.severity,
       a.assigned_to, a.due_date, a.status, a.completed_at, a.verified_at,
       (a.status = 'active' AND a.due_date IS NOT NULL AND a.due_date < current_date) AS is_overdue,
       a.created_at
  FROM public.actions a
UNION ALL
SELECT 'internal_task', t.id, t.company_id, NULL::uuid,
       CASE WHEN t.source_ref IS NULL THEN 'manual' ELSE split_part(t.source_ref, ':', 1) END, NULL::uuid,
       t.title, t.priority, NULL, t.assigned_to, t.due_date, t.status, t.completed_at, NULL::timestamptz,
       (COALESCE(t.status, 'open') NOT IN ('done','complete','completed','cancelled')
         AND t.due_date IS NOT NULL AND t.due_date < current_date),
       t.created_at
  FROM public.internal_tasks t;
REVOKE ALL ON public.action_register FROM anon;
GRANT SELECT ON public.action_register TO authenticated;

-- ─── 2. Document versions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id    uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  version        integer NOT NULL CHECK (version >= 1),
  file_path      text,
  file_url       text,
  file_size      bigint,
  uploaded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  effective_date date,
  review_due_at  timestamptz,
  approval_state text NOT NULL DEFAULT 'not_required'
                   CHECK (approval_state IN ('not_required','pending_review','approved','rejected')),
  approved_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at    timestamptz,
  superseded_at  timestamptz,
  CHECK (NULLIF(file_path, '') IS NOT NULL OR NULLIF(file_url, '') IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_doc_version ON public.document_versions (document_id, version)
  WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_one_current ON public.document_versions (document_id)
  WHERE document_id IS NOT NULL AND superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS document_versions_company_idx ON public.document_versions (company_id);

-- Replacing the file is a new version, never an overwrite.
CREATE OR REPLACE FUNCTION public.documents_version_bump()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.file_url IS DISTINCT FROM OLD.file_url)
     AND NEW.version <= OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS documents_version_bump ON public.documents;
CREATE TRIGGER documents_version_bump BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_version_bump();

CREATE OR REPLACE FUNCTION public.documents_snapshot_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE state text;
BEGIN
  state := CASE WHEN NEW.approved_at IS NOT NULL THEN 'approved'
                WHEN NEW.requires_approval THEN 'pending_review' ELSE 'not_required' END;
  IF TG_OP = 'INSERT' OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.file_url IS DISTINCT FROM OLD.file_url THEN
    UPDATE document_versions SET superseded_at = now() WHERE document_id = NEW.id AND superseded_at IS NULL;
    INSERT INTO document_versions (company_id, document_id, version, file_path, file_url, file_size, uploaded_by,
                                   review_due_at, approval_state, approved_by, approved_at)
    VALUES (NEW.company_id, NEW.id, NEW.version, NEW.file_path, NEW.file_url, NEW.file_size,
            COALESCE(auth.uid(), NEW.uploaded_by), NEW.review_due_at, state, NEW.approved_by, NEW.approved_at)
    ON CONFLICT (document_id, version) WHERE document_id IS NOT NULL DO NOTHING;
  ELSIF NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.review_due_at IS DISTINCT FROM OLD.review_due_at THEN
    UPDATE document_versions SET approval_state = state, approved_by = NEW.approved_by, approved_at = NEW.approved_at,
                                 review_due_at = NEW.review_due_at
     WHERE document_id = NEW.id AND superseded_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.documents_snapshot_version() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS documents_snapshot_version ON public.documents;
CREATE TRIGGER documents_snapshot_version AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_snapshot_version();

INSERT INTO public.document_versions (company_id, document_id, version, file_path, file_url, file_size, uploaded_by,
                                      uploaded_at, review_due_at, approval_state, approved_by, approved_at)
SELECT d.company_id, d.id, d.version, d.file_path, d.file_url, d.file_size, d.uploaded_by, d.created_at, d.review_due_at,
       CASE WHEN d.approved_at IS NOT NULL THEN 'approved' WHEN d.requires_approval THEN 'pending_review' ELSE 'not_required' END,
       d.approved_by, d.approved_at
  FROM public.documents d
 WHERE NOT EXISTS (SELECT 1 FROM public.document_versions v WHERE v.document_id = d.id);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.document_versions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS document_versions_read ON public.document_versions;
CREATE POLICY document_versions_read ON public.document_versions
  FOR SELECT TO authenticated
  USING ((SELECT public.is_tps_staff()) OR company_id = (SELECT public.my_company_id()));

-- ─── 3. Policy acknowledgement evidence ─────────────────────────────

ALTER TABLE public.policy_acknowledgements
  ADD COLUMN IF NOT EXISTS person_id           uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ip_address          text CHECK (length(ip_address) <= 64),
  ADD COLUMN IF NOT EXISTS user_agent          text CHECK (length(user_agent) <= 500),
  ADD COLUMN IF NOT EXISTS auth_evidence       jsonb;
ALTER TABLE public.policy_acknowledgements DROP CONSTRAINT IF EXISTS policy_acknowledgements_acknowledged_via_check;
ALTER TABLE public.policy_acknowledgements ADD CONSTRAINT policy_acknowledgements_acknowledged_via_check
  CHECK (acknowledged_via IS NULL OR acknowledged_via IN ('link','admin','portal','in_person','e_signature'));

-- The person and the exact version are filled in, never trusted.
CREATE OR REPLACE FUNCTION public.policy_ack_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    NEW.person_id := (SELECT person_id FROM employee_records WHERE id = NEW.employee_id AND company_id = NEW.company_id);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.document_id IS DISTINCT FROM OLD.document_id THEN
    NEW.document_version_id := (SELECT id FROM document_versions WHERE document_id = NEW.document_id AND superseded_at IS NULL);
  END IF;
  -- The version signed is the version CURRENT at the moment of signing.
  IF NEW.status = 'acknowledged' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'acknowledged') THEN
    NEW.document_version_id := COALESCE(
      (SELECT id FROM document_versions WHERE document_id = NEW.document_id AND superseded_at IS NULL),
      NEW.document_version_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.policy_ack_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS policy_ack_fill ON public.policy_acknowledgements;
CREATE TRIGGER policy_ack_fill BEFORE INSERT OR UPDATE ON public.policy_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.policy_ack_fill();

UPDATE public.policy_acknowledgements pa SET person_id = er.person_id
  FROM public.employee_records er WHERE er.id = pa.employee_id AND pa.person_id IS NULL;

DROP TRIGGER IF EXISTS policy_acknowledgements_audit ON public.policy_acknowledgements;
CREATE TRIGGER policy_acknowledgements_audit AFTER INSERT OR UPDATE OR DELETE ON public.policy_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('policy_ack', 'company_id', 'status', 'acknowledged_at',
    'acknowledged_via', 'document_id', 'document_version_id', 'employee_id');

-- ─── 4. Billing sources ──────────────────────────────────────────────

ALTER TABLE public.one_off_invoices
  ADD COLUMN IF NOT EXISTS billing_source     text NOT NULL DEFAULT 'one_off',
  ADD COLUMN IF NOT EXISTS billing_provider   text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS external_reference text CHECK (length(external_reference) <= 200);
DO $$ BEGIN
  ALTER TABLE public.one_off_invoices ADD CONSTRAINT one_off_invoices_billing_source_check CHECK (billing_source IN
    ('one_off','subscription','retainer','consultancy_work','site_visit','training','recruitment','project'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.one_off_invoices ADD CONSTRAINT one_off_invoices_billing_provider_check CHECK (billing_provider IN
    ('stripe','manual','xero','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. Internal search ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS people_name_trgm ON public.people USING gin (full_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_name_trgm ON public.candidates USING gin (full_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS companies_name_trgm ON public.companies USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS requisitions_title_trgm ON public.requisitions USING gin (title extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_records(p_query text, p_limit integer DEFAULT 30)
RETURNS TABLE (entity_type text, entity_id uuid, organisation_id uuid, title text, subtitle text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  q   text := btrim(COALESCE(p_query, ''));
  pat text;
  lim integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  per integer;
BEGIN
  IF length(q) < 2 OR length(q) > 100 THEN RETURN; END IF;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  per := GREATEST(lim / 4, 5);
  RETURN QUERY
  SELECT * FROM (
    (SELECT 'organisation'::text, c.id, c.id, c.name, c.organisation_type FROM companies c WHERE c.name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'person', p.id, p.company_id, p.full_name, p.worker_type FROM people p
      WHERE p.full_name ILIKE pat OR p.email ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'candidate', c.id, c.company_id, c.full_name, c.pipeline_stage FROM candidates c
      WHERE c.full_name ILIKE pat OR c.email ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'athlete', a.id, a.company_id, a.full_name, a.sport FROM athletes a WHERE a.full_name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'employee', e.id, e.company_id, e.full_name, e.job_title FROM employee_records e WHERE e.full_name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'site', s.id, s.company_id, s.name, s.site_type FROM hs_sites s WHERE s.name ILIKE pat OR s.site_code ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'department', d.id, d.company_id, d.name, d.kind FROM departments d WHERE d.name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'role', r.id, r.company_id, r.title, r.stage::text FROM requisitions r WHERE r.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'document', d.id, d.company_id, d.name, d.category::text FROM documents d WHERE d.name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'hs_document', d.id, d.company_id, d.title, d.category FROM hs_documents d WHERE d.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'action', a.id, a.company_id, a.title, a.status FROM actions a WHERE a.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'incident', i.id, i.company_id, i.incident_type || ' — ' || i.occurred_on::text, i.status
       FROM hs_incidents i WHERE i.incident_type ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'audit', a.id, a.company_id, a.title, a.conducted_on::text FROM hs_audits a WHERE a.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'equipment', e.id, e.company_id, e.name, e.status FROM hs_equipment e
      WHERE e.name ILIKE pat OR e.serial_number ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'service_request', s.id, s.company_id, s.subject, s.status FROM service_requests s WHERE s.subject ILIKE pat LIMIT per)
  ) x
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.search_records(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_records(text, integer) TO authenticated;

-- ─── 6. Write guard on the new table (read-only grants) ─────────────
SELECT public.apply_write_guard('public.document_versions');
