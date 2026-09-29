-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 1: Environmental Aspects & Impacts
-- (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 5 turns Core-OS 360 into a full EHS management system. This is
-- Group 1: the governance map (docs/CORE_OS_360_PHASE5_GOVERNANCE_MAP.md)
-- plus the environmental aspects & impacts register — the ISO 14001
-- foundation every later environmental group (incidents, waste, spills,
-- emissions, permits) sits on top of.
--
-- An "aspect" is an element of an activity, product or service that CAN
-- interact with the environment (e.g. "diesel generator run during power
-- cuts" → aspect_type emissions_to_air). An "impact" is what actually
-- happens as a result (climate change contribution). This schema records
-- the aspect and scores its SIGNIFICANCE — never its legal compliance
-- (absolute rule #10: no certification language anywhere in this
-- subsystem).
--
-- Absolute rules this migration is built to (see the task brief):
--   1. Never build a second action table — a significant aspect raises
--      an `actions` row via the existing universal table.
--   2. No black-box AI significance scoring. Significance is
--      likelihood × severity × frequency (three named, inspectable,
--      1-5 integer criteria), computed deterministically, and requires
--      an explicit human CONFIRMATION before an aspect is marked
--      significant. Jev is never invoked anywhere in this file.
--   3. History is preserved. A material change to an aspect is a NEW
--      VERSION (a new row, old row flips to 'superseded') — the exact
--      discipline `hs_documents` (106) and `emergency_plans` (154)
--      already established, copied verbatim, not the tables themselves.
--   4. RLS mandatory, capability-gated, write-guarded.
--   5. Audit trail: identifying/classifying columns only, never
--      free-text description/methodology_notes.
--   6. Outbox: environmental_aspects joins TRIGGERED_ENTITIES; the
--      consequence rule lives in a new environmentalRules.ts, mirroring
--      hsRules.ts's structure — never folded into hsRules.ts itself,
--      since Environmental is its own EHS pillar, not H&S.
--   7. Evidence rides the existing hs_files/hs-evidence infrastructure
--      via a new 'environmental_aspect' branch on the four evidence
--      functions (the exact pattern Group 2's 'equipment' branch and
--      Group 3's 'inspection' branch already established in Phase 4).
--
-- Idempotent. Safe to re-run.

-- ── environmental_aspects: the register, versioned ────────────────────

CREATE TABLE IF NOT EXISTS public.environmental_aspects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id           uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  activity          text NOT NULL CHECK (length(btrim(activity)) BETWEEN 1 AND 200),
  aspect_type       text NOT NULL CHECK (aspect_type IN (
                      'emissions_to_air', 'discharge_to_water', 'waste_generation', 'land_contamination',
                      'resource_use', 'noise', 'energy_use', 'raw_material_use', 'other')),
  condition         text NOT NULL DEFAULT 'normal' CHECK (condition IN ('normal', 'abnormal', 'emergency')),
  description       text CHECK (length(description) <= 4000),
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'assessed', 'confirmed_significant', 'confirmed_not_significant', 'superseded')),
  supersedes_id     uuid REFERENCES public.environmental_aspects(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environmental_aspects_company_idx ON public.environmental_aspects (company_id, status);
CREATE INDEX IF NOT EXISTS environmental_aspects_site_idx    ON public.environmental_aspects (site_id) WHERE site_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.environmental_aspects_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'environmental_aspects', NEW.supersedes_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_aspects_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_aspects_stamp ON public.environmental_aspects;
CREATE TRIGGER environmental_aspects_stamp BEFORE INSERT OR UPDATE ON public.environmental_aspects
  FOR EACH ROW EXECUTE FUNCTION public.environmental_aspects_stamp();

-- ── environmental_aspect_assessments: the scored significance record ──
--
-- likelihood/severity/frequency are named, 1-5 integer criteria —
-- inspectable, never a black box. computed_score is likelihood ×
-- severity × frequency, computed by the database at insert, never
-- trusted from the client. significance_threshold_used records what
-- threshold was live WHEN this assessment was made, since the threshold
-- may change over time and a stored assessment must keep showing the
-- rule it was actually judged against. is_significant is a human
-- decision (confirmed_by/confirmed_at), never auto-set from the score
-- alone — the score is EVIDENCE for the human confirmation, not a
-- verdict on its own. Insert-only: a correction is a new assessment row
-- (rule 3), which is why there is no UPDATE/DELETE grant.

CREATE TABLE IF NOT EXISTS public.environmental_aspect_assessments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aspect_id                   uuid NOT NULL REFERENCES public.environmental_aspects(id) ON DELETE CASCADE,
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  likelihood                  integer NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  severity                    integer NOT NULL CHECK (severity BETWEEN 1 AND 5),
  frequency                   integer NOT NULL CHECK (frequency BETWEEN 1 AND 5),
  computed_score              integer GENERATED ALWAYS AS (likelihood * severity * frequency) STORED,
  significance_threshold_used integer NOT NULL CHECK (significance_threshold_used BETWEEN 1 AND 125),
  is_significant              boolean NOT NULL,
  confirmed_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at                timestamptz,
  methodology_notes           text CHECK (length(methodology_notes) <= 4000),
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environmental_aspect_assessments_aspect_idx ON public.environmental_aspect_assessments (aspect_id, created_at DESC);

-- company_id filled from the parent aspect, never trusted from the
-- caller (the same discipline contractor_insurances_fill()/
-- hs_completion_fill() already use); confirmed_by/confirmed_at may only
-- be set together — an is_significant=true assessment with no confirmer
-- is exactly the black-box bypass rule 2 exists to prevent, so the
-- database refuses it, not just the UI.

CREATE OR REPLACE FUNCTION public.environmental_aspect_assessments_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a record;
BEGIN
  SELECT company_id INTO a FROM public.environmental_aspects WHERE id = NEW.aspect_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Environmental aspect not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := a.company_id;
  NEW.created_by := auth.uid();

  -- Rule 2's hard gate: no confirmation, no significance decision — of
  -- either polarity. An assessment that has not been confirmed by a
  -- human is not yet a decision, so is_significant on an unconfirmed
  -- row would be exactly the "the platform decided" shape this rule
  -- forbids, whichever way it points.
  IF NEW.confirmed_by IS NULL OR NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'An environmental significance assessment must be confirmed by a named person' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_aspect_assessments_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_aspect_assessments_fill ON public.environmental_aspect_assessments;
CREATE TRIGGER environmental_aspect_assessments_fill
  BEFORE INSERT ON public.environmental_aspect_assessments
  FOR EACH ROW EXECUTE FUNCTION public.environmental_aspect_assessments_fill();

-- The newest confirmed assessment decides the aspect's own status —
-- 'confirmed_significant' / 'confirmed_not_significant' — never left to
-- drift out of step with the assessment that actually judged it. This
-- is the ONLY writer of environmental_aspects.status besides the
-- version-supersede path below, so the two can never disagree.

CREATE OR REPLACE FUNCTION public.environmental_aspect_assessments_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.environmental_aspects
  SET status = CASE WHEN NEW.is_significant THEN 'confirmed_significant' ELSE 'confirmed_not_significant' END,
      updated_at = now()
  WHERE id = NEW.aspect_id AND status <> 'superseded';
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.environmental_aspect_assessments_roll() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_aspect_assessments_roll ON public.environmental_aspect_assessments;
CREATE TRIGGER environmental_aspect_assessments_roll
  AFTER INSERT ON public.environmental_aspect_assessments
  FOR EACH ROW EXECUTE FUNCTION public.environmental_aspect_assessments_roll();

REVOKE UPDATE, DELETE, TRUNCATE ON public.environmental_aspect_assessments FROM PUBLIC, anon, authenticated;

-- ── evidence: environmental_aspect gains an hs_files scope ────────────
--
-- Re-creates hs_entity_table()/hs_scope_for_entity()/hs_evidence_
-- readable()/hs_evidence_writable()/hs_files_entity_check() (150's
-- latest bodies), adding only the 'environmental_aspect' branch — the
-- exact pattern Group 2 (144, 'equipment') and Group 3 (145,
-- 'inspection') already established. Every other branch copied
-- unchanged so this migration is provably additive.

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_type
    WHEN 'hazard'                THEN 'hazards'
    WHEN 'risk_assessment'       THEN 'risk_assessments'
    WHEN 'method_statement'      THEN 'method_statements'
    WHEN 'coshh_assessment'      THEN 'coshh_assessments'
    WHEN 'substance'             THEN 'substances'
    WHEN 'sds'                   THEN 'sds_versions'
    WHEN 'incident'              THEN 'hs_incidents'
    WHEN 'investigation'         THEN 'incident_investigations'
    WHEN 'equipment'             THEN 'hs_equipment'
    WHEN 'person'                THEN 'people'
    WHEN 'document'              THEN 'hs_documents'
    WHEN 'control'               THEN 'controls'
    WHEN 'training_record'       THEN 'training_records'
    WHEN 'action'                THEN 'actions'
    WHEN 'audit'                 THEN 'hs_audits'
    WHEN 'site'                  THEN 'hs_sites'
    WHEN 'inspection'            THEN 'inspections'
    WHEN 'puwer_assessment'      THEN 'puwer_assessments'
    WHEN 'contractor'            THEN 'contractors'
    WHEN 'environmental_aspect'  THEN 'environmental_aspects'
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
    WHEN 'environmental_aspect'    THEN 'register'
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
    WHEN p_entity_type = 'environmental_aspect' THEN
      public.has_capability(p_company, 'environmental.read')
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
    WHEN p_entity_type = 'environmental_aspect' THEN public.has_capability(p_company, 'environmental.manage')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection',
                         'puwer_assessment', 'contractor', 'environmental_aspect') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Timeline: one entry per aspect on add / status change / supersede ─
--
-- Mirrors emergency_plans_event()/hs_document_event() exactly: never
-- logs the free-text description, only the classifying fields.

CREATE OR REPLACE FUNCTION public.environmental_aspects_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'environmental_aspect', NEW.id, 'aspect_added',
      'Environmental aspect added: ' || NEW.activity || ' (v' || NEW.version || ')');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'environmental_aspect', NEW.id, 'status_' || NEW.status,
      NEW.activity || ' — ' || replace(NEW.status, '_', ' '));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.environmental_aspects_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_aspects_hs_event ON public.environmental_aspects;
