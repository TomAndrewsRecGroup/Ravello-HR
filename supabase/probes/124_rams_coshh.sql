-- 124 live probe (2026-09-26): RAMS and COSHH, run as real users in ONE
-- transaction that always rolls back. Same users as 123's probe, plus
-- staff (7434b282…) for the "not even staff" checks.
--
-- Recorded result:
--   person=true; rams=RAMS-000001 steps=5; bad-section rejected;
--   reordered=1:Disma,2:Use t,3:Inspe,4:Erect,5:Pre-s; partial-reorder rejected;
--   rams-review_due rejected; edit-step-under-review rejected;
--   substance=SUB-000001 confirmed=true; bad-pictogram rejected; coshh-no-substance rejected;
--   coshh ctl snapshot=Nitrile gloves/ppe/verification_required (a forged title/type was sent);
--   rams=approved; ack version stamped=1 (99 was sent); ack-update rejected; ack-delete rejected;
--   rams v2=2/steps=5; coshh after backfill=active; coshh after new SDS=review_due/sds_change;
--   sds kept=3; current=v0-backfill:false,v1:false,v2:true; substance sds=v2;
--   sds-update rejected; sds-delete rejected; sds-forge kept=v2; client substance-delete rows=0;
--   staff substance-delete rejected; staff sds-delete rejected;
--   OAR rams=0; OAR substances=0; OAR sds=0; OAR coshh=0; OAR sds-insert rejected; OAR ack rejected;
--   audit=rams.created,rams.submitted,substance.created,substance.updated,coshh.created,
--         coshh.submitted,rams.approved,coshh.approved,coshh.activated,substance.updated,coshh.review_due
--
-- A first run failed on "You cannot approve a version you authored or
-- submitted": A created and submitted the RAMS and then tried to approve
-- it. The gate was right; this version has B approve.

DO $$
DECLARE
  arg uuid := '2bcc1551-b774-4189-8c12-90ebf88c6b82';
  a uuid := 'e195ab67-b61a-4664-8eb2-c2ae2f8dc4ad'; b uuid := '16ace9ea-9eef-4518-acde-81dfb1b5679a';
  oar uuid := 'b88e11e9-acaa-4698-9c3f-2a20750d5ee5'; staff uuid := '7434b282-0b17-4e6f-9fe1-65fb383fb8a5';
  tr uuid; tc uuid; ms uuid; ms2 uuid; sub uuid; co uuid; sds1 uuid; sds2 uuid; sds0 uuid; ctl uuid; person uuid; ids uuid[];
  n int; r text := ''; st text;
