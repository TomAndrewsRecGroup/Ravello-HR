-- Rolled-back live probe for migration 144 (asset register).
-- Run inside a transaction that always raises at the end, so nothing here
-- is ever actually committed.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  site_a uuid; area_a uuid; area_b_site uuid; area_wrong_site uuid;
  person_a uuid;
  asset1 uuid; asset2 uuid;
  ref1 text; ref2 text;
  ok boolean;
BEGIN
  -- Fixture: two companies, a site + two operational areas (one matching,
  -- one on a different site), a person, all in company A.
  INSERT INTO public.companies (name, slug) VALUES ('Probe144 Co A', 'probe144-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe144 Co B', 'probe144-co-b') RETURNING id INTO co_b;

  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Site A1') RETURNING id INTO site_a;
  INSERT INTO public.departments (company_id, site_id, kind, name) VALUES (co_a, site_a, 'operational_area', 'Area A1') RETURNING id INTO area_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Site A2') RETURNING id INTO area_b_site;
  INSERT INTO public.departments (company_id, site_id, kind, name) VALUES (co_a, area_b_site, 'operational_area', 'Area A2 wrong site') RETURNING id INTO area_wrong_site;
  INSERT INTO public.people (company_id, full_name, worker_type) VALUES (co_a, 'Probe144 Owner', 'employee') RETURNING id INTO person_a;

  -- 1. Plain insert mints an asset_ref automatically.
  INSERT INTO public.hs_equipment (company_id, site_id, name, asset_type, operational_area_id, owner_person_id)
    VALUES (co_a, site_a, 'Probe144 Compressor', 'plant', area_a, person_a) RETURNING id, asset_ref INTO asset1, ref1;
  ok := ref1 LIKE 'AST-%';
  r := array_append(r, format('1. asset_ref minted (%s): %s', ref1, ok));

  -- 2. A second asset gets a distinct, sequential ref.
  INSERT INTO public.hs_equipment (company_id, site_id, name, asset_type)
    VALUES (co_a, site_a, 'Probe144 Forklift', 'vehicle') RETURNING id, asset_ref INTO asset2, ref2;
  r := array_append(r, format('2. distinct refs (%s != %s): %s', ref1, ref2, ref1 IS DISTINCT FROM ref2));

  -- 3. Operational area on a DIFFERENT site than the asset is refused.
  BEGIN
    INSERT INTO public.hs_equipment (company_id, site_id, name, operational_area_id)
      VALUES (co_a, site_a, 'Probe144 Bad Area', area_wrong_site);
    r := array_append(r, '3. cross-site operational area REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '3. cross-site operational area REFUSED: true');
  END;

  -- 4. Owner from another company is refused (same-org guard on owner_person_id).
  DECLARE person_b uuid;
  BEGIN
    INSERT INTO public.people (company_id, full_name, worker_type) VALUES (co_b, 'Probe144 Other Co Owner', 'employee') RETURNING id INTO person_b;
    BEGIN
      INSERT INTO public.hs_equipment (company_id, site_id, name, owner_person_id) VALUES (co_a, site_a, 'Probe144 Cross Owner', person_b);
      r := array_append(r, '4. cross-company owner REFUSED: false (no exception)');
    EXCEPTION WHEN sqlstate '23514' THEN
      r := array_append(r, '4. cross-company owner REFUSED: true');
    END;
  END;

  -- 5. A parent asset from another company is refused.
  DECLARE eq_b uuid;
  BEGIN
    INSERT INTO public.hs_equipment (company_id, name) VALUES (co_b, 'Probe144 Co B Asset') RETURNING id INTO eq_b;
    BEGIN
      INSERT INTO public.hs_equipment (company_id, site_id, name, parent_asset_id) VALUES (co_a, site_a, 'Probe144 Cross Parent', eq_b);
      r := array_append(r, '5. cross-company parent REFUSED: false (no exception)');
    EXCEPTION WHEN sqlstate '23514' THEN
      r := array_append(r, '5. cross-company parent REFUSED: true');
    END;
  END;

  -- 6. A 2-node cycle (asset1 -> asset2 -> asset1) is refused.
  UPDATE public.hs_equipment SET parent_asset_id = asset1 WHERE id = asset2;
  BEGIN
    UPDATE public.hs_equipment SET parent_asset_id = asset2 WHERE id = asset1;
    r := array_append(r, '6. 2-node cycle REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '6. 2-node cycle REFUSED: true');
  END;
  UPDATE public.hs_equipment SET parent_asset_id = NULL WHERE id = asset2;

  -- 7. Self-parent is refused by the CHECK constraint.
  BEGIN
    UPDATE public.hs_equipment SET parent_asset_id = asset1 WHERE id = asset1;
    r := array_append(r, '7. self-parent REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '7. self-parent REFUSED: true');
  END;

  -- 8. status accepts the new 'quarantined' value.
  UPDATE public.hs_equipment SET status = 'quarantined' WHERE id = asset1;
  SELECT status = 'quarantined' INTO ok FROM public.hs_equipment WHERE id = asset1;
  r := array_append(r, format('8. status quarantined accepted: %s', ok));

  -- 9. hs_files can be filed against an 'equipment' entity in the SAME
  --    company, and is refused for a different one.
  INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name)
    VALUES (co_a, 'equipment', asset1, co_a::text || '/equipment/' || asset1::text || '/probe.pdf', 'probe.pdf');
  r := array_append(r, '9a. same-company equipment evidence accepted: true');
  BEGIN
    INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name)
      VALUES (co_b, 'equipment', asset1, co_b::text || '/equipment/' || asset1::text || '/probe2.pdf', 'probe2.pdf');
    r := array_append(r, '9b. cross-company equipment evidence REFUSED: false (no exception)');
  EXCEPTION WHEN sqlstate '23514' THEN
    r := array_append(r, '9b. cross-company equipment evidence REFUSED: true');
  END;

  -- 10. hs_scope_for_entity/hs_entity_table now know 'equipment'.
  r := array_append(r, format('10a. hs_scope_for_entity(equipment) = register: %s', public.hs_scope_for_entity('equipment') = 'register'));
  r := array_append(r, format('10b. hs_entity_table(equipment) = hs_equipment: %s', public.hs_entity_table('equipment') = 'hs_equipment'));

  -- 11. hs_entity_company resolves an asset's owning company correctly.
  r := array_append(r, format('11. hs_entity_company(equipment, asset1) = co_a: %s', public.hs_entity_company('equipment', asset1) = co_a));

  -- 12. New capabilities exist and are wired into at least one role.
  r := array_append(r, format('12a. asset.read capability seeded: %s', EXISTS (SELECT 1 FROM public.access_capabilities WHERE key = 'asset.read')));
  r := array_append(r, format('12b. asset.manage capability seeded: %s', EXISTS (SELECT 1 FROM public.access_capabilities WHERE key = 'asset.manage')));
  r := array_append(r, format('12c. asset.read granted to >=1 role: %s', EXISTS (SELECT 1 FROM public.access_role_capabilities WHERE capability_key = 'asset.read')));

  -- 13. The assets view reads through to hs_equipment.
  r := array_append(r, format('13. assets view sees asset1: %s', EXISTS (SELECT 1 FROM public.assets WHERE id = asset1)));

  -- 14. Audit trail fired on insert (entity_type is the TABLE name per
  --     audit_row()'s own body; the action verb carries the 'asset' label).
  r := array_append(r, format('14. audit_events row for asset1 exists: %s',
    EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type = 'hs_equipment' AND entity_id = asset1::text AND action = 'asset.created')));

  RAISE EXCEPTION 'PROBE 144 (rolled back): %', array_to_string(r, ' | ');
END $$;