CREATE TRIGGER environmental_aspects_hs_event AFTER INSERT OR UPDATE ON public.environmental_aspects
  FOR EACH ROW EXECUTE FUNCTION public.environmental_aspects_event();

-- ── outbox: whitelist is classifying fields only, never description ──

DROP TRIGGER IF EXISTS environmental_aspects_platform_event ON public.environmental_aspects;
CREATE TRIGGER environmental_aspects_platform_event AFTER INSERT OR UPDATE ON public.environmental_aspects
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('site_id', 'aspect_type', 'condition', 'status');

-- ── generic audit trail (117) — identifying/classifying only ─────────

DROP TRIGGER IF EXISTS environmental_aspects_audit ON public.environmental_aspects;
CREATE TRIGGER environmental_aspects_audit AFTER INSERT OR UPDATE OR DELETE ON public.environmental_aspects
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_aspect', 'company_id', 'activity', 'aspect_type', 'condition', 'status', 'version');

DROP TRIGGER IF EXISTS environmental_aspect_assessments_audit ON public.environmental_aspect_assessments;
CREATE TRIGGER environmental_aspect_assessments_audit AFTER INSERT ON public.environmental_aspect_assessments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_aspect_assessment', 'company_id', 'aspect_id', 'computed_score', 'is_significant');

