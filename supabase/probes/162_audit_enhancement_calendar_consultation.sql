-- Live rolled-back probe for migration 162 (Core-OS 360 Phase 5,
-- Group 7). Run against project sbmekaviwkiyorvmtgcu inside a
-- BEGIN...ROLLBACK transaction. All 18 checks passed 2026-09-29.

BEGIN;

CREATE TEMP TABLE probe_results (n int, check_name text, pass boolean, detail text) ON COMMIT DROP;

DO $$
DECLARE
  co1 uuid; co2 uuid;
BEGIN
  INSERT INTO companies (id, name, slug) VALUES (gen_random_uuid(),'Probe162 Co1','probe162-co1-'||floor(random()*99999)) RETURNING id INTO co1;
  INSERT INTO companies (id, name, slug) VALUES (gen_random_uuid(),'Probe162 Co2','probe162-co2-'||floor(random()*99999)) RETURNING id INTO co2;
  PERFORM set_config('probe.co1', co1::text, true);
  PERFORM set_config('probe.co2', co2::text, true);
END $$;

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; aud uuid := gen_random_uuid();
BEGIN
  PERFORM hs_submit_audit(aud, co1, NULL, NULL, 'Probe audit', current_date, NULL, NULL,
    jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'prompt','Fire exits clear?','rating','fail','sort_order',1)));
  PERFORM set_config('probe.audit1', aud::text, true);
END $$;

INSERT INTO probe_results VALUES (1, 'audit_findings row auto-created for fail response', (SELECT count(*) FROM audit_findings WHERE audit_id = current_setting('probe.audit1')::uuid) = 1, NULL);
INSERT INTO probe_results VALUES (2, 'default severity is minor with no template item', (SELECT severity FROM audit_findings WHERE audit_id = current_setting('probe.audit1')::uuid) = 'minor', NULL);

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; tmpl uuid; item uuid; aud2 uuid := gen_random_uuid(); resp_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO hs_audit_templates (id, name) VALUES (gen_random_uuid(), 'Probe162 template') RETURNING id INTO tmpl;
  INSERT INTO hs_audit_template_items (id, template_id, prompt, default_severity, sort_order)
    VALUES (gen_random_uuid(), tmpl, 'Critical guard check', 'critical', 1) RETURNING id INTO item;
  PERFORM hs_submit_audit(aud2, co1, NULL, tmpl, 'Probe audit 2', current_date, NULL, NULL,
    jsonb_build_array(jsonb_build_object('id', resp_id, 'template_item_id', item, 'prompt','Critical guard check','rating','fail','sort_order',1)));
  PERFORM set_config('probe.resp2', resp_id::text, true);
END $$;

INSERT INTO probe_results VALUES (3, 'severity derived from template item default_severity (critical)', (SELECT severity FROM audit_findings WHERE hs_audit_response_id = current_setting('probe.resp2')::uuid) = 'critical', NULL);

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; aud uuid := current_setting('probe.audit1')::uuid;
BEGIN
  PERFORM hs_submit_audit(aud, co1, NULL, NULL, 'Probe audit', current_date, NULL, NULL,
    jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'prompt','Fire exits clear?','rating','fail','sort_order',1)));
END $$;

INSERT INTO probe_results VALUES (4, 'retried submit is idempotent (still exactly 1 finding)', (SELECT count(*) FROM audit_findings WHERE audit_id = current_setting('probe.audit1')::uuid) = 1, NULL);

DO $$
DECLARE fid uuid;
BEGIN
  SELECT id INTO fid FROM audit_findings WHERE hs_audit_response_id = current_setting('probe.resp2')::uuid;
  PERFORM set_config('probe.finding2', fid::text, true);
  BEGIN
    UPDATE audit_findings SET closed_at = now() WHERE id = fid;
    INSERT INTO probe_results VALUES (5, 'critical finding: closing with no root_cause refused', false, 'no exception raised');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (5, 'critical finding: closing with no root_cause refused', true, SQLERRM);
  END;
END $$;

UPDATE audit_findings SET root_cause = 'Guard was removed for maintenance and not replaced' WHERE id = current_setting('probe.finding2')::uuid;

