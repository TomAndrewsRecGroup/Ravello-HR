-- Core-OS 360 Phase 7, Group 3 (section 5: Structured Observations;
-- section 4: Mobile/Tablet Visit Mode).
--
-- "Immediate-danger findings must trigger appropriate escalation/
-- actions, not merely appear in a report" — done SYNCHRONOUSLY, inside
-- the same INSERT, the same discipline hs_quarantine_asset() (146)/
-- LOLER immediate danger (149) already established: a safety-critical
-- consequence cannot wait for the five-minute platform_events consumer.

CREATE TABLE IF NOT EXISTS public.visit_observations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id            uuid NOT NULL REFERENCES public.consultancy_visits(id) ON DELETE CASCADE,
  -- Filled from the visit by trigger, never trusted from the caller —
  -- the same "derived, not asked" discipline hs_audit_response_fill()/
  -- hs_completion_fill() already use.
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_section    text CHECK (location_section IS NULL OR length(location_section) <= 200),
  observation_type    text NOT NULL CHECK (observation_type IN (
    'positive', 'observation', 'improvement', 'nonconformance', 'immediate_danger'
  )),
  description         text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  severity            text CHECK (severity IS NULL OR severity IN ('minor', 'moderate', 'major', 'critical')),
  client_visible      boolean NOT NULL DEFAULT true,
  action_required     boolean NOT NULL DEFAULT false,
  -- "linked source records" — an asset, a person, a contractor or a
  -- document this observation is ABOUT. Polymorphic, the same
  -- (source_type, source_id) shape requirement_evidence_links (163)
  -- already established for exactly this "link to one of several
  -- kinds of existing record" need.
  linked_source_type  text,
  linked_source_id    uuid,
  resulting_action_id uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visit_observations_visit ON public.visit_observations(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_observations_company ON public.visit_observations(company_id);

-- ── company_id fill + linked-source same-organisation guard ─────────
-- "attempt to attach Client B asset/document/person during Client A
-- visit" (the Phase 7 QA command's own named attack) is refused HERE:
-- a linked_source_id naming a record belonging to a DIFFERENT company
-- than the visit's own client is rejected outright, using the SAME
-- hs_entity_company()/hs_entity_table() resolution every other
-- cross-organisation evidence guard in this codebase already uses.
CREATE OR REPLACE FUNCTION public.visit_observation_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid; linked_company uuid;
BEGIN
  SELECT client_organisation_id INTO v_client FROM public.consultancy_visits WHERE id = NEW.visit_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'visit_id does not reference a real visit' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := v_client;

  IF NEW.linked_source_type IS NOT NULL THEN
    IF NEW.linked_source_id IS NULL THEN
      RAISE EXCEPTION 'linked_source_id is required when linked_source_type is set' USING ERRCODE = '23514';
    END IF;
    linked_company := public.hs_entity_company(NEW.linked_source_type, NEW.linked_source_id);
    IF linked_company IS DISTINCT FROM v_client THEN
      RAISE EXCEPTION 'Linked source record must belong to the same client as this visit' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.visit_observation_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS visit_observation_fill ON public.visit_observations;
CREATE TRIGGER visit_observation_fill BEFORE INSERT ON public.visit_observations
  FOR EACH ROW EXECUTE FUNCTION public.visit_observation_fill();

-- ── immediate-danger escalation, synchronous ─────────────────────────
-- Never gated on action_required (an immediate-danger finding escalates
-- REGARDLESS of what that flag says — the same "the database does not
-- trust the app layer to have got it right" defence-in-depth
-- hs_submit_inspection()/hs_quarantine_asset() already apply). Written
-- with created_by_admin-shaped urgency: severity critical, priority
-- urgent, verification_required true — a human must close the loop.
CREATE OR REPLACE FUNCTION public.visit_observation_escalate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE new_action_id uuid;
BEGIN
  IF NEW.observation_type = 'immediate_danger' THEN
    INSERT INTO public.actions (
      company_id, title, description, action_type, priority, status,
      source_type, source_id, related_entity_type, related_entity_id,
      severity, verification_required, created_by_admin
    ) VALUES (
      NEW.company_id, 'Immediate danger: ' || left(NEW.description, 180), NEW.description,
      'hs_check', 'urgent', 'active',
      'consultant_visit', NEW.visit_id, 'visit_observation', NEW.id,
      'critical', true, false
    ) RETURNING id INTO new_action_id;
    UPDATE public.visit_observations SET resulting_action_id = new_action_id WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.visit_observation_escalate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS visit_observation_escalate ON public.visit_observations;
CREATE TRIGGER visit_observation_escalate AFTER INSERT ON public.visit_observations
  FOR EACH ROW EXECUTE FUNCTION public.visit_observation_escalate();

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.visit_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY visit_observations_staff_all ON public.visit_observations FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Portfolio-wide, same shape as every other Phase 6/7 consultancy
-- table: gated on the VISIT's own client_organisation_id, never the
-- currently active organisation.
CREATE POLICY visit_observations_consultancy_all ON public.visit_observations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consultancy_visits v WHERE v.id = visit_observations.visit_id
                   AND v.consultancy_organisation_id = (SELECT public.my_home_company_id())
                   AND (SELECT public.has_capability(v.client_organisation_id, 'consultancy.service_manage'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.consultancy_visits v WHERE v.id = visit_observations.visit_id
                   AND v.consultancy_organisation_id = (SELECT public.my_home_company_id())
                   AND (SELECT public.has_capability(v.client_organisation_id, 'consultancy.service_manage'))));

-- Client read: client_visible rows only — "nothing here is self-
-- certified" and a client never sees an internal-only observation.
CREATE POLICY visit_observations_client_read ON public.visit_observations FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND client_visible = true);

