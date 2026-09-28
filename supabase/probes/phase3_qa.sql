-- Core-OS 360 Phase 3 cross-cutting QA probe (2026-09-28), against the
-- applied migrations 132-138. Rolled back by the RAISE.
-- QA 3 (login removed, history kept), 10 (competency verification),
-- 21 (full recruitment → READY), 23 (contractor workers), 24 (manager
-- team), 25 (consultancy: active organisation only), 27 (e-learning
-- mapping), 28 (incident → workforce), 32 (rehire), 35 (direct CRUD
-- across tenants), 36 (storage across tenants), 39 (concurrent verify).
-- Client A: admin adm, verifier ver (hse_manager grant), employee emp,
-- site manager sm. Client B: admin bu. Consultant cons (home H, grant on A).
-- Recorded 2026-09-28: run 1 FAILED QA10 — a verifier could verify their
-- OWN assessment of a mandatory item of a safety-critical role, because
-- verification's safety-critical test ignored the role (HIGH; fixed by
-- 139, md5 1/1). Run 2 stopped on a fixture (no global credential types).
-- Run 3: 10/10 PASS.

DO $$
DECLARE r text := ''; n int; s text; e text; res jsonb; t date := public.workforce_today();
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); ver uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); sm uuid := gen_random_uuid();
  bu uuid := gen_random_uuid(); cons uuid := gen_random_uuid();
  p_emp uuid; p_sm uuid; w1 uuid; w2 uuid; c1 uuid; c2 uuid; w3 uuid;
  s1 uuid; s2 uuid; role uuid; role_c uuid; course uuid; ecourse1 uuid; ecourse2 uuid; comp uuid; lvl uuid; rtw uuid;
  reqn uuid; cand uuid; er uuid; er2 uuid; hire uuid; tr uuid; pc uuid; chk uuid; inc uuid; path text;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a,'PQ A','pqa-'||left(a::text,8),'direct_client',true),(b,'PQ B','pqb-'||left(b::text,8),'direct_client',true),
    (h,'PQ H','pqh-'||left(h::text,8),'consultancy',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'pq-adm@probe.invalid'),(ver,'pq-ver@probe.invalid'),(emp,'pq-emp@probe.invalid'),(sm,'pq-sm@probe.invalid'),
                 (bu,'pq-bu@probe.invalid'),(cons,'pq-cons@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user',  company_id=a WHERE id IN (emp, sm);
  UPDATE profiles SET role='client_user',  company_id=h WHERE id IN (ver, cons);
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (ver, a, 'hse_manager'), (cons, a, 'consultant');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (ver, a), (cons, a);
  SELECT id INTO p_emp FROM people WHERE user_id = emp;
  SELECT id INTO p_sm FROM people WHERE user_id = sm;
  SELECT id INTO lvl FROM competency_levels WHERE company_id IS NULL AND key = 'competent';
  SELECT id INTO rtw FROM pre_employment_check_types WHERE company_id IS NULL AND key = 'right_to_work';

  INSERT INTO hs_sites (company_id, name, site_manager_id) VALUES (a, 'PQ Yard', p_sm) RETURNING id INTO s1;
  INSERT INTO hs_sites (company_id, name) VALUES (a, 'PQ Depot') RETURNING id INTO s2;
  INSERT INTO job_roles (company_id, title, safety_critical) VALUES (a, 'PQ Operative', true) RETURNING id INTO role;
  INSERT INTO job_roles (company_id, title) VALUES (a, 'PQ Scaffolder (contract)') RETURNING id INTO role_c;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'PQ Working at height', 36) RETURNING id INTO course;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'PQ Fire awareness (online)', 12) RETURNING id INTO ecourse1;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'PQ Manual handling (online)', 12) RETURNING id INTO ecourse2;
  INSERT INTO competencies (company_id, title) VALUES (a, 'PQ Harness inspection') RETURNING id INTO comp;
  INSERT INTO credential_types (company_id, kind, title) VALUES (a, 'card', 'PQ CSCS card');
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role, 'training', course, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role, 'pre_employment_check', rtw, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role_c, 'training', course, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, allow_elearning, effective_from) VALUES (a, role_c, 'training', ecourse1, false, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, allow_elearning, effective_from) VALUES (a, role_c, 'training', ecourse2, true, current_date);

  -- ── QA 21: full recruitment → READY ──
  INSERT INTO requisitions (company_id, title, job_role_id) VALUES (a, 'PQ Operative', role) RETURNING id INTO reqn;
  INSERT INTO candidates (requisition_id, company_id, full_name, email) VALUES (reqn, a, 'PQ Hire', 'pq-hire@probe.invalid') RETURNING id INTO cand;
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, source_candidate_id, status, site_id)
    VALUES (a, 'PQ Hire', 'Operative', t, cand, 'active', s1) RETURNING id, person_id INTO er, hire;
  res := public._wf_deployment(hire, t);
  s := res ->> 'status';
  SELECT id INTO chk FROM pre_employment_checks WHERE person_id = hire AND check_type_id = rtw;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.pre_employment_check_decide(chk, 'verified', 'Share code checked');
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result)
    VALUES (a, hire, course, 'PQ Working at height', t - 3, 'pass') RETURNING id INTO tr;
  RESET ROLE;
  res := public._wf_deployment(hire, t);
  s := s || '→' || (res ->> 'status');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ver, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.workforce_verify('training', tr, 'verified');
  -- QA 39: a second decision on the same evidence is refused
  BEGIN PERFORM public.workforce_verify('training', tr, 'rejected', 'Second opinion'); e := 'decided-twice';
  EXCEPTION WHEN serialization_failure THEN e := 'second-refused'; END;
  RESET ROLE;
  res := public._wf_deployment(hire, t);
  s := s || '→' || (res ->> 'status');
  r := r || CASE WHEN s = 'NOT_READY→REVIEW_REQUIRED→READY' AND e = 'second-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' QA21 hire → checks → training recorded (review) → verified by the designated verifier → READY; QA39 second decision refused (' || s || '/' || e || '); ';

  -- ── QA 10: safety-critical competency, assessor ≠ verifier ──
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, min_level_id, effective_from) VALUES (a, role, 'competency', comp, lvl, current_date);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ver, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO person_competencies (company_id, person_id, competency_id, level_id, assessment_method, assessed_on)
    VALUES (a, hire, comp, lvl, 'practical_observation', t - 1) RETURNING id INTO pc;
  BEGIN PERFORM public.workforce_verify('competency', pc, 'verified'); e := 'self-verified';
  EXCEPTION WHEN insufficient_privilege THEN e := 'own-assessment-refused'; END;
  RESET ROLE;
  res := public._wf_deployment(hire, t);
  s := res ->> 'status';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.workforce_verify('competency', pc, 'verified'); e := e || '/admin-verified';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/admin-not-designated'; END;
  RESET ROLE;
  r := r || CASE WHEN e LIKE 'own-assessment-refused/%' AND s = 'REVIEW_REQUIRED' THEN 'PASS' ELSE 'FAIL' END
          || ' QA10 an assessor cannot verify their own safety-critical assessment; unverified = review (' || e || '/' || s || '); ';

  -- ── QA 28: incident → person requirement + competency suspension ──
  INSERT INTO hs_incidents (company_id, site_id, incident_type, occurred_on, description) VALUES (a, s1, 'near_miss', t, 'PQ') RETURNING id INTO inc;
  INSERT INTO incident_people (company_id, incident_id, person_id, role_in_incident) VALUES (a, inc, hire, 'affected_person');
  UPDATE person_competencies SET verification_status = 'verified', verified_at = now() WHERE id = pc AND verification_status <> 'verified';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ver, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.competency_suspend(hire, comp, 'Near miss: harness not inspected', 'incident', inc);
  RESET ROLE;
  res := public._wf_deployment(hire, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%Suspended since%'
                  AND EXISTS (SELECT 1 FROM competency_suspensions WHERE person_id = hire AND source_type = 'incident' AND source_id = inc)
                 THEN 'PASS' ELSE 'FAIL' END || ' QA28 a suspension from an incident takes effect at once, sourced to it; ';

  -- ── QA 23: contractor workers stand alone ──
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status, engagement_type, contractor_company)
    VALUES (a, 'PQ Contractor One', 'contractor', 'active', 'contractor', 'Acme Scaffolding') RETURNING id INTO c1;
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status, engagement_type, contractor_company)
    VALUES (a, 'PQ Contractor Two', 'contractor', 'active', 'contractor', 'Acme Scaffolding') RETURNING id INTO c2;
  INSERT INTO role_assignments (company_id, person_id, role_id, primary_assignment, start_date, site_id)
    VALUES (a, c1, role_c, true, t, s2), (a, c2, role_c, true, t, s2);
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, verification_status, verified_at, source)
    VALUES (a, c1, course, 'PQ Working at height', t - 5, 'pass', 'verified', now(), 'manual'),
           (a, c1, ecourse1, 'PQ Fire awareness', t - 5, 'pass', 'verified', now(), 'manual'),
           (a, c1, ecourse2, 'PQ Manual handling', t - 5, 'pass', 'verified', now(), 'elearning'),
           (a, c2, course, 'PQ Working at height', t - 5, 'pass', 'verified', now(), 'manual'),
           (a, c2, ecourse1, 'PQ Fire awareness', t - 5, 'pass', 'verified', now(), 'elearning'),
           (a, c2, ecourse2, 'PQ Manual handling', t - 5, 'pass', 'verified', now(), 'elearning');
  s := (public._wf_deployment(c1, t) ->> 'status') || '/' || (public._wf_deployment(c2, t) ->> 'status');
  SELECT x ->> 'status' INTO e FROM jsonb_array_elements(public._wf_deployment(c2, t) -> 'requirements') x WHERE x ->> 'name' = 'PQ Fire awareness (online)';
  r := r || CASE WHEN s = 'READY/NOT_READY' AND e = 'unmet' THEN 'PASS' ELSE 'FAIL' END
          || ' QA23 two workers of one contractor are judged separately; QA27 e-learning counts only where the rule allows it (' || s || '/' || e || '); ';

  -- ── QA 24: a site manager sees their site's team only ──
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'PQ Yard Worker', 'employee', 'active') RETURNING id INTO w1;
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'PQ Depot Worker', 'employee', 'active') RETURNING id INTO w2;
  INSERT INTO role_assignments (company_id, person_id, role_id, start_date, site_id) VALUES (a, w1, role, t, s1), (a, w2, role, t, s2);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(full_name, ',' ORDER BY full_name) INTO s FROM public.workforce_matrix(a) WHERE full_name LIKE 'PQ%';
  BEGIN PERFORM public.person_deployment_status(w2); e := 'read-other-site';
  EXCEPTION WHEN insufficient_privilege THEN e := 'other-site-refused'; END;
  RESET ROLE;
  r := r || CASE WHEN s = 'PQ Hire,PQ Yard Worker' AND e = 'other-site-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' QA24 site manager sees only the people on their site (' || COALESCE(s, 'null') || '/' || e || '); ';

  -- ── QA 25: consultancy — the active organisation only ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.workforce_matrix(a) WHERE full_name LIKE 'PQ%';
  RESET ROLE;
  DELETE FROM user_active_organisation WHERE user_id = cons;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM * FROM public.workforce_matrix(a); e := 'read-while-home';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused-while-home'; END;
  SELECT e || '/' || count(*) INTO e FROM people WHERE company_id = a AND full_name LIKE 'PQ%';
  RESET ROLE;
  r := r || CASE WHEN n = 5 AND e = 'refused-while-home/0' THEN 'PASS' ELSE 'FAIL' END
          || ' QA25 consultant sees client A only while acting in it (' || n || '/' || e || '); ';

  -- ── QA 35: direct CRUD from another client ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT (SELECT count(*) FROM people WHERE company_id = a) + (SELECT count(*) FROM role_assignments WHERE company_id = a)
       + (SELECT count(*) FROM training_records WHERE company_id = a) + (SELECT count(*) FROM person_competencies WHERE company_id = a)
       + (SELECT count(*) FROM person_credentials WHERE company_id = a) + (SELECT count(*) FROM person_requirements WHERE company_id = a)
       + (SELECT count(*) FROM person_authorisations WHERE company_id = a) + (SELECT count(*) FROM person_deployment_status WHERE company_id = a)
       + (SELECT count(*) FROM deployment_status_log WHERE company_id = a) + (SELECT count(*) FROM pre_employment_checks WHERE company_id = a)
       + (SELECT count(*) FROM competency_suspensions WHERE company_id = a) + (SELECT count(*) FROM job_roles WHERE company_id = a)
    INTO n;
  e := '';
  BEGIN INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result) VALUES (a, w1, course, 'x', t, 'pass'); e := 'ins';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN e := 'ins-refused'; END;
  BEGIN INSERT INTO role_assignments (company_id, person_id, role_id, start_date) VALUES (b, w1, role, t); e := e || '/asg';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN e := e || '/asg-refused'; END;
  UPDATE people SET full_name = 'hijacked' WHERE id = w1;
  UPDATE training_records SET verification_status = 'verified' WHERE company_id = a;
  DELETE FROM role_assignments WHERE company_id = a;
  RESET ROLE;
  SELECT e || '/' || (SELECT full_name FROM people WHERE id = w1) || '/' || (SELECT count(*) FROM role_assignments WHERE company_id = a) INTO e;
  r := r || CASE WHEN n = 0 AND e = 'ins-refused/asg-refused/PQ Yard Worker/5' THEN 'PASS' ELSE 'FAIL' END
          || ' QA35 client B reads nothing of A and changes nothing (' || n || '/' || e || '); ';

  -- ── QA 36: storage across clients ──
  path := a || '/credential/' || w1 || '/cscs.pdf';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', path);
  INSERT INTO person_credentials (company_id, person_id, credential_type_id, evidence_path)
    VALUES (a, w1, (SELECT id FROM credential_types WHERE company_id = a AND title = 'PQ CSCS card'), path);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = path;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', a || '/credential/' || w1 || '/planted.pdf'); e := 'planted';
  EXCEPTION WHEN insufficient_privilege THEN e := 'plant-refused'; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', b || '/credential/' || w1 || '/x.pdf'); e := e || '/own-folder-uploaded';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/own-folder-refused'; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT n * 10 + count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = path;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', a || '/credential/' || p_emp || '/mine.pdf'); e := e || '/self-uploaded';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/self-refused'; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', a || '/credential/' || w1 || '/colleague.pdf'); e := e || '/colleague-uploaded';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/colleague-refused'; END;
  RESET ROLE;
  r := r || CASE WHEN n = 0 AND e = 'plant-refused/own-folder-uploaded/self-uploaded/colleague-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' QA36 evidence: B cannot read or plant in A (its own folder is its own); an employee uploads only into their own folder and cannot read a colleague''s (' || n || '/' || e || '); ';

  -- ── QA 32: rehire ──
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, status, person_id)
    VALUES (a, 'PQ Yard Worker', 'Operative', t - 400, 'active', w1) RETURNING id INTO er2;
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, expires_on, result, verification_status, verified_at)
    VALUES (a, w1, course, 'PQ Working at height', t - 390, t - 10, 'pass', 'verified', now());
  UPDATE employee_records SET status = 'terminated', end_date = t - 5 WHERE id = er2;
  s := (SELECT lifecycle_status FROM people WHERE id = w1) || '/' ||
       (SELECT count(*) FILTER (WHERE assignment_status = 'ended') || ':' || count(*) FROM role_assignments WHERE person_id = w1);
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, status, person_id)
    VALUES (a, 'PQ Yard Worker', 'Operative', t, 'active', w1);
  INSERT INTO role_assignments (company_id, person_id, role_id, start_date) VALUES (a, w1, role, t);
  res := public._wf_deployment(w1, t);
  s := s || '/' || (SELECT lifecycle_status FROM people WHERE id = w1) || '/' || (res ->> 'status');
  r := r || CASE WHEN s = 'leaver/1:1/active/NOT_READY' AND res::text ILIKE '%Expired%' THEN 'PASS' ELSE 'FAIL' END
          || ' QA32 a returner is active again with a new assignment; the old one stays ended and expired training stays expired (' || s || '); ';

  -- ── QA 3: removing the login keeps the person and their history ──
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result) VALUES (a, p_emp, course, 'x', t, 'pass');
  DELETE FROM auth.users WHERE id = emp;
  SELECT (SELECT count(*) FROM people WHERE id = p_emp AND user_id IS NULL) || '/' || (SELECT count(*) FROM training_records WHERE person_id = p_emp) INTO s;
  r := r || CASE WHEN s = '1/1' THEN 'PASS' ELSE 'FAIL' END || ' QA3 deleting a login keeps the person and their records (' || s || '); ';

  RAISE EXCEPTION 'PROBE PHASE3 QA: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