DO $$
DECLARE fid uuid := current_setting('probe.finding2')::uuid;
BEGIN
  BEGIN
    UPDATE audit_findings SET closed_at = now() WHERE id = fid;
    INSERT INTO probe_results VALUES (6, 'critical finding: root_cause present but no corrective action -> refused', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (6, 'critical finding: root_cause present but no corrective action -> refused', true, SQLERRM);
  END;
END $$;

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; act uuid;
BEGIN
  INSERT INTO actions (id, company_id, action_type, title, status, priority, source_type)
    VALUES (gen_random_uuid(), co1, 'other', 'Fix guard', 'active', 'high', 'audit_finding') RETURNING id INTO act;
  PERFORM set_config('probe.action2', act::text, true);
  UPDATE audit_findings SET corrective_action_id = act WHERE id = current_setting('probe.finding2')::uuid;
  BEGIN
    UPDATE audit_findings SET closed_at = now() WHERE id = current_setting('probe.finding2')::uuid;
    INSERT INTO probe_results VALUES (7, 'critical finding: corrective action linked but not verified/effective -> refused', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (7, 'critical finding: corrective action linked but not verified/effective -> refused', true, SQLERRM);
  END;
END $$;

UPDATE actions SET status = 'complete', verified_at = now(), effectiveness_outcome = 'effective'
  WHERE id = current_setting('probe.action2')::uuid;

DO $$
BEGIN
  BEGIN
    UPDATE audit_findings SET closed_at = now() WHERE id = current_setting('probe.finding2')::uuid;
    INSERT INTO probe_results VALUES (8, 'critical finding closes once corrective action verified+effective', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (8, 'critical finding closes once corrective action verified+effective', false, SQLERRM);
  END;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE audit_findings SET closed_at = now() WHERE hs_audit_response_id =
      (SELECT hs_audit_response_id FROM audit_findings WHERE audit_id = current_setting('probe.audit1')::uuid);
    INSERT INTO probe_results VALUES (9, 'minor finding closes freely (gate is severity-scoped)', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (9, 'minor finding closes freely (gate is severity-scoped)', false, SQLERRM);
  END;
END $$;

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; co2 uuid := current_setting('probe.co2')::uuid; site2 uuid;
BEGIN
  INSERT INTO hs_sites (id, company_id, name) VALUES (gen_random_uuid(), co2, 'Co2 site') RETURNING id INTO site2;
  PERFORM set_config('probe.site2', site2::text, true);
  BEGIN
    INSERT INTO consultation_records (company_id, site_id, consultation_date, topic, method)
      VALUES (co1, site2, current_date, 'Safety committee', 'meeting');
    INSERT INTO probe_results VALUES (10, 'consultation_records refuses a cross-org site', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (10, 'consultation_records refuses a cross-org site', true, SQLERRM);
  END;
END $$;

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; site1 uuid;
BEGIN
  INSERT INTO hs_sites (id, company_id, name) VALUES (gen_random_uuid(), co1, 'Co1 site') RETURNING id INTO site1;
  PERFORM set_config('probe.site1', site1::text, true);
  INSERT INTO consultation_records (company_id, site_id, consultation_date, topic, method, participants, outcome_summary)
    VALUES (co1, site1, current_date, 'Fire evacuation review', 'committee', ARRAY['Alice','Bob'], 'Agreed to update the muster point.');
  INSERT INTO probe_results VALUES (11, 'consultation_records same-org insert succeeds', true, NULL);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO probe_results VALUES (11, 'consultation_records same-org insert succeeds', false, SQLERRM);
END $$;

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; site2 uuid := current_setting('probe.site2')::uuid;
BEGIN
  BEGIN
    INSERT INTO environmental_complaints (company_id, site_id, source, description)
      VALUES (co1, site2, 'neighbour', 'Strong smell of diesel reported by neighbouring property.');
    INSERT INTO probe_results VALUES (12, 'environmental_complaints refuses a cross-org site', false, 'no exception');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES (12, 'environmental_complaints refuses a cross-org site', true, SQLERRM);
  END;
END $$;

DO $$
DECLARE co1 uuid := current_setting('probe.co1')::uuid; site1 uuid := current_setting('probe.site1')::uuid;
BEGIN
  INSERT INTO environmental_complaints (company_id, site_id, source, description)
    VALUES (co1, site1, 'neighbour', 'Strong smell of diesel reported by neighbouring property.');
  INSERT INTO probe_results VALUES (13, 'environmental_complaints same-org insert succeeds', true, NULL);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO probe_results VALUES (13, 'environmental_complaints same-org insert succeeds', false, SQLERRM);
END $$;

INSERT INTO probe_results VALUES (14, 'evidence vocab resolves for the 3 new entity types',
  hs_scope_for_entity('audit_finding') = 'audits'
  AND hs_scope_for_entity('consultation_record') = 'register'
  AND hs_scope_for_entity('environmental_complaint') = 'register'
  AND hs_entity_table('audit_finding') = 'audit_findings'
  AND hs_entity_table('consultation_record') = 'consultation_records'
  AND hs_entity_table('environmental_complaint') = 'environmental_complaints', NULL);

INSERT INTO probe_results VALUES (15, 'write guard policies present on all 4 new tables',
  (SELECT count(DISTINCT tablename) FROM pg_policies
     WHERE tablename IN ('audit_programmes','audit_findings','consultation_records','environmental_complaints')
       AND policyname IN ('write_guard_ins','write_guard_upd','write_guard_del')) = 4, NULL);

INSERT INTO probe_results
  SELECT 16, 'RLS enabled on all 4 new tables', bool_and(relrowsecurity), NULL
  FROM pg_class WHERE relname IN ('audit_programmes','audit_findings','consultation_records','environmental_complaints');

INSERT INTO probe_results VALUES (17, 'no new function executable by anon',
  NOT (has_function_privilege('anon','audit_findings_fill()','EXECUTE')
    OR has_function_privilege('anon','audit_findings_closure_guard()','EXECUTE')
    OR has_function_privilege('anon','audit_programmes_stamp()','EXECUTE')
    OR has_function_privilege('anon','consultation_records_stamp()','EXECUTE')
    OR has_function_privilege('anon','environmental_complaints_stamp()','EXECUTE')), NULL);

INSERT INTO audit_programmes (company_id, name, frequency, next_due_date)
  VALUES (current_setting('probe.co1')::uuid, 'Quarterly fire audit', 'quarterly', current_date + 14);

INSERT INTO probe_results VALUES (18, 'calendar source data spans >= 3 Phase-5 tables',
  (SELECT count(*) FROM audit_programmes WHERE company_id = current_setting('probe.co1')::uuid AND next_due_date IS NOT NULL) >= 1
  AND to_regclass('public.objectives') IS NOT NULL
  AND to_regclass('public.management_reviews') IS NOT NULL, NULL);

SELECT * FROM probe_results ORDER BY n;

ROLLBACK;

-- Result 2026-09-29: all 18 checks passed.