BEGIN
  SELECT id INTO tr FROM hs_templates WHERE kind = 'method_statement' AND owner_company_id IS NULL LIMIT 1;
  SELECT id INTO tc FROM hs_templates WHERE kind = 'coshh_assessment' AND owner_company_id IS NULL LIMIT 1;
  SELECT id INTO person FROM people WHERE company_id = arg LIMIT 1;
  r := r || 'person=' || (person IS NOT NULL)::text || '; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ms := hs_instantiate_template(tr, NULL, 'Probe RAMS');
  SELECT reference || ' steps=' || (SELECT count(*) FROM method_statement_steps WHERE method_statement_id = ms) INTO st FROM method_statements WHERE id = ms; r := r || 'rams=' || st || '; ';
  BEGIN UPDATE method_statements SET sections = '{"bogus":"x"}' WHERE id = ms; r := r || 'bad-section ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'bad-section rejected; '; END;
  SELECT array_agg(id ORDER BY sequence_number DESC) INTO ids FROM method_statement_steps WHERE method_statement_id = ms;
  PERFORM hs_reorder_steps(ms, ids);
  SELECT string_agg(sequence_number::text || ':' || left(title,5), ',' ORDER BY sequence_number) INTO st FROM method_statement_steps WHERE method_statement_id = ms; r := r || 'reordered=' || st || '; ';
  BEGIN PERFORM hs_reorder_steps(ms, ids[1:2]); r := r || 'partial-reorder ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'partial-reorder rejected; '; END;
  BEGIN UPDATE method_statements SET status = 'review_due', review_reason = 'other' WHERE id = ms; r := r || 'rams-review_due ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'rams-review_due rejected; '; END;
  UPDATE method_statements SET status = 'pending_review' WHERE id = ms;
  BEGIN UPDATE method_statement_steps SET title = 'tamper' WHERE method_statement_id = ms; r := r || 'edit-step-under-review ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'edit-step-under-review rejected; '; END;
  INSERT INTO substances (company_id, product_name, pictograms, hazard_statements) VALUES (arg, 'Probe degreaser', ARRAY['GHS07'], ARRAY['H315 Causes skin irritation']) RETURNING id INTO sub;
  SELECT reference || ' confirmed=' || (pictograms_confirmed_by = a)::text INTO st FROM substances WHERE id = sub; r := r || 'substance=' || st || '; ';
  BEGIN INSERT INTO substances (company_id, product_name, pictograms) VALUES (arg, 'x', ARRAY['GHS99']); r := r || 'bad-pictogram ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'bad-pictogram rejected; '; END;
  INSERT INTO sds_versions (substance_id, company_id, version_label, issue_date) VALUES (sub, arg, 'v1', current_date - 400) RETURNING id INTO sds1;
  co := hs_instantiate_template(tc, NULL, 'Probe COSHH', sub);
  BEGIN PERFORM hs_instantiate_template(tc, NULL, 'x', NULL); r := r || 'coshh-no-substance ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'coshh-no-substance rejected; '; END;
  INSERT INTO controls (company_id, title, control_type, category) VALUES (arg, 'Nitrile gloves', 'ppe', 'ppe_rpe') RETURNING id INTO ctl;
  INSERT INTO coshh_assessment_controls (company_id, coshh_assessment_id, control_id, control_title, control_type) VALUES (arg, co, ctl, 'forged', 'elimination');
  SELECT control_title || '/' || control_type || '/' || effectiveness INTO st FROM coshh_assessment_controls WHERE coshh_assessment_id = co; r := r || 'coshh ctl snapshot=' || st || '; ';
  UPDATE coshh_assessments SET status = 'pending_review' WHERE id = co;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE method_statements SET status = 'approved' WHERE id = ms;
  UPDATE coshh_assessments SET status = 'approved' WHERE id = co;
  UPDATE coshh_assessments SET status = 'active' WHERE id = co;
  SELECT status INTO st FROM method_statements WHERE id = ms; r := r || 'rams=' || st || '; ';
  INSERT INTO rams_acknowledgements (company_id, method_statement_id, method_statement_version, person_id, confirmation) VALUES (arg, ms, 99, person, 'I have read and understood this method statement');
  SELECT method_statement_version INTO n FROM rams_acknowledgements WHERE method_statement_id = ms; r := r || 'ack version stamped=' || n || '; ';
  BEGIN UPDATE rams_acknowledgements SET confirmation = 'x' WHERE method_statement_id = ms; r := r || 'ack-update ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'ack-update rejected; '; END;
  BEGIN DELETE FROM rams_acknowledgements WHERE method_statement_id = ms; r := r || 'ack-delete ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'ack-delete rejected; '; END;
  ms2 := hs_new_version('method_statement', ms);
  SELECT version || '/steps=' || (SELECT count(*) FROM method_statement_steps WHERE method_statement_id = ms2) INTO st FROM method_statements WHERE id = ms2; r := r || 'rams v2=' || st || '; ';
  INSERT INTO sds_versions (substance_id, company_id, version_label, issue_date) VALUES (sub, arg, 'v0-backfill', current_date - 800) RETURNING id INTO sds0;
  SELECT status INTO st FROM coshh_assessments WHERE id = co; r := r || 'coshh after backfill=' || st || '; ';
  INSERT INTO sds_versions (substance_id, company_id, version_label, issue_date) VALUES (sub, arg, 'v2', current_date) RETURNING id INTO sds2;
  SELECT status || '/' || review_reason INTO st FROM coshh_assessments WHERE id = co; r := r || 'coshh after new SDS=' || st || '; ';
  SELECT count(*) INTO n FROM sds_versions WHERE substance_id = sub; r := r || 'sds kept=' || n || '; ';
  SELECT string_agg(version_label || ':' || (superseded_at IS NULL)::text, ',' ORDER BY issue_date) INTO st FROM sds_versions WHERE substance_id = sub; r := r || 'current=' || st || '; ';
  SELECT sds_version INTO st FROM substances WHERE id = sub; r := r || 'substance sds=' || st || '; ';
  BEGIN UPDATE sds_versions SET version_label = 'x' WHERE id = sds1; r := r || 'sds-update ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'sds-update rejected; '; END;
  BEGIN DELETE FROM sds_versions WHERE id = sds1; r := r || 'sds-delete ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'sds-delete rejected; '; END;
  UPDATE substances SET sds_version = 'forged' WHERE id = sub; SELECT sds_version INTO st FROM substances WHERE id = sub; r := r || 'sds-forge kept=' || st || '; ';
  DELETE FROM substances WHERE id = sub; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'client substance-delete rows=' || n || '; ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN DELETE FROM substances WHERE id = sub; r := r || 'staff substance-delete ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'staff substance-delete rejected; '; END;
  BEGIN DELETE FROM sds_versions WHERE id = sds1; r := r || 'staff sds-delete ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'staff sds-delete rejected; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', oar, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM method_statements; r := r || 'OAR rams=' || n || '; ';
  SELECT count(*) INTO n FROM substances; r := r || 'OAR substances=' || n || '; ';
  SELECT count(*) INTO n FROM sds_versions; r := r || 'OAR sds=' || n || '; ';
  SELECT count(*) INTO n FROM coshh_assessments; r := r || 'OAR coshh=' || n || '; ';
  BEGIN INSERT INTO sds_versions (substance_id, company_id, version_label, issue_date) VALUES (sub, arg, 'evil', current_date); r := r || 'OAR sds-insert ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'OAR sds-insert rejected; '; END;
  BEGIN INSERT INTO rams_acknowledgements (company_id, method_statement_id, method_statement_version, person_id, confirmation) VALUES (arg, ms, 1, person, 'x'); r := r || 'OAR ack ACCEPTED!; '; EXCEPTION WHEN others THEN r := r || 'OAR ack rejected; '; END;
  RESET ROLE;
  SELECT string_agg(action, ',' ORDER BY id) INTO st FROM audit_events WHERE entity_id IN (ms::text, co::text, sub::text); r := r || 'audit=' || st;
  RAISE EXCEPTION 'PROBE %', r;
END $$;
