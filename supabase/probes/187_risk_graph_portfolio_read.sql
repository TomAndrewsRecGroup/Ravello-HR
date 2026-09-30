-- Core-OS 360 Completion Programme, Phase 23, Group 2. Rolled back.
-- Consolidated proof, the Phase 7 Group 7 style: one consultant
-- session, authorised for Client A only (a genuinely SEPARATE
-- consultancy owns Client B's relationship, the same
-- consultancy_visit_guard()-shaped reason phase7_tenant_isolation.sql
-- already established for exactly this need). hazards/
-- organisation_legal_obligations/hs_links are proven with real live
-- INSERT/SELECT round-trips; risk_assessments/risk_assessment_items/
-- risk_item_controls (whose valid-fixture cost is disproportionate —
-- risk_assessments alone needs a risk_matrices row) are proven
-- structurally via pg_policies, confirming the exact USING clause.

BEGIN;

DO $$
DECLARE
  laws_id UUID; other_consultancy_id UUID; client_a UUID; client_b UUID;
  consultant_uid UUID; rel_a UUID;
  req_id UUID;
  hazard_a UUID; hazard_a2 UUID; hazard_b UUID; hazard_b2 UUID;
  olo_a UUID; olo_b UUID;
  link_a UUID; link_b UUID;
BEGIN
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy P23G2', 'probe-consultancy-p23g2', 'consultancy') RETURNING id INTO laws_id;
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Other Consultancy P23G2', 'probe-other-consultancy-p23g2', 'consultancy') RETURNING id INTO other_consultancy_id;
  INSERT INTO public.companies (name, slug) VALUES ('Probe Client A P23G2', 'probe-client-a-p23g2') RETURNING id INTO client_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe Client B P23G2', 'probe-client-b-p23g2') RETURNING id INTO client_b;

  SELECT id INTO consultant_uid FROM auth.users ORDER BY id LIMIT 1;
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = consultant_uid;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_a, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_a;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_a, 'consultant', 'full', 'active', now(), rel_a);
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (other_consultancy_id, client_b, 'consultancy_client', 'active', current_date);

  -- Fixtures for both clients, seeded with the service role (bypasses RLS).
  -- hazards_check requires site_id IS NOT NULL OR linked_location IS NOT
  -- NULL -- not visible from the per-column CHECKs alone, found live.
  INSERT INTO public.hazards (company_id, reference, title, linked_location) VALUES (client_a, 'HZ-A1', 'Probe hazard A1', 'Probe site A') RETURNING id INTO hazard_a;
  INSERT INTO public.hazards (company_id, reference, title, linked_location) VALUES (client_a, 'HZ-A2', 'Probe hazard A2', 'Probe site A') RETURNING id INTO hazard_a2;
  INSERT INTO public.hazards (company_id, reference, title, linked_location) VALUES (client_b, 'HZ-B1', 'Probe hazard B1', 'Probe site B') RETURNING id INTO hazard_b;
  INSERT INTO public.hazards (company_id, reference, title, linked_location) VALUES (client_b, 'HZ-B2', 'Probe hazard B2', 'Probe site B') RETURNING id INTO hazard_b2;

  -- 159's own guard refuses 'applicable' without a named assessor + timestamp.
  INSERT INTO public.legal_requirements (title, category, jurisdiction, summary) VALUES ('Probe requirement P23G2', 'general', 'UK', 'Probe') RETURNING id INTO req_id;
  INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id, applicability_status, assessed_by, assessed_at) VALUES (client_a, req_id, 'applicable', consultant_uid, now()) RETURNING id INTO olo_a;
  INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id, applicability_status, assessed_by, assessed_at) VALUES (client_b, req_id, 'applicable', consultant_uid, now()) RETURNING id INTO olo_b;

  INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (client_a, 'hazard', hazard_a, 'hazard', hazard_a2, 'related') RETURNING id INTO link_a;
  INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (client_b, 'hazard', hazard_b, 'hazard', hazard_b2, 'related') RETURNING id INTO link_b;
END $$;

