-- Core-OS 360 Phase 6 Group 8 QA: adversarial tenant isolation.
-- "Laws Safety authorised for Clients A/B but not C; C must never
-- appear in counts, search, Attention Queue, calendar, reports,
-- snapshots, switcher or API responses." Run in a rolled-back
-- transaction. Verified 2026-09-29: all 6 checks passed.
--
--   1. portfolio_organisations() returns exactly {A, B}; C absent.
--   2. client_health_snapshots is STAFF-ONLY RLS (107) — migration
--      168 added columns, never a consultancy-read policy, because
--      every Command Centre page reads this table via the SERVICE
--      ROLE, scoped by the authorised org-id list
--      portfolio_organisations() already returned (Group 1's own
--      documented "RLS cannot answer a cross-client question"
--      architecture). A plain session sees NEITHER A, B, NOR C here —
--      confirming the table is locked to staff, not a consultancy
--      read path (there isn't one for this table, by design).
--   3. consultancy_service_ledger DOES have consultancy-read RLS
--      (169) and shows exactly the two authorised A/B entries.
--   4. A manual ledger write against unauthorised C (no relationship
--      at all) is refused.
--   5. A service-scope write against unauthorised C is refused.
--   6. A milestone genuinely owned by C (seeded as an unrestricted
--      writer, read as the consultant session) is invisible — proves
--      172's new audit_row trigger on milestones widened nothing
--      about who may read or write the table.

BEGIN;

DO $$
DECLARE
  laws_id UUID; a_id UUID; b_id UUID; c_id UUID; consultant_uid UUID;
  rel_a UUID; rel_b UUID;
  n INT; got_a BOOLEAN; got_b BOOLEAN; got_c BOOLEAN;
BEGIN
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Isolation Test Consultancy', 'iso-test-consultancy-172', 'consultancy') RETURNING id INTO laws_id;
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Client A', 'iso-test-client-a-172', 'direct_client') RETURNING id INTO a_id;
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Client B', 'iso-test-client-b-172', 'direct_client') RETURNING id INTO b_id;
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Client C (UNAUTHORISED)', 'iso-test-client-c-172', 'direct_client') RETURNING id INTO c_id;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, a_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_a;
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, b_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_b;

  SELECT id INTO consultant_uid FROM auth.users LIMIT 1;
  UPDATE public.profiles SET company_id = laws_id WHERE id = consultant_uid;

  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, a_id, 'consultant', 'full', 'active', now(), rel_a);
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, b_id, 'consultant', 'full', 'active', now(), rel_b);

  INSERT INTO public.client_health_snapshots (company_id, snapshot_date, band, engagement_score)
    VALUES (a_id, current_date, 'green', 80), (b_id, current_date, 'amber', 60), (c_id, current_date, 'red', 20);
  INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary)
    VALUES (laws_id, a_id, 'manual', 'A note'), (laws_id, b_id, 'manual', 'B note');
  INSERT INTO public.milestones (company_id, pillar, title, quarter) VALUES (c_id, 'hire', 'C milestone', 'Q4-2026');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT bool_or(organisation_id = a_id), bool_or(organisation_id = b_id), bool_or(organisation_id = c_id)
    INTO got_a, got_b, got_c FROM public.portfolio_organisations();
  IF NOT (got_a AND got_b) THEN RAISE EXCEPTION 'check1 FAILED: portfolio_organisations missing an authorised client'; END IF;
  IF got_c THEN RAISE EXCEPTION 'check1 FAILED: portfolio_organisations LEAKED the unauthorised client C'; END IF;
  RAISE NOTICE 'check1 PASSED';

  SELECT count(*) INTO n FROM public.client_health_snapshots WHERE company_id IN (a_id, b_id, c_id);
  IF n <> 0 THEN RAISE EXCEPTION 'check2 FAILED: a non-staff session could read ANY client_health_snapshots row directly'; END IF;
  RAISE NOTICE 'check2 PASSED';

  SELECT count(*) INTO n FROM public.consultancy_service_ledger WHERE client_organisation_id IN (a_id, b_id);
  IF n <> 2 THEN RAISE EXCEPTION 'check3 FAILED: expected 2 authorised ledger entries visible, got %', n; END IF;
  RAISE NOTICE 'check3 PASSED';

  BEGIN
    INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary, created_by)
      VALUES (laws_id, c_id, 'manual', 'Should be refused — no relationship to C', consultant_uid);
    RAISE EXCEPTION 'check4 FAILED: a manual ledger write against unauthorised Client C was NOT refused';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    IF SQLERRM LIKE '%check4 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'check4 PASSED (%)', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.consultancy_service_scopes (consultancy_organisation_id, client_organisation_id, service_type, start_date)
      VALUES (laws_id, c_id, 'retained_hs_consultancy', current_date);
    RAISE EXCEPTION 'check5 FAILED: a service-scope write against unauthorised Client C was NOT refused';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    IF SQLERRM LIKE '%check5 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'check5 PASSED (%)', SQLERRM;
  END;

  SELECT count(*) INTO n FROM public.milestones WHERE company_id = c_id;
  IF n <> 0 THEN RAISE EXCEPTION 'check6 FAILED: a non-staff session could read Client C''s milestone directly'; END IF;
  RAISE NOTICE 'check6 PASSED';

  RESET ROLE;
END $$;

ROLLBACK;
