-- Live rolled-back probe for migration 186
-- (environmental_monitoring lower/range-bound limits, Core-OS 360
-- Completion Programme Phase 22, closes C5.3)
--
-- Run 2026-09-30 against project sbmekaviwkiyorvmtgcu. 12/12 checks passed.

BEGIN;

CREATE TEMP TABLE probe186_results (line text) ON COMMIT DROP;
GRANT INSERT, SELECT ON probe186_results TO authenticated;

DO $$
DECLARE
  v_company uuid;
  v_row record;
  v_err text;
BEGIN
  SELECT id INTO v_company FROM companies LIMIT 1;

  -- 1. Existing behaviour preserved: no direction specified -> defaults to 'upper',
  --    identical to the pre-186 formula.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, recorded_limit)
    VALUES (v_company, 'noise', 'Boundary noise', 65, 'dB', 70) RETURNING * INTO v_row;
  IF v_row.limit_direction = 'upper' AND v_row.within_limit = true THEN
    INSERT INTO probe186_results VALUES ('check1 PASS: default upper direction, 65<=70 -> within_limit true');
  ELSE
    INSERT INTO probe186_results VALUES ('check1 FAIL: direction=' || v_row.limit_direction || ' within=' || COALESCE(v_row.within_limit::text,'NULL'));
  END IF;

  -- 2. upper exceedance still works exactly as before.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, recorded_limit)
    VALUES (v_company, 'noise', 'Boundary noise', 80, 'dB', 70) RETURNING * INTO v_row;
  IF v_row.within_limit = false THEN
    INSERT INTO probe186_results VALUES ('check2 PASS: upper exceedance, 80>70 -> within_limit false');
  ELSE
    INSERT INTO probe186_results VALUES ('check2 FAIL');
  END IF;

  -- 3. no limit on file -> NULL, never defaulted.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit)
    VALUES (v_company, 'noise', 'Boundary noise', 50, 'dB') RETURNING * INTO v_row;
  IF v_row.within_limit IS NULL THEN
    INSERT INTO probe186_results VALUES ('check3 PASS: no limit on file -> within_limit NULL');
  ELSE
    INSERT INTO probe186_results VALUES ('check3 FAIL');
  END IF;

  -- 4. lower-bound: value below minimum -> exceedance (false).
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction, recorded_limit)
    VALUES (v_company, 'water', 'Minimum flow rate', 5, 'l/s', 'lower', 10) RETURNING * INTO v_row;
  IF v_row.within_limit = false THEN
    INSERT INTO probe186_results VALUES ('check4 PASS: lower bound, 5<10 minimum -> within_limit false');
  ELSE
    INSERT INTO probe186_results VALUES ('check4 FAIL');
  END IF;

  -- 5. lower-bound: value meets minimum -> true.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction, recorded_limit)
    VALUES (v_company, 'water', 'Minimum flow rate', 15, 'l/s', 'lower', 10) RETURNING * INTO v_row;
  IF v_row.within_limit = true THEN
    INSERT INTO probe186_results VALUES ('check5 PASS: lower bound, 15>=10 minimum -> within_limit true');
  ELSE
    INSERT INTO probe186_results VALUES ('check5 FAIL');
  END IF;

  -- 6. range: within both bounds -> true.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction, recorded_limit, recorded_limit_upper)
    VALUES (v_company, 'water', 'pH', 7.2, 'pH', 'range', 6.5, 8.5) RETURNING * INTO v_row;
  IF v_row.within_limit = true THEN
    INSERT INTO probe186_results VALUES ('check6 PASS: range, 7.2 within [6.5,8.5] -> within_limit true');
  ELSE
    INSERT INTO probe186_results VALUES ('check6 FAIL');
  END IF;

  -- 7. range: outside upper bound -> false.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction, recorded_limit, recorded_limit_upper)
    VALUES (v_company, 'water', 'pH', 9.0, 'pH', 'range', 6.5, 8.5) RETURNING * INTO v_row;
  IF v_row.within_limit = false THEN
    INSERT INTO probe186_results VALUES ('check7 PASS: range, 9.0 outside [6.5,8.5] -> within_limit false');
  ELSE
    INSERT INTO probe186_results VALUES ('check7 FAIL');
  END IF;

  -- 8. range: only lower bound on file (upper NULL) -> NULL.
  INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction, recorded_limit)
    VALUES (v_company, 'water', 'pH', 7.2, 'pH', 'range', 6.5) RETURNING * INTO v_row;
  IF v_row.within_limit IS NULL THEN
    INSERT INTO probe186_results VALUES ('check8 PASS: range with only lower bound on file -> within_limit NULL');
  ELSE
    INSERT INTO probe186_results VALUES ('check8 FAIL');
  END IF;

  -- 9. range: inverted bounds refused.
  BEGIN
    INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction, recorded_limit, recorded_limit_upper)
      VALUES (v_company, 'water', 'pH', 7.2, 'pH', 'range', 8.5, 6.5);
    INSERT INTO probe186_results VALUES ('check9 FAIL: inverted range was not refused');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = RETURNED_SQLSTATE;
    IF v_err = '23514' THEN
      INSERT INTO probe186_results VALUES ('check9 PASS: inverted range refused (ERRCODE 23514)');
    ELSE
      INSERT INTO probe186_results VALUES ('check9 FAIL: wrong errcode ' || v_err);
    END IF;
  END;

  -- 10. an invalid limit_direction value is refused by the CHECK.
  BEGIN
    INSERT INTO environmental_monitoring (company_id, category, parameter, value, unit, limit_direction)
      VALUES (v_company, 'water', 'pH', 7.2, 'pH', 'sideways');
    INSERT INTO probe186_results VALUES ('check10 FAIL: invalid direction was not refused');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe186_results VALUES ('check10 PASS: invalid limit_direction refused');
  END;

  -- 11. no new function is anon/authenticated-executable.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'environmental_monitoring_range_guard' AND grantee IN ('anon','authenticated')
  ) THEN
    INSERT INTO probe186_results VALUES ('check11 FAIL: range_guard executable by anon/authenticated');
  ELSE
    INSERT INTO probe186_results VALUES ('check11 PASS: range_guard not executable by anon/authenticated');
  END IF;

  -- 12. table remains insert-only (no UPDATE grant to authenticated).
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_name = 'environmental_monitoring' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) THEN
    INSERT INTO probe186_results VALUES ('check12 FAIL: UPDATE grant exists on authenticated');
  ELSE
    INSERT INTO probe186_results VALUES ('check12 PASS: no UPDATE grant to authenticated (still insert-only)');
  END IF;
END $$;
SELECT line FROM probe186_results ORDER BY line;
ROLLBACK;
