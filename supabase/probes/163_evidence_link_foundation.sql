-- Live probe for migration 163 (Core-OS 360 Phase 5, Group 8). Run
-- inside BEGIN/ROLLBACK against project sbmekaviwkiyorvmtgcu — never
-- commit this file's INSERTs. Uses two real companies already in the
-- database (Andrews Recruitment Group, Old Albanians Rugby) and one
-- real client_admin profile per company for the simulated-session
-- checks, the same technique 146/152/153's own probes established.
--
-- Result on the run this migration shipped with: all 10 checks true.

BEGIN;

CREATE TEMP TABLE probe163_results (check_name text, pass boolean);
GRANT INSERT, SELECT ON probe163_results TO authenticated;

INSERT INTO legal_requirements (id, title, category)
VALUES ('aaaaaaaa-0000-0000-0000-000000000163', 'PROBE163 legal requirement', 'general');

INSERT INTO organisation_legal_obligations (id, company_id, legal_requirement_id, applicability_status)
VALUES ('aaaaaaaa-0001-0000-0000-000000000163', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'aaaaaaaa-0000-0000-0000-000000000163', 'under_review');

INSERT INTO objectives (id, company_id, title)
VALUES
  ('aaaaaaaa-0002-0000-0000-000000000163', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE163 objective company A'),
  ('aaaaaaaa-0003-0000-0000-000000000163', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'PROBE163 objective company B');

INSERT INTO compliance_items (id, company_id, title, category, status, due_date)
VALUES
  ('aaaaaaaa-0004-0000-0000-000000000163', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'PROBE163 evidence A', 'other', 'pending', current_date + 30),
  ('aaaaaaaa-0005-0000-0000-000000000163', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'PROBE163 evidence B', 'other', 'pending', current_date + 30);

-- 1. same-org link (source=obligation in A, evidence=compliance_item in A)
INSERT INTO requirement_evidence_links (company_id, source_type, source_id, entity_type, entity_id)
VALUES ('2bcc1551-b774-4189-8c12-90ebf88c6b82', 'legal_obligation', 'aaaaaaaa-0001-0000-0000-000000000163', 'compliance_item', 'aaaaaaaa-0004-0000-0000-000000000163');
INSERT INTO probe163_results VALUES ('check1_same_org_link_ok',
  (SELECT count(*) = 1 FROM requirement_evidence_links WHERE source_id = 'aaaaaaaa-0001-0000-0000-000000000163'));

-- 2. cross-org EVIDENCE: source in A, evidence(compliance_item) in B, claimed company_id = A
DO $$
BEGIN
  BEGIN
    INSERT INTO requirement_evidence_links (company_id, source_type, source_id, entity_type, entity_id)
    VALUES ('2bcc1551-b774-4189-8c12-90ebf88c6b82', 'legal_obligation', 'aaaaaaaa-0001-0000-0000-000000000163', 'compliance_item', 'aaaaaaaa-0005-0000-0000-000000000163');
    INSERT INTO probe163_results VALUES ('check2_cross_org_evidence_refused', false);
  EXCEPTION WHEN sqlstate '23514' THEN
    INSERT INTO probe163_results VALUES ('check2_cross_org_evidence_refused', true);
  END;
END $$;

-- 3. cross-org SOURCE: source is objective in B, evidence(compliance_item) in A, claimed company_id = A
DO $$
BEGIN
  BEGIN
    INSERT INTO requirement_evidence_links (company_id, source_type, source_id, entity_type, entity_id)
    VALUES ('2bcc1551-b774-4189-8c12-90ebf88c6b82', 'objective', 'aaaaaaaa-0003-0000-0000-000000000163', 'compliance_item', 'aaaaaaaa-0004-0000-0000-000000000163');
    INSERT INTO probe163_results VALUES ('check3_cross_org_source_refused', false);
  EXCEPTION WHEN sqlstate '23514' THEN
    INSERT INTO probe163_results VALUES ('check3_cross_org_source_refused', true);
  END;
END $$;

-- 4. unknown source_type is blocked by the CHECK constraint itself
DO $$
BEGIN
  BEGIN
    INSERT INTO requirement_evidence_links (company_id, source_type, source_id, entity_type, entity_id)
    VALUES ('2bcc1551-b774-4189-8c12-90ebf88c6b82', 'not_a_real_source', 'aaaaaaaa-0001-0000-0000-000000000163', 'compliance_item', 'aaaaaaaa-0004-0000-0000-000000000163');
    INSERT INTO probe163_results VALUES ('check4_unknown_source_type_refused', false);
  EXCEPTION WHEN sqlstate '23514' THEN
    INSERT INTO probe163_results VALUES ('check4_unknown_source_type_refused', true);
  END;
END $$;

-- 5-7. simulate Andrews Recruitment Group's client_admin session; confirm
--      search_records (SECURITY INVOKER) sees company A's own objective,
--      never company B's, and never the staff-only legal_requirements
--      catalogue at all.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'e195ab67-b61a-4664-8eb2-c2ae2f8dc4ad', 'role', 'authenticated')::text, true);

INSERT INTO probe163_results VALUES ('check5_search_sees_own_objective',
  (SELECT EXISTS (SELECT 1 FROM search_records('PROBE163 objective', 20) WHERE entity_type = 'objective' AND entity_id = 'aaaaaaaa-0002-0000-0000-000000000163')));

INSERT INTO probe163_results VALUES ('check6_search_hides_other_org_objective',
  (SELECT NOT EXISTS (SELECT 1 FROM search_records('PROBE163 objective', 20) WHERE entity_type = 'objective' AND entity_id = 'aaaaaaaa-0003-0000-0000-000000000163')));

INSERT INTO probe163_results VALUES ('check7_search_hides_staff_only_legal_requirement',
  (SELECT NOT EXISTS (SELECT 1 FROM search_records('PROBE163 legal', 20) WHERE entity_type = 'legal_requirement')));

RESET ROLE;

-- 8-10. write guard, RLS, no anon execute on the DEFINER fill trigger
INSERT INTO probe163_results VALUES ('check8_write_guard_present',
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.requirement_evidence_links'::regclass AND polname LIKE 'write_guard_%') = 3);

INSERT INTO probe163_results VALUES ('check9_rls_enabled',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.requirement_evidence_links'::regclass));

INSERT INTO probe163_results VALUES ('check10_no_definer_fn_anon_exec',
  NOT has_function_privilege('anon', 'public.requirement_evidence_links_fill()', 'execute'));

SELECT * FROM probe163_results ORDER BY check_name;

ROLLBACK;
