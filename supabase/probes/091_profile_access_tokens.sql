-- Probe for 091_profile_access_tokens. Ends in RAISE, so everything —
-- and the migration too, if pasted above — is rolled back.
--
-- Expected: every client attempt "blocked"; the service role "ok"; the
-- carried-over count equals the live tokens in profiles.

DO $$
DECLARE r text := '';
  client uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
  n int; live int;
BEGIN
  SELECT count(*) INTO live FROM profiles WHERE invite_token IS NOT NULL AND invite_token_expires_at > now();
  SELECT count(*) INTO n FROM profile_access_tokens;
  r := r || 'carried over ' || n || ' of ' || live || ' live tokens; ';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN PERFORM 1 FROM profile_access_tokens LIMIT 1; r := r || 'client reads tokens: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client reads tokens: blocked; '; END;

  BEGIN INSERT INTO profile_access_tokens (token_hash, profile_id, purpose, expires_at)
        VALUES (repeat('a', 64), client, 'reset', now() + interval '1 day');
        r := r || 'client mints a token: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client mints a token: blocked; '; END;

  BEGIN DELETE FROM profile_access_tokens; r := r || 'client deletes tokens: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client deletes tokens: blocked; '; END;

  RESET ROLE;
  SET LOCAL ROLE service_role;
  BEGIN INSERT INTO profile_access_tokens (token_hash, profile_id, purpose, expires_at)
        VALUES (repeat('b', 64), client, 'reset', now() + interval '1 day');
        DELETE FROM profile_access_tokens WHERE token_hash = repeat('b', 64);
        GET DIAGNOSTICS n = ROW_COUNT;
        r := r || 'service role mints and redeems: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'service role mints and redeems: FAILED ' || SQLERRM || '; '; END;

  BEGIN INSERT INTO profile_access_tokens (token_hash, profile_id, purpose, expires_at)
        VALUES ('not-a-hash', client, 'reset', now() + interval '1 day');
        r := r || 'a raw token stored as the hash: ALLOWED(!); ';
  EXCEPTION WHEN check_violation THEN r := r || 'a raw token stored as the hash: refused; '; END;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
