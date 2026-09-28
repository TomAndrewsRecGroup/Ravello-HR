-- Rolled-back live probe for migration 151 (contractor workers + access gate).
-- Uses the simulated-session technique already established (142/146/149)
-- since person_visible()/my_company_id() key on a real session.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  contractor_a uuid; contractor_b uuid;
  worker_a uuid; worker_no_contractor uuid; worker_employee uuid;
  staff_user uuid := gen_random_uuid();
  res jsonb;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe151 Co A', 'probe151-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe151 Co B', 'probe151-co-b') RETURNING id INTO co_b;
  INSERT INTO public.contractors (company_id, name, approval_status) VALUES (co_a, 'Probe151 Scaffolding Ltd', 'approved') RETURNING id INTO contractor_a;
  INSERT INTO public.contractors (company_id, name, approval_status) VALUES (co_b, 'Probe151 Co B Ltd', 'approved') RETURNING id INTO contractor_b;
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_a, 'employers_liability', current_date + 300), (contractor_a, 'public_liability', current_date + 300);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (staff_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p151-staff@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;

  -- 1. A contractor worker may be linked to a SAME-org, currently-usable contractor.
  INSERT INTO public.people (company_id, full_name, worker_type, contractor_id, lifecycle_status)
    VALUES (co_a, 'Probe151 Worker A', 'contractor', contractor_a, 'active') RETURNING id INTO worker_a;
  r := array_append(r, '1. contractor worker linked to same-org contractor: true');

  -- 2. Linking a non-contractor worker_type to a contractor is refused.
  BEGIN
    INSERT INTO public.people (company_id, full_name, worker_type, contractor_id) VALUES (co_a, 'Probe151 Bad Link', 'employee', contractor_a);
    r := array_append(r, '2. non-contractor worker_type with contractor_id REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '2. non-contractor worker_type with contractor_id REFUSED: true');
  END;

  -- 3. Linking to a DIFFERENT company's contractor is refused.
  BEGIN
    INSERT INTO public.people (company_id, full_name, worker_type, contractor_id) VALUES (co_a, 'Probe151 Cross-Co', 'contractor', contractor_b);
    r := array_append(r, '3. cross-company contractor link REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '3. cross-company contractor link REFUSED: true');
  END;

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe151 No Contractor', 'contractor', 'active') RETURNING id INTO worker_no_contractor;
  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe151 Employee', 'employee', 'active') RETURNING id INTO worker_employee;

  -- worker_a needs an active role assignment with zero requirements to
  -- reach Safe-to-Deploy READY — a person with no role at all reads
  -- REVIEW_REQUIRED (the engine's own safe default, not a Group 8 fact).
  DECLARE role_id uuid;
  BEGIN
    INSERT INTO public.job_roles (company_id, title) VALUES (co_a, 'Probe151 Ground Worker') RETURNING id INTO role_id;
    INSERT INTO public.role_assignments (company_id, person_id, role_id, primary_assignment) VALUES (co_a, worker_a, role_id, true);
  END;

  -- Run the access-gate checks under a simulated staff session (person_visible() needs one).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 4. A contractor worker with no linked contractor is refused access, with a clear reason.
  res := public.contractor_worker_access(worker_no_contractor);
  r := array_append(r, format('4. no linked contractor -> access refused: %s (%s)', (res->>'access_granted') = 'false', res->'reasons'->>0));

  -- 5. An ordinary employee (not a contractor) is also refused via this gate — it is not their check.
  res := public.contractor_worker_access(worker_employee);
  r := array_append(r, format('5. an employee is refused via this contractor-specific gate: %s', (res->>'access_granted') = 'false'));

  -- 6. A linked worker whose contractor is approved+insured AND whose
  --    Safe to Deploy status is READY (an active role with zero
  --    requirements) has access GRANTED.
  res := public.contractor_worker_access(worker_a);
  r := array_append(r, format('6. contractor current + deployment READY -> access granted: %s (deployment_status=%s)',
    (res->>'access_granted') = 'true' AND res->>'deployment_status' = 'READY', res->>'deployment_status'));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 7. Suspending the contractor flips access to refused (re-checked live, not cached).
  UPDATE public.contractors SET approval_status = 'suspended' WHERE id = contractor_a;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.contractor_worker_access(worker_a);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  r := array_append(r, format('7. suspending the contractor flips access to refused: %s (%s)',
    (res->>'access_granted') = 'false', res->'reasons'->>0));

  RAISE EXCEPTION 'PROBE 151 (rolled back): %', array_to_string(r, ' | ');
END $$;
