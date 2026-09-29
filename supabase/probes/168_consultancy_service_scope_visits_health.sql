-- Rolled-back live probe for migration 168 (Core-OS 360 Phase 6, Group 2:
-- service scope, consultancy visits, client_health_snapshots columns).
-- Simulated-session technique (142/146/149/151/152/167).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.probe168() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  consultancy uuid; client_a uuid; client_b_ended uuid; other_co uuid;
  rel_a uuid;
  consultant_user uuid := gen_random_uuid();
  site_a uuid; site_other uuid;
  owner_person uuid; owner_person_wrong_co uuid;
  n int;
  scope_id uuid; visit_id uuid;
  ok boolean; err text;
BEGIN
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe168 Laws Safety', 'probe168-laws', 'consultancy') RETURNING id INTO consultancy;
  INSERT INTO public.companies (name, slug) VALUES ('Probe168 Client A', 'probe168-client-a') RETURNING id INTO client_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe168 Client B (ended)', 'probe168-client-b') RETURNING id INTO client_b_ended;
  INSERT INTO public.companies (name, slug) VALUES ('Probe168 Other Co', 'probe168-other') RETURNING id INTO other_co;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status)
    VALUES (consultancy, client_a, 'consultancy_client', 'active') RETURNING id INTO rel_a;
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status)
    VALUES (consultancy, client_b_ended, 'consultancy_client', 'ended');

  INSERT INTO public.hs_sites (company_id, name) VALUES (client_a, 'Probe168 Site A') RETURNING id INTO site_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (other_co, 'Probe168 Other Site') RETURNING id INTO site_other;

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (consultancy, 'Probe168 Owner', 'employee', 'active') RETURNING id INTO owner_person;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (other_co, 'Probe168 Wrong Co Owner', 'employee', 'active') RETURNING id INTO owner_person_wrong_co;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (consultant_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p168-consultant@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET company_id = consultancy, role = 'client_editor' WHERE id = consultant_user;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, via_relationship_id)
    VALUES (consultant_user, client_a, 'consultant', 'full', 'active', rel_a);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- Deliberately NEVER switched active organisation — proves the
  -- portfolio-wide property: a consultant may write a scope/visit
  -- against an authorised client without first switching into it.

  -- 1. A service scope for client_a (live relationship) succeeds.
  BEGIN
    INSERT INTO public.consultancy_service_scopes (consultancy_organisation_id, client_organisation_id, service_type, service_owner_person_id)
      VALUES (consultancy, client_a, 'retained_hs_consultancy', owner_person) RETURNING id INTO scope_id;
    RETURN NEXT '1. service scope for client_a (live relationship) inserted: true';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('1. service scope for client_a inserted: false (%s)', SQLERRM);
  END;

  -- 2. A service scope naming client_b (ended relationship) is refused.
  BEGIN
    INSERT INTO public.consultancy_service_scopes (consultancy_organisation_id, client_organisation_id, service_type)
      VALUES (consultancy, client_b_ended, 'audit_support');
    RETURN NEXT '2. service scope for client_b (ended relationship) refused: false (WRONGLY SUCCEEDED)';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('2. service scope for client_b (ended relationship) refused: %s', SQLSTATE = '42501');
  END;

  -- 3. service_owner_person_id from the WRONG organisation is refused.
  BEGIN
    INSERT INTO public.consultancy_service_scopes (consultancy_organisation_id, client_organisation_id, service_type, service_owner_person_id)
      VALUES (consultancy, client_a, 'training', owner_person_wrong_co);
    RETURN NEXT '3. wrong-org service_owner_person_id refused: false (WRONGLY SUCCEEDED)';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('3. wrong-org service_owner_person_id refused: %s', SQLSTATE = '42501');
  END;

  -- 4. A visit for client_a with a same-org site succeeds.
  BEGIN
    INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, site_id, consultant_person_id, visit_type, scheduled_date)
      VALUES (consultancy, client_a, site_a, owner_person, 'retained_visit', current_date + 14) RETURNING id INTO visit_id;
    RETURN NEXT '4. visit for client_a with same-org site inserted: true';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('4. visit for client_a inserted: false (%s)', SQLERRM);
  END;

  -- 5. A visit naming a site belonging to a DIFFERENT organisation is refused.
  BEGIN
    INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, site_id, visit_type, scheduled_date)
      VALUES (consultancy, client_a, site_other, 'audit_visit', current_date + 7);
    RETURN NEXT '5. cross-org site_id on a visit refused: false (WRONGLY SUCCEEDED)';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('5. cross-org site_id on a visit refused: %s', SQLSTATE = '42501');
  END;

  -- 6. The client (target org) can read the scope/visit but not write.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Give a second user home membership of client_a to test client-side read.
  DECLARE client_user uuid := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (client_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p168-client@probe.invalid', '', now(), now(), now(), '{}', '{}');
    UPDATE public.profiles SET company_id = client_a, role = 'client_admin' WHERE id = client_user;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', client_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    SELECT count(*) INTO n FROM consultancy_service_scopes WHERE id = scope_id;
    RETURN NEXT format('6a. client_a can read its own service scope: %s', n = 1);

    BEGIN
      UPDATE consultancy_service_scopes SET status = 'ended' WHERE id = scope_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      RETURN NEXT format('6b. client_a cannot write the service scope: %s', n = 0);
    EXCEPTION WHEN OTHERS THEN
      RETURN NEXT '6b. client_a cannot write the service scope: true (raised)';
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
  END;

  -- 7. A THIRD organisation with no relationship at all sees neither row.
  DECLARE stranger_user uuid := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES (stranger_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p168-stranger@probe.invalid', '', now(), now(), now(), '{}', '{}');
    UPDATE public.profiles SET company_id = other_co, role = 'client_admin' WHERE id = stranger_user;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM consultancy_service_scopes;
    RETURN NEXT format('7. unrelated organisation sees zero service scope rows: %s', n = 0);
    SELECT count(*) INTO n FROM consultancy_visits;
    RETURN NEXT format('7b. unrelated organisation sees zero visit rows: %s', n = 0);
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', NULL, true);
  END;

  -- 8. client_health_snapshots gained the new columns, defaulted to 0/NULL.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'client_health_snapshots'
     AND column_name IN ('open_critical_actions','overdue_legal_evaluations','overdue_controlled_documents',
                          'open_incident_investigations','safety_critical_gaps','workers_not_ready',
                          'assets_unavailable','major_audit_findings','contractor_expiring',
                          'environmental_permits_expiring','management_reviews_due',
                          'outstanding_service_requests','next_consultant_visit_date');
  RETURN NEXT format('8. client_health_snapshots gained all 13 new columns: %s', n = 13);
END $$;

SELECT * FROM pg_temp.probe168();
