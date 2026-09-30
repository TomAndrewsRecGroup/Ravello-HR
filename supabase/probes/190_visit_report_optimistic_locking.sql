-- Core-OS 360 Completion Programme, Phase 24, Group 1. Rolled back —
-- run inside BEGIN/ROLLBACK, never applied. Uses two real live
-- companies (Andrews Recruitment Group, Old Albanians Rugby) with a
-- fabricated, rolled-back consultancy_client relationship, the same
-- technique every Phase 6+ probe already uses (no live
-- organisation_relationships rows exist at rest — each prior probe's
-- own fabricated row was rolled back too).
BEGIN;
CREATE TEMP TABLE probe190_results (line text) ON COMMIT DROP;
DO $$
DECLARE
  v_consultancy uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82'; -- Andrews Recruitment Group
  v_client uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';       -- Old Albanians Rugby
  v_visit uuid; v_report uuid;
  v_ver1 int; v_ver2 int; v_cnt int;
BEGIN
  INSERT INTO organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
  VALUES (v_consultancy, v_client, 'consultancy_client', 'active', current_date);

  INSERT INTO consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
  VALUES (v_consultancy, v_client, 'other', current_date, 'planned') RETURNING id INTO v_visit;

  INSERT INTO consultancy_visit_reports (visit_id, summary) VALUES (v_visit, 'draft v1') RETURNING id, row_version INTO v_report, v_ver1;
  INSERT INTO probe190_results VALUES ('check1 row_version starts at 1: ' || (v_ver1 = 1)::text);

  -- The real save UI keys its UPDATE on `.eq('id', ...).eq('row_version', ...)`.
  UPDATE consultancy_visit_reports SET summary = 'draft v2' WHERE id = v_report AND row_version = v_ver1;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  SELECT row_version INTO v_ver2 FROM consultancy_visit_reports WHERE id = v_report;
  INSERT INTO probe190_results VALUES ('check2 first save succeeds, row_version increments to 2: ' || (v_cnt = 1 AND v_ver2 = 2)::text);

  -- A second, stale-tab save using the ORIGINAL (now stale) row_version
  -- must be a silent no-op (0 rows, no exception) — the exact shape
  -- `judgeWrite()` turns into "someone else changed this since you
  -- opened it" in the UI.
  UPDATE consultancy_visit_reports SET summary = 'stale overwrite attempt' WHERE id = v_report AND row_version = v_ver1;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  INSERT INTO probe190_results VALUES ('check3 stale save is a no-op (0 rows, no exception): ' || (v_cnt = 0)::text);

  PERFORM 1 FROM consultancy_visit_reports WHERE id = v_report AND summary = 'draft v2';
  INSERT INTO probe190_results VALUES ('check4 content still draft v2, not overwritten: ' || FOUND::text);

  -- The trigger ignores whatever row_version the caller sends — always
  -- OLD+1 — so a client cannot game the lock by sending a bogus number.
  UPDATE consultancy_visit_reports SET summary = 'cheat attempt', row_version = 999 WHERE id = v_report AND row_version = v_ver2;
  SELECT row_version INTO v_ver2 FROM consultancy_visit_reports WHERE id = v_report;
  INSERT INTO probe190_results VALUES ('check5 trigger ignores caller-sent row_version, uses OLD+1 (=3): ' || (v_ver2 = 3)::text);

  BEGIN
    UPDATE consultancy_visit_reports SET visit_id = gen_random_uuid() WHERE id = v_report;
    INSERT INTO probe190_results VALUES ('check6 visit_id change refused: FALSE (no exception raised)');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe190_results VALUES ('check6 visit_id change refused: ' || (SQLSTATE = '42501')::text);
  END;
END $$;
SELECT line FROM probe190_results ORDER BY line;
ROLLBACK;

-- Result (2026-09-30): all 6/6 checks passed. Confirmed no trace left
-- live afterward (organisation_relationships/consultancy_visits/
-- consultancy_visit_reports all 0 rows, matching the pre-probe state).
