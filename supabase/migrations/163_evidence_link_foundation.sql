-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 8: evidence-link foundation for the Legal
-- Register / Objectives / Audit Findings, a governance KPI framework,
-- reporting, and search coverage (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Groups 1-7 (migrations 156-162). Read
-- docs/CORE_OS_360_PHASE5_GOVERNANCE_MAP.md before touching this.
--
-- Hard rules this migration is built to:
--   1. Evidence-link FOUNDATION only, never the full Evidence Engine.
--      requirement_evidence_links is a SIBLING to standard_evidence_
--      links (158), not an extension of it — standard_evidence_links
--      is keyed to a standard_clauses row (a fixed ISO clause); the
--      three sources here (a legal obligation, an objective, an audit
--      finding) are not clauses and have no clause_id to hang off. A
--      second polymorphic SOURCE side (source_type/source_id) that
--      reuses the exact same hs_entity_table()/hs_entity_company()
--      validation the evidence SIDE already uses is simpler and more
--      consistent than three bespoke link tables or forcing a foreign
--      concept onto standard_evidence_links' own clause_id column.
--   2. No automated evidence suggestion, no AI, no cross-subsystem
--      scoring. A link is an explicit human action — insert or delete,
--      never an update ("a wrong link is removed, not edited", the
--      same rule standard_evidence_links already follows).
--   3. hs_entity_table() gains 'legal_obligation' and 'objective' so
--      the SOURCE side can be validated with the identical generic
--      mechanism the evidence side already uses — never a bespoke
--      second lookup function. 'audit_finding' already resolves
--      (added in 162 for its own evidence branch).
--   4. Capability reuse: risk.read / risk.create — the same broadest
--      "can see/add to the H&S register" pair Groups 3-7 (158-162)
--      consistently reused. No new capability seeded.
--   5. apply_write_guard() on the one new client-writable table.
--   6. search_records() (Phase 1, SECURITY INVOKER by omission — never
--      change that) gains branches for the Phase 5 tables that had no
--      search coverage at all: environmental_aspects, environmental_
--      permits, legal_requirements (staff-only RLS already hides this
--      from a client caller — the function runs as invoker, so no
--      extra check is needed here), objectives, management_reviews,
--      audit_programmes, consultation_records, iso_certifications.
--      Deliberately excluded: audit_findings.root_cause and
--      environmental_complaints.description are free-text narrative,
--      the same "never surface notes in a search title" discipline
--      the outbox whitelists already apply — neither table has a
--      short controlled title field to search on instead.
--
-- Idempotent. Safe to re-run.

-- ── hs_entity_table(): add the two SOURCE-side entity kinds ─────────
--
-- Re-created with 162's exact latest body plus two new branches —
-- every existing branch copied unchanged, provably additive.

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
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
    ELSE NULL END
$$;

-- ── requirement_evidence_links: the foundation table ────────────────
--
-- source_type is a small, closed vocabulary (rule 1) — the three
-- governance requirement kinds the task names, never "any entity can
-- be a source" (that generality belongs to a later Evidence Engine, if
-- one is ever built, not to this foundation).

CREATE TABLE IF NOT EXISTS public.requirement_evidence_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type  text NOT NULL CHECK (source_type IN ('legal_obligation', 'objective', 'audit_finding')),
  source_id    uuid NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  added_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_type, source_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS requirement_evidence_links_company_idx
  ON public.requirement_evidence_links (company_id, source_type, source_id);

