-- Probe for 098. As a signed-in client: insert a decision as yourself
-- (ok), as someone else (blocked), write the outcome (ok), rewrite the
-- selection (blocked by the guard trigger), delete (blocked), read
-- (own rows only). As another user: read nothing, change nothing. As
-- the editor / service role: free. Ends in RAISE, so it rolls back.
--
-- Run live 2026-09-25 against production: every line as expected.

DO $$
DECLARE r text := '';
  co     uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';   -- a client company
  client uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';   -- client_admin of co
  other  uuid := gen_random_uuid();
  d uuid; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO jev_decisions (kind, company_id, actor_id, actor_kind, input_hash, state, questions, selected, confidence)
    VALUES ('hs_item_classify', co, client, 'client', 'h1', '{"title":"x"}', '{}', '{"category":"hs_fire"}', 0.9) RETURNING id INTO d;
  r := r || 'insert as self: ok; ';
  BEGIN
    INSERT INTO jev_decisions (kind, actor_id, actor_kind, input_hash, state, questions) VALUES ('hs_item_classify', other, 'client', 'h2', '{}', '{}');
    r := r || 'insert as someone else: ALLOWED (BAD); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'insert as someone else: blocked; ';
  END;
  UPDATE jev_decisions SET human_outcome = 'accepted' WHERE id = d;
  SELECT count(*) INTO n FROM jev_decisions WHERE id = d AND human_outcome = 'accepted'; r := r || 'outcome written: ' || n || '; ';
  BEGIN
    UPDATE jev_decisions SET selected = '{"category":"hs_other"}' WHERE id = d;
    r := r || 'rewrite selected: ALLOWED (BAD); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'rewrite selected: blocked; ';
  END;
  BEGIN
    DELETE FROM jev_decisions WHERE id = d;
    r := r || 'delete: ALLOWED (BAD); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'delete: blocked; ';
  END;
  SELECT count(*) INTO n FROM jev_decisions; r := r || 'client reads: ' || n || ' (own only); ';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM jev_decisions; r := r || 'another user reads: ' || n || '; ';
  UPDATE jev_decisions SET human_outcome = 'ignored' WHERE id = d;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO n FROM jev_decisions WHERE id = d AND human_outcome = 'accepted'; r := r || 'other user could not change it: ' || n || '; ';
  UPDATE jev_decisions SET selected = '{"category":"hs_gas"}' WHERE id = d;
  r := r || 'editor rewrite: ok; ';
  RAISE EXCEPTION 'PROBE RESULT: %', r;
END $$;
