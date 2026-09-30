-- Live rolled-back probe for migration 184 (people synced back from
-- source rows, C1.10). Run 2026-09-30 against project
-- sbmekaviwkiyorvmtgcu. 8/8 checks passed. Re-run after any future
-- change to person_sync_from_source().

BEGIN;
CREATE TEMP TABLE probe184_results (line text) ON COMMIT DROP;

DO $$
DECLARE
  v_company uuid;
  v_req uuid;
  v_cand uuid;
  v_person_c uuid;
  v_ath uuid;
  v_person_a uuid;
  v_emp uuid;
  v_person_e uuid;
  v_dept uuid;
  v_site uuid;
  v_dept2 uuid;
  v_p record;
BEGIN
  INSERT INTO companies (id, name, slug, active) VALUES (gen_random_uuid(), 'Probe184 Co', 'probe184-'||substr(gen_random_uuid()::text,1,8), true) RETURNING id INTO v_company;
  INSERT INTO requisitions (id, company_id, title, stage) VALUES (gen_random_uuid(), v_company, 'Probe184 Role', 'submitted') RETURNING id INTO v_req;

  -- 1-2. candidates: name/email/phone edit propagates; clearing to NULL
  -- preserves the existing people value (COALESCE, never a regression).
  INSERT INTO candidates (id, requisition_id, company_id, full_name, email, phone)
    VALUES (gen_random_uuid(), v_req, v_company, 'Cand Original', 'cand.orig@example.test', '0111') RETURNING id INTO v_cand;
  SELECT person_id INTO v_person_c FROM candidates WHERE id = v_cand;
  IF v_person_c IS NULL THEN
    INSERT INTO probe184_results VALUES ('SETUP FAIL: candidate got no person_id');
  ELSE
    UPDATE candidates SET full_name = 'Cand Corrected', email = 'cand.new@example.test', phone = '0222' WHERE id = v_cand;
    SELECT * INTO v_p FROM people WHERE id = v_person_c;
    IF v_p.full_name = 'Cand Corrected' AND v_p.email = 'cand.new@example.test' AND v_p.phone = '0222' THEN
      INSERT INTO probe184_results VALUES ('check1 PASS: candidate name/email/phone edit synced to people');
    ELSE
      INSERT INTO probe184_results VALUES ('check1 FAIL: name=' || v_p.full_name || ' email=' || v_p.email || ' phone=' || v_p.phone);
    END IF;

    UPDATE candidates SET email = NULL, phone = NULL WHERE id = v_cand;
    SELECT * INTO v_p FROM people WHERE id = v_person_c;
    IF v_p.email = 'cand.new@example.test' AND v_p.phone = '0222' THEN
      INSERT INTO probe184_results VALUES ('check2 PASS: clearing candidate email/phone to NULL does not blank people');
    ELSE
      INSERT INTO probe184_results VALUES ('check2 FAIL: email=' || COALESCE(v_p.email,'NULL') || ' phone=' || COALESCE(v_p.phone,'NULL'));
    END IF;
  END IF;

  -- 3. athletes: name/email edit propagates (no phone column to test).
  INSERT INTO athletes (id, company_id, full_name, email) VALUES (gen_random_uuid(), v_company, 'Ath Original', 'ath.orig@example.test') RETURNING id INTO v_ath;
  SELECT person_id INTO v_person_a FROM athletes WHERE id = v_ath;
  IF v_person_a IS NULL THEN
    INSERT INTO probe184_results VALUES ('SETUP FAIL: athlete got no person_id');
  ELSE
    UPDATE athletes SET full_name = 'Ath Corrected', email = 'ath.new@example.test' WHERE id = v_ath;
    SELECT * INTO v_p FROM people WHERE id = v_person_a;
    IF v_p.full_name = 'Ath Corrected' AND v_p.email = 'ath.new@example.test' THEN
      INSERT INTO probe184_results VALUES ('check3 PASS: athlete name/email edit synced to people');
    ELSE
      INSERT INTO probe184_results VALUES ('check3 FAIL: name=' || v_p.full_name || ' email=' || v_p.email);
    END IF;
  END IF;

  -- 4-6. employee_records: name/job_title/department_id/site_id edit
  -- propagates; clearing employee_number preserves the existing value;
  -- an unrelated column (salary) raises no error (the trigger's own
  -- column list correctly excludes it).
  INSERT INTO departments (id, company_id, name, kind) VALUES (gen_random_uuid(), v_company, 'Probe184 Dept A', 'department') RETURNING id INTO v_dept;
  INSERT INTO departments (id, company_id, name, kind) VALUES (gen_random_uuid(), v_company, 'Probe184 Dept B', 'department') RETURNING id INTO v_dept2;
  INSERT INTO hs_sites (id, company_id, name, site_type) VALUES (gen_random_uuid(), v_company, 'Probe184 Site', 'office') RETURNING id INTO v_site;

  INSERT INTO employee_records (id, company_id, full_name, email, job_title, start_date, status, department_id, employee_number)
    VALUES (gen_random_uuid(), v_company, 'Emp Original', 'emp.orig@example.test', 'Original Title', current_date, 'active', v_dept, 'EMP001')
    RETURNING id INTO v_emp;
  SELECT person_id INTO v_person_e FROM employee_records WHERE id = v_emp;
  IF v_person_e IS NULL THEN
    INSERT INTO probe184_results VALUES ('SETUP FAIL: employee got no person_id');
  ELSE
    UPDATE employee_records SET full_name = 'Emp Corrected', job_title = 'New Title', department_id = v_dept2, site_id = v_site WHERE id = v_emp;
    SELECT * INTO v_p FROM people WHERE id = v_person_e;
    IF v_p.full_name = 'Emp Corrected' AND v_p.job_title = 'New Title' AND v_p.department_id = v_dept2 AND v_p.site_id = v_site THEN
      INSERT INTO probe184_results VALUES ('check4 PASS: employee name/job_title/department_id/site_id edit synced to people');
    ELSE
      INSERT INTO probe184_results VALUES ('check4 FAIL: name=' || v_p.full_name || ' title=' || v_p.job_title || ' dept=' || COALESCE(v_p.department_id::text,'NULL') || ' site=' || COALESCE(v_p.site_id::text,'NULL'));
    END IF;

    UPDATE employee_records SET employee_number = NULL WHERE id = v_emp;
    SELECT * INTO v_p FROM people WHERE id = v_person_e;
    IF v_p.employee_number = 'EMP001' THEN
      INSERT INTO probe184_results VALUES ('check5 PASS: clearing employee_number to NULL does not blank people');
    ELSE
      INSERT INTO probe184_results VALUES ('check5 FAIL: employee_number=' || COALESCE(v_p.employee_number,'NULL'));
    END IF;

    UPDATE employee_records SET salary = 50000 WHERE id = v_emp;
    INSERT INTO probe184_results VALUES ('check6 PASS: editing an unrelated column (salary) raised no error');
  END IF;

  -- 7. editing a row with no person_id never raises (defensive path).
  BEGIN
    UPDATE candidates SET person_id = NULL WHERE id = v_cand;
    UPDATE candidates SET full_name = 'Cand Unlinked Edit' WHERE id = v_cand;
    INSERT INTO probe184_results VALUES ('check7 PASS: editing a candidate with no person_id raised no error');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe184_results VALUES ('check7 FAIL: raised ' || SQLERRM);
  END;

  -- 8. no anon/authenticated execute grant on the new function.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'person_sync_from_source' AND grantee IN ('anon','authenticated')
  ) THEN
    INSERT INTO probe184_results VALUES ('check8 FAIL: function executable by anon/authenticated');
  ELSE
    INSERT INTO probe184_results VALUES ('check8 PASS: no anon/authenticated execute grant');
  END IF;
END $$;

SELECT line FROM probe184_results ORDER BY line;
ROLLBACK;
