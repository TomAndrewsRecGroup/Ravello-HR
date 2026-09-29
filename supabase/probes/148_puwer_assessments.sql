-- Rolled-back live probe for migration 148 (PUWER assessments).

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  asset_puwer uuid; asset_not_puwer uuid; asset_b uuid;
  insp_a uuid; insp_wrong_asset uuid;
  aid uuid;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe148 Co A', 'probe148-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe148 Co B', 'probe148-co-b') RETURNING id INTO co_b;
  INSERT INTO public.hs_equipment (company_id, name, asset_type, puwer_applicable) VALUES (co_a, 'Probe148 Press', 'machinery', true) RETURNING id INTO asset_puwer;
  INSERT INTO public.hs_equipment (company_id, name, asset_type, puwer_applicable) VALUES (co_a, 'Probe148 Ladder', 'tool', false) RETURNING id INTO asset_not_puwer;
  INSERT INTO public.hs_equipment (company_id, name, asset_type, puwer_applicable) VALUES (co_b, 'Probe148 Co B Press', 'machinery', true) RETURNING id INTO asset_b;

  -- 1. Recording against a PUWER-applicable asset succeeds.
  INSERT INTO public.puwer_assessments (company_id, asset_id, outcome, assessed_on, review_due_on)
    VALUES (co_a, asset_puwer, 'compliant', current_date, current_date + 365) RETURNING id INTO aid;
  r := array_append(r, '1. recorded against PUWER-applicable asset: true');

  -- 2. Recording against a NON-PUWER-applicable asset is refused.
  BEGIN
    INSERT INTO public.puwer_assessments (company_id, asset_id, outcome, assessed_on)
      VALUES (co_a, asset_not_puwer, 'compliant', current_date);
    r := array_append(r, '2. non-PUWER-applicable asset REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '2. non-PUWER-applicable asset REFUSED: true');
  END;

  -- 3. Recording against a DIFFERENT company's asset is refused.
  BEGIN
    INSERT INTO public.puwer_assessments (company_id, asset_id, outcome, assessed_on)
      VALUES (co_a, asset_b, 'compliant', current_date);
    r := array_append(r, '3. cross-company asset REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '3. cross-company asset REFUSED: true');
  END;

  -- 4. An inspection_id belonging to a DIFFERENT asset is refused.
  INSERT INTO public.inspections (id, company_id, asset_id, title, conducted_on, overall_outcome, has_critical_failure)
    VALUES (gen_random_uuid(), co_a, asset_not_puwer, 'Probe148 unrelated inspection', current_date, 'pass', false) RETURNING id INTO insp_wrong_asset;
  BEGIN
    INSERT INTO public.puwer_assessments (company_id, asset_id, inspection_id, outcome, assessed_on)
      VALUES (co_a, asset_puwer, insp_wrong_asset, 'compliant', current_date);
    r := array_append(r, '4. mismatched inspection_id REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '4. mismatched inspection_id REFUSED: true');
  END;

  -- 5. An inspection_id belonging to the SAME asset is accepted.
  INSERT INTO public.inspections (id, company_id, asset_id, title, conducted_on, overall_outcome, has_critical_failure)
    VALUES (gen_random_uuid(), co_a, asset_puwer, 'Probe148 backing inspection', current_date, 'pass', false) RETURNING id INTO insp_a;
  INSERT INTO public.puwer_assessments (company_id, asset_id, inspection_id, outcome, assessed_on)
    VALUES (co_a, asset_puwer, insp_a, 'compliant', current_date);
  r := array_append(r, '5. same-asset inspection_id accepted: true');

  -- 6. Evidence vocab resolves.
  r := array_append(r, format('6a. hs_scope_for_entity(puwer_assessment) = register: %s', public.hs_scope_for_entity('puwer_assessment') = 'register'));
  r := array_append(r, format('6b. hs_entity_table(puwer_assessment) = puwer_assessments: %s', public.hs_entity_table('puwer_assessment') = 'puwer_assessments'));
  r := array_append(r, format('6c. hs_entity_company(puwer_assessment, aid) = co_a: %s', public.hs_entity_company('puwer_assessment', aid) = co_a));

  -- 7. actions.source_type CHECK now accepts 'puwer_assessment'.
  INSERT INTO public.actions (company_id, action_type, title, priority, status, severity, source_type, source_id, related_entity_type, related_entity_id, created_by_admin)
    VALUES (co_a, 'hs_puwer_finding', 'Probe148 finding', 'normal', 'active', 'low', 'puwer_assessment', aid, 'hs_equipment', asset_puwer, true);
  r := array_append(r, '7. actions.source_type=puwer_assessment accepted: true');

  -- 8. Immutability + Timeline + outbox.
  r := array_append(r, format('8a. no UPDATE grant for authenticated: %s',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_name = 'puwer_assessments' AND grantee = 'authenticated' AND privilege_type = 'UPDATE')));
  r := array_append(r, format('8b. Safety Timeline entry fired: %s',
    EXISTS (SELECT 1 FROM public.hs_events WHERE entity_type = 'puwer_assessment' AND entity_id = aid AND event_type = 'assessed')));
  r := array_append(r, format('8c. Timeline summary is neutral, not "legally compliant": %s',
    (SELECT summary NOT ILIKE '%legally compliant%' FROM public.hs_events WHERE entity_type = 'puwer_assessment' AND entity_id = aid)));
  r := array_append(r, format('8d. platform_events row carries outcome: %s',
    EXISTS (SELECT 1 FROM public.platform_events WHERE entity_type = 'puwer_assessments' AND entity_id = aid AND payload->'new'->>'outcome' = 'compliant')));

  RAISE EXCEPTION 'PROBE 148 (rolled back): %', array_to_string(r, ' | ');
END $$;