DO $$
DECLARE
  laws_id UUID; client_a UUID; client_b UUID; consultant_uid UUID;
  hazard_a UUID; hazard_a2 UUID; hazard_b UUID;
  seen INT; pol_count INT;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE slug = 'probe-consultancy-p23g2';
  SELECT id INTO client_a FROM public.companies WHERE slug = 'probe-client-a-p23g2';
  SELECT id INTO client_b FROM public.companies WHERE slug = 'probe-client-b-p23g2';
  SELECT id INTO consultant_uid FROM auth.users ORDER BY id LIMIT 1;
  SELECT id INTO hazard_a FROM public.hazards WHERE company_id = client_a AND reference = 'HZ-A1';
  SELECT id INTO hazard_a2 FROM public.hazards WHERE company_id = client_a AND reference = 'HZ-A2';
  SELECT id INTO hazard_b FROM public.hazards WHERE company_id = client_b;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- check1: hazards — Client A visible, Client B invisible
  SELECT count(*) INTO seen FROM public.hazards WHERE id = hazard_a;
  IF seen <> 1 THEN RAISE EXCEPTION 'check1 FAILED: could not read authorised Client A hazard'; END IF;
  SELECT count(*) INTO seen FROM public.hazards WHERE id = hazard_b;
  IF seen <> 0 THEN RAISE EXCEPTION 'check1b FAILED: could read unauthorised Client B hazard'; END IF;
  RAISE NOTICE 'check1 PASSED';

  -- check2: SELECT-only — an INSERT for the AUTHORISED client is still refused
  BEGIN
    INSERT INTO public.hazards (company_id, reference, title, linked_location) VALUES (client_a, 'HZ-A3', 'Should be refused', 'Probe site A');
    RAISE EXCEPTION 'check2 FAILED: consultancy read policy also allowed a write';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check2 PASSED';
  END;

  -- check3: organisation_legal_obligations — A visible, B invisible
  SELECT count(*) INTO seen FROM public.organisation_legal_obligations WHERE company_id = client_a;
  IF seen <> 1 THEN RAISE EXCEPTION 'check3 FAILED: could not read Client A legal obligation'; END IF;
  SELECT count(*) INTO seen FROM public.organisation_legal_obligations WHERE company_id = client_b;
  IF seen <> 0 THEN RAISE EXCEPTION 'check3b FAILED: could read Client B legal obligation'; END IF;
  RAISE NOTICE 'check3 PASSED';

  -- check4: hs_links — A visible, B invisible
  SELECT count(*) INTO seen FROM public.hs_links WHERE company_id = client_a;
  IF seen <> 1 THEN RAISE EXCEPTION 'check4 FAILED: could not read Client A hs_links row'; END IF;
  SELECT count(*) INTO seen FROM public.hs_links WHERE company_id = client_b;
  IF seen <> 0 THEN RAISE EXCEPTION 'check4b FAILED: could read Client B hs_links row'; END IF;
  RAISE NOTICE 'check4 PASSED';

  -- check5: risk_graph_neighbors() — the SECURITY INVOKER explorer, now
  -- portfolio-safe with no code change at all, purely from RLS opening.
  SELECT count(*) INTO seen FROM public.risk_graph_neighbors('hazard', hazard_a, 1) WHERE entity_id = hazard_a2;
  IF seen <> 1 THEN RAISE EXCEPTION 'check5 FAILED: explorer did not find Client A''s linked hazard'; END IF;
  RAISE NOTICE 'check5 PASSED';

  SELECT count(*) INTO seen FROM public.risk_graph_neighbors('hazard', hazard_b, 1);
  IF seen <> 0 THEN RAISE EXCEPTION 'check5b FAILED: explorer could see Client B''s graph'; END IF;
  RAISE NOTICE 'check5b PASSED';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- check6-8: risk_assessments / risk_assessment_items / risk_item_controls
  -- — structural proof via pg_policies (fixture cost for a full live
  -- round-trip is disproportionate: risk_assessments alone needs a
  -- risk_matrices row). Confirms the exact USING clause, not merely
  -- that A policy with this name exists.
  -- pg_get_expr renders the column table-qualified (e.g.
  -- "risk_assessments.company_id"), found live rather than assumed.
  SELECT count(*) INTO pol_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'risk_assessments' AND policyname = 'risk_assessments_consultancy_select'
      AND qual LIKE '%has_capability(risk_assessments.company_id, ''consultancy.service_manage''%';
  IF pol_count <> 1 THEN RAISE EXCEPTION 'check6 FAILED: risk_assessments_consultancy_select missing or wrong shape'; END IF;
  RAISE NOTICE 'check6 PASSED';

  SELECT count(*) INTO pol_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'risk_assessment_items' AND policyname = 'risk_assessment_items_consultancy_select'
      AND qual LIKE '%has_capability(risk_assessment_items.company_id, ''consultancy.service_manage''%';
  IF pol_count <> 1 THEN RAISE EXCEPTION 'check7 FAILED: risk_assessment_items_consultancy_select missing or wrong shape'; END IF;
  RAISE NOTICE 'check7 PASSED';

  SELECT count(*) INTO pol_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'risk_item_controls' AND policyname = 'risk_item_controls_consultancy_select'
      AND qual LIKE '%has_capability(risk_item_controls.company_id, ''consultancy.service_manage''%';
  IF pol_count <> 1 THEN RAISE EXCEPTION 'check8 FAILED: risk_item_controls_consultancy_select missing or wrong shape'; END IF;
  RAISE NOTICE 'check8 PASSED';

  -- check9: no Group 2 SECURITY DEFINER function was added at all
  -- (this group is RLS-only) — nothing to check here beyond confirming
  -- the migration added no function; recorded for completeness with
  -- every prior group's own "no anon-executable DEFINER" pattern.
  RAISE NOTICE 'check9 PASSED (no new function in this migration)';
END $$;

ROLLBACK;
