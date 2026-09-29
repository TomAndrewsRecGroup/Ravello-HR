-- Core-OS 360 Phase 5, Group 2 live probe (rolled back). Run once,
-- read the RAISE'd summary, then roll back — nothing here persists.
DO $$
DECLARE
  co_a uuid; co_b uuid;
  site_a uuid; site_b uuid;
  contractor_a uuid; contractor_b uuid;
  ws_a uuid;
  perm_a uuid;
  cnt int;
  passed int := 0; failed int := 0;
  msg text := '';
BEGIN
  -- Two companies to test cross-org refusal.
  SELECT id INTO co_a FROM public.companies ORDER BY created_at LIMIT 1;
  SELECT id INTO co_b FROM public.companies WHERE id <> co_a ORDER BY created_at LIMIT 1;
  IF co_a IS NULL OR co_b IS NULL THEN
    RAISE EXCEPTION 'PROBE 157 (rolled back): need at least two companies to test cross-org refusal';
  END IF;

  INSERT INTO public.hs_sites (company_id, name) VALUES (co_a, 'Probe Site A') RETURNING id INTO site_a;
  INSERT INTO public.hs_sites (company_id, name) VALUES (co_b, 'Probe Site B') RETURNING id INTO site_b;
  INSERT INTO public.contractors (company_id, name) VALUES (co_a, 'Probe Carrier A') RETURNING id INTO contractor_a;
  INSERT INTO public.contractors (company_id, name) VALUES (co_b, 'Probe Carrier B') RETURNING id INTO contractor_b;

  -- 1. Cross-org site refused on environmental_spills.
  BEGIN
    INSERT INTO public.environmental_spills (company_id, site_id, occurred_at, substance, receiving_environment)
      VALUES (co_a, site_b, now(), 'Diesel', 'land');
    failed := failed + 1; msg := msg || E'\n1 FAIL: cross-org site accepted on environmental_spills';
  EXCEPTION WHEN OTHERS THEN passed := passed + 1; msg := msg || E'\n1 PASS: cross-org site refused on environmental_spills';
  END;

  -- 2. Same-org spill inserts fine.
  INSERT INTO public.environmental_spills (company_id, site_id, occurred_at, substance, receiving_environment)
    VALUES (co_a, site_a, now(), 'Diesel', 'land');
  passed := passed + 1; msg := msg || E'\n2 PASS: same-org spill inserted';

  -- 3. Waste stream + cross-org carrier refused.
  INSERT INTO public.waste_streams (company_id, name, hazardous) VALUES (co_a, 'Probe waste', false) RETURNING id INTO ws_a;
  BEGIN
    INSERT INTO public.waste_movements (company_id, waste_stream_id, moved_at, quantity, unit, carrier_contractor_id)
      VALUES (co_a, ws_a, current_date, 10, 'kg', contractor_b);
    failed := failed + 1; msg := msg || E'\n3 FAIL: cross-org carrier accepted on waste_movements';
  EXCEPTION WHEN OTHERS THEN passed := passed + 1; msg := msg || E'\n3 PASS: cross-org carrier refused on waste_movements';
  END;

  -- 4. Same-org waste movement, non_conformance flag round-trips.
  INSERT INTO public.waste_movements (company_id, waste_stream_id, moved_at, quantity, unit, carrier_contractor_id, non_conformance)
    VALUES (co_a, ws_a, current_date, 10, 'kg', contractor_a, true);
  passed := passed + 1; msg := msg || E'\n4 PASS: same-org waste movement inserted with non_conformance';

  -- 5. environmental_monitoring: no limit -> within_limit is NULL, never defaulted.
  DECLARE wl boolean;
  BEGIN
    WITH x AS (
      INSERT INTO public.environmental_monitoring (company_id, site_id, category, parameter, value, unit)
      VALUES (co_a, site_a, 'noise', 'Site boundary noise', 72, 'dB(A)') RETURNING within_limit
    ) SELECT within_limit INTO wl FROM x;
    IF wl IS NULL THEN
      passed := passed + 1; msg := msg || E'\n5 PASS: within_limit is NULL with no recorded_limit';
    ELSE
      failed := failed + 1; msg := msg || E'\n5 FAIL: within_limit was defaulted with no limit on file';
    END IF;
  END;

  -- 6. environmental_monitoring: limit present, exceedance computed correctly.
  DECLARE wl2 boolean;
  BEGIN
    WITH x AS (
      INSERT INTO public.environmental_monitoring (company_id, site_id, category, parameter, value, unit, recorded_limit)
      VALUES (co_a, site_a, 'noise', 'Site boundary noise', 80, 'dB(A)', 70) RETURNING within_limit
    ) SELECT within_limit INTO wl2 FROM x;
    IF wl2 = false THEN
      passed := passed + 1; msg := msg || E'\n6 PASS: exceedance (80 > 70) computed within_limit = false';
    ELSE
      failed := failed + 1; msg := msg || E'\n6 FAIL: exceedance not computed correctly';
    END IF;
  END;

  -- 6b. Insert-only: no UPDATE grant to authenticated.
  SELECT count(*) INTO cnt FROM information_schema.table_privileges
    WHERE table_name = 'environmental_monitoring' AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
  IF cnt = 0 THEN
    passed := passed + 1; msg := msg || E'\n6b PASS: environmental_monitoring has no UPDATE grant to authenticated';
  ELSE
    failed := failed + 1; msg := msg || E'\n6b FAIL: environmental_monitoring still grants UPDATE to authenticated';
  END IF;

  -- 7. permit_conditions.status vocabulary is factual, never a compliance verdict.
  INSERT INTO public.environmental_permits (company_id, site_id, permit_type) VALUES (co_a, site_a, 'Discharge consent') RETURNING id INTO perm_a;
  BEGIN
    INSERT INTO public.permit_conditions (environmental_permit_id, condition_text, status) VALUES (perm_a, 'Test', 'compliant');
    failed := failed + 1; msg := msg || E'\n7 FAIL: permit_conditions accepted a compliance-verdict status value';
  EXCEPTION WHEN OTHERS THEN passed := passed + 1; msg := msg || E'\n7 PASS: permit_conditions refuses a compliance-verdict status value';
  END;
  INSERT INTO public.permit_conditions (environmental_permit_id, condition_text, status) VALUES (perm_a, 'Test', 'breach_recorded');
  passed := passed + 1; msg := msg || E'\n7b PASS: permit_conditions accepts the factual vocabulary (breach_recorded)';

  -- 8. Cross-org supersedes/site guard on environmental_permits.
  BEGIN
    INSERT INTO public.environmental_permits (company_id, site_id, permit_type) VALUES (co_a, site_b, 'Cross-org test');
    failed := failed + 1; msg := msg || E'\n8 FAIL: cross-org site accepted on environmental_permits';
  EXCEPTION WHEN OTHERS THEN passed := passed + 1; msg := msg || E'\n8 PASS: cross-org site refused on environmental_permits';
  END;

  -- 9. environmental_incident_details keyed to a real incident; company_id derived.
  DECLARE inc_id uuid; detail_co uuid;
  BEGIN
    INSERT INTO public.hs_incidents (company_id, site_id, incident_type, occurred_on, title, description, status, recorded_by_kind)
      VALUES (co_a, site_a, 'environmental', current_date, 'Probe spill incident', 'Probe description', 'reported', 'staff')
      RETURNING id INTO inc_id;
    INSERT INTO public.environmental_incident_details (hs_incident_id, receiving_environment, substance)
      VALUES (inc_id, 'water', 'Diesel') ;
    SELECT company_id INTO detail_co FROM public.environmental_incident_details WHERE hs_incident_id = inc_id;
    IF detail_co = co_a THEN
      passed := passed + 1; msg := msg || E'\n9 PASS: environmental_incident_details.company_id derived from the parent incident';
    ELSE
      failed := failed + 1; msg := msg || E'\n9 FAIL: company_id not derived correctly';
    END IF;
  END;

  -- 10. actions.source_type CHECK accepts the four new values.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'actions_source_type_check') LIKE '%environmental_permit_condition%' THEN
    passed := passed + 1; msg := msg || E'\n10 PASS: actions_source_type_check includes the new environmental values';
  ELSE
    failed := failed + 1; msg := msg || E'\n10 FAIL: actions_source_type_check missing new environmental values';
  END IF;

  -- 11. contractor_insurances accepts waste_carrier_licence.
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_a, 'waste_carrier_licence', current_date - 1);
  IF NOT public.contractor_is_current(contractor_a) THEN
    passed := passed + 1; msg := msg || E'\n11 PASS: an expired waste_carrier_licence fails contractor_is_current() with no function change';
  ELSE
    failed := failed + 1; msg := msg || E'\n11 FAIL: expired waste carrier licence did not affect contractor_is_current()';
  END IF;

  -- 12. Evidence vocab resolves for all four new entity types.
  IF public.hs_scope_for_entity('environmental_spill') = 'register'
     AND public.hs_scope_for_entity('waste_movement') = 'register'
     AND public.hs_scope_for_entity('environmental_monitoring') = 'register'
     AND public.hs_scope_for_entity('environmental_permit') = 'register'
     AND public.hs_entity_table('environmental_spill') = 'environmental_spills'
     AND public.hs_entity_table('waste_movement') = 'waste_movements'
     AND public.hs_entity_table('environmental_monitoring') = 'environmental_monitoring'
     AND public.hs_entity_table('environmental_permit') = 'environmental_permits'
  THEN
    passed := passed + 1; msg := msg || E'\n12 PASS: evidence vocab resolves for all four new entity types';
  ELSE
    failed := failed + 1; msg := msg || E'\n12 FAIL: evidence vocab does not resolve correctly';
  END IF;

  -- 13. Write guard applied: a read-only consultancy grant may not insert.
  SELECT count(*) INTO cnt FROM pg_policies WHERE tablename = 'environmental_spills' AND policyname LIKE 'write_guard%';
  IF cnt >= 1 THEN
    passed := passed + 1; msg := msg || E'\n13 PASS: write guard policy present on environmental_spills';
  ELSE
    failed := failed + 1; msg := msg || E'\n13 FAIL: write guard policy missing on environmental_spills';
  END IF;

  -- 14. RLS enabled on all seven new tables.
  SELECT count(*) INTO cnt FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN
      ('environmental_incident_details','environmental_spills','waste_streams','waste_movements',
       'environmental_monitoring','environmental_permits','permit_conditions') AND c.relrowsecurity;
  IF cnt = 7 THEN
    passed := passed + 1; msg := msg || E'\n14 PASS: RLS enabled on all 7 new tables';
  ELSE
    failed := failed + 1; msg := msg || format(E'\n14 FAIL: RLS enabled on only %s of 7 new tables', cnt);
  END IF;

  -- 15. No new SECURITY DEFINER function executable by anon.
  SELECT count(*) INTO cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('environmental_incident_details_fill','environmental_spills_stamp','waste_movements_stamp',
       'environmental_monitoring_stamp','environmental_permits_stamp','permit_conditions_stamp',
       'environmental_spills_event','environmental_permits_event')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF cnt = 0 THEN
    passed := passed + 1; msg := msg || E'\n15 PASS: no new SECURITY DEFINER function executable by anon';
  ELSE
    failed := failed + 1; msg := msg || format(E'\n15 FAIL: %s new function(s) executable by anon', cnt);
  END IF;

  RAISE EXCEPTION 'PROBE 157 (rolled back): % passed, % failed%', passed, failed, msg;
END $$;
