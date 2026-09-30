-- Live rolled-back probe for migration 183 (hs_tests.course_id mapping).
-- Run 2026-09-30 against project sbmekaviwkiyorvmtgcu. 7/7 checks passed.
-- Re-run this file (BEGIN/ROLLBACK, no data survives) to re-verify after
-- any future change to hs_tests_course_guard() or
-- hs_test_submission_after().

BEGIN;

CREATE TEMP TABLE probe183_results (line text) ON COMMIT DROP;

DO $$
DECLARE
  v_company uuid;
  v_other_company uuid;
  v_person uuid;
  v_employee uuid;
  v_global_course uuid;
  v_company_course uuid;
  v_test uuid;
  v_session uuid;
  v_assignment uuid;
  v_sub uuid;
  v_tr record;
BEGIN
  INSERT INTO companies (id, name, slug, active) VALUES (gen_random_uuid(), 'Probe183 Co A', 'probe183-a-'||substr(gen_random_uuid()::text,1,8), true) RETURNING id INTO v_company;
  INSERT INTO companies (id, name, slug, active) VALUES (gen_random_uuid(), 'Probe183 Co B', 'probe183-b-'||substr(gen_random_uuid()::text,1,8), true) RETURNING id INTO v_other_company;

  INSERT INTO training_courses (id, company_id, title, delivery_method) VALUES (gen_random_uuid(), NULL, 'Probe183 Global Fire Warden', 'classroom') RETURNING id INTO v_global_course;
  INSERT INTO training_courses (id, company_id, title, delivery_method) VALUES (gen_random_uuid(), v_other_company, 'Probe183 Co-B-only course', 'classroom') RETURNING id INTO v_company_course;

  INSERT INTO hs_tests (id, title, source_type, pass_mark, certifies_training, recert_months, course_id)
    VALUES (gen_random_uuid(), 'Probe183 Fire Warden Quiz', 'built_in', 70, true, 12, v_global_course) RETURNING id INTO v_test;
  INSERT INTO probe183_results VALUES ('check1 PASS: hs_tests.course_id accepted a global course');

  BEGIN
    UPDATE hs_tests SET course_id = v_company_course WHERE id = v_test;
    INSERT INTO probe183_results VALUES ('check2 FAIL: company-scoped course_id was accepted');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '23514' THEN
      INSERT INTO probe183_results VALUES ('check2 PASS: company-scoped course_id refused: ' || SQLERRM);
    ELSE
      INSERT INTO probe183_results VALUES ('check2 FAIL: wrong error ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
  END;

  BEGIN
    UPDATE hs_tests SET course_id = gen_random_uuid() WHERE id = v_test;
    INSERT INTO probe183_results VALUES ('check3 FAIL: unknown course_id was accepted');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '23503' THEN
      INSERT INTO probe183_results VALUES ('check3 PASS: unknown course_id refused: ' || SQLERRM);
    ELSE
      INSERT INTO probe183_results VALUES ('check3 FAIL: wrong error ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
  END;

  UPDATE hs_tests SET course_id = v_global_course WHERE id = v_test;

  INSERT INTO people (id, company_id, full_name, worker_type, employment_status)
    VALUES (gen_random_uuid(), v_company, 'Probe183 Person', 'employee', 'active') RETURNING id INTO v_person;
  INSERT INTO employee_records (id, company_id, person_id, full_name, email, job_title, start_date, status)
    VALUES (gen_random_uuid(), v_company, v_person, 'Probe183 Person', 'probe183@example.test', 'Tester', current_date, 'active') RETURNING id INTO v_employee;

  INSERT INTO hs_test_sessions (id, test_id, title) VALUES (gen_random_uuid(), v_test, 'Probe183 session') RETURNING id INTO v_session;
  INSERT INTO hs_test_assignments (id, session_id, test_id, company_id, employee_id, status)
    VALUES (gen_random_uuid(), v_session, v_test, v_company, v_employee, 'pending') RETURNING id INTO v_assignment;

  INSERT INTO hs_test_submissions (id, assignment_id, score, passed, source)
    VALUES (gen_random_uuid(), v_assignment, 85, true, 'built_in') RETURNING id INTO v_sub;

  SELECT * INTO v_tr FROM training_records WHERE employee_id = v_employee ORDER BY created_at DESC LIMIT 1;
  IF v_tr.course_id = v_global_course AND v_tr.source = 'hs_test' AND v_tr.verification_status = 'unverified' THEN
    INSERT INTO probe183_results VALUES ('check4 PASS: passed hs_test wrote training_records course_id=' || v_tr.course_id || ' source=' || v_tr.source || ' verification=' || v_tr.verification_status);
  ELSE
    INSERT INTO probe183_results VALUES ('check4 FAIL: course_id=' || COALESCE(v_tr.course_id::text,'NULL') || ' source=' || COALESCE(v_tr.source,'NULL') || ' verification=' || COALESCE(v_tr.verification_status,'NULL'));
  END IF;

  DECLARE
    v_test2 uuid; v_session2 uuid; v_assignment2 uuid; v_sub2 uuid; v_tr2 record;
  BEGIN
    INSERT INTO hs_tests (id, title, source_type, pass_mark, certifies_training) VALUES (gen_random_uuid(), 'Probe183 Unmapped Quiz', 'built_in', 70, true) RETURNING id INTO v_test2;
    INSERT INTO hs_test_sessions (id, test_id, title) VALUES (gen_random_uuid(), v_test2, 'Probe183 session 2') RETURNING id INTO v_session2;
    INSERT INTO hs_test_assignments (id, session_id, test_id, company_id, employee_id, status)
      VALUES (gen_random_uuid(), v_session2, v_test2, v_company, v_employee, 'pending') RETURNING id INTO v_assignment2;
    INSERT INTO hs_test_submissions (id, assignment_id, score, passed, source)
      VALUES (gen_random_uuid(), v_assignment2, 90, true, 'built_in') RETURNING id INTO v_sub2;
    SELECT * INTO v_tr2 FROM training_records WHERE employee_id = v_employee AND course_name = 'Probe183 Unmapped Quiz' ORDER BY created_at DESC LIMIT 1;
    IF v_tr2.course_id IS NULL AND v_tr2.source = 'hs_test' THEN
      INSERT INTO probe183_results VALUES ('check5 PASS: unmapped test still logs training_records with NULL course_id');
    ELSE
      INSERT INTO probe183_results VALUES ('check5 FAIL: course_id=' || COALESCE(v_tr2.course_id::text,'NULL'));
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_records_source_check'
      AND pg_get_constraintdef(oid) LIKE '%hs_test%'
  ) THEN
    INSERT INTO probe183_results VALUES ('check6 PASS: training_records_source_check already allows hs_test');
  ELSE
    INSERT INTO probe183_results VALUES ('check6 FAIL: constraint missing hs_test value');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name IN ('hs_tests_course_guard','hs_test_submission_after')
      AND grantee IN ('anon','authenticated')
  ) THEN
    INSERT INTO probe183_results VALUES ('check7 FAIL: a function is executable by anon/authenticated');
  ELSE
    INSERT INTO probe183_results VALUES ('check7 PASS: no anon/authenticated execute grant on either function');
  END IF;
END $$;

SELECT line FROM probe183_results ORDER BY line;

ROLLBACK;
