-- Live rolled-back probe for migration 180 (Phase 14, Group 3).
-- Proves workforce_employee_sync()'s extended "leaving" branch revokes
-- an active worker QR badge the moment employee_records reaches
-- 'terminated' — the real defect this migration fixes: a leaver's
-- badge previously stayed scannable indefinitely.
--
-- Mutation-tested in this session (not reproduced here): reverting to
-- the pre-180 function body and re-running this probe left the badge
-- active after termination (active_count > 0), confirming the probe
-- actually exercises the fix rather than passing vacuously.

BEGIN;

DO $$
DECLARE
  co uuid; person_a uuid; tok text := repeat('c', 64); er_id uuid;
  active_count int;
BEGIN
  INSERT INTO companies (id, name, slug)
    VALUES (gen_random_uuid(), 'Leaver Test Co', 'leaver-test-co-' || substr(gen_random_uuid()::text, 1, 8)) RETURNING id INTO co;
  INSERT INTO people (id, company_id, full_name, worker_type)
    VALUES (gen_random_uuid(), co, 'Leaver Worker', 'employee') RETURNING id INTO person_a;
  INSERT INTO worker_qr_tokens (person_id, token_hash) VALUES (person_a, tok);

  active_count := (SELECT count(*) FROM worker_qr_tokens WHERE person_id = person_a AND revoked_at IS NULL);
  ASSERT active_count = 1, 'setup failed: expected 1 active token, got %', active_count;
  RAISE NOTICE 'setup passed (badge active before termination)';

  INSERT INTO employee_records (id, company_id, full_name, job_title, start_date, annual_leave_allowance, leave_token, person_id, status)
    VALUES (gen_random_uuid(), co, 'Leaver Worker', 'Groundworker', current_date - interval '1 year', 28,
            encode(gen_random_bytes(16), 'hex'), person_a, 'active')
    RETURNING id INTO er_id;

  active_count := (SELECT count(*) FROM worker_qr_tokens WHERE person_id = person_a AND revoked_at IS NULL);
  ASSERT active_count = 1, 'still active after a non-terminated insert: got %', active_count;
  RAISE NOTICE 'check1 passed (badge unaffected by an ordinary active employee_records row)';

  UPDATE employee_records SET status = 'terminated', end_date = current_date WHERE id = er_id;

  active_count := (SELECT count(*) FROM worker_qr_tokens WHERE person_id = person_a AND revoked_at IS NULL);
  ASSERT active_count = 0, 'check2 FAILED: badge still active after termination, got %', active_count;
  RAISE NOTICE 'check2 passed (badge revoked the moment employee_records reaches terminated)';

  ASSERT (SELECT revoked_at FROM worker_qr_tokens WHERE person_id = person_a) IS NOT NULL, 'check3 failed';
  RAISE NOTICE 'check3 passed (revoked_at is stamped)';

  RAISE EXCEPTION 'ALL CHECKS PASSED — rolling back';
END $$;

ROLLBACK;
