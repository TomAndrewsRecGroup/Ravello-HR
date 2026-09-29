-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 7: contractor companies, insurance,
-- prequalification (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- A contractor is a company distinct from a worker (Group 8 links
-- individual contractor WORKERS into the Phase 3 person model; this
-- migration is the company record they work for). `contractors.manage`
-- (117) has existed since Phase 1 and has been unenforced until now —
-- the Phase 4 existing-operations audit's own recommendation was to
-- decide whether to enforce or retire it. Enforced here: it already
-- sits on the right roles (consultancy/organisation owners and admins,
-- hse_manager, site_manager, platform staff), so no capability grant
-- change was needed, only RLS policies that finally read it.
--
-- Prequalification is DELIBERATELY NOT a second checklist engine.
-- Group 3's `inspections` is asset-scoped (`asset_id NOT NULL`) and
-- widening it to also cover contractors would blur what it means — a
-- contractor prequalification is a company-level compliance decision,
-- not a per-visit check. Instead: `approval_status` is the
-- prequalification OUTCOME, decided by a person reading the insurance
-- and document evidence this migration tracks; there is no numeric
-- "prequalification score" table. If a scored questionnaire is wanted
-- later, that is new scope, not something this migration should invent
-- to look complete.
--
-- Performance reviews reuse the EXISTING actions.source_type value
-- 'contractor_review' (119/125's CHECK already allows it) — never a
-- second review table. A `contractors.manage` holder raises one as an
-- ordinary action; there is no dedicated "performance" table here.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.contractors (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  registration_number text CHECK (length(registration_number) <= 100),
  contact_name       text CHECK (length(contact_name) <= 200),
  contact_email      text CHECK (length(contact_email) <= 320),
  contact_phone      text CHECK (length(contact_phone) <= 50),
  approval_status    text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'suspended', 'rejected')),
  risk_rating        text CHECK (risk_rating IS NULL OR risk_rating IN ('low', 'medium', 'high')),
  notes              text CHECK (length(notes) <= 4000),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contractors_company_idx ON public.contractors (company_id, approval_status);

DROP TRIGGER IF EXISTS contractors_touch ON public.contractors;
CREATE OR REPLACE FUNCTION public.contractors_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER contractors_touch BEFORE UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.contractors_touch();

DROP TRIGGER IF EXISTS contractors_author ON public.contractors;
CREATE OR REPLACE FUNCTION public.contractors_stamp_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(NEW.created_by, auth.uid()); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contractors_stamp_author() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER contractors_author BEFORE INSERT ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.contractors_stamp_author();

-- ── insurance: one CURRENT row per contractor per insurance type — a
--    renewal UPDATES the row (this is ongoing state, unlike an
--    inspection's "a correction is a new row" discipline: an insurance
--    policy genuinely has one current expiry, not a history of events) ──

CREATE TABLE IF NOT EXISTS public.contractor_insurances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id  uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  insurance_type text NOT NULL CHECK (insurance_type IN ('employers_liability', 'public_liability', 'professional_indemnity', 'other')),
  provider       text CHECK (length(provider) <= 200),
  policy_number  text CHECK (length(policy_number) <= 100),
  cover_amount   numeric CHECK (cover_amount IS NULL OR cover_amount >= 0),
  expires_on     date NOT NULL,
  notes          text CHECK (length(notes) <= 2000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contractor_id, insurance_type)
);
CREATE INDEX IF NOT EXISTS contractor_insurances_expiry_idx ON public.contractor_insurances (expires_on);

DROP TRIGGER IF EXISTS contractor_insurances_touch ON public.contractor_insurances;
CREATE TRIGGER contractor_insurances_touch BEFORE UPDATE ON public.contractor_insurances
  FOR EACH ROW EXECUTE FUNCTION public.contractors_touch();

-- company_id filled from the parent contractor, never trusted from the
-- caller — the same discipline every child-row fill trigger in this
-- codebase already uses.
CREATE OR REPLACE FUNCTION public.contractor_insurances_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record;
BEGIN
  SELECT company_id INTO c FROM public.contractors WHERE id = NEW.contractor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contractor not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := c.company_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contractor_insurances_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS contractor_insurances_fill ON public.contractor_insurances;
CREATE TRIGGER contractor_insurances_fill
  BEFORE INSERT ON public.contractor_insurances
  FOR EACH ROW EXECUTE FUNCTION public.contractor_insurances_fill();

