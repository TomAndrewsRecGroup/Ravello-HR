-- Live rolled-back probe for migration 185
-- (consultancy_visits_lifecycle_guard, Core-OS 360 Completion Programme
-- Phase 22, closes C4.13)
--
-- Run 2026-09-30 against project sbmekaviwkiyorvmtgcu. 12/12 checks passed.

BEGIN;

CREATE TEMP TABLE probe185_results (line text) ON COMMIT DROP;

DO $$
DECLARE
  v_consultancy uuid;
  v_client uuid;
  v_rel uuid;
  v_visit uuid;
  v_visit2 uuid;
  v_err text;
BEGIN
  -- Use two real, already-related live organisations so the visit's own
  -- consultancy_visit_guard() (168) is satisfied without inventing a new
  -- relationship row.
  SELECT source_organisation_id, target_organisation_id, id
    INTO v_consultancy, v_client, v_rel
    FROM organisation_relationships
    WHERE relationship_type = 'consultancy' AND status = 'active'
    LIMIT 1;

  IF v_consultancy IS NULL THEN
    INSERT INTO probe185_results VALUES ('SETUP FAIL: no live active consultancy relationship found');
  ELSE
    -- 1. a plain insert defaults to planned.
    INSERT INTO consultancy_visits (id, consultancy_organisation_id, client_organisation_id, visit_date, visit_type)
      VALUES (gen_random_uuid(), v_consultancy, v_client, current_date, 'site_visit')
      RETURNING id INTO v_visit;
    IF (SELECT status FROM consultancy_visits WHERE id = v_visit) = 'planned' THEN
      INSERT INTO probe185_results VALUES ('check1 PASS: visit inserted at default status planned');
    ELSE
      INSERT INTO probe185_results VALUES ('check1 FAIL');
    END IF;

    -- 2. planned -> in_progress succeeds (the real startVisit() path, skipping confirmed).
    BEGIN
      UPDATE consultancy_visits SET status = 'in_progress' WHERE id = v_visit;
      INSERT INTO probe185_results VALUES ('check2 PASS: planned -> in_progress succeeded');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe185_results VALUES ('check2 FAIL: ' || SQLERRM);
    END;

    -- 3. in_progress -> awaiting_report succeeds (finishCapturing()).
    BEGIN
      UPDATE consultancy_visits SET status = 'awaiting_report' WHERE id = v_visit;
      INSERT INTO probe185_results VALUES ('check3 PASS: in_progress -> awaiting_report succeeded');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe185_results VALUES ('check3 FAIL: ' || SQLERRM);
    END;

    -- 4. awaiting_report -> in_progress refused (backward jump).
    BEGIN
      UPDATE consultancy_visits SET status = 'in_progress' WHERE id = v_visit;
      INSERT INTO probe185_results VALUES ('check4 FAIL: backward jump was not refused');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = RETURNED_SQLSTATE;
      IF v_err = '23514' THEN
        INSERT INTO probe185_results VALUES ('check4 PASS: awaiting_report -> in_progress refused (ERRCODE 23514)');
      ELSE
        INSERT INTO probe185_results VALUES ('check4 FAIL: wrong errcode ' || v_err);
      END IF;
    END;

    -- 5. awaiting_report -> report_issued succeeds (report-issue route's own advance).
    BEGIN
      UPDATE consultancy_visits SET status = 'report_issued' WHERE id = v_visit;
      INSERT INTO probe185_results VALUES ('check5 PASS: awaiting_report -> report_issued succeeded');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe185_results VALUES ('check5 FAIL: ' || SQLERRM);
    END;

    -- 6. report_issued -> closed succeeds.
    BEGIN
      UPDATE consultancy_visits SET status = 'closed' WHERE id = v_visit;
      INSERT INTO probe185_results VALUES ('check6 PASS: report_issued -> closed succeeded');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe185_results VALUES ('check6 FAIL: ' || SQLERRM);
    END;

    -- 7. closed -> cancelled refused (closed is terminal).
    BEGIN
      UPDATE consultancy_visits SET status = 'cancelled' WHERE id = v_visit;
      INSERT INTO probe185_results VALUES ('check7 FAIL: closed -> cancelled was not refused');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = RETURNED_SQLSTATE;
      IF v_err = '23514' THEN
        INSERT INTO probe185_results VALUES ('check7 PASS: closed -> cancelled refused (terminal state)');
      ELSE
        INSERT INTO probe185_results VALUES ('check7 FAIL: wrong errcode ' || v_err);
      END IF;
    END;

    -- 8. a fresh visit: planned -> cancelled succeeds (call-off before starting).
    INSERT INTO consultancy_visits (id, consultancy_organisation_id, client_organisation_id, visit_date, visit_type)
      VALUES (gen_random_uuid(), v_consultancy, v_client, current_date, 'site_visit')
      RETURNING id INTO v_visit2;
    BEGIN
      UPDATE consultancy_visits SET status = 'cancelled' WHERE id = v_visit2;
      INSERT INTO probe185_results VALUES ('check8 PASS: planned -> cancelled succeeded (fresh second visit)');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe185_results VALUES ('check8 FAIL: ' || SQLERRM);
    END;

    -- 9. cancelled -> planned refused (cancelled is terminal too).
    BEGIN
      UPDATE consultancy_visits SET status = 'planned' WHERE id = v_visit2;
      INSERT INTO probe185_results VALUES ('check9 FAIL: cancelled -> planned was not refused');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = RETURNED_SQLSTATE;
      IF v_err = '23514' THEN
        INSERT INTO probe185_results VALUES ('check9 PASS: cancelled -> planned refused (cancelled is terminal)');
      ELSE
        INSERT INTO probe185_results VALUES ('check9 FAIL: wrong errcode ' || v_err);
      END IF;
    END;

    -- 10. re-writing the SAME status twice (double-click simulation) is never blocked.
    BEGIN
      UPDATE consultancy_visits SET status = 'cancelled' WHERE id = v_visit2;
      INSERT INTO probe185_results VALUES ('check10 PASS: re-writing the same status is never blocked');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO probe185_results VALUES ('check10 FAIL: ' || SQLERRM);
    END;

    -- 11. planned -> report_issued refused (impossible skip-ahead jump), fresh visit.
    DECLARE
      v_visit3 uuid;
    BEGIN
      INSERT INTO consultancy_visits (id, consultancy_organisation_id, client_organisation_id, visit_date, visit_type)
        VALUES (gen_random_uuid(), v_consultancy, v_client, current_date, 'site_visit')
        RETURNING id INTO v_visit3;
      BEGIN
        UPDATE consultancy_visits SET status = 'report_issued' WHERE id = v_visit3;
        INSERT INTO probe185_results VALUES ('check11 FAIL: planned -> report_issued was not refused');
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err = RETURNED_SQLSTATE;
        IF v_err = '23514' THEN
          INSERT INTO probe185_results VALUES ('check11 PASS: planned -> report_issued refused (impossible skip-ahead jump)');
        ELSE
          INSERT INTO probe185_results VALUES ('check11 FAIL: wrong errcode ' || v_err);
        END IF;
      END;
    END;
  END IF;

  -- 12. no anon/authenticated execute grant on the new function.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'consultancy_visits_lifecycle_guard' AND grantee IN ('anon','authenticated')
  ) THEN
    INSERT INTO probe185_results VALUES ('check12 FAIL: function executable by anon/authenticated');
  ELSE
    INSERT INTO probe185_results VALUES ('check12 PASS: no anon/authenticated execute grant');
  END IF;
END $$;

SELECT line FROM probe185_results ORDER BY line;
ROLLBACK;
