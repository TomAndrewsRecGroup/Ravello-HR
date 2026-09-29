-- Migration 136 probe (Safe to Deploy engine, cache, log), 2026-09-28.
-- Run after apply; rolled back by the RAISE. Fixtures are written as the
-- owner (evidence rules are 134's, probed there); the engine is read
-- directly (_wf_deployment, so a bug is an error here rather than a
-- REVIEW_REQUIRED that hides it) and through the public reads under
-- real sessions. QA 8, 9, 11, 16-20, 22, 38 and spec 109/116.
-- Client A: admin adm, employee emp. Client B: admin bu. Workers w, w2.
-- Recorded 2026-09-28 against the applied migration: 37/37 PASS (second
-- run; the first run's 2 FAILs were probe expectations, not engine
-- defects: rules start today so "yesterday" has none, and client logins
-- are people (118) so they appear, correctly, as REVIEW_REQUIRED/no role).
-- Function bodies md5-matched (14/14). The deliberate break of
-- _wf_expiry_status is rolled back with everything else (md5 re-checked).

DO $$
DECLARE r text := ''; n int; s text; e text; res jsonb; t date := public.workforce_today();
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  w uuid; w2 uuid; role1 uuid; role2 uuid; course uuid; course2 uuid; comp uuid; lvl uuid; lvl_aw uuid;
  lic uuid; card uuid; s1 uuid; s2 uuid; asg1 uuid; rtw uuid; refs uuid; chk uuid; exc uuid; sus uuid; tr2 uuid;
  audio uuid; er uuid; oi uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a,'P136 A','p136a-'||left(a::text,8),'direct_client',true),(b,'P136 B','p136b-'||left(b::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p136-adm@probe.invalid'),(emp,'p136-emp@probe.invalid'),(bu,'p136-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user',  company_id=a WHERE id=emp;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'P136 Worker', 'employee', 'active') RETURNING id INTO w;
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'P136 Second', 'employee', 'active') RETURNING id INTO w2;
  INSERT INTO hs_sites (company_id, name) VALUES (a, 'P136 Yard') RETURNING id INTO s1;
  INSERT INTO hs_sites (company_id, name) VALUES (a, 'P136 Build site') RETURNING id INTO s2;
  INSERT INTO job_roles (company_id, title, safety_critical) VALUES (a, 'Forklift Operator', true) RETURNING id INTO role1;
  INSERT INTO job_roles (company_id, title, safety_critical) VALUES (a, 'Driver', false) RETURNING id INTO role2;
  INSERT INTO training_courses (company_id, title, validity_months, safety_critical) VALUES (a, 'Forklift', 12, true) RETURNING id INTO course;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'Manual handling', 36) RETURNING id INTO course2;
  INSERT INTO competencies (company_id, title) VALUES (a, 'Forklift operation') RETURNING id INTO comp;
  INSERT INTO credential_types (company_id, kind, title) VALUES (a, 'licence', 'Driving licence') RETURNING id INTO lic;
  INSERT INTO credential_types (company_id, kind, title) VALUES (a, 'card', 'CSCS card') RETURNING id INTO card;
  SELECT id INTO lvl FROM competency_levels WHERE company_id IS NULL AND key = 'competent';
  SELECT id INTO lvl_aw FROM competency_levels WHERE company_id IS NULL AND rank < (SELECT rank FROM competency_levels WHERE id = lvl) ORDER BY rank DESC LIMIT 1;
  SELECT id INTO rtw FROM pre_employment_check_types WHERE company_id IS NULL AND key = 'right_to_work';
  SELECT id INTO refs FROM pre_employment_check_types WHERE company_id IS NULL AND key = 'references';
  SELECT id INTO audio FROM occupational_health_requirements WHERE company_id IS NULL AND category = 'audiometry';

  -- ── Expiry edges (QA 8) ──
  s := public._wf_expiry_status(t - 1, 0, t, 30) || ',' || public._wf_expiry_status(t, 0, t, 30) || ',' ||
       public._wf_expiry_status(t + 1, 0, t, 30) || ',' || public._wf_expiry_status(t + 7, 0, t, 30) || ',' ||
       public._wf_expiry_status(t + 30, 0, t, 30) || ',' || public._wf_expiry_status(t + 31, 0, t, 30) || ',' ||
       public._wf_expiry_status(t - 3, 5, t, 30) || ',' || public._wf_expiry_status(t - 6, 5, t, 30) || ',' ||
       public._wf_expiry_status(NULL, 0, t, 30);
  r := r || CASE WHEN s = 'unmet,expiring,expiring,expiring,expiring,met,expiring,unmet,met' THEN 'PASS' ELSE 'FAIL' END
          || ' expiry edges: expired, today, tomorrow, 7, 30, 31, in grace, past grace, none (' || s || '); ';
  s := public._wf_next_edge(t + 31, 0, t, 30) || ',' || public._wf_next_edge(t + 10, 0, t, 30) || ',' || public._wf_next_edge(t - 2, 5, t, 30);
  r := r || CASE WHEN s = (t + 1)::text || ',' || (t + 11)::text || ',' || (t + 4)::text THEN 'PASS' ELSE 'FAIL' END
          || ' next change date (' || s || '); ';

  -- ── No role (spec: REVIEW_REQUIRED, never READY) ──
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'REVIEW_REQUIRED' AND res -> 'reasons' -> 0 ->> 'code' = 'no_role' THEN 'PASS' ELSE 'FAIL' END
          || ' no role → REVIEW_REQUIRED; ';

  -- ── Role with training + competency (QA 16, 11) ──
  INSERT INTO role_assignments (company_id, person_id, role_id, site_id, primary_assignment, start_date)
    VALUES (a, w, role1, s1, true, t - 30) RETURNING id INTO asg1;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role1, 'training', course, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, min_level_id, effective_from) VALUES (a, role1, 'competency', comp, lvl, current_date);
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND (res -> 'summary' ->> 'unmet')::int = 2
                  AND (res -> 'summary' ->> 'safety_critical_gap')::boolean THEN 'PASS' ELSE 'FAIL' END
          || ' nothing held → NOT_READY, 2 unmet, safety-critical gap (role is safety-critical); ';
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, verification_status, verified_at)
    VALUES (a, w, course, 'Forklift', t - 10, 'pass', 'verified', now());
  res := public._wf_deployment(w, t);
  SELECT x ->> 'status' INTO s FROM jsonb_array_elements(res -> 'requirements') x WHERE x ->> 'type' = 'competency';
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND s = 'unmet' THEN 'PASS' ELSE 'FAIL' END
          || ' verified training alone does not satisfy the competency (' || s || '); ';
  INSERT INTO person_competencies (company_id, person_id, competency_id, level_id, assessment_method, assessed_on, verification_status, verified_at)
    VALUES (a, w, comp, lvl_aw, 'practical_observation', t - 6, 'verified', now());
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%required%' THEN 'PASS' ELSE 'FAIL' END
          || ' a lower assessed level does not meet the minimum; ';
  INSERT INTO person_competencies (company_id, person_id, competency_id, level_id, assessment_method, assessed_on, verification_status, verified_at)
    VALUES (a, w, comp, lvl, 'practical_observation', t - 5, 'verified', now());
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'READY' AND (res -> 'summary' ->> 'met')::int = 2 THEN 'PASS' ELSE 'FAIL' END
          || ' all met → READY (' || (res ->> 'status') || '); ';

  -- ── Unverified evidence on a safety-critical item: review, not met (QA 9) ──
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role1, 'training', course2, current_date);
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, verification_status)
    VALUES (a, w, course2, 'Manual handling', t - 2, 'pass', 'unverified') RETURNING id INTO tr2;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'REVIEW_REQUIRED' THEN 'PASS' ELSE 'FAIL' END
          || ' unverified record for a mandatory item of a safety-critical role → REVIEW_REQUIRED (' || (res ->> 'status') || '); ';
  UPDATE training_records SET verification_status = 'verified', verified_at = now() WHERE id = tr2;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'READY' THEN 'PASS' ELSE 'FAIL' END || ' verified → READY; ';

  -- ── Expiring, expired, and dates in the future (QA 8, 9) ──
  res := public._wf_deployment(w, t + 400);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%Expired%' THEN 'PASS' ELSE 'FAIL' END
          || ' 12-month course judged as expired on a date past its expiry; ';
  res := public._wf_deployment(w, (t - 10 + interval '12 months')::date - 5);
  r := r || CASE WHEN res ->> 'status' = 'READY' AND (res -> 'summary' ->> 'expiring')::int = 1 THEN 'PASS' ELSE 'FAIL' END
          || ' 5 days before expiry: still READY, flagged expiring; ';
  res := public._wf_deployment(w, t - 40);
  r := r || CASE WHEN res ->> 'status' = 'REVIEW_REQUIRED' AND res -> 'reasons' -> 0 ->> 'code' = 'no_role' THEN 'PASS' ELSE 'FAIL' END
          || ' a date before the assignment began has no role then; ';

  -- ── Cache, dirty marking, never stale (QA 38, spec 116) ──
  PERFORM public.workforce_refresh(w);
  SELECT status || '/' || dirty INTO s FROM person_deployment_status WHERE person_id = w;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.person_deployment_status(w);
  RESET ROLE;
  r := r || CASE WHEN s = 'READY/false' AND res ->> 'source' = 'cache' AND res ->> 'status' = 'READY' THEN 'PASS' ELSE 'FAIL' END
          || ' refresh caches READY; admin reads it from the cache (' || s || '/' || (res ->> 'source') || '); ';
  INSERT INTO competency_suspensions (company_id, person_id, competency_id, reason)
    VALUES (a, w, comp, 'Near miss pending retraining') RETURNING id INTO sus;
  SELECT dirty::text INTO s FROM person_deployment_status WHERE person_id = w;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.person_deployment_status(w);
  RESET ROLE;
  r := r || CASE WHEN s = 'true' AND res ->> 'source' = 'live' AND res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%Suspended since%'
                 THEN 'PASS' ELSE 'FAIL' END
          || ' suspension marks the cache dirty; the next read is live NOT_READY, never the stale READY; ';
  n := public.workforce_refresh_due(100);
  SELECT count(*) INTO n FROM deployment_status_log WHERE person_id = w AND from_status = 'READY' AND to_status = 'NOT_READY';
  r := r || CASE WHEN n = 1 AND (SELECT status FROM person_deployment_status WHERE person_id = w) = 'NOT_READY' THEN 'PASS' ELSE 'FAIL' END
          || ' the sweep recalculates and logs READY→NOT_READY; ';
  UPDATE competency_suspensions SET lifted_at = now() WHERE id = sus;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'READY' THEN 'PASS' ELSE 'FAIL' END || ' lifting the suspension restores READY; ';

  -- ── Pre-employment checks and a time-limited exception (QA 22, 17) ──
  INSERT INTO pre_employment_checks (company_id, person_id, check_type_id, status) VALUES (a, w, rtw, 'requested') RETURNING id INTO chk;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%Outstanding (requested)%' THEN 'PASS' ELSE 'FAIL' END
          || ' an outstanding pre-employment check blocks even without a rule; ';
  INSERT INTO requirement_exceptions (company_id, person_id, requirement_type, reference_id, kind, reason, approved_by, valid_from, valid_until)
    VALUES (a, w, 'pre_employment_check', rtw, 'temporary_exception', 'Share code requested, awaiting Home Office', adm, t, t + 14)
    RETURNING id INTO exc;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'CONDITIONALLY_READY' AND (res ->> 'valid_until')::date = t + 15 THEN 'PASS' ELSE 'FAIL' END
          || ' temporary exception → CONDITIONALLY_READY, cache valid only until it lapses (' || COALESCE(res ->> 'valid_until', 'null') || '); ';
  res := public._wf_deployment(w, t + 20);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' THEN 'PASS' ELSE 'FAIL' END || ' the exception lapses by itself; ';
  UPDATE requirement_exceptions SET revoked_at = now(), revoke_reason = 'Probe' WHERE id = exc;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' THEN 'PASS' ELSE 'FAIL' END || ' a revoked exception no longer counts; ';
  UPDATE pre_employment_checks SET status = 'verified', verified_at = now() WHERE id = chk;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'READY' THEN 'PASS' ELSE 'FAIL' END || ' verified check → READY; ';
  INSERT INTO role_assignments (company_id, person_id, role_id, primary_assignment, start_date) VALUES (a, w2, role2, true, t - 1);
  INSERT INTO pre_employment_checks (company_id, person_id, check_type_id, status, verified_at) VALUES (a, w2, refs, 'failed', now());
  res := public._wf_deployment(w2, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%Check failed%' THEN 'PASS' ELSE 'FAIL' END
          || ' a failed check → NOT_READY; ';

  -- ── Medical: category only, never the restriction text ──
  INSERT INTO person_requirements (company_id, person_id, requirement_type, reference_id, effective_from, source_type)
    VALUES (a, w, 'medical', audio, current_date, 'manual');
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' THEN 'PASS' ELSE 'FAIL' END || ' medical required, none on record → NOT_READY; ';
  INSERT INTO person_health_outcomes (company_id, person_id, requirement_id, assessed_on, outcome, restriction_summary, review_date)
    VALUES (a, w, audio, t - 3, 'fit_with_restrictions', 'XYZZY hearing protection at all times', t + 360);
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'CONDITIONALLY_READY' AND res::text NOT ILIKE '%XYZZY%' AND res::text ILIKE '%see occupational health%'
                 THEN 'PASS' ELSE 'FAIL' END
          || ' fit with restrictions → CONDITIONALLY_READY; the restriction text is not in the result; ';
  INSERT INTO person_health_outcomes (company_id, person_id, requirement_id, assessed_on, outcome, review_date)
    VALUES (a, w, audio, t - 1, 'fit', t + 360);
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'READY' THEN 'PASS' ELSE 'FAIL' END || ' a later fit outcome → READY; ';

  -- ── Site transfer (QA 20) and role change (QA 19) ──
  INSERT INTO site_requirements (company_id, site_id, requirement_type, reference_id, effective_from) VALUES (a, s2, 'card', card, current_date);
  UPDATE role_assignments SET site_id = s2 WHERE id = asg1;
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res::text ILIKE '%CSCS card%' AND res::text ILIKE '%"scope": "site"%' THEN 'PASS' ELSE 'FAIL' END
          || ' moving to a site with its own rule adds it (source: site); ';
  UPDATE role_assignments SET site_id = s1 WHERE id = asg1;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role2, 'licence', lic, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, role2, 'training', course2, current_date);
  SELECT string_agg(name || ':' || already_required, ',' ORDER BY name) INTO s FROM public.role_change_preview(w, role2);
  r := r || CASE WHEN s = 'Driving licence:false,Manual handling:true' THEN 'PASS' ELSE 'FAIL' END
          || ' role change preview: new licence, manual handling already held as a requirement (' || COALESCE(s, 'null') || '); ';
  UPDATE role_assignments SET end_date = t - 1, assignment_status = 'ended', primary_assignment = false WHERE id = asg1;
  INSERT INTO role_assignments (company_id, person_id, role_id, primary_assignment, start_date) VALUES (a, w, role2, true, t);
  res := public._wf_deployment(w, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND (res -> 'summary' ->> 'unmet')::int = 1 AND res::text ILIKE '%Driving licence%'
                  AND res::text NOT ILIKE '%Forklift operation%' THEN 'PASS' ELSE 'FAIL' END
          || ' after the change only the new role''s rules apply; ';
  res := public._wf_deployment(w, t - 1);
  r := r || CASE WHEN res::text NOT ILIKE '%Driving licence%' AND res -> 'reasons' -> 0 ->> 'code' IS DISTINCT FROM 'no_role'
                 THEN 'PASS' ELSE 'FAIL' END
          || ' yesterday is judged on the old assignment: the new role''s licence is not required then; ';

  -- ── Onboarding gate (spec 59) ──
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, person_id) VALUES (a, 'P136 Second', 'Driver', t - 1, w2) RETURNING id INTO er;
  INSERT INTO onboarding_instances (company_id, employee_id) VALUES (a, er) RETURNING id INTO oi;
  INSERT INTO onboarding_task_progress (instance_id, task_title, gate) VALUES (oi, 'Site induction walk-round', 'before_unsupervised');
  res := public._wf_deployment(w2, t);
  r := r || CASE WHEN res::text ILIKE '%required before unsupervised work%' THEN 'PASS' ELSE 'FAIL' END || ' an open onboarding gate blocks; ';

  -- ── Lifecycle ──
  UPDATE people SET lifecycle_status = 'leaver' WHERE id = w2;
  res := public._wf_deployment(w2, t);
  r := r || CASE WHEN res ->> 'status' = 'NOT_READY' AND res -> 'reasons' -> 0 ->> 'code' = 'not_active' THEN 'PASS' ELSE 'FAIL' END
          || ' a leaver is NOT_READY today; ';

  -- ── Visibility ──
  FOR s IN SELECT unnest(ARRAY['emp','bu']) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', CASE s WHEN 'emp' THEN emp ELSE bu END, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      res := public.person_deployment_status(w);
      e := 'read';
    EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
    END;
    RESET ROLE;
    r := r || CASE WHEN e = 'refused' THEN 'PASS' ELSE 'FAIL' END || ' ' || s || ' cannot read a colleague''s/another client''s status; ';
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.workforce_readiness(a);
    e := 'read';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  BEGIN
    PERFORM public._wf_deployment(w, t);
    e := e || '/internal-callable';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/internal-refused';
  END;
  SELECT e || '/' || count(*) INTO e FROM person_deployment_status WHERE person_id = w;
  RESET ROLE;
  r := r || CASE WHEN e = 'refused/internal-refused/0' THEN 'PASS' ELSE 'FAIL' END
          || ' client B: readiness refused, engine not callable, cache row invisible (' || e || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(full_name || ':' || status, ',' ORDER BY full_name) INTO s FROM public.workforce_readiness(a);
  BEGIN
    UPDATE person_deployment_status SET status = 'READY' WHERE person_id = w;
    e := 'wrote';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  RESET ROLE;
  -- The client logins are people too (118 links them) and have no role.
  r := r || CASE WHEN s = 'P136 Worker:NOT_READY,p136-adm@probe.invalid:REVIEW_REQUIRED,p136-emp@probe.invalid:REVIEW_REQUIRED'
                  AND e = 'refused' THEN 'PASS' ELSE 'FAIL' END
          || ' admin sees the workforce (leaver excluded, role-less logins REVIEW_REQUIRED); nobody writes a status (' || COALESCE(s, 'null') || '/' || e || '); ';

  -- ── A calculation failure is REVIEW_REQUIRED, never READY (QA 18, spec 109) ──
  res := public._wf_deployment_safe(gen_random_uuid(), t);
  r := r || CASE WHEN res ->> 'status' = 'REVIEW_REQUIRED' AND res -> 'reasons' -> 0 ->> 'code' = 'calculation_error' THEN 'PASS' ELSE 'FAIL' END
          || ' unknown person → REVIEW_REQUIRED calculation_error; ';
  INSERT INTO person_credentials (company_id, person_id, credential_type_id, issued_on, verification_status, verified_at)
    VALUES (a, w, lic, t - 100, 'verified', now());
  res := public._wf_deployment(w, t);
  s := res ->> 'status';
  EXECUTE $f$CREATE OR REPLACE FUNCTION public._wf_expiry_status(p_expires date, p_grace integer, p_as_of date, p_soon integer)
    RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT (1/0)::text'$f$;
  res := public._wf_deployment_safe(w, t);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  e := public.person_deployment_status(w, t + 1) ->> 'status';
  RESET ROLE;
  r := r || CASE WHEN s = 'READY' AND res ->> 'status' = 'REVIEW_REQUIRED' AND res ->> 'error_class' = '22012' AND e = 'REVIEW_REQUIRED'
                 THEN 'PASS' ELSE 'FAIL' END
          || ' a READY person whose calculation breaks mid-way → REVIEW_REQUIRED, internally and through the public read (' || s || '→' || e || '); ';

  RAISE EXCEPTION 'PROBE 136: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
