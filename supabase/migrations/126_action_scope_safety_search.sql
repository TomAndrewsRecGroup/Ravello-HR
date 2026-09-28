-- ═══════════════════════════════════════════════════════════════════
-- 126: Core-OS 360 Phase 2 — who may change an action, and internal
-- search over the safety records (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. ACTION UPDATE SCOPE. Found by the 125 probe: `client_actions_update`
--    (Phase 1) let ANY user of the organisation update ANY action. An
--    employee with no part in an action could submit someone else's
--    corrective action for verification with invented evidence. The
--    verification gate itself held (only the named verifier, an
--    assigner or staff can verify), but the record of who did the work
--    was forgeable. 0 client_user profiles exist live, so nobody's
--    access narrows today.
--
--    Now an action can be updated by: anyone holding actions.assign in
--    the organisation (unchanged for owners, admins, editors, managers,
--    advisers and consultants), the assignee (assigned_to, or the person
--    record linked to their login), or the named verifier. The assignee
--    and verifier may touch only the columns their part needs; the guard
--    runs BEFORE actions_lifecycle, so it sees exactly what the caller
--    sent, and the lifecycle's own stamps are applied after it.
--
-- 2. SEARCH. search_records() (119) gains hazards, risk assessments,
--    RAMS, substances, COSHH assessments and investigations, and finds
--    incidents by number, title, site name or date (YYYY-MM-DD). It
--    stays SECURITY INVOKER, so every row still passes the caller's RLS:
--    a reporter finds only their own incident, and nothing searches the
--    incident description (medical detail) or any sensitive record.
--    Internal records only — external search (Tavily) is a separate,
--    later concern and never reaches this function.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Action update scope ─────────────────────────────────────────

-- Am I a party to this action (assignee or verifier)? Own org only.
CREATE OR REPLACE FUNCTION public.action_party(p_assigned_to uuid, p_assigned_person uuid, p_verifier uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
         p_assigned_to = auth.uid()
      OR p_verifier = auth.uid()
      OR (p_assigned_person IS NOT NULL AND EXISTS (
            SELECT 1 FROM people pp WHERE pp.id = p_assigned_person AND pp.user_id = auth.uid()
              AND pp.company_id = public.my_company_id())))
$$;
REVOKE ALL ON FUNCTION public.action_party(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.action_party(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS client_actions_update ON public.actions;
CREATE POLICY client_actions_update ON public.actions FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'actions.assign'))
              OR public.action_party(assigned_to, assigned_person_id, verifier_id)))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'actions.assign'))
              OR public.action_party(assigned_to, assigned_person_id, verifier_id)));

-- What an assignee or verifier (without actions.assign) may change.
-- SECURITY INVOKER, keyed on current_user like every session guard.
CREATE OR REPLACE FUNCTION public.actions_party_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE o jsonb; n jsonb; allowed text[];
        is_assignee boolean; is_verifier boolean;
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF public.is_tps_staff() OR public.has_capability(OLD.company_id, 'actions.assign') THEN RETURN NEW; END IF;

  is_verifier := OLD.verifier_id = auth.uid();
  is_assignee := public.action_party(OLD.assigned_to, OLD.assigned_person_id, NULL);
  allowed := ARRAY['updated_at'];
  IF is_assignee THEN allowed := allowed || ARRAY['status','completion_evidence']; END IF;
  IF is_verifier THEN
    allowed := allowed || ARRAY['status','verification_comments','verification_rejection_reason',
                                'effectiveness_outcome','effectiveness_notes','additional_action_required'];
  END IF;
  o := to_jsonb(OLD) - allowed; n := to_jsonb(NEW) - allowed;
  IF n IS DISTINCT FROM o THEN
    RAISE EXCEPTION 'You can only update your own part of this action' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF is_assignee AND OLD.status IN ('active','in_progress') AND NEW.status IN ('active','in_progress','awaiting_verification','complete') THEN
      NULL;  -- doing the work (the lifecycle decides whether "complete" needs verification first)
    ELSIF is_verifier AND OLD.status = 'awaiting_verification' AND NEW.status IN ('complete','active','in_progress') THEN
      NULL;  -- verifying or sending back (the lifecycle stops the completer verifying their own work)
    ELSE
      RAISE EXCEPTION 'You cannot move this action from % to %', replace(OLD.status, '_', ' '), replace(NEW.status, '_', ' ')
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- "actions_aa_…" sorts before actions_lifecycle: BEFORE triggers fire in
-- name order, so this sees the caller's row, not the lifecycle's stamps.
DROP TRIGGER IF EXISTS actions_aa_party_guard ON public.actions;
CREATE TRIGGER actions_aa_party_guard BEFORE UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.actions_party_guard();

-- ─── 2. Internal search over the safety records ─────────────────────

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
  ) x
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.search_records(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_records(text, integer) TO authenticated;
