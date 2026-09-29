-- Migration 135 probe (occupational health, clinical separation), 2026-09-28.
-- Run after apply; rolled back by the RAISE. QA 14 (per user type) and
-- QA 15 (clinical leak, cross-client).
-- Client A: admin adm, employee emp (worker w), employee emp2; from a home
-- company, under grants on A: site manager sm, HR manager hr, occupational
-- health advisor oh. Staff stf (no grant). Client B: admin bu.
-- Recorded 2026-09-28 against the applied migration: 17/17 PASS (first
-- run). Function bodies md5-matched (3/3).

DO $$
DECLARE r text := ''; n int; s text; e text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); home uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); emp2 uuid := gen_random_uuid();
  sm uuid := gen_random_uuid(); hr uuid := gen_random_uuid(); oh uuid := gen_random_uuid();
  stf uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  w uuid; me_adm uuid; req uuid; o1 uuid; cl uuid; path text;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a,'P135 A','p135a-'||left(a::text,8),'direct_client',true),(b,'P135 B','p135b-'||left(b::text,8),'direct_client',true),
    (home,'P135 H','p135h-'||left(home::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p135-adm@probe.invalid'),(emp,'p135-emp@probe.invalid'),(emp2,'p135-emp2@probe.invalid'),
                 (sm,'p135-sm@probe.invalid'),(hr,'p135-hr@probe.invalid'),(oh,'p135-oh@probe.invalid'),
                 (stf,'p135-st@probe.invalid'),(bu,'p135-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user',  company_id=a WHERE id IN (emp, emp2);
  UPDATE profiles SET role='client_user',  company_id=home WHERE id IN (sm, hr, oh);
  UPDATE profiles SET role='tps_admin',    company_id=NULL WHERE id=stf;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES
    (sm, a, 'site_manager'), (hr, a, 'hr_manager'), (oh, a, 'occupational_health_advisor');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (sm, a), (hr, a), (oh, a);
  SELECT id INTO w FROM people WHERE user_id = emp; SELECT id INTO me_adm FROM people WHERE user_id = adm;
  SELECT id INTO req FROM occupational_health_requirements WHERE company_id IS NULL AND category = 'audiometry';

  -- ── The admin records an operational outcome ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO person_health_outcomes (company_id, person_id, requirement_id, assessed_on, provider, outcome, restriction_summary, review_date)
    VALUES (a, w, req, current_date - 10, 'OH Co', 'fit_with_restrictions', 'Hearing protection at all times', current_date + 355)
    RETURNING id INTO o1;
  r := r || 'PASS admin records an outcome; ';
  BEGIN
    INSERT INTO person_health_outcomes (company_id, person_id, assessed_on, outcome) VALUES (a, me_adm, current_date, 'fit');
    e := 'self-recorded';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  BEGIN
    INSERT INTO occupational_health_clinical (company_id, person_id, outcome_id, clinical_notes) VALUES (a, w, o1, 'x');
    e := e || '/admin-wrote-clinical';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/admin-clinical-refused';
  END;
  BEGIN
    UPDATE person_health_outcomes SET outcome = 'fit' WHERE id = o1;
    e := e || '/edited';
  EXCEPTION WHEN insufficient_privilege THEN e := e || '/locked';
  END;
  RESET ROLE;
  r := r || CASE WHEN e = 'refused/admin-clinical-refused/locked' THEN 'PASS' ELSE 'FAIL' END
          || ' no self-recording; an admin cannot write clinical; outcomes are never edited (' || e || '); ';

  -- ── Who sees the outcome summary ──
  FOR s IN SELECT unnest(ARRAY['emp','emp2','sm','hr','bu','stf']) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',
      CASE s WHEN 'emp' THEN emp WHEN 'emp2' THEN emp2 WHEN 'sm' THEN sm WHEN 'hr' THEN hr WHEN 'bu' THEN bu ELSE stf END,
      'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM person_health_outcomes WHERE id = o1;
    RESET ROLE;
    e := COALESCE(e, '') ;
    r := r || CASE WHEN n = CASE WHEN s IN ('emp','hr','stf') THEN 1 ELSE 0 END THEN 'PASS' ELSE 'FAIL' END
            || ' outcome visible to ' || s || ': ' || n || '; ';
  END LOOP;

  -- ── The OH advisor: clinical ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', oh, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  path := a || '/' || w || '/audiogram.pdf';
  INSERT INTO occupational_health_clinical (company_id, person_id, outcome_id, clinical_notes, document_path)
    VALUES (a, w, o1, 'Mild bilateral high-frequency loss', path) RETURNING id INTO cl;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('oh-clinical', path);
  SELECT count(*) INTO n FROM occupational_health_clinical WHERE id = cl;
  SELECT n * 10 + count(*) INTO n FROM storage.objects WHERE bucket_id = 'oh-clinical' AND name = path;
  RESET ROLE;
  r := r || CASE WHEN n = 11 THEN 'PASS' ELSE 'FAIL' END || ' OH advisor writes and reads clinical notes and the file (' || n || '); ';

  -- ── Nobody else reads clinical: not the person's admin, HR, the site manager, the person, staff, another client ──
  FOR s IN SELECT unnest(ARRAY['adm','hr','sm','emp','stf','bu']) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',
      CASE s WHEN 'adm' THEN adm WHEN 'hr' THEN hr WHEN 'sm' THEN sm WHEN 'emp' THEN emp WHEN 'bu' THEN bu ELSE stf END,
      'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM occupational_health_clinical WHERE person_id = w;
    SELECT n + count(*) INTO n FROM storage.objects WHERE bucket_id = 'oh-clinical' AND name = path;
    RESET ROLE;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' no clinical for ' || s || ' (' || n || '); ';
  END LOOP;

  -- ── Staff cannot upload clinical either; the audit carries no restriction or note text ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stf, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('oh-clinical', a || '/x/planted.pdf');
    e := 'staff-uploaded';
  EXCEPTION WHEN insufficient_privilege THEN e := 'refused';
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM audit_events
   WHERE entity_type IN ('person_health_outcomes','occupational_health_clinical')
     AND entity_id IN (o1::text, cl::text)
     AND (COALESCE(new_value::text,'') ILIKE '%hearing%' OR COALESCE(new_value::text,'') ILIKE '%bilateral%');
  r := r || CASE WHEN e = 'refused' AND n = 0 THEN 'PASS' ELSE 'FAIL' END
          || ' staff cannot upload clinical; audit holds no restriction or clinical text (' || e || '/' || n || '); ';
  SELECT count(*) INTO n FROM audit_events WHERE entity_type IN ('person_health_outcomes','occupational_health_clinical') AND entity_id IN (o1::text, cl::text);
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' both records audited (' || n || '); ';

  RAISE EXCEPTION 'PROBE 135: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
