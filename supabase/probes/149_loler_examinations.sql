-- Rolled-back live probe for migration 149 (LOLER thorough examinations).
-- Uses the same simulated-session technique 142/146 already established
-- (set_config('request.jwt.claims',...) + SET LOCAL ROLE authenticated)
-- since hs_quarantine_asset()/is_tps_staff()/my_company_id() all key on
-- a real session, which a bare service-role probe has none of.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid;
  asset_loler uuid; asset_not_loler uuid;
  staff_user uuid := gen_random_uuid();
  st text;
  aid1 uuid; aid2 uuid;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe149 Co A', 'probe149-co-a') RETURNING id INTO co_a;
  INSERT INTO public.hs_equipment (company_id, name, asset_type, loler_applicable, status)
    VALUES (co_a, 'Probe149 Crane', 'lifting_equipment', true, 'in_service') RETURNING id INTO asset_loler;
  INSERT INTO public.hs_equipment (company_id, name, asset_type, loler_applicable, status)
    VALUES (co_a, 'Probe149 Ladder', 'tool', false, 'in_service') RETURNING id INTO asset_not_loler;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (staff_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p149-staff@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;

  -- 1. A LOLER thorough examination against a non-LOLER-applicable asset is refused.
  BEGIN
    INSERT INTO public.hs_equipment_inspections (equipment_id, inspected_on, outcome, examination_type)
      VALUES (asset_not_loler, current_date, 'pass', 'loler_thorough_examination');
    r := array_append(r, '1. LOLER exam against non-applicable asset REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '1. LOLER exam against non-applicable asset REFUSED: true');
  END;

  -- 2. A LOLER thorough examination, PASS, against a LOLER-applicable
  --    asset rolls next_inspection_due forward as before.
  INSERT INTO public.hs_equipment_inspections (equipment_id, inspected_on, outcome, next_due_on, examination_type)
    VALUES (asset_loler, current_date, 'pass', current_date + 365, 'loler_thorough_examination') RETURNING id INTO aid1;
  SELECT next_inspection_due::text INTO st FROM public.hs_equipment WHERE id = asset_loler;
  r := array_append(r, format('2. PASS rolls next_inspection_due forward: %s (%s)', st = (current_date + 365)::text, st));

  -- 3. A plain routine inspection (examination_type NULL) is unaffected
  --    by the new guard — still works exactly as before 149.
  INSERT INTO public.hs_equipment_inspections (equipment_id, inspected_on, outcome)
    VALUES (asset_not_loler, current_date, 'pass');
  r := array_append(r, '3. plain routine inspection (no examination_type) still works: true');

  -- 4. immediate_danger = true quarantines the asset UNCONDITIONALLY,
  --    even when outcome is (incorrectly) recorded as 'pass'. Run under
  --    a simulated staff session so hs_quarantine_asset() actually acts.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.hs_equipment_inspections (equipment_id, inspected_on, outcome, examination_type, immediate_danger)
    VALUES (asset_loler, current_date, 'pass', 'loler_thorough_examination', true) RETURNING id INTO aid2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT status INTO st FROM public.hs_equipment WHERE id = asset_loler;
  r := array_append(r, format('4. immediate_danger quarantines despite outcome=pass: %s (status=%s)', st = 'quarantined', st));

  -- 5. immediate_danger never rolls next_inspection_due forward — the
  --    date from check 2 is unchanged by the immediate-danger row.
  r := array_append(r, format('5. next_inspection_due unchanged by immediate-danger pass row: %s',
    (SELECT next_inspection_due FROM public.hs_equipment WHERE id = asset_loler) = current_date + 365));

  -- 6. Outbox: hs_equipment_inspections now fires a platform_event
  --    carrying immediate_danger/examination_type.
  r := array_append(r, format('6. platform_events row for aid2 carries immediate_danger=true: %s',
    EXISTS (SELECT 1 FROM public.platform_events WHERE entity_type = 'hs_equipment_inspections' AND entity_id = aid2
            AND (payload->'new'->>'immediate_danger')::boolean = true)));

  RAISE EXCEPTION 'PROBE 149 (rolled back): %', array_to_string(r, ' | ');
END $$;
