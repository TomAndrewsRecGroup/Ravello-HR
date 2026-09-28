-- Migration 134 probe (workforce evidence), 2026-09-28. Run after apply;
-- rolled back by the RAISE.
-- Client A: admin adm, editor ed, employee emp (worker w), employee emp2
-- (colleague c); hse: an HSE manager from a home company under a grant on
-- A. Client B: admin bu.
--
-- Recorded 2026-09-28 against the applied migration.
-- Run 1 FAILED, correctly: workforce_evidence_guard was SECURITY DEFINER,
-- so current_user was the owner, the session-only rules never ran, and
-- the employee's self-submitted certificate was stored `verified` (the
-- HSE verify then found nothing to decide: 40001). Fixed by 134a (guard
-- SECURITY INVOKER, lookups through DEFINER helpers).
-- Run 2, after 134a: 16/16 PASS. Function bodies md5-matched (134 16/16,
-- 134a 5/5); no DEFINER function in the live database keys on current_user.

DO $$
DECLARE r text := ''; n int; s text; e text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); home uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); ed uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); emp2 uuid := gen_random_uuid();
  hse uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  w uuid; c uuid; wb uuid; ew uuid; role uuid; course uuid; course_sc uuid; comp uuid; lvl uuid; ctype uuid; chk_t uuid;
  tr uuid; tr_sc uuid; cred uuid; pc uuid; sus uuid; ex uuid; chk uuid; sess uuid; at1 uuid; at2 uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a,'P134 A','p134a-'||left(a::text,8),'direct_client',true),(b,'P134 B','p134b-'||left(b::text,8),'direct_client',true),
    (home,'P134 H','p134h-'||left(home::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p134-adm@probe.invalid'),(ed,'p134-ed@probe.invalid'),(emp,'p134-emp@probe.invalid'),
                 (emp2,'p134-emp2@probe.invalid'),(hse,'p134-hse@probe.invalid'),(bu,'p134-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin',  company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_editor', company_id=a WHERE id=ed;
  UPDATE profiles SET role='client_user',   company_id=a WHERE id IN (emp, emp2);
  UPDATE profiles SET role='client_user',   company_id=home WHERE id=hse;
  UPDATE profiles SET role='client_admin',  company_id=b WHERE id=bu;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (hse, a, 'hse_manager');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (hse, a);
  SELECT id INTO w FROM people WHERE user_id = emp; SELECT id INTO c FROM people WHERE user_id = emp2;
  INSERT INTO people (company_id, full_name, worker_type) VALUES (b, 'P134 B worker', 'employee') RETURNING id INTO wb;
  SELECT id INTO lvl FROM competency_levels WHERE company_id IS NULL AND key = 'competent';
  SELECT id INTO chk_t FROM pre_employment_check_types WHERE company_id IS NULL AND key = 'right_to_work';
  INSERT INTO training_courses (company_id, title) VALUES (a, 'Manual handling') RETURNING id INTO course;
  INSERT INTO training_courses (company_id, title, safety_critical, validity_months) VALUES (a, 'Working at height', true, 36) RETURNING id INTO course_sc;
  INSERT INTO competencies (company_id, title, safety_critical) VALUES (a, 'MEWP operation', true) RETURNING id INTO comp;
  INSERT INTO credential_types (company_id, kind, title) VALUES (a, 'card', 'CSCS card') RETURNING id INTO ctype;
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, person_id) VALUES (a, 'P134 Worker', 'Operative', current_date - 30, w)
    RETURNING id INTO ew;

  -- ── 1. The existing training-records page path still works (employee_id only) ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO training_records (company_id, employee_id, course_name, completed_on)
    VALUES (a, ew, 'Fire awareness', current_date - 10) RETURNING id INTO tr;
  SELECT (person_id = w AND verification_status = 'unverified' AND submitted_by = adm)::text INTO s FROM training_records WHERE id = tr;
  r := r || CASE WHEN s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' legacy insert by employee_id: person filled, unverified; ';
  INSERT INTO training_records (company_id, person_id, course_id, completed_on, verification_status, verified_by)
    VALUES (a, w, course_sc, current_date - 5, 'verified', adm) RETURNING id INTO tr_sc;
  SELECT (verification_status = 'unverified' AND verified_by IS NULL AND course_name = 'Working at height')::text INTO s FROM training_records WHERE id = tr_sc;
  r := r || CASE WHEN s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' a recorder cannot mark their own entry verified; course name filled; ';
  BEGIN
    PERFORM public.workforce_verify('training', tr_sc, 'verified');
    r := r || 'FAIL safety-critical verified by the person who recorded it; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS safety-critical needs a verifier other than the recorder; ';
  END;
  RESET ROLE;

  -- ── 2. Employees: own records only; self-submission ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM training_records WHERE person_id = w;
  RESET ROLE;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' a colleague reads none of w''s training (' || n || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM training_records WHERE person_id = w;
  INSERT INTO person_credentials (company_id, person_id, credential_type_id, credential_number, expires_on, source, verification_status)
    VALUES (a, w, ctype, 'CSCS-1', current_date + 400, 'self', 'verified') RETURNING id INTO cred;
  SELECT verification_status INTO s FROM person_credentials WHERE id = cred;
  BEGIN
    PERFORM public.workforce_verify('credential', cred, 'verified');
    e := 'verified';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  BEGIN
    INSERT INTO person_credentials (company_id, person_id, credential_type_id, source) VALUES (a, c, ctype, 'self');
    e := e || '/colleague-submitted';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/colleague-refused';
  END;
  BEGIN
    INSERT INTO training_records (company_id, person_id, course_id, completed_on, source) VALUES (a, w, course, current_date, 'manual');
    e := e || '/manual-inserted';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/manual-refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN n = 2 AND s = 'unverified' AND e = 'refused/colleague-refused/manual-refused' THEN 'PASS' ELSE 'FAIL' END
          || ' employee: reads own (' || n || '), self-submits unverified, cannot verify it, submit for a colleague, or record as manager (' || e || '); ';

  -- ── 3. Verification ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ed, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.workforce_verify('credential', cred, 'verified');
    e := 'verified';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN e = 'refused' THEN 'PASS' ELSE 'FAIL' END || ' an editor (no training.verify) cannot verify; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', hse, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.workforce_verify('credential', cred, 'verified');
  PERFORM public.workforce_verify('training', tr_sc, 'verified');
  BEGIN
    PERFORM public.workforce_verify('training', tr_sc, 'rejected', 'second opinion');
    e := 'decided-twice';
  EXCEPTION WHEN serialization_failure THEN e := 'second-refused';
  END;
  BEGIN
    UPDATE training_records SET completed_on = current_date - 1 WHERE id = tr_sc;
    e := e || '/verified-edited';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/verified-locked';
  END;
  RESET ROLE;
  SELECT (verification_status = 'verified' AND verified_by = hse)::text INTO s FROM training_records WHERE id = tr_sc;
  r := r || CASE WHEN s = 'true' AND e = 'second-refused/verified-locked' THEN 'PASS' ELSE 'FAIL' END
          || ' HSE verifies; a second decision loses; verified evidence is locked (' || e || '); ';

  -- ── 4. Competency: assessment history, verification, suspension ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO person_competencies (company_id, person_id, competency_id, level_id, assessment_method) VALUES (a, w, comp, lvl, 'assessment');
    e := 'self-assessed';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN e = 'refused' THEN 'PASS' ELSE 'FAIL' END || ' nobody assesses themselves; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO person_competencies (company_id, person_id, competency_id, level_id, assessment_method, expires_on)
    VALUES (a, w, comp, lvl, 'practical_observation', current_date + 365) RETURNING id INTO pc;
  BEGIN
    UPDATE person_competencies SET expires_on = current_date + 900 WHERE id = pc;
    e := 'edited';
  EXCEPTION WHEN insufficient_privilege THEN e := 'locked';
  END;
  BEGIN
    INSERT INTO competency_suspensions (company_id, person_id, competency_id, reason) VALUES (a, w, comp, 'direct');
    e := e || '/direct-suspend';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/direct-refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN e = 'locked/direct-refused' THEN 'PASS' ELSE 'FAIL' END || ' assessments are never edited; suspensions only by function (' || e || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', hse, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.workforce_verify('competency', pc, 'verified');
  sus := public.competency_suspend(w, comp, 'Near miss on MEWP, reassess', 'incident', NULL);
  BEGIN
    PERFORM public.competency_suspend(w, comp, 'again');
    e := 'double';
  EXCEPTION WHEN unique_violation THEN e := 'one-live-suspension';
  END;
  PERFORM public.competency_reinstate(sus, 'Reassessed on site, passed');
  RESET ROLE;
  SELECT (lifted_at IS NOT NULL AND lifted_by = hse AND suspended_by = hse)::text INTO s FROM competency_suspensions WHERE id = sus;
  r := r || CASE WHEN s = 'true' AND e = 'one-live-suspension' THEN 'PASS' ELSE 'FAIL' END || ' verify, suspend (once), reinstate, all kept; ';

  -- ── 5. Exceptions ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ed, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.requirement_exception_grant(w, 'training', course, NULL, 'temporary_exception', 'Course booked for next week', current_date + 14);
    e := 'granted';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.requirement_exception_grant(w, 'training', course, NULL, 'temporary_exception', 'Course booked for next week', current_date + 120);
    e := e || '/120-days';
  EXCEPTION WHEN check_violation THEN e := e || '/over-90-refused';
  END;
  ex := public.requirement_exception_grant(w, 'training', course, NULL, 'temporary_exception', 'Course booked for next week', current_date + 14);
  RESET ROLE;
  SELECT (approved_by = adm AND valid_until = current_date + 14)::text INTO s FROM requirement_exceptions WHERE id = ex;
  r := r || CASE WHEN e = 'refused/over-90-refused' AND s = 'true' THEN 'PASS' ELSE 'FAIL' END
          || ' exceptions: capability-gated, ≤ 90 days, approver recorded (' || e || '); ';

  -- ── 6. Pre-employment checks ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO pre_employment_checks (company_id, person_id, check_type_id, status) VALUES (a, w, chk_t, 'verified');
    e := 'self-verified';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  INSERT INTO pre_employment_checks (company_id, person_id, check_type_id, status) VALUES (a, w, chk_t, 'received') RETURNING id INTO chk;
  BEGIN
    PERFORM public.pre_employment_check_decide(chk, 'failed', 'no');
    e := e || '/fail-no-reason';
  EXCEPTION WHEN invalid_parameter_value THEN e := e || '/reason-required';
  END;
  PERFORM public.pre_employment_check_decide(chk, 'verified');
  RESET ROLE;
  SELECT status INTO s FROM pre_employment_checks WHERE id = chk;
  r := r || CASE WHEN e = 'refused/reason-required' AND s = 'verified' THEN 'PASS' ELSE 'FAIL' END || ' checks decided only by function (' || e || '); ';

  -- ── 7. Sessions: only a pass becomes a record ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO training_sessions (company_id, course_id, starts_at) VALUES (a, course_sc, now() - interval '1 day') RETURNING id INTO sess;
  INSERT INTO training_attendance (company_id, session_id, person_id, status) VALUES (a, sess, w, 'passed') RETURNING id INTO at1;
  INSERT INTO training_attendance (company_id, session_id, person_id, status) VALUES (a, sess, c, 'attended') RETURNING id INTO at2;
  n := public.training_session_record_outcomes(sess);
  RESET ROLE;
  SELECT count(*) INTO n FROM training_records WHERE person_id IN (w, c) AND source = 'session';
  SELECT (expires_on = completed_on + interval '36 months' AND verification_status = 'unverified')::text INTO s
    FROM training_records WHERE person_id = w AND source = 'session';
  r := r || CASE WHEN n = 1 AND s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' session: pass → one unverified record with expiry; attendance alone → none; ';

  -- ── 8. Deletion ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ed, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM training_records WHERE id = tr;
    e := 'editor-deleted';
  EXCEPTION WHEN insufficient_privilege THEN e := 'editor-refused';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM training_records WHERE id = tr_sc;
    e := e || '/verified-deleted';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/verified-kept';
  END;
  DELETE FROM training_records WHERE id = tr;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  r := r || CASE WHEN e = 'editor-refused/verified-kept' AND n = 1 THEN 'PASS' ELSE 'FAIL' END
          || ' delete: admin only, never verified evidence (' || e || '); ';

  -- ── 9. Tenancy ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO training_records (company_id, person_id, course_name, completed_on) VALUES (a, wb, 'x', current_date);
    e := 'cross-tenant-written';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM training_records WHERE person_id = w;
  SELECT n + count(*) INTO n FROM person_competencies WHERE person_id = w;
  SELECT n + count(*) INTO n FROM person_credentials WHERE person_id = w;
  SELECT n + count(*) INTO n FROM requirement_exceptions WHERE person_id = w;
  RESET ROLE;
  r := r || CASE WHEN e = 'refused' AND n = 0 THEN 'PASS' ELSE 'FAIL' END || ' cross-tenant write refused (' || e || '); B reads nothing of A (' || n || '); ';

  -- ── 10. Evidence files ──
  UPDATE person_credentials SET evidence_path = a || '/credential/' || w || '/x-cscs.pdf' WHERE id = cred;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', a || '/credential/' || w || '/x-cscs.pdf');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = a || '/credential/' || w || '/x-cscs.pdf';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', a || '/credential/' || w || '/planted.pdf');
    e := 'planted';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('workforce-evidence', a || '/credential/' || c || '/mine.pdf');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT n * 10 + count(*) INTO n FROM storage.objects WHERE bucket_id = 'workforce-evidence' AND name = a || '/credential/' || w || '/x-cscs.pdf';
  RESET ROLE;
  r := r || CASE WHEN n = 1 AND e = 'refused' THEN 'PASS' ELSE 'FAIL' END
          || ' files: the owner reads their certificate, a colleague cannot, nor upload into their folder (' || n || '/' || e || '); ';

  RAISE EXCEPTION 'PROBE 134: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
