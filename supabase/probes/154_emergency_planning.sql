-- Rolled-back live probe for migration 154 (emergency planning).
-- Uses the simulated-session technique (146/149/151/152/153).

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  site_a uuid; site_b uuid;
  asset_a uuid;
  auth_type_a uuid;
  conductor uuid;
  staff_user uuid := gen_random_uuid();
  plan_v1 uuid; plan_v2 uuid;
  drill_id uuid;
  err_msg text;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe154 Co A', 'probe154-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe154 Co B', 'probe154-co-b') RETURNING id INTO co_b;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Probe154 Site A') RETURNING id INTO site_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_b, 'Probe154 Site B') RETURNING id INTO site_b;
  INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_a, 'Probe154 Extinguisher', 'in_service') RETURNING id INTO asset_a;
  INSERT INTO public.authorisation_types (company_id, title, scope_kind) VALUES (co_a, 'Probe154 Fire Warden', 'site') RETURNING id INTO auth_type_a;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (staff_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p154-staff@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;

  INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (co_a, 'Probe154 Conductor', 'employee', 'active') RETURNING id INTO conductor;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Plan v1 created; the Safety Timeline entry fires ('plan_added').
  INSERT INTO public.emergency_plans (company_id, site_id, plan_type, title, description, review_due_at)
    VALUES (co_a, site_a, 'fire', 'Probe154 Fire Evacuation Plan', 'Evacuation procedure', current_date + 365) RETURNING id INTO plan_v1;
  r := array_append(r, format('1. plan v1 created, version=1: %s', (SELECT version = 1 AND status = 'active' FROM public.emergency_plans WHERE id = plan_v1)));

  -- 2. Cross-org site on a plan is refused.
  BEGIN
    INSERT INTO public.emergency_plans (company_id, site_id, plan_type, title) VALUES (co_a, site_b, 'fire', 'Bad');
    r := array_append(r, '2. cross-org site REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '2. cross-org site REFUSED: true');
  END;

  -- 3. A required role (Fire Warden, min 2) links to the Phase 3 authorisation catalogue.
  INSERT INTO public.emergency_plan_roles (plan_id, authorisation_type_id, min_count) VALUES (plan_v1, auth_type_a, 2);
  r := array_append(r, '3. required role linked: true');

  -- 4. Cross-org authorisation type on a plan role is refused.
  BEGIN
    INSERT INTO public.emergency_plan_roles (plan_id, authorisation_type_id)
      VALUES (plan_v1, (SELECT id FROM public.authorisation_types WHERE company_id <> co_a LIMIT 1));
    r := array_append(r, '4. cross-org authorisation type REFUSED: false (no exception, or no fixture)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('4. cross-org authorisation type REFUSED: true (%s)', SQLSTATE));
  END;

  -- 5. Linked equipment.
  INSERT INTO public.emergency_plan_equipment (plan_id, asset_id, notes) VALUES (plan_v1, asset_a, 'Main stairwell extinguisher');
  r := array_append(r, '5. linked equipment added: true');

  -- 6. Cross-org asset on plan equipment is refused.
  DECLARE asset_b uuid;
  BEGIN
    INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_b, 'Probe154 Co B Asset', 'in_service') RETURNING id INTO asset_b;
    BEGIN
      INSERT INTO public.emergency_plan_equipment (plan_id, asset_id) VALUES (plan_v1, asset_b);
      r := array_append(r, '6. cross-org asset REFUSED: false (no exception)');
    EXCEPTION WHEN OTHERS THEN
      r := array_append(r, '6. cross-org asset REFUSED: true');
    END;
  END;

  -- 7. A new VERSION is a new row, not an edit — created linking supersedes_id.
  INSERT INTO public.emergency_plans (company_id, site_id, plan_type, title, description, version, supersedes_id)
    VALUES (co_a, site_a, 'fire', 'Probe154 Fire Evacuation Plan', 'Updated procedure', 2, plan_v1) RETURNING id INTO plan_v2;
  r := array_append(r, format('7. plan v2 created referencing v1: %s', (SELECT version = 2 FROM public.emergency_plans WHERE id = plan_v2)));

  -- 8. Flipping v1 to superseded fires the Safety Timeline event (checked via hs_events count) and succeeds.
  UPDATE public.emergency_plans SET status = 'superseded' WHERE id = plan_v1;
  r := array_append(r, format('8. v1 flipped to superseded: %s', (SELECT status = 'superseded' FROM public.emergency_plans WHERE id = plan_v1)));
  r := array_append(r, format('8b. Safety Timeline holds both plan_added and plan_superseded entries: %s',
    (SELECT count(*) FROM public.hs_events WHERE entity_type = 'emergency_plan' AND entity_id = plan_v1 AND event_type IN ('plan_added', 'plan_superseded')) = 2));

  -- 9. A drill against the plan, with an evacuation time.
  INSERT INTO public.emergency_drills (company_id, plan_id, site_id, drill_date, conducted_by, evacuation_time_seconds, outcome, findings)
    VALUES (co_a, plan_v2, site_a, current_date, conductor, 245, 'issues_found', 'Fire door on level 2 was obstructed') RETURNING id INTO drill_id;
  r := array_append(r, format('9. drill recorded: %s', (SELECT outcome = 'issues_found' FROM public.emergency_drills WHERE id = drill_id)));

  -- 10. A drill cannot be updated (insert-only — a correction is a new row).
  BEGIN
    UPDATE public.emergency_drills SET outcome = 'successful' WHERE id = drill_id;
    r := array_append(r, '10. drill UPDATE REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '10. drill UPDATE REFUSED: true');
  END;

  -- 11. A drill cannot be deleted either.
  BEGIN
    DELETE FROM public.emergency_drills WHERE id = drill_id;
    r := array_append(r, '11. drill DELETE REFUSED: false (no exception)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '11. drill DELETE REFUSED: true');
  END;

  -- 12. A drill against a DIFFERENT company's plan is refused.
  DECLARE plan_b uuid;
  BEGIN
    INSERT INTO public.emergency_plans (company_id, site_id, plan_type, title) VALUES (co_b, site_b, 'fire', 'Co B Plan') RETURNING id INTO plan_b;
    BEGIN
      INSERT INTO public.emergency_drills (company_id, plan_id, drill_date, outcome) VALUES (co_a, plan_b, current_date, 'successful');
      r := array_append(r, '12. drill against another company''s plan REFUSED: false (no exception)');
    EXCEPTION WHEN OTHERS THEN
      r := array_append(r, '12. drill against another company''s plan REFUSED: true');
    END;
  END;

  -- 13. Exactly one Safety Timeline line for the drill (never one per finding).
  r := array_append(r, format('13. exactly one Safety Timeline entry for the drill: %s',
    (SELECT count(*) FROM public.hs_events WHERE entity_type = 'emergency_drill' AND entity_id = drill_id) = 1));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE EXCEPTION 'PROBE 154 (rolled back): %', array_to_string(r, ' | ');
END $$;
