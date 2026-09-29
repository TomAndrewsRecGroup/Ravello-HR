-- Core-OS 360 Phase 8, Group 1. Rolled back. Verified 2026-09-29, all
-- checks passed. Built entirely from `actions` rows (a simple table
-- already used this way by every prior probe in this codebase) chained
-- through hs_links, rather than hazards/risk_assessments — both of
-- those carry CHECK constraints (a required site_id or linked_location
-- on hazards; a NOT NULL risk_matrix_id and reference on both) that
-- have nothing to do with what this probe actually needs to prove:
-- graph traversal and RLS, not per-entity-type content rules already
-- covered by each entity's own migration.
--   1. hs_entity_table() resolves the four new branches AND leaves
--      every prior branch (spot-checked) unchanged.
--   2. risk_graph_neighbors() walks a 5-node chain (n1-n2-n3-n4-n5) in
--      BOTH directions from the MIDDLE node (n3): a depth-1 walk sees
--      only its direct neighbours (n2 incoming, n4 outgoing); a
--      depth-2 walk also reaches n1/n5. Self (hop 0) is excluded.
--   3. Depth is capped at 3 regardless of what the caller asks for —
--      walked from n1, n4 (3 hops away) is reached even with
--      p_depth=10, but n5 (4 hops away) never is.
--   4. SECURITY INVOKER means the function is bound by the CALLER's
--      own hs_links RLS: an unauthorised session (a different
--      organisation entirely, no relationship, no grant) gets ZERO
--      rows back, never an error and never someone else's graph — the
--      same "refuse silently, not loudly" shape search_records()
--      already has, proven live here for the first time on this new
--      function rather than assumed from the SECURITY INVOKER keyword
--      alone. The record's own organisation's client session sees the
--      full neighbourhood.
--   5. Cross-organisation link creation is refused by the PRE-EXISTING
--      hs_links_check() trigger (122), unaffected by this migration —
--      a regression check, not a new guard.

BEGIN;

DO $$
DECLARE
  co_a uuid; co_b uuid;
  client_uid uuid; other_client_uid uuid;
  n1 uuid; n2 uuid; n3 uuid; n4 uuid; n5 uuid; b1 uuid;
  n int;
