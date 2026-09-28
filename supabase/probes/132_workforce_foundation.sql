-- Migration 132 probe (workforce foundation), 2026-09-28. Run after apply;
-- always rolled back by the RAISE.
-- Recorded: 13/13 against a slimmed copy inside BEGIN … ROLLBACK before
-- apply, then 16/16 against the applied migration (this file).

DO $$
DECLARE r text := ''; n int; s text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); peer uuid := gen_random_uuid(); sitem uuid := gen_random_uuid(); stf uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  pm uuid; pw uuid; ppeer uuid; psm uuid; site uuid; role uuid; asg uuid;
BEGIN
  SELECT count(*) INTO n FROM people WHERE lifecycle_status IS NULL;
  SELECT string_agg(worker_type||'='||lifecycle_status, ',' ORDER BY worker_type) INTO s FROM (SELECT DISTINCT worker_type, lifecycle_status FROM people) x;
  r := r || CASE WHEN n = 0 AND s = 'athlete=prospect,candidate=candidate,employee=active' THEN 'PASS' ELSE 'FAIL' END || ' backfill (' || s || '); ';
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (a,'P132 A','p132a-'||left(a::text,8),'direct_client',true),(b,'P132 B','p132b-'||left(b::text,8),'direct_client',true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',em,'',now(),now(),now(),'{}','{}'
    FROM (VALUES (adm,'p132-adm@probe.invalid'),(mgr,'p132-mgr@probe.invalid'),(peer,'p132-peer@probe.invalid'),(sitem,'p132-sm@probe.invalid'),(stf,'p132-st@probe.invalid'),(bu,'p132-bu@probe.invalid')) v(id,em);
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=adm;
  UPDATE profiles SET role='client_user', company_id=a WHERE id IN (mgr, peer, sitem);
  UPDATE profiles SET role='tps_admin', company_id=NULL WHERE id=stf;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=bu;
  SELECT id INTO pm FROM people WHERE user_id = mgr; SELECT id INTO ppeer FROM people WHERE user_id = peer; SELECT id INTO psm FROM people WHERE user_id = sitem;
  INSERT INTO people (company_id, full_name, worker_type, manager_id) VALUES (a, 'Probe Worker', 'contractor', pm) RETURNING id INTO pw;
  SELECT lifecycle_status||'/'||engagement_type INTO s FROM people WHERE id = pw;
  r := r || CASE WHEN s = 'active/contractor' THEN 'PASS' ELSE 'FAIL' END || ' contractor defaults (' || s || '); ';
  INSERT INTO hs_sites (company_id, name, site_manager_id) VALUES (a, 'P132 Site', psm) RETURNING id INTO site;
  INSERT INTO job_roles (company_id, title) VALUES (a, 'Operative') RETURNING id INTO role;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', mgr, 'role','authenticated')::text, true);
  r := r || CASE WHEN public.person_visible(pw) THEN 'PASS' ELSE 'FAIL' END || ' line manager sees their report; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', peer, 'role','authenticated')::text, true);
  r := r || CASE WHEN NOT public.person_visible(pw) AND public.person_visible(ppeer) THEN 'PASS' ELSE 'FAIL' END || ' a peer does not; self does; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sitem, 'role','authenticated')::text, true);
  r := r || CASE WHEN NOT public.person_visible(pw) THEN 'PASS' ELSE 'FAIL' END || ' site manager not before assignment; ';
  INSERT INTO role_assignments (company_id, person_id, role_id, site_id, primary_assignment) VALUES (a, pw, role, site, true) RETURNING id INTO asg;
  r := r || CASE WHEN public.person_visible(pw) THEN 'PASS' ELSE 'FAIL' END || ' site manager after assignment to their site; ';
  -- Through RLS: the peer (employee role) sees no assignment row; the site manager does.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', peer, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM role_assignments WHERE person_id = pw;
  RESET ROLE;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' RLS: peer reads no assignment (' || n || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sitem, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM role_assignments WHERE person_id = pw;
  BEGIN
    INSERT INTO role_assignments (company_id, person_id, role_id) VALUES (a, pw, role);
    s := 'inserted';
  EXCEPTION WHEN insufficient_privilege THEN s := 'refused';
  END;
  RESET ROLE;
  r := r || CASE WHEN n = 1 AND s = 'refused' THEN 'PASS' ELSE 'FAIL' END || ' RLS: site manager reads it, cannot assign (' || n || '/' || s || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  r := r || CASE WHEN public.person_visible(pw) THEN 'PASS' ELSE 'FAIL' END || ' org admin (workforce.read) sees all; ';
  r := r || CASE WHEN NOT public.has_explicit_capability(a, 'occupational_health.clinical.read') THEN 'PASS' ELSE 'FAIL' END || ' org admin has no clinical access; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM role_assignments WHERE person_id = pw;
  SELECT n + count(*) INTO n FROM job_roles WHERE company_id = a;
  RESET ROLE;
  r := r || CASE WHEN NOT public.person_visible(pw) AND n = 0 THEN 'PASS' ELSE 'FAIL' END || ' other client sees nothing (' || n || '); ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stf, 'role','authenticated')::text, true);
  r := r || CASE WHEN public.person_visible(pw) AND public.has_capability(a,'occupational_health.clinical.read')
                 AND NOT public.has_explicit_capability(a, 'occupational_health.clinical.read') THEN 'PASS' ELSE 'FAIL' END
          || ' staff: visible, but clinical needs an explicit grant; ';
  UPDATE role_assignments SET assignment_status = 'ended' WHERE id = asg;
  SELECT (end_date = current_date AND NOT primary_assignment)::text INTO s FROM role_assignments WHERE id = asg;
  r := r || CASE WHEN s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' ending stamps the date and drops primary; ';
  BEGIN
    UPDATE role_assignments SET assignment_status = 'active' WHERE id = asg;
    r := r || 'FAIL ended assignment re-opened; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS ended assignment stays ended; ';
  END;
  BEGIN
    INSERT INTO role_assignments (company_id, person_id, role_id) VALUES (b, pw, role);
    r := r || 'FAIL cross-org assignment; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS cross-org assignment refused; ';
  END;
  SELECT count(*) INTO n FROM audit_events WHERE entity_type = 'role_assignments' AND entity_id = asg::text;
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' assignment audited (created, ended: ' || n || '); ';
  RAISE EXCEPTION 'PROBE 132: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
