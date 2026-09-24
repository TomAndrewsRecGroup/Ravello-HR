-- Probe for 088_security_hardening. Runs as a real client user through the
-- `authenticated` role and ends in RAISE, so every change is rolled back.
-- Expected: the four attacks read "blocked", the two ordinary edits "ok".
-- Before 088 (verified 2026-09-24) "self-promote" returned 1 row with
-- role = tps_admin.
--
-- Replace the uuids with a client_admin, a colleague in the same company,
-- their company, and any other company.

DO $$
DECLARE r text := '';
  client    uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
  colleague uuid := '5a3b307e-c133-449a-a8c2-7df6b2ae84fe';
  own_co    uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';
  other_co  uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82';
  n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN UPDATE profiles SET role='tps_admin' WHERE id=client; r := r || 'self-promote: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'self-promote: blocked; '; END;

  BEGIN UPDATE profiles SET company_id=other_co WHERE id=client; r := r || 'move company: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'move company: blocked; '; END;

  BEGIN UPDATE profiles SET role='tps_admin' WHERE id=colleague; r := r || 'promote colleague: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'promote colleague: blocked; '; END;

  BEGIN UPDATE companies SET feature_flags = feature_flags || '{"hiring":true}'::jsonb WHERE id=own_co; r := r || 'flip flags: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'flip flags: blocked; '; END;

  BEGIN UPDATE profiles SET full_name = full_name WHERE id=client; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'edit own name: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'edit own name: FAILED ' || SQLERRM || '; '; END;

  BEGIN UPDATE companies SET timezone = timezone, name = name WHERE id=own_co; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'edit company settings: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'edit company settings: FAILED ' || SQLERRM || '; '; END;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