CREATE OR REPLACE FUNCTION public.requirement_evidence_links_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE src_owner uuid; ev_owner uuid;
BEGIN
  NEW.added_by := auth.uid();

  IF public.hs_entity_table(NEW.source_type) IS NULL THEN
    RAISE EXCEPTION 'Unknown requirement source type: %', NEW.source_type USING ERRCODE = '23514';
  END IF;
  IF public.hs_entity_table(NEW.entity_type) IS NULL THEN
    RAISE EXCEPTION 'Unknown evidence entity type: %', NEW.entity_type USING ERRCODE = '23514';
  END IF;

  src_owner := public.hs_entity_company(NEW.source_type, NEW.source_id);
  IF src_owner IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Requirement must belong to the same organisation' USING ERRCODE = '23514';
  END IF;

  ev_owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
  IF ev_owner IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.requirement_evidence_links_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS requirement_evidence_links_fill ON public.requirement_evidence_links;
CREATE TRIGGER requirement_evidence_links_fill
  BEFORE INSERT ON public.requirement_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.requirement_evidence_links_fill();

-- ── audit trail (117) — identifying/classifying only, never notes ──

DROP TRIGGER IF EXISTS requirement_evidence_links_audit ON public.requirement_evidence_links;
CREATE TRIGGER requirement_evidence_links_audit AFTER INSERT OR DELETE ON public.requirement_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('requirement_evidence_link', 'company_id', 'source_type', 'source_id', 'entity_type', 'entity_id');

-- ── write guard (rule 5) ─────────────────────────────────────────────

SELECT public.apply_write_guard('public.requirement_evidence_links');

-- ── RLS: per-company, client-read + client-insert/delete, staff ALL ──
--
-- Exactly standard_evidence_links' own shape (158): never an UPDATE
-- policy — a wrong link is removed, not edited.

ALTER TABLE public.requirement_evidence_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS requirement_evidence_links_staff_all ON public.requirement_evidence_links;
CREATE POLICY requirement_evidence_links_staff_all ON public.requirement_evidence_links FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS requirement_evidence_links_read ON public.requirement_evidence_links;
CREATE POLICY requirement_evidence_links_read ON public.requirement_evidence_links FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS requirement_evidence_links_insert ON public.requirement_evidence_links;
CREATE POLICY requirement_evidence_links_insert ON public.requirement_evidence_links FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));

DROP POLICY IF EXISTS requirement_evidence_links_delete ON public.requirement_evidence_links;
CREATE POLICY requirement_evidence_links_delete ON public.requirement_evidence_links FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));

-- ── search_records(): cover the Phase 5 tables (rule 6) ─────────────
--
-- Re-created with 137's exact latest body plus seven new UNION ALL
-- branches — every existing branch copied unchanged. Stays SECURITY
-- INVOKER by omission (Phase 1's own standing rule: it can never
-- return a row the caller could not already read table by table).
-- legal_requirements is staff-only RLS (159) — a non-staff caller's
-- own row-level security already hides it from this branch with no
-- extra check needed here, the same reason hs_documents needed none.

CREATE OR REPLACE FUNCTION public.search_records(p_query text, p_limit integer DEFAULT 30)
RETURNS TABLE(entity_type text, entity_id uuid, organisation_id uuid, title text, subtitle text)
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  q   text := btrim(COALESCE(p_query, ''));
  pat text;
  lim integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  per integer;
  qdate date;