SELECT public.apply_write_guard('public.visit_observations');

-- ── audit trail: description is free text, never whitelisted ───────
CREATE TRIGGER visit_observations_audit AFTER INSERT OR UPDATE OR DELETE ON public.visit_observations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'visit_observation', 'company_id',
    'visit_id', 'observation_type', 'severity', 'client_visible', 'action_required'
  );

-- ── outbox: an eventual notification, alongside (never instead of) the
--    synchronous action creation above ─────────────────────────────
CREATE TRIGGER visit_observations_platform_event AFTER INSERT ON public.visit_observations
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row(
    'visit_id', 'observation_type', 'severity', 'client_visible', 'action_required'
  );

-- ── evidence: photos against a specific observation ─────────────────
-- hs_files_entity_type_check (095, still live) requires
-- hs_scope_for_entity(entity_type) IS NOT NULL — the scope value
-- itself stopped gating anything the day 105 removed the provider
-- grants that were the only thing that ever read it (Phase 4 Group 4's
-- own note); it is purely a CHECK-satisfying label now.
CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
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
    WHEN 'environmental_spill'     THEN 'register'
    WHEN 'waste_movement'          THEN 'register'
    WHEN 'environmental_monitoring' THEN 'register'
    WHEN 'environmental_permit'    THEN 'register'
    WHEN 'iso_certification'       THEN 'register'
    WHEN 'compliance_evaluation'   THEN 'register'
    WHEN 'document'                THEN 'documents'
    WHEN 'training'                THEN 'training'
    WHEN 'audit'                   THEN 'audits'
    WHEN 'audit_response'          THEN 'audits'
    WHEN 'audit_finding'           THEN 'audits'
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
    WHEN 'consultation_record'     THEN 'register'
    WHEN 'environmental_complaint' THEN 'register'
    WHEN 'visit_observation'       THEN 'register'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_type
    WHEN 'hazard'                    THEN 'hazards'
    WHEN 'risk_assessment'           THEN 'risk_assessments'
    WHEN 'method_statement'          THEN 'method_statements'
    WHEN 'coshh_assessment'          THEN 'coshh_assessments'
    WHEN 'substance'                 THEN 'substances'
    WHEN 'sds'                       THEN 'sds_versions'
    WHEN 'incident'                  THEN 'hs_incidents'
    WHEN 'investigation'             THEN 'incident_investigations'
    WHEN 'equipment'                 THEN 'hs_equipment'
    WHEN 'person'                    THEN 'people'
    WHEN 'document'                  THEN 'hs_documents'
    WHEN 'control'                   THEN 'controls'
    WHEN 'training_record'           THEN 'training_records'
    WHEN 'action'                    THEN 'actions'
    WHEN 'audit'                     THEN 'hs_audits'
    WHEN 'site'                      THEN 'hs_sites'
    WHEN 'inspection'                THEN 'inspections'
    WHEN 'puwer_assessment'          THEN 'puwer_assessments'
    WHEN 'contractor'                THEN 'contractors'
    WHEN 'environmental_aspect'      THEN 'environmental_aspects'
    WHEN 'environmental_spill'       THEN 'environmental_spills'
    WHEN 'waste_movement'            THEN 'waste_movements'
    WHEN 'environmental_monitoring'  THEN 'environmental_monitoring'
    WHEN 'environmental_permit'      THEN 'environmental_permits'
    WHEN 'compliance_item'           THEN 'compliance_items'
    WHEN 'iso_certification'         THEN 'iso_certifications'
    WHEN 'compliance_evaluation'     THEN 'compliance_evaluations'
    WHEN 'audit_finding'             THEN 'audit_findings'
    WHEN 'consultation_record'       THEN 'consultation_records'
    WHEN 'environmental_complaint'   THEN 'environmental_complaints'
    WHEN 'legal_obligation'          THEN 'organisation_legal_obligations'
    WHEN 'objective'                 THEN 'objectives'
    WHEN 'milestone'                 THEN 'milestones'
    WHEN 'visit_observation'         THEN 'visit_observations'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection',
                         'puwer_assessment', 'contractor', 'environmental_aspect',
                         'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit',
                         'iso_certification', 'compliance_evaluation', 'audit_finding', 'consultation_record',
                         'environmental_complaint', 'visit_observation') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_files_entity_check() FROM PUBLIC, anon, authenticated;

