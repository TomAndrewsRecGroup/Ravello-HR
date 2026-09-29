-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 3: the inspection engine (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- A routine/pre-use INSPECTION is a checklist run against ONE ASSET —
-- a forklift's daily pre-use check, a machine guard inspection, a PPE
-- check — as distinct from `hs_audits` (110), which is a facility-wide
-- WALK-ROUND across many topics, and from `hs_equipment_inspections`
-- (114), which is a single dated pass/fail statutory-examination
-- record with no checklist (that table is EXTENDED, not replaced, by
-- LOLER's thorough examinations in a later group — a thorough
-- examination genuinely IS a single dated pass/fail event with a
-- next-due date, not a checklist).
--
-- This migration copies hs_audits'/hs_submit_audit()'s proven shape
-- verbatim, per the Phase 4 existing-operations audit's own
-- recommendation, adapted from "one visit" to "one asset":
--   * INSERT-ONLY — a correction is a new inspection, never an edit;
--   * client-generated ids on BOTH the inspection and its responses
--     (110 learned the response-id lesson the hard way in 113 — this
--     table starts with it, so evidence photos can be staged against a
--     specific response before the inspection itself is ever inserted);
--   * one atomic SECURITY INVOKER submit function (insert-or-return-
--     existing on p_id) so a retried request after a dropped connection
--     cannot create a second inspection or double-raise consequences;
--   * the overall outcome is COMPUTED SERVER-SIDE from the responses,
--     never trusted from the client — the same discipline
--     computeAuditScore()/hs_submit_audit() already established.
--
-- Explicitly NOT built here (Group 4's job): raising a defect, moving
-- the asset to 'quarantined', or any return-to-service gate. The
-- consequence rule below only NOTIFIES on a failed inspection — Group 4
-- extends that same rule to also raise the defect/action, reading the
-- inspections/inspection_responses rows this migration creates.
--
-- Idempotent. Safe to re-run.

-- ── templates: staff reference data, same posture as hs_audit_templates
--    and 106's sector packs — never client-specific, never a Safety
--    Timeline entry on their own ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspection_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text CHECK (length(description) <= 2000),
  asset_type  text CHECK (asset_type IS NULL OR asset_type IN
                ('plant', 'machinery', 'vehicle', 'tool', 'lifting_equipment', 'fixed_installation', 'ppe_equipment', 'other')),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inspection_templates_asset_type_idx ON public.inspection_templates (asset_type) WHERE asset_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inspection_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.inspection_templates(id) ON DELETE CASCADE,
  prompt      text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  guidance    text CHECK (length(guidance) <= 1000),
  -- A critical item's FAIL is what Group 4 reads to decide whether the
  -- asset quarantines outright, vs. a non-critical fail that raises a
  -- lower-priority defect only. One definition, set once, per item.
  critical    boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS inspection_template_items_template_idx ON public.inspection_template_items (template_id, sort_order);

DROP TRIGGER IF EXISTS inspection_templates_touch ON public.inspection_templates;
CREATE OR REPLACE FUNCTION public.inspection_templates_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER inspection_templates_touch BEFORE UPDATE ON public.inspection_templates
  FOR EACH ROW EXECUTE FUNCTION public.inspection_templates_touch();

-- ── inspections: one row per completed checklist run against one asset ──

CREATE TABLE IF NOT EXISTS public.inspections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id              uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  asset_id             uuid NOT NULL REFERENCES public.hs_equipment(id) ON DELETE CASCADE,
  template_id          uuid REFERENCES public.inspection_templates(id) ON DELETE SET NULL,
  title                text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  conducted_on         date NOT NULL CHECK (conducted_on <= current_date + 1),
  -- Computed server-side (hs_submit_inspection) from the responses —
  -- never accepted from the client.
  overall_outcome      text NOT NULL CHECK (overall_outcome IN ('pass', 'fail')),
  has_critical_failure boolean NOT NULL DEFAULT false,
  notes                text CHECK (length(notes) <= 4000),
  recorded_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind     text NOT NULL DEFAULT 'system',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inspections_asset_idx ON public.inspections (asset_id, conducted_on DESC);
CREATE INDEX IF NOT EXISTS inspections_company_idx ON public.inspections (company_id, conducted_on DESC);

DROP TRIGGER IF EXISTS inspections_author ON public.inspections;
CREATE TRIGGER inspections_author
  BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.hs_stamp_author();

-- Asset must belong to the same organisation as the inspection, and the
-- inspection's site (if given) must match the asset's own site — the
-- same shape 144's own operational-area guard just established.
CREATE OR REPLACE FUNCTION public.inspections_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE eq record;
BEGIN
  SELECT company_id, site_id INTO eq FROM public.hs_equipment WHERE id = NEW.asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset not found' USING ERRCODE = '23503';
  END IF;
  IF eq.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Asset belongs to a different organisation' USING ERRCODE = '23514';
  END IF;
  IF NEW.site_id IS NOT NULL AND eq.site_id IS NOT NULL AND eq.site_id IS DISTINCT FROM NEW.site_id THEN
    RAISE EXCEPTION 'Inspection site does not match the asset''s own site' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inspections_same_org() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS inspections_same_org_guard ON public.inspections;
CREATE TRIGGER inspections_same_org_guard BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspections_same_org();

-- ── responses: one row per answered checklist item ───────────────────
-- id is client-generated from the start (113 learned this the hard way
-- for hs_audit_responses) so evidence photos can be staged against a
-- specific response before Submit is ever pressed.

CREATE TABLE IF NOT EXISTS public.inspection_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id     uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_item_id  uuid REFERENCES public.inspection_template_items(id) ON DELETE SET NULL,
  prompt            text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  critical          boolean NOT NULL DEFAULT false,
  rating            text NOT NULL CHECK (rating IN ('pass', 'fail', 'na')),
  comment           text CHECK (length(comment) <= 2000),
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inspection_responses_inspection_idx ON public.inspection_responses (inspection_id, sort_order);

-- company_id filled from the parent inspection, never trusted from the
-- caller — the same discipline hs_audit_response_fill() already uses.
CREATE OR REPLACE FUNCTION public.inspection_response_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ins record;
BEGIN
  SELECT company_id INTO ins FROM public.inspections WHERE id = NEW.inspection_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := ins.company_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inspection_response_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS inspection_response_fill ON public.inspection_responses;
CREATE TRIGGER inspection_response_fill
  BEFORE INSERT ON public.inspection_responses
  FOR EACH ROW EXECUTE FUNCTION public.inspection_response_fill();

-- ── atomic submit: the inspection row and every response, or neither ──
-- SECURITY INVOKER (not DEFINER) — this exists for the TRANSACTION,
-- never to escalate privilege; RLS/write-guard apply exactly as if the
-- caller ran the inserts directly. p_id is CLIENT-GENERATED: calling
-- this twice with the same id returns the existing inspection rather
-- than creating a second one and double-notifying.
CREATE OR REPLACE FUNCTION public.hs_submit_inspection(
  p_id uuid, p_company_id uuid, p_site_id uuid, p_asset_id uuid, p_template_id uuid,
  p_title text, p_conducted_on date, p_notes text, p_responses jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing uuid;
  r        jsonb;
  any_fail boolean := false;
  crit_fail boolean := false;
BEGIN
  SELECT id INTO existing FROM public.inspections WHERE id = p_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    IF r->>'rating' = 'fail' THEN
      any_fail := true;
      IF COALESCE((r->>'critical')::boolean, false) THEN crit_fail := true; END IF;
    END IF;
  END LOOP;

  INSERT INTO public.inspections (id, company_id, site_id, asset_id, template_id, title, conducted_on,
                                   overall_outcome, has_critical_failure, notes)
  VALUES (p_id, p_company_id, p_site_id, p_asset_id, p_template_id, p_title, p_conducted_on,
          CASE WHEN any_fail THEN 'fail' ELSE 'pass' END, crit_fail, p_notes);

  FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    INSERT INTO public.inspection_responses (id, inspection_id, template_item_id, prompt, critical, rating, comment, sort_order)
    VALUES (
      COALESCE(NULLIF(r->>'id', '')::uuid, gen_random_uuid()),
      p_id,
      NULLIF(r->>'template_item_id', '')::uuid,
      r->>'prompt',
      COALESCE((r->>'critical')::boolean, false),
      r->>'rating',
      NULLIF(r->>'comment', ''),
      COALESCE((r->>'sort_order')::integer, 0)
    );
  END LOOP;

  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.hs_submit_inspection(uuid, uuid, uuid, uuid, uuid, text, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_submit_inspection(uuid, uuid, uuid, uuid, uuid, text, date, text, jsonb) TO authenticated;

-- ── evidence: 'inspection'/'inspection_response' get an hs_files scope,
--    the same register scope 'equipment_inspection' already uses ──────

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
    WHEN p_entity_type IN ('equipment', 'equipment_inspection', 'inspection', 'inspection_response') THEN
      public.has_capability(p_company, 'asset.read')
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
    WHEN p_entity_type IN ('equipment', 'equipment_inspection', 'inspection', 'inspection_response') THEN public.has_capability(p_company, 'asset.manage')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Safety Timeline: one entry per inspection, not per response ──────

CREATE OR REPLACE FUNCTION public.hs_event_inspection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, 'inspection', NEW.id,
    CASE WHEN NEW.overall_outcome = 'pass' THEN 'completed' ELSE 'failed' END,
    NEW.title || ' — ' || to_char(NEW.conducted_on, 'DD Mon YYYY') || ' (' || NEW.overall_outcome || ')');
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_event_inspection() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS inspections_hs_event ON public.inspections;
CREATE TRIGGER inspections_hs_event
  AFTER INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_inspection();

-- ── outbox: only the inspection itself, not each response — a rule
--    reads hs_audit_responses/inspection_responses directly from the
--    one event this fires, the same shape hs_audits already uses ─────

DROP TRIGGER IF EXISTS inspections_platform_event ON public.inspections;
CREATE TRIGGER inspections_platform_event AFTER INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('asset_id', 'site_id', 'template_id', 'conducted_on', 'overall_outcome', 'has_critical_failure');

-- ── immutability: a correction is a new inspection, never an edit ────

REVOKE UPDATE, DELETE, TRUNCATE ON public.inspections           FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.inspection_responses  FROM PUBLIC, anon, authenticated;

-- ── read-only-consultant write guard (117) — every client-writable
--    table introduced since 122 calls this; the inspection tables are
--    no exception, insert-only or not ─────────────────────────────────

SELECT public.apply_write_guard('public.inspection_templates');
SELECT public.apply_write_guard('public.inspection_template_items');
SELECT public.apply_write_guard('public.inspections');
SELECT public.apply_write_guard('public.inspection_responses');

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.inspection_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_responses      ENABLE ROW LEVEL SECURITY;

-- Templates: staff reference data only, same posture as sector packs
-- and hs_audit_templates.
DROP POLICY IF EXISTS inspection_templates_staff_all ON public.inspection_templates;
CREATE POLICY inspection_templates_staff_all ON public.inspection_templates FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS inspection_template_items_staff_all ON public.inspection_template_items;
CREATE POLICY inspection_template_items_staff_all ON public.inspection_template_items FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
-- Any authenticated user with asset.read may SEE the template catalogue
-- (to pick one when starting an inspection) even though only staff may
-- edit it.
DROP POLICY IF EXISTS inspection_templates_read ON public.inspection_templates;
CREATE POLICY inspection_templates_read ON public.inspection_templates FOR SELECT TO authenticated
  USING ((SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read')));
DROP POLICY IF EXISTS inspection_template_items_read ON public.inspection_template_items;
CREATE POLICY inspection_template_items_read ON public.inspection_template_items FOR SELECT TO authenticated
  USING ((SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read')));

-- Inspections/responses: staff full access; anyone with asset.manage in
-- their own company may record one (the same capability that manages
-- the asset itself); anyone with asset.read may see their own
-- company's inspections — nothing here is self-certified beyond that.
DROP POLICY IF EXISTS inspections_staff_all ON public.inspections;
CREATE POLICY inspections_staff_all ON public.inspections FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS inspections_read ON public.inspections;
CREATE POLICY inspections_read ON public.inspections FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read')));
DROP POLICY IF EXISTS inspections_insert ON public.inspections;
CREATE POLICY inspections_insert ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'asset.manage')));

DROP POLICY IF EXISTS inspection_responses_staff_all ON public.inspection_responses;
CREATE POLICY inspection_responses_staff_all ON public.inspection_responses FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS inspection_responses_read ON public.inspection_responses;
CREATE POLICY inspection_responses_read ON public.inspection_responses FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read')));
DROP POLICY IF EXISTS inspection_responses_insert ON public.inspection_responses;
CREATE POLICY inspection_responses_insert ON public.inspection_responses FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'asset.manage')));

-- ── one starter template, so there is something to pick on day one
--    (106's sector packs / 110's starter audit template rationale) ────

INSERT INTO public.inspection_templates (id, name, description, asset_type)
VALUES ('00000000-0000-4000-8001-000000000001', 'Forklift pre-use check', 'A daily pre-use checklist for powered lift trucks.', 'vehicle')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inspection_template_items (template_id, prompt, guidance, critical, sort_order)
SELECT '00000000-0000-4000-8001-000000000001', v.prompt, v.guidance, v.critical, v.sort_order
FROM (VALUES
  ('Tyres/wheels in good condition, correctly inflated?',   NULL, false, 1),
  ('Forks/attachments free of cracks or damage?',           NULL, true,  2),
  ('Mast and chains operate smoothly, no visible damage?',  NULL, true,  3),
  ('Brakes (service and parking) working correctly?',       NULL, true,  4),
  ('Horn, lights and reversing alarm working?',              NULL, false, 5),
  ('Seatbelt present and functioning?',                     NULL, true,  6),
  ('No fluid leaks visible (fuel, hydraulic, coolant)?',     NULL, true,  7),
  ('Data/capacity plate legible and in place?',             NULL, false, 8)
) AS v(prompt, guidance, critical, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.inspection_template_items
  WHERE template_id = '00000000-0000-4000-8001-000000000001' AND prompt = v.prompt
);
