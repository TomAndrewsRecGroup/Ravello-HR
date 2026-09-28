-- Phase 2 consultancy probe (spec §70-72, 2026-09-28): the Laws Safety
-- workflow on the safety records, as real users, one transaction that
-- always rolls back. Laws Safety (consultancy) serves ABC and XYZ; its
-- consultant holds a consultant grant into ABC only, and its read-only
-- colleague a read_only grant into ABC.
-- Expected: every line reads PASS. Recorded result at the end of the file.

DO $$
DECLARE
  r text := ''; n int; st text;
  laws uuid := gen_random_uuid(); abc uuid := gen_random_uuid(); xyz uuid := gen_random_uuid();
  owner uuid := gen_random_uuid(); cons uuid := gen_random_uuid(); ro uuid := gen_random_uuid();
  abc_adm uuid := gen_random_uuid(); xyz_adm uuid := gen_random_uuid();
  g uuid; mx uuid; hz uuid; ra uuid; inc uuid; xyz_hz uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (laws, 'Probe Laws Safety', 'p128-laws-'||left(laws::text,8), 'consultancy', true),
    (abc,  'Probe ABC Manufacturing', 'p128-abc-'||left(abc::text,8), 'direct_client', true),
    (xyz,  'Probe XYZ Construction', 'p128-xyz-'||left(xyz::text,8), 'direct_client', true);
  INSERT INTO organisation_relationships (source_organisation_id, target_organisation_id, relationship_type) VALUES
    (laws, abc, 'consultancy_client'), (laws, xyz, 'consultancy_client');
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (owner,'p128c-owner@probe.invalid'), (cons,'p128c-cons@probe.invalid'), (ro,'p128c-ro@probe.invalid'),
                 (abc_adm,'p128c-abc@probe.invalid'), (xyz_adm,'p128c-xyz@probe.invalid')) v(id, e);
  UPDATE profiles SET role = 'client_admin',  company_id = laws WHERE id = owner;
  UPDATE profiles SET role = 'client_editor', company_id = laws WHERE id IN (cons, ro);
  UPDATE profiles SET role = 'client_admin',  company_id = abc  WHERE id = abc_adm;
  UPDATE profiles SET role = 'client_admin',  company_id = xyz  WHERE id = xyz_adm;
  SELECT id INTO mx FROM risk_matrices WHERE company_id IS NULL AND is_default;
  INSERT INTO hazards (company_id, title, linked_location) VALUES (xyz, 'XYZ scaffold edge', 'Block B') RETURNING id INTO xyz_hz;

  -- the Laws owner grants
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  g := grant_organisation_access(cons, abc, 'consultant');
  PERFORM grant_organisation_access(ro, abc, 'read_only');
  RESET ROLE;

  -- the consultant, working in ABC
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM set_active_organisation(abc);
  INSERT INTO hazards (company_id, title, linked_location, status) VALUES (abc, 'Unguarded conveyor', 'Line 2', 'under_assessment') RETURNING id INTO hz;
  SELECT status INTO st FROM hazards WHERE id = hz;
  r := r || CASE WHEN st = 'under_assessment' THEN 'PASS' ELSE 'FAIL' END || ' consultant manages ABC hazards (' || st || '); ';
  INSERT INTO risk_assessments (company_id, title, risk_matrix_id) VALUES (abc, 'Conveyor RA', mx) RETURNING id INTO ra;
  INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_id, hazard_description, likelihood_before, severity_before)
    VALUES (abc, ra, hz, 'Entanglement at tail drum', 4, 4);
  r := r || 'PASS consultant drafts an ABC risk assessment; ';
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location)
    VALUES (abc, 'near_miss', 'Sleeve caught on conveyor', current_date, 'No injury', 'Line 2') RETURNING id INTO inc;
  UPDATE hs_incidents SET status = 'triage' WHERE id = inc;
  SELECT status INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'triage' THEN 'PASS' ELSE 'FAIL' END || ' consultant reports and triages an ABC incident (' || st || '); ';
  SELECT count(*) INTO n FROM hazards WHERE company_id = xyz;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' consultant in ABC sees no XYZ hazards (' || n || '); ';
  BEGIN INSERT INTO hazards (company_id, title, linked_location) VALUES (xyz, 'planted', 'x');
    r := r || 'FAIL consultant wrote into XYZ; ';
  EXCEPTION WHEN others THEN r := r || 'PASS consultant cannot write into XYZ; '; END;
  BEGIN PERFORM set_active_organisation(xyz);
    r := r || 'FAIL consultant switched into ungranted XYZ; ';
  EXCEPTION WHEN others THEN r := r || 'PASS consultant cannot switch into XYZ; '; END;
  SELECT count(*) INTO n FROM search_records('scaffold', 30);
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' search in ABC does not reach XYZ (' || n || '); ';
  SELECT count(*) INTO n FROM org_directory() WHERE user_id = xyz_adm;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' people picker holds no XYZ user; ';
  SELECT count(*) INTO n FROM org_directory() WHERE user_id IN (cons, abc_adm);
  r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' people picker holds ABC staff and the consultant (' || n || '); ';
  RESET ROLE;

  -- the read-only colleague in ABC
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ro, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM set_active_organisation(abc);
  SELECT count(*) INTO n FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' read-only grant reads ABC incidents (' || n || '); ';
  BEGIN INSERT INTO hazards (company_id, title, linked_location) VALUES (abc, 'ro hazard', 'x');
    r := r || 'FAIL read-only grant reported a hazard; ';
  EXCEPTION WHEN others THEN r := r || 'PASS read-only grant cannot write; '; END;
  UPDATE hazards SET status = 'closed' WHERE id = hz; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' read-only grant changes nothing (' || n || '); ';
  RESET ROLE;

  -- ABC's own admin sees the consultant's work; XYZ's admin does not
  PERFORM set_config('request.jwt.claims', json_build_object('sub', abc_adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hazards WHERE id = hz;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' ABC admin sees the consultant''s hazard; ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', xyz_adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hazards WHERE id = hz;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' XYZ admin cannot see ABC''s hazard; ';
  SELECT count(*) INTO n FROM risk_assessments WHERE id = ra;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' XYZ admin cannot see ABC''s risk assessment; ';
  RESET ROLE;

  -- the Laws owner revokes; the consultant loses ABC at once
  PERFORM set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM revoke_organisation_access(g);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hazards WHERE id = hz;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' revoked consultant sees nothing of ABC (' || n || '); ';
  BEGIN UPDATE hazards SET title = 'after revoke' WHERE id = hz; GET DIAGNOSTICS n = ROW_COUNT;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' revoked consultant changes nothing (' || n || '); ';
  EXCEPTION WHEN others THEN r := r || 'PASS revoked consultant refused; '; END;
  RESET ROLE;

  -- audit shows who did it and on whose behalf
  SELECT count(*) INTO n FROM audit_events WHERE organisation_id = abc AND user_id = cons AND action LIKE 'hazard.%';
  r := r || CASE WHEN n > 0 THEN 'PASS' ELSE 'FAIL' END || ' ABC audit attributes the hazard work to the consultant (' || n || '); ';

  RAISE EXCEPTION 'PROBE 128 CONSULTANCY (rolled back): %', r;
END $$;

-- Recorded 2026-09-28: 18/18 PASS —
--   consultant manages ABC hazards; drafts an ABC risk assessment; reports and triages an ABC incident;
--   sees no XYZ hazards; cannot write into XYZ; cannot switch into XYZ; search in ABC does not reach XYZ;
--   people picker holds no XYZ user and holds ABC staff + the consultant; read-only grant reads ABC incidents,
--   cannot write, changes nothing; ABC admin sees the consultant's hazard; XYZ admin sees neither the hazard nor
--   the risk assessment; revoked consultant sees and changes nothing; ABC audit attributes the work to the consultant.
