-- Rolled-back live probe for migration 153 (isolation / LOTO).
-- Uses the simulated-session technique (146/149/151/152) — mutations
-- run under a simulated staff session throughout, per the lesson from
-- 152's own probe (the lifecycle guard's downstream checks need a real
-- auth.uid(), not just the bare function calls).

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid;
  asset_a uuid;
  applier uuid; verifier uuid; worker_a uuid; worker_b uuid; remover uuid; removal_verifier uuid;
  staff_user uuid := gen_random_uuid();
  iso_id uuid;
  err_msg text;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe153 Co A', 'probe153-co-a') RETURNING id INTO co_a;
  INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_a, 'Probe153 Asset', 'in_service') RETURNING id INTO asset_a;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (staff_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p153-staff@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe153 Applier', 'employee', 'active') RETURNING id INTO applier;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe153 Verifier', 'employee', 'active') RETURNING id INTO verifier;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe153 Worker A', 'employee', 'active') RETURNING id INTO worker_a;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe153 Worker B', 'employee', 'active') RETURNING id INTO worker_b;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe153 Remover', 'employee', 'active') RETURNING id INTO remover;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe153 Removal Verifier', 'employee', 'active') RETURNING id INTO removal_verifier;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Applying an isolation moves the asset to out_of_service.
  INSERT INTO public.isolations (company_id, asset_id, isolation_type, description, applied_by)
    VALUES (co_a, asset_a, 'electrical', 'Probe153 isolation', applier) RETURNING id INTO iso_id;
  r := array_append(r, format('1. asset moved to out_of_service on apply: %s', (SELECT status = 'out_of_service' FROM public.hs_equipment WHERE id = asset_a)));

  -- 2. Two workers each add their own personal lock (group lockout).
  INSERT INTO public.isolation_locks (isolation_id, person_id, lock_number) VALUES (iso_id, worker_a, 'LOCK-A');
  INSERT INTO public.isolation_locks (isolation_id, person_id, lock_number) VALUES (iso_id, worker_b, 'LOCK-B');
  r := array_append(r, format('2. two personal locks added: %s', (SELECT count(*) FROM public.isolation_locks WHERE isolation_id = iso_id) = 2));

  -- 3. Verifying with the SAME person who applied it is refused.
  BEGIN
    UPDATE public.isolations SET status = 'verified', verified_by = applier WHERE id = iso_id;
    r := array_append(r, '3. self-verification REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('3. self-verification REFUSED: true (%s)', err_msg));
  END;

  -- 4. Verifying with a DIFFERENT person succeeds.
  UPDATE public.isolations SET status = 'verified', verified_by = verifier WHERE id = iso_id;
  r := array_append(r, format('4. verification by a different person succeeds: %s (status=%s)',
    (SELECT status = 'verified' AND verified_at IS NOT NULL FROM public.isolations WHERE id = iso_id),
    (SELECT status FROM public.isolations WHERE id = iso_id)));

  -- 5. Removal is refused while locks are still open.
  BEGIN
    UPDATE public.isolations SET status = 'removed', removed_by = remover, removal_verified_by = removal_verifier WHERE id = iso_id;
    r := array_append(r, '5. removal with open locks REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('5. removal with open locks REFUSED: true (%s)', err_msg));
  END;

  -- 6. Removing someone else's lock with no override reason is refused.
  BEGIN
    UPDATE public.isolation_locks SET removed_at = now(), removed_by = remover WHERE isolation_id = iso_id AND person_id = worker_a;
    r := array_append(r, '6. removing another person''s lock with no override REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '6. removing another person''s lock with no override REFUSED: true');
  END;

  -- 7. Removing someone else's lock authorised by the SAME person removing it is refused.
  BEGIN
    UPDATE public.isolation_locks SET removed_at = now(), removed_by = remover,
      override_reason = 'Worker A off site', override_authorised_by = remover
      WHERE isolation_id = iso_id AND person_id = worker_a;
    r := array_append(r, '7. self-authorised override REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '7. self-authorised override REFUSED: true');
  END;

  -- 8. A properly authorised override (different remover + different authoriser) succeeds.
  UPDATE public.isolation_locks SET removed_at = now(), removed_by = remover,
    override_reason = 'Worker A off site, contacted and confirmed clear', override_authorised_by = removal_verifier
    WHERE isolation_id = iso_id AND person_id = worker_a;
  r := array_append(r, format('8. authorised override removal succeeds: %s', (SELECT removed_at IS NOT NULL FROM public.isolation_locks WHERE isolation_id = iso_id AND person_id = worker_a)));

  -- 9. Worker B removes their OWN lock normally (no override needed).
  UPDATE public.isolation_locks SET removed_at = now(), removed_by = worker_b WHERE isolation_id = iso_id AND person_id = worker_b;
  r := array_append(r, format('9. self-removal of own lock succeeds: %s', (SELECT removed_at IS NOT NULL FROM public.isolation_locks WHERE isolation_id = iso_id AND person_id = worker_b)));

  -- 10. Removal by the SAME person who removes it as the one who verifies it is refused.
  BEGIN
    UPDATE public.isolations SET status = 'removed', removed_by = remover, removal_verified_by = remover WHERE id = iso_id;
    r := array_append(r, '10. self-removal-verification REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('10. self-removal-verification REFUSED: true (%s)', err_msg));
  END;

  -- 11. Removal with a different verifier succeeds, and the asset is restored to in_service.
  UPDATE public.isolations SET status = 'removed', removed_by = remover, removal_verified_by = removal_verifier WHERE id = iso_id;
  r := array_append(r, format('11. removal succeeds and asset restored to in_service: %s (status=%s, asset_status=%s)',
    (SELECT status = 'removed' FROM public.isolations WHERE id = iso_id) AND (SELECT status = 'in_service' FROM public.hs_equipment WHERE id = asset_a),
    (SELECT status FROM public.isolations WHERE id = iso_id),
    (SELECT status FROM public.hs_equipment WHERE id = asset_a)));

  -- 12. No lock may be added once the isolation is removed.
  BEGIN
    INSERT INTO public.isolation_locks (isolation_id, person_id) VALUES (iso_id, applier);
    r := array_append(r, '12. lock add after removal REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '12. lock add after removal REFUSED: true');
  END;

  -- 13. Invalid transition (verified -> applied, going backwards) is refused.
  -- Uses its OWN asset — left verified-but-open on purpose to prove the
  -- refusal, so it must not share asset_a with test 14's clear-count.
  DECLARE iso2 uuid; asset_b uuid;
  BEGIN
    INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_a, 'Probe153 Asset B', 'in_service') RETURNING id INTO asset_b;
    INSERT INTO public.isolations (company_id, asset_id, isolation_type, applied_by)
      VALUES (co_a, asset_b, 'mechanical', applier) RETURNING id INTO iso2;
    UPDATE public.isolations SET status = 'verified', verified_by = verifier WHERE id = iso2;
    BEGIN
      UPDATE public.isolations SET status = 'applied' WHERE id = iso2;
      r := array_append(r, '13. backwards transition REFUSED: false (no exception)');
    EXCEPTION WHEN OTHERS THEN
      r := array_append(r, '13. backwards transition REFUSED: true');
    END;
  END;

  -- 14. TWO open isolations on the same asset: removing the first does NOT
  --     restore the asset (the second is still open); removing the second does.
  DECLARE iso3 uuid; iso4 uuid;
  BEGIN
    INSERT INTO public.isolations (company_id, asset_id, isolation_type, applied_by)
      VALUES (co_a, asset_a, 'mechanical', applier) RETURNING id INTO iso3;
    r := array_append(r, format('14a. asset back to out_of_service on a fresh isolation: %s', (SELECT status = 'out_of_service' FROM public.hs_equipment WHERE id = asset_a)));
    INSERT INTO public.isolations (company_id, asset_id, isolation_type, applied_by)
      VALUES (co_a, asset_a, 'hydraulic', applier) RETURNING id INTO iso4;

    UPDATE public.isolations SET status = 'verified', verified_by = verifier WHERE id = iso3;
    UPDATE public.isolations SET status = 'removed', removed_by = remover, removal_verified_by = removal_verifier WHERE id = iso3;
    r := array_append(r, format('14b. asset stays out_of_service while a second isolation is still open: %s', (SELECT status = 'out_of_service' FROM public.hs_equipment WHERE id = asset_a)));

    UPDATE public.isolations SET status = 'verified', verified_by = verifier WHERE id = iso4;
    UPDATE public.isolations SET status = 'removed', removed_by = remover, removal_verified_by = removal_verifier WHERE id = iso4;
    r := array_append(r, format('14c. asset restored once the LAST isolation clears: %s', (SELECT status = 'in_service' FROM public.hs_equipment WHERE id = asset_a)));
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE EXCEPTION 'PROBE 153 (rolled back): %', array_to_string(r, ' | ');
END $$;
