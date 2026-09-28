-- 123 live probe (2026-09-26): risk assessment lifecycle and attacks,
-- run as real users in ONE transaction that always rolls back (the DO
-- block ends in RAISE EXCEPTION). Nothing persists.
--
-- Users: ARG client_admin A (e195ab67…) and B (16ace9ea…) — both
-- organisation_admin, so both hold risk.create and risk.approve; OAR
-- client_admin (b88e11e9…) is the other tenant.
--
-- Recorded result:
--   hazard=HAZ-000001/closed; items=3; ctl=5; ref=RA-000001;
--   L0 rejected; L6 rejected(Likelihood must be 1–5 and severity 1–5 on this risk matrix);
--   Lnull rejected; Lneg rejected; residual>initial rejected; insert-approved rejected;
--   self-approve rejected; v1=approved by B=true; edit-approved rejected;
--   forge approved_by kept B=true; edit-item rejected; delete-approved rows=0;
--   manual-supersede rejected; second-draft rejected; v2=2/draft/items=3;
--   submit-no-review-date rejected; cr-without-comment rejected;
--   v1 after v2 approved=superseded; v1 item intact=true; stale rows=0;
--   OAR sees hazards=0; OAR sees RAs=0; OAR update rows=0; OAR new version rejected;
--   OAR clone rejected; OAR item rejected; OAR state rows=0;
--   audit=risk.created,risk.submitted,risk.approved,risk.activated,risk.created,
--         risk.submitted,risk.superseded,risk.approved; timeline=9; pevents=10
--
-- A first run failed on "You cannot approve a version you authored" when
-- A approved v2: A was still v2's ASSESSOR (copied forward from v1). The
-- gate was right; the probe now has B take over as assessor in v2's
-- draft before A approves.

DO $$
DECLARE
  arg uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82';
  a uuid := 'e195ab67-b61a-4664-8eb2-c2ae2f8dc4ad'; b uuid := '16ace9ea-9eef-4518-acde-81dfb1b5679a';
  oar uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5';
  tpl uuid; ra1 uuid; ra2 uuid; hz uuid; n int; r text := ''; st text;
