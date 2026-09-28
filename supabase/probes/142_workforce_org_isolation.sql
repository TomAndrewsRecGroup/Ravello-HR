-- Probe for 142 (2026-09-28): every attack from the Phase 3 security
-- review (QA 42), re-run against the fix, plus the intended paths that
-- must still work. Rolled back by the closing RAISE.
-- Client A: admin adm, plain user usr (a person in A), OH advisor oh
-- (home H, occupational_health_advisor grant on A, active there).
-- Client B: one active worker wb in a role needing a right_to_work
-- document; one clinical file and one evidence file in B's folders.

DO $$
DECLARE r text := ''; n int; s text; e text; t date := public.workforce_today();
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); usr uuid := gen_random_uuid(); oh uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  p_usr uuid; wa uuid; wa2 uuid; wb uuid; role_a uuid; role_b uuid; role_sc uuid; course uuid; course_sc uuid; ppe uuid;
  er_a uuid; bpath text; bclin text; reqn uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a,'P142 A','p142a-'||left(a::text,8),'direct_client',true),(b,'P142 B','p142b-'||left(b::text,8),'direct_client',true),
    (h,'P142 H','p142h-'||left(h::text,8),'consultancy',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p142-adm@probe.invalid'),(usr,'p142-usr@probe.invalid'),(oh,'p142-oh@probe.invalid'),(bu,'p142-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user',  company_id=a WHERE id=usr;
  UPDATE profiles SET role='client_user',  company_id=h WHERE id=oh;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (oh, a, 'occupational_health_advisor');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (oh, a);
  SELECT id INTO p_usr FROM people WHERE user_id = usr;

  INSERT INTO job_roles (company_id, title) VALUES (b, 'P142 B Driver') RETURNING id INTO role_b;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_key, effective_from) VALUES (b, role_b, 'document', 'right_to_work', current_date);
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (b, 'P142 B Worker', 'employee', 'active') RETURNING id INTO wb;
  INSERT INTO role_assignments (company_id, person_id, role_id, start_date) VALUES (b, wb, role_b, t);
  bpath := b || '/training/' || wb || '/b-cert.pdf';
  bclin := b || '/' || wb || '/b-clinical.pdf';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', bpath), ('oh-clinical', bclin);

  INSERT INTO job_roles (company_id, title) VALUES (a, 'P142 A Clerk') RETURNING id INTO role_a;
  INSERT INTO job_roles (company_id, title, safety_critical) VALUES (a, 'P142 A Rigger', true) RETURNING id INTO role_sc;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_key, effective_from) VALUES (a, role_a, 'document', 'right_to_work', current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_key, mandatory, effective_from) VALUES (a, role_sc, 'document', 'right_to_work', true, current_date);
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'P142 A Clerk', 'employee', 'active') RETURNING id INTO wa;
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'P142 A Rigger', 'employee', 'active') RETURNING id INTO wa2;
  INSERT INTO role_assignments (company_id, person_id, role_id, start_date) VALUES (a, wa, role_a, t), (a, wa2, role_sc, t);
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, status) VALUES (a, 'P142 A Staff', 'Staff', t, 'active') RETURNING id INTO er_a;

  -- ── C1: another client's worker made READY by a document ──
  s := public._wf_deployment(wb, t) ->> 'status';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO employee_documents (company_id, employee_name, doc_type, title, status, person_id)
      VALUES (a, 'x', 'right_to_work', 'RTW', 'active', wb);
    e := 'cross-client-doc-inserted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := 'cross-client-doc-refused'; END;
  RESET ROLE;
  s := s || '→' || (public._wf_deployment(wb, t) ->> 'status');
  r := r || CASE WHEN s = 'NOT_READY→NOT_READY' AND e = 'cross-client-doc-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' C1 a user in A cannot link a document to B''s worker (' || s || '/' || e || '); ';

  -- C1 inside one client: a plain user's document satisfies an ordinary
  -- document requirement (unchanged HR behaviour) but not a safety-critical
  -- one, which needs one filed by workforce authority.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO employee_documents (company_id, employee_name, doc_type, title, status, person_id, filed_by_authorised)
    VALUES (a, 'P142 A Clerk', 'right_to_work', 'RTW', 'active', wa, true),
           (a, 'P142 A Rigger', 'right_to_work', 'RTW', 'active', wa2, true);
  RESET ROLE;
  s := (public._wf_deployment(wa, t) ->> 'status') || '/' || (public._wf_deployment(wa2, t) ->> 'status');
  SELECT count(*) INTO n FROM employee_documents WHERE person_id IN (wa, wa2) AND filed_by_authorised;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO employee_documents (company_id, employee_name, doc_type, title, status, person_id)
    VALUES (a, 'P142 A Rigger', 'right_to_work', 'RTW (checked)', 'active', wa2);
  RESET ROLE;
  s := s || '→' || (public._wf_deployment(wa2, t) ->> 'status');
  r := r || CASE WHEN s = 'READY/REVIEW_REQUIRED→READY' AND n = 0 THEN 'PASS' ELSE 'FAIL' END
          || ' C1b a colleague''s document meets an ordinary requirement, a safety-critical one waits for an admin''s, and nobody sets filed_by_authorised themselves (' || s || '/' || n || '); ';

  -- ── C2: another client's evidence file read through a self-submitted row ──
  INSERT INTO training_courses (company_id, title) VALUES (a, 'P142 Course') RETURNING id INTO course;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = bpath;
  e := '';
  BEGIN
    INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, source, evidence_path)
      VALUES (a, p_usr, course, 'x', t, 'pass', 'self', bpath);
    e := 'foreign-path-inserted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := 'foreign-path-refused'; END;
  BEGIN
    INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, source, evidence_path)
      VALUES (a, p_usr, course, 'x', t, 'pass', 'self', a || '/training/' || wa || '/colleague.pdf');
    e := e || '/colleague-path-inserted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := e || '/colleague-path-refused'; END;
  BEGIN
    INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, source, evidence_path)
      VALUES (a, p_usr, course, 'x', t, 'pass', 'self', a || '/credential/' || p_usr || '/wrong-kind.pdf');
    e := e || '/wrong-kind-inserted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := e || '/wrong-kind-refused'; END;
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, source, evidence_path)
    VALUES (a, p_usr, course, 'x', t, 'pass', 'self', a || '/training/' || p_usr || '/mine.pdf');
  SELECT n * 10 + count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = bpath;
  RESET ROLE;
  r := r || CASE WHEN n = 0 AND e = 'foreign-path-refused/colleague-path-refused/wrong-kind-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' C2 evidence paths are pinned to the row''s own org/kind/person; B''s file stays unreadable; own folder still works (' || n || '/' || e || '); ';

  -- C2 belt and braces: a row that somehow names a foreign path (written
  -- by a superuser here, bypassing nothing but the session) still cannot
  -- vouch for the file, because the storage policy checks the folders.
  ALTER TABLE public.training_records DISABLE TRIGGER training_records_evidence_guard;
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, source, evidence_path, submitted_by)
    VALUES (a, p_usr, course, 'x', t, 'pass', 'self', bpath, usr);
  ALTER TABLE public.training_records ENABLE TRIGGER training_records_evidence_guard;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = bpath;
  RESET ROLE;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END
          || ' C2b a row naming a foreign path cannot open it: the storage policy checks the folders (' || n || '); ';

  -- ── C3: another client's clinical file ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', oh, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'oh-clinical' AND name = bclin;
  BEGIN
    INSERT INTO occupational_health_clinical (company_id, person_id, document_path) VALUES (a, wa, bclin);
    e := 'foreign-clinical-inserted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := 'foreign-clinical-refused'; END;
  BEGIN
    INSERT INTO occupational_health_clinical (company_id, person_id, document_path) VALUES (a, wa, a || '/' || wa2 || '/other-person.pdf');
    e := e || '/other-person-inserted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := e || '/other-person-refused'; END;
  INSERT INTO occupational_health_clinical (company_id, person_id, document_path) VALUES (a, wa, a || '/' || wa || '/own.pdf');
  SELECT n * 10 + count(*) INTO n FROM storage.objects WHERE bucket_id = 'oh-clinical' AND name = bclin;
  RESET ROLE;
  r := r || CASE WHEN n = 0 AND e = 'foreign-clinical-refused/other-person-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' C3 a clinical path is pinned to the row''s org/person; B''s clinical file stays unreadable; own folder works (' || n || '/' || e || '); ';

  -- ── H: employee records (and candidates) cannot point at B's person ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO employee_records (company_id, full_name, job_title, start_date, status, person_id) VALUES (a, 'x', 'x', t, 'on_leave', wb);
    e := 'er-insert-linked';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := 'er-insert-refused'; END;
  BEGIN
    UPDATE employee_records SET person_id = wb WHERE id = er_a;
    e := e || CASE WHEN (SELECT person_id FROM employee_records WHERE id = er_a) = wb THEN '/er-update-linked' ELSE '/er-update-noop' END;
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN e := e || '/er-update-refused'; END;
  RESET ROLE;
  INSERT INTO requisitions (company_id, title) VALUES (a, 'P142 Role') RETURNING id INTO reqn;
  BEGIN
    INSERT INTO candidates (requisition_id, company_id, full_name, person_id) VALUES (reqn, a, 'x', wb);
    e := e || '/cand-linked';
  EXCEPTION WHEN check_violation THEN e := e || '/cand-refused'; END;
  SELECT count(*) INTO n FROM people WHERE id = wb AND lifecycle_status = 'active';
  r := r || CASE WHEN e = 'er-insert-refused/er-update-refused/cand-refused' AND n = 1 THEN 'PASS' ELSE 'FAIL' END
          || ' H no person link crosses an organisation, for any writer; B''s worker untouched (' || e || '/' || n || '); ';

  -- Hire still links (the link trigger's same-org person passes the guard).
  INSERT INTO candidates (requisition_id, company_id, full_name, email) VALUES (reqn, a, 'P142 Hire', 'p142-hire@probe.invalid');
  SELECT count(*) INTO n FROM candidates WHERE company_id = a AND full_name = 'P142 Hire' AND person_id IS NOT NULL;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' H2 an ordinary candidate still links to a person; ';

  -- ── M1: no grace for an expired safety-critical item ──
  INSERT INTO training_courses (company_id, title, safety_critical) VALUES (a, 'P142 SC Course', true) RETURNING id INTO course_sc;
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, expires_on, result, verification_status, verified_at, source)
    VALUES (a, wa, course, 'x', t - 400, t - 5, 'pass', 'verified', now() - interval '300 days', 'manual'),
           (a, wa, course_sc, 'x', t - 400, t - 5, 'pass', 'verified', now() - interval '300 days', 'manual');
  s := (public._wf_judge(wa, 'training', course, NULL, NULL, false, false, false, NULL, 30, t, 30)).status
       || '/' || (public._wf_judge(wa, 'training', course_sc, NULL, NULL, true, false, false, NULL, 30, t, 30)).status;
  r := r || CASE WHEN s = 'expiring/unmet' THEN 'PASS' ELSE 'FAIL' END
          || ' M1 grace keeps an ordinary lapsed item counted; a safety-critical one is unmet the day after expiry (' || s || '); ';

  -- ── M2: catalogue changes mark cached statuses stale ──
  PERFORM public.workforce_refresh(wa);
  INSERT INTO ppe_types (company_id, title) VALUES (a, 'P142 Gloves') RETURNING id INTO ppe;
  SELECT count(*) INTO n FROM person_deployment_status WHERE person_id = wa AND dirty;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' M2 a ppe_types change marks the organisation stale (' || n || '); ';

  RAISE EXCEPTION 'PROBE 142 (rolled back): %', r;
END $$;
