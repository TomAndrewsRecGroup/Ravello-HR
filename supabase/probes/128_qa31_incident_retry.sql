-- QA 31 (network failure during incident submission), 2026-09-28.
-- The report form now fixes the incident id when it opens and sends it
-- on every attempt (portal/src/lib/hs/reportIncident.ts). This proves the
-- database side of that as a real employee under RLS: the supplied id is
-- accepted, a retry meets the primary key, and the reporter can read the
-- saved report back — so a retry after a lost reply recovers the SAME
-- incident instead of filing a second. Rolled back.
--
-- Recorded 2026-09-28: 4/4 PASS — employee saves a report with the form's
-- own id; retry meets 23505 (hs_incidents_pkey); reporter reads it back
-- (INC-2026-000001); one incident exists.

DO $$
DECLARE r text := ''; n int; st text; x uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); rid uuid := gen_random_uuid();
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (x, 'Probe QA31', 'pqa31-'||left(x::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (emp, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pqa31@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE profiles SET role = 'client_user', company_id = x WHERE id = emp;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO hs_incidents (id, company_id, incident_type, title, occurred_on, description, exact_location)
    VALUES (rid, x, 'near_miss', 'QA31', current_date, 'x', 'Dock');
  r := r || 'PASS employee saves a report with the form''s own id; ';
  BEGIN
    INSERT INTO hs_incidents (id, company_id, incident_type, title, occurred_on, description, exact_location)
      VALUES (rid, x, 'near_miss', 'QA31', current_date, 'x', 'Dock');
    r := r || 'FAIL retry inserted a second row; ';
  EXCEPTION WHEN unique_violation THEN r := r || 'PASS retry meets 23505 (' || SQLERRM || '); '; END;
  SELECT incident_number INTO st FROM hs_incidents WHERE id = rid;
  r := r || CASE WHEN st IS NOT NULL THEN 'PASS' ELSE 'FAIL' END || ' reporter reads the saved report back (' || COALESCE(st,'none') || '); ';
  SELECT count(*) INTO n FROM hs_incidents WHERE company_id = x;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' one incident exists (' || n || '); ';
  RESET ROLE;
  RAISE EXCEPTION 'PROBE QA31 (rolled back): %', r;
END $$;
