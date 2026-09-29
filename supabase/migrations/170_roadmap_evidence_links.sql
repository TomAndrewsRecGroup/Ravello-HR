-- Core-OS 360 Phase 6, Group 5: Roadmap Integration (spec section 8).
--
-- "Strengthen the existing roadmap so improvement milestones can link
-- to audit findings, legal gaps, objectives, documents, training, site
-- visits and actions. Do not reduce the roadmap to generic tasks."
--
-- REUSE, not a parallel system: requirement_evidence_links (163) already
-- IS exactly this shape — a polymorphic (source_type, source_id) link to
-- a polymorphic (entity_type, entity_id) piece of evidence, with the
-- same-organisation check already built. Adding 'milestone' as a fourth
-- source_type is the whole change; EvidenceLinksPanel.tsx (the ONE UI
-- for this, already used on the legal obligation, objective and audit
-- finding source pages) needs no new logic, only a widened prop type.

ALTER TABLE public.requirement_evidence_links DROP CONSTRAINT requirement_evidence_links_source_type_check;
ALTER TABLE public.requirement_evidence_links ADD CONSTRAINT requirement_evidence_links_source_type_check
  CHECK (source_type IN ('legal_obligation', 'objective', 'audit_finding', 'milestone'));

-- hs_entity_table() gains 'milestone' -> 'milestones' — every prior
-- branch copied unchanged (additive, not a rewrite; pinned by
-- requirementEvidenceLinksSql.test.ts's own spot-check).
CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE
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
    ELSE NULL END
$$;
