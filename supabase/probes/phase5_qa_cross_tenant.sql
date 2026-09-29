-- Core-OS 360 Phase 5, Group 10 final adversarial QA: cross-tenant
-- UUID-substitution attacks and storage cross-client access. Run
-- inside BEGIN/ROLLBACK against project sbmekaviwkiyorvmtgcu — never
-- commit this file's INSERTs. Uses two real companies (Andrews
-- Recruitment Group as the attacker, Old Albanians Rugby as the
-- victim) and a real client_admin profile per company.
--
-- Result on the run this QA pass recorded: all 13 checks true (11
-- cross-tenant read/write attacks across legal/document/audit/
-- management-review/environmental-permit records, 2 storage checks).

BEGIN;

CREATE TEMP TABLE probe_results (check_name text, pass boolean, detail text);
GRANT INSERT, SELECT ON probe_results TO authenticated;

-- ── Company B (Old Albanians Rugby) fixtures — the attack target ────

INSERT INTO legal_requirements (id, title, category)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'PROBE165 legal requirement (B)', 'general');
INSERT INTO organisation_legal_obligations (id, company_id, legal_requirement_id, applicability_status)
VALUES ('cccccccc-0000-0000-0000-000000000002', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'cccccccc-0000-0000-0000-000000000001', 'under_review');

INSERT INTO hs_documents (id, company_id, title, category, status)
VALUES ('cccccccc-0000-0000-0000-000000000003', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'PROBE165 doc (B)', 'hs_fire', 'active');

INSERT INTO hs_audits (id, company_id, title, conducted_on, score)
VALUES ('cccccccc-0000-0000-0000-000000000004', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'PROBE165 audit (B)', current_date, 50);
INSERT INTO hs_audit_responses (id, audit_id, prompt, category, rating, sort_order)
VALUES ('cccccccc-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000004', 'Q1', 'hs_fire', 'fail', 1);
INSERT INTO audit_findings (id, hs_audit_response_id, audit_id, severity)
VALUES ('cccccccc-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000004', 'minor');

INSERT INTO management_reviews (id, company_id, review_date, status)
VALUES ('cccccccc-0000-0000-0000-000000000007', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', current_date, 'scheduled');

INSERT INTO environmental_permits (id, company_id, permit_type, status)
VALUES ('cccccccc-0000-0000-0000-000000000008', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'PROBE165 permit (B)', 'active');

INSERT INTO environmental_aspects (id, company_id, activity, aspect_type)
VALUES ('cccccccc-0000-0000-0000-000000000009', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'PROBE165 aspect (B)', 'noise');
INSERT INTO hs_files (id, company_id, entity_type, entity_id, storage_path, file_name, size_bytes, recorded_by, evidence_type)
VALUES ('cccccccc-0000-0000-0000-000000000010', '23526e83-afc1-4c6e-85d6-ab7d42dc0709', 'environmental_aspect', 'cccccccc-0000-0000-0000-000000000009',
  '23526e83-afc1-4c6e-85d6-ab7d42dc0709/environmental_aspect/cccccccc-0000-0000-0000-000000000009/probe.pdf', 'probe.pdf', 1000, NULL, 'document');

-- ── Simulate company A's (Andrews Recruitment Group) client_admin session ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'e195ab67-b61a-4664-8eb2-c2ae2f8dc4ad', 'role', 'authenticated')::text, true);

-- Direct-id READ attacks
INSERT INTO probe_results VALUES ('attack1_legal_obligation_read_blocked',
  NOT EXISTS (SELECT 1 FROM organisation_legal_obligations WHERE id = 'cccccccc-0000-0000-0000-000000000002'), NULL);
INSERT INTO probe_results VALUES ('attack2_document_read_blocked',
  NOT EXISTS (SELECT 1 FROM hs_documents WHERE id = 'cccccccc-0000-0000-0000-000000000003'), NULL);
INSERT INTO probe_results VALUES ('attack3_audit_finding_read_blocked',
  NOT EXISTS (SELECT 1 FROM audit_findings WHERE id = 'cccccccc-0000-0000-0000-000000000006'), NULL);
INSERT INTO probe_results VALUES ('attack3b_hs_audits_read_blocked',
  NOT EXISTS (SELECT 1 FROM hs_audits WHERE id = 'cccccccc-0000-0000-0000-000000000004'), NULL);
INSERT INTO probe_results VALUES ('attack4_management_review_read_blocked',
  NOT EXISTS (SELECT 1 FROM management_reviews WHERE id = 'cccccccc-0000-0000-0000-000000000007'), NULL);
INSERT INTO probe_results VALUES ('attack5_environmental_permit_read_blocked',
  NOT EXISTS (SELECT 1 FROM environmental_permits WHERE id = 'cccccccc-0000-0000-0000-000000000008'), NULL);

-- Direct-id WRITE attacks
DO $$
DECLARE affected int;
BEGIN
  UPDATE organisation_legal_obligations SET applicability_status = 'not_applicable' WHERE id = 'cccccccc-0000-0000-0000-000000000002';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO probe_results VALUES ('attack6_legal_obligation_write_blocked', affected = 0, affected::text);
END $$;
DO $$
DECLARE affected int;
BEGIN
  UPDATE hs_documents SET status = 'withdrawn' WHERE id = 'cccccccc-0000-0000-0000-000000000003';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO probe_results VALUES ('attack7_document_write_blocked', affected = 0, affected::text);
END $$;
DO $$
DECLARE affected int;
BEGIN
  UPDATE audit_findings SET closed_at = now() WHERE id = 'cccccccc-0000-0000-0000-000000000006';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO probe_results VALUES ('attack8_audit_finding_write_blocked', affected = 0, affected::text);
END $$;
DO $$
DECLARE affected int;
BEGIN
  UPDATE management_reviews SET status = 'cancelled' WHERE id = 'cccccccc-0000-0000-0000-000000000007';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO probe_results VALUES ('attack9_management_review_write_blocked', affected = 0, affected::text);
END $$;
DO $$
DECLARE affected int;
BEGIN
  UPDATE environmental_permits SET status = 'revoked' WHERE id = 'cccccccc-0000-0000-0000-000000000008';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO probe_results VALUES ('attack10_environmental_permit_write_blocked', affected = 0, affected::text);
END $$;

-- Storage: the exact EXISTS subquery hs_evidence_client_read's storage
-- policy runs against hs_files — proves the storage grant inherits
-- hs_files' own company-scoped RLS rather than being a second,
-- independently-checked boundary that could drift from it.
INSERT INTO probe_results VALUES ('storage_policy_subquery_correctly_blocked',
  NOT EXISTS (SELECT 1 FROM hs_files f WHERE f.storage_path = '23526e83-afc1-4c6e-85d6-ab7d42dc0709/environmental_aspect/cccccccc-0000-0000-0000-000000000009/probe.pdf'), NULL);
INSERT INTO probe_results VALUES ('hs_files_direct_read_blocked',
  NOT EXISTS (SELECT 1 FROM hs_files WHERE id = 'cccccccc-0000-0000-0000-000000000010'), NULL);

RESET ROLE;

SELECT * FROM probe_results ORDER BY check_name;

ROLLBACK;
