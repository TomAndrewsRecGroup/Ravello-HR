-- Core-OS 360 Phase 7, Group 5. Rolled back. Verified 2026-09-29, all 8
-- checks passed. The first run caught a real gap while WRITING this
-- probe (before running it): consultancy_visit_report_fill()'s
-- same-visit check for supersedes_id only ran at INSERT time — a bare
-- UPDATE could set supersedes_id with no check at all. Fixed by making
-- supersedes_id immutable after creation in consultancy_visit_report_
-- touch() (the same trigger that already refuses visit_id/organisation
-- changes), re-applied live and re-proved (check2b) before trusting it.
--   1. consultancy_organisation_id/client_organisation_id derived from
--      the visit, never trusted from the caller.
--   2. A revision naming a report for a DIFFERENT visit is refused.
--   3. First issue (no supersedes_id) does not touch any other row.
--   4. A revision reaching 'issued' supersedes BOTH the row it names
--      AND any sibling sharing the same supersedes_id (the migration
--      164/165/166 sibling-race lesson, built in from day one here).
--   5. visit_id/organisation columns cannot be changed after creation.
--   6. Client read shows issued/superseded, never draft.
--   7. Portfolio-wide RLS: authorised consultant may write; an
--      unauthorised one is refused.
--   8. Write guard present; neither trigger function directly
--      executable by anon/authenticated.

BEGIN;

