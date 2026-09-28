-- QA 19 (relationships survive versioning / archiving) and QA 8 (RAMS ↔
-- equipment), 2026-09-28, as client admins under RLS. Rolled back.
--
-- Recorded 2026-09-28: 7/7 PASS — client links RAMS to equipment and a
-- hazard (2); the link is owned by the client (company taken from the
-- records); v2 of the RA carries both its hazard link and the incident's
-- link forward (2); v1 keeps its own (2); v2's item keeps its hazard; an
-- archived RAMS keeps its links (archived, 2); an archived hazard keeps
-- its inbound links (3).

DO $$
DECLARE r text := ''; n int; st text;
  a uuid := gen_random_uuid(); a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
  mx uuid; v1 uuid; v2 uuid; hz uuid; inc uuid; ms uuid; eq uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (a, 'Probe QA19', 'pqa19-'||left(a::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (a1,'pqa19-a1@probe.invalid'), (a2,'pqa19-a2@probe.invalid'), (a3,'pqa19-a3@probe.invalid')) v(id, em);
  UPDATE profiles SET role = 'client_admin', company_id = a WHERE id IN (a1, a2, a3);
  SELECT id INTO mx FROM risk_matrices WHERE company_id IS NULL AND is_default;
  INSERT INTO hs_equipment (company_id, name, category) VALUES (a, 'Scissor lift SL-2', 'access') RETURNING id INTO eq;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO hazards (company_id, title, linked_location) VALUES (a, 'Work at height', 'Bay 4') RETURNING id INTO hz;
  INSERT INTO risk_assessments (company_id, title, risk_matrix_id, review_date, assessor_id) VALUES (a, 'Height RA', mx, current_date + 365, a3) RETURNING id INTO v1;
  INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_id, hazard_description, likelihood_before, severity_before, likelihood_after, severity_after)
    VALUES (a, v1, hz, 'Fall from platform', 3, 5, 1, 5);
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location) VALUES (a, 'near_miss', 'Platform gate open', current_date, 'x', 'Bay 4') RETURNING id INTO inc;
  INSERT INTO hs_links (from_type, from_id, to_type, to_id, relation) VALUES ('risk_assessment', v1, 'hazard', hz, 'related'), ('incident', inc, 'risk_assessment', v1, 'related');
  INSERT INTO method_statements (company_id, title) VALUES (a, 'Lift work') RETURNING id INTO ms;
  INSERT INTO hs_links (from_type, from_id, to_type, to_id, relation) VALUES ('method_statement', ms, 'equipment', eq, 'related'), ('method_statement', ms, 'hazard', hz, 'related');
  SELECT count(*) INTO n FROM hs_links WHERE from_type = 'method_statement' AND from_id = ms;
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' client links RAMS to equipment and hazard (' || n || '); ';
  SELECT company_id::text INTO st FROM hs_links WHERE from_id = ms AND to_type = 'equipment';
  r := r || CASE WHEN st = a::text THEN 'PASS' ELSE 'FAIL' END || ' link owned by the client (company from the records); ';
  UPDATE risk_assessments SET status = 'pending_review' WHERE id = v1;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE risk_assessments SET status = 'approved' WHERE id = v1;
  v2 := hs_new_version('risk_assessment', v1);
  SELECT count(*) INTO n FROM hs_links WHERE (from_type = 'risk_assessment' AND from_id = v2 AND to_type = 'hazard' AND to_id = hz)
                                           OR (from_type = 'incident' AND from_id = inc AND to_type = 'risk_assessment' AND to_id = v2);
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' v2 carries both links forward (' || n || '); ';
  SELECT count(*) INTO n FROM hs_links WHERE (from_id = v1 AND to_id = hz) OR (from_id = inc AND to_id = v1);
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' v1 keeps its own links (' || n || '); ';
  SELECT count(*) INTO n FROM risk_assessment_items WHERE risk_assessment_id = v2 AND hazard_id = hz;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' v2 item keeps its hazard; ';
  UPDATE method_statements SET status = 'archived' WHERE id = ms;
  SELECT status INTO st FROM method_statements WHERE id = ms;
  SELECT count(*) INTO n FROM hs_links WHERE from_type = 'method_statement' AND from_id = ms;
  r := r || CASE WHEN st = 'archived' AND n = 2 THEN 'PASS' ELSE 'FAIL' END || ' archived RAMS keeps its links (' || st || ', ' || n || '); ';
  UPDATE hazards SET status = 'archived' WHERE id = hz;
  SELECT count(*) INTO n FROM hs_links WHERE to_id = hz;
  r := r || CASE WHEN n >= 3 THEN 'PASS' ELSE 'FAIL' END || ' archived hazard keeps inbound links (' || n || '); ';
  RESET ROLE;
  RAISE EXCEPTION 'PROBE QA19 (rolled back): %', r;
END $$;