-- Two NEW, narrowly-scoped hs_files policies for visit_observation
-- evidence only — never modifying hs_files_client_read/insert, which
-- gate on company_id = my_company_id() (the ACTIVE org) and would
-- refuse a portfolio-wide consultant who never switches into the
-- client. Adding a policy is additive (RLS ORs permissive policies);
-- every other entity_type's existing behaviour is untouched.
CREATE POLICY hs_files_consultancy_visit_read ON public.hs_files FOR SELECT TO authenticated
  USING (entity_type = 'visit_observation' AND (SELECT public.has_capability(hs_files.company_id, 'consultancy.client_access')));
CREATE POLICY hs_files_consultancy_visit_insert ON public.hs_files FOR INSERT TO authenticated
  WITH CHECK (entity_type = 'visit_observation' AND (SELECT public.has_capability(hs_files.company_id, 'consultancy.service_manage')));

-- Same reasoning, one new storage policy for hs-evidence uploads —
-- hs_evidence_client_insert requires folder[1] = my_company_id(),
-- which a portfolio-wide consultant never satisfies. hs_evidence_
-- client_read is untouched and needs no change: its EXISTS (SELECT 1
-- FROM hs_files WHERE storage_path = objects.name) subquery already
-- runs under the caller's own session and therefore already respects
-- the two new hs_files policies above.
CREATE POLICY hs_evidence_consultancy_visit_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hs-evidence'
    AND (storage.foldername(name))[2] = 'visit_observation'
    AND (SELECT public.has_capability(((storage.foldername(name))[1])::uuid, 'consultancy.service_manage'))
  );
