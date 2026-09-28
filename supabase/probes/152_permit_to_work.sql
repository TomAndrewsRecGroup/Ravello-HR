-- Rolled-back live probe for migration 152 (permit to work).
-- Uses the simulated-session technique (142/146/149/151) since the
-- lifecycle guard's person_deployment_status()/person_visible() calls
-- need a real session throughout, not just around a bare function call —
-- the guard trigger fires from ordinary UPDATE statements too, so the
-- simulated session is held for the whole exercised sequence.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  site_a uuid; site_b uuid;
  asset_a uuid;
  role_id uuid;
  auth_type_a uuid;
  worker_a uuid; worker_no_role uuid; authoriser uuid;
  tmpl_a uuid; tmpl_no_auth uuid;
  v_permit uuid;
  v_permit_no_auth uuid;
  pnum text;
  staff_user uuid := gen_random_uuid();
  ok boolean;
  err_msg text;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe152 Co A', 'probe152-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe152 Co B', 'probe152-co-b') RETURNING id INTO co_b;

  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Probe152 Site A') RETURNING id INTO site_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_b, 'Probe152 Site B') RETURNING id INTO site_b;

  INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_a, 'Probe152 Asset', 'in_service') RETURNING id INTO asset_a;

  INSERT INTO public.authorisation_types (company_id, title, scope_kind) VALUES (co_a, 'Probe152 Hot Work Permit Issuer', 'site') RETURNING id INTO auth_type_a;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (staff_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p152-staff@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;

  INSERT INTO public.job_roles (company_id, title) VALUES (co_a, 'Probe152 Ground Worker') RETURNING id INTO role_id;

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe152 Worker A', 'employee', 'active') RETURNING id INTO worker_a;
  INSERT INTO public.role_assignments (company_id, person_id, role_id, primary_assignment) VALUES (co_a, worker_a, role_id, true);

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe152 No Role', 'employee', 'active') RETURNING id INTO worker_no_role;

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe152 Authoriser', 'employee', 'active') RETURNING id INTO authoriser;

  -- Everything from here on runs under a simulated staff session — the
  -- lifecycle guard's person_deployment_status()/person_visible() calls
  -- need a real auth.uid() whenever the trigger fires, not only when a
  -- helper function is called directly.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Template numbering + same-org authorisation-type guard.
  INSERT INTO public.permit_templates (company_id, name, permit_type, required_authorisation_type_id, default_validity_hours)
    VALUES (co_a, 'Probe152 Hot Work', 'hot_work', auth_type_a, 8) RETURNING id INTO tmpl_a;
  r := array_append(r, '1. template created with same-org authorisation type: true');

  BEGIN
    INSERT INTO public.permit_templates (company_id, name, permit_type, required_authorisation_type_id)
      VALUES (co_a, 'Probe152 Cross-Org', 'hot_work', (SELECT id FROM public.authorisation_types WHERE company_id <> co_a LIMIT 1));
    -- if there's no other-company authorisation type visible in this DB, this may no-op; guard against a false negative
    r := array_append(r, '2. cross-org authorisation type on template REFUSED: false (no exception, or no fixture)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('2. cross-org authorisation type on template REFUSED: true (%s)', SQLSTATE));
  END;

  INSERT INTO public.permit_templates (company_id, name, permit_type) VALUES (co_a, 'Probe152 No Auth Required', 'other') RETURNING id INTO tmpl_no_auth;

  -- 3. Permit numbering PTW-YYYY-NNNNNN.
  INSERT INTO public.permits (company_id, template_id, site_id, asset_id, scope_of_work)
    VALUES (co_a, tmpl_a, site_a, asset_a, 'Probe152 hot work on asset A') RETURNING id, permit_number INTO v_permit, pnum;
  r := array_append(r, format('3. permit number matches PTW-YYYY-NNNNNN: %s (%s)', pnum ~ '^PTW-\d{4}-\d{6}$', pnum));

  -- 4. Cross-org site is refused.
  BEGIN
    INSERT INTO public.permits (company_id, template_id, site_id, scope_of_work) VALUES (co_a, tmpl_a, site_b, 'bad');
    r := array_append(r, '4. cross-org site REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '4. cross-org site REFUSED: true');
  END;

  -- 5. permit_people can be added while draft.
  INSERT INTO public.permit_people (permit_id, person_id) VALUES (v_permit, worker_a);
  r := array_append(r, '5. permit_people insert while draft: true');

  -- 6. person_holds_authorisation is false with no authorisation on file.
  ok := public.person_holds_authorisation(authoriser, auth_type_a, site_a);
  r := array_append(r, format('6. person_holds_authorisation false with none on file: %s', ok = false));

  -- 7. Issuing the permit fails: authoriser has no required authorisation.
  BEGIN
    UPDATE public.permits SET status = 'issued', authorised_person_id = authoriser WHERE id = v_permit;
    r := array_append(r, '7. issue without required authorisation REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('7. issue without required authorisation REFUSED: true (%s)', err_msg));
  END;

  -- Grant the authoriser the required authorisation (active, in-date, site-scoped).
  INSERT INTO public.person_authorisations (company_id, person_id, authorisation_type_id, status, issued_on, expires_on, scope_site_id)
    VALUES (co_a, authoriser, auth_type_a, 'active', current_date - 30, current_date + 300, site_a);

  ok := public.person_holds_authorisation(authoriser, auth_type_a, site_a);
  r := array_append(r, format('8. person_holds_authorisation true once granted: %s', ok = true));

  -- 9. Issuing still fails: a person on the permit with no role at all
  --    reads REVIEW_REQUIRED, never READY — the veto must catch them.
  INSERT INTO public.permit_people (permit_id, person_id) VALUES (v_permit, worker_no_role);
  BEGIN
    UPDATE public.permits SET status = 'issued', authorised_person_id = authoriser WHERE id = v_permit;
    r := array_append(r, '9. issue with a non-READY person on the permit REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('9. issue with a non-READY person on the permit REFUSED: true (%s)', err_msg));
  END;

  -- Remove the non-READY person, then issue should succeed.
  DELETE FROM public.permit_people pp WHERE pp.permit_id = v_permit AND pp.person_id = worker_no_role;
  UPDATE public.permits SET status = 'issued', authorised_person_id = authoriser WHERE id = v_permit;
  r := array_append(r, format('10. issue succeeds once blockers cleared: %s (status=%s, valid_from set=%s, valid_until set=%s)',
    (SELECT status = 'issued' FROM public.permits WHERE id = v_permit),
    (SELECT status FROM public.permits WHERE id = v_permit),
    (SELECT valid_from IS NOT NULL FROM public.permits WHERE id = v_permit),
    (SELECT valid_until IS NOT NULL FROM public.permits WHERE id = v_permit)));

  -- 11. permit_is_currently_valid is true right after issue.
  ok := public.permit_is_currently_valid(v_permit);
  r := array_append(r, format('11. permit_is_currently_valid true right after issue: %s', ok = true));

  -- 12. permit_people can no longer be added once issued.
  BEGIN
    INSERT INTO public.permit_people (permit_id, person_id) VALUES (v_permit, worker_no_role);
    r := array_append(r, '12. permit_people add after issue REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '12. permit_people add after issue REFUSED: true');
  END;

  -- 13. Suspending without a reason is refused.
  BEGIN
    UPDATE public.permits SET status = 'suspended' WHERE id = v_permit;
    r := array_append(r, '13. suspend without reason REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '13. suspend without reason REFUSED: true');
  END;

  -- 14. Suspend with a reason succeeds.
  UPDATE public.permits SET status = 'suspended', suspended_reason = 'Probe152 test suspension' WHERE id = v_permit;
  r := array_append(r, format('14. suspend with reason succeeds: %s', (SELECT status = 'suspended' FROM public.permits WHERE id = v_permit)));

  -- 15. permit_is_currently_valid is false while suspended.
  ok := public.permit_is_currently_valid(v_permit);
  r := array_append(r, format('15. permit_is_currently_valid false while suspended: %s', ok = false));

  -- 16. Revalidation re-runs the SAME checks (asset quarantine included) —
  --     quarantine the asset, then prove revalidation is blocked too.
  UPDATE public.hs_equipment SET status = 'quarantined' WHERE id = asset_a;
  BEGIN
    UPDATE public.permits SET status = 'issued' WHERE id = v_permit;
    r := array_append(r, '16. revalidation with quarantined asset REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    r := array_append(r, format('16. revalidation with quarantined asset REFUSED: true (%s)', err_msg));
  END;
  UPDATE public.hs_equipment SET status = 'in_service' WHERE id = asset_a;

  -- 17. Revalidation succeeds once the blocker clears, and clears suspension fields.
  UPDATE public.permits SET status = 'issued' WHERE id = v_permit;
  r := array_append(r, format('17. revalidation succeeds and clears suspension fields: %s (status=%s, suspended_reason=%s)',
    (SELECT status = 'issued' AND suspended_reason IS NULL FROM public.permits WHERE id = v_permit),
    (SELECT status FROM public.permits WHERE id = v_permit),
    (SELECT suspended_reason FROM public.permits WHERE id = v_permit)));

  -- 18. Closing without closeout notes is refused; with notes succeeds.
  BEGIN
    UPDATE public.permits SET status = 'closed' WHERE id = v_permit;
    r := array_append(r, '18. close without notes REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '18. close without notes REFUSED: true');
  END;
  UPDATE public.permits SET status = 'closed', closeout_notes = 'Probe152 closeout' WHERE id = v_permit;
  r := array_append(r, format('19. close with notes succeeds: %s', (SELECT status = 'closed' FROM public.permits WHERE id = v_permit)));

  -- 20. Revoke from a closed permit is refused (terminal state).
  BEGIN
    UPDATE public.permits SET status = 'revoked', revoked_reason = 'test' WHERE id = v_permit;
    r := array_append(r, '20. revoke from closed REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '20. revoke from closed REFUSED: true');
  END;

  -- 21/22. Revoke works from draft, with a reason.
  INSERT INTO public.permits (company_id, template_id, site_id, scope_of_work)
    VALUES (co_a, tmpl_no_auth, site_a, 'Probe152 no-auth-required permit') RETURNING id INTO v_permit_no_auth;
  BEGIN
    UPDATE public.permits SET status = 'revoked' WHERE id = v_permit_no_auth;
    r := array_append(r, '21. revoke without reason REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '21. revoke without reason REFUSED: true');
  END;
  UPDATE public.permits SET status = 'revoked', revoked_reason = 'Probe152 test revoke' WHERE id = v_permit_no_auth;
  r := array_append(r, format('22. revoke from draft with reason succeeds: %s', (SELECT status = 'revoked' FROM public.permits WHERE id = v_permit_no_auth)));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE EXCEPTION 'PROBE 152 (rolled back): %', array_to_string(r, ' | ');
END $$;