BEGIN
  SELECT id INTO tpl FROM hs_templates WHERE title = 'Manual handling — lifting and carrying';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO hazards (company_id, title, linked_location, status) VALUES (arg, 'Probe hazard', 'Yard', 'closed') RETURNING id INTO hz;
  SELECT reference || '/' || status INTO st FROM hazards WHERE id = hz; r := r || 'hazard=' || st || '; ';
  ra1 := hs_instantiate_template(tpl, NULL, 'Probe RA');
  SELECT count(*) INTO n FROM risk_assessment_items WHERE risk_assessment_id = ra1; r := r || 'items=' || n || '; ';
  SELECT count(*) INTO n FROM risk_item_controls c JOIN risk_assessment_items i ON i.id=c.risk_assessment_item_id WHERE i.risk_assessment_id = ra1; r := r || 'ctl=' || n || '; ';
  SELECT reference INTO st FROM risk_assessments WHERE id = ra1; r := r || 'ref=' || st || '; ';
  BEGIN INSERT INTO risk_assessment_items (risk_assessment_id, company_id, hazard_description, likelihood_before, severity_before) VALUES (ra1, arg, 'x', 0, 3); r := r || 'L0 ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'L0 rejected; '; END;
  BEGIN INSERT INTO risk_assessment_items (risk_assessment_id, company_id, hazard_description, likelihood_before, severity_before) VALUES (ra1, arg, 'x', 6, 3); r := r || 'L6 ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'L6 rejected(' || SQLERRM || '); '; END;
  BEGIN INSERT INTO risk_assessment_items (risk_assessment_id, company_id, hazard_description, likelihood_before, severity_before) VALUES (ra1, arg, 'x', NULL, 3); r := r || 'Lnull ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'Lnull rejected; '; END;
  BEGIN INSERT INTO risk_assessment_items (risk_assessment_id, company_id, hazard_description, likelihood_before, severity_before) VALUES (ra1, arg, 'x', -1, 3); r := r || 'Lneg ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'Lneg rejected; '; END;
  BEGIN INSERT INTO risk_assessment_items (risk_assessment_id, company_id, hazard_description, likelihood_before, severity_before, likelihood_after, severity_after) VALUES (ra1, arg, 'x', 2, 2, 3, 3); r := r || 'residual>initial ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'residual>initial rejected; '; END;
  BEGIN INSERT INTO risk_assessments (company_id, title, status, approved_by, approved_at, review_date) VALUES (arg, 'x', 'approved', a, now(), current_date+30); r := r || 'insert-approved ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'insert-approved rejected; '; END;
  UPDATE risk_assessments SET status = 'pending_review' WHERE id = ra1;
  BEGIN UPDATE risk_assessments SET status = 'approved' WHERE id = ra1; r := r || 'self-approve ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'self-approve rejected; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE risk_assessments SET status = 'approved' WHERE id = ra1;
  SELECT status || ' by B=' || (approved_by = b)::text INTO st FROM risk_assessments WHERE id = ra1; r := r || 'v1=' || st || '; ';
  BEGIN UPDATE risk_assessments SET title = 'tamper' WHERE id = ra1; r := r || 'edit-approved ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'edit-approved rejected; '; END;
  BEGIN UPDATE risk_assessments SET approved_by = a WHERE id = ra1; SELECT (approved_by = b)::text INTO st FROM risk_assessments WHERE id = ra1; r := r || 'forge approved_by kept B=' || st || '; '; EXCEPTION WHEN others THEN r := r || 'forge approved_by rejected; '; END;
  BEGIN UPDATE risk_assessment_items SET likelihood_before = 1 WHERE risk_assessment_id = ra1; r := r || 'edit-item ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'edit-item rejected; '; END;
  BEGIN DELETE FROM risk_assessments WHERE id = ra1; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'delete-approved rows=' || n || '; '; EXCEPTION WHEN others THEN r := r || 'delete-approved rejected; '; END;
  BEGIN UPDATE risk_assessments SET status = 'superseded' WHERE id = ra1; r := r || 'manual-supersede ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'manual-supersede rejected; '; END;
  UPDATE risk_assessments SET status = 'active' WHERE id = ra1;
  ra2 := hs_new_version('risk_assessment', ra1);
  BEGIN PERFORM hs_new_version('risk_assessment', ra1); r := r || 'second-draft ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'second-draft rejected; '; END;
  SELECT version || '/' || status || '/items=' || (SELECT count(*) FROM risk_assessment_items WHERE risk_assessment_id = ra2) INTO st FROM risk_assessments WHERE id = ra2; r := r || 'v2=' || st || '; ';
  UPDATE risk_assessment_items SET existing_controls = 'changed in v2' WHERE risk_assessment_id = ra2 AND sort_order = 1;
  BEGIN UPDATE risk_assessments SET status = 'pending_review' WHERE id = ra2; r := r || 'submit-no-review-date ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'submit-no-review-date rejected; '; END;
  UPDATE risk_assessments SET review_date = current_date + 365, assessor_id = b WHERE id = ra2;
  UPDATE risk_assessments SET status = 'pending_review' WHERE id = ra2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE risk_assessments SET status = 'changes_requested' WHERE id = ra2; r := r || 'cr-without-comment ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'cr-without-comment rejected; '; END;
  UPDATE risk_assessments SET status = 'approved' WHERE id = ra2;
  SELECT status INTO st FROM risk_assessments WHERE id = ra1; r := r || 'v1 after v2 approved=' || st || '; ';
  SELECT existing_controls INTO st FROM risk_assessment_items WHERE risk_assessment_id = ra1 AND sort_order = 1; r := r || 'v1 item intact=' || (st <> 'changed in v2')::text || '; ';
  UPDATE risk_assessments SET title = 'stale' WHERE id = ra1 AND row_version = 1; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'stale rows=' || n || '; ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', oar, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hazards; r := r || 'OAR sees hazards=' || n || '; ';
  SELECT count(*) INTO n FROM risk_assessments; r := r || 'OAR sees RAs=' || n || '; ';
  UPDATE risk_assessments SET title = 'x' WHERE id = ra2; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'OAR update rows=' || n || '; ';
  BEGIN PERFORM hs_new_version('risk_assessment', ra2); r := r || 'OAR new version ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'OAR new version rejected; '; END;
  BEGIN PERFORM hs_clone('risk_assessment', ra2, NULL, NULL); r := r || 'OAR clone ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'OAR clone rejected; '; END;
  BEGIN INSERT INTO risk_assessment_items (risk_assessment_id, company_id, hazard_description, likelihood_before, severity_before) VALUES (ra2, arg, 'x', 1, 1); r := r || 'OAR item ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'OAR item rejected; '; END;
  SELECT count(*) INTO n FROM hs_ra_state(ra2); r := r || 'OAR state rows=' || n || '; ';
  RESET ROLE;
  SELECT string_agg(action, ',' ORDER BY id) INTO st FROM audit_events WHERE entity_id IN (ra1::text, ra2::text); r := r || 'audit=' || st || '; ';
  SELECT count(*) INTO n FROM hs_events WHERE entity_id IN (ra1, ra2, hz); r := r || 'timeline=' || n || '; ';
  SELECT count(*) INTO n FROM platform_events WHERE entity_id IN (ra1, ra2, hz); r := r || 'pevents=' || n;
  RAISE EXCEPTION 'PROBE %', r;
END $$;
