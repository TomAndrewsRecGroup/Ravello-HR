-- Probe for 093_security_followups. Ends in RAISE, so everything is
-- rolled back. Expected: every attack "blocked", every own-row edit "ok".

DO $$
DECLARE r text := '';
  client    uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
  colleague uuid := '5a3b307e-c133-449a-a8c2-7df6b2ae84fe';
  n int;
BEGIN
  -- anon
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.prune_latest_updates(30); r := r || 'anon runs prune_latest_updates: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'anon runs prune_latest_updates: blocked; '; END;
  BEGIN PERFORM 1 FROM public.bd_leads_view LIMIT 1; r := r || 'anon reads bd_leads_view: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'anon reads bd_leads_view: blocked; '; END;
  RESET ROLE;

  -- a client_admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.prune_latest_updates(30); r := r || 'client runs prune_latest_updates: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client runs prune_latest_updates: blocked; '; END;
  BEGIN UPDATE profiles SET marketing_consent = NOT coalesce(marketing_consent, false) WHERE id = colleague;
        r := r || 'set a colleague''s consent: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'set a colleague''s consent: blocked; '; END;
  BEGIN UPDATE profiles SET data_erasure_requested_at = now() WHERE id = colleague;
        r := r || 'request erasure for a colleague: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'request erasure for a colleague: blocked; '; END;
  BEGIN UPDATE profiles SET full_name = 'Renamed' WHERE id = colleague;
        r := r || 'rename a colleague: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'rename a colleague: blocked; '; END;
  BEGIN UPDATE profiles SET full_name = 'Probe Name', marketing_consent = true, onboarding_step = 2 WHERE id = client;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || 'edit own name/consent/step: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'edit own name/consent/step: FAILED ' || SQLERRM || '; '; END;
  BEGIN UPDATE profiles SET role = 'tps_admin' WHERE id = client; r := r || 'self-promote: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'self-promote: blocked; '; END;
  RESET ROLE;

  -- the cron
  SET LOCAL ROLE service_role;
  BEGIN PERFORM public.prune_latest_updates(365); r := r || 'service role runs prune: ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'service role runs prune: FAILED ' || SQLERRM || '; '; END;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
