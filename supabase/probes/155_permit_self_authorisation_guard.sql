-- Rolled-back live probe for migration 155 (permit self-authorisation
-- guard). Reproduces the Phase 4 security review's Medium finding
-- before the fix, then proves it is refused after.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid;
  site_a uuid;
  self_person uuid; other_person uuid;
  self_user uuid := gen_random_uuid();
  tmpl_no_auth uuid;
  v_permit uuid;
  err_msg text;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe155 Co A', 'probe155-co-a') RETURNING id INTO co_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Probe155 Site A') RETURNING id INTO site_a;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (self_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p155-self@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = self_user;

  -- self_person is linked to the acting session via people.user_id.
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status, user_id)
    VALUES (co_a, 'Probe155 Self', 'employee', 'active', self_user) RETURNING id INTO self_person;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status)
    VALUES (co_a, 'Probe155 Other', 'employee', 'active') RETURNING id INTO other_person;

  INSERT INTO public.permit_templates (company_id, name, permit_type) VALUES (co_a, 'Probe155 No Auth Required', 'other') RETURNING id INTO tmpl_no_auth;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', self_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. A permit naming the ACTING SESSION'S OWN person as authoriser is refused.
  INSERT INTO public.permits (company_id, template_id, site_id, scope_of_work)
    VALUES (co_a, tmpl_no_auth, site_a, 'Probe155 self-authorisation test') RETURNING id INTO v_permit;
  BEGIN
    UPDATE public.permits SET status = 'issued', authorised_person_id = self_person WHERE id = v_permit;
    r := array_append(r, '1. self-authorised issue REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('1. self-authorised issue REFUSED: true (%s)', err_msg));
  END;

  -- 2. Naming a DIFFERENT person as authoriser still succeeds normally.
  UPDATE public.permits SET status = 'issued', authorised_person_id = other_person WHERE id = v_permit;
  r := array_append(r, format('2. issue with a different authorising person still succeeds: %s (status=%s)',
    (SELECT status = 'issued' FROM public.permits WHERE id = v_permit),
    (SELECT status FROM public.permits WHERE id = v_permit)));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE EXCEPTION 'PROBE 155 (rolled back): %', array_to_string(r, ' | ');
END $$;
