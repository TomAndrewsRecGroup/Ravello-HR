-- UI/UX cross-linking pass, round 2 (2026-10-03): search_records() was
-- last extended in Phase 5 Group 8 (163) with 7 branches. Everything
-- built since then — contractors (150), permits (152), emergency
-- plans (154), the hs_tests catalogue (116), and every Phase 6-29
-- subsystem — was never added, so a staff member or client typing a
-- contractor's name, a permit number, or an emergency plan's title
-- into GlobalSearch got nothing, with no indication anything was
-- skipped.
--
-- Deliberately NOT added: isolations (no name/number field — only a
-- closed-vocabulary isolation_type and a free-text description, and
-- this codebase's own standing rule is "never surface notes in a
-- search title", the identical reasoning search_records' own header
-- comment already gives for excluding audit_findings.root_cause);
-- audit_findings itself (same reason — root_cause/comment are the
-- only text on the row); board_assurance_reports and
-- compliance_evaluations (neither has a human-chosen title — a
-- (year, quarter) pair or a status enum is not something anyone
-- searches by name for); environmental_spills/waste_movements/
-- environmental_monitoring (event-log rows with no name of their own,
-- already reachable via their own list pages' date/status filters).
--
-- hs_tests has no company_id (a staff-only global catalogue, 116's
-- own RLS: FOR ALL TO authenticated with no client policy at all) --
-- the exact legal_requirements (159) shape this function's own header
-- comment already documents: a non-staff caller's own row-level
-- security already hides it from this branch with no extra check
-- needed, so NULL::uuid is passed for organisation_id exactly as the
-- legal_requirement branch already does.
--
-- search_records() stays SECURITY INVOKER (Phase 1's own standing
-- rule: it can never return a row the caller could not already read
-- table by table) -- every new branch inherits that from the
-- function's own existing SET search_path/invoker shape; nothing
-- about the function's security posture changes here.

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
    UNION ALL
    (SELECT 'contractor', ct.id, ct.company_id, ct.name, replace(ct.approval_status, '_', ' ')
       FROM contractors ct WHERE ct.name ILIKE pat OR ct.registration_number ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'permit', pm.id, pm.company_id, COALESCE(pm.permit_number, 'Permit') , replace(pm.status, '_', ' ')
       FROM permits pm WHERE pm.permit_number ILIKE pat LIMIT per)
    UNION ALL
    (SELECT 'emergency_plan', ep2.id, ep2.company_id, ep2.title, replace(ep2.plan_type, '_', ' ')
       FROM emergency_plans ep2 WHERE ep2.title ILIKE pat AND ep2.status = 'active' LIMIT per)
    UNION ALL
    (SELECT 'hs_test', ht.id, NULL::uuid, ht.title, COALESCE(ht.category, 'Test')
       FROM hs_tests ht WHERE ht.active AND ht.title ILIKE pat LIMIT per)
  ) x
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.search_records(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_records(text, integer) TO authenticated;
