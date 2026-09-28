-- Rolled-back live probe for migration 150 (contractors + insurance).

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  contractor_a uuid; contractor_b uuid;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe150 Co A', 'probe150-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe150 Co B', 'probe150-co-b') RETURNING id INTO co_b;

  INSERT INTO public.contractors (company_id, name) VALUES (co_a, 'Probe150 Scaffolding Ltd') RETURNING id INTO contractor_a;
  INSERT INTO public.contractors (company_id, name) VALUES (co_b, 'Probe150 Co B Ltd') RETURNING id INTO contractor_b;

  -- 1. A brand-new contractor (pending, no insurance) is NOT current.
  r := array_append(r, format('1. new pending contractor is not current: %s', public.contractor_is_current(contractor_a) = false));

  -- 2. Approving alone (no insurance yet) is still not current.
  UPDATE public.contractors SET approval_status = 'approved' WHERE id = contractor_a;
  r := array_append(r, format('2. approved but no insurance is not current: %s', public.contractor_is_current(contractor_a) = false));

  -- 3. Adding only employers_liability (missing public_liability) is still not current.
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_a, 'employers_liability', current_date + 300);
  r := array_append(r, format('3. missing public_liability is not current: %s', public.contractor_is_current(contractor_a) = false));

  -- 4. Adding public_liability too, both in date: now current.
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_a, 'public_liability', current_date + 300);
  r := array_append(r, format('4. approved + both required insurances in date: current: %s', public.contractor_is_current(contractor_a) = true));

  -- 5. Renewing the SAME insurance_type updates in place (UNIQUE constraint), not a second row.
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_a, 'employers_liability', current_date + 400)
    ON CONFLICT (contractor_id, insurance_type) DO UPDATE SET expires_on = EXCLUDED.expires_on;
  r := array_append(r, format('5. renewal updates in place, still one row per type: %s',
    (SELECT count(*) FROM public.contractor_insurances WHERE contractor_id = contractor_a AND insurance_type = 'employers_liability') = 1));

  -- 6. A THIRD, unrequired insurance type that is EXPIRED still fails currency.
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_a, 'professional_indemnity', current_date - 10);
  r := array_append(r, format('6. an expired non-required policy still fails currency: %s', public.contractor_is_current(contractor_a) = false));

  -- 7. Suspending overrides everything: not current regardless of insurance.
  DELETE FROM public.contractor_insurances WHERE contractor_id = contractor_a AND insurance_type = 'professional_indemnity';
  UPDATE public.contractors SET approval_status = 'suspended' WHERE id = contractor_a;
  r := array_append(r, format('7. suspended contractor is not current even with valid insurance: %s', public.contractor_is_current(contractor_a) = false));

  -- 8. Cross-company insurance insert (insurance for co_b's contractor
  --    filled with co_b's company_id, never trusted from caller).
  INSERT INTO public.contractor_insurances (contractor_id, insurance_type, expires_on) VALUES (contractor_b, 'public_liability', current_date + 100);
  r := array_append(r, format('8. insurance company_id filled from parent contractor: %s',
    (SELECT company_id FROM public.contractor_insurances WHERE contractor_id = contractor_b) = co_b));

  -- 9. Evidence vocab resolves.
  r := array_append(r, format('9a. hs_scope_for_entity(contractor) = register: %s', public.hs_scope_for_entity('contractor') = 'register'));
  r := array_append(r, format('9b. hs_entity_table(contractor) = contractors: %s', public.hs_entity_table('contractor') = 'contractors'));
  r := array_append(r, format('9c. hs_entity_company(contractor, contractor_a) = co_a: %s', public.hs_entity_company('contractor', contractor_a) = co_a));

  -- 10. Timeline + outbox fired on approval-status change (approved -> suspended above).
  r := array_append(r, format('10a. Timeline logs the suspension: %s',
    EXISTS (SELECT 1 FROM public.hs_events WHERE entity_type = 'contractor' AND entity_id = contractor_a AND event_type = 'status_suspended')));
  r := array_append(r, format('10b. platform_events row carries approval_status=suspended: %s',
    EXISTS (SELECT 1 FROM public.platform_events WHERE entity_type = 'contractors' AND entity_id = contractor_a AND payload->'new'->>'approval_status' = 'suspended')));

  -- 11. Generic audit trail fired.
  r := array_append(r, format('11. audit_events row for the contractor exists: %s',
    EXISTS (SELECT 1 FROM public.audit_events WHERE entity_type = 'contractors' AND entity_id = contractor_a::text AND action = 'contractor.created')));

  RAISE EXCEPTION 'PROBE 150 (rolled back): %', array_to_string(r, ' | ');
END $$;
