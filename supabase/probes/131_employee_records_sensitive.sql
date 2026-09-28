-- Migration 131 probe (employee_records sensitive columns, hotfix), 2026-09-28.
-- Run as: BEGIN; <131_employee_records_sensitive_columns.sql>; <this DO block>; ROLLBACK;
-- before apply, and the DO block alone afterwards. Always rolled back by
-- the RAISE.
-- Client A: admin adm, employee emp, editor ed. From a home company:
-- site manager sm (grant on A) and xa, a home client_admin holding an
-- organisation_editor grant on A (RLS lets them UPDATE A's rows, but they
-- hold no hr.sensitive.write there). Client B: admin bu. Staff: st.
--
-- Recorded 2026-09-28 against 131 inside BEGIN … ROLLBACK, before apply:
-- 24/24 PASS. Run 1 was 19/3: the "non-HR updater" fixture (xa) could not
-- UPDATE at all, because a grant resolves to its legacy role and the
-- UPDATE policy needs client_admin — so no such writer exists today. The
-- probe now asserts that fact, and exercises the guard by removing
-- hr.sensitive.write from organisation_admin inside the transaction.

DO $$
DECLARE r text := ''; n int; s text; v numeric; rec record;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); home uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); ed uuid := gen_random_uuid();
  sm uuid := gen_random_uuid(); xa uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); stf uuid := gen_random_uuid();
  w uuid; wp uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a, 'Probe 131 A', 'p131-a-'||left(a::text,8), 'direct_client', true),
    (b, 'Probe 131 B', 'p131-b-'||left(b::text,8), 'direct_client', true),
    (home, 'Probe 131 Home', 'p131-h-'||left(home::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (adm,'p131-adm@probe.invalid'), (emp,'p131-emp@probe.invalid'), (ed,'p131-ed@probe.invalid'),
                 (sm,'p131-sm@probe.invalid'), (xa,'p131-xa@probe.invalid'), (bu,'p131-bu@probe.invalid'),
                 (stf,'p131-st@probe.invalid')) v(id, em);
  UPDATE profiles SET role = 'client_admin',  company_id = a WHERE id = adm;
  UPDATE profiles SET role = 'client_user',   company_id = a WHERE id = emp;
  UPDATE profiles SET role = 'client_editor', company_id = a WHERE id = ed;
  UPDATE profiles SET role = 'client_user',   company_id = home WHERE id = sm;
  UPDATE profiles SET role = 'client_admin',  company_id = home WHERE id = xa;
  UPDATE profiles SET role = 'client_admin',  company_id = b WHERE id = bu;
  UPDATE profiles SET role = 'tps_admin',     company_id = NULL WHERE id = stf;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (sm, a, 'site_manager'), (xa, a, 'organisation_editor');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (sm, a), (xa, a);

  -- ── The admin records an employee with full HR detail (guard allows: hr.sensitive.write) ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO employee_records (company_id, full_name, email, job_title, start_date, salary, ni_number, tax_code, date_of_birth,
                                gender, ethnicity, address, emergency_name, notes)
    VALUES (a, 'Probe Worker', 'p131-worker@probe.invalid', 'Operative', current_date - 100, 95000, 'QQ123456C', '1257L', '1980-01-01',
            'female', 'x', '1 Street', 'Kin', 'private note') RETURNING id, person_id INTO w, wp;
  r := r || CASE WHEN w IS NOT NULL THEN 'PASS' ELSE 'FAIL' END || ' admin inserts with HR detail, RETURNING safe columns; ';
  BEGIN
    INSERT INTO employee_records (company_id, full_name, job_title, start_date) VALUES (a, 'Probe Two', 'Op', current_date) RETURNING * INTO rec;
    r := r || 'FAIL RETURNING * allowed; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS RETURNING * refused (so clients must name columns); ';
  END;
  SELECT salary INTO v FROM employee_private_fields(a, ARRAY[w]);
  SELECT ni_number INTO s FROM employee_private_fields(a);
  r := r || CASE WHEN v = 95000 AND s = 'QQ123456C' THEN 'PASS' ELSE 'FAIL' END || ' admin reads salary + NI through the function; ';
  UPDATE employee_records SET salary = 96000 WHERE id = w;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' admin may change salary; ';
  RESET ROLE;

  -- ── The attack: an ordinary employee of the same client ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT salary INTO v FROM employee_records WHERE id = w;
    r := r || 'FAIL employee read salary=' || COALESCE(v::text,'null') || '; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot select salary; ';
  END;
  BEGIN
    SELECT ni_number INTO s FROM employee_records WHERE id = w;
    r := r || 'FAIL employee read NI; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot select NI; ';
  END;
  BEGIN
    SELECT date_of_birth::text INTO s FROM employee_records WHERE id = w;
    r := r || 'FAIL employee read DOB; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot select DOB; ';
  END;
  BEGIN
    PERFORM * FROM employee_records;
    r := r || 'FAIL employee select * allowed; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot select *; ';
  END;
  BEGIN
    SELECT count(*) INTO n FROM employee_records WHERE salary > 50000;  -- inference by filter
    r := r || 'FAIL employee can filter on salary; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot filter on salary; ';
  END;
  SELECT full_name || '/' || job_title INTO s FROM employee_records WHERE id = w;
  r := r || CASE WHEN s = 'Probe Worker/Operative' THEN 'PASS' ELSE 'FAIL' END || ' employee still reads name + job title; ';
  SELECT (NOT hr_visible AND salary IS NULL AND ni_number IS NULL AND date_of_birth IS NULL AND gender IS NULL
          AND address IS NULL AND emergency_name IS NULL AND notes IS NULL AND leave_token IS NULL)::text INTO s
    FROM employee_private_fields(a, ARRAY[w]);
  r := r || CASE WHEN s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' function gives the employee nothing sensitive; ';
  SELECT count(*) INTO n FROM people WHERE id = wp;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' people_read (derivative) still works; ';
  SELECT count(*) INTO n FROM search_records('Probe Worker') WHERE entity_type = 'employee';
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' search still finds the employee; ';
  RESET ROLE;

  -- ── Editor: manages leave links, not HR data ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ed, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT (leave_token IS NOT NULL AND salary IS NULL AND NOT hr_visible)::text INTO s FROM employee_private_fields(a, ARRAY[w]);
  r := r || CASE WHEN s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' editor gets the leave link but no salary; ';
  RESET ROLE;

  -- ── Site manager under a grant: names, not HR ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM employee_records WHERE id = w;
  SELECT (NOT hr_visible AND salary IS NULL AND leave_token IS NULL)::text INTO s FROM employee_private_fields(a, ARRAY[w]);
  r := r || CASE WHEN n = 1 AND s = 'true' THEN 'PASS' ELSE 'FAIL' END || ' site manager sees the row, not the HR fields; ';
  RESET ROLE;

  -- ── Write guard. Today no writer lacks hr.sensitive.write: the UPDATE
  --    policy needs client_admin, and a grant resolves to its legacy role,
  --    so xa (organisation_editor grant) cannot update at all. ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', xa, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE employee_records SET job_title = 'x' WHERE id = w;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' an editor grant cannot update the row at all (' || n || '); ';
  RESET ROLE;
  -- To exercise the guard, take hr.sensitive.write away from the admin
  -- role inside this rolled-back transaction: the widening it exists for.
  DELETE FROM access_role_capabilities WHERE role_key = 'organisation_admin' AND capability_key = 'hr.sensitive.write';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE employee_records SET salary = 1 WHERE id = w;
    r := r || 'FAIL writer without hr.sensitive.write changed salary; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS writer without hr.sensitive.write cannot change salary; ';
  END;
  BEGIN
    UPDATE employee_records SET leave_token = 'forged' WHERE id = w;
    r := r || 'FAIL writer without hr.sensitive.write set a leave token; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS writer without hr.sensitive.write cannot set a leave token; ';
  END;
  BEGIN
    INSERT INTO employee_records (company_id, full_name, job_title, start_date, ni_number) VALUES (a, 'Probe Three', 'Op', current_date, 'QQ000000A');
    r := r || 'FAIL writer without hr.sensitive.write inserted an NI number; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS writer without hr.sensitive.write cannot insert an NI number; ';
  END;
  UPDATE employee_records SET job_title = 'Senior Operative' WHERE id = w;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO employee_records (company_id, full_name, job_title, start_date) VALUES (a, 'Probe Four', 'Op', current_date);
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' ...but may still change a job title and add a plain record; ';
  RESET ROLE;
  INSERT INTO access_role_capabilities (role_key, capability_key) VALUES ('organisation_admin', 'hr.sensitive.write');

  -- ── Another client ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM employee_private_fields(a);
  SELECT n + count(*) INTO n FROM employee_records WHERE company_id = a;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' client B sees nothing of A (' || n || '); ';
  RESET ROLE;

  -- ── Staff ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stf, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT salary INTO v FROM employee_private_fields(a, ARRAY[w]);
  r := r || CASE WHEN v = 96000 THEN 'PASS' ELSE 'FAIL' END || ' staff read salary through the function; ';
  RESET ROLE;

  -- ── anon ──
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM employee_records;
    r := r || 'FAIL anon may select; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS anon cannot select; ';
  END;
  RESET ROLE;

  -- ── Service role / owner path unchanged ──
  SELECT salary INTO v FROM employee_records WHERE id = w;
  UPDATE employee_records SET notes = 'server note' WHERE id = w;
  r := r || CASE WHEN v = 96000 THEN 'PASS' ELSE 'FAIL' END || ' server-side reads and writes are unaffected; ';

  RAISE EXCEPTION 'PROBE 131: % PASS / % FAIL :: %',
    (length(r) - length(replace(r, 'PASS', ''))) / 4, (length(r) - length(replace(r, 'FAIL', ''))) / 4, r;
END $$;
