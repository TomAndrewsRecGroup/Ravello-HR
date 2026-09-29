-- ═══════════════════════════════════════════════════════════════════
-- 137: Core-OS 360 Phase 3 — workforce integration (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Plan §7. The workforce joins the flows that already exist, without
-- replacing any of them:
--
--   1. Lifecycle follows employment. employee_records drives
--      people.lifecycle_status (pre_employment before the start date,
--      active, notice once an end date is set, leave_of_absence, leaver).
--      A daily tick moves the dates that pass with no write.
--   2. Hire → role. An employee created from a candidate whose
--      requisition names a job role gets ONE primary assignment (keyed
--      hire:<employee>) and the role's pre-employment checks as
--      outstanding rows. "Offer accepted" never means deployable: Safe to
--      Deploy judges the checks (spec 62).
--   3. Leaver. When the record is terminated: live assignments end,
--      live exceptions and authorisations are revoked, lifecycle →
--      leaver. Nothing is deleted.
--   4. people.primary_role_id mirrors the live primary assignment.
--   5. Safety → workforce, always by a person (spec: "nothing happens
--      automatically"): an incident, corrective action, COSHH or risk
--      assessment can PROPOSE nothing on its own; a user with the right
--      capability confirms a requirement with an explicit scope (a
--      person, a site or a role — never the whole organisation), sourced
--      to the record. Suspensions use 134's RPCs (source_type incident).
--   6. Duplicate people are DETECTED, never merged (spec: no destructive
--      merge unless identity is confirmed).
--   7. Search finds job roles and training courses.
--   8. deployment_status_log reaches the outbox (statuses only).
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Lifecycle from employment ───────────────────────────────────

-- The lifecycle the person's latest employment record implies, or NULL
-- when they have none (candidates, athletes and logins keep theirs).
CREATE OR REPLACE FUNCTION public.workforce_lifecycle_for(p_person uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN e.status::text = 'terminated'                                 THEN 'leaver'
    WHEN e.status::text = 'on_leave'                                   THEN 'leave_of_absence'
    WHEN e.start_date > public.workforce_today()                       THEN 'pre_employment'
    WHEN e.end_date IS NOT NULL AND e.end_date >= public.workforce_today() THEN 'notice'
    ELSE 'active' END
    FROM employee_records e
   WHERE e.person_id = p_person
   ORDER BY (e.status::text <> 'terminated') DESC, e.start_date DESC, e.created_at DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.workforce_apply_lifecycle(p_person uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE want text := public.workforce_lifecycle_for(p_person);
BEGIN
  IF want IS NULL THEN RETURN NULL; END IF;
  UPDATE people SET lifecycle_status = want
   WHERE id = p_person AND lifecycle_status IS DISTINCT FROM want AND lifecycle_status <> 'archived';
  RETURN want;
END $$;

-- Hire, lifecycle and leaving, from the employment record.
CREATE OR REPLACE FUNCTION public.workforce_employee_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE role uuid; req uuid; asg uuid; end_d date; t date := public.workforce_today();
BEGIN
  IF NEW.person_id IS NULL THEN RETURN NULL; END IF;

  -- Hire → the requisition's job role, once.
  IF TG_OP = 'INSERT' AND NEW.source_candidate_id IS NOT NULL THEN
    SELECT c.requisition_id INTO req FROM candidates c WHERE c.id = NEW.source_candidate_id AND c.company_id = NEW.company_id;
    SELECT r.job_role_id INTO role FROM requisitions r
      JOIN job_roles j ON j.id = r.job_role_id AND j.company_id = NEW.company_id
     WHERE r.id = req;
    IF role IS NOT NULL THEN
      INSERT INTO role_assignments (company_id, person_id, role_id, site_id, department_id, primary_assignment,
                                    start_date, assignment_status, source_ref)
      SELECT NEW.company_id, NEW.person_id, role,
             (SELECT id FROM hs_sites WHERE id = NEW.site_id AND company_id = NEW.company_id),
             (SELECT id FROM departments WHERE id = NEW.department_id AND company_id = NEW.company_id),
             NOT EXISTS (SELECT 1 FROM role_assignments x WHERE x.person_id = NEW.person_id
                           AND x.primary_assignment AND x.assignment_status <> 'ended'),
             NEW.start_date, CASE WHEN NEW.start_date > t THEN 'planned' ELSE 'active' END, 'hire:' || NEW.id
      ON CONFLICT (company_id, source_ref) DO NOTHING
      RETURNING id INTO asg;
      IF asg IS NOT NULL THEN
        -- The role's pre-employment checks, as outstanding work.
        INSERT INTO pre_employment_checks (company_id, person_id, check_type_id, status)
        SELECT DISTINCT NEW.company_id, NEW.person_id, rr.reference_id, 'required'
          FROM role_requirements rr
         WHERE rr.role_id = role AND rr.requirement_type = 'pre_employment_check' AND rr.reference_id IS NOT NULL
           AND rr.effective_from IS NOT NULL AND rr.effective_from <= GREATEST(NEW.start_date, t)
           AND (rr.effective_until IS NULL OR rr.effective_until >= t)
        ON CONFLICT (person_id, check_type_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- Leaving: assignments end, exceptions and authorisations lapse.
  IF NEW.status::text = 'terminated' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    end_d := COALESCE(NEW.end_date, t);
    UPDATE role_assignments SET end_date = GREATEST(start_date, end_d), assignment_status = 'ended',
                                ended_reason = 'Left the organisation'
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND assignment_status <> 'ended';
    UPDATE requirement_exceptions SET revoked_at = now(), revoke_reason = 'Left the organisation'
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND revoked_at IS NULL AND valid_until >= t;
    UPDATE person_authorisations SET status = 'revoked', revoked_at = now(), revoke_reason = 'Left the organisation'
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND status = 'active';
  END IF;

  PERFORM public.workforce_apply_lifecycle(NEW.person_id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS employee_records_workforce_sync ON public.employee_records;
CREATE TRIGGER employee_records_workforce_sync
  AFTER INSERT OR UPDATE OF status, start_date, end_date, person_id ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.workforce_employee_sync();

-- people.primary_role_id mirrors the live primary assignment.
CREATE OR REPLACE FUNCTION public.workforce_primary_role_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pid uuid;
BEGIN
  FOREACH pid IN ARRAY ARRAY[CASE WHEN TG_OP <> 'INSERT' THEN OLD.person_id END,
                             CASE WHEN TG_OP <> 'DELETE' THEN NEW.person_id END] LOOP
    CONTINUE WHEN pid IS NULL;
    UPDATE people p SET primary_role_id = (
        SELECT a.role_id FROM role_assignments a
         WHERE a.person_id = pid AND a.primary_assignment AND a.assignment_status <> 'ended' LIMIT 1)
     WHERE p.id = pid AND p.primary_role_id IS DISTINCT FROM (
        SELECT a.role_id FROM role_assignments a
         WHERE a.person_id = pid AND a.primary_assignment AND a.assignment_status <> 'ended' LIMIT 1);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS role_assignments_primary_role ON public.role_assignments;
CREATE TRIGGER role_assignments_primary_role AFTER INSERT OR UPDATE OR DELETE ON public.role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.workforce_primary_role_sync();

-- The dates that pass without a write: planned assignments start, and
-- lifecycles move (pre_employment → active, notice → leaver is the
-- reminders cron's terminated write). Service role, from the cron.
CREATE OR REPLACE FUNCTION public.workforce_daily_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t date := public.workforce_today(); n_asg integer; n_life integer := 0; pid uuid;
BEGIN
  UPDATE role_assignments SET assignment_status = 'active'
   WHERE assignment_status = 'planned' AND start_date <= t;
  GET DIAGNOSTICS n_asg = ROW_COUNT;
  FOR pid IN
    SELECT DISTINCT e.person_id FROM employee_records e JOIN people p ON p.id = e.person_id
     WHERE e.person_id IS NOT NULL AND p.lifecycle_status IN ('pre_employment','notice','active')
       AND ((p.lifecycle_status = 'pre_employment' AND e.start_date <= t)
         OR (p.lifecycle_status = 'notice' AND (e.end_date IS NULL OR e.end_date < t))
         OR (p.lifecycle_status = 'active' AND e.end_date IS NOT NULL AND e.end_date >= t AND e.status::text <> 'terminated'))
  LOOP
    IF public.workforce_apply_lifecycle(pid) IS NOT NULL THEN n_life := n_life + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('assignments_started', n_asg, 'lifecycles_checked', n_life);
END $$;

REVOKE ALL ON FUNCTION public.workforce_lifecycle_for(uuid), public.workforce_apply_lifecycle(uuid),
  public.workforce_employee_sync(), public.workforce_primary_role_sync(), public.workforce_daily_tick()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workforce_daily_tick() TO service_role;

-- Existing rows: bring the few live employee-linked people into line.
DO $$
DECLARE pid uuid;
BEGIN
  FOR pid IN SELECT DISTINCT person_id FROM employee_records WHERE person_id IS NOT NULL LOOP
    PERFORM public.workforce_apply_lifecycle(pid);
  END LOOP;
END $$;

-- ─── 2. Safety → workforce, confirmed by a person ───────────────────

-- Create ONE requirement from a safety record, with the scope the user
-- chose. Returns the new rule's id. The rule is in force from today.
--   incident          → a person named on the incident; incident.investigate
--   corrective_action → a person in the organisation; workforce.manage or incident.investigate
--   coshh / risk_assessment → a person, a site or a role; workforce.manage
CREATE OR REPLACE FUNCTION public.workforce_requirement_from_source(
  p_source_type text, p_source_id uuid, p_scope text, p_scope_id uuid,
  p_requirement_type text, p_reference_id uuid DEFAULT NULL, p_reference_key text DEFAULT NULL,
  p_min_level_id uuid DEFAULT NULL, p_required_by date DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid := public.my_company_id(); src_org uuid; scope_org uuid; allowed boolean; new_id uuid;
BEGIN
  IF org IS NULL OR auth.uid() IS NULL OR NOT public.session_can_write() THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF p_source_type NOT IN ('incident','corrective_action','coshh','risk_assessment') THEN
    RAISE EXCEPTION 'Unknown source %', p_source_type USING ERRCODE = '22023';
  END IF;
  IF p_scope NOT IN ('person','site','role') THEN
    RAISE EXCEPTION 'A requirement applies to a person, a site or a role' USING ERRCODE = '22023';
  END IF;

  src_org := CASE p_source_type
    WHEN 'incident'          THEN (SELECT company_id FROM hs_incidents WHERE id = p_source_id)
    WHEN 'corrective_action' THEN (SELECT company_id FROM actions WHERE id = p_source_id)
    WHEN 'coshh'             THEN (SELECT company_id FROM coshh_assessments WHERE id = p_source_id)
    ELSE                          (SELECT company_id FROM risk_assessments WHERE id = p_source_id) END;
  IF src_org IS DISTINCT FROM org THEN
    RAISE EXCEPTION 'Source record not found' USING ERRCODE = 'P0002';
  END IF;

  allowed := CASE p_source_type
    WHEN 'incident'          THEN public.has_capability(org, 'incident.investigate')
    WHEN 'corrective_action' THEN public.has_capability(org, 'workforce.manage') OR public.has_capability(org, 'incident.investigate')
    ELSE                          public.has_capability(org, 'workforce.manage') END;
  IF NOT allowed THEN RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501'; END IF;

  IF p_source_type IN ('incident','corrective_action') AND p_scope <> 'person' THEN
    RAISE EXCEPTION 'From an incident or action, a requirement is for named people' USING ERRCODE = '22023';
  END IF;
  IF p_source_type = 'incident' AND NOT EXISTS (
       SELECT 1 FROM incident_people ip WHERE ip.incident_id = p_source_id AND ip.person_id = p_scope_id) THEN
    RAISE EXCEPTION 'That person is not named on the incident' USING ERRCODE = '22023';
  END IF;

  scope_org := CASE p_scope
    WHEN 'person' THEN (SELECT company_id FROM people WHERE id = p_scope_id)
    WHEN 'site'   THEN (SELECT company_id FROM hs_sites WHERE id = p_scope_id)
    ELSE               (SELECT company_id FROM job_roles WHERE id = p_scope_id) END;
  IF scope_org IS DISTINCT FROM org THEN
    RAISE EXCEPTION 'Not found in this organisation' USING ERRCODE = 'P0002';
  END IF;

  IF p_scope = 'person' THEN
    INSERT INTO person_requirements (company_id, person_id, requirement_type, reference_id, reference_key, min_level_id,
                                     required_by, effective_from, source_type, source_id, notes)
    VALUES (org, p_scope_id, p_requirement_type, p_reference_id, p_reference_key, p_min_level_id,
            p_required_by, current_date, p_source_type, p_source_id, NULLIF(btrim(p_notes), ''))
    RETURNING id INTO new_id;
  ELSIF p_scope = 'site' THEN
    INSERT INTO site_requirements (company_id, site_id, requirement_type, reference_id, reference_key, min_level_id,
                                   required_by, effective_from, source_type, source_id, notes)
    VALUES (org, p_scope_id, p_requirement_type, p_reference_id, p_reference_key, p_min_level_id,
            p_required_by, current_date, p_source_type, p_source_id, NULLIF(btrim(p_notes), ''))
    RETURNING id INTO new_id;
  ELSE
    INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, reference_key, min_level_id,
                                   required_by, effective_from, source_type, source_id, notes)
    VALUES (org, p_scope_id, p_requirement_type, p_reference_id, p_reference_key, p_min_level_id,
            p_required_by, current_date, p_source_type, p_source_id, NULLIF(btrim(p_notes), ''))
    RETURNING id INTO new_id;
  END IF;
  RETURN new_id;
END $$;

-- A development item for someone named on an incident.
CREATE OR REPLACE FUNCTION public.incident_development_item(
  p_incident uuid, p_person uuid, p_title text, p_due date DEFAULT NULL,
  p_course uuid DEFAULT NULL, p_competency uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid := public.my_company_id(); new_id uuid;
BEGIN
  IF org IS NULL OR auth.uid() IS NULL OR NOT public.session_can_write()
     OR NOT public.has_capability(org, 'incident.investigate') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF (SELECT company_id FROM hs_incidents WHERE id = p_incident) IS DISTINCT FROM org THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM incident_people WHERE incident_id = p_incident AND person_id = p_person) THEN
    RAISE EXCEPTION 'That person is not named on the incident' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_catalogue(org, 'training_courses', p_course);
  PERFORM public.assert_catalogue(org, 'competencies', p_competency);
  INSERT INTO development_items (company_id, person_id, title, source_type, source_id, linked_course_id,
                                 linked_competency_id, due_date, created_by)
  VALUES (org, p_person, btrim(p_title), 'incident', p_incident, p_course, p_competency, p_due, auth.uid())
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.workforce_requirement_from_source(text, uuid, text, uuid, text, uuid, text, uuid, date, text),
  public.incident_development_item(uuid, uuid, text, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workforce_requirement_from_source(text, uuid, text, uuid, text, uuid, text, uuid, date, text),
  public.incident_development_item(uuid, uuid, text, date, uuid, uuid) TO authenticated;

-- ─── 3. Duplicate people: detected, never merged ────────────────────

CREATE OR REPLACE FUNCTION public._wf_norm_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(regexp_replace(lower(btrim(COALESCE(p, ''))), '[^a-z]+', '', 'g'), '')
$$;
CREATE OR REPLACE FUNCTION public._wf_norm_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN length(d) >= 9 THEN right(d, 9) END FROM (SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g') AS d) x
$$;

-- Possible duplicates of one person, in their organisation, with the
-- evidence for each (same email, same phone, same name). The caller must
-- be able to see the person and hold workforce.read or people.write.
CREATE OR REPLACE FUNCTION public.person_duplicate_candidates(p_person uuid)
RETURNS TABLE (person_id uuid, full_name text, worker_type text, lifecycle_status text, matches text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me people%ROWTYPE;
BEGIN
  SELECT * INTO me FROM people WHERE id = p_person;
  IF NOT FOUND OR NOT public.person_visible(p_person)
     OR NOT (public.is_tps_staff() OR public.has_capability(me.company_id, 'workforce.read')
             OR public.has_capability(me.company_id, 'people.write')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.worker_type, p.lifecycle_status,
         array_remove(ARRAY[
           CASE WHEN me.email IS NOT NULL AND lower(p.email) = lower(me.email) THEN 'email' END,
           CASE WHEN public._wf_norm_phone(me.phone) IS NOT NULL AND public._wf_norm_phone(p.phone) = public._wf_norm_phone(me.phone) THEN 'phone' END,
           CASE WHEN public._wf_norm_name(p.full_name) = public._wf_norm_name(me.full_name) THEN 'name' END], NULL)
    FROM people p
   WHERE p.company_id = me.company_id AND p.id <> me.id AND p.active_status <> 'archived'
     AND ((me.email IS NOT NULL AND lower(p.email) = lower(me.email))
       OR (public._wf_norm_phone(me.phone) IS NOT NULL AND public._wf_norm_phone(p.phone) = public._wf_norm_phone(me.phone))
       OR public._wf_norm_name(p.full_name) = public._wf_norm_name(me.full_name))
   ORDER BY p.full_name
   LIMIT 50;
END $$;

-- Every likely pair in the organisation (email or phone; a shared name
-- alone is too common to list). workforce.manage.
CREATE OR REPLACE FUNCTION public.workforce_duplicate_pairs(p_company uuid, p_limit integer DEFAULT 200)
RETURNS TABLE (person_a uuid, name_a text, person_b uuid, name_b text, matches text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.workforce_can(p_company, 'workforce.manage') THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.id, a.full_name, b.id, b.full_name,
         array_remove(ARRAY[
           CASE WHEN a.email IS NOT NULL AND lower(a.email) = lower(b.email) THEN 'email' END,
           CASE WHEN public._wf_norm_phone(a.phone) IS NOT NULL AND public._wf_norm_phone(a.phone) = public._wf_norm_phone(b.phone) THEN 'phone' END,
           CASE WHEN public._wf_norm_name(a.full_name) = public._wf_norm_name(b.full_name) THEN 'name' END], NULL)
    FROM people a JOIN people b ON b.company_id = a.company_id AND b.id > a.id
   WHERE a.company_id = p_company AND a.active_status <> 'archived' AND b.active_status <> 'archived'
     AND ((a.email IS NOT NULL AND lower(a.email) = lower(b.email))
       OR (public._wf_norm_phone(a.phone) IS NOT NULL AND public._wf_norm_phone(a.phone) = public._wf_norm_phone(b.phone)))
   ORDER BY a.full_name
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END $$;

REVOKE ALL ON FUNCTION public.person_duplicate_candidates(uuid), public.workforce_duplicate_pairs(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_duplicate_candidates(uuid), public.workforce_duplicate_pairs(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public._wf_norm_name(text), public._wf_norm_phone(text) TO authenticated, service_role;

-- ─── 4. Search: job roles and training courses ──────────────────────
-- Same function as 126 (SECURITY INVOKER: the caller's own RLS), two
-- more sources. Titles only; never a description.

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
  ) x
  LIMIT lim;
END $$;
REVOKE ALL ON FUNCTION public.search_records(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_records(text, integer) TO authenticated;

-- ─── 5. Status changes reach the outbox ─────────────────────────────
-- Statuses and the person only: never the reasons (a requirement name
-- can be medical), never detail text.
DROP TRIGGER IF EXISTS deployment_status_log_platform_event ON public.deployment_status_log;
CREATE TRIGGER deployment_status_log_platform_event AFTER INSERT ON public.deployment_status_log
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('person_id', 'from_status', 'to_status');