BEGIN
  SELECT id INTO co_a FROM public.companies WHERE organisation_type <> 'consultancy' ORDER BY id LIMIT 1;
  SELECT id INTO co_b FROM public.companies WHERE organisation_type <> 'consultancy' AND id <> co_a ORDER BY id LIMIT 1;

  SELECT id INTO client_uid FROM public.profiles WHERE company_id = co_a AND role <> 'tps_admin' LIMIT 1;
  IF client_uid IS NULL THEN
    SELECT id INTO client_uid FROM auth.users ORDER BY id LIMIT 1;
    UPDATE public.profiles SET company_id = co_a, role = 'client_admin' WHERE id = client_uid;
  END IF;
  SELECT id INTO other_client_uid FROM public.profiles WHERE company_id = co_b AND role <> 'tps_admin' LIMIT 1;
  IF other_client_uid IS NULL OR other_client_uid = client_uid THEN
    SELECT id INTO other_client_uid FROM auth.users WHERE id <> client_uid ORDER BY id LIMIT 1;
    UPDATE public.profiles SET company_id = co_b, role = 'client_admin' WHERE id = other_client_uid;
  END IF;

  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (co_a, 'Probe P8G1 n1', 'hs_check', 'normal', 'active') RETURNING id INTO n1;
  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (co_a, 'Probe P8G1 n2', 'hs_check', 'normal', 'active') RETURNING id INTO n2;
  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (co_a, 'Probe P8G1 n3', 'hs_check', 'normal', 'active') RETURNING id INTO n3;
  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (co_a, 'Probe P8G1 n4', 'hs_check', 'normal', 'active') RETURNING id INTO n4;
  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (co_a, 'Probe P8G1 n5', 'hs_check', 'normal', 'active') RETURNING id INTO n5;
  INSERT INTO public.actions (company_id, title, action_type, priority, status) VALUES (co_b, 'Probe P8G1 other-org', 'hs_check', 'normal', 'active') RETURNING id INTO b1;

  INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (co_a, 'action', n1, 'action', n2, 'related');
  INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (co_a, 'action', n2, 'action', n3, 'related');
  INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (co_a, 'action', n3, 'action', n4, 'related');
  INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (co_a, 'action', n4, 'action', n5, 'related');

  -- check1: hs_entity_table() four new branches + regression spot-checks.
  IF public.hs_entity_table('permit') <> 'permits' OR public.hs_entity_table('isolation') <> 'isolations'
     OR public.hs_entity_table('emergency_plan') <> 'emergency_plans' OR public.hs_entity_table('management_review') <> 'management_reviews' THEN
    RAISE EXCEPTION 'check1 FAILED: a new branch did not resolve';
  END IF;
  IF public.hs_entity_table('hazard') <> 'hazards' OR public.hs_entity_table('risk_assessment') <> 'risk_assessments'
     OR public.hs_entity_table('action') <> 'actions' OR public.hs_entity_table('legal_obligation') <> 'organisation_legal_obligations' THEN
    RAISE EXCEPTION 'check1 FAILED: a pre-existing branch regressed';
  END IF;
  RAISE NOTICE 'check1 PASSED';

  -- check2: depth-1 from the middle node (n3) sees both direct
  -- neighbours (n2 incoming, n4 outgoing) and nothing further; self
  -- (hop 0) is excluded.
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 1) WHERE entity_id = n2 AND direction = 'incoming';
  IF n <> 1 THEN RAISE EXCEPTION 'check2 FAILED: did not see n2 as an incoming neighbour of n3'; END IF;
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 1) WHERE entity_id = n4 AND direction = 'outgoing';
  IF n <> 1 THEN RAISE EXCEPTION 'check2 FAILED: did not see n4 as an outgoing neighbour of n3'; END IF;
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 1) WHERE entity_id IN (n1, n5);
  IF n <> 0 THEN RAISE EXCEPTION 'check2 FAILED: a depth-1 walk reached a 2-hop-away node'; END IF;
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 1) WHERE hop = 0;
  IF n <> 0 THEN RAISE EXCEPTION 'check2 FAILED: self (hop 0) was not excluded'; END IF;
  RAISE NOTICE 'check2 PASSED';

  -- check2b: a depth-2 walk from n3 also reaches n1/n5.
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 2) WHERE entity_id IN (n1, n5);
  IF n <> 2 THEN RAISE EXCEPTION 'check2b FAILED: a depth-2 walk did not reach both 2-hop nodes (got %)', n; END IF;
  RAISE NOTICE 'check2b PASSED';

  -- check3: depth hard-capped at 3 regardless of the caller's request.
  -- From n1: n2 (1 hop), n3 (2), n4 (3, must be reached), n5 (4, must
  -- NEVER be reached, even at p_depth=10).
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n1, 10) WHERE entity_id = n4;
  IF n <> 1 THEN RAISE EXCEPTION 'check3 FAILED: 3-hop node (n4) not reached'; END IF;
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n1, 10) WHERE entity_id = n5;
  IF n <> 0 THEN RAISE EXCEPTION 'check3 FAILED: depth cap of 3 was not enforced — n5 (4 hops) was reached with p_depth=10'; END IF;
  RAISE NOTICE 'check3 PASSED';

  -- check4: SECURITY INVOKER — a different organisation's session sees
  -- NOTHING of company A's graph, never an error.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other_client_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 3);
  IF n <> 0 THEN RAISE EXCEPTION 'check4 FAILED: an unauthorised session (different company) saw % rows of another company''s graph', n; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'check4 PASSED';

  -- check4b: the record's OWN organisation's client session sees the
  -- full neighbourhood.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.risk_graph_neighbors('action', n3, 2) WHERE entity_id IN (n1, n2, n4, n5);
  IF n <> 4 THEN RAISE EXCEPTION 'check4b FAILED: the record''s own organisation could not see its own graph (got % of 4)', n; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'check4b PASSED';

  -- check5: cross-organisation link creation is refused by the
  -- pre-existing hs_links_check() trigger — a regression check.
  BEGIN
    INSERT INTO public.hs_links (company_id, from_type, from_id, to_type, to_id, relation) VALUES (co_a, 'action', n1, 'action', b1, 'related');
    RAISE EXCEPTION 'check5 FAILED: a cross-organisation link was created';
  EXCEPTION WHEN sqlstate '23514' THEN
    RAISE NOTICE 'check5 PASSED';
  END;

END $$;

ROLLBACK;
