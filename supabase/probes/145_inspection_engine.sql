-- Rolled-back live probe for migration 145 (inspection engine).

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  site_a uuid; site_b uuid;
  asset_a uuid; asset_b uuid;
  tmpl_id uuid;
  insp1 uuid; insp2 uuid; retried uuid;
  responses jsonb;
  rec record;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe145 Co A', 'probe145-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe145 Co B', 'probe145-co-b') RETURNING id INTO co_b;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Site A1') RETURNING id INTO site_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_b, 'Site B1') RETURNING id INTO site_b;
  INSERT INTO public.hs_equipment (company_id, site_id, name, asset_type) VALUES (co_a, site_a, 'Probe145 Forklift', 'vehicle') RETURNING id INTO asset_a;
  INSERT INTO public.hs_equipment (company_id, site_id, name, asset_type) VALUES (co_b, site_b, 'Probe145 Co B Forklift', 'vehicle') RETURNING id INTO asset_b;

  tmpl_id := '00000000-0000-4000-8001-000000000001';
  r := array_append(r, format('0. starter template seeded with items: %s',
    (SELECT count(*) FROM public.inspection_template_items WHERE template_id = '00000000-0000-4000-8001-000000000001') = 8));

  -- 1. Submit an inspection with one critical FAIL and one pass -> overall fail, has_critical_failure true.
  insp1 := gen_random_uuid();
  responses := jsonb_build_array(
    jsonb_build_object('prompt', 'Tyres OK?', 'critical', false, 'rating', 'pass', 'sort_order', 1),
    jsonb_build_object('prompt', 'Forks free of cracks?', 'critical', true, 'rating', 'fail', 'comment', 'Visible crack', 'sort_order', 2)
  );
  PERFORM public.hs_submit_inspection(insp1, co_a, site_a, asset_a, tmpl_id, 'Probe145 daily check', current_date, NULL, responses);
  SELECT overall_outcome, has_critical_failure INTO STRICT rec FROM public.inspections WHERE id = insp1;
  r := array_append(r, format('1. overall_outcome=fail: %s, has_critical_failure: %s', rec.overall_outcome = 'fail', rec.has_critical_failure));
  r := array_append(r, format('1b. two responses recorded: %s', (SELECT count(*) FROM public.inspection_responses WHERE inspection_id = insp1) = 2));

  -- 2. Re-submitting the SAME id is idempotent: no second inspection, no second responses.
  retried := public.hs_submit_inspection(insp1, co_a, site_a, asset_a, tmpl_id, 'Probe145 daily check (retry)', current_date, 'different notes', responses);
  r := array_append(r, format('2a. retry returns same id: %s', retried = insp1));
  r := array_append(r, format('2b. still exactly one inspection row: %s', (SELECT count(*) FROM public.inspections WHERE id = insp1) = 1));
  r := array_append(r, format('2c. still exactly two responses: %s', (SELECT count(*) FROM public.inspection_responses WHERE inspection_id = insp1) = 2));
  r := array_append(r, format('2d. title NOT overwritten by retry: %s', (SELECT title FROM public.inspections WHERE id = insp1) = 'Probe145 daily check'));

  -- 3. An all-pass submission is overall pass, no critical failure.
  insp2 := gen_random_uuid();
  PERFORM public.hs_submit_inspection(insp2, co_a, site_a, asset_a, tmpl_id, 'Probe145 all clear', current_date, NULL,
    jsonb_build_array(jsonb_build_object('prompt', 'Tyres OK?', 'critical', false, 'rating', 'pass', 'sort_order', 1)));
  SELECT overall_outcome, has_critical_failure INTO STRICT rec FROM public.inspections WHERE id = insp2;
  r := array_append(r, format('3. all-pass -> outcome pass, no critical failure: %s', rec.overall_outcome = 'pass' AND rec.has_critical_failure = false));

  -- 4. An asset from a DIFFERENT company is refused.
  BEGIN
    PERFORM public.hs_submit_inspection(gen_random_uuid(), co_a, site_a, asset_b, NULL, 'Probe145 cross-company', current_date, NULL, '[]'::jsonb);
    r := array_append(r, '4. cross-company asset REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '4. cross-company asset REFUSED: true');
  END;

  -- 5. A site that does not match the asset's own site is refused.
  BEGIN
    PERFORM public.hs_submit_inspection(gen_random_uuid(), co_a, site_b, asset_a, NULL, 'Probe145 wrong site', current_date, NULL, '[]'::jsonb);
    r := array_append(r, '5. mismatched site REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '5. mismatched site REFUSED: true');
  END;

  -- 6. Evidence: hs_scope_for_entity/hs_entity_table know 'inspection'.
  r := array_append(r, format('6a. hs_scope_for_entity(inspection) = register: %s', public.hs_scope_for_entity('inspection') = 'register'));
  r := array_append(r, format('6b. hs_entity_table(inspection) = inspections: %s', public.hs_entity_table('inspection') = 'inspections'));
  r := array_append(r, format('6c. hs_entity_company(inspection, insp1) = co_a: %s', public.hs_entity_company('inspection', insp1) = co_a));

  -- 7. Evidence accepted same-company, refused cross-company.
  INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name)
    VALUES (co_a, 'inspection', insp1, co_a::text || '/inspection/' || insp1::text || '/probe.jpg', 'probe.jpg');
  r := array_append(r, '7a. same-company inspection evidence accepted: true');
  BEGIN
    INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name)
      VALUES (co_b, 'inspection', insp1, co_b::text || '/inspection/' || insp1::text || '/probe2.jpg', 'probe2.jpg');
    r := array_append(r, '7b. cross-company inspection evidence REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '7b. cross-company inspection evidence REFUSED: true');
  END;

  -- 8. Immutability: no session can UPDATE or DELETE an inspection/response.
  r := array_append(r, format('8a. inspections has no UPDATE for authenticated: %s',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_name = 'inspections' AND grantee = 'authenticated' AND privilege_type = 'UPDATE')));
  r := array_append(r, format('8b. inspection_responses has no DELETE for authenticated: %s',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_name = 'inspection_responses' AND grantee = 'authenticated' AND privilege_type = 'DELETE')));

  -- 9. Timeline entry fired, with the FAIL/PASS verb distinguished.
  r := array_append(r, format('9a. hs_events row for the failed inspection reads "failed": %s',
    EXISTS (SELECT 1 FROM public.hs_events WHERE entity_type = 'inspection' AND entity_id = insp1 AND event_type = 'failed')));
  r := array_append(r, format('9b. hs_events row for the passed inspection reads "completed": %s',
    EXISTS (SELECT 1 FROM public.hs_events WHERE entity_type = 'inspection' AND entity_id = insp2 AND event_type = 'completed')));

  -- 10. Outbox: one platform_event per inspection, carrying overall_outcome.
  r := array_append(r, format('10. platform_events row for insp1 carries overall_outcome=fail: %s',
    EXISTS (SELECT 1 FROM public.platform_events WHERE entity_type = 'inspections' AND entity_id = insp1 AND payload->'new'->>'overall_outcome' = 'fail')));

  RAISE EXCEPTION 'PROBE 145 (rolled back): %', array_to_string(r, ' | ');
END $$;
