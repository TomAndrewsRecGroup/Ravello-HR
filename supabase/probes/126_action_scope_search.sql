-- 126 live probe (2026-09-28): who may change an action, and what
-- search_records() returns to whom. One transaction, always rolled back.
-- Fixture company "Probe 126": emp (assignee), emp2 (named verifier),
-- emp3 (unrelated; reports an incident) — all client_user → employee,
-- no actions.assign — and adm (client_admin → organisation_admin).
--
-- Recorded result, 15/15 PASS:
--   unrelated employee updates nothing (0); can still read the org action (1);
--   assignee cannot rename / drop verification / dismiss;
--   assignee submits own action (awaiting_verification/true); cannot verify;
--   employee cannot find another's incident by number (0);
--   verifier cannot rewrite evidence; named verifier (no assign) verifies (complete/true);
--   reporter finds own incident by number (1); description text not searchable (0);
--   admin finds incident by date (1) and by title (1); invalid date does not error.

DO $$
DECLARE r text := ''; n int; st text;
  x uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); emp2 uuid := gen_random_uuid(); emp3 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  act uuid; inc uuid; num text;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (x, 'Probe 126', 'probe-126-'||left(x::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (emp,'p126-emp@probe.invalid'), (emp2,'p126-emp2@probe.invalid'), (emp3,'p126-emp3@probe.invalid'), (adm,'p126-adm@probe.invalid')) v(id, em);
  UPDATE profiles SET role = 'client_user', company_id = x WHERE id IN (emp, emp2, emp3);
  UPDATE profiles SET role = 'client_admin', company_id = x WHERE id = adm;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO actions (company_id, action_type, title, priority, status, assigned_to, verifier_id, verification_required)
    VALUES (x, 'hs_corrective', 'Fit guard', 'normal', 'active', emp, emp2, true) RETURNING id INTO act;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp3, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE actions SET completion_evidence = '{"n":"x"}', status = 'awaiting_verification' WHERE id = act; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' unrelated employee updates nothing ('||n||'); ';
  SELECT count(*) INTO n FROM actions WHERE id = act;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' unrelated employee can still read the org action ('||n||'); ';
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location)
    VALUES (x, 'near_miss', 'Forklift near miss', DATE '2026-09-20', 'SECRETNOTE driver shaken', 'Yard') RETURNING id INTO inc;
  SELECT incident_number INTO num FROM hs_incidents WHERE id = inc;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE actions SET title = 'Renamed by assignee' WHERE id = act;
    r := r || 'FAIL assignee renamed the action; ';
  EXCEPTION WHEN others THEN r := r || 'PASS assignee cannot rename; '; END;
  BEGIN UPDATE actions SET verification_required = false WHERE id = act;
    r := r || 'FAIL assignee dropped verification; ';
  EXCEPTION WHEN others THEN r := r || 'PASS assignee cannot drop verification; '; END;
  BEGIN UPDATE actions SET status = 'dismissed' WHERE id = act;
    r := r || 'FAIL assignee dismissed; ';
  EXCEPTION WHEN others THEN r := r || 'PASS assignee cannot dismiss; '; END;
  UPDATE actions SET completion_evidence = '{"n":"guard fitted"}', status = 'awaiting_verification' WHERE id = act;
  SELECT status || '/' || (completed_by = emp) INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'awaiting_verification/true' THEN 'PASS' ELSE 'FAIL' END || ' assignee submits own action ('||st||'); ';
  BEGIN UPDATE actions SET status = 'complete' WHERE id = act;
    r := r || 'FAIL assignee verified own work; ';
  EXCEPTION WHEN others THEN r := r || 'PASS assignee cannot verify; '; END;
  SELECT count(*) INTO n FROM search_records(num, 30) WHERE entity_type = 'incident';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' employee cannot find another''s incident by number ('||n||'); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE actions SET completion_evidence = '{"n":"forged"}' WHERE id = act;
    r := r || 'FAIL verifier rewrote the evidence; ';
  EXCEPTION WHEN others THEN r := r || 'PASS verifier cannot rewrite evidence; '; END;
  UPDATE actions SET status = 'complete', verification_comments = 'Checked on site' WHERE id = act;
  SELECT status || '/' || (verified_by = emp2) INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'complete/true' THEN 'PASS' ELSE 'FAIL' END || ' named verifier (no assign) verifies ('||st||'); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp3, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM search_records(num, 30) WHERE entity_type = 'incident';
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' reporter finds own incident by number ('||n||'); ';
  SELECT count(*) INTO n FROM search_records('SECRETNOTE', 30);
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' description text is not searchable ('||n||'); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM search_records('2026-09-20', 30) WHERE entity_type = 'incident' AND entity_id = inc;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' admin finds incident by date ('||n||'); ';
  SELECT count(*) INTO n FROM search_records('forklift', 30) WHERE entity_type = 'incident' AND entity_id = inc;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' admin finds incident by title ('||n||'); ';
  SELECT count(*) INTO n FROM search_records('2026-13-45', 30);
  r := r || 'PASS invalid date does not error ('||n||'); ';
  RESET ROLE;

  RAISE EXCEPTION 'PROBE 126 (rolled back): %', r;
END $$;
