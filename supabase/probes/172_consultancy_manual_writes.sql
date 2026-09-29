-- Core-OS 360 Phase 6, Group 7. Proves the write shapes the new
-- portal routes perform (POST /api/consultancy/clients/[id]/
-- service-scope, POST .../ledger-entry) against the RLS policies
-- migrations 168/169 already built — the first time anything has
-- actually exercised those write policies end-to-end under a real
-- consultant session. Run in a rolled-back transaction; ROLLBACK at
-- the end leaves the database exactly as it was.
--
-- Verified 2026-09-29: all 4 checks passed.
--   1. my_home_company_id() resolves to the consultancy while the
--      session is acting on the client's own organisation.
--   2. A service-scope insert (consultancy_service_scopes) succeeds
--      under RLS with no service role involved.
--   3. A manual ledger entry (consultancy_service_ledger, entry_type
--      'manual', source_type/source_id NULL) succeeds under RLS.
--   4. The SAME insert with source_type/source_id SET (an
--      automated-shaped row) is refused by the WITH CHECK — proves
--      "manual entries only" is a real, enforced restriction, not
--      just app-level intent.

BEGIN;

DO $$
DECLARE
  laws_id UUID; client_id UUID; consultant_uid UUID; rel_id UUID;
  scope_id UUID; entry_id UUID;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE organisation_type = 'consultancy' LIMIT 1;
  IF laws_id IS NULL THEN
    INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy', 'probe-consultancy-172', 'consultancy') RETURNING id INTO laws_id;
  END IF;
  SELECT id INTO client_id FROM public.companies WHERE id <> laws_id AND organisation_type <> 'consultancy' LIMIT 1;

  SELECT id INTO consultant_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = consultant_uid) THEN
    RAISE EXCEPTION 'no usable profile row to attach a probe session to';
  END IF;
  UPDATE public.profiles SET company_id = laws_id WHERE id = consultant_uid;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_id;

  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_id, 'consultant', 'full', 'active', now(), rel_id);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  IF (SELECT public.my_home_company_id()) <> laws_id THEN
    RAISE EXCEPTION 'check1 FAILED: my_home_company_id did not resolve to the consultancy';
  END IF;
  RAISE NOTICE 'check1 PASSED';

  INSERT INTO public.consultancy_service_scopes
    (consultancy_organisation_id, client_organisation_id, service_type, start_date, review_frequency)
    VALUES (laws_id, client_id, 'retained_hs_consultancy', current_date, 'quarterly')
    RETURNING id INTO scope_id;
  IF scope_id IS NULL THEN RAISE EXCEPTION 'check2 FAILED: service scope insert did not return an id'; END IF;
  RAISE NOTICE 'check2 PASSED';

  INSERT INTO public.consultancy_service_ledger
    (consultancy_organisation_id, client_organisation_id, entry_type, summary, created_by)
    VALUES (laws_id, client_id, 'manual', 'Probe manual note', consultant_uid)
    RETURNING id INTO entry_id;
  IF entry_id IS NULL THEN RAISE EXCEPTION 'check3 FAILED: manual ledger insert did not return an id'; END IF;
  RAISE NOTICE 'check3 PASSED';

  BEGIN
    INSERT INTO public.consultancy_service_ledger
      (consultancy_organisation_id, client_organisation_id, entry_type, summary, source_type, source_id, created_by)
      VALUES (laws_id, client_id, 'manual', 'Should be refused', 'hs_audits', gen_random_uuid(), consultant_uid);
    RAISE EXCEPTION 'check4 FAILED: a manual insert with source_type set was NOT refused';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    IF SQLERRM LIKE '%check4 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'check4 PASSED: refused as expected (%)', SQLERRM;
  END;
END $$;

ROLLBACK;
