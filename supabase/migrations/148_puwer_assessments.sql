-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 5: PUWER assessments (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- A PUWER assessment is a formal, periodic review of one asset against
-- the Provision and Use of Work Equipment Regulations — distinct from a
-- routine pre-use inspection (Group 3: frequent, driver/operator-level,
-- pass/fail per item) and from a LOLER thorough examination (Group 6,
-- next: a single dated pass/fail event with a next-due date). A PUWER
-- assessment produces a COMPLIANCE OUTCOME and a review cycle, and may
-- optionally be BACKED BY a checklist run (reusing Group 3's
-- `inspections`/`inspection_responses` machinery — never a second
-- checklist engine) via `inspection_id`.
--
-- `hs_equipment.puwer_applicable` (144) already flags which assets this
-- applies to; a trigger here refuses recording one against an asset that
-- is not flagged, so the register can never silently apply the wrong
-- regulation to the wrong asset type.
--
-- Explicit Phase 4 rule, applied here first because it is where a wrong
-- word would matter most: NEVER assert legal compliance. Every outcome
-- label and every piece of copy this migration or its consumers produce
-- says "recorded assessment outcome", never "this machine is legally
-- compliant" — a recorded outcome is evidence of what was checked and
-- when, not a legal certification.
--
-- Insert-only (a correction is a new assessment, same "a correction is
-- a new row" discipline as the register's other evidence tables).
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.puwer_assessments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id          uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  asset_id         uuid NOT NULL REFERENCES public.hs_equipment(id) ON DELETE CASCADE,
  inspection_id    uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  outcome          text NOT NULL CHECK (outcome IN ('compliant', 'non_compliant', 'compliant_with_actions')),
  assessed_on      date NOT NULL CHECK (assessed_on <= current_date + 1),
  review_due_on    date,
  notes            text CHECK (length(notes) <= 4000),
  recorded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL DEFAULT 'system',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS puwer_assessments_asset_idx ON public.puwer_assessments (asset_id, assessed_on DESC);
CREATE INDEX IF NOT EXISTS puwer_assessments_review_due_idx ON public.puwer_assessments (review_due_on) WHERE review_due_on IS NOT NULL;

DROP TRIGGER IF EXISTS puwer_assessments_author ON public.puwer_assessments;
CREATE TRIGGER puwer_assessments_author
  BEFORE INSERT ON public.puwer_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_stamp_author();

-- Same-org + PUWER-applicable + inspection-belongs-to-same-asset guard.
CREATE OR REPLACE FUNCTION public.puwer_assessments_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE eq record; insp record;
BEGIN
  SELECT company_id, puwer_applicable INTO eq FROM public.hs_equipment WHERE id = NEW.asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset not found' USING ERRCODE = '23503';
  END IF;
  IF eq.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Asset belongs to a different organisation' USING ERRCODE = '23514';
  END IF;
  IF NOT eq.puwer_applicable THEN
    RAISE EXCEPTION 'This asset is not flagged as PUWER-applicable' USING ERRCODE = '23514';
  END IF;
  IF NEW.inspection_id IS NOT NULL THEN
    SELECT company_id, asset_id INTO insp FROM public.inspections WHERE id = NEW.inspection_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inspection not found' USING ERRCODE = '23503';
    END IF;
    IF insp.company_id IS DISTINCT FROM NEW.company_id OR insp.asset_id IS DISTINCT FROM NEW.asset_id THEN
      RAISE EXCEPTION 'The linked inspection does not belong to this asset' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.puwer_assessments_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS puwer_assessments_guard ON public.puwer_assessments;
CREATE TRIGGER puwer_assessments_guard BEFORE INSERT ON public.puwer_assessments
  FOR EACH ROW EXECUTE FUNCTION public.puwer_assessments_guard();

-- ── evidence, timeline, outbox ────────────────────────────────────────

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
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection', 'puwer_assessment') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- One Safety Timeline entry per assessment. Copy is deliberately neutral
-- — "Recorded assessment: compliant/non-compliant/compliant with
-- actions" — never "legally compliant" (Phase 4's own standing rule).
CREATE OR REPLACE FUNCTION public.hs_event_puwer_assessment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, 'puwer_assessment', NEW.id, 'assessed',
    'PUWER assessment recorded — ' || to_char(NEW.assessed_on, 'DD Mon YYYY')
    || ' (' || replace(NEW.outcome, '_', ' ') || ')');
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_event_puwer_assessment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS puwer_assessments_hs_event ON public.puwer_assessments;
CREATE TRIGGER puwer_assessments_hs_event
  AFTER INSERT ON public.puwer_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_puwer_assessment();

DROP TRIGGER IF EXISTS puwer_assessments_platform_event ON public.puwer_assessments;
CREATE TRIGGER puwer_assessments_platform_event AFTER INSERT ON public.puwer_assessments
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('asset_id', 'inspection_id', 'outcome', 'assessed_on', 'review_due_on');

-- ── a PUWER finding is an actions row too (never a second table) ─────
-- 'puwer_assessment' joins 'inspection' etc. in the CHECK 119/125
-- already maintain.

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_type_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (source_type IS NULL OR source_type IN (
  'incident', 'audit', 'audit_finding', 'risk_assessment', 'inspection', 'equipment_inspection', 'consultant_visit',
  'service_request', 'legal_requirement', 'regulatory_broadcast', 'broadcast', 'hr_process', 'training_gap',
  'contractor_review', 'compliance_item', 'hs_check', 'onboarding', 'manual', 'other',
  'hazard', 'method_statement', 'coshh_assessment', 'investigation', 'riddor_review', 'puwer_assessment'));

-- ── immutability + write guard ─────────────────────────────────────────

REVOKE UPDATE, DELETE, TRUNCATE ON public.puwer_assessments FROM PUBLIC, anon, authenticated;
SELECT public.apply_write_guard('public.puwer_assessments');

-- ── RLS: staff full access; client reads their own company's rows;
--    recording one is an asset-MANAGEMENT act (a formal compliance
--    review), gated on asset.manage, not the narrower inspection.perform
--    Group 3's routine checks use ──────────────────────────────────────

ALTER TABLE public.puwer_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS puwer_assessments_staff_all ON public.puwer_assessments;
CREATE POLICY puwer_assessments_staff_all ON public.puwer_assessments FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS puwer_assessments_read ON public.puwer_assessments;
CREATE POLICY puwer_assessments_read ON public.puwer_assessments FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read')));
DROP POLICY IF EXISTS puwer_assessments_insert ON public.puwer_assessments;
CREATE POLICY puwer_assessments_insert ON public.puwer_assessments FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'asset.manage')));
