-- Migration 137 probe (workforce integration), 2026-09-28.
-- Run after apply; rolled back by the RAISE. Fixtures as the owner; the
-- RPCs under real sessions. Client A: admin adm, employee emp. Client B:
-- admin bu. Recruitment flow (QA: hire → role → checks → never READY on
-- acceptance), lifecycle, leaver, safety → workforce, duplicates, search,
-- outbox.
-- Recorded 2026-09-28 against the applied migration: 16/16 PASS (the
-- first attempt stopped on a fixture: an incident needs a site or a
-- location). Function bodies md5-matched (12/12). The backfill changed
-- no live row (0 employee records are linked to a person yet).

DO $$
DECLARE r text := ''; n int; s text; e text; res jsonb; t date := public.workforce_today();
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  role uuid; course uuid; rtw uuid; reqn uuid; cand uuid; er uuid; w uuid; asg uuid; auth_t uuid; pa uuid; exc uuid;
  inc uuid; other uuid; act uuid; ra uuid; site uuid; rid uuid; d1 uuid; d2 uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a,'P137 A','p137a-'||left(a::text,8),'direct_client',true),(b,'P137 B','p137b-'||left(b::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p137-adm@probe.invalid'),(emp,'p137-emp@probe.invalid'),(bu,'p137-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user',  company_id=a WHERE id=emp;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  SELECT id INTO rtw FROM pre_employment_check_types WHERE company_id IS NULL AND key = 'right_to_work';
  INSERT INTO job_roles (company_id, title, safety_critical) VALUES (a, 'P137 Forklift Operator', true) RETURNING id INTO role;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'P137 Forklift', 36) RETURNING id INTO course;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role, 'pre_employment_check', rtw, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role, 'training', course, current_date);
  INSERT INTO hs_sites (company_id, name) VALUES (a, 'P137 Yard') RETURNING id INTO site;

  -- ── Hire → role assignment, checks, lifecycle ──
  INSERT INTO requisitions (company_id, title, job_role_id) VALUES (a, 'P137 Forklift Operator', role) RETURNING id INTO reqn;
  INSERT INTO candidates (requisition_id, company_id, full_name, email) VALUES (reqn, a, 'P137 Hire', 'p137-hire@probe.invalid') RETURNING id INTO cand;
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, source_candidate_id, status)
    VALUES (a, 'P137 Hire', 'Forklift Operator', t + 7, cand, 'active') RETURNING id, person_id INTO er, w;
  SELECT count(*) || '/' || max(assignment_status) || '/' || bool_and(primary_assignment) INTO s
    FROM role_assignments WHERE person_id = w AND role_id = role AND source_ref = 'hire:' || er;
  r := r || CASE WHEN s = '1/planned/true' THEN 'PASS' ELSE 'FAIL' END || ' hire creates one planned primary assignment (' || COALESCE(s,'null') || '); ';
  SELECT status INTO s FROM pre_employment_checks WHERE person_id = w AND check_type_id = rtw;
  r := r || CASE WHEN s = 'required' THEN 'PASS' ELSE 'FAIL' END || ' the role''s right-to-work check is outstanding work (' || COALESCE(s,'null') || '); ';
  SELECT lifecycle_status || '/' || (primary_role_id = role) INTO s FROM people WHERE id = w;
  r := r || CASE WHEN s = 'pre_employment/true' THEN 'PASS' ELSE 'FAIL' END || ' lifecycle pre_employment, primary role mirrored (' || s || '); ';
  res := public._wf_deployment(w, t + 7);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%Right to work%' THEN 'PASS' ELSE 'FAIL' END
          || ' accepted and hired is still NOT_READY on day one (' || (res ->> 'status') || '); ';
  UPDATE employee_records SET job_title = 'Forklift Operator (days)', start_date = t + 6 WHERE id = er;
  SELECT count(*) INTO n FROM role_assignments WHERE person_id = w;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' re-saving the record creates nothing more; ';

  -- ── Dates passing ──
  UPDATE role_assignments SET start_date = t WHERE source_ref = 'hire:' || er;
  UPDATE employee_records SET start_date = t WHERE id = er;
  SELECT lifecycle_status INTO s FROM people WHERE id = w;
  res := public.workforce_daily_tick();
  SELECT s || '/' || assignment_status INTO s FROM role_assignments WHERE source_ref = 'hire:' || er;
  r := r || CASE WHEN s = 'active/active' AND (res ->> 'assignments_started')::int >= 1 THEN 'PASS' ELSE 'FAIL' END
          || ' start date reached: lifecycle active, the tick starts the assignment (' || s || '); ';
  UPDATE employee_records SET end_date = t + 30 WHERE id = er;
  SELECT lifecycle_status INTO s FROM people WHERE id = w;
  r := r || CASE WHEN s = 'notice' THEN 'PASS' ELSE 'FAIL' END || ' an end date puts the person on notice; ';

  -- ── Leaver ──
  INSERT INTO authorisation_types (company_id, title) VALUES (a, 'P137 Permit to work') RETURNING id INTO auth_t;
  INSERT INTO person_authorisations (company_id, person_id, authorisation_type_id, issued_on) VALUES (a, w, auth_t, t) RETURNING id INTO pa;
  INSERT INTO requirement_exceptions (company_id, person_id, requirement_type, reference_id, kind, reason, approved_by, valid_from, valid_until)
    VALUES (a, w, 'training', course, 'temporary_exception', 'Booked on the next course date', adm, t, t + 20) RETURNING id INTO exc;
  UPDATE employee_records SET status = 'terminated', end_date = t WHERE id = er;
  SELECT (SELECT lifecycle_status FROM people WHERE id = w) || '/' ||
         (SELECT assignment_status || ':' || end_date FROM role_assignments WHERE source_ref = 'hire:' || er) || '/' ||
         (SELECT (revoked_at IS NOT NULL)::text FROM requirement_exceptions WHERE id = exc) || '/' ||
         (SELECT status FROM person_authorisations WHERE id = pa) || '/' ||
         (SELECT (primary_role_id IS NULL)::text FROM people WHERE id = w) INTO s;
  r := r || CASE WHEN s = 'leaver/ended:' || t || '/true/revoked/true' THEN 'PASS' ELSE 'FAIL' END
          || ' leaving ends the assignment, revokes the exception and authorisation, lifecycle leaver (' || s || '); ';
  SELECT count(*) INTO n FROM training_records WHERE person_id = w;
  SELECT n + count(*) INTO n FROM role_assignments WHERE person_id = w;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' nothing is deleted; ';

  -- ── Safety → workforce, confirmed by a person ──
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status, email) VALUES (a, 'P137 Operator', 'employee', 'active', 'P137-Dup@probe.invalid') RETURNING id INTO w;
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'P137 Bystander', 'employee', 'active') RETURNING id INTO other;
  INSERT INTO hs_incidents (company_id, site_id, incident_type, occurred_on, description) VALUES (a, site, 'near_miss', t - 1, 'P137 probe') RETURNING id INTO inc;
  INSERT INTO incident_people (company_id, incident_id, person_id, role_in_incident) VALUES (a, inc, w, 'affected_person');
  INSERT INTO actions (company_id, action_type, title) VALUES (a, 'corrective', 'P137 retrain') RETURNING id INTO act;
  INSERT INTO risk_assessments (company_id, reference, title, risk_matrix_id)
    VALUES (a, 'P137-RA', 'P137 Loading bay', (SELECT id FROM risk_matrices WHERE company_id IS NULL LIMIT 1)) RETURNING id INTO ra;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  rid := public.workforce_requirement_from_source('incident', inc, 'person', w, 'training', course, NULL, NULL, t + 14, 'Refresher after near miss');
  s := 'ok';
  BEGIN PERFORM public.workforce_requirement_from_source('incident', inc, 'person', other, 'training', course);
        s := s || '/not-named-accepted';
  EXCEPTION WHEN invalid_parameter_value THEN s := s || '/not-named-refused'; END;
  BEGIN PERFORM public.workforce_requirement_from_source('incident', inc, 'site', site, 'training', course);
        s := s || '/site-accepted';
  EXCEPTION WHEN invalid_parameter_value THEN s := s || '/site-refused'; END;
  BEGIN PERFORM public.workforce_requirement_from_source('corrective_action', act, 'role', role, 'training', course);
        s := s || '/action-role-accepted';
  EXCEPTION WHEN invalid_parameter_value THEN s := s || '/action-role-refused'; END;
  PERFORM public.workforce_requirement_from_source('corrective_action', act, 'person', other, 'training', course);
  PERFORM public.workforce_requirement_from_source('risk_assessment', ra, 'site', site, 'training', course);
  d1 := public.incident_development_item(inc, w, 'Coach on pre-use checks', t + 30, course);
  RESET ROLE;
  SELECT s || '/' || count(*) FILTER (WHERE source_type = 'incident' AND source_id = inc)
             || '/' || count(*) FILTER (WHERE source_type = 'corrective_action') INTO s
    FROM person_requirements WHERE company_id = a;
  SELECT s || '/' || count(*) INTO s FROM site_requirements WHERE site_id = site AND source_type = 'risk_assessment' AND source_id = ra;
  r := r || CASE WHEN s = 'ok/not-named-refused/site-refused/action-role-refused/1/1/1' AND d1 IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
          || ' admin confirms sourced requirements with an explicit scope; named people only from an incident or action (' || s || '); ';
  SELECT effective_from = current_date AND required_by = t + 14 INTO e FROM person_requirements WHERE id = rid;
  r := r || CASE WHEN e = 'true' THEN 'PASS' ELSE 'FAIL' END || ' in force from today with the chosen due date; ';

  FOR s IN SELECT unnest(ARRAY['emp','bu']) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', CASE s WHEN 'emp' THEN emp ELSE bu END, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.workforce_requirement_from_source('incident', inc, 'person', w, 'training', course); e := 'accepted';
    EXCEPTION WHEN insufficient_privilege THEN e := 'refused'; WHEN no_data_found THEN e := 'not-found'; END;
    BEGIN PERFORM public.incident_development_item(inc, w, 'x'); e := e || '/dev-accepted';
    EXCEPTION WHEN insufficient_privilege THEN e := e || '/dev-refused'; WHEN no_data_found THEN e := e || '/dev-not-found'; END;
    RESET ROLE;
    r := r || CASE WHEN (s = 'emp' AND e = 'refused/dev-refused') OR (s = 'bu' AND e = 'not-found/dev-not-found') THEN 'PASS' ELSE 'FAIL' END
            || ' ' || s || ' cannot create workforce follow-ups (' || e || '); ';
  END LOOP;

  -- ── Duplicates: detected, never merged ──
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status, email) VALUES (a, 'Operator P137', 'candidate', 'candidate', 'p137-dup@PROBE.invalid') RETURNING id INTO d2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(array_to_string(matches, '+'), ',') INTO s FROM public.person_duplicate_candidates(w) WHERE person_id = d2;
  SELECT count(*) INTO n FROM public.workforce_duplicate_pairs(a) WHERE (person_a, person_b) IN ((w, d2), (d2, w));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM * FROM public.workforce_duplicate_pairs(a); e := 'read';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused'; END;
  RESET ROLE;
  r := r || CASE WHEN s = 'email' AND n = 1 AND e = 'refused' AND (SELECT count(*) FROM people WHERE id IN (w, d2)) = 2 THEN 'PASS' ELSE 'FAIL' END
          || ' same email (any case) is flagged, both records kept, employee cannot list (' || COALESCE(s,'null') || '/' || n || '/' || e || '); ';

  -- ── Search ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(entity_type, ',' ORDER BY entity_type) INTO s FROM public.search_records('P137 Forklift')
   WHERE entity_type IN ('job_role','training_course');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.search_records('P137 Forklift') WHERE entity_type IN ('job_role','training_course');
  RESET ROLE;
  r := r || CASE WHEN s = 'job_role,training_course' AND n = 0 THEN 'PASS' ELSE 'FAIL' END
          || ' search finds the role and course for A, nothing for B (' || COALESCE(s,'null') || '/' || n || '); ';

  -- ── Outbox ──
  INSERT INTO role_assignments (company_id, person_id, role_id, primary_assignment, start_date) VALUES (a, w, role, true, t);
  PERFORM public.workforce_refresh(w);
  SELECT count(*) INTO n FROM platform_events
   WHERE entity_type = 'deployment_status_log' AND company_id = a AND payload -> 'new' ->> 'person_id' = w::text
     AND payload -> 'new' ->> 'to_status' = 'NOT_READY' AND NOT (payload::text ILIKE '%reasons%' OR payload::text ILIKE '%Forklift%');
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' a status change reaches the outbox with statuses only (' || n || '); ';

  RAISE EXCEPTION 'PROBE 137: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