DO $$
DECLARE
  laws_id UUID; client_id UUID; other_client UUID;
  consultant_uid UUID; unauth_consultant_uid UUID;
  rel_id UUID; rel2_id UUID;
  visit1 UUID; visit2 UUID;
  report1 UUID; report1b UUID; report2 UUID; sibling UUID;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE organisation_type = 'consultancy' LIMIT 1;
  IF laws_id IS NULL THEN
    INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy 176', 'probe-consultancy-176', 'consultancy') RETURNING id INTO laws_id;
  END IF;
  SELECT id INTO client_id FROM public.companies WHERE id <> laws_id AND organisation_type <> 'consultancy' LIMIT 1;
  SELECT id INTO other_client FROM public.companies WHERE id <> laws_id AND id <> client_id AND organisation_type <> 'consultancy' LIMIT 1;

  SELECT id INTO consultant_uid FROM auth.users ORDER BY id LIMIT 1;
  SELECT id INTO unauth_consultant_uid FROM auth.users WHERE id <> consultant_uid ORDER BY id LIMIT 1;
  IF unauth_consultant_uid IS NULL THEN unauth_consultant_uid := consultant_uid; END IF;
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = consultant_uid;
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = unauth_consultant_uid;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_id;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_id, 'consultant', 'full', 'active', now(), rel_id);

  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (laws_id, client_id, 'retained_visit', current_date, 'awaiting_report') RETURNING id INTO visit1;
  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (laws_id, client_id, 'retained_visit', current_date, 'awaiting_report') RETURNING id INTO visit2;

  -- check7a + check1: authorised consultant may INSERT, company_id derived
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.consultancy_visit_reports (visit_id, summary) VALUES (visit1, 'Probe draft summary') RETURNING id INTO report1;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = report1 AND client_organisation_id = client_id AND consultancy_organisation_id = laws_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'check1 FAILED: organisation columns not derived from the visit'; END IF;
  RAISE NOTICE 'check1 PASSED';
  RAISE NOTICE 'check7a PASSED';

  -- check2: a revision naming a report for a DIFFERENT visit is refused
  -- at INSERT time (consultancy_visit_report_fill's own same-visit
  -- check) — and supersedes_id is separately immutable after creation
  -- (consultancy_visit_report_touch), so a bare UPDATE can never be
  -- used to route around the INSERT-time check either.
  INSERT INTO public.consultancy_visit_reports (visit_id, summary) VALUES (visit2, 'Probe: other visit''s draft') RETURNING id INTO report2;
  BEGIN
    INSERT INTO public.consultancy_visit_reports (visit_id, supersedes_id, summary) VALUES (visit2, report1, 'Probe: cross-visit revision');
    RAISE EXCEPTION 'check2 FAILED: a revision naming a DIFFERENT visit''s report was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check2a PASSED';
  END;
  BEGIN
    UPDATE public.consultancy_visit_reports SET supersedes_id = report1 WHERE id = report2;
    RAISE EXCEPTION 'check2 FAILED: supersedes_id was changed via a bare UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check2b PASSED';
  END;

  -- check3: first issue (no supersedes_id) touches nothing else
  UPDATE public.consultancy_visit_reports SET status = 'issued', issued_at = now(), issued_by = consultant_uid WHERE id = report1;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = report2 AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'check3 FAILED: first issue touched an unrelated report'; END IF;
  RAISE NOTICE 'check3 PASSED';

  -- check4: a revision reaching 'issued' supersedes the named row AND a sibling
  INSERT INTO public.consultancy_visit_reports (visit_id, supersedes_id, version, summary) VALUES (visit1, report1, 2, 'Probe: revision A') RETURNING id INTO report1b;
  INSERT INTO public.consultancy_visit_reports (visit_id, supersedes_id, version, summary) VALUES (visit1, report1, 2, 'Probe: sibling revision (lost the race)') RETURNING id INTO sibling;
  UPDATE public.consultancy_visit_reports SET status = 'issued', issued_at = now(), issued_by = consultant_uid WHERE id = sibling;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = report1 AND status = 'superseded';
  IF NOT FOUND THEN RAISE EXCEPTION 'check4 FAILED: the named row was not superseded'; END IF;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = report1b AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'check4 FAILED: the sibling that lost the race was not left alone (should still be draft)';
  END IF;
  -- now flip the OTHER sibling too and prove the roll catches it as well
  UPDATE public.consultancy_visit_reports SET status = 'issued', issued_at = now(), issued_by = consultant_uid WHERE id = report1b;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = sibling AND status = 'superseded';
  IF NOT FOUND THEN RAISE EXCEPTION 'check4 FAILED: a sibling sharing the same supersedes_id was not superseded when its twin published';
  END IF;
  RAISE NOTICE 'check4 PASSED';

  -- check5: visit_id/organisation columns immutable after creation
  -- (report2 belongs to visit2 — move it to visit1, a genuine change)
  BEGIN
    UPDATE public.consultancy_visit_reports SET visit_id = visit1 WHERE id = report2;
    RAISE EXCEPTION 'check5 FAILED: visit_id was changed after creation';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check5 PASSED';
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- check6: client read — issued/superseded visible, draft never
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  UPDATE public.profiles SET company_id = client_id, role = 'client_admin' WHERE id = unauth_consultant_uid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', unauth_consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = report1b AND status = 'issued';
  IF NOT FOUND THEN RAISE EXCEPTION 'check6 FAILED: the client cannot see the current issued report'; END IF;
  PERFORM 1 FROM public.consultancy_visit_reports WHERE id = report2 AND status = 'draft';
  IF FOUND THEN RAISE EXCEPTION 'check6 FAILED: the client could see a draft'; END IF;
  RAISE NOTICE 'check6 PASSED';
  RESET ROLE;

  -- check7b: an unauthorised consultant (no grant, no client role) is refused
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = unauth_consultant_uid;
  DELETE FROM public.user_organisation_access WHERE user_id = unauth_consultant_uid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', unauth_consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.consultancy_visit_reports (visit_id, summary) VALUES (visit2, 'Probe: should be refused');
    RAISE EXCEPTION 'check7b FAILED: an unauthorised consultant could insert a report';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check7b PASSED';
  END;
  RESET ROLE;

  -- check8: write guard + functions not directly executable
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consultancy_visit_reports' AND policyname LIKE '%write_guard%') THEN
    RAISE EXCEPTION 'check8 FAILED: write guard missing';
  END IF;
  IF has_function_privilege('anon', 'public.consultancy_visit_report_fill()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consultancy_visit_report_fill()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.consultancy_visit_report_supersede_roll()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consultancy_visit_report_supersede_roll()', 'EXECUTE') THEN
    RAISE EXCEPTION 'check8 FAILED: a trigger function is directly executable';
  END IF;
  RAISE NOTICE 'check8 PASSED';
END $$;

ROLLBACK;
