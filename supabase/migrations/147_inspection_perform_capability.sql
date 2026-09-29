-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 4 fix: a narrower capability to RECORD an
-- inspection (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found live while probing 146: the operator who actually performs a
-- routine pre-use check (a forklift driver, a machine operator) is very
-- plausibly a plain `client_user` — mapped by 117's legacy_role_map to
-- the catalogue role `employee`, whose capability list is
-- ['organisation.read','site.read','incident.create','hazard.report']
-- — no `asset.manage`. Gating `inspections`/`inspection_responses`
-- INSERT on `asset.manage` (145's own choice, "reuse over invent")
-- therefore locked out the actual front-line user this feature is for,
-- while granting them nothing narrower would mean handing every
-- employee full asset-register edit rights just so they can tick a
-- checklist — the wrong trade the other way.
--
-- `inspection.perform` is the narrow fix: it can record an inspection
-- and nothing else (it does not appear in `hs_evidence_writable`'s
-- equipment/equipment_inspection branch, which stays asset.manage-gated
-- — attaching a certificate or replacing evidence on the asset ITSELF
-- is still an asset-management act; attaching a photo to an
-- INSPECTION's own answer is recording the inspection, so that one
-- specific evidence branch moves to `inspection.perform` too).
--
-- Granted to every role that already holds `asset.manage`, plus
-- `employee` — the one role Group 2's asset.manage list deliberately
-- did not include, and the one this fix exists for.

INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('inspection.perform', 'Record a routine inspection against an asset', false)
ON CONFLICT (key) DO NOTHING;

-- Same VALUES/unnest shape 122/144 use (capability -> ARRAY[roles]), so
-- tenancySql.test.ts's regex-driven TS<->SQL parity check can parse it —
-- the same lesson 144a already had to apply after its first attempt used
-- a dynamic copy-from-existing-grants SELECT instead.
INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('inspection.perform', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','employee'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;

-- ── the template catalogue must be readable by whoever may record an
--    inspection, not only whoever may read the asset register ───────

DROP POLICY IF EXISTS inspection_templates_read ON public.inspection_templates;
CREATE POLICY inspection_templates_read ON public.inspection_templates FOR SELECT TO authenticated
  USING ((SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read'))
      OR (SELECT public.has_capability((SELECT public.my_company_id()), 'inspection.perform')));
DROP POLICY IF EXISTS inspection_template_items_read ON public.inspection_template_items;
CREATE POLICY inspection_template_items_read ON public.inspection_template_items FOR SELECT TO authenticated
  USING ((SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read'))
      OR (SELECT public.has_capability((SELECT public.my_company_id()), 'inspection.perform')));

-- ── inspections/inspection_responses SELECT and INSERT policies move
--    to (or widen to include) the narrower capability ────────────────

DROP POLICY IF EXISTS inspections_read ON public.inspections;
CREATE POLICY inspections_read ON public.inspections FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'inspection.perform'))));
DROP POLICY IF EXISTS inspections_insert ON public.inspections;
CREATE POLICY inspections_insert ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'inspection.perform')));

DROP POLICY IF EXISTS inspection_responses_read ON public.inspection_responses;
CREATE POLICY inspection_responses_read ON public.inspection_responses FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'asset.read'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'inspection.perform'))));
DROP POLICY IF EXISTS inspection_responses_insert ON public.inspection_responses;
CREATE POLICY inspection_responses_insert ON public.inspection_responses FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'inspection.perform')));

-- ── evidence: attaching a photo to an inspection/response is recording
--    the inspection, not managing the asset ─────────────────────────

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
    WHEN p_entity_type = 'equipment_inspection' THEN
      public.has_capability(p_company, 'asset.read')
    WHEN p_entity_type = 'equipment' THEN
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
    WHEN p_entity_type IN ('equipment', 'equipment_inspection') THEN public.has_capability(p_company, 'asset.manage')
    WHEN p_entity_type IN ('inspection', 'inspection_response') THEN public.has_capability(p_company, 'inspection.perform')
    ELSE false
  END
$$;