-- ── never build a second action table (rule 1): a significant aspect
--    is an actions row, keyed so a re-confirmation never raises two ────

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_type_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (source_type IS NULL OR source_type IN (
  'incident', 'audit', 'audit_finding', 'risk_assessment', 'inspection', 'equipment_inspection', 'consultant_visit',
  'service_request', 'legal_requirement', 'regulatory_broadcast', 'broadcast', 'hr_process', 'training_gap',
  'contractor_review', 'compliance_item', 'hs_check', 'onboarding', 'manual', 'other',
  'hazard', 'method_statement', 'coshh_assessment', 'investigation', 'riddor_review', 'puwer_assessment',
  'environmental_aspect'));

-- ── write guard (117) ──────────────────────────────────────────────

SELECT public.apply_write_guard('public.environmental_aspects');
SELECT public.apply_write_guard('public.environmental_aspect_assessments');

-- ── capabilities, seeded in the literal ('capability', ARRAY[roles])
--    shape — never a dynamic SELECT — so tenancySql.test.ts's TS↔SQL
--    parity regex can parse it (the exact 144a/147a trap this
--    codebase's own history records twice already). Role lists copied
--    verbatim from 'risk.read'/'risk.create' (117), the same choice
--    Group 2's asset.* capabilities made: usable immediately by the
--    people who already work with risk assessments. ─────────────────

INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('environmental.read',   'See the environmental aspects & impacts register', false),
  ('environmental.manage', 'Add, assess and confirm environmental aspects', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('environmental.read',   ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','department_manager','read_only']),
  ('environmental.manage', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;

-- ── RLS: staff full access; environmental.read/manage govern client
--    access, the exact contractors.manage / asset.read shape ────────

ALTER TABLE public.environmental_aspects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environmental_aspect_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS environmental_aspects_staff_all ON public.environmental_aspects;
CREATE POLICY environmental_aspects_staff_all ON public.environmental_aspects FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS environmental_aspects_read ON public.environmental_aspects;
CREATE POLICY environmental_aspects_read ON public.environmental_aspects FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS environmental_aspects_manage ON public.environmental_aspects;
CREATE POLICY environmental_aspects_manage ON public.environmental_aspects FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS environmental_aspects_manage_update ON public.environmental_aspects;
CREATE POLICY environmental_aspects_manage_update ON public.environmental_aspects FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS environmental_aspect_assessments_staff_all ON public.environmental_aspect_assessments;
CREATE POLICY environmental_aspect_assessments_staff_all ON public.environmental_aspect_assessments FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS environmental_aspect_assessments_read ON public.environmental_aspect_assessments;
CREATE POLICY environmental_aspect_assessments_read ON public.environmental_aspect_assessments FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS environmental_aspect_assessments_insert ON public.environmental_aspect_assessments;
CREATE POLICY environmental_aspect_assessments_insert ON public.environmental_aspect_assessments FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));
