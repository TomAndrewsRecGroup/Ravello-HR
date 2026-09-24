-- Probe for 094 + 095. Builds a throwaway provider (with a real auth user
-- and profile), assigns it to ONE client for the 'register' scope, then
-- acts as that provider, as a client and as anon. Ends in RAISE, so
-- everything — and the migrations, if pasted above — rolls back.
--
-- Expected: every "blocked"/"0 rows" line as written, every "ok" ok.

DO $$
DECLARE r text := '';
  own_co    uuid := '23526e83-afc1-4c6e-85d6-ab7d42dc0709';   -- assigned client
  other_co  uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82';   -- not assigned
  client    uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';   -- client_admin of own_co
  prov_user uuid := gen_random_uuid();
  prov      uuid;
  item      uuid;
  other_item uuid;
  n int; d date; st text;
BEGIN
  -- setup, as the SQL editor
  INSERT INTO auth.users (id, email, aud, role) VALUES (prov_user, 'probe-provider@example.invalid', 'authenticated', 'authenticated');
  INSERT INTO hs_providers (name, provider_type) VALUES ('Probe Safety Ltd', 'consultancy') RETURNING id INTO prov;
  UPDATE profiles SET role = 'hs_provider', company_id = NULL, hs_provider_id = prov WHERE id = prov_user;
  INSERT INTO hs_provider_companies (provider_id, company_id, scopes) VALUES (prov, own_co, ARRAY['register']);
  INSERT INTO compliance_items (company_id, title, category, due_date) VALUES (other_co, 'Other co fire RA', 'hs_fire', current_date) RETURNING id INTO other_item;

  -- ── as the provider ────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', prov_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO n FROM public.hs_my_companies();
  r := r || 'provider sees ' || n || ' client(s) (want 1); ';
  SELECT count(*) INTO n FROM public.hs_my_companies() WHERE company_id = other_co;
  r := r || 'unassigned client in list: ' || n || '; ';
  SELECT count(*) INTO n FROM companies;          r := r || 'companies rows: ' || n || '; ';
  SELECT count(*) INTO n FROM employee_records;   r := r || 'employee_records rows: ' || n || '; ';
  SELECT count(*) INTO n FROM profiles;           r := r || 'profiles rows: ' || n || ' (own only); ';
  SELECT count(*) INTO n FROM compliance_items WHERE company_id = other_co;
  r := r || 'other client register rows: ' || n || '; ';

  BEGIN INSERT INTO compliance_items (company_id, title, category, due_date, recurrence_every, recurrence_unit)
        VALUES (own_co, 'Fire risk assessment', 'hs_fire', current_date, 12, 'month') RETURNING id INTO item;
        r := r || 'add H&S item to assigned client: ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'add H&S item to assigned client: FAILED ' || SQLERRM || '; '; END;

  SELECT source INTO st FROM compliance_items WHERE id = item;
  r := r || 'item source: ' || coalesce(st, 'null') || '; ';

  BEGIN INSERT INTO compliance_items (company_id, title, category, due_date) VALUES (own_co, 'Payroll audit', 'hr_payroll', current_date);
        r := r || 'add HR item: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'add HR item: blocked; '; END;

  BEGIN INSERT INTO compliance_items (company_id, title, category, due_date) VALUES (other_co, 'X', 'hs_fire', current_date);
        r := r || 'add item to unassigned client: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'add item to unassigned client: blocked; '; END;

  BEGIN INSERT INTO hs_register_completions (item_id, company_id, completed_on) VALUES (item, other_co, current_date);
        r := r || 'complete own item (claiming other company): ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'complete own item: FAILED ' || SQLERRM || '; '; END;
  SELECT due_date, status::text INTO d, st FROM compliance_items WHERE id = item;
  r := r || 'item rolled to ' || d || ' ' || st || '; ';
  SELECT count(*) INTO n FROM hs_register_completions WHERE item_id = item AND company_id = own_co;
  r := r || 'completion stored against item''s real company: ' || n || '; ';

  BEGIN INSERT INTO hs_register_completions (item_id, company_id, completed_on) VALUES (other_item, other_co, current_date);
        r := r || 'complete unassigned client''s item: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'complete unassigned client''s item: blocked; '; END;

  BEGIN UPDATE hs_register_completions SET outcome = 'fail' WHERE item_id = item; r := r || 'edit a completion: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'edit a completion: blocked; '; END;

  BEGIN INSERT INTO hs_events (company_id, entity_type, event_type, summary, actor_kind) VALUES (own_co, 'x', 'forged', 'forged', 'staff');
        r := r || 'forge a timeline event: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'forge a timeline event: blocked; '; END;
  BEGIN DELETE FROM hs_events WHERE company_id = own_co; r := r || 'erase timeline: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'erase timeline: blocked; '; END;

  SELECT count(*) INTO n FROM hs_events WHERE company_id = own_co;
  r := r || 'timeline events for assigned client: ' || n || '; ';

  BEGIN INSERT INTO hs_activities (company_id, activity_type, title, occurred_on) VALUES (own_co, 'site_visit', 'Quarterly visit', current_date);
        r := r || 'log a site visit: ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'log a site visit: FAILED ' || SQLERRM || '; '; END;

  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('hs-evidence', own_co || '/register_item/' || item || '/a-cert.pdf');
        r := r || 'upload evidence (register): ok; ';
  EXCEPTION WHEN OTHERS THEN r := r || 'upload evidence (register): FAILED ' || SQLERRM || '; '; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('hs-evidence', own_co || '/training/' || gen_random_uuid() || '/x.pdf');
        r := r || 'upload evidence outside scope (training): ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'upload evidence outside scope (training): blocked; '; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('hs-evidence', other_co || '/register_item/' || other_item || '/x.pdf');
        r := r || 'upload evidence to unassigned client: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'upload evidence to unassigned client: blocked; '; END;

  BEGIN UPDATE profiles SET hs_provider_id = NULL WHERE id = prov_user; r := r || 'provider unlinks itself: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'provider unlinks itself: blocked; '; END;
  BEGIN UPDATE hs_provider_companies SET scopes = ARRAY['register','incidents'] WHERE provider_id = prov;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || 'provider widens own scopes: rows=' || n || '; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'provider widens own scopes: blocked; '; END;

  -- ── as the client ──────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM hs_events WHERE company_id = own_co;   r := r || 'client sees own timeline: ' || n || '; ';
  SELECT count(*) INTO n FROM hs_events WHERE company_id = other_co; r := r || 'client sees other timeline: ' || n || '; ';
  SELECT count(*) INTO n FROM hs_providers;                          r := r || 'client sees assigned providers: ' || n || '; ';
  BEGIN INSERT INTO hs_register_completions (item_id, company_id, completed_on) VALUES (item, own_co, current_date);
        r := r || 'client records a completion: ALLOWED(!); ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client records a completion: blocked; '; END;
  BEGIN DELETE FROM compliance_items WHERE id = item; GET DIAGNOSTICS n = ROW_COUNT;
        r := r || 'client deletes an H&S item: rows=' || n || '; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'client deletes an H&S item: blocked; '; END;

  -- ── provider deactivated ───────────────────────────────────────────
  RESET ROLE;
  UPDATE hs_providers SET active = false WHERE id = prov;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', prov_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM compliance_items; r := r || 'deactivated provider sees items: ' || n || '; ';

  -- ── anon ───────────────────────────────────────────────────────────
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN SELECT count(*) INTO n FROM hs_events; r := r || 'anon reads timeline: rows=' || n || '; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'anon reads timeline: blocked; '; END;

  RAISE EXCEPTION 'PROBE RESULT (rolled back): %', r;
END $$;
