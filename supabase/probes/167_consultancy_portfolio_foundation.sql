-- Rolled-back live probe for migration 167 (Core-OS 360 Phase 6, Group 1:
-- consultancy portfolio access foundation). Simulated-session technique
-- (142/146/149/151/152) since has_capability()/portfolio_organisations()
-- need a real auth.uid() throughout, not just around a bare call.

BEGIN;

DO $$
DECLARE
  r text[] := '{}';
  consultancy uuid; client_a uuid; client_b uuid; client_c uuid;
  rel_a uuid; rel_b uuid;
  consultant_user uuid := gen_random_uuid();
  n int;
  scope_hs boolean; scope_hr boolean;
BEGIN
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe167 Laws Safety', 'probe167-laws', 'consultancy') RETURNING id INTO consultancy;
  INSERT INTO public.companies (name, slug) VALUES ('Probe167 Client A', 'probe167-client-a') RETURNING id INTO client_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe167 Client B (expired rel)', 'probe167-client-b') RETURNING id INTO client_b;
  INSERT INTO public.companies (name, slug) VALUES ('Probe167 Client C (no access)', 'probe167-client-c') RETURNING id INTO client_c;

  -- rel_a: live, current. rel_b: relationship itself has already ENDED —
  -- this is the exact cascade gap 167 closes.
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status)
    VALUES (consultancy, client_a, 'consultancy_client', 'active') RETURNING id INTO rel_a;
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status)
    VALUES (consultancy, client_b, 'consultancy_client', 'ended') RETURNING id INTO rel_b;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (consultant_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p167-consultant@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET company_id = consultancy, role = 'client_editor' WHERE id = consultant_user;

  -- Grant against client_a (live relationship) and client_b (dead
  -- relationship) — both grants themselves are otherwise perfectly
  -- valid rows (active_status='active', no valid_until). client_c has
  -- no grant at all.
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, via_relationship_id)
    VALUES (consultant_user, client_a, 'consultant', 'full', 'active', rel_a);
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, via_relationship_id)
    VALUES (consultant_user, client_b, 'consultant', 'health_safety', 'active', rel_b);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. my_organisations() must include client_a, must NOT include
  --    client_b (its relationship ended) or client_c (no grant at all).
  SELECT count(*) INTO n FROM my_organisations() WHERE organisation_id = client_a;
  r := array_append(r, format('1a. my_organisations includes client_a: %s', n = 1));
  SELECT count(*) INTO n FROM my_organisations() WHERE organisation_id = client_b;
  r := array_append(r, format('1b. my_organisations EXCLUDES client_b (dead relationship): %s', n = 0));
  SELECT count(*) INTO n FROM my_organisations() WHERE organisation_id = client_c;
  r := array_append(r, format('1c. my_organisations EXCLUDES client_c (no grant): %s', n = 0));

  -- 2. portfolio_organisations() mirrors the same cascade (SECURITY
  --    INVOKER, must never see more than my_organisations() would).
  SELECT count(*) INTO n FROM portfolio_organisations() WHERE organisation_id = client_a;
  r := array_append(r, format('2a. portfolio_organisations includes client_a: %s', n = 1));
  SELECT count(*) INTO n FROM portfolio_organisations() WHERE organisation_id = client_b;
  r := array_append(r, format('2b. portfolio_organisations EXCLUDES client_b: %s', n = 0));
  SELECT count(*) INTO n FROM portfolio_organisations() WHERE organisation_id = consultancy;
  r := array_append(r, format('2c. portfolio_organisations excludes home (consultancy itself): %s', n = 0));
  SELECT count(*) INTO n FROM portfolio_organisations();
  r := array_append(r, format('2d. portfolio_organisations total row count is exactly 1 (client_a only): %s', n = 1));

  -- 3. set_active_organisation refuses client_b (dead relationship),
  --    even though the grant row itself says active_status='active'.
  BEGIN
    PERFORM set_active_organisation(client_b);
    r := array_append(r, '3. set_active_organisation(client_b) refused: false (WRONGLY SUCCEEDED)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('3. set_active_organisation(client_b) refused: %s (%s)', SQLSTATE = '42501', SQLERRM));
  END;

  -- 4. set_active_organisation succeeds for client_a and has_capability
  --    resolves true for a health_safety-relevant capability while
  --    acting there.
  PERFORM set_active_organisation(client_a);
  SELECT has_capability(client_a, 'risk.read') INTO scope_hs;
  r := array_append(r, format('4. active in client_a, has_capability(risk.read): %s', scope_hs));

  -- 5. access_scope enforcement: switch to client_b's scope shape by
  --    checking access_scope_allows directly (client_b's own grant was
  --    'health_safety'-scoped) — hr.sensitive.read must be refused,
  --    risk.read allowed, under a health_safety scope.
  SELECT access_scope_allows('health_safety', 'hr.sensitive.read') INTO scope_hr;
  r := array_append(r, format('5a. health_safety scope refuses hr.sensitive.read: %s', NOT scope_hr));
  SELECT access_scope_allows('health_safety', 'risk.read') INTO scope_hs;
  r := array_append(r, format('5b. health_safety scope allows risk.read: %s', scope_hs));
  SELECT access_scope_allows('full', 'hr.sensitive.read') INTO scope_hr;
  r := array_append(r, format('5c. full scope allows hr.sensitive.read: %s', scope_hr));

  -- 6. grant_relationship_current() directly: NULL is always current
  --    (a direct/staff grant), a live relationship is current, a dead
  --    one is not.
  r := array_append(r, format('6a. grant_relationship_current(NULL): %s', grant_relationship_current(NULL)));
  r := array_append(r, format('6b. grant_relationship_current(rel_a, live): %s', grant_relationship_current(rel_a)));
  r := array_append(r, format('6c. grant_relationship_current(rel_b, ended): %s', NOT grant_relationship_current(rel_b)));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 7. New capability seeded and granted to both consultancy roles.
  SELECT count(*) INTO n FROM access_role_capabilities WHERE capability_key = 'consultancy.service_manage' AND role_key IN ('consultancy_owner','consultant');
  r := array_append(r, format('7. consultancy.service_manage granted to both consultancy roles: %s', n = 2));

  RAISE NOTICE '%', array_to_string(r, E'\n');
END $$;

ROLLBACK;
