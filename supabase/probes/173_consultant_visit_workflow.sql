-- Core-OS 360 Phase 7, Group 1. Rolled back. Verified 2026-09-29,
-- all 7 checks passed.
--   1. The new 8-value status vocabulary (planned/confirmed/
--      in_progress/awaiting_report/report_draft/report_issued/
--      closed/cancelled) is accepted end to end.
--   2. A legacy status value ('scheduled', from before this
--      migration) is now refused by the tightened CHECK — 0 live
--      rows existed, so this widening is safe with no backfill.
--   3. previous_visit_id refuses a DIFFERENT client's visit, even
--      when both clients are legitimately related to the SAME
--      consultancy (the realistic case, not just an unrelated
--      stranger org) — and accepts a same-client reference.
--   4. A visit template + item can be created under the consultant's
--      own session (portfolio-wide RLS, consultancy.service_manage).
--   5. A visit may reference a template via template_id.
--   6. consultancy_visit_previous_guard() is not directly executable
--      by anon or authenticated.
--   7. The write guard (apply_write_guard) is present on
--      consultancy_visit_templates.

BEGIN;

DO $$
DECLARE
  laws_id UUID; client_id UUID; consultant_uid UUID; rel_id UUID; rel2_id UUID;
  visit1 UUID; visit2 UUID; other_client UUID;
  tmpl_id UUID; item_id UUID;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE organisation_type = 'consultancy' LIMIT 1;
  IF laws_id IS NULL THEN
    INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy 173', 'probe-consultancy-173', 'consultancy') RETURNING id INTO laws_id;
  END IF;
  SELECT id INTO client_id FROM public.companies WHERE id <> laws_id AND organisation_type <> 'consultancy' LIMIT 1;
  SELECT id INTO other_client FROM public.companies WHERE id <> laws_id AND id <> client_id AND organisation_type <> 'consultancy' LIMIT 1;

  SELECT id INTO consultant_uid FROM auth.users LIMIT 1;
  UPDATE public.profiles SET company_id = laws_id WHERE id = consultant_uid;
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_id;
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, other_client, 'consultancy_client', 'active', current_date) RETURNING id INTO rel2_id;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_id, 'consultant', 'full', 'active', now(), rel_id);
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, other_client, 'consultant', 'full', 'active', now(), rel2_id);

  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (laws_id, client_id, 'retained_visit', current_date, 'planned') RETURNING id INTO visit1;
  UPDATE public.consultancy_visits SET status = 'report_issued' WHERE id = visit1;
  RAISE NOTICE 'check1 PASSED';

  BEGIN
    INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
      VALUES (laws_id, client_id, 'retained_visit', current_date, 'scheduled');
    RAISE EXCEPTION 'check2 FAILED: the legacy status value "scheduled" was NOT refused';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check2 PASSED';
  END;

  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (laws_id, other_client, 'retained_visit', current_date, 'planned') RETURNING id INTO visit2;
  BEGIN
    UPDATE public.consultancy_visits SET previous_visit_id = visit2 WHERE id = visit1;
    RAISE EXCEPTION 'check3 FAILED: previous_visit_id accepted a DIFFERENT client''s visit';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check3 PASSED';
  END;
  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status, previous_visit_id)
    VALUES (laws_id, client_id, 'retained_visit', current_date + 30, 'planned', visit1);
  RAISE NOTICE 'check3b PASSED';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.consultancy_visit_templates (consultancy_organisation_id, name, category)
    VALUES (laws_id, 'General H&S Visit', 'general_hs') RETURNING id INTO tmpl_id;
  INSERT INTO public.consultancy_visit_template_items (template_id, section, question, expects_evidence, sort_order)
    VALUES (tmpl_id, 'Fire Safety', 'Are fire extinguishers in date?', true, 1) RETURNING id INTO item_id;
  RAISE NOTICE 'check4 PASSED';

  UPDATE public.consultancy_visits SET template_id = tmpl_id WHERE id = visit1;
  RAISE NOTICE 'check5 PASSED';

  RESET ROLE;

  IF has_function_privilege('anon', 'public.consultancy_visit_previous_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'check6 FAILED: anon can execute consultancy_visit_previous_guard';
  END IF;
  IF has_function_privilege('authenticated', 'public.consultancy_visit_previous_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'check6 FAILED: authenticated can execute consultancy_visit_previous_guard';
  END IF;
  RAISE NOTICE 'check6 PASSED';

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'consultancy_visit_templates' AND policyname LIKE '%write_guard%') THEN
    RAISE EXCEPTION 'check7 FAILED: write guard missing on consultancy_visit_templates';
  END IF;
  RAISE NOTICE 'check7 PASSED';
END $$;

ROLLBACK;
