-- Rolled-back live probe for migration 146 (defects + return-to-service).
-- Uses the same set_config('request.jwt.claims',...)/SET LOCAL ROLE
-- authenticated simulation 142's probe already established, since
-- hs_quarantine_asset()/is_tps_staff()/my_company_id() all key on a real
-- session (auth.uid()), which a plain service-role probe has none of.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid;
  site_a uuid;
  asset_a uuid; asset_b uuid;
  client_user uuid := gen_random_uuid();
  staff_user uuid := gen_random_uuid();
  insp1 uuid;
  defect_action_id uuid;
  st text;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe146 Co A', 'probe146-co-a') RETURNING id INTO co_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Site A1') RETURNING id INTO site_a;
  INSERT INTO public.hs_equipment (company_id, site_id, name, asset_type) VALUES (co_a, site_a, 'Probe146 Forklift', 'vehicle') RETURNING id INTO asset_a;
  INSERT INTO public.hs_equipment (company_id, site_id, name, asset_type) VALUES (co_a, site_a, 'Probe146 Clean Forklift', 'vehicle') RETURNING id INTO asset_b;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (client_user, 'p146-client@probe.invalid'), (staff_user, 'p146-staff@probe.invalid')) v(id, em);
  UPDATE public.profiles SET role = 'client_user', company_id = co_a WHERE id = client_user;
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;

  -- 1. A CLIENT user submits a critical-fail inspection: the asset
  --    quarantines immediately despite hs_equipment having no client
  --    UPDATE policy at all (hs_quarantine_asset's whole reason to exist).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  insp1 := gen_random_uuid();
  PERFORM public.hs_submit_inspection(insp1, co_a, site_a, asset_a, NULL, 'Probe146 check', current_date, NULL,
    jsonb_build_array(jsonb_build_object('prompt', 'Forks OK?', 'critical', true, 'rating', 'fail', 'comment', 'Cracked')));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT status INTO st FROM public.hs_equipment WHERE id = asset_a;
  r := array_append(r, format('1. asset quarantined after a CLIENT-submitted critical fail: %s (status=%s)', st = 'quarantined', st));

  -- 2. A non-critical-fail inspection (same client) does NOT quarantine.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.hs_submit_inspection(gen_random_uuid(), co_a, site_a, asset_b, NULL, 'Probe146 minor check', current_date, NULL,
    jsonb_build_array(jsonb_build_object('prompt', 'Horn works?', 'critical', false, 'rating', 'fail')));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT status INTO st FROM public.hs_equipment WHERE id = asset_b;
  r := array_append(r, format('2. non-critical fail does NOT quarantine: %s (status=%s)', st = 'in_service', st));

  -- 3. A decommissioned asset is never quarantined by a critical fail
  --    (staff-submitted, to also prove the staff branch of the helper).
  UPDATE public.hs_equipment SET status = 'decommissioned' WHERE id = asset_b;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.hs_submit_inspection(gen_random_uuid(), co_a, site_a, asset_b, NULL, 'Probe146 decommissioned check', current_date, NULL,
    jsonb_build_array(jsonb_build_object('prompt', 'Forks OK?', 'critical', true, 'rating', 'fail')));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT status INTO st FROM public.hs_equipment WHERE id = asset_b;
  r := array_append(r, format('3. decommissioned asset untouched by critical fail: %s (status=%s)', st = 'decommissioned', st));

  -- 4. Manually raise the "defect" action the consequence rule would
  --    raise (rules run in the app layer, not SQL) and prove the
  --    return-to-service gate refuses the asset leaving quarantine
  --    while it is open. Run as service role (no session needed for
  --    a plain UPDATE against a table with staff-all RLS).
  INSERT INTO public.actions (company_id, action_type, title, priority, status, severity, source_type, source_id,
                               related_entity_type, related_entity_id, verification_required, created_by_admin)
  VALUES (co_a, 'hs_inspection_defect', 'Defect: Forks cracked', 'urgent', 'active', 'critical', 'inspection',
          (SELECT id FROM public.inspection_responses WHERE inspection_id = insp1 LIMIT 1),
          'hs_equipment', asset_a, true, true)
  RETURNING id INTO defect_action_id;

  BEGIN
    UPDATE public.hs_equipment SET status = 'in_service' WHERE id = asset_a;
    r := array_append(r, '4. return-to-service REFUSED while defect open: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '4. return-to-service REFUSED while defect open: true');
  END;

  -- 5. Resolving the defect (status -> complete) lets the asset return.
  UPDATE public.actions SET status = 'awaiting_verification' WHERE id = defect_action_id;
  UPDATE public.actions SET status = 'complete', verified_at = now() WHERE id = defect_action_id;
  UPDATE public.hs_equipment SET status = 'in_service' WHERE id = asset_a;
  SELECT status INTO st FROM public.hs_equipment WHERE id = asset_a;
  r := array_append(r, format('5. return-to-service ALLOWED once defect complete: %s (status=%s)', st = 'in_service', st));

  -- 6. A NON-critical defect (severity <> critical) never blocks
  --    return-to-service — only critical ones do.
  UPDATE public.hs_equipment SET status = 'quarantined' WHERE id = asset_a;
  INSERT INTO public.actions (company_id, action_type, title, priority, status, severity, source_type, source_id,
                               related_entity_type, related_entity_id, verification_required, created_by_admin)
  VALUES (co_a, 'hs_inspection_defect', 'Defect: minor scuff', 'normal', 'active', 'low', 'inspection', gen_random_uuid(),
          'hs_equipment', asset_a, false, true);
  UPDATE public.hs_equipment SET status = 'in_service' WHERE id = asset_a;
  SELECT status INTO st FROM public.hs_equipment WHERE id = asset_a;
  r := array_append(r, format('6. an open NON-critical defect does not block return-to-service: %s (status=%s)', st = 'in_service', st));

  RAISE EXCEPTION 'PROBE 146 (rolled back): %', array_to_string(r, ' | ');
END $$;