BEGIN
  IF length(q) < 2 OR length(q) > 100 THEN RETURN; END IF;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  per := GREATEST(lim / 4, 5);
  IF q ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN qdate := q::date; EXCEPTION WHEN others THEN qdate := NULL; END;
  END IF;
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
    (SELECT 'job_role', j.id, j.company_id, j.title, j.active_status FROM job_roles j WHERE j.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'training_course', tc.id, tc.company_id, tc.title, COALESCE(tc.provider, 'Training course')
       FROM training_courses tc WHERE tc.company_id IS NOT NULL AND tc.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'document', d.id, d.company_id, d.name, d.category::text FROM documents d WHERE d.name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'hs_document', d.id, d.company_id, d.title, d.category FROM hs_documents d WHERE d.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'action', a.id, a.company_id, a.title, a.status FROM actions a WHERE a.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'incident', i.id, i.company_id,
            COALESCE(i.incident_number || ' — ', '') || COALESCE(i.title, initcap(replace(i.incident_type, '_', ' '))),
            i.occurred_on::text || ' · ' || replace(i.status, '_', ' ')
       FROM hs_incidents i
      WHERE i.incident_number ILIKE pat OR i.title ILIKE pat OR i.incident_type ILIKE pat
         OR i.occurred_on = qdate
         OR EXISTS (SELECT 1 FROM hs_sites s WHERE s.id = i.site_id AND s.name ILIKE pat)
      ORDER BY i.occurred_on DESC LIMIT per)
    UNION ALL
    (SELECT 'investigation', v.id, v.company_id, v.reference, replace(v.status, '_', ' ')
       FROM incident_investigations v WHERE v.reference ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'hazard', h.id, h.company_id, h.reference || ' — ' || h.title, replace(h.status, '_', ' ')
       FROM hazards h WHERE h.reference ILIKE pat OR h.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'risk_assessment', ra.id, ra.company_id, ra.reference || ' v' || ra.version || ' — ' || ra.title, replace(ra.status, '_', ' ')
       FROM risk_assessments ra WHERE ra.reference ILIKE pat OR ra.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'method_statement', m.id, m.company_id, m.reference || ' v' || m.version || ' — ' || m.title, replace(m.status, '_', ' ')
       FROM method_statements m WHERE m.reference ILIKE pat OR m.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'substance', su.id, su.company_id, su.reference || ' — ' || su.product_name, COALESCE(su.manufacturer, su.supplier)
       FROM substances su WHERE su.reference ILIKE pat OR su.product_name ILIKE pat OR su.manufacturer ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'coshh_assessment', ca.id, ca.company_id, ca.reference || ' v' || ca.version || ' — ' || ca.title, replace(ca.status, '_', ' ')
       FROM coshh_assessments ca WHERE ca.reference ILIKE pat OR ca.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'audit', a.id, a.company_id, a.title, a.conducted_on::text FROM hs_audits a WHERE a.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'equipment', e.id, e.company_id, e.name, e.status FROM hs_equipment e
      WHERE e.name ILIKE pat OR e.serial_number ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'service_request', s.id, s.company_id, s.subject, s.status FROM service_requests s WHERE s.subject ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'environmental_aspect', ea.id, ea.company_id, ea.activity, replace(ea.aspect_type, '_', ' ')
       FROM environmental_aspects ea WHERE ea.activity ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'environmental_permit', ep.id, ep.company_id,
            ep.permit_type || COALESCE(' — ' || ep.permit_number, ''), replace(ep.status, '_', ' ')
       FROM environmental_permits ep WHERE ep.permit_type ILIKE pat OR ep.permit_number ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'legal_requirement', lr.id, NULL::uuid, lr.title, replace(lr.category, '_', ' ')
       FROM legal_requirements lr WHERE lr.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'objective', ob.id, ob.company_id, ob.title, replace(ob.status, '_', ' ')
       FROM objectives ob WHERE ob.title ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'management_review', mr.id, mr.company_id, 'Management review — ' || mr.review_date::text, replace(mr.status, '_', ' ')
       FROM management_reviews mr WHERE mr.review_date = qdate OR mr.status ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'audit_programme', ap.id, ap.company_id, ap.name, replace(ap.frequency, '_', ' ')
       FROM audit_programmes ap WHERE ap.name ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'consultation_record', cr.id, cr.company_id, cr.topic, replace(cr.method, '_', ' ')
       FROM consultation_records cr WHERE cr.topic ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'iso_certification', ic.id, ic.company_id, COALESCE(ic.certificate_number, 'ISO certification'), ic.certifying_body
       FROM iso_certifications ic WHERE ic.certificate_number ILIKE pat OR ic.certifying_body ILIKE pat LIMIT per)
  ) x
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.search_records(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_records(text, integer) TO authenticated;