-- ── deterministic "is this contractor currently usable" check ────────
-- Pure, no AI, no scoring — a boolean fact read from the two rows this
-- migration tracks. Required types (employers_liability,
-- public_liability) are the UK standard minimum; ANY on-file insurance
-- past its expiry also fails it, required or not — a lapsed
-- professional_indemnity is still a lapsed policy. Group 8's access
-- gate is the first real caller; exposed now so it never needs a
-- second implementation of "is this contractor OK to use".
CREATE OR REPLACE FUNCTION public.contractor_is_current(p_contractor_id uuid, p_as_of date DEFAULT current_date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.contractors c WHERE c.id = p_contractor_id AND c.approval_status = 'approved')
    AND EXISTS (SELECT 1 FROM public.contractor_insurances i WHERE i.contractor_id = p_contractor_id AND i.insurance_type = 'employers_liability' AND i.expires_on >= p_as_of)
    AND EXISTS (SELECT 1 FROM public.contractor_insurances i WHERE i.contractor_id = p_contractor_id AND i.insurance_type = 'public_liability' AND i.expires_on >= p_as_of)
    AND NOT EXISTS (SELECT 1 FROM public.contractor_insurances i WHERE i.contractor_id = p_contractor_id AND i.expires_on < p_as_of)
$$;
REVOKE ALL ON FUNCTION public.contractor_is_current(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_is_current(uuid, date) TO authenticated;

-- ── evidence: contractor documents/insurance certificates ─────────────

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_type
    WHEN 'hazard'              THEN 'hazards'
    WHEN 'risk_assessment'     THEN 'risk_assessments'
    WHEN 'method_statement'    THEN 'method_statements'
    WHEN 'coshh_assessment'    THEN 'coshh_assessments'
    WHEN 'substance'           THEN 'substances'
    WHEN 'sds'                 THEN 'sds_versions'
    WHEN 'incident'            THEN 'hs_incidents'
    WHEN 'investigation'       THEN 'incident_investigations'
    WHEN 'equipment'           THEN 'hs_equipment'
    WHEN 'person'              THEN 'people'
    WHEN 'document'            THEN 'hs_documents'
    WHEN 'control'             THEN 'controls'
    WHEN 'training_record'     THEN 'training_records'
    WHEN 'action'              THEN 'actions'
    WHEN 'audit'               THEN 'hs_audits'
    WHEN 'site'                THEN 'hs_sites'
    WHEN 'inspection'          THEN 'inspections'
    WHEN 'puwer_assessment'    THEN 'puwer_assessments'
    WHEN 'contractor'          THEN 'contractors'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_entity
    WHEN 'register_item'          THEN 'register'
    WHEN 'register_completion'    THEN 'register'
    WHEN 'activity'                THEN 'register'
    WHEN 'site'                    THEN 'register'
    WHEN 'equipment'               THEN 'register'
    WHEN 'equipment_inspection'    THEN 'register'
    WHEN 'inspection'              THEN 'register'
    WHEN 'inspection_response'     THEN 'register'
    WHEN 'puwer_assessment'        THEN 'register'
    WHEN 'contractor'              THEN 'register'
    WHEN 'document'                THEN 'documents'
    WHEN 'training'                THEN 'training'
    WHEN 'audit'                   THEN 'audits'
    WHEN 'audit_response'          THEN 'audits'
    WHEN 'incident'                THEN 'incidents'
    WHEN 'investigation'           THEN 'incidents'
    WHEN 'hazard'                  THEN 'register'
    WHEN 'risk_assessment'         THEN 'register'
    WHEN 'method_statement'        THEN 'register'
    WHEN 'method_statement_step'   THEN 'register'
    WHEN 'substance'               THEN 'register'
    WHEN 'sds'                     THEN 'register'
    WHEN 'coshh_assessment'        THEN 'register'
    WHEN 'action'                  THEN 'register'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_evidence_readable(p_company uuid, p_entity_type text, p_evidence_type text, p_recorded_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN public.is_tps_staff() THEN true
    WHEN p_company IS DISTINCT FROM public.my_company_id() THEN false
    WHEN p_recorded_by = auth.uid() THEN true
    WHEN p_entity_type IN ('incident', 'investigation') THEN
      public.has_capability(p_company, 'incident.read')
      AND (p_evidence_type NOT IN ('witness_statement', 'medical') OR public.has_capability(p_company, 'incident.sensitive.read'))
    WHEN p_entity_type = 'hazard' THEN
      public.has_capability(p_company, 'hazard.manage') OR public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type IN ('risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds', 'coshh_assessment') THEN
      public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type IN ('equipment', 'equipment_inspection', 'puwer_assessment') THEN
      public.has_capability(p_company, 'asset.read')
    WHEN p_entity_type IN ('inspection', 'inspection_response') THEN
      public.has_capability(p_company, 'asset.read') OR public.has_capability(p_company, 'inspection.perform')
    WHEN p_entity_type = 'contractor' THEN
      public.has_capability(p_company, 'contractors.manage')
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_evidence_writable(p_company uuid, p_entity_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN public.is_tps_staff() THEN true
    WHEN p_company IS DISTINCT FROM public.my_company_id() THEN false
    WHEN p_entity_type = 'hazard'        THEN public.has_capability(p_company, 'hazard.report')
    WHEN p_entity_type = 'incident'      THEN public.has_capability(p_company, 'incident.create')
    WHEN p_entity_type = 'investigation' THEN public.has_capability(p_company, 'incident.investigate')
    WHEN p_entity_type IN ('risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds', 'coshh_assessment')
                                         THEN public.has_capability(p_company, 'risk.create')
    WHEN p_entity_type = 'action'        THEN true
    WHEN p_entity_type IN ('equipment', 'equipment_inspection', 'puwer_assessment') THEN public.has_capability(p_company, 'asset.manage')
    WHEN p_entity_type IN ('inspection', 'inspection_response') THEN public.has_capability(p_company, 'inspection.perform')
    WHEN p_entity_type = 'contractor'     THEN public.has_capability(p_company, 'contractors.manage')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection',
                         'puwer_assessment', 'contractor') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- One Safety Timeline entry per contractor row change (approval status,
-- insurance touch) — a light-touch log, not a full audit history (the
-- generic audit_events/audit_row mechanism (117) is the one for that,
-- applied below).
CREATE OR REPLACE FUNCTION public.hs_event_contractor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'contractor', NEW.id, 'added', 'Contractor added — ' || NEW.name);
  ELSIF TG_OP = 'UPDATE' AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    PERFORM public.hs_log(NEW.company_id, 'contractor', NEW.id, 'status_' || NEW.approval_status,
      NEW.name || ' — ' || replace(NEW.approval_status, '_', ' '));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_event_contractor() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS contractors_hs_event ON public.contractors;
CREATE TRIGGER contractors_hs_event
  AFTER INSERT OR UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_contractor();

-- ── outbox: an approval-status change is the one thing worth reacting
--    to (a suspension needs telling someone); insurance renewals are
--    read by the reminders cron directly (expires_on), no event needed ──

DROP TRIGGER IF EXISTS contractors_platform_event ON public.contractors;
CREATE TRIGGER contractors_platform_event AFTER INSERT OR UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('name', 'approval_status', 'risk_rating');

-- ── generic audit trail (117) ──────────────────────────────────────

DROP TRIGGER IF EXISTS contractors_audit ON public.contractors;
CREATE TRIGGER contractors_audit AFTER INSERT OR UPDATE OR DELETE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('contractor', 'company_id', 'name', 'approval_status', 'risk_rating', 'registration_number');

-- ── write guard (117) ──────────────────────────────────────────────

SELECT public.apply_write_guard('public.contractors');
SELECT public.apply_write_guard('public.contractor_insurances');

-- ── RLS: contractors.manage governs everything here, staff included
--    via is_tps_staff() as already established elsewhere ────────────

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_insurances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractors_staff_all ON public.contractors;
CREATE POLICY contractors_staff_all ON public.contractors FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS contractors_manage ON public.contractors;
CREATE POLICY contractors_manage ON public.contractors FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));

DROP POLICY IF EXISTS contractor_insurances_staff_all ON public.contractor_insurances;
CREATE POLICY contractor_insurances_staff_all ON public.contractor_insurances FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS contractor_insurances_manage ON public.contractor_insurances;
CREATE POLICY contractor_insurances_manage ON public.contractor_insurances FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'contractors.manage')));
