-- Probe for 088_security_hardening. Runs as real users through the
-- `authenticated` role and ends in RAISE, so every change is rolled back.
--
-- Expected: every attack reads "blocked", every ordinary edit "ok".
-- Before 088 (verified 2026-09-24) "self-promote" returned 1 row with
-- role = tps_admin. Against 088's first, column-list version, "reinsert
-- into other company", "rewrite own email", "set colleague invite_token"
-- and "repoint manatal id" were all ALLOWED — the adversarial review
-- reproduced each one before the guards became allow-lists.
--
-- Replace the uuids with a client_admin, a colleague in the same company,
-- their company, any other company and a tps_admin. To validate an edit
-- to 088 BEFORE applying it, paste the migration above this block and run
-- both together: the RAISE rolls the migration back too.

DO $$
DECLARE r text := '';
  client    uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
  colleague uuid := '5a3b307e-c133-449a-a8c2-7df6b2ae84fe';
  own_co    uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';
  other_co  uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82';
  staff     uuid := '3f6b51bb-d9ac-43ef-9252-ff4274143897';
  n int;
  found_id uuid;
  client_email text;
BEGIN
  -- read as the SQL-editor role, before switching: service_role has no
  -- direct grant on auth.users (only the DEFINER function does).
  SELECT email INTO client_email FROM auth.users WHERE id = client;

  -- ── as a client_admin ──────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN UPDATE profiles SET role = 'tps_admin' WHERE id = client; r := r || 'self-promote: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'self-promote: blocked; '; END;

  BEGIN UPDATE profiles SET company_id = other_co WHERE id = client; r := r || 'move company: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'move company: blocked; '; END;

  BEGIN UPDATE profiles SET role = 'tps_admin' WHERE id = colleague; r := r || 'promote colleague: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'promote colleague: blocked; '; END;

  BEGIN DELETE FROM profiles WHERE id = client; r := r || 'delete own profile: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'delete own profile: blocked; '; END;

  BEGIN DELETE FROM profiles WHERE id = colleague; r := r || 'delete colleague: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'delete colleague: blocked; '; END;

  BEGIN INSERT INTO profiles (id, email, company_id, role)
        VALUES (client, 'probe@example.invalid', other_co, 'client_admin');
        r := r || 'reinsert into other company: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'reinsert into other company: blocked; '; END;

  BEGIN UPDATE profiles SET email = 'newhire@victim.example' WHERE id = client; r := r || 'rewrite own email: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'rewrite own email: blocked; '; END;

  BEGIN UPDATE profiles SET invite_token = gen_random_uuid(), invite_token_expires_at = now() + interval '1 day' WHERE id = colleague;
        r := r || 'set colleague invite_token: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'set colleague invite_token: blocked; '; END;

  BEGIN UPDATE companies SET feature_flags = feature_flags || '{"hiring":true}'::jsonb WHERE id = own_co; r := r || 'flip flags: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'flip flags: blocked; '; END;

  BEGIN UPDATE companies SET manatal_client_id = '9999999' WHERE id = own_co; r := r || 'repoint manatal id: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'repoint manatal id: blocked; '; END;

  BEGIN UPDATE companies SET ivylens_company_id = gen_random_uuid() WHERE id = own_co; r := r || 'repoint ivylens id: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'repoint ivylens id: blocked; '; END;

  BEGIN found_id := public.auth_user_id_by_email('someone@example.invalid'); r := r || 'client calls auth_user_id_by_email: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client calls auth_user_id_by_email: blocked; '; END;

  -- ordinary edits must still work, with REAL changes (a no-op proves nothing)
  BEGIN UPDATE profiles SET full_name = 'Probe Name', ui_preferences = '{"probe":true}'::jsonb, onboarding_step = 3 WHERE id = client;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || 'edit own name/prefs/step: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'edit own name/prefs/step: FAILED ' || SQLERRM || '; '; END;

  BEGIN UPDATE companies SET name = 'Probe Co', timezone = 'Europe/Dublin', sector = 'Probe', open_days = open_days WHERE id = own_co;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || 'edit company settings: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'edit company settings: FAILED ' || SQLERRM || '; '; END;

  -- ── as staff ───────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  BEGIN UPDATE profiles SET role = 'client_editor' WHERE id = colleague;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || 'staff changes a role: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'staff changes a role: FAILED ' || SQLERRM || '; '; END;

  -- ── as the service role (invite routes, Stripe webhook) ────────────
  RESET ROLE;
  SET LOCAL ROLE service_role;
  BEGIN UPDATE profiles SET company_id = own_co, invite_token = gen_random_uuid() WHERE id = colleague;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || 'service role writes profile: ok rows=' || n || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'service role writes profile: FAILED ' || SQLERRM || '; '; END;
  BEGIN found_id := public.auth_user_id_by_email(upper(client_email));
        r := r || 'service role finds account by email: ' || CASE WHEN found_id = client THEN 'ok' ELSE 'WRONG ' || coalesce(found_id::text, 'null') END || '; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'service role finds account by email: FAILED ' || SQLERRM || '; '; END;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
