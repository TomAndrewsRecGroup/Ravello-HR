-- Rolled-back live probe for migration 169 (Core-OS 360 Phase 6,
-- Group 3: Client Service Ledger). Simulated-session technique.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.probe169() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  consultancy uuid; client_a uuid; stranger uuid;
  rel_a uuid;
  consultant_user uuid := gen_random_uuid();
  client_user uuid := gen_random_uuid();
  n int;
  entry_id uuid;
BEGIN
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe169 Laws Safety', 'probe169-laws', 'consultancy') RETURNING id INTO consultancy;
  INSERT INTO public.companies (name, slug) VALUES ('Probe169 Client A', 'probe169-client-a') RETURNING id INTO client_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe169 Stranger', 'probe169-stranger') RETURNING id INTO stranger;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status)
    VALUES (consultancy, client_a, 'consultancy_client', 'active') RETURNING id INTO rel_a;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (consultant_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p169-consultant@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET company_id = consultancy, role = 'client_editor' WHERE id = consultant_user;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, via_relationship_id)
    VALUES (consultant_user, client_a, 'consultant', 'full', 'active', rel_a);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (client_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p169-client@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET company_id = client_a, role = 'client_admin' WHERE id = client_user;

  -- Seed one entry as the service role (mirroring what the automated
  -- consumer does) so read-policy checks below have a row to find.
  INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary, source_type, source_id)
    VALUES (consultancy, client_a, 'audit', 'Fire safety walk-round', 'hs_audits', gen_random_uuid()) RETURNING id INTO entry_id;

  -- 1. Re-inserting the SAME (consultancy, client, source_type,
  --    source_id) as the service role is refused by the UNIQUE
  --    constraint itself — the real idempotency guard, not a courtesy.
  BEGIN
    INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary, source_type, source_id)
      VALUES (consultancy, client_a, 'audit', 'Duplicate attempt', 'hs_audits', (SELECT source_id FROM consultancy_service_ledger WHERE id = entry_id));
    RETURN NEXT '1. duplicate (consultancy, client, source) refused: false (WRONGLY SUCCEEDED)';
  EXCEPTION WHEN unique_violation THEN
    RETURN NEXT '1. duplicate (consultancy, client, source) refused: true';
  END;

  -- 2. Two DIFFERENT manual entries (source_id NULL both times) succeed
  --    — NULL never collides with NULL under a plain UNIQUE constraint.
  INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary)
    VALUES (consultancy, client_a, 'manual', 'Phone call with the client');
  INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary)
    VALUES (consultancy, client_a, 'manual', 'Second phone call');
  SELECT count(*) INTO n FROM consultancy_service_ledger WHERE entry_type = 'manual' AND client_organisation_id = client_a;
  RETURN NEXT format('2. two manual entries both inserted (NULL <> NULL): %s', n = 2);

  -- 3. The consultant (portfolio-wide, no switch needed) can read the
  --    ledger for their authorised client and add a manual entry.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO n FROM consultancy_service_ledger WHERE client_organisation_id = client_a;
  RETURN NEXT format('3a. consultant reads the ledger without switching active org: %s', n = 3);

  BEGIN
    INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary, created_by)
      VALUES (consultancy, client_a, 'manual', 'Consultant-logged note', consultant_user);
    RETURN NEXT '3b. consultant manual insert succeeds: true';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('3b. consultant manual insert succeeds: false (%s)', SQLERRM);
  END;

  -- 4. The consultant CANNOT insert a fake "automated" entry (entry_type
  --    <> 'manual', or a source_id set) — that path is service-role
  --    only, by policy.
  BEGIN
    INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary, source_type, source_id, created_by)
      VALUES (consultancy, client_a, 'audit', 'Forged audit entry', 'hs_audits', gen_random_uuid(), consultant_user);
    RETURN NEXT '4. consultant cannot forge an automated-shaped entry: false (WRONGLY SUCCEEDED)';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('4. consultant cannot forge an automated-shaped entry: %s', SQLSTATE = '42501');
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 5. The client can read their own ledger, read-only.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM consultancy_service_ledger WHERE id = entry_id;
  RETURN NEXT format('5a. client reads its own ledger entry: %s', n = 1);
  BEGIN
    UPDATE consultancy_service_ledger SET summary = 'tampered' WHERE id = entry_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN NEXT format('5b. client cannot write the ledger: %s', n = 0);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT '5b. client cannot write the ledger: true (raised)';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 6. actions.created_by_admin is now in the outbox whitelist — a
  --    fresh action's own event payload carries it.
  DECLARE act_id uuid; payload_new jsonb;
  BEGIN
    INSERT INTO public.actions (company_id, title, action_type, status, priority, created_by_admin)
      VALUES (client_a, 'Probe169 test action', 'compliance_update', 'active', 'normal', true) RETURNING id INTO act_id;
    SELECT payload -> 'new' INTO payload_new FROM platform_events
     WHERE entity_type = 'actions' AND entity_id = act_id AND event_type = 'created'
     ORDER BY id DESC LIMIT 1;
    RETURN NEXT format('6. actions outbox payload carries created_by_admin=true: %s', (payload_new ->> 'created_by_admin') = 'true');
  END;

  RETURN NEXT format('7. RLS is enabled on consultancy_service_ledger: %s',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consultancy_service_ledger'::regclass));
END $$;

SELECT * FROM pg_temp.probe169();
