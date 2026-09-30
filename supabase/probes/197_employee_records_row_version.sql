-- Live probe for migration 197 (Core-OS 360 Completion Programme,
-- Phase 28, Group 2 — the remaining slice of gap-ledger row C1.12).
-- Run inside a transaction and ROLLBACK — never commit. 5/5 checks
-- passed when this was run against project sbmekaviwkiyorvmtgcu on
-- 2026-09-30 (an empty result with no exception means every ASSERT
-- held; an ASSERT failure raises and the transaction aborts visibly).

BEGIN;

DO $$
DECLARE v_user uuid; v_company uuid; v_emp uuid; v_rv1 int; v_rv2 int; v_count int;
BEGIN
  SELECT p.id, p.company_id INTO v_user, v_company
    FROM profiles p WHERE p.role = 'client_admin' AND p.company_id IS NOT NULL LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Insert a new employee as this client_admin — row_version must be 1
  --    regardless of not being sent at all.
  INSERT INTO employee_records (company_id, full_name, job_title, start_date)
  VALUES (v_company, 'Probe Person 197', 'Tester', current_date)
  RETURNING id, row_version INTO v_emp, v_rv1;
  ASSERT v_rv1 = 1, 'check1 FAILED: fresh insert row_version should be 1, got ' || v_rv1;
  RAISE NOTICE 'check1 PASSED: fresh insert row_version = 1';

  -- 2. A caller sending an explicit, wrong row_version on UPDATE is
  --    ignored — the trigger always forces OLD+1 regardless.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE employee_records SET job_title = 'Tester v2', row_version = 999 WHERE id = v_emp RETURNING row_version INTO v_rv2;
  ASSERT v_rv2 = 2, 'check2 FAILED: caller-sent row_version=999 should be ignored, forced to OLD+1=2, got ' || v_rv2;
  RAISE NOTICE 'check2 PASSED: caller-sent row_version=999 ignored, forced to 2';

  -- 3. A conditional update using the STALE version (1, from before the
  --    update above) is a genuine no-op — 0 rows affected, no error —
  --    the exact shape EmployeeRecordsClient.tsx / OrgChartClient.tsx
  --    now rely on.
  UPDATE employee_records SET job_title = 'Stale writer' WHERE id = v_emp AND row_version = 1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'check3 FAILED: stale conditional update should affect 0 rows, affected ' || v_count;
  RAISE NOTICE 'check3 PASSED: stale conditional update affected 0 rows';

  -- 4. Confirm the stale writer's job_title did NOT land (still 'Tester v2').
  PERFORM 1 FROM employee_records WHERE id = v_emp AND job_title = 'Tester v2';
  IF NOT FOUND THEN RAISE EXCEPTION 'check4 FAILED: stale write incorrectly overwrote job_title'; END IF;
  RAISE NOTICE 'check4 PASSED: the stale write never landed, current data intact';

  -- 5. A conditional update using the CURRENT version (2) succeeds and
  --    advances to 3.
  UPDATE employee_records SET job_title = 'Fresh writer' WHERE id = v_emp AND row_version = 2 RETURNING row_version INTO v_rv2;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, 'check5a FAILED: fresh conditional update should affect 1 row, affected ' || v_count;
  ASSERT v_rv2 = 3, 'check5b FAILED: row_version should now be 3, got ' || v_rv2;
  RAISE NOTICE 'check5 PASSED: fresh conditional update succeeded, row_version now 3';

  RESET ROLE;
END $$;

ROLLBACK;
