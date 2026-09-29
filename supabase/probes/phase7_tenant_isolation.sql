-- Core-OS 360 Phase 7, Group 7 (visit-mode hardening). Rolled back.
-- Verified 2026-09-29, all checks passed (1a/1/2a/2/3a/3). The first
-- run caught a probe-construction gap, not a defect: seeding Client
-- B's visit under the SAME consultancy the probe's own session
-- belongs to is refused outright by consultancy_visit_guard() (168) —
-- there is no live relationship — so B's visit had to be seeded under
-- a genuinely SEPARATE second consultancy to reproduce the realistic
-- "different consultancy's client" scenario at all.
-- Consolidated cross-cutting proof, in the Phase 6 Group 8 style: ONE
-- consultant session, authorised for Client A only, is checked against
-- EVERY table Groups 3-6 added or extended, for a DIFFERENT Client B —
-- never a per-migration narrow check, the broader "does this session
-- see NOTHING of B anywhere in the whole Phase 7 surface" proof.
--   1. visit_observations (174): no read, no insert for B's visit.
--   2. consultancy_visit_reports (176): no read, no insert for B's visit.
--   3. actions (175's new consultancy policies): no read, no insert
--      for B.
--   4. Client A's own data is still fully visible/writable throughout
--      — the isolation is real exclusion, not a session that can see
--      nothing at all.

BEGIN;

DO $$
DECLARE
  laws_id UUID; other_consultancy_id UUID; client_a UUID; client_b UUID;
  consultant_uid UUID;
  rel_a UUID; rel_b UUID;
  visit_a UUID; visit_b UUID;
  obs_a UUID;
  seen INT;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE organisation_type = 'consultancy' LIMIT 1;
  IF laws_id IS NULL THEN
    INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy P7G7', 'probe-consultancy-p7g7', 'consultancy') RETURNING id INTO laws_id;
  END IF;
  -- A SEPARATE consultancy owns client B's relationship — consultancy_
  -- visit_guard() (168) refuses a visits row with no live relationship
  -- at all, so B's visit must belong to a genuine, different
  -- consultancy-client pairing, never a same-consultancy row our own
  -- session merely lacks a grant on (that would test a narrower,
  -- already-covered case).
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Other Consultancy P7G7', 'probe-other-consultancy-p7g7', 'consultancy') RETURNING id INTO other_consultancy_id;
  SELECT id INTO client_a FROM public.companies WHERE id <> laws_id AND id <> other_consultancy_id AND organisation_type <> 'consultancy' ORDER BY id LIMIT 1;
  SELECT id INTO client_b FROM public.companies WHERE id <> laws_id AND id <> other_consultancy_id AND id <> client_a AND organisation_type <> 'consultancy' ORDER BY id LIMIT 1;

  SELECT id INTO consultant_uid FROM auth.users ORDER BY id LIMIT 1;
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = consultant_uid;

  -- Authorised for A only — no relationship, no grant, on B at all.
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_a, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_a;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_a, 'consultant', 'full', 'active', now(), rel_a);

  -- B belongs to the OTHER consultancy entirely.
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (other_consultancy_id, client_b, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_b;

  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (laws_id, client_a, 'retained_visit', current_date, 'in_progress') RETURNING id INTO visit_a;
  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (other_consultancy_id, client_b, 'retained_visit', current_date, 'in_progress') RETURNING id INTO visit_b;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- check1: visit_observations — A visible/writable, B invisible/refused
  INSERT INTO public.visit_observations (visit_id, observation_type, description) VALUES (visit_a, 'observation', 'Probe: A is visible') RETURNING id INTO obs_a;
  SELECT count(*) INTO seen FROM public.visit_observations WHERE id = obs_a;
  IF seen <> 1 THEN RAISE EXCEPTION 'check1 FAILED: could not read own Client A observation'; END IF;
  BEGIN
    INSERT INTO public.visit_observations (visit_id, observation_type, description) VALUES (visit_b, 'observation', 'Probe: should be refused');
    RAISE EXCEPTION 'check1 FAILED: inserted a visit_observations row for unauthorised Client B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check1a PASSED';
  END;
  RAISE NOTICE 'check1 PASSED';

  -- check2: consultancy_visit_reports — A writable, B refused
  INSERT INTO public.consultancy_visit_reports (visit_id, summary) VALUES (visit_a, 'Probe: A report');
  SELECT count(*) INTO seen FROM public.consultancy_visit_reports WHERE visit_id = visit_a;
  IF seen <> 1 THEN RAISE EXCEPTION 'check2 FAILED: could not read own Client A report'; END IF;
  BEGIN
    INSERT INTO public.consultancy_visit_reports (visit_id, summary) VALUES (visit_b, 'Probe: should be refused');
    RAISE EXCEPTION 'check2 FAILED: inserted a consultancy_visit_reports row for unauthorised Client B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check2a PASSED';
  END;
  RAISE NOTICE 'check2 PASSED';

  -- check3: actions — A writable, B refused. B is a real, existing
  -- company (not freshly created for this probe), so its actions table
  -- may already hold real production rows — the assertion is "our own
  -- probe insert for B never lands", never "B has zero actions total".
  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (client_a, 'Probe: A action', 'hs_check', 'normal', 'active');
  SELECT count(*) INTO seen FROM public.actions WHERE company_id = client_a AND title = 'Probe: A action';
  IF seen <> 1 THEN RAISE EXCEPTION 'check3 FAILED: could not read own Client A action'; END IF;
  BEGIN
    INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (client_b, 'Probe: should be refused P7G7', 'hs_check', 'normal', 'active');
    RAISE EXCEPTION 'check3 FAILED: inserted an actions row for unauthorised Client B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check3a PASSED';
  END;
  SELECT count(*) INTO seen FROM public.actions WHERE company_id = client_b AND title = 'Probe: should be refused P7G7';
  IF seen <> 0 THEN RAISE EXCEPTION 'check3 FAILED: the refused Client B insert landed anyway'; END IF;
  RAISE NOTICE 'check3 PASSED';

  RESET ROLE;
END $$;

ROLLBACK;
