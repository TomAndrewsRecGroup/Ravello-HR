-- Phase 1 tenancy probe (117-119). Creates the spec's test tenancy —
-- Results 2026-09-26: first run found `actions` had no client INSERT
-- policy (fixed by 120). Second run: 72 PASS, 2 FAIL — both the probe's
-- own mistake (it asserted a client could replace a document file; no
-- client UPDATE policy on documents exists, by design). Those two
-- assertions were corrected to the real rule and re-run in isolation:
-- 2/2 PASS. Staff-side versioning: 119_document_versions.sql, 8/8 PASS.
-- Laws Safety (consultancy) serving ABC Manufacturing and XYZ
-- Construction, plus Independent Engineering Ltd — with real auth users,
-- runs every isolation / escalation / lifecycle check as `authenticated`
-- with forged JWT claims, then RAISEs so EVERYTHING is rolled back.
-- Nothing here is ever committed: these are test fixtures, not data.
-- Expected: every line reads PASS.

DO $$
DECLARE
  r text := ''; n int; ok boolean; v uuid; g_abc uuid; g_xyz uuid;
  laws uuid := gen_random_uuid(); abc uuid := gen_random_uuid(); xyz uuid := gen_random_uuid(); ind uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid(); u_owner uuid := gen_random_uuid(); u_cons uuid := gen_random_uuid();
  u_ro uuid := gen_random_uuid(); u_abc uuid := gen_random_uuid(); u_xyz uuid := gen_random_uuid(); u_ind uuid := gen_random_uuid();
  emp_abc uuid; emp_xyz uuid; emp_laws uuid; act_xyz uuid; act_abc uuid; doc_abc uuid;
