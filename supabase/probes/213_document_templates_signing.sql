-- Live rolled-back probe for migration 213 (document templates + e-
-- signing). Run inside BEGIN/ROLLBACK against the real project —
-- never trust the apply call's own success response.
--
-- A real defect was caught on the FIRST run of this probe, before this
-- migration shipped: document_templates_supersede_roll()'s WHERE
-- clause only matched a SIBLING sharing the same supersedes_id, never
-- the PARENT row itself (whose own supersedes_id is NULL, not
-- NEW.supersedes_id) — so a plain v1 -> v2 supersede never actually
-- superseded v1. Fixed in the migration file and re-probed (CHECK 2);
-- CHECK 2b additionally proves the sibling-race half (a v3 racing off
-- the same parent correctly supersedes v2 too), the exact Phase 5
-- Group 10 lesson this trigger was built to avoid repeating.
--
-- CHECK 1: a document_instance naming an employee in a DIFFERENT
--          organisation than its own company_id is refused (23514,
--          assert_same_org via document_instances_guard).
-- CHECK 2: template v2 (active, supersedes_id = v1.id) flips v1 to
--          'superseded'.
-- CHECK 2b: template v3 (active, supersedes_id = v1.id, simulating a
--           second editor racing off the same base) also flips v2 to
--           'superseded' — the sibling-race case.
-- CHECK 3: a plain client_admin session sees active templates
--          (document_templates_client_read).
-- CHECK 4: that same session sees its own company's document_instances
--          (document_instances_client_select).
-- CHECK 5: that same session is refused inserting a document_instance
--          naming a DIFFERENT company (RLS, document_instances_
--          client_insert — 42501).
--
-- All 6 checks passed; zero trace left live after ROLLBACK (verified
-- separately with a post-rollback count query).

BEGIN;

INSERT INTO employee_records (id, company_id, full_name, job_title, start_date, status)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'Probe Employee OA', 'Tester', '2026-01-01', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'Probe Employee ARG', 'Tester', '2026-01-01', 'active');

INSERT INTO document_templates (id, title, category, body, requires_signature, is_example, status)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'Probe Template v1', 'contract', 'Hello {{employee_name}}', true, true, 'active');

INSERT INTO document_instances (id, company_id, template_id, employee_id, category, rendered_title, rendered_body, requires_signature)
VALUES ('cccccccc-0000-0000-0000-000000000001', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'contract', 'Probe Doc', 'Hello Probe Employee OA', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO document_instances (id, company_id, template_id, employee_id, category, rendered_title, rendered_body)
    VALUES ('cccccccc-0000-0000-0000-000000000099', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'contract', 'X', 'Y');
    RAISE EXCEPTION 'CHECK 1 FAILED: cross-org employee reference was NOT refused';
  EXCEPTION WHEN sqlstate '23514' THEN
    RAISE NOTICE 'CHECK 1 PASSED: cross-org employee reference refused (23514)';
  END;
END $$;

INSERT INTO document_templates (id, title, category, body, status, supersedes_id)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'Probe Template v2', 'contract', 'Hello {{employee_name}} v2', 'active', 'bbbbbbbb-0000-0000-0000-000000000001');
DO $$
DECLARE v1_status text;
BEGIN
  SELECT status INTO v1_status FROM document_templates WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
  IF v1_status = 'superseded' THEN
    RAISE NOTICE 'CHECK 2 PASSED: v1 superseded by v2';
  ELSE
    RAISE EXCEPTION 'CHECK 2 FAILED: v1 status is %, expected superseded', v1_status;
  END IF;
END $$;

INSERT INTO document_templates (id, title, category, body, status, supersedes_id)
VALUES ('bbbbbbbb-0000-0000-0000-000000000003', 'Probe Template v3 (race)', 'contract', 'Race', 'active', 'bbbbbbbb-0000-0000-0000-000000000001');
DO $$
DECLARE v2_status text;
BEGIN
  SELECT status INTO v2_status FROM document_templates WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  IF v2_status = 'superseded' THEN
    RAISE NOTICE 'CHECK 2b PASSED: sibling race — v2 superseded by v3 sharing the same parent';
  ELSE
    RAISE EXCEPTION 'CHECK 2b FAILED: v2 status is %, expected superseded', v2_status;
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','b88e11e9-acaa-4698-9c3f-2a20750d5ee5','role','authenticated')::text, true);

DO $$
DECLARE n_active int;
BEGIN
  SELECT count(*) INTO n_active FROM document_templates WHERE status = 'active';
  IF n_active >= 1 THEN
    RAISE NOTICE 'CHECK 3 PASSED: client session sees % active template(s)', n_active;
  ELSE
    RAISE EXCEPTION 'CHECK 3 FAILED: client session saw no active templates';
  END IF;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM document_instances WHERE id = 'cccccccc-0000-0000-0000-000000000001';
  IF n = 1 THEN RAISE NOTICE 'CHECK 4 PASSED: client session sees own-company instance';
  ELSE RAISE EXCEPTION 'CHECK 4 FAILED: client session could not see own-company instance (got %)', n; END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO document_instances (id, company_id, template_id, employee_id, category, rendered_title, rendered_body)
    VALUES ('cccccccc-0000-0000-0000-000000000098', '2bcc1551-b774-4189-8c12-90ebf88c6b82', 'bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'contract', 'X', 'Y');
    RAISE EXCEPTION 'CHECK 5 FAILED: cross-org insert was NOT refused';
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN
    RAISE NOTICE 'CHECK 5 PASSED: cross-org insert refused by RLS';
  END;
END $$;

RESET ROLE;
ROLLBACK;
