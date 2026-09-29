-- Migration 133 probe (requirement catalogues and rules), 2026-09-28.
-- Run after apply; rolled back by the RAISE. Admin adm (A), employee emp
-- (A), admin bu (B).
-- Recorded 2026-09-28 against the applied migration: 17/17 PASS. Function
-- bodies md5-matched to the migration file (8/8); 132's 7/7.

DO $$
DECLARE r text := ''; n int; s text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  role uuid; role2 uuid; course uuid; course_b uuid; lic uuid; comp uuid; lvl uuid; rule uuid; draft uuid; pw uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (a,'P133 A','p133a-'||left(a::text,8),'direct_client',true),(b,'P133 B','p133b-'||left(b::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p133-adm@probe.invalid'),(emp,'p133-emp@probe.invalid'),(bu,'p133-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user',  company_id=a WHERE id=emp;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  SELECT id INTO lvl FROM competency_levels WHERE company_id IS NULL AND key = 'competent';

  -- ── Admin of A builds a role ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO job_roles (company_id, title, safety_critical) VALUES (a, 'Forklift Operator', true) RETURNING id INTO role;
  INSERT INTO training_courses (company_id, title, validity_months, safety_critical) VALUES (a, 'Forklift (counterbalance)', 36, true) RETURNING id INTO course;
  INSERT INTO credential_types (company_id, kind, title) VALUES (a, 'licence', 'Driving licence') RETURNING id INTO lic;
  INSERT INTO competencies (company_id, title, safety_critical) VALUES (a, 'Forklift operation', true) RETURNING id INTO comp;
  SELECT count(*) INTO n FROM occupational_health_requirements WHERE company_id IS NULL;
  r := r || CASE WHEN n = 8 THEN 'PASS' ELSE 'FAIL' END || ' global OH catalogue readable (' || n || '); ';
  SELECT count(*) INTO n FROM competency_levels WHERE company_id IS NULL;
  r := r || CASE WHEN n = 6 THEN 'PASS' ELSE 'FAIL' END || ' six global competency levels; ';
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, safety_critical, effective_from)
    VALUES (a, role, 'training', course, true, current_date) RETURNING id INTO rule;
  r := r || 'PASS admin adds an in-force rule; ';
  BEGIN
    INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id) VALUES (a, role, 'certification', lic);
    r := r || 'FAIL a licence accepted as a certification; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS credential kind must match; ';
  END;
  BEGIN
    INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id) VALUES (a, role, 'competency', comp);
    r := r || 'FAIL competency without a level; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS competency needs a level; ';
  END;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, min_level_id, effective_from)
    VALUES (a, role, 'competency', comp, lvl, current_date);
  BEGIN
    INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from)
      VALUES (a, role, 'training', course, current_date - 1);
    r := r || 'FAIL a rule started in the past; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS no rule starts in the past; ';
  END;
  -- Versioning.
  BEGIN
    UPDATE role_requirements SET validity_months = 12 WHERE id = rule;
    r := r || 'FAIL in-force rule edited; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS in-force rule cannot be edited; ';
  END;
  BEGIN
    UPDATE role_requirements SET effective_until = current_date - 5 WHERE id = rule;
    r := r || 'FAIL retroactive end; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS no retroactive end; ';
  END;
  BEGIN
    DELETE FROM role_requirements WHERE id = rule;
    r := r || 'FAIL in-force rule deleted; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS in-force rule never deleted; ';
  END;
  draft := public.requirement_supersede('role_requirements', rule);
  UPDATE role_requirements SET validity_months = 24 WHERE id = draft;
  PERFORM public.requirement_activate('role_requirements', draft, current_date, rule);
  SELECT (o.effective_until = current_date - 1 AND o.superseded_by = draft AND o.validity_months IS NULL
          AND d.effective_from = current_date AND d.validity_months = 24)::text INTO s
    FROM role_requirements o, role_requirements d WHERE o.id = rule AND d.id = draft;
  r := r || CASE WHEN s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' supersede → edit draft → activate; old ends yesterday; ';
  -- Clone.
  role2 := public.job_role_clone(role, 'Forklift Operator (night)');
  SELECT count(*) FILTER (WHERE effective_from IS NULL) || '/' || count(*) INTO s FROM role_requirements WHERE role_id = role2;
  r := r || CASE WHEN s = '2/2' AND (SELECT active_status FROM job_roles WHERE id = role2) = 'draft' THEN 'PASS' ELSE 'FAIL' END
          || ' clone: draft role, draft copies of live rules (' || s || '); ';
  n := public.job_role_activate(role2);
  r := r || CASE WHEN n = 2 AND (SELECT active_status FROM job_roles WHERE id = role2) = 'active' THEN 'PASS' ELSE 'FAIL' END || ' activate the clone; ';
  RESET ROLE;

  -- ── Employee of A: reads rules, cannot write them ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM role_requirements WHERE role_id = role;
  BEGIN
    INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id) VALUES (a, role, 'licence', lic);
    s := 'inserted';
  EXCEPTION WHEN insufficient_privilege THEN s := 'refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN n = 3 AND s = 'refused' THEN 'PASS' ELSE 'FAIL' END || ' employee reads rules, cannot write (' || n || '/' || s || '); ';

  -- ── Client B ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM role_requirements WHERE company_id = a;
  SELECT n + count(*) INTO n FROM training_courses WHERE company_id = a;
  SELECT n + count(*) INTO n FROM job_roles WHERE company_id = a;
  INSERT INTO training_courses (company_id, title) VALUES (b, 'B course') RETURNING id INTO course_b;
  RESET ROLE;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' client B sees none of A''s roles, rules or courses (' || n || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id) VALUES (a, role, 'training', course_b);
    s := 'inserted';
  EXCEPTION WHEN foreign_key_violation THEN s := 'refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN s = 'refused' THEN 'PASS' ELSE 'FAIL' END || ' a rule cannot point at another client''s course; ';
  -- A person requirement is visible only to those who may see the person.
  INSERT INTO people (company_id, full_name, worker_type) VALUES (a, 'P133 Worker', 'employee') RETURNING id INTO pw;
  INSERT INTO person_requirements (company_id, person_id, requirement_type, reference_id, effective_from, source_type)
    VALUES (a, pw, 'training', course, current_date, 'manual');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM person_requirements WHERE person_id = pw;
  RESET ROLE;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' a colleague''s person requirement is hidden from an employee (' || n || '); ';
  SELECT count(*) INTO n FROM audit_events WHERE entity_type = 'role_requirements' AND entity_id = rule::text;
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' rule audited (created, superseded: ' || n || '); ';
  RAISE EXCEPTION 'PROBE 133: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