BEGIN
  -- ── fixtures (as the migration owner) ──────────────────────────────
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (laws, 'Probe Laws Safety', 'probe-laws-'||left(laws::text,8), 'consultancy', true),
    (abc,  'Probe ABC Manufacturing', 'probe-abc-'||left(abc::text,8), 'direct_client', true),
    (xyz,  'Probe XYZ Construction', 'probe-xyz-'||left(xyz::text,8), 'direct_client', true),
    (ind,  'Probe Independent Engineering Ltd', 'probe-ind-'||left(ind::text,8), 'direct_client', true);
  INSERT INTO organisation_relationships (source_organisation_id, target_organisation_id, relationship_type) VALUES
    (laws, abc, 'consultancy_client'), (laws, xyz, 'consultancy_client');
  INSERT INTO hs_sites (company_id, name, site_type) VALUES
    (abc, 'ABC Plant', 'factory'), (xyz, 'XYZ Construction Site', 'construction_site'), (ind, 'Independent Workshop', 'workshop');

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (u_admin,'probe-admin@probe.invalid'), (u_owner,'probe-owner@probe.invalid'), (u_cons,'probe-cons@probe.invalid'),
                 (u_ro,'probe-ro@probe.invalid'), (u_abc,'probe-abc@probe.invalid'), (u_xyz,'probe-xyz@probe.invalid'),
                 (u_ind,'probe-ind@probe.invalid')) AS x(id, e);
  UPDATE profiles SET role = 'tps_admin', company_id = NULL WHERE id = u_admin;
  UPDATE profiles SET role = 'client_admin',  company_id = laws, full_name = 'Laws Owner' WHERE id = u_owner;
  UPDATE profiles SET role = 'client_editor', company_id = laws, full_name = 'Steve Consultant' WHERE id = u_cons;
  UPDATE profiles SET role = 'client_editor', company_id = laws, full_name = 'Read Only Consultant' WHERE id = u_ro;
  UPDATE profiles SET role = 'client_admin',  company_id = abc,  full_name = 'ABC Admin' WHERE id = u_abc;
  UPDATE profiles SET role = 'client_editor', company_id = xyz,  full_name = 'XYZ HSE Manager' WHERE id = u_xyz;
  UPDATE profiles SET role = 'client_admin',  company_id = ind,  full_name = 'Independent Admin' WHERE id = u_ind;

  INSERT INTO employee_records (company_id, full_name, email, job_title, start_date) VALUES
    (abc, 'Probe ABC Employee', 'emp@abc.invalid', 'Operator', current_date) RETURNING id INTO emp_abc;
  INSERT INTO employee_records (company_id, full_name, email, job_title, start_date) VALUES
    (xyz, 'Probe XYZ Employee', 'emp@xyz.invalid', 'Labourer', current_date) RETURNING id INTO emp_xyz;
  INSERT INTO employee_records (company_id, full_name, email, job_title, start_date) VALUES
    (laws, 'Probe Laws Internal', 'int@laws.invalid', 'Consultant', current_date) RETURNING id INTO emp_laws;
  INSERT INTO people (company_id, full_name, worker_type) VALUES (abc, 'Probe ABC Contractor', 'contractor');
  INSERT INTO actions (company_id, action_type, title, priority, status) VALUES (abc, 'manual', 'Probe ABC action', 'normal', 'active')
    RETURNING id INTO act_abc;
  INSERT INTO actions (company_id, action_type, title, priority, status) VALUES (xyz, 'manual', 'Probe XYZ action', 'normal', 'active')
    RETURNING id INTO act_xyz;
  INSERT INTO documents (company_id, name, category, file_path, version, status, requires_approval)
    VALUES (abc, 'Probe ABC policy', 'policy', abc::text || '/policy-v1.pdf', 1, 'active', false) RETURNING id INTO doc_abc;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES
    ('documents', abc::text || '/probe-secret.pdf', u_abc), ('documents', xyz::text || '/probe-secret.pdf', u_xyz);
  r := r || 'fixtures ok; ';

  -- ── staff grants the Laws owner nothing; the owner grants their consultant ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := r || CASE WHEN my_home_role_key() = 'consultancy_owner' THEN 'PASS' ELSE 'FAIL' END || ' Laws client_admin maps to consultancy_owner; ';
  g_abc := grant_organisation_access(u_cons, abc, 'consultant');
  g_xyz := grant_organisation_access(u_cons, xyz, 'consultant');
  PERFORM grant_organisation_access(u_ro, abc, 'read_only');
  r := r || 'PASS owner granted consultant ABC+XYZ, read-only ABC; ';
  BEGIN PERFORM grant_organisation_access(u_cons, ind, 'consultant'); r := r || 'FAIL owner granted a non-client; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS owner cannot grant a client Laws does not serve; '; END;
  BEGIN PERFORM grant_organisation_access(u_cons, abc, 'organisation_admin'); r := r || 'FAIL owner granted org admin; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS owner cannot grant a non-consultancy role; '; END;
  BEGIN PERFORM grant_organisation_access(u_abc, abc, 'consultant'); r := r || 'FAIL owner granted an outsider; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS owner cannot grant someone outside Laws; '; END;
  RESET ROLE;

  -- ── the consultant ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM employee_records WHERE company_id IN (abc, xyz, ind);
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' consultant at home sees no client employees ('||n||'); ';
  SELECT count(*) INTO n FROM my_organisations();
  r := r || CASE WHEN n = 3 THEN 'PASS' ELSE 'FAIL' END || ' switcher offers Laws+ABC+XYZ ('||n||'); ';
  PERFORM set_active_organisation(abc);
  SELECT count(*) INTO n FROM employee_records;          r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' consultant→ABC sees ABC employee only ('||n||'); ';
  SELECT count(*) INTO n FROM employee_records WHERE id IN (emp_xyz, emp_laws);
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' consultant→ABC sees no XYZ / Laws-internal employee; ';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'documents' AND name LIKE '%probe-secret.pdf';
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' consultant→ABC reads ABC file only ('||n||'); ';
  BEGIN INSERT INTO actions (company_id, action_type, title, priority, status) VALUES (xyz, 'manual', 'wrong client', 'normal', 'active');
    r := r || 'FAIL consultant→ABC created an XYZ action; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS consultant→ABC cannot create against XYZ; '; END;
  UPDATE actions SET title = 'hijack' WHERE id = act_xyz; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' consultant→ABC UPDATE XYZ action by uuid: rows='||n||'; ';
  DELETE FROM actions WHERE id = act_xyz; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' consultant→ABC DELETE XYZ action by uuid: rows='||n||'; ';
  INSERT INTO actions (company_id, action_type, title, priority, status) VALUES (abc, 'manual', 'Consultant finding', 'high', 'active');
  r := r || 'PASS consultant→ABC creates an ABC action; ';
  PERFORM set_active_organisation(xyz);
  SELECT count(*) INTO n FROM employee_records; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' consultant→XYZ sees XYZ only ('||n||'); ';
  SELECT count(*) INTO n FROM employee_records WHERE id = emp_abc; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' after switch no ABC row remains visible; ';
  BEGIN PERFORM set_active_organisation(ind); r := r || 'FAIL consultant switched into Independent; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS consultant→Independent denied; '; END;
  BEGIN PERFORM grant_organisation_access(u_cons, ind, 'consultant'); r := r || 'FAIL consultant granted self; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS consultant cannot grant self; '; END;
  BEGIN PERFORM grant_organisation_access(u_ro, xyz, 'consultant'); r := r || 'FAIL consultant granted colleague; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS consultant (not owner) cannot grant; '; END;
  BEGIN INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (u_cons, ind, 'consultant');
    r := r || 'FAIL direct grant insert; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS direct grant INSERT refused; '; END;
  BEGIN INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (u_cons, ind) ON CONFLICT (user_id) DO UPDATE SET organisation_id = ind;
    r := r || 'FAIL direct active-org write; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS direct active-org write refused; '; END;
  BEGIN UPDATE profiles SET company_id = abc WHERE id = u_cons; r := r || 'FAIL consultant moved own company; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS consultant cannot change own company_id; '; END;
  BEGIN UPDATE profiles SET role = 'tps_admin' WHERE id = u_cons; r := r || 'FAIL consultant self-promoted; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS consultant cannot self-promote; '; END;
  r := r || CASE WHEN get_my_role() = 'client_editor' AND NOT is_company_super_user() THEN 'PASS' ELSE 'FAIL' END
          || ' consultant grant = editor, not client super-user; ';
  PERFORM set_active_organisation(abc);
  RESET ROLE;

  -- ── the read-only consultant ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_ro, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM set_active_organisation(abc);
  SELECT count(*) INTO n FROM actions; r := r || CASE WHEN n >= 1 THEN 'PASS' ELSE 'FAIL' END || ' read-only reads ABC actions ('||n||'); ';
  BEGIN INSERT INTO actions (company_id, action_type, title, priority, status) VALUES (abc, 'manual', 'ro write', 'normal', 'active');
    r := r || 'FAIL read-only inserted; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS read-only INSERT refused; '; END;
  UPDATE actions SET title = 'ro edit' WHERE id = act_abc; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' read-only UPDATE rows='||n||'; ';
  DELETE FROM employee_records WHERE id = emp_abc; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' read-only DELETE rows='||n||'; ';
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documents', abc::text || '/ro-upload.pdf', u_ro);
    r := r || 'FAIL read-only uploaded a file; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS read-only file upload refused; '; END;
  RESET ROLE;

  -- ── ABC client admin ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_abc, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM employee_records WHERE company_id <> abc; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' ABC→other employees=0; ';
  SELECT count(*) INTO n FROM companies; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' ABC sees one company ('||n||'); ';
  SELECT count(*) INTO n FROM organisations; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' ABC organisations view=1; ';
  SELECT count(*) INTO n FROM organisation_relationships; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' ABC sees only Laws→ABC relationship ('||n||'); ';
  SELECT count(*) INTO n FROM user_organisation_access; r := r || CASE WHEN n = 2 THEN 'PASS' ELSE 'FAIL' END || ' ABC admin sees the 2 grants into ABC ('||n||'); ';
  SELECT count(*) INTO n FROM people WHERE company_id <> abc; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' ABC sees no other-org people; ';
  SELECT count(*) INTO n FROM people WHERE company_id = abc; r := r || CASE WHEN n >= 3 THEN 'PASS' ELSE 'FAIL' END || ' ABC sees own employee+contractor+self persons ('||n||'); ';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'documents' AND name = xyz::text || '/probe-secret.pdf';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' ABC cannot read XYZ file by guessed path; ';
  SELECT count(*) INTO n FROM search_records('Probe', 100) WHERE organisation_id IS DISTINCT FROM abc;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' ABC search returns ABC only (leaks='||n||'); ';
  BEGIN INSERT INTO actions (company_id, action_type, title, priority, status) VALUES (xyz, 'manual', 'x', 'normal', 'active');
    r := r || 'FAIL ABC wrote into XYZ; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS ABC cannot INSERT into XYZ; '; END;
  UPDATE employee_records SET job_title = 'x' WHERE id = emp_xyz; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' ABC UPDATE XYZ employee rows='||n||'; ';
  BEGIN PERFORM set_active_organisation(xyz); r := r || 'FAIL ABC switched to XYZ; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS ABC cannot switch to XYZ; '; END;
  BEGIN PERFORM grant_organisation_access(u_abc, xyz, 'consultant'); r := r || 'FAIL ABC granted itself XYZ; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS ABC cannot grant itself access; '; END;
  BEGIN UPDATE profiles SET role = 'tps_admin' WHERE id = u_abc; r := r || 'FAIL ABC self-promoted; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS ABC admin → platform admin refused; '; END;
  BEGIN UPDATE audit_events SET action = 'x.y' WHERE true; r := r || 'FAIL audit edited; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS audit UPDATE refused; '; END;
  BEGIN DELETE FROM audit_events WHERE true; r := r || 'FAIL audit deleted; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS audit DELETE refused; '; END;
  -- action lifecycle
  UPDATE actions SET status = 'complete' WHERE id = act_abc;
  BEGIN UPDATE actions SET verified_at = now() WHERE id = act_abc; r := r || 'FAIL self-verified; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS completer cannot verify own action; '; END;
  -- documents: a client has no UPDATE policy (pre-existing: only staff
  -- replace files), so versioning is proven as staff in
  -- 119_document_versions.sql. Here: the client cannot replace a file.
  UPDATE documents SET file_path = abc::text || '/policy-v2.pdf' WHERE id = doc_abc; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' client cannot replace a document file (rows='||n||'); ';
  SELECT count(*) INTO n FROM document_versions WHERE document_id = doc_abc;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' client sees its v1 version row ('||n||'); ';
  RESET ROLE;

  -- ── Independent client ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_ind, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM employee_records WHERE company_id IN (abc, xyz, laws);
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' Independent sees no Laws/client data; ';
  SELECT count(*) INTO n FROM organisation_relationships; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' Independent sees no Laws relationships; ';
  RESET ROLE;

  -- ── XYZ HSE manager cannot see Laws internal ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_xyz, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM employee_records WHERE id = emp_laws; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' XYZ→Laws internal denied; ';
  SELECT count(*) INTO n FROM user_organisation_access; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' XYZ editor sees no grants ('||n||'); ';
  RESET ROLE;

  -- ── revocation, expiry, role change ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM revoke_organisation_access(g_abc);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := r || CASE WHEN my_company_id() = laws THEN 'PASS' ELSE 'FAIL' END || ' revoked: consultant falls back to Laws at once; ';
  SELECT count(*) INTO n FROM employee_records WHERE id = emp_abc; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' revoked: ABC data gone; ';
  BEGIN PERFORM set_active_organisation(abc); r := r || 'FAIL switched back into revoked ABC; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS cannot re-enter revoked ABC; '; END;
  PERFORM set_active_organisation(xyz);
  RESET ROLE;
  UPDATE user_organisation_access SET valid_from = now() - interval '2 days', valid_until = now() - interval '1 day' WHERE id = g_xyz;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := r || CASE WHEN my_company_id() = laws THEN 'PASS' ELSE 'FAIL' END || ' expired grant: falls back to Laws; ';
  SELECT count(*) INTO n FROM employee_records WHERE id = emp_xyz; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' expired grant: XYZ data gone; ';
  RESET ROLE;
  UPDATE user_organisation_access SET valid_until = now() + interval '7 days', role_key = 'read_only' WHERE id = g_xyz;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_cons, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := r || CASE WHEN my_company_id() = xyz THEN 'PASS' ELSE 'FAIL' END || ' temporary grant (7 days) live again; ';
  r := r || CASE WHEN NOT session_can_write() THEN 'PASS' ELSE 'FAIL' END || ' role changed to read_only takes effect; ';
  RESET ROLE;

  -- ── audit trail recorded the story; nobody can erase it ──
  SELECT count(*) INTO n FROM audit_events WHERE action IN ('access.created','access.updated') AND organisation_id IN (abc, xyz);
  r := r || CASE WHEN n >= 4 THEN 'PASS' ELSE 'FAIL' END || ' grants/revocation audited ('||n||'); ';
  SELECT count(*) INTO n FROM audit_events WHERE action = 'organisation.switched' AND user_id = u_cons;
  r := r || CASE WHEN n >= 3 THEN 'PASS' ELSE 'FAIL' END || ' switches audited ('||n||'); ';
  SELECT count(*) INTO n FROM audit_events WHERE action = 'employee.created' AND organisation_id = abc;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' employee creation audited; ';
  SELECT count(*) INTO n FROM audit_events WHERE entity_type = 'employee_records' AND new_value ? 'salary';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' no salary in the audit trail; ';
  SET LOCAL ROLE service_role;
  BEGIN DELETE FROM audit_events WHERE organisation_id = abc; r := r || 'FAIL service role erased audit; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS service role cannot erase audit; '; END;
  RESET ROLE;
  BEGIN DELETE FROM audit_events WHERE organisation_id = abc; r := r || 'FAIL owner erased audit; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS even the owner cannot erase audit (trigger); '; END;

  -- ── people: no login needed; employee ↔ person ↔ login separate ──
  SELECT count(*) INTO n FROM people p WHERE p.id = (SELECT person_id FROM employee_records WHERE id = emp_abc) AND p.user_id IS NULL;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' employee person without a login; ';
  SELECT count(*) INTO n FROM people WHERE user_id = u_cons AND worker_type = 'consultant';
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' consultant login linked to a consultant person; ';

  -- ── anon ──
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM companies; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' anon companies=0; ';
  BEGIN SELECT count(*) INTO n FROM people; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' anon people='||n||'; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS anon people refused; '; END;
  BEGIN PERFORM set_active_organisation(abc); r := r || 'FAIL anon switched; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS anon cannot switch; '; END;
  RESET ROLE;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
